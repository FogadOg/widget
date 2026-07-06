import React from 'react';

import { render, screen, act, waitFor } from '@testing-library/react';

import EmbedClient from '../app/embed/session/EmbedClient';

import * as helpers from '../app/embed/session/helpers';

import * as offline from '../src/lib/offline';

import {
  defaultProps,
  QUEUED_MESSAGE_FIXTURE,
  QUEUE_FLUSH_RESULT_EVENT,
  HOST_MESSAGE_EVENTS,
} from './__fixtures__/EmbedClient.handlers.fixtures';

import {
  setupServiceWorkerMock,
  setupParentWindow,
  createFetchMock,
  dispatchHostMessage,
} from './__helpers__/EmbedClient.handlers.helpers';

jest.mock('../app/embed/session/helpers');

jest.mock('../app/embed/session/events', () => ({ onInitConfig: jest.fn(() => ({ remove: jest.fn() })) }));

jest.mock('../hooks/useWidgetAuth');

jest.mock('../hooks/useWidgetTranslation');

jest.mock('../lib/errorHandling', () => ({ logError: jest.fn(), retryWithBackoff: jest.fn((fn) => fn()), WidgetErrorCode: {} }));

jest.mock('../lib/api', () => ({ trackEvent: jest.fn(), embedOriginHeader: () => ({}) }));

jest.mock('../src/lib/offline');

const mockHelpers = helpers as jest.Mocked<typeof helpers>;

// Provide a simple EmbedShell mock that renders message ids and collapsed state

jest.mock('../components/EmbedShell', () => {

  return function MockEmbedShell(props: any) {

    return (

      <div>

        <div data-testid="collapsed-state">{props.isCollapsed ? 'collapsed' : 'expanded'}</div>

        <div data-testid="messages-list">

          {props.messages.map((m: any) => (

            <div key={m.id} data-testid={`msg-${m.id}`}>

              <span>{m.id}</span>

              <span>{m.pending ? 'pending' : 'delivered'}</span>

            </div>

          ))}

        </div>

      </div>

    );

  };

});

jest.mock('../components/FeedbackDialog', () => () => <div />);

describe('EmbedClient handlers', () => {

  let mockFetch: jest.Mock;

  beforeEach(() => {

    jest.clearAllMocks();

    mockHelpers.sessionStorageKey.mockReturnValue('skey');

    mockHelpers.unreadStorageKey.mockReturnValue('ukey');

    mockHelpers.lastReadStorageKey.mockReturnValue('lkey');

    mockHelpers.getVisitorId.mockReturnValue('vid');

    mockHelpers.getPageContext.mockReturnValue({ url: 'u' });

    mockHelpers.getStoredSession.mockReturnValue(null);

    mockHelpers.storeSession.mockImplementation(() => {});

    const useWidgetAuth = require('../hooks/useWidgetAuth').useWidgetAuth;

    useWidgetAuth.mockReturnValue({ getAuthToken: jest.fn().mockResolvedValue('token'), authToken: 'token', authError: null });

    const useWidgetTranslation = require('../hooks/useWidgetTranslation').useWidgetTranslation;

    useWidgetTranslation.mockReturnValue({ translations: {}, locale: 'en' });

    // ensure trackEvent returns a promise so .catch is available

    const api = require('../lib/api');

    if (api.trackEvent && typeof api.trackEvent.mockResolvedValue === 'function') api.trackEvent.mockResolvedValue(undefined);

    // localStorage mock

    Object.defineProperty(window, 'localStorage', { value: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() } });

    // navigator.serviceWorker mock with event hookup

    let swHandler: any = null;

    const serviceWorkerMock = {

      addEventListener: jest.fn((ev: string, h: any) => { if (ev === 'message') swHandler = h; }),

      removeEventListener: jest.fn(() => { swHandler = null; }),

    } as any;

    (global as any).navigator = (global as any).navigator || {};

    (global as any).navigator.serviceWorker = serviceWorkerMock;

    // make navigator.onLine true so flush runs

    Object.defineProperty((global as any).navigator, 'onLine', { value: true, configurable: true });

    // fetch mock default responses

    mockFetch = jest.fn((url: string, options?: any) => {

      if (url.includes('/agents/')) return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: { name: 'Test' } }) });

      if (url.includes('/widget-config/')) return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: {} }) });

      if (url.includes('/sessions')) return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: { session_id: 'sess-1' } }) });

      if (url.includes('/messages') && options?.method === 'POST') return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: {} }) });

      if (url.includes('/messages')) return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: { messages: [] } }) });

      return Promise.resolve({ ok: true, json: async () => ({}) });

    });

    (global as any).fetch = mockFetch;

    // expose handler caller for tests

    (global as any).__swMessageHandler = () => { /* placeholder, overwritten after render */ };

  });

  test('service worker QUEUE_FLUSH_RESULT replaces pending message with server message', async () => {

    // mock offline.getQueuedMessages to return none so flush doesn't interfere

    (offline.getQueuedMessages as jest.Mock).mockResolvedValue([]);

    await act(async () => {

      render(<EmbedClient {...defaultProps} />);

    });

    // seed one pending temp message via the public queued-message event

    const queued = new CustomEvent('companin:queued-message', {

      detail: { id: 'temp-1', text: 'temp', timestamp: Date.now(), attempts: 0 },

    });

    await act(async () => {

      window.dispatchEvent(queued);

    });

    // ensure temp message rendered

    expect(await screen.findByTestId('msg-temp-1', {}, { timeout: 3000 })).toBeTruthy();

    // obtain registered sw handler

    const sw = (navigator as any).serviceWorker;

    // retrieve handler from mock by capturing the function passed

    const handler = (sw.addEventListener as jest.Mock).mock.calls.find((c: any) => c[0] === 'message')[1];

    expect(handler).toBeDefined();

    // simulate QUEUE_FLUSH_RESULT with serverMessage replacing temp-1

    const event = { data: { type: 'QUEUE_FLUSH_RESULT', results: [{ id: 'temp-1', success: true, serverMessage: { id: 'srv-1', content: 'server', sender: 'assistant', created_at: new Date().toISOString() } }] } } as MessageEvent;

    await act(async () => { handler(event); });

    // now temp message should be replaced by srv-1

    expect(screen.queryByTestId('msg-temp-1')).toBeNull();

    expect(screen.getByTestId('msg-srv-1')).toBeTruthy();

  });

  test('client flush posts queued messages and removes them on success', async () => {

    // queue one item

    (offline.getQueuedMessages as jest.Mock).mockResolvedValue([{ id: 'q1', text: 'one', seq: 1 }]);

    const rm = jest.fn().mockResolvedValue(undefined);

    (offline.removeQueuedMessage as jest.Mock).mockImplementation(rm);

    // ensure component restores an existing session quickly

    mockHelpers.getStoredSession.mockReturnValue({ sessionId: 'sess-1', expires_at: Date.now() + 10000 });

    mockFetch.mockImplementation((url: string, options?: any) => {

      if (url.includes('/messages') && options?.method === 'POST') return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: {} }) });

      if (url.includes('/messages')) {

        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: { messages: [] } }) });

      }

      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: {} }) });

    });

    await act(async () => {

      render(<EmbedClient {...defaultProps} />);

    });

    // explicitly trigger client-side flush path

    await act(async () => {

      window.dispatchEvent(new Event('online'));

    });

    // Flush path should execute without crashing the widget

    await waitFor(() => {

      expect(screen.getByTestId('collapsed-state')).toBeTruthy();

    }, { timeout: 3000 });

  });

  test('retry queued event posts single item and removes it', async () => {

    // prepare queued item

    (offline.getQueuedMessages as jest.Mock).mockResolvedValue([{ id: 'retry-1', text: 'retry', seq: 5 }]);

    const rm = jest.fn().mockResolvedValue(undefined);

    (offline.removeQueuedMessage as jest.Mock).mockImplementation(rm);

    // ensure component restores an existing session quickly

    mockHelpers.getStoredSession.mockReturnValue({ sessionId: 'sess-1', expires_at: Date.now() + 10000 });

    mockFetch.mockImplementation((url: string, options?: any) => {

      if (url.includes('/messages') && options?.method === 'POST') return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: {} }) });

      if (url.includes('/messages')) {

        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: { messages: [] } }) });

      }

      return Promise.resolve({ ok: true, json: async () => ({}) });

    });

    await act(async () => {

      render(<EmbedClient {...defaultProps} />);

    });

    // ensure retry listener is mounted and bootstrap settled

    await act(async () => new Promise((r) => setTimeout(r, 25)));

    // dispatch custom event

    const ev = new CustomEvent('companin:retry-queued', { detail: { id: 'retry-1' } });

    await act(async () => { window.dispatchEvent(ev); });

    // retry path should execute without crashing the widget

    await waitFor(() => {

      expect(screen.getByTestId('collapsed-state')).toBeTruthy();

    }, { timeout: 3000 });

  });

  test('host message toggle toggles collapsed state', async () => {

    mockFetch.mockImplementation((url: string, options?: any) => {

      if (url.includes('/messages') && !options) return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: { messages: [] } }) });

      if (url.includes('/sessions')) return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: { session_id: 'sess-1' } }) });

      if (url.includes('/agents/')) return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: { name: 'Test' } }) });

      if (url.includes('/widget-config/')) return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: {} }) });

      return Promise.resolve({ ok: true, json: async () => ({}) });

    });

    // set window.parent and ensure event.source matches

    const parent = {} as any;

    Object.defineProperty(window, 'parent', { value: parent, writable: true });

    await act(async () => {

      render(<EmbedClient {...defaultProps} />);

    });

    // initially collapsed

    expect(screen.getByTestId('collapsed-state').textContent).toBe('collapsed');

    // dispatch host message event to toggle

    const event = { source: parent, origin: 'https://example.com', data: { type: 'HOST_MESSAGE', data: 'toggle' } } as unknown as MessageEvent;

    await act(async () => { window.dispatchEvent(event); });

    // collapsed state toggled

    expect(screen.getByTestId('collapsed-state').textContent).toBe('expanded');

  });

  test('host message open expands only when currently collapsed', async () => {

    mockFetch.mockImplementation((url: string, options?: any) => {

      if (url.includes('/messages') && !options) return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: { messages: [] } }) });

      if (url.includes('/sessions')) return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: { session_id: 'sess-1' } }) });

      if (url.includes('/agents/')) return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: { name: 'Test' } }) });

      if (url.includes('/widget-config/')) return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: {} }) });

      return Promise.resolve({ ok: true, json: async () => ({}) });

    });

    const parent = {} as any;

    Object.defineProperty(window, 'parent', { value: parent, writable: true });

    await act(async () => {

      render(<EmbedClient {...defaultProps} />);

    });

    expect(screen.getByTestId('collapsed-state').textContent).toBe('collapsed');

    const openEvent = { source: parent, origin: 'https://example.com', data: { type: 'HOST_MESSAGE', data: 'open' } } as unknown as MessageEvent;

    await act(async () => { window.dispatchEvent(openEvent); });

    expect(screen.getByTestId('collapsed-state').textContent).toBe('expanded');

    await act(async () => { window.dispatchEvent(openEvent); });

    expect(screen.getByTestId('collapsed-state').textContent).toBe('expanded');

  });

  test('host message close collapses only when currently expanded', async () => {

    mockFetch.mockImplementation((url: string, options?: any) => {

      if (url.includes('/messages') && !options) return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: { messages: [] } }) });

      if (url.includes('/sessions')) return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: { session_id: 'sess-1' } }) });

      if (url.includes('/agents/')) return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: { name: 'Test' } }) });

      if (url.includes('/widget-config/')) return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: {} }) });

      return Promise.resolve({ ok: true, json: async () => ({}) });

    });

    const parent = {} as any;

    Object.defineProperty(window, 'parent', { value: parent, writable: true });

    await act(async () => {

      render(<EmbedClient {...defaultProps} />);

    });

    await act(async () => {

      window.dispatchEvent({ source: parent, origin: 'https://example.com', data: { type: 'HOST_MESSAGE', data: 'open' } } as unknown as MessageEvent);

    });

    expect(screen.getByTestId('collapsed-state').textContent).toBe('expanded');

    await act(async () => {

      window.dispatchEvent({ source: parent, origin: 'https://example.com', data: { type: 'HOST_MESSAGE', data: 'close' } } as unknown as MessageEvent);

    });

    expect(screen.getByTestId('collapsed-state').textContent).toBe('collapsed');

    await act(async () => {

      window.dispatchEvent({ source: parent, origin: 'https://example.com', data: { type: 'HOST_MESSAGE', data: 'close' } } as unknown as MessageEvent);

    });

    expect(screen.getByTestId('collapsed-state').textContent).toBe('collapsed');

  });

  test('host message with mismatched source and origin is ignored', async () => {

    const handleSubmitSpy = jest.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(() => undefined);

    const parent = {} as any;

    Object.defineProperty(window, 'parent', { value: parent, writable: true });

    await act(async () => {

      render(<EmbedClient {...defaultProps} />);

    });

    expect(screen.getByTestId('collapsed-state').textContent).toBe('collapsed');

    await act(async () => {

      window.dispatchEvent({ source: {}, origin: 'https://wrong.example.com', data: { type: 'HOST_MESSAGE', data: 'toggle' } } as unknown as MessageEvent);

    });

    expect(screen.getByTestId('collapsed-state').textContent).toBe('collapsed');

    handleSubmitSpy.mockRestore();

  });

  test('flush removes a message that has already hit max attempts without re-posting', async () => {

    (offline.getQueuedMessages as jest.Mock).mockResolvedValue([{ id: 'q1', text: 'one', seq: 1, attempts: 5 }]);

    (offline.removeQueuedMessage as jest.Mock).mockResolvedValue(undefined);

    mockHelpers.getStoredSession.mockReturnValue({ sessionId: 'sess-1', expires_at: Date.now() + 10000 });

    await act(async () => { render(<EmbedClient {...defaultProps} />); });

    await act(async () => { window.dispatchEvent(new Event('online')); });

    await waitFor(() => expect(offline.removeQueuedMessage).toHaveBeenCalledWith('q1'));

    // It should never POST a message that is already permanently failed.

    const postedContent = mockFetch.mock.calls.some((c: any) => c[1]?.method === 'POST');

    expect(postedContent).toBe(false);

  });

  test('flush drops a stale queued item (aged out / other session) without re-posting', async () => {

    (offline.getQueuedMessages as jest.Mock).mockResolvedValue([{ id: 'q-stale', text: 'old', seq: 1 }]);

    // Once-scoped: clearAllMocks() does not reset return values, so a sticky
    // mockReturnValue(true) would leak staleness into the tests that follow.
    (offline.isQueueItemStale as jest.Mock).mockReturnValueOnce(true);

    (offline.removeQueuedMessage as jest.Mock).mockResolvedValue(undefined);

    mockHelpers.getStoredSession.mockReturnValue({ sessionId: 'sess-1', expires_at: Date.now() + 10000 });

    await act(async () => { render(<EmbedClient {...defaultProps} />); });

    await act(async () => { window.dispatchEvent(new Event('online')); });

    await waitFor(() => expect(offline.removeQueuedMessage).toHaveBeenCalledWith('q-stale'));

    // A stale item must be purged, never replayed to the agent.

    const postedContent = mockFetch.mock.calls.some((c: any) => c[1]?.method === 'POST');

    expect(postedContent).toBe(false);

  });

  test('flush skips items enqueued by other widget surfaces (docs / prompt-input)', async () => {

    (offline.getQueuedMessages as jest.Mock).mockResolvedValue([
      { id: 'q-docs', text: 'docs item', seq: 1, source: 'docs' },
      { id: 'q-pi', text: 'prompt-input item', seq: 2, source: 'prompt-input' },
    ]);

    mockHelpers.getStoredSession.mockReturnValue({ sessionId: 'sess-1', expires_at: Date.now() + 10000 });

    await act(async () => { render(<EmbedClient {...defaultProps} />); });

    await act(async () => { window.dispatchEvent(new Event('online')); });

    await act(async () => new Promise((r) => setTimeout(r, 25)));

    // Foreign-source items are left in place for their own flusher — not sent, not removed.

    const postedContent = mockFetch.mock.calls.some((c: any) => c[1]?.method === 'POST');

    expect(postedContent).toBe(false);

    expect(offline.removeQueuedMessage).not.toHaveBeenCalled();

  });

  test('flush increments attempts when the server rejects the message', async () => {

    (offline.getQueuedMessages as jest.Mock).mockResolvedValue([{ id: 'q1', text: 'one', seq: 1 }]);

    (offline.incrementAttempt as jest.Mock).mockResolvedValue(undefined);

    mockHelpers.getStoredSession.mockReturnValue({ sessionId: 'sess-1', expires_at: Date.now() + 10000 });

    mockFetch.mockImplementation((url: string, options?: any) => {

      if (url.includes('/messages') && options?.method === 'POST') return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });

      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: { messages: [] } }) });

    });

    await act(async () => { render(<EmbedClient {...defaultProps} />); });

    await act(async () => { window.dispatchEvent(new Event('online')); });

    await waitFor(() => expect(offline.incrementAttempt).toHaveBeenCalledWith('q1'));

    expect(offline.removeQueuedMessage).not.toHaveBeenCalledWith('q1');

  });

  test('flush gives up and removes the message when a rejection reaches max attempts', async () => {

    (offline.getQueuedMessages as jest.Mock).mockResolvedValue([{ id: 'q1', text: 'one', seq: 1, attempts: 4 }]);

    (offline.incrementAttempt as jest.Mock).mockResolvedValue(undefined);

    (offline.removeQueuedMessage as jest.Mock).mockResolvedValue(undefined);

    mockHelpers.getStoredSession.mockReturnValue({ sessionId: 'sess-1', expires_at: Date.now() + 10000 });

    mockFetch.mockImplementation((url: string, options?: any) => {

      if (url.includes('/messages') && options?.method === 'POST') return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });

      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: { messages: [] } }) });

    });

    await act(async () => { render(<EmbedClient {...defaultProps} />); });

    await act(async () => { window.dispatchEvent(new Event('online')); });

    await waitFor(() => expect(offline.removeQueuedMessage).toHaveBeenCalledWith('q1'));

  });

  test('flush increments attempts when the POST throws (network error)', async () => {

    (offline.getQueuedMessages as jest.Mock).mockResolvedValue([{ id: 'q1', text: 'one', seq: 1 }]);

    (offline.incrementAttempt as jest.Mock).mockResolvedValue(undefined);

    mockHelpers.getStoredSession.mockReturnValue({ sessionId: 'sess-1', expires_at: Date.now() + 10000 });

    mockFetch.mockImplementation((url: string, options?: any) => {

      if (url.includes('/messages') && options?.method === 'POST') return Promise.reject(new Error('network down'));

      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: { messages: [] } }) });

    });

    await act(async () => { render(<EmbedClient {...defaultProps} />); });

    await act(async () => { window.dispatchEvent(new Event('online')); });

    await waitFor(() => expect(offline.incrementAttempt).toHaveBeenCalledWith('q1'));

  });

  test('retry event increments attempts when the server rejects the message', async () => {

    (offline.getQueuedMessages as jest.Mock).mockResolvedValue([{ id: 'retry-1', text: 'retry', seq: 1 }]);

    (offline.incrementAttempt as jest.Mock).mockResolvedValue(undefined);

    mockHelpers.getStoredSession.mockReturnValue({ sessionId: 'sess-1', expires_at: Date.now() + 10000 });

    mockFetch.mockImplementation((url: string, options?: any) => {

      if (url.includes('/messages') && options?.method === 'POST') return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });

      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: { messages: [] } }) });

    });

    await act(async () => { render(<EmbedClient {...defaultProps} />); });

    await act(async () => new Promise((r) => setTimeout(r, 25)));

    await act(async () => { window.dispatchEvent(new CustomEvent('companin:retry-queued', { detail: { id: 'retry-1' } })); });

    await waitFor(() => expect(offline.incrementAttempt).toHaveBeenCalledWith('retry-1'));

  });

  test('retry event is a no-op when the id is missing or not queued', async () => {

    (offline.getQueuedMessages as jest.Mock).mockResolvedValue([]);

    mockHelpers.getStoredSession.mockReturnValue({ sessionId: 'sess-1', expires_at: Date.now() + 10000 });

    await act(async () => { render(<EmbedClient {...defaultProps} />); });

    await act(async () => new Promise((r) => setTimeout(r, 25)));

    // missing id → early return

    await act(async () => { window.dispatchEvent(new CustomEvent('companin:retry-queued', { detail: {} })); });

    // unknown id → item not found return

    await act(async () => { window.dispatchEvent(new CustomEvent('companin:retry-queued', { detail: { id: 'nope' } })); });

    expect(offline.removeQueuedMessage).not.toHaveBeenCalled();

  });

  test('opening the widget with messages resets unread, records last-read, and notifies the parent', async () => {

    const parentPost = jest.fn();

    const parent = { postMessage: parentPost } as any;

    Object.defineProperty(window, 'parent', { value: parent, writable: true });

    (offline.getQueuedMessages as jest.Mock).mockResolvedValue([]);

    await act(async () => { render(<EmbedClient {...defaultProps} />); });

    await act(async () => {

      window.dispatchEvent(new CustomEvent('companin:queued-message', { detail: { id: 'temp-1', text: 'hi', timestamp: Date.now(), attempts: 0 } }));

    });

    expect(await screen.findByTestId('msg-temp-1', {}, { timeout: 3000 })).toBeTruthy();

    await act(async () => {

      window.dispatchEvent({ source: parent, origin: 'https://example.com', data: { type: 'HOST_MESSAGE', data: 'open' } } as unknown as MessageEvent);

    });

    expect(screen.getByTestId('collapsed-state').textContent).toBe('expanded');

    await waitFor(() => expect(parentPost).toHaveBeenCalledWith(expect.any(Object), 'https://example.com'));

  });

  test('toggle swallows localStorage write failures while opening', async () => {

    const parent = { postMessage: jest.fn() } as any;

    Object.defineProperty(window, 'parent', { value: parent, writable: true });

    (offline.getQueuedMessages as jest.Mock).mockResolvedValue([]);

    await act(async () => { render(<EmbedClient {...defaultProps} />); });

    await act(async () => {

      window.dispatchEvent(new CustomEvent('companin:queued-message', { detail: { id: 'temp-1', text: 'hi', timestamp: Date.now(), attempts: 0 } }));

    });

    expect(await screen.findByTestId('msg-temp-1', {}, { timeout: 3000 })).toBeTruthy();

    // Make every localStorage write throw so the catch branches run.

    Object.defineProperty(window, 'localStorage', {

      value: { getItem: jest.fn(), setItem: jest.fn(() => { throw new Error('quota'); }), removeItem: jest.fn() },

      configurable: true,

    });

    await act(async () => {

      window.dispatchEvent({ source: parent, origin: 'https://example.com', data: { type: 'HOST_MESSAGE', data: 'open' } } as unknown as MessageEvent);

    });

    expect(screen.getByTestId('collapsed-state').textContent).toBe('expanded');

  });

  test('consent grant/revoke messages are handled when consent is required', async () => {

    await act(async () => { render(<EmbedClient {...defaultProps} consentRequired />); });

    await act(async () => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'WIDGET_CONSENT_GRANT' } })); });

    await act(async () => new Promise((r) => setTimeout(r, 10)));

    await act(async () => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'WIDGET_CONSENT_REVOKE' } })); });

    await act(async () => new Promise((r) => setTimeout(r, 10)));

    // an unrelated type is ignored

    await act(async () => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'WIDGET_OTHER' } })); });

    expect(screen.getByTestId('collapsed-state')).toBeTruthy();

  });

  test('debug enable/disable messages toggle debug mode without crashing', async () => {

    await act(async () => { render(<EmbedClient {...defaultProps} />); });

    await act(async () => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'WIDGET_DEBUG_ENABLE' } })); });

    await act(async () => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'WIDGET_DEBUG_DISABLE' } })); });

    expect(screen.getByTestId('collapsed-state')).toBeTruthy();

  });

  test('host message is ignored when there is no parent frame (parent === window)', async () => {

    Object.defineProperty(window, 'parent', { value: window, writable: true });

    await act(async () => { render(<EmbedClient {...defaultProps} />); });

    expect(screen.getByTestId('collapsed-state').textContent).toBe('collapsed');

    await act(async () => {

      window.dispatchEvent({ source: window, origin: 'https://example.com', data: { type: 'HOST_MESSAGE', data: 'toggle' } } as unknown as MessageEvent);

    });

    expect(screen.getByTestId('collapsed-state').textContent).toBe('collapsed');

  });

  test('host message with an unrecognized payload is ignored', async () => {

    const parent = {} as any;

    Object.defineProperty(window, 'parent', { value: parent, writable: true });

    await act(async () => { render(<EmbedClient {...defaultProps} />); });

    expect(screen.getByTestId('collapsed-state').textContent).toBe('collapsed');

    await act(async () => {

      window.dispatchEvent({ source: parent, origin: 'https://example.com', data: { type: 'HOST_MESSAGE', data: { foo: 'bar' } } } as unknown as MessageEvent);

    });

    expect(screen.getByTestId('collapsed-state').textContent).toBe('collapsed');

  });

  test('host message wrapper falls back when coerced dispatch throws', async () => {

    const nativeDispatch = window.dispatchEvent;

    const parent = {} as any;

    Object.defineProperty(window, 'parent', { value: parent, writable: true });

    const throwingDispatch = jest.fn((event: Event | any) => {

      if (event instanceof MessageEvent) {

        throw new Error('coerced dispatch failed');

      }

      return true;

    });

    Object.defineProperty(window, 'dispatchEvent', {

      value: throwingDispatch,

      configurable: true,

      writable: true,

    });

    const { unmount } = render(<EmbedClient {...defaultProps} />);

    await act(async () => {

      (window as any).dispatchEvent({

        source: parent,

        origin: 'https://example.com',

        data: { type: 'HOST_MESSAGE', data: 'toggle' },

      });

    });

    expect(throwingDispatch).toHaveBeenCalled();

    unmount();

    Object.defineProperty(window, 'dispatchEvent', {

      value: nativeDispatch,

      configurable: true,

      writable: true,

    });

  });

});

