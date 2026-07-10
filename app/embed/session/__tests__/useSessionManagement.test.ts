import { renderHook, act } from '@testing-library/react';
import { useSessionManagement } from '../hooks/useSessionManagement';

// Keep the real WidgetError/codes but drop the backoff delays so createSession's
// retryWithBackoff runs its callback exactly once (no real timers involved).
jest.mock('../../../../lib/errorHandling', () => {
  const actual = jest.requireActual('../../../../lib/errorHandling');
  return { ...actual, retryWithBackoff: (fn: () => unknown) => fn() };
});

jest.mock('../../../../lib/i18n', () => ({
  t: (locale: string, key: string, options?: { count?: number }) =>
    `${key}:${options?.count ?? ''}`,
}));

jest.mock('../helpers', () => ({
  getVisitorId: jest.fn(() => 'visitor-1'),
  storeSession: jest.fn(),
  clearStoredSession: jest.fn(),
  localMessagesStorageKey: (sessionId: string) => `local-msgs-${sessionId}`,
}));

import * as helpers from '../helpers';

const RATE_LIMIT_PREFIX = 'companin-rate-limit-until';

function res({ ok = true, status = 200, json = {}, headers = {} }: {
  ok?: boolean; status?: number; json?: unknown; headers?: Record<string, string>;
}) {
  return {
    ok,
    status,
    headers: { get: (name: string) => headers[name] ?? null },
    json: jest.fn().mockResolvedValue(json),
  } as unknown as Response;
}

function makeFetchMock(handlers: Array<{
  test: (url: string, init: Record<string, unknown>) => boolean;
  handler: (url: string, init: Record<string, unknown>, callIndex: number) => Response | Promise<Response>;
}>) {
  let n = 0;
  return jest.fn(async (url: unknown, init?: Record<string, unknown>) => {
    n++;
    const u = String(url);
    for (const h of handlers) {
      if (h.test(u, init || {})) {
        return h.handler(u, init || {}, n);
      }
    }
    throw new Error(`Unhandled fetch: ${u} (${init?.method || 'GET'})`);
  });
}

const validConfig = {
  id: 'config-1',
  primary_color: '#000',
  background_color: '#fff',
  text_color: '#111',
  widget_type: 'chat' as const,
};

function makeParams(overrides: Record<string, unknown> = {}) {
  let messages: unknown[] = [];
  let widgetConfigState: unknown = overrides.widgetConfig ?? null;
  let sessionId: string | null = null;
  let feedbackSubmittedState = false;
  let agentName = '';
  let errorState: string | null = null;

  const setMessages = jest.fn((u: unknown) => {
    messages = typeof u === 'function' ? (u as (p: unknown[]) => unknown[])(messages) : (u as unknown[]);
  });
  const setWidgetConfig = jest.fn((u: unknown) => {
    widgetConfigState = typeof u === 'function' ? (u as (p: unknown) => unknown)(widgetConfigState) : u;
  });
  const setSessionId = jest.fn((v: string | null) => { sessionId = v; });
  const setFeedbackSubmitted = jest.fn((v: boolean) => { feedbackSubmittedState = v; });
  const setAgentName = jest.fn((v: string) => { agentName = v; });
  const setError = jest.fn((v: string | null) => { errorState = v; });

  const authTokenRef = { current: (overrides.authTokenRefValue as string | null) ?? null };
  const hasLoadedMessagesRef = { current: false };
  const sessionRefreshInFlightRef = { current: false };
  const postedShowUnreadBadge = { current: undefined as boolean | undefined };
  const postedEdgeOffset = { current: undefined as number | undefined };

  const t = {
    rateLimitGeneric: 'rateLimitGeneric',
    sessionRateLimitGeneric: 'sessionRateLimitGeneric',
    loadHistoryError: 'loadHistoryError',
    failedToCreateSession: 'failedToCreateSession',
    configUnavailable: 'configUnavailable',
    agentUnavailable: 'agentUnavailable',
  };

  const params = {
    initialAgentId: 'agent-1',
    initialClientId: 'client-1',
    initialConfigId: 'config-1',
    initialParentOrigin: 'https://host.example',
    initialForceVariantId: undefined,
    initialLocale: 'en',
    activeLocale: 'en',
    sessionStorageKey: 'sess-key',
    baseSessionKey: 'base-sess-key',
    embedHeaders: { 'X-Embed-Origin': 'https://host.example' },
    parentSensitiveOrigin: 'https://host.example',
    authToken: null,
    authTokenRef,
    getAuthToken: jest.fn().mockResolvedValue(null),
    widgetConfig: widgetConfigState,
    setWidgetConfig,
    setAgentName,
    setError,
    setMessages,
    setSessionId,
    setFeedbackSubmitted,
    feedbackSubmitted: feedbackSubmittedState,
    hasLoadedMessagesRef,
    sessionRefreshInFlightRef,
    t,
    checkFeedbackStatus: jest.fn().mockResolvedValue(undefined),
    flushQueuedMessages: jest.fn().mockResolvedValue(undefined),
    injectCustomAssetsFromConfig: jest.fn(),
    postedShowUnreadBadge,
    postedEdgeOffset,
    ...overrides,
  };

  return {
    params: params as unknown as Parameters<typeof useSessionManagement>[0],
    getMessages: () => messages,
    getError: () => errorState,
    getSessionId: () => sessionId,
    getAgentName: () => agentName,
    authTokenRef,
    hasLoadedMessagesRef,
    postedShowUnreadBadge,
    postedEdgeOffset,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
});

function setActiveCooldown(scope: string, msFromNow = 60_000) {
  const key = `${RATE_LIMIT_PREFIX}:${scope}:client-1:agent-1`;
  const until = Date.now() + msFromNow;
  sessionStorage.setItem(key, String(until));
  localStorage.setItem(key, String(until));
}

// ---------------------------------------------------------------------------
describe('useSessionManagement — loadSessionMessages', () => {
  it('surfaces a friendly error when already cooling down and isInitial', async () => {
    setActiveCooldown('session-read');
    const { params, getError } = makeParams();
    const { result } = renderHook(() => useSessionManagement(params));
    await act(async () => { await result.current.loadSessionMessages('sess-1', 'tok', true); });
    expect(getError()).toBe('loadHistoryError');
  });

  it('rethrows the cooldown error when not initial', async () => {
    setActiveCooldown('session-read');
    const { params } = makeParams();
    const { result } = renderHook(() => useSessionManagement(params));
    await expect(result.current.loadSessionMessages('sess-1', 'tok', false)).rejects.toBeTruthy();
  });

  it('retries once through fetchWithAuthRetry on a 401 and succeeds', async () => {
    const messagesPayload = {
      status: 'success',
      data: {
        messages: [
          { id: 'greeting-1', content: 'hi', sender: 'assistant', created_at: '2024-01-01T00:00:00Z' },
          { id: 'u1', content: 'hello', sender: 'user', created_at: '2024-01-01T00:00:01Z' },
          { id: 'a1', content: 'reply', sender: 'assistant', created_at: '2024-01-01T00:00:02Z' },
        ],
      },
    };
    global.fetch = makeFetchMock([
      { test: (u) => u.includes('/messages'), handler: (_u, _i, n) => n === 1 ? res({ ok: false, status: 401 }) : res({ ok: true, json: messagesPayload }) },
    ]) as unknown as typeof fetch;
    const { params, getAuthToken } = { ...makeParams(), getAuthToken: undefined } as ReturnType<typeof makeParams> & { getAuthToken?: unknown };
    (params as any).getAuthToken = jest.fn().mockResolvedValue('fresh-token');
    const { result } = renderHook(() => useSessionManagement(params));
    await act(async () => { await result.current.loadSessionMessages('sess-1', 'stale-token', true); });
    expect((global.fetch as jest.Mock)).toHaveBeenCalledTimes(2);
    expect((params as any).getAuthToken).toHaveBeenCalledWith('client-1', 'https://host.example');
  });

  it('uses a bare GET when forceReload is set even with a token', async () => {
    const messagesPayload = { status: 'success', data: { messages: [] } };
    const fetchMock = makeFetchMock([
      { test: (u) => u.includes('/messages'), handler: () => res({ ok: true, json: messagesPayload }) },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { params } = makeParams();
    const { result } = renderHook(() => useSessionManagement(params));
    await act(async () => { await result.current.loadSessionMessages('sess-1', 'tok', true, true); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init).toBeUndefined();
  });

  it('sets a rate-limit error on a 429 response', async () => {
    global.fetch = makeFetchMock([
      { test: (u) => u.includes('/messages'), handler: () => res({ ok: false, status: 429, headers: { 'Retry-After': '35' } }) },
    ]) as unknown as typeof fetch;
    const { params, getError } = makeParams();
    const { result } = renderHook(() => useSessionManagement(params));
    await act(async () => { await result.current.loadSessionMessages('sess-1', undefined, true, true); });
    expect(getError()).toBe('rateLimitWait:35');
  });

  it('throws on a non-ok, non-429 response and logs on initial load', async () => {
    global.fetch = makeFetchMock([
      { test: (u) => u.includes('/messages'), handler: () => res({ ok: false, status: 500 }) },
    ]) as unknown as typeof fetch;
    const { params, getError } = makeParams();
    const { result } = renderHook(() => useSessionManagement(params));
    await act(async () => { await result.current.loadSessionMessages('sess-1', undefined, true, true); });
    expect(getError()).toBe('loadHistoryError');
  });

  it('throws on an invalid response format', async () => {
    global.fetch = makeFetchMock([
      { test: (u) => u.includes('/messages'), handler: () => res({ ok: true, json: { status: 'error' } }) },
    ]) as unknown as typeof fetch;
    const { params } = makeParams();
    const { result } = renderHook(() => useSessionManagement(params));
    await expect(result.current.loadSessionMessages('sess-1', undefined, false, true)).rejects.toThrow('Invalid messages response format');
  });

  it('hides an assistant-only message set with no user messages, keeps greetings', async () => {
    const messagesPayload = {
      status: 'success',
      data: {
        messages: [
          { id: 'greeting-1', content: 'hi', sender: 'assistant' },
          { id: 'a1', content: 'unsolicited', sender: 'assistant' },
        ],
      },
    };
    global.fetch = makeFetchMock([
      { test: (u) => u.includes('/messages'), handler: () => res({ ok: true, json: messagesPayload }) },
    ]) as unknown as typeof fetch;
    const { params, getMessages } = makeParams();
    const { result } = renderHook(() => useSessionManagement(params));
    await act(async () => { await result.current.loadSessionMessages('sess-1', undefined, true, true); });
    const ids = getMessages().map((m: any) => m.id);
    expect(ids).toContain('greeting-1');
    expect(ids).not.toContain('a1');
  });

  it('merges local temp/stored messages with the server list, deduping stored dups', async () => {
    localStorage.setItem('local-msgs-sess-1', JSON.stringify([
      { id: 'dup-1', text: 'hello', timestamp: 1000 },
      { id: 'keep-1', text: 'unique local', timestamp: 2000 },
      { id: 'bad-json-entry' },
    ]));
    const messagesPayload = {
      status: 'success',
      data: {
        messages: [
          { id: 'srv-1', content: 'hello', sender: 'user', created_at: new Date(1000).toISOString() },
        ],
      },
    };
    global.fetch = makeFetchMock([
      { test: (u) => u.includes('/messages'), handler: () => res({ ok: true, json: messagesPayload }) },
    ]) as unknown as typeof fetch;
    const { params, getMessages } = makeParams();
    const { result } = renderHook(() => useSessionManagement(params));
    await act(async () => { await result.current.loadSessionMessages('sess-1', undefined, true, true); });
    const ids = getMessages().map((m: any) => m.id);
    expect(ids).toContain('srv-1');
    expect(ids).toContain('keep-1');
    expect(ids).not.toContain('dup-1');
  });
});

// ---------------------------------------------------------------------------
describe('useSessionManagement — createSession', () => {
  it('surfaces the cooldown message and posts to the parent on error', async () => {
    setActiveCooldown('session-create');
    const { params, getError } = makeParams();
    const { result } = renderHook(() => useSessionManagement(params));
    await act(async () => { await result.current.createSession('agent-1', 'tok'); });
    // The cooldown error carries its own localized userMessage with the remaining wait.
    expect(getError()).toMatch(/^rateLimitWait:\d+$/);
  });

  it('tags a control-group session when a widget config id is present without a variant', async () => {
    const fetchMock = makeFetchMock([
      { test: (u, i) => u.includes('/sessions/') && i.method === 'POST', handler: () => res({ ok: true, json: { status: 'success', data: { session_id: 'sess-new', expires_at: '2099-01-01T00:00:00Z' } } }) },
      { test: (u) => u.includes('/messages'), handler: () => res({ ok: true, json: { status: 'success', data: { messages: [] } } }) },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { params, getSessionId } = makeParams({ widgetConfig: validConfig });
    const { result } = renderHook(() => useSessionManagement(params));
    await act(async () => { await result.current.createSession('agent-1', 'tok'); });
    expect(getSessionId()).toBe('sess-new');
    const postCall = fetchMock.mock.calls.find(([u, i]) => u.includes('/sessions/') && i.method === 'POST');
    const body = JSON.parse(postCall![1].body as string);
    expect(body.metadata).toEqual({ is_ab_control: true, widget_config_id: 'config-1' });
    expect(helpers.storeSession).toHaveBeenCalledWith('base-sess-key', 'sess-new', '2099-01-01T00:00:00Z');
  });

  it('tags a variant session when a variant is assigned', async () => {
    const fetchMock = makeFetchMock([
      { test: (u, i) => u.includes('/sessions/') && i.method === 'POST', handler: () => res({ ok: true, json: { status: 'success', data: { session_id: 'sess-new' } } }) },
      { test: (u) => u.includes('/messages'), handler: () => res({ ok: true, json: { status: 'success', data: { messages: [] } } }) },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const variantConfig = { ...validConfig, variant_id: 'v1', variant_name: 'Variant One' };
    const { params } = makeParams({ widgetConfig: variantConfig });
    const { result } = renderHook(() => useSessionManagement(params));
    await act(async () => { await result.current.createSession('agent-1', 'tok', variantConfig); });
    const postCall = fetchMock.mock.calls.find(([u, i]) => u.includes('/sessions/') && i.method === 'POST');
    const body = JSON.parse(postCall![1].body as string);
    expect(body.metadata).toEqual({ variant_id: 'v1', variant_name: 'Variant One' });
  });

  it('skips loading messages when skipMessageLoad is set', async () => {
    const fetchMock = makeFetchMock([
      { test: (u, i) => u.includes('/sessions/') && i.method === 'POST', handler: () => res({ ok: true, json: { status: 'success', data: { session_id: 'sess-new' } } }) },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { params } = makeParams();
    const { result } = renderHook(() => useSessionManagement(params));
    await act(async () => { await result.current.createSession('agent-1', 'tok', null, true); });
    expect(fetchMock.mock.calls.some(([u]) => u.includes('/messages'))).toBe(false);
  });

  it('refreshes the token inline on a 401 mid-creation and retries once', async () => {
    let postCount = 0;
    const fetchMock = makeFetchMock([
      { test: (u, i) => u.includes('/sessions/') && i.method === 'POST', handler: () => {
        postCount++;
        if (postCount === 1) return res({ ok: false, status: 401, json: {} });
        return res({ ok: true, json: { status: 'success', data: { session_id: 'sess-refreshed' } } });
      } },
      { test: (u) => u.includes('/messages'), handler: () => res({ ok: true, json: { status: 'success', data: { messages: [] } } }) },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const getAuthToken = jest.fn().mockResolvedValue('refreshed-token');
    const { params, getSessionId, authTokenRef } = makeParams({ getAuthToken });
    const { result } = renderHook(() => useSessionManagement(params));
    await act(async () => { await result.current.createSession('agent-1', 'stale-token'); });
    expect(getSessionId()).toBe('sess-refreshed');
    expect(authTokenRef.current).toBe('refreshed-token');
    expect(postCount).toBe(2);
  });

  it('surfaces a rate-limit error on a 429 during creation', async () => {
    const fetchMock = makeFetchMock([
      { test: (u, i) => u.includes('/sessions/') && i.method === 'POST', handler: () => res({ ok: false, status: 429, json: {}, headers: { 'Retry-After': '45' } }) },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { params, getError } = makeParams();
    const { result } = renderHook(() => useSessionManagement(params));
    await act(async () => { await result.current.createSession('agent-1', 'tok'); });
    expect(getError()).toBe('rateLimitWait:45');
  });

  it('maps a 5xx into a network error message', async () => {
    const fetchMock = makeFetchMock([
      { test: (u, i) => u.includes('/sessions/') && i.method === 'POST', handler: () => res({ ok: false, status: 503, json: { detail: 'down' } }) },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { params, getError } = makeParams();
    const { result } = renderHook(() => useSessionManagement(params));
    await act(async () => { await result.current.createSession('agent-1', 'tok'); });
    expect(getError()).toBe('Network error. Please check your connection and try again.');
  });

  it('treats an invalid session payload as a session error', async () => {
    const fetchMock = makeFetchMock([
      { test: (u, i) => u.includes('/sessions/') && i.method === 'POST', handler: () => res({ ok: true, json: { status: 'success', data: {} } }) },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { params, getError } = makeParams();
    const { result } = renderHook(() => useSessionManagement(params));
    await act(async () => { await result.current.createSession('agent-1', 'tok'); });
    expect(getError()).toBe('Failed to establish session. Please try again.');
  });

  it('treats an AbortError from the fetch as a timeout', async () => {
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
    global.fetch = jest.fn().mockRejectedValue(abortErr) as unknown as typeof fetch;
    const { params, getError } = makeParams();
    const { result } = renderHook(() => useSessionManagement(params));
    await act(async () => { await result.current.createSession('agent-1', 'tok'); });
    expect(getError()).toBe('Network error. Please check your connection and try again.');
  });

  it('swallows a queue-flush failure after a successful session create', async () => {
    const fetchMock = makeFetchMock([
      { test: (u, i) => u.includes('/sessions/') && i.method === 'POST', handler: () => res({ ok: true, json: { status: 'success', data: { session_id: 'sess-new' } } }) },
      { test: (u) => u.includes('/messages'), handler: () => res({ ok: true, json: { status: 'success', data: { messages: [] } } }) },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const flushQueuedMessages = jest.fn().mockRejectedValue(new Error('flush failed'));
    const { params, getSessionId } = makeParams({ flushQueuedMessages });
    const { result } = renderHook(() => useSessionManagement(params));
    await act(async () => { await result.current.createSession('agent-1', 'tok'); });
    expect(getSessionId()).toBe('sess-new');
  });
});

// ---------------------------------------------------------------------------
describe('useSessionManagement — validateAndRestoreSession', () => {
  it('restores a preloaded (widget-shape) session, patches variant metadata, checks feedback', async () => {
    const fetchMock = makeFetchMock([
      { test: (u, i) => u.includes('/messages') && (!i.method || i.method === 'GET'), handler: () => res({ ok: true, json: { status: 'success', data: { messages: [{ id: 'm1', text: 'hi', from: 'agent', timestamp: 1 }] } } }) },
      { test: (u, i) => u.includes('/sessions/sess-1') && i.method === 'PATCH', handler: () => res({ ok: true, json: {} }) },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const variantConfig = { ...validConfig, variant_id: 'v1', variant_name: 'V1' };
    const { params, checkFeedbackStatus } = { ...makeParams(), checkFeedbackStatus: undefined } as any;
    const checkFeedbackStatusMock = jest.fn().mockResolvedValue(undefined);
    (params as any).checkFeedbackStatus = checkFeedbackStatusMock;
    const { result } = renderHook(() => useSessionManagement(params));
    await act(async () => {
      await result.current.validateAndRestoreSession('sess-1', 'agent-1', 'tok', variantConfig);
    });
    expect(fetchMock.mock.calls.some(([u, i]) => u.includes('PATCH') === false && i.method === 'PATCH')).toBe(true);
    expect(checkFeedbackStatusMock).toHaveBeenCalledWith('sess-1', 'tok');
  });

  it('restores a preloaded session and skips the feedback check when already submitted locally', async () => {
    localStorage.setItem('companin-feedback-sess-1', '1');
    const fetchMock = makeFetchMock([
      { test: (u) => u.includes('/messages'), handler: () => res({ ok: true, json: { status: 'success', data: { messages: [{ id: 'm1', text: 'hi', from: 'agent', timestamp: 1 }] } } }) },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const checkFeedbackStatus = jest.fn().mockResolvedValue(undefined);
    const { params } = makeParams({ checkFeedbackStatus });
    const { result } = renderHook(() => useSessionManagement(params));
    await act(async () => {
      await result.current.validateAndRestoreSession('sess-1', 'agent-1', 'tok', validConfig);
    });
    expect(checkFeedbackStatus).not.toHaveBeenCalled();
  });

  it('swallows a failed variant-metadata PATCH without affecting restore', async () => {
    const fetchMock = makeFetchMock([
      { test: (u, i) => u.includes('/messages') && i.method !== 'PATCH', handler: () => res({ ok: true, json: { status: 'success', data: { messages: [{ id: 'm1', text: 'hi', from: 'agent', timestamp: 1 }] } } }) },
      { test: (u, i) => i.method === 'PATCH', handler: () => { throw new Error('network down'); } },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const variantConfig = { ...validConfig, variant_id: 'v1' };
    const { params, getSessionId } = makeParams();
    const { result } = renderHook(() => useSessionManagement(params));
    await act(async () => {
      await result.current.validateAndRestoreSession('sess-1', 'agent-1', 'tok', variantConfig);
    });
    expect(getSessionId()).toBe('sess-1');
  });

  it('falls back to a bare GET when the authed GET does not return a widget-shaped payload', async () => {
    const fetchMock = makeFetchMock([
      { test: (u, i) => u.includes('/messages') && Boolean(i.headers), handler: () => res({ ok: false, status: 401 }) },
      { test: (u, i) => u.includes('/messages') && !i.headers, handler: () => res({ ok: true, json: {
        status: 'success',
        data: { messages: [
          { id: 'greeting-1', content: 'hi', sender: 'assistant' },
          { id: 'u1', content: 'hey', sender: 'user' },
          { id: 'a1', content: 'reply', sender: 'assistant' },
        ] },
      } }) },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const checkFeedbackStatus = jest.fn().mockResolvedValue(undefined);
    const { params, getMessages } = makeParams({ checkFeedbackStatus });
    const { result } = renderHook(() => useSessionManagement(params));
    await act(async () => {
      await result.current.validateAndRestoreSession('sess-1', 'agent-1', 'tok', null);
    });
    const ids = getMessages().map((m: any) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['greeting-1', 'u1', 'a1']));
    expect(checkFeedbackStatus).toHaveBeenCalled();
  });

  it('merges local-only messages into a raw-API restore and dedupes stored duplicates', async () => {
    localStorage.setItem('local-msgs-sess-1', JSON.stringify([
      { id: 'local-dup', text: 'hey', timestamp: 0 },
      { id: 'local-unique', text: 'only local', timestamp: 5000 },
    ]));
    const fetchMock = makeFetchMock([
      // Same raw-shaped payload for both the authed GET and any bare fallback GET.
      { test: (u) => u.includes('/messages'), handler: () => res({ ok: true, json: {
        status: 'success',
        data: { messages: [{ id: 'srv-1', content: 'hey', sender: 'user', created_at: new Date(0).toISOString() }] },
      } }) },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const flushQueuedMessages = jest.fn().mockResolvedValue(undefined);
    const { params, getMessages } = makeParams({ flushQueuedMessages });
    const { result } = renderHook(() => useSessionManagement(params));
    await act(async () => {
      await result.current.validateAndRestoreSession('sess-1', 'agent-1', 'tok', null);
    });
    const ids = getMessages().map((m: any) => m.id);
    expect(ids).toContain('srv-1');
    expect(ids).toContain('local-unique');
    expect(ids).not.toContain('local-dup');
    expect(flushQueuedMessages).toHaveBeenCalled();
  });

  it('creates a new session when the restore GET is not ok', async () => {
    const fetchMock = makeFetchMock([
      { test: (u) => u.includes('/messages'), handler: () => res({ ok: false, status: 404 }) },
      { test: (u, i) => u.includes('/sessions/') && i.method === 'POST', handler: () => res({ ok: true, json: { status: 'success', data: { session_id: 'sess-recovered' } } }) },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { params, getSessionId } = makeParams();
    const { result } = renderHook(() => useSessionManagement(params));
    await act(async () => {
      await result.current.validateAndRestoreSession('sess-1', 'agent-1', 'tok', null);
    });
    expect(helpers.clearStoredSession).toHaveBeenCalledWith('sess-key');
    expect(getSessionId()).toBe('sess-recovered');
  });

  it('creates a new session when the restore GET throws', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const fetchMock = makeFetchMock([
      { test: (u, i) => u.includes('/sessions/') && i.method === 'POST', handler: () => res({ ok: true, json: { status: 'success', data: { session_id: 'sess-recovered-2' } } }) },
    ]);
    // First call rejects (the outer GET); subsequent calls (from createSession) use the router.
    let first = true;
    global.fetch = jest.fn(async (...args: unknown[]) => {
      if (first) { first = false; throw new Error('offline'); }
      return (fetchMock as unknown as (...a: unknown[]) => Promise<Response>)(...args);
    }) as unknown as typeof fetch;
    const { params, getSessionId } = makeParams();
    const { result } = renderHook(() => useSessionManagement(params));
    await act(async () => {
      await result.current.validateAndRestoreSession('sess-1', 'agent-1', 'tok', null);
    });
    expect(getSessionId()).toBe('sess-recovered-2');
  });
});

// ---------------------------------------------------------------------------
describe('useSessionManagement — fetchAgentDetails', () => {
  it('fetches and sets the agent name, then serves the second call from cache', async () => {
    const fetchMock = makeFetchMock([
      { test: (u) => u.includes('/agents/'), handler: () => res({ ok: true, json: { status: 'success', data: { name: 'Agent Smith' } } }) },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { params, getAgentName } = makeParams();
    const { result } = renderHook(() => useSessionManagement(params));
    await act(async () => { await result.current.fetchAgentDetails('agent-1', 'tok'); });
    expect(getAgentName()).toBe('Agent Smith');
    await act(async () => { await result.current.fetchAgentDetails('agent-1', 'tok'); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent in-flight requests for the same agent', async () => {
    let resolveFetch: (v: Response) => void;
    const pending = new Promise<Response>((resolve) => { resolveFetch = resolve; });
    global.fetch = jest.fn().mockReturnValue(pending) as unknown as typeof fetch;
    const { params } = makeParams();
    const { result } = renderHook(() => useSessionManagement(params));
    let p1: Promise<void>, p2: Promise<void>;
    await act(async () => {
      p1 = result.current.fetchAgentDetails('agent-x', 'tok');
      p2 = result.current.fetchAgentDetails('agent-x', 'tok');
      resolveFetch!(res({ ok: true, json: { status: 'success', data: { name: 'Neo' } } }));
      await Promise.all([p1, p2]);
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('throws an auth error when the response is not success', async () => {
    global.fetch = makeFetchMock([
      { test: (u) => u.includes('/agents/'), handler: () => res({ ok: true, json: { status: 'error' } }) },
    ]) as unknown as typeof fetch;
    const { params } = makeParams();
    const { result } = renderHook(() => useSessionManagement(params));
    await expect(result.current.fetchAgentDetails('agent-2', 'tok')).rejects.toThrow('Invalid agent response');
  });

  it('surfaces a rate-limit error on a 429', async () => {
    global.fetch = makeFetchMock([
      { test: (u) => u.includes('/agents/'), handler: () => res({ ok: false, status: 429, headers: { 'Retry-After': '37' } }) },
    ]) as unknown as typeof fetch;
    const { params } = makeParams();
    const { result } = renderHook(() => useSessionManagement(params));
    await expect(result.current.fetchAgentDetails('agent-3', 'tok')).rejects.toMatchObject({ userMessage: 'rateLimitWait:37' });
  });

  it('throws a generic auth error on other failures', async () => {
    global.fetch = makeFetchMock([
      { test: (u) => u.includes('/agents/'), handler: () => res({ ok: false, status: 500 }) },
    ]) as unknown as typeof fetch;
    const { params } = makeParams();
    const { result } = renderHook(() => useSessionManagement(params));
    await expect(result.current.fetchAgentDetails('agent-4', 'tok')).rejects.toThrow('agentUnavailable');
  });
});

// ---------------------------------------------------------------------------
describe('useSessionManagement — fetchWidgetConfig', () => {
  it('fetches, validates, and applies posted show_unread_badge / edge_offset overrides', async () => {
    const fetchMock = makeFetchMock([
      { test: (u) => u.includes('/widget-config/'), handler: () => res({ ok: true, json: { status: 'success', data: { ...validConfig } } }) },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { params, postedShowUnreadBadge, postedEdgeOffset } = makeParams();
    postedShowUnreadBadge.current = true;
    postedEdgeOffset.current = 42;
    const { result } = renderHook(() => useSessionManagement(params));
    const config = await act(async () => result.current.fetchWidgetConfig('config-1', 'tok'));
    expect((config as any).show_unread_badge).toBe(true);
    expect((config as any).edge_offset).toBe(42);
  });

  it('serves the second call from cache within the dedupe window', async () => {
    const fetchMock = makeFetchMock([
      { test: (u) => u.includes('/widget-config/'), handler: () => res({ ok: true, json: { status: 'success', data: { ...validConfig } } }) },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { params } = makeParams({ widgetConfig: validConfig });
    const { result } = renderHook(() => useSessionManagement(params));
    await act(async () => { await result.current.fetchWidgetConfig('config-1', 'tok'); });
    await act(async () => { await result.current.fetchWidgetConfig('config-1', 'tok'); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent in-flight requests for the same config id', async () => {
    let resolveFetch: (v: Response) => void;
    const pending = new Promise<Response>((resolve) => { resolveFetch = resolve; });
    global.fetch = jest.fn().mockReturnValue(pending) as unknown as typeof fetch;
    const { params } = makeParams();
    const { result } = renderHook(() => useSessionManagement(params));
    let p1: Promise<unknown>, p2: Promise<unknown>;
    await act(async () => {
      p1 = result.current.fetchWidgetConfig('config-y', 'tok');
      p2 = result.current.fetchWidgetConfig('config-y', 'tok');
      resolveFetch!(res({ ok: true, json: { status: 'success', data: { ...validConfig, id: 'config-y' } } }));
      await Promise.all([p1, p2]);
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('surfaces a rate-limit error on a 429', async () => {
    global.fetch = makeFetchMock([
      { test: (u) => u.includes('/widget-config/'), handler: () => res({ ok: false, status: 429, headers: { 'Retry-After': '52' } }) },
    ]) as unknown as typeof fetch;
    const { params } = makeParams();
    const { result } = renderHook(() => useSessionManagement(params));
    await expect(result.current.fetchWidgetConfig('config-z', 'tok')).rejects.toMatchObject({ userMessage: 'rateLimitWait:52' });
  });

  it('throws an auth error on other failures', async () => {
    global.fetch = makeFetchMock([
      { test: (u) => u.includes('/widget-config/'), handler: () => res({ ok: false, status: 500 }) },
    ]) as unknown as typeof fetch;
    const { params } = makeParams();
    const { result } = renderHook(() => useSessionManagement(params));
    await expect(result.current.fetchWidgetConfig('config-w', 'tok')).rejects.toThrow('configUnavailable');
  });

  it('throws on an invalid config response format', async () => {
    global.fetch = makeFetchMock([
      { test: (u) => u.includes('/widget-config/'), handler: () => res({ ok: true, json: { status: 'error' } }) },
    ]) as unknown as typeof fetch;
    const { params } = makeParams();
    const { result } = renderHook(() => useSessionManagement(params));
    await expect(result.current.fetchWidgetConfig('config-v', 'tok')).rejects.toThrow('Invalid config response format');
  });
});
