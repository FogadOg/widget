/**
 * Tests for the logged-in-user identify handshake in the docs widget's
 * useDialogState hook. When the host page sends a signed user JWT via
 * chat.identify({ token }) (or data-user-token, auto-forwarded on WIDGET_READY),
 * the hook must:
 *   1. re-auth with the user token to obtain a user-claimed visitor JWT,
 *   2. look up the user's existing session via /auth/sessions/by-user, and
 *   3. restore that session — all non-fatally (falls back to anonymous).
 */

import { renderHook, act } from '@testing-library/react';
import { useDialogState } from '../app/embed/docs/hooks/useDialogState';

// No stored session on mount → mount path calls createSession (a jest.fn, no
// network) rather than validateAndRestoreSession, so any validateAndRestoreSession
// call we observe comes from the identify handler under test.
jest.mock('../app/embed/docs/helpers', () => ({
  getStoredSession: jest.fn(() => null),
}));

const BASE = 'https://api.test.com';

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    open: false,
    setOpen: jest.fn(),
    parentOrigin: 'https://host.example',
    initialPreviewConfig: undefined,
    clientId: 'client-abc',
    agentId: 'agent-xyz',
    configId: 'config-123',
    sessionId: null,
    setSessionId: jest.fn(),
    setMessages: jest.fn(),
    setError: jest.fn(),
    setWidgetConfig: jest.fn(),
    widgetConfig: null,
    authError: null,
    embedHeaders: { 'X-Embed-Origin': 'https://host.example' },
    getAuthToken: jest.fn(async () => 'user-claimed-token'),
    fetchWidgetConfig: jest.fn(async () => ({})),
    createSession: jest.fn(async () => {}),
    validateAndRestoreSession: jest.fn(async () => {}),
    resolveParentOrigin: jest.fn(() => 'https://host.example'),
    messages: [],
    error: null,
    ...overrides,
  } as any;
}

function dispatchIdentify(token: unknown) {
  // origin must match makeProps().parentOrigin so the handler's
  // isTrustedParentMessage gate accepts the message (see beforeEach, which
  // makes window.parent !== window so we're treated as a framed widget).
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'HOST_MESSAGE', data: { action: 'identify', token } },
      origin: 'https://host.example',
    }),
  );
}

// Small helper so the async identify chain (awaited fetch + restore) settles.
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('useDialogState — logged-in user identify handshake', () => {
  const origParentDescriptor = Object.getOwnPropertyDescriptor(window, 'parent');
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_API_BASE_URL = BASE;
    // Simulate a framed widget so the handler's origin gate accepts host
    // messages (jsdom defaults window.parent === window, which the gate rejects).
    Object.defineProperty(window, 'parent', {
      value: { postMessage: jest.fn() },
      configurable: true,
    });
    (global.fetch as jest.Mock) = jest.fn(async () => ({
      ok: true,
      json: async () => ({ data: { session_id: 'existing-session-9' } }),
    }));
  });

  it('re-auths with the user token, looks up the by-user session, and restores it', async () => {
    const props = makeProps();
    renderHook(() => useDialogState(props));

    await act(async () => {
      dispatchIdentify('signed-user-jwt');
      await flush();
    });

    // 1. Re-auth carried the signed user token as the 3rd arg.
    expect(props.getAuthToken).toHaveBeenCalledWith(
      'client-abc',
      'https://host.example',
      'signed-user-jwt',
    );

    // 2. by-user lookup used the fresh user-claimed token + embed headers.
    const byUserCall = (global.fetch as jest.Mock).mock.calls.find((c) =>
      String(c[0]).includes('/auth/sessions/by-user'),
    );
    expect(byUserCall).toBeDefined();
    expect(byUserCall[1].headers.Authorization).toBe('Bearer user-claimed-token');
    expect(byUserCall[1].headers['X-Embed-Origin']).toBe('https://host.example');

    // 3. The returned session was restored with the fresh token.
    expect(props.validateAndRestoreSession).toHaveBeenCalledWith(
      'existing-session-9',
      'user-claimed-token',
    );
  });

  it('does not restore when the by-user lookup returns no session', async () => {
    (global.fetch as jest.Mock) = jest.fn(async () => ({
      ok: true,
      json: async () => ({ data: {} }),
    }));
    const props = makeProps();
    renderHook(() => useDialogState(props));

    await act(async () => {
      dispatchIdentify('signed-user-jwt');
      await flush();
    });

    expect(props.getAuthToken).toHaveBeenCalledWith(
      'client-abc',
      'https://host.example',
      'signed-user-jwt',
    );
    expect(props.validateAndRestoreSession).not.toHaveBeenCalled();
  });

  it('does not restore when the by-user lookup 404s', async () => {
    (global.fetch as jest.Mock) = jest.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({}),
    }));
    const props = makeProps();
    renderHook(() => useDialogState(props));

    await act(async () => {
      dispatchIdentify('signed-user-jwt');
      await flush();
    });

    expect(props.validateAndRestoreSession).not.toHaveBeenCalled();
  });

  it('is a no-op when the re-auth returns no token', async () => {
    const props = makeProps({ getAuthToken: jest.fn(async () => null) });
    renderHook(() => useDialogState(props));

    await act(async () => {
      dispatchIdentify('signed-user-jwt');
      await flush();
    });

    // Re-auth was attempted, but nothing downstream ran.
    expect(props.getAuthToken).toHaveBeenCalledWith(
      'client-abc',
      'https://host.example',
      'signed-user-jwt',
    );
    const byUserCall = (global.fetch as jest.Mock).mock.calls.find((c) =>
      String(c[0]).includes('/auth/sessions/by-user'),
    );
    expect(byUserCall).toBeUndefined();
    expect(props.validateAndRestoreSession).not.toHaveBeenCalled();
  });

  it('deduplicates repeat identify messages with the same token', async () => {
    const props = makeProps();
    renderHook(() => useDialogState(props));

    await act(async () => {
      dispatchIdentify('same-jwt');
      await flush();
      dispatchIdentify('same-jwt');
      await flush();
    });

    const identifyReauths = (props.getAuthToken as jest.Mock).mock.calls.filter(
      (c) => c[2] === 'same-jwt',
    );
    expect(identifyReauths).toHaveLength(1);
  });

  it('ignores identify messages without a token (no re-auth)', async () => {
    const props = makeProps();
    renderHook(() => useDialogState(props));

    await act(async () => {
      dispatchIdentify(undefined);
      await flush();
    });

    const identifyReauths = (props.getAuthToken as jest.Mock).mock.calls.filter(
      (c) => c.length >= 3 && typeof c[2] === 'string',
    );
    expect(identifyReauths).toHaveLength(0);
    expect(props.validateAndRestoreSession).not.toHaveBeenCalled();
  });

  it('stays non-fatal when re-auth throws', async () => {
    const props = makeProps({
      getAuthToken: jest.fn(async () => {
        throw new Error('network down');
      }),
    });
    renderHook(() => useDialogState(props));

    await expect(
      act(async () => {
        dispatchIdentify('signed-user-jwt');
        await flush();
      }),
    ).resolves.toBeUndefined();

    expect(props.validateAndRestoreSession).not.toHaveBeenCalled();
  });
});
