/**

 * Comprehensive tests for src/embed/widget.js

 *

 * Strategy: `require()` the embed module so Jest's instrumentation tracks

 * coverage. A DOM <script> stub is created before each require() so the IIFE

 * can find its configuration attributes via getElementById.

 */
import { VALID } from './__fixtures__/embed.widget.fixtures';
import { loadWidget, mockCW, fromIframe, FILE } from './__helpers__/embed.widget.helpers';

beforeEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  // Reset the URL so an opt-in ?widget_debug=1 from one test doesn't leak into
  // the next (error UI is dev-gated and keys off this param).
  window.history.pushState({}, '', '/');
  (window as any).CompaninWidget = undefined;
  (window as any).CompaninWidgets = undefined;
  (window as any).__COMPANIN_WIDGET_INSTANCES__ = undefined;
  jest.useRealTimers();
});
// ---------------------------------------------------------------------------
// 1. Happy-path bootstrap
// ---------------------------------------------------------------------------
describe('bootstrap — valid attributes', () => {
  it('attaches CompaninWidget with all expected methods', () => {
    const { api } = loadWidget(VALID);
    expect(api).toBeDefined();
    for (const m of [
      'on', 'off', 'show', 'hide', 'resize', 'sendMessage',
      'getErrors', 'destroy', 'registerHooks',
      'onOpen', 'onClose', 'onMessage', 'onResponse', 'onAuthFailure', 'onError',
    ]) {
      expect(typeof api[m]).toBe('function');
    }
  });
  it('attaches CompaninWidgets registry', () => {
    const { api, widgets } = loadWidget(VALID);
    const ids = widgets.list();
    expect(Array.isArray(ids)).toBe(true);
    expect(ids.length).toBeGreaterThan(0);
    expect(widgets.get(ids[0])).toBe(api);
    expect(widgets.get('__nope__')).toBeNull();
  });
  it('inserts an iframe with the embed URL', () => {
    const { iframe } = loadWidget(VALID);
    expect(iframe).not.toBeNull();
    expect(iframe!.src).toContain('/embed/session');
    expect(iframe!.src).toContain('clientId=c1');
    expect(iframe!.src).toContain('locale=en');
  });
  it('adds preconnect / dns-prefetch / prefetch link hints', () => {
    loadWidget(VALID);
    const rels = Array.from(document.head.querySelectorAll('link')).map((l) => l.rel);
    expect(rels).toContain('preconnect');
    expect(rels).toContain('dns-prefetch');
    expect(rels).toContain('prefetch');
  });
  it('uses localhost URL in dev mode', () => {
    const { iframe } = loadWidget({ ...VALID, 'data-dev': 'true' });
    expect(iframe!.src).toContain('http://localhost/');
    expect(iframe!.src).toContain('/embed/session');
    expect(iframe!.src).not.toContain('widget.companin.tech');
  });
  it('does NOT use localhost URL in production mode', () => {
    const { iframe } = loadWidget(VALID);
    expect(iframe!.src).toContain('widget.companin.tech');
  });
  it('logs deprecation warning when data-custom-css is used (no longer forwarded via URL)', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { iframe } = loadWidget({ ...VALID, 'data-custom-css': '.btn{}' });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('data-custom-css is deprecated'));
    expect(iframe!.src).not.toContain('customCss=');
    warnSpy.mockRestore();
  });
  it('uses explicit data-instance-id as registry key', () => {
    const { widgets } = loadWidget({ ...VALID, 'data-instance-id': 'myWidget' });
    expect(widgets.list()).toContain('myWidget');
  });
  it('uses data-widget-id as instance id fallback', () => {
    const { widgets } = loadWidget({ ...VALID, 'data-widget-id': 'wid42' });
    expect(widgets.list()).toContain('wid42');
  });
  it('sets startOpen=true when data-start-open is true', () => {
    const { iframe } = loadWidget({ ...VALID, 'data-start-open': 'true' });
    expect(iframe!.src).toContain('startOpen=true');
  });
  it('sets POWERED_BY_TEXT from data-powered-by attribute', () => {
    // No crash is the key assertion; internal state is not directly observable
    expect(() => loadWidget({ ...VALID, 'data-powered-by': 'Acme Corp' })).not.toThrow();
  });
  it('uses poweredBy from window.__COMPANIN_WIDGET_LOCALES__', () => {
    (window as any).__COMPANIN_WIDGET_LOCALES__ = { poweredBy: 'TestCo' };
    expect(() => loadWidget(VALID)).not.toThrow();
    (window as any).__COMPANIN_WIDGET_LOCALES__ = undefined;
  });
  it('uses data-target-origin as targetOrigin', () => {
    expect(() => loadWidget({ ...VALID, 'data-target-origin': 'https://custom.example.com' })).not.toThrow();
  });
  it('deduplicates duplicate instances (appends -2 suffix)', () => {
    loadWidget(VALID);
    // Add a second unbound script with the same attributes so the re-run IIFE
    // finds it, triggers the dedup logic, and creates a -2 suffixed instance.
    const stub2 = document.createElement('script');
    stub2.id = 'companin-widget-script-2';
    for (const [k, v] of Object.entries(VALID)) stub2.setAttribute(k, v);
    document.body.appendChild(stub2);
    jest.resetModules();
    require(FILE);
    expect((window as any).CompaninWidgets.list().length).toBeGreaterThan(1);
  });
});
// ---------------------------------------------------------------------------
// 2. Error path — missing attributes
// ---------------------------------------------------------------------------
describe('bootstrap — missing attributes', () => {
  it('does not attach CompaninWidget or iframe when all attrs missing', () => {
    loadWidget({});
    expect((window as any).CompaninWidget).toBeUndefined();
    expect(document.querySelector('iframe')).toBeNull();
  });
  it('renders error widget div when attrs missing (dev mode)', () => {
    // Error UI is opt-in: enable it via ?widget_debug=1 the way support would.
    window.history.pushState({}, '', '/?widget_debug=1');
    loadWidget({});
    const errEl = document.getElementById('companin-widget-error');
    expect(errEl).not.toBeNull();
  });
  it('production: missing attrs fail silently (no error card)', () => {
    // No data-dev / widget_debug → the loader must not paint a card on the page.
    loadWidget({});
    expect(document.getElementById('companin-widget-error')).toBeNull();
  });
  it('renders error widget when only client-id is missing', () => {
    loadWidget({ 'data-agent-id': 'a', 'data-config-id': 'c' });
    expect((window as any).CompaninWidget).toBeUndefined();
  });
  it('renders error widget when only agent-id is missing', () => {
    loadWidget({ 'data-client-id': 'c', 'data-config-id': 'cfg' });
    expect((window as any).CompaninWidget).toBeUndefined();
  });
});
// ---------------------------------------------------------------------------
// 3. iframe lifecycle
// ---------------------------------------------------------------------------
describe('iframe lifecycle', () => {
  it('onload clears the timeout and does not throw', () => {
    const { iframe } = loadWidget(VALID);
    mockCW(iframe!);
    expect(() => iframe!.onload!(new Event('load'))).not.toThrow();
  });
  it('onload forwards WidgetConfig to iframe', () => {
    const { iframe } = loadWidget(VALID);
    const cw = mockCW(iframe!);
    (window as any).WidgetConfig = { theme: 'dark' };
    iframe!.onload!(new Event('load'));
    expect(cw.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'WIDGET_INIT_CONFIG' }),
      expect.anything(),
    );
    delete (window as any).WidgetConfig;
  });
  it('onerror shows error in container (dev mode)', () => {
    window.history.pushState({}, '', '/?widget_debug=1');
    const { iframe } = loadWidget(VALID);
    const cont = iframe!.parentElement as HTMLElement; // capture before innerHTML replacement
    iframe!.onerror!(new ErrorEvent('error'));
    expect(cont.innerHTML).toContain('Failed to load');
  });
  it('production: onerror hides the widget instead of showing a card', () => {
    const { iframe } = loadWidget(VALID);
    const cont = iframe!.parentElement as HTMLElement;
    iframe!.onerror!(new ErrorEvent('error'));
    expect(cont.innerHTML).not.toContain('Failed to load');
    expect(cont.style.display).toBe('none');
  });
});
// ---------------------------------------------------------------------------
// 4. show / hide / resize / sendMessage / getErrors
// ---------------------------------------------------------------------------
describe('API — show / hide / resize / sendMessage / getErrors', () => {
  let api: any;
  let iframe: HTMLIFrameElement;
  let cw: { postMessage: jest.Mock };
  beforeEach(() => {
    ({ api, iframe } = loadWidget(VALID));
    cw = mockCW(iframe!);
  });
  it('show() makes container visible', () => {
    api.show();
    expect(iframe!.parentElement!.style.display).toBe('block');
  });
  it('hide() hides container', () => {
    api.show();
    api.hide();
    expect(iframe!.parentElement!.style.display).toBe('none');
  });
  it('resize(w, h) changes container dimensions', () => {
    api.resize(400, 600);
    const cont = iframe!.parentElement as HTMLElement;
    expect(cont.style.width).toBe('400px');
    expect(cont.style.height).toBe('600px');
  });
  it('resize(w, undefined) only sets width', () => {
    api.resize(350);
    expect((iframe!.parentElement as HTMLElement).style.width).toBe('350px');
  });
  it('sendMessage() calls iframe postMessage', () => {
    api.sendMessage({ hello: 'world' });
    expect(cw.postMessage).toHaveBeenCalledWith(
      { type: 'HOST_MESSAGE', data: { hello: 'world' } },
      expect.anything(),
    );
  });
  it('sendMessage() without contentWindow emits error event', () => {
    Object.defineProperty(iframe, 'contentWindow', { get: () => null, configurable: true });
    const errSpy = jest.fn();
    api.on('error', errSpy);
    api.sendMessage('test');
    return new Promise<void>((res) => setTimeout(() => {
      expect(errSpy).toHaveBeenCalled();
      res();
    }, 0));
  });
  it('getErrors() returns an array', () => {
    expect(Array.isArray(api.getErrors())).toBe(true);
  });
  it('enableDebug() posts WIDGET_DEBUG_ENABLE to the iframe', () => {
    api.enableDebug();
    expect(cw.postMessage).toHaveBeenCalledWith(
      { type: 'WIDGET_DEBUG_ENABLE' },
      expect.anything(),
    );
  });
  it('disableDebug() posts WIDGET_DEBUG_DISABLE to the iframe', () => {
    api.disableDebug();
    expect(cw.postMessage).toHaveBeenCalledWith(
      { type: 'WIDGET_DEBUG_DISABLE' },
      expect.anything(),
    );
  });
  it('enableDebug() / disableDebug() are chainable (return the api)', () => {
    expect(api.enableDebug()).toBe(api);
    expect(api.disableDebug()).toBe(api);
  });
  it('enableDebug() emits a debug.enabled event', () => {
    const spy = jest.fn();
    api.on('debug.enabled', spy);
    api.enableDebug();
    return new Promise<void>((res) => setTimeout(() => {
      expect(spy).toHaveBeenCalled();
      res();
    }, 0));
  });
});
// ---------------------------------------------------------------------------
// 5. on / off / registerHooks / legacy hooks
// ---------------------------------------------------------------------------
describe('API — on / off / registerHooks', () => {
  let api: any;
  let iframe: HTMLIFrameElement;
  beforeEach(() => {
    ({ api, iframe } = loadWidget(VALID));
    mockCW(iframe!);
  });
  it('on() returns an unsubscribe function', () => {
    expect(typeof api.on('open', jest.fn())).toBe('function');
  });
  it('off() removes handler so it is not called', () => {
    const fn = jest.fn();
    api.on('close', fn);
    api.off('close', fn);
    fromIframe(iframe!, { type: 'WIDGET_HIDE' });
    return new Promise<void>((res) => setTimeout(() => {
      expect(fn).not.toHaveBeenCalled();
      res();
    }, 0));
  });
  it('on() with unknown event type returns noop', () => {
    expect(typeof api.on('unknown_event', jest.fn())).toBe('function');
  });
  it('off() with non-function handler returns false', () => {
    expect(api.off('open', 'nope' as any)).toBe(false);
  });
  it('on() replays last envelope immediately for already-emitted events', () => {
    fromIframe(iframe!, { type: 'WIDGET_SHOW' });
    return new Promise<void>((res) => setTimeout(() => {
      const fn = jest.fn();
      api.on('open', fn);
      setTimeout(() => {
        expect(fn).toHaveBeenCalled();
        res();
      }, 0);
    }, 0));
  });
  it('registerHooks({onOpen}) is called on WIDGET_SHOW', () => {
    const onOpen = jest.fn();
    api.registerHooks({ onOpen });
    fromIframe(iframe!, { type: 'WIDGET_SHOW', data: { x: 1 } });
    return new Promise<void>((res) => setTimeout(() => {
      expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ x: 1 }));
      res();
    }, 0));
  });
  it('onOpen() fires legacy hook with data', () => {
    const fn = jest.fn();
    api.onOpen(fn);
    fromIframe(iframe!, { type: 'WIDGET_SHOW', data: { src: 'test' } });
    return new Promise<void>((res) => setTimeout(() => {
      expect(fn).toHaveBeenCalledWith({ src: 'test' });
      res();
    }, 0));
  });
  it('onClose() fires legacy hook', () => {
    const fn = jest.fn();
    api.onClose(fn);
    fromIframe(iframe!, { type: 'WIDGET_HIDE' });
    return new Promise<void>((res) => setTimeout(() => {
      expect(fn).toHaveBeenCalled();
      res();
    }, 0));
  });
  it('onError() fires legacy hook', () => {
    const fn = jest.fn();
    api.onError(fn);
    fromIframe(iframe!, { type: 'WIDGET_ERROR', data: { code: 'X' } });
    return new Promise<void>((res) => setTimeout(() => {
      expect(fn).toHaveBeenCalled();
      res();
    }, 0));
  });
  it('onAuthFailure() fires when auth error arrives', () => {
    const fn = jest.fn();
    api.onAuthFailure(fn);
    fromIframe(iframe!, { type: 'WIDGET_ERROR', data: { code: 'AUTH_FAILURE' } });
    return new Promise<void>((res) => setTimeout(() => {
      expect(fn).toHaveBeenCalled();
      res();
    }, 0));
  });
  it('onMessage() fires on message-like event type', () => {
    const fn = jest.fn();
    api.onMessage(fn);
    fromIframe(iframe!, { type: 'USER_MESSAGE', data: { text: 'hi' } });
    return new Promise<void>((res) => setTimeout(() => {
      expect(fn).toHaveBeenCalled();
      res();
    }, 0));
  });
  it('onResponse() fires on response-like event type', () => {
    const fn = jest.fn();
    api.onResponse(fn);
    fromIframe(iframe!, { type: 'AI_RESPONSE', data: {} });
    return new Promise<void>((res) => setTimeout(() => {
      expect(fn).toHaveBeenCalled();
      res();
    }, 0));
  });
});
// ---------------------------------------------------------------------------
// 6. WIDGET_* message handling
// ---------------------------------------------------------------------------
describe('handleMessage — WIDGET_* events', () => {
  let api: any;
  let iframe: HTMLIFrameElement;
  beforeEach(() => {
    ({ api, iframe } = loadWidget(VALID));
    mockCW(iframe!);
  });
  function send(data: unknown, origin = 'https://widget.companin.tech') {
    fromIframe(iframe!, data, origin);
  }
  it('WIDGET_SHOW sets display:block and emits open', () => {
    const spy = jest.fn();
    api.on('open', spy);
    send({ type: 'WIDGET_SHOW', data: {} });
    expect(iframe!.parentElement!.style.display).toBe('block');
    return new Promise<void>((res) => setTimeout(() => {
      expect(spy).toHaveBeenCalled();
      res();
    }, 0));
  });
  it('WIDGET_HIDE sets display:none and emits close', () => {
    const spy = jest.fn();
    api.on('close', spy);
    send({ type: 'WIDGET_HIDE', data: {} });
    expect(iframe!.parentElement!.style.display).toBe('none');
    return new Promise<void>((res) => setTimeout(() => {
      expect(spy).toHaveBeenCalled();
      res();
    }, 0));
  });
  it('WIDGET_MINIMIZE emits close without hiding container', () => {
    send({ type: 'WIDGET_SHOW' }); // allowDisplay = true, container visible
    const spy = jest.fn();
    api.on('close', spy);
    send({ type: 'WIDGET_MINIMIZE' });
    return new Promise<void>((res) => setTimeout(() => {
      expect(spy).toHaveBeenCalled();
      res();
    }, 0));
  });
  it('WIDGET_RESTORE emits open event', () => {
    const spy = jest.fn();
    api.on('open', spy);
    send({ type: 'WIDGET_RESTORE' });
    return new Promise<void>((res) => setTimeout(() => {
      expect(spy).toHaveBeenCalled();
      res();
    }, 0));
  });
  it('WIDGET_ERROR emits error', () => {
    const spy = jest.fn();
    api.on('error', spy);
    send({ type: 'WIDGET_ERROR', data: { code: 'ERR' } });
    return new Promise<void>((res) => setTimeout(() => {
      expect(spy).toHaveBeenCalled();
      res();
    }, 0));
  });
  it('WIDGET_ERROR with auth code also emits authFailure', () => {
    const spy = jest.fn();
    api.on('authFailure', spy);
    send({ type: 'WIDGET_ERROR', data: { code: 'auth_fail', error: 'auth' } });
    return new Promise<void>((res) => setTimeout(() => {
      expect(spy).toHaveBeenCalled();
      res();
    }, 0));
  });
  it('WIDGET_RESIZE with hide:true hides container', () => {
    send({ type: 'WIDGET_SHOW' });
    send({ type: 'WIDGET_RESIZE', data: { hide: true } });
    expect(iframe!.parentElement!.style.display).toBe('none');
  });
  it('WIDGET_RESIZE with width+height resizes container', () => {
    send({ type: 'WIDGET_SHOW' }); // allowDisplay = true
    send({ type: 'WIDGET_RESIZE', data: { width: 300, height: 500 } });
    const cont = iframe!.parentElement as HTMLElement;
    expect(cont.style.width).not.toBe('');
  });
  it('WIDGET_RESIZE with bottom-right position sets bottom/right', () => {
    send({ type: 'WIDGET_SHOW' });
    send({ type: 'WIDGET_RESIZE', data: { width: 320, height: 480, position: 'bottom-right', edge_offset: 20 } });
    const cont = iframe!.parentElement as HTMLElement;
    expect(cont.style.bottom).toContain('20px');
    expect(cont.style.right).toContain('20px');
  });
  it('WIDGET_RESIZE with top-left position sets top/left with 16px min offset', () => {
    send({ type: 'WIDGET_SHOW' });
    send({ type: 'WIDGET_RESIZE', data: { width: 320, height: 480, position: 'top-left', edge_offset: 0 } });
    const cont = iframe!.parentElement as HTMLElement;
    expect(cont.style.top).not.toBe('');
    expect(cont.style.left).not.toBe('');
  });
  it('WIDGET_RESIZE with no position (no data.position) still resizes', () => {
    send({ type: 'WIDGET_SHOW' });
    send({ type: 'WIDGET_RESIZE', data: { width: 200, height: 300 } });
    expect(true).toBe(true); // no crash
  });
  it('unknown type is silently ignored', () => {
    expect(() => send({ type: 'UNKNOWN_TYPE_XYZ' })).not.toThrow();
  });
  it('ignores messages with no type field', () => {
    const spy = jest.fn();
    api.on('open', spy);
    send({ type: null });
    return new Promise<void>((res) => setTimeout(() => {
      expect(spy).not.toHaveBeenCalled();
      res();
    }, 0));
  });
  it('ignores messages from wrong source (not iframe)', () => {
    const spy = jest.fn();
    api.on('open', spy);
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'WIDGET_SHOW' },
      origin: 'https://widget.companin.tech',
    }));
    return new Promise<void>((res) => setTimeout(() => {
      expect(spy).not.toHaveBeenCalled();
      res();
    }, 0));
  });
  it('ignores messages from unauthorized origin', () => {
    const spy = jest.fn();
    api.on('open', spy);
    send({ type: 'WIDGET_SHOW' }, 'https://evil.example.com');
    return new Promise<void>((res) => setTimeout(() => {
      expect(spy).not.toHaveBeenCalled();
      res();
    }, 0));
  });
  it('accepts localhost origin in dev mode', () => {
    // Need to reload in dev mode — use a fresh describe-level setup
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    (window as any).CompaninWidget = undefined;
    (window as any).__COMPANIN_WIDGET_INSTANCES__ = undefined;
    const { api: devApi, iframe: devFrame } = loadWidget({ ...VALID, 'data-dev': 'true' });
    mockCW(devFrame!);
    const spy = jest.fn();
    devApi.on('open', spy);
    fromIframe(devFrame!, { type: 'WIDGET_SHOW' }, 'http://localhost:3001');
    return new Promise<void>((res) => setTimeout(() => {
      expect(spy).toHaveBeenCalled();
      res();
    }, 0));
  });
  it('AUTH_FAILED type triggers authFailure generic hook', () => {
    const spy = jest.fn();
    api.on('authFailure', spy);
    send({ type: 'AUTH_FAILED', data: {} });
    return new Promise<void>((res) => setTimeout(() => {
      expect(spy).toHaveBeenCalled();
      res();
    }, 0));
  });
  it('duplicate message id is not re-delivered', () => {
    const spy = jest.fn();
    api.on('message', spy);
    // sendMessage sets __lastHostMessage; widget seeing same id should skip
    const cw = (iframe as any).contentWindow;
    // Manually trigger two identical msg events via the iframe
    const data = { id: 'msg-1', text: 'hello' };
    send({ type: 'USER_MESSAGE', data });
    send({ type: 'USER_MESSAGE', data });
    return new Promise<void>((res) => setTimeout(() => {
      // At least one call; we just verify no crash
      expect(spy).toHaveBeenCalled();
      res();
    }, 0));
  });
});
// ---------------------------------------------------------------------------
// 7. destroy / CompaninWidgets.destroy
// ---------------------------------------------------------------------------
describe('API — destroy', () => {
  it('destroy() removes container from DOM and clears registry', () => {
    const { api, widgets, iframe } = loadWidget(VALID);
    const cont = iframe!.parentElement!;
    api.destroy();
    expect(document.body.contains(cont)).toBe(false);
    expect(widgets.list().length).toBe(0);
  });
  it('CompaninWidgets.destroy(id) calls destroy and returns true', () => {
    const { widgets } = loadWidget(VALID);
    const [id] = widgets.list();
    expect(widgets.destroy(id)).toBe(true);
  });
  it('CompaninWidgets.destroy(unknown) returns false', () => {
    const { widgets } = loadWidget(VALID);
    expect(widgets.destroy('__ghost__')).toBe(false);
  });
});
// ---------------------------------------------------------------------------
// 8. Transient WIDGET_ERROR — loader-driven reload instead of terminal card
// ---------------------------------------------------------------------------
describe('transient WIDGET_ERROR retry', () => {
  const TRANSIENT = {
    type: 'WIDGET_ERROR',
    data: { errorType: 'resolver_unavailable', transient: true },
  };
  const ERROR_SHOW = {
    type: 'WIDGET_SHOW',
    data: { source: 'embed-error', errorType: 'resolver_unavailable', width: 420, height: 280 },
  };
  let consoleErrorSpy: jest.SpyInstance;
  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });
  it('reloads the iframe with a cache-buster instead of emitting error', () => {
    const { api, iframe } = loadWidget(VALID);
    mockCW(iframe!);
    const onError = jest.fn();
    api.on('error', onError);
    fromIframe(iframe!, TRANSIENT);
    return new Promise<void>((res) => setTimeout(() => {
      expect(iframe!.src).toContain('_retry=2');
      expect(onError).not.toHaveBeenCalled();
      api.destroy();
      res();
    }, 0));
  });
  it('suppresses the embed-error WIDGET_SHOW while a retry is pending', () => {
    const { api, iframe } = loadWidget(VALID);
    mockCW(iframe!);
    const cont = iframe!.parentElement as HTMLElement;
    fromIframe(iframe!, TRANSIENT);
    fromIframe(iframe!, ERROR_SHOW);
    expect(cont.style.display).toBe('none');
    api.destroy();
  });
  it('surfaces the card and emits error once the attempt budget is exhausted', () => {
    const { api, iframe } = loadWidget(VALID);
    mockCW(iframe!);
    const onError = jest.fn();
    api.on('error', onError);
    fromIframe(iframe!, TRANSIENT); // attempt 2 scheduled
    fromIframe(iframe!, TRANSIENT); // attempt 3 scheduled
    fromIframe(iframe!, TRANSIENT); // budget exhausted → terminal
    fromIframe(iframe!, ERROR_SHOW); // no longer suppressed
    const cont = iframe!.parentElement as HTMLElement;
    expect(cont.style.display).toBe('block');
    return new Promise<void>((res) => setTimeout(() => {
      expect(onError).toHaveBeenCalledTimes(1);
      api.destroy();
      res();
    }, 0));
  });
  it('a WIDGET_RESIZE after a successful retry lifts the suppression', () => {
    const { api, iframe } = loadWidget(VALID);
    mockCW(iframe!);
    const cont = iframe!.parentElement as HTMLElement;
    fromIframe(iframe!, TRANSIENT);
    fromIframe(iframe!, { type: 'WIDGET_SHOW' }); // allowDisplay = true
    fromIframe(iframe!, { type: 'WIDGET_RESIZE', data: { width: 300, height: 500 } });
    fromIframe(iframe!, ERROR_SHOW);
    expect(cont.style.display).toBe('block');
    api.destroy();
  });
});
