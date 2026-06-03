/**
 * Tests for src/embed/handshake.ts
 *
 * Both the widget-side (createHandshake) and host-side (createHostHandshake)
 * utilities are exercised here.  The test environment is jsdom so that
 * window / MessageEvent are available.
 */

import { createHandshake, createHostHandshake } from '../src/embed/handshake';

// [handshake] warnings are suppressed globally in jest.setup.js to avoid noise
// from accumulated window.addEventListener listeners across tests.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fire a MessageEvent on the current window */
function dispatch(origin: string, data: unknown) {
  window.dispatchEvent(new MessageEvent('message', { origin, data }));
}

// ---------------------------------------------------------------------------
// createHandshake (widget-side)
// ---------------------------------------------------------------------------

describe('createHandshake (widget-side)', () => {
  const ALLOWED = 'https://host.example.com';

  let postMessageSpy: jest.SpyInstance;

  beforeEach(() => {
    // In jsdom window.parent === window, so spying on postMessage captures
    // window.parent.postMessage calls made inside sendReady / sendResize.
    postMessageSpy = jest.spyOn(window, 'postMessage').mockImplementation(() => {});
  });

  afterEach(() => {
    postMessageSpy.mockRestore();
  });

  it('exposes a 48-character hex handshake token', () => {
    const hs = createHandshake({ allowedOrigins: [ALLOWED] });
    expect(hs.handshakeToken).toMatch(/^[0-9a-f]{48}$/);
  });

  it('generates a unique token per instance', () => {
    const a = createHandshake({ allowedOrigins: [ALLOWED] });
    const b = createHandshake({ allowedOrigins: [ALLOWED] });
    expect(a.handshakeToken).not.toBe(b.handshakeToken);
  });

  it('sendReady posts a READY message with the token to parent', () => {
    const hs = createHandshake({ allowedOrigins: [ALLOWED] });
    hs.sendReady();
    expect(window.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'READY',
        handshakeToken: hs.handshakeToken,
      }),
      '*',
    );
  });

  it('sendReady includes a version field', () => {
    const hs = createHandshake({ allowedOrigins: [ALLOWED] });
    hs.sendReady();
    const call = (window.postMessage as jest.Mock).mock.calls[0][0];
    expect(call).toHaveProperty('version');
  });

  it('sendResize posts a RESIZE message with the given height to parent', () => {
    const hs = createHandshake({ allowedOrigins: [ALLOWED] });
    hs.sendResize(480);
    expect(window.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'RESIZE', height: 480 }),
      '*',
    );
  });

  it('fires a registered INIT handler when a valid INIT arrives from the allowed origin', () => {
    const hs = createHandshake({ allowedOrigins: [ALLOWED] });
    const handler = jest.fn();
    hs.on('INIT', handler);

    dispatch(ALLOWED, { type: 'INIT', handshakeToken: 'tok-abc', config: { agentId: 'x' } });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'INIT', handshakeToken: 'tok-abc' }),
    );
  });

  it('fires a PING handler when PING arrives from the allowed origin', () => {
    const hs = createHandshake({ allowedOrigins: [ALLOWED] });
    const handler = jest.fn();
    hs.on('PING', handler);

    dispatch(ALLOWED, { type: 'PING' });

    expect(handler).toHaveBeenCalled();
  });

  it('fires multiple handlers registered for the same type', () => {
    const hs = createHandshake({ allowedOrigins: [ALLOWED] });
    const h1 = jest.fn();
    const h2 = jest.fn();
    hs.on('PING', h1);
    hs.on('PING', h2);

    dispatch(ALLOWED, { type: 'PING' });

    expect(h1).toHaveBeenCalled();
    expect(h2).toHaveBeenCalled();
  });

  it('rejects messages from disallowed origins with a warning', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const hs = createHandshake({ allowedOrigins: [ALLOWED] });
    const handler = jest.fn();
    hs.on('INIT', handler);

    dispatch('https://evil.example.com', { type: 'INIT', handshakeToken: 't', config: {} });

    expect(handler).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      '[handshake] Rejected message from origin:',
      'https://evil.example.com',
    );
    warnSpy.mockRestore();
  });

  it('rejects messages with invalid schema (missing type) with a warning', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const hs = createHandshake({ allowedOrigins: [ALLOWED] });
    const handler = jest.fn();
    hs.on('INIT', handler);

    dispatch(ALLOWED, { notAType: 'nope' });

    expect(handler).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('[handshake] Rejected invalid message schema');
    warnSpy.mockRestore();
  });

  it('rejects null data with a warning', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const hs = createHandshake({ allowedOrigins: [ALLOWED] });
    const handler = jest.fn();
    hs.on('INIT', handler);

    dispatch(ALLOWED, null);

    expect(handler).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('rejects non-object primitive data with a warning', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const hs = createHandshake({ allowedOrigins: [ALLOWED] });
    const handler = jest.fn();
    hs.on('INIT', handler);

    dispatch(ALLOWED, 'just a string');

    expect(handler).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('rejects unknown type strings with a warning', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const hs = createHandshake({ allowedOrigins: [ALLOWED] });
    const handler = jest.fn();
    hs.on('INIT', handler);

    dispatch(ALLOWED, { type: 'UNKNOWN_TYPE' });

    expect(handler).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('does not throw when a valid message arrives for a type with no registered handlers', () => {
    const hs = createHandshake({ allowedOrigins: [ALLOWED] }); // no on() calls
    expect(() => dispatch(ALLOWED, { type: 'RESIZE', height: 100 })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// createHostHandshake (host-side)
// ---------------------------------------------------------------------------

describe('createHostHandshake (host-side)', () => {
  const WIDGET_ORIGIN = 'https://widget.example.com';
  let iframe: HTMLIFrameElement;
  let iframePostMessage: jest.Mock;

  beforeEach(() => {
    iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    // jsdom iframe.contentWindow is real; override postMessage so we can assert
    iframePostMessage = jest.fn();
    Object.defineProperty(iframe, 'contentWindow', {
      configurable: true,
      writable: true,
      value: { postMessage: iframePostMessage },
    });
  });

  afterEach(() => {
    document.body.removeChild(iframe);
    // Do NOT call jest.restoreAllMocks() — that would undo the file-level
    // console.warn suppressor. Individual per-test spies restore themselves.
  });

  it('sendInit posts an INIT message to the iframe at widgetOrigin', () => {
    const hs = createHostHandshake({ iframe, widgetOrigin: WIDGET_ORIGIN });
    hs.sendInit('tok-host', { agentId: 'a1' });

    expect(iframePostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'INIT',
        handshakeToken: 'tok-host',
        config: { agentId: 'a1' },
      }),
      WIDGET_ORIGIN,
    );
  });

  it('fires READY handler when READY arrives from widgetOrigin', () => {
    const hs = createHostHandshake({ iframe, widgetOrigin: WIDGET_ORIGIN });
    const handler = jest.fn();
    hs.on('READY', handler);

    dispatch(WIDGET_ORIGIN, { type: 'READY', handshakeToken: 'ht', version: '1' });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'READY', handshakeToken: 'ht' }),
    );
  });

  it('fires RESIZE handler when RESIZE arrives from widgetOrigin', () => {
    const hs = createHostHandshake({ iframe, widgetOrigin: WIDGET_ORIGIN });
    const handler = jest.fn();
    hs.on('RESIZE', handler);

    dispatch(WIDGET_ORIGIN, { type: 'RESIZE', height: 750 });

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ height: 750 }));
  });

  it('fires ERROR handler when ERROR arrives from widgetOrigin', () => {
    const hs = createHostHandshake({ iframe, widgetOrigin: WIDGET_ORIGIN });
    const handler = jest.fn();
    hs.on('ERROR', handler);

    dispatch(WIDGET_ORIGIN, { type: 'ERROR', code: 'INIT_TIMEOUT', detail: 'timed out' });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INIT_TIMEOUT', detail: 'timed out' }),
    );
  });

  it('rejects messages from wrong origin (silently)', () => {
    const hs = createHostHandshake({ iframe, widgetOrigin: WIDGET_ORIGIN });
    const handler = jest.fn();
    hs.on('READY', handler);

    dispatch('https://evil.example.com', { type: 'READY', handshakeToken: 'ht', version: '1' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects invalid schema from the widget origin (silently)', () => {
    const hs = createHostHandshake({ iframe, widgetOrigin: WIDGET_ORIGIN });
    const handler = jest.fn();
    hs.on('READY', handler);

    dispatch(WIDGET_ORIGIN, { badField: true });

    expect(handler).not.toHaveBeenCalled();
  });

  it('does not crash when an unsubscribed message type arrives', () => {
    const hs = createHostHandshake({ iframe, widgetOrigin: WIDGET_ORIGIN });
    expect(() =>
      dispatch(WIDGET_ORIGIN, { type: 'PONG' }),
    ).not.toThrow();
  });
});
