import { renderHook, act } from '@testing-library/react';
import { useMessageOperations } from '../app/embed/docs/hooks/useMessageOperations';
import type { MessageType } from '../app/embed/docs/DocsClient.types';
import { WidgetError, WidgetErrorType, WidgetErrorCode } from '../lib/errorHandling';

// --- Module mocks --------------------------------------------------------
// Bounded-fetch primitive: replaced so tests control the HTTP outcome.
jest.mock('../app/embed/docs/resilientFetch', () => ({
  fetchWithTimeout: jest.fn(),
}));

// getPageContext touches window/document — stub to a stable payload.
jest.mock('../app/embed/docs/helpers', () => ({
  getPageContext: () => ({ url: 'https://host.example/docs' }),
}));

// Offline queue (IndexedDB) — fully stubbed; isOnline defaults to online.
jest.mock('../src/lib/offline', () => ({
  queueMessage: jest.fn().mockResolvedValue(undefined),
  getQueuedMessages: jest.fn().mockResolvedValue([]),
  removeQueuedMessage: jest.fn().mockResolvedValue(undefined),
  incrementAttempt: jest.fn().mockResolvedValue(undefined),
  isOnline: jest.fn().mockReturnValue(true),
}));

// Keep the real WidgetError/codes but drop the backoff delays so retries run
// synchronously (the retry timing is exercised in errorHandling's own tests).
jest.mock('../lib/errorHandling', () => {
  const actual = jest.requireActual('../lib/errorHandling');
  return { ...actual, retryWithBackoff: (fn: () => unknown) => fn() };
});

jest.mock('sonner', () => ({ toast: { success: jest.fn() } }));

import { fetchWithTimeout } from '../app/embed/docs/resilientFetch';
import {
  queueMessage,
  getQueuedMessages,
  removeQueuedMessage,
  incrementAttempt,
  isOnline,
} from '../src/lib/offline';
import { toast } from 'sonner';

const mockFetchWithTimeout = fetchWithTimeout as jest.Mock;
const mockQueueMessage = queueMessage as jest.Mock;
const mockGetQueuedMessages = getQueuedMessages as jest.Mock;
const mockRemoveQueuedMessage = removeQueuedMessage as jest.Mock;
const mockIncrementAttempt = incrementAttempt as jest.Mock;
const mockIsOnline = isOnline as jest.Mock;

// Response builder for fetchWithTimeout / global.fetch.
function res({ ok = true, status = 200, json = {}, text = '' }: {
  ok?: boolean; status?: number; json?: unknown; text?: string;
}) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: jest.fn().mockResolvedValue(json),
    text: jest.fn().mockResolvedValue(text),
  } as unknown as Response;
}

// Build hook params with stateful message/feedback setters so the functional
// updaters actually run (exercising the .map/.filter branches).
function makeParams(overrides: Record<string, unknown> = {}) {
  let messages: MessageType[] = [];
  let feedback = new Set<string>();
  const setMessages = jest.fn((u: unknown) => {
    messages = typeof u === 'function' ? (u as (p: MessageType[]) => MessageType[])(messages) : (u as MessageType[]);
  });
  const setMessageFeedbackSubmitted = jest.fn((u: unknown) => {
    feedback = typeof u === 'function' ? (u as (p: Set<string>) => Set<string>)(feedback) : (u as Set<string>);
  });
  return {
    getMessages: () => messages,
    getFeedback: () => feedback,
    params: {
      sessionId: 'sess-1',
      authToken: 'tok-1',
      activeLocale: 'en',
      initialParentOrigin: 'https://host.example',
      initialPreviewConfig: undefined as string | undefined,
      embedHeaders: { 'X-Embed-Origin': 'https://host.example' },
      setStatus: jest.fn(),
      setError: jest.fn(),
      setMessages,
      setMessageFeedbackSubmitted,
      setText: jest.fn(),
      loadSessionMessages: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsOnline.mockReturnValue(true);
  mockGetQueuedMessages.mockResolvedValue([]);
  mockQueueMessage.mockResolvedValue(undefined);
  mockRemoveQueuedMessage.mockResolvedValue(undefined);
  mockIncrementAttempt.mockResolvedValue(undefined);
});

describe('useMessageOperations — sendMessageToAPI', () => {
  it('returns early when session or token is missing', async () => {
    const { params } = makeParams({ sessionId: null });
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useMessageOperations(params));
    await act(async () => { await result.current.sendMessageToAPI('hi'); });
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('sends successfully, clears queue and reloads messages', async () => {
    mockFetchWithTimeout.mockResolvedValue(res({ ok: true, json: { status: 'success' } }));
    const { params } = makeParams();
    const { result } = renderHook(() => useMessageOperations(params));
    await act(async () => { await result.current.sendMessageToAPI('hello', 'q1'); });
    expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    expect(mockRemoveQueuedMessage).toHaveBeenCalledWith('q1');
    expect(params.loadSessionMessages).toHaveBeenCalledWith('sess-1', 'tok-1');
    expect(params.setStatus).toHaveBeenLastCalledWith('ready');
  });

  it('queues the message and shows offline state when offline', async () => {
    mockIsOnline.mockReturnValue(false);
    const { params } = makeParams();
    const { result } = renderHook(() => useMessageOperations(params));
    await act(async () => { await result.current.sendMessageToAPI('offline msg', 'q2'); });
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
    expect(mockQueueMessage).toHaveBeenCalledWith(expect.objectContaining({ id: 'q2', text: 'offline msg', source: 'docs' }));
    expect(params.setStatus).toHaveBeenLastCalledWith('ready');
  });

  it('swallows a queue write failure while offline', async () => {
    mockIsOnline.mockReturnValue(false);
    mockQueueMessage.mockRejectedValue(new Error('no idb'));
    const { params } = makeParams();
    const { result } = renderHook(() => useMessageOperations(params));
    await act(async () => { await result.current.sendMessageToAPI('offline msg', 'q3'); });
    expect(params.setStatus).toHaveBeenLastCalledWith('ready');
  });

  it('re-queues and marks failed on a transient (retryable) error', async () => {
    mockFetchWithTimeout.mockResolvedValue(res({ ok: false, status: 503, json: { detail: 'boom' } }));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { params } = makeParams();
    const { result } = renderHook(() => useMessageOperations(params));
    await act(async () => { await result.current.sendMessageToAPI('hi', 'q4'); });
    expect(mockQueueMessage).toHaveBeenCalledWith(expect.objectContaining({ id: 'q4' }));
    expect(params.setError).toHaveBeenCalled();
    expect(params.setStatus).toHaveBeenLastCalledWith('ready');
    errSpy.mockRestore();
  });

  it('marks failed with a timeout message on NETWORK_TIMEOUT', async () => {
    mockFetchWithTimeout.mockRejectedValue(
      new WidgetError('t/o', WidgetErrorCode.NETWORK_TIMEOUT, WidgetErrorType.NETWORK_ERROR, true)
    );
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { params } = makeParams();
    const { result } = renderHook(() => useMessageOperations(params));
    await act(async () => { await result.current.sendMessageToAPI('hi', 'q5'); });
    expect(mockQueueMessage).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('marks failed (no re-queue) on a permanent client error', async () => {
    mockFetchWithTimeout.mockResolvedValue(res({ ok: false, status: 400, json: { detail: 'bad input' } }));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { params } = makeParams();
    const { result } = renderHook(() => useMessageOperations(params));
    await act(async () => { await result.current.sendMessageToAPI('hi', 'q6'); });
    expect(mockQueueMessage).not.toHaveBeenCalled();
    expect(params.setError).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('treats a 200 non-success envelope as a server error', async () => {
    mockFetchWithTimeout.mockResolvedValue(res({ ok: true, json: { status: 'error' } }));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { params } = makeParams();
    const { result } = renderHook(() => useMessageOperations(params));
    await act(async () => { await result.current.sendMessageToAPI('hi', 'q7'); });
    // server error is retryable → re-queued
    expect(mockQueueMessage).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe('useMessageOperations — retryQueuedMessage', () => {
  it('does nothing without session/token', async () => {
    const { params } = makeParams({ authToken: null });
    const { result } = renderHook(() => useMessageOperations(params));
    await act(async () => { await result.current.retryQueuedMessage('q1'); });
    expect(mockGetQueuedMessages).not.toHaveBeenCalled();
  });

  it('does nothing when the queued item is not found', async () => {
    mockGetQueuedMessages.mockResolvedValue([{ id: 'other', source: 'docs', text: 'x' }]);
    const { params } = makeParams();
    const { result } = renderHook(() => useMessageOperations(params));
    await act(async () => { await result.current.retryQueuedMessage('missing'); });
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
  });

  it('resends a found queued item', async () => {
    mockGetQueuedMessages.mockResolvedValue([{ id: 'q1', source: 'docs', text: 'retry me' }]);
    mockFetchWithTimeout.mockResolvedValue(res({ ok: true, json: { status: 'success' } }));
    const { params } = makeParams();
    const { result } = renderHook(() => useMessageOperations(params));
    await act(async () => { await result.current.retryQueuedMessage('q1'); });
    expect(params.setError).toHaveBeenCalledWith(null);
    expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
  });
});

describe('useMessageOperations — flushQueue', () => {
  it('returns early when offline', async () => {
    mockIsOnline.mockReturnValue(false);
    const { params } = makeParams();
    const { result } = renderHook(() => useMessageOperations(params));
    await act(async () => { await result.current.flushQueue(); });
    expect(mockGetQueuedMessages).not.toHaveBeenCalled();
  });

  it('drops items that exhausted their attempts', async () => {
    mockGetQueuedMessages.mockResolvedValue([{ id: 'q1', source: 'docs', text: 'a', seq: 1, attempts: 5 }]);
    const { params } = makeParams();
    const { result } = renderHook(() => useMessageOperations(params));
    await act(async () => { await result.current.flushQueue(); });
    expect(mockRemoveQueuedMessage).toHaveBeenCalledWith('q1');
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
  });

  it('sends queued items in order and clears them on success', async () => {
    mockGetQueuedMessages.mockResolvedValue([
      { id: 'q2', source: 'docs', text: 'b', seq: 2 },
      { id: 'q1', source: 'docs', text: 'a', seq: 1 },
    ]);
    mockFetchWithTimeout.mockResolvedValue(res({ ok: true, json: { status: 'success' } }));
    const { params } = makeParams();
    const { result } = renderHook(() => useMessageOperations(params));
    await act(async () => { await result.current.flushQueue(); });
    expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
    // ordered by seq → q1 (seq 1) posts before q2 (seq 2)
    expect(mockFetchWithTimeout.mock.calls[0][1].body).toContain('a');
    expect(mockRemoveQueuedMessage).toHaveBeenCalledWith('q1');
    expect(mockRemoveQueuedMessage).toHaveBeenCalledWith('q2');
  });

  it('drops a permanently-failed item and continues', async () => {
    mockGetQueuedMessages.mockResolvedValue([
      { id: 'q1', source: 'docs', text: 'a', seq: 1 },
      { id: 'q2', source: 'docs', text: 'b', seq: 2 },
    ]);
    mockFetchWithTimeout
      .mockResolvedValueOnce(res({ ok: false, status: 400, json: { detail: 'nope' } }))
      .mockResolvedValueOnce(res({ ok: true, json: { status: 'success' } }));
    const { params } = makeParams();
    const { result } = renderHook(() => useMessageOperations(params));
    await act(async () => { await result.current.flushQueue(); });
    // q1 permanent-fail dropped, q2 still attempted
    expect(mockRemoveQueuedMessage).toHaveBeenCalledWith('q1');
    expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
  });

  it('increments attempts and stops on a transient failure', async () => {
    mockGetQueuedMessages.mockResolvedValue([
      { id: 'q1', source: 'docs', text: 'a', seq: 1 },
      { id: 'q2', source: 'docs', text: 'b', seq: 2 },
    ]);
    mockFetchWithTimeout.mockResolvedValue(res({ ok: false, status: 500, json: { detail: 'srv' } }));
    const { params } = makeParams();
    const { result } = renderHook(() => useMessageOperations(params));
    await act(async () => { await result.current.flushQueue(); });
    expect(mockIncrementAttempt).toHaveBeenCalledWith('q1');
    // stops after the first transient failure → only one post
    expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
  });
});

describe('useMessageOperations — feedback', () => {
  it('does nothing without an auth token', async () => {
    const { params } = makeParams({ authToken: null });
    const { result } = renderHook(() => useMessageOperations(params));
    await act(async () => { await result.current.handleSubmitMessageFeedback('m1'); });
    expect(params.setMessageFeedbackSubmitted).not.toHaveBeenCalled();
  });

  it('records feedback on success', async () => {
    global.fetch = jest.fn().mockResolvedValue(res({ ok: true, json: {} })) as unknown as typeof fetch;
    const { params, getFeedback } = makeParams();
    const { result } = renderHook(() => useMessageOperations(params));
    await act(async () => { await result.current.handleSubmitMessageFeedback('m1', 'thumbs_down'); });
    expect(getFeedback().has('m1')).toBe(true);
  });

  it('logs when the feedback request fails', async () => {
    global.fetch = jest.fn().mockResolvedValue(res({ ok: false, status: 500, text: 'err' })) as unknown as typeof fetch;
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { params } = makeParams();
    const { result } = renderHook(() => useMessageOperations(params));
    await act(async () => { await result.current.handleSubmitMessageFeedback('m1'); });
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('logs when the feedback request throws', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('down')) as unknown as typeof fetch;
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { params } = makeParams();
    const { result } = renderHook(() => useMessageOperations(params));
    await act(async () => { await result.current.handleSubmitMessageFeedback('m1'); });
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe('useMessageOperations — addUserMessage & handlers', () => {
  it('surfaces an error when session/auth is missing', async () => {
    const { params } = makeParams({ sessionId: null });
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useMessageOperations(params));
    await act(async () => { await result.current.addUserMessage('hi'); });
    expect(params.setError).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('appends the user bubble and sends', async () => {
    mockFetchWithTimeout.mockResolvedValue(res({ ok: true, json: { status: 'success' } }));
    const { params, getMessages } = makeParams();
    const { result } = renderHook(() => useMessageOperations(params));
    await act(async () => { await result.current.addUserMessage('hi'); });
    expect(getMessages().some(m => m.from === 'user')).toBe(true);
    expect(params.setStatus).toHaveBeenCalledWith('submitted');
  });

  it('ignores an empty submit', () => {
    const { params } = makeParams();
    const { result } = renderHook(() => useMessageOperations(params));
    act(() => { result.current.handleSubmit({ text: '', files: [] } as never); });
    expect(params.setStatus).not.toHaveBeenCalled();
  });

  it('produces a canned agent reply in preview mode', () => {
    jest.useFakeTimers();
    const { params, getMessages } = makeParams({ initialPreviewConfig: 'eyJ9' });
    const { result } = renderHook(() => useMessageOperations(params));
    act(() => { result.current.handleSubmit({ text: 'hi preview' } as never); });
    expect(params.setText).toHaveBeenCalledWith('');
    act(() => { jest.advanceTimersByTime(900); });
    expect(getMessages().some(m => m.from === 'agent')).toBe(true);
    jest.useRealTimers();
  });

  it('toasts on file attachments and sends the message', async () => {
    mockFetchWithTimeout.mockResolvedValue(res({ ok: true, json: { status: 'success' } }));
    const { params } = makeParams();
    const { result } = renderHook(() => useMessageOperations(params));
    await act(async () => {
      result.current.handleSubmit({ text: 'with files', files: [{ id: 'f1' }] } as never);
    });
    expect(toast.success).toHaveBeenCalled();
    expect(params.setText).toHaveBeenCalledWith('');
  });

  it('sends a clicked suggestion', async () => {
    mockFetchWithTimeout.mockResolvedValue(res({ ok: true, json: { status: 'success' } }));
    const { params, getMessages } = makeParams();
    const { result } = renderHook(() => useMessageOperations(params));
    await act(async () => { result.current.handleSuggestionClick('a suggestion'); });
    expect(getMessages().some(m => m.versions[0].content === 'a suggestion')).toBe(true);
  });
});
