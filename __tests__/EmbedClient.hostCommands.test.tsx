import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import EmbedClient from '../app/embed/session/EmbedClient';
import * as helpers from '../app/embed/session/helpers';
import * as offline from '../src/lib/offline';
import { defaultProps } from './__fixtures__/EmbedClient.handlers.fixtures';

jest.mock('../app/embed/session/helpers');
jest.mock('../app/embed/session/events', () => ({ onInitConfig: jest.fn(() => ({ remove: jest.fn() })) }));
jest.mock('../hooks/useWidgetAuth');
jest.mock('../hooks/useWidgetTranslation');
jest.mock('../src/lib/offline');

const mockHelpers = helpers as jest.Mocked<typeof helpers>;

// Minimal shell that exposes the state the host commands mutate: messages,
// collapsed state, and the composer input (for prefill).
jest.mock('../components/EmbedShell', () => {
  return function MockEmbedShell(props: any) {
    return (
      <div>
        <div data-testid="collapsed-state">{props.isCollapsed ? 'collapsed' : 'expanded'}</div>
        <div data-testid="composer-input">{props.input}</div>
        <div data-testid="messages-list">
          {props.messages.map((m: any) => (
            <div key={m.id} data-testid={`msg-${m.id}`}>{m.text}</div>
          ))}
        </div>
      </div>
    );
  };
});
jest.mock('../components/FeedbackDialog', () => () => <div />);

function hostEvent(parent: any, data: unknown) {
  return {
    source: parent,
    origin: 'https://example.com',
    data: { type: 'HOST_MESSAGE', data },
  } as unknown as MessageEvent;
}

describe('EmbedClient host commands', () => {
  let mockFetch: jest.Mock;
  let parent: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockHelpers.sessionStorageKey.mockReturnValue('skey');
    mockHelpers.sessionStorageKeyForLocale.mockReturnValue('skey');
    mockHelpers.unreadStorageKey.mockReturnValue('ukey');
    mockHelpers.lastReadStorageKey.mockReturnValue('lkey');
    mockHelpers.getVisitorId.mockReturnValue('vid');
    mockHelpers.getPageContext.mockReturnValue({ url: 'u' } as any);
    mockHelpers.getStoredSession.mockReturnValue(null);
    mockHelpers.storeSession.mockImplementation(() => {});
    mockHelpers.isStorageAvailable.mockReturnValue(true);
    const useWidgetAuth = require('../hooks/useWidgetAuth').useWidgetAuth;
    useWidgetAuth.mockReturnValue({
      getAuthToken: jest.fn().mockResolvedValue('token'),
      authToken: 'token',
      authError: null,
    });
    const useWidgetTranslation = require('../hooks/useWidgetTranslation').useWidgetTranslation;
    useWidgetTranslation.mockReturnValue({ translations: {}, locale: 'en' });
    (offline.getQueuedMessages as jest.Mock).mockResolvedValue([]);
    (offline.isOnline as jest.Mock).mockReturnValue(true);
    (offline.isQueueItemStale as jest.Mock).mockReturnValue(false);

    const withHeaders = (body: unknown) => ({
      ok: true,
      headers: { get: () => null },
      json: async () => body,
    });
    mockFetch = jest.fn((url: string, options?: any) => {
      if (url.includes('/agents/')) return Promise.resolve(withHeaders({ status: 'success', data: { name: 'Test' } }));
      if (url.includes('/widget-config/')) return Promise.resolve(withHeaders({ status: 'success', data: {} }));
      if (url.includes('/auth/sessions/by-user')) return Promise.resolve(withHeaders({ status: 'success', data: { session_id: 'sess-user' } }));
      if (url.includes('/messages') && options?.method === 'POST') {
        const sent = JSON.parse(options.body || '{}');
        return Promise.resolve(withHeaders({
          status: 'success',
          data: {
            user_message: { id: `srv-u-${sent.content}`, content: sent.content, created_at: new Date().toISOString() },
            assistant_message: { id: `srv-a-${sent.content}`, content: 'the reply', created_at: new Date().toISOString(), metadata: {} },
          },
        }));
      }
      if (url.includes('/messages')) return Promise.resolve(withHeaders({ status: 'success', data: { messages: [] } }));
      if (url.includes('/sessions') && options?.method === 'POST') return Promise.resolve(withHeaders({ status: 'success', data: { session_id: 'sess-1' } }));
      return Promise.resolve(withHeaders({ status: 'success', data: {} }));
    });
    (global as any).fetch = mockFetch;

    parent = { postMessage: jest.fn() };
    Object.defineProperty(window, 'parent', { value: parent, writable: true });
  });

  test('reset clears the conversation and notifies the parent it closed', async () => {
    await act(async () => { render(<EmbedClient {...defaultProps} />); });
    await act(async () => {
      window.dispatchEvent(new CustomEvent('companin:queued-message', {
        detail: { id: 'temp-1', text: 'hi', timestamp: Date.now(), attempts: 0 },
      }));
    });
    expect(await screen.findByTestId('msg-temp-1')).toBeTruthy();

    await act(async () => { window.dispatchEvent(hostEvent(parent, { action: 'reset' })); });

    expect(screen.queryByTestId('msg-temp-1')).toBeNull();
    await waitFor(() => {
      expect(parent.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'WIDGET_CONVERSATION_CLOSED' }),
        'https://example.com',
      );
    });
  });

  test('reset also works via the plain-string command form', async () => {
    await act(async () => { render(<EmbedClient {...defaultProps} />); });
    await act(async () => {
      window.dispatchEvent(new CustomEvent('companin:queued-message', {
        detail: { id: 'temp-2', text: 'hi', timestamp: Date.now(), attempts: 0 },
      }));
    });
    expect(await screen.findByTestId('msg-temp-2')).toBeTruthy();
    await act(async () => { window.dispatchEvent(hostEvent(parent, 'reset')); });
    expect(screen.queryByTestId('msg-temp-2')).toBeNull();
  });

  test('prefill puts the provided text into the composer', async () => {
    await act(async () => { render(<EmbedClient {...defaultProps} />); });
    await act(async () => {
      window.dispatchEvent(hostEvent(parent, { action: 'prefill', text: 'pre-filled question' }));
    });
    expect(screen.getByTestId('composer-input').textContent).toBe('pre-filled question');
  });

  test('prefill without text is a no-op', async () => {
    await act(async () => { render(<EmbedClient {...defaultProps} />); });
    await act(async () => {
      window.dispatchEvent(hostEvent(parent, { action: 'prefill' }));
    });
    expect(screen.getByTestId('composer-input').textContent).toBe('');
  });

  test('context merges extra page context without crashing', async () => {
    await act(async () => { render(<EmbedClient {...defaultProps} />); });
    await act(async () => {
      window.dispatchEvent(hostEvent(parent, { action: 'context', plan: 'pro', accountId: 'acct-1' }));
    });
    // Non-object payload branch
    await act(async () => {
      window.dispatchEvent(hostEvent(parent, { action: 'context', data: null }));
    });
    expect(screen.getByTestId('collapsed-state')).toBeTruthy();
  });

  test('identify stores the user, notifies the parent, and restores the user session from a signed token', async () => {
    const getAuthToken = jest.fn().mockResolvedValue('user-claimed-token');
    const useWidgetAuth = require('../hooks/useWidgetAuth').useWidgetAuth;
    useWidgetAuth.mockReturnValue({ getAuthToken, authToken: 'token', authError: null });

    await act(async () => { render(<EmbedClient {...defaultProps} />); });
    await act(async () => {
      window.dispatchEvent(hostEvent(parent, {
        action: 'identify',
        token: 'signed-user-jwt',
        userId: 'u-1',
        email: 'user@example.com',
        name: 'Jane',
        metadata: { plan: 'pro' },
      }));
    });

    await waitFor(() => {
      expect(parent.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'WIDGET_USER_UPDATED',
          data: expect.objectContaining({ userId: 'u-1', email: 'user@example.com', name: 'Jane' }),
        }),
        'https://example.com',
      );
    });
    // Re-auth flow: token exchange, then user-session lookup.
    await waitFor(() => {
      expect(getAuthToken).toHaveBeenCalledWith('c1', 'https://example.com', 'signed-user-jwt');
      expect(mockFetch.mock.calls.some(([u]: [string]) => String(u).includes('/auth/sessions/by-user'))).toBe(true);
    });
  });

  test('identify without a token updates the user without re-authenticating', async () => {
    const getAuthToken = jest.fn().mockResolvedValue('token');
    const useWidgetAuth = require('../hooks/useWidgetAuth').useWidgetAuth;
    useWidgetAuth.mockReturnValue({ getAuthToken, authToken: 'token', authError: null });

    await act(async () => { render(<EmbedClient {...defaultProps} />); });
    const callsBefore = getAuthToken.mock.calls.length;
    await act(async () => {
      window.dispatchEvent(hostEvent(parent, { action: 'identify', id: 'u-2', name: 'Bob' }));
    });
    await waitFor(() => {
      expect(parent.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'WIDGET_USER_UPDATED' }),
        'https://example.com',
      );
    });
    // No signed token → no extra auth round-trip beyond bootstrap's own calls.
    expect(getAuthToken.mock.calls.length).toBe(callsBefore);
    expect(mockFetch.mock.calls.some(([u]: [string]) => String(u).includes('/auth/sessions/by-user'))).toBe(false);
  });

  test('identify with no recognizable user fields posts a null-safe user update', async () => {
    await act(async () => { render(<EmbedClient {...defaultProps} />); });
    await act(async () => {
      window.dispatchEvent(hostEvent(parent, { action: 'identify', email: 42, name: 42, metadata: 'not-an-object' }));
    });
    await waitFor(() => {
      expect(parent.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'WIDGET_USER_UPDATED',
          data: { userId: null, email: null, name: null, metadata: null },
        }),
        'https://example.com',
      );
    });
  });

  test('a host text command submits once and dedupes an identical repeat within 1.2s', async () => {
    mockHelpers.getStoredSession.mockReturnValue({ sessionId: 'sess-1', expires_at: Date.now() + 100000 } as any);
    await act(async () => { render(<EmbedClient {...defaultProps} />); });
    // Open the widget so bootstrap phase 2 restores the stored session.
    await act(async () => { window.dispatchEvent(hostEvent(parent, 'open')); });
    await act(async () => new Promise((r) => setTimeout(r, 50)));

    await act(async () => { window.dispatchEvent(hostEvent(parent, { text: 'hello from host' })); });
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    await act(async () => { window.dispatchEvent(hostEvent(parent, { text: 'hello from host' })); });
    await act(async () => new Promise((r) => setTimeout(r, 50)));

    const bubbles = await screen.findAllByText('hello from host', {}, { timeout: 3000 });
    expect(bubbles).toHaveLength(1);
    // Only one POST left the widget for the duplicated command.
    const posts = mockFetch.mock.calls.filter(([u, i]: any[]) => String(u).includes('/messages') && i?.method === 'POST');
    expect(posts).toHaveLength(1);

    // A different text is not deduped — it goes out as its own message.
    await act(async () => { window.dispatchEvent(hostEvent(parent, { text: 'a different question' })); });
    await screen.findAllByText('a different question', {}, { timeout: 3000 });
    const postsAfter = mockFetch.mock.calls.filter(([u, i]: any[]) => String(u).includes('/messages') && i?.method === 'POST');
    expect(postsAfter).toHaveLength(2);
  });

  test('stored flow responses are restored for the active session and persisted back', async () => {
    mockHelpers.getStoredSession.mockReturnValue({ sessionId: 'sess-1', expires_at: Date.now() + 100000 } as any);
    mockHelpers.flowResponsesStorageKey.mockReturnValue('flow-key-sess-1');
    const storedFlows = [{ flowId: 'f1', stepId: 's1', value: 'yes', timestamp: 1 }];
    localStorage.setItem('flow-key-sess-1', JSON.stringify(storedFlows));

    await act(async () => { render(<EmbedClient {...defaultProps} />); });
    // Open so bootstrap restores the stored session (flow restore keys off sessionId).
    await act(async () => { window.dispatchEvent(hostEvent(parent, 'open')); });
    await act(async () => new Promise((r) => setTimeout(r, 50)));

    // The restore effect re-persists the responses under the same key.
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('flow-key-sess-1') || '[]')).toEqual(storedFlows);
    });
    localStorage.removeItem('flow-key-sess-1');
  });

  test('repeating identify with the same signed token does not re-authenticate', async () => {
    const getAuthToken = jest.fn().mockResolvedValue('user-claimed-token');
    const useWidgetAuth = require('../hooks/useWidgetAuth').useWidgetAuth;
    useWidgetAuth.mockReturnValue({ getAuthToken, authToken: 'token', authError: null });

    await act(async () => { render(<EmbedClient {...defaultProps} />); });
    const identify = { action: 'identify', token: 'signed-user-jwt', name: 'Jane' };
    await act(async () => { window.dispatchEvent(hostEvent(parent, identify)); });
    await waitFor(() => {
      expect(getAuthToken).toHaveBeenCalledWith('c1', 'https://example.com', 'signed-user-jwt');
    });
    const callsAfterFirst = getAuthToken.mock.calls.length;

    await act(async () => { window.dispatchEvent(hostEvent(parent, identify)); });
    await act(async () => new Promise((r) => setTimeout(r, 25)));
    // Same token → the re-auth branch is skipped the second time.
    expect(getAuthToken.mock.calls.length).toBe(callsAfterFirst);
  });
});
