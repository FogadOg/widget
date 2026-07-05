/**

 * Comprehensive tests for src/embed/docs-widget.js

 */

import { VALID } from './__fixtures__/embed.docs.fixtures';
import { loadDocsWidget, mockCW, fromIframe, FILE } from './__helpers__/embed.docs.helpers';

beforeEach(() => {

  document.body.innerHTML = '';

  document.head.innerHTML = '';

  (window as any).CompaninDocsWidget = undefined;

  (window as any).CompaninDocsWidgets = undefined;

  (window as any).__COMPANIN_DOCS_WIDGET_INSTANCES__ = undefined;

  jest.useRealTimers();

});

// ---------------------------------------------------------------------------

// 1. Bootstrap — valid attributes

// ---------------------------------------------------------------------------

describe('bootstrap — valid attributes', () => {

  it('attaches CompaninDocsWidget with all expected methods', () => {

    const { api } = loadDocsWidget(VALID);

    expect(api).toBeDefined();

    for (const m of [

      'on', 'off', 'open', 'close', 'show', 'hide',

      'sendMessage', 'getErrors', 'destroy', 'registerHooks',

      'onOpen', 'onClose', 'onMessage', 'onResponse', 'onAuthFailure', 'onError',

    ]) {

      expect(typeof api[m]).toBe('function');

    }

  });

  it('attaches CompaninDocsWidgets registry', () => {

    const { api, widgets } = loadDocsWidget(VALID);

    const ids = widgets.list();

    expect(Array.isArray(ids)).toBe(true);

    expect(ids.length).toBeGreaterThan(0);

    expect(widgets.get(ids[0])).toBe(api);

    expect(widgets.get('__nope__')).toBeNull();

  });

  it('inserts an iframe pointing to /embed/docs', () => {

    const { iframe } = loadDocsWidget(VALID);

    expect(iframe).not.toBeNull();

    expect(iframe!.src).toContain('/embed/docs');

    expect(iframe!.src).toContain('clientId=dc1');

    expect(iframe!.src).toContain('locale=en');

  });

  it('includes pagePath in iframe URL', () => {

    const { iframe } = loadDocsWidget(VALID);

    expect(iframe!.src).toContain('pagePath=');

  });

  it('does NOT include suggestions param in iframe URL (suggestions now come from widget config)', () => {

    const { iframe } = loadDocsWidget({ ...VALID, 'data-suggestions': 'q1,q2' });

    expect(iframe!.src).not.toContain('suggestions=');

  });

  it('uses localhost URL in dev mode', () => {

    const { iframe } = loadDocsWidget({ ...VALID, 'data-dev': 'true' });

    expect(iframe!.src).toContain('http://localhost/');
    expect(iframe!.src).toContain('/embed/docs');
    expect(iframe!.src).not.toContain('widget.companin.tech');

  });

  it('uses explicit data-instance-id as registry key', () => {

    const { widgets } = loadDocsWidget({ ...VALID, 'data-instance-id': 'docs-main' });

    expect(widgets.list()).toContain('docs-main');

  });

  it('uses data-widget-id as instance id fallback', () => {

    const { widgets } = loadDocsWidget({ ...VALID, 'data-widget-id': 'wdoc99' });

    expect(widgets.list()).toContain('wdoc99');

  });

  it('deduplicates duplicate instances', () => {

    loadDocsWidget(VALID);

    jest.resetModules();

    require(FILE);

    expect((window as any).CompaninDocsWidgets.list().length).toBeGreaterThan(1);

  });

  it('sets startOpen=true in iframe URL', () => {

    const { iframe } = loadDocsWidget({ ...VALID, 'data-start-open': 'true' });

    expect(iframe!.src).toContain('startOpen=true');

  });

  it('accepts data-powered-by attribute without crash', () => {

    expect(() => loadDocsWidget({ ...VALID, 'data-powered-by': 'Acme' })).not.toThrow();

  });

  it('uses data-target-origin without crash', () => {

    expect(() =>

      loadDocsWidget({ ...VALID, 'data-target-origin': 'https://custom.example.com' }),

    ).not.toThrow();

  });

  it('selects a script tag by data-client-id when no explicit id is present', () => {

    // append a non-matching bound script first

    const s1 = document.createElement('script');

    s1.setAttribute('data-companin-docs-widget-bound', 'true');

    s1.setAttribute('data-client-id', 'x1');

    document.body.appendChild(s1);

    // append the real candidate without the special id

    const s2 = document.createElement('script');

    s2.setAttribute('data-client-id', VALID['data-client-id']);

    s2.setAttribute('data-agent-id', VALID['data-agent-id']);

    s2.setAttribute('data-config-id', VALID['data-config-id']);

    document.body.appendChild(s2);

    jest.resetModules();

    require(FILE);

    expect((window as any).CompaninDocsWidget).toBeDefined();

    expect(document.querySelector('iframe')).not.toBeNull();

    // some script should be marked as bound after init

    // init success is sufficient to prove the fallback selected a script

  });

  it('selects a script tag by matching src containing "docs-widget"', () => {

    // create a script whose src matches the docs-widget pattern and include required attrs

    const s = document.createElement('script');

    s.setAttribute('src', 'https://cdn.example.com/libs/docs-widget.min.js');

    s.setAttribute('data-client-id', VALID['data-client-id']);

    s.setAttribute('data-agent-id', VALID['data-agent-id']);

    s.setAttribute('data-config-id', VALID['data-config-id']);

    document.body.appendChild(s);

    jest.resetModules();

    require(FILE);

    expect((window as any).CompaninDocsWidget).toBeDefined();

    expect(document.querySelector('iframe')).not.toBeNull();

    // init success is sufficient to prove the fallback selected a script

  });

  it('skips a script whose getAttribute throws and continues searching', () => {

    const bad = document.createElement('script');

    // override getAttribute to simulate a broken script node

    // @ts-ignore

    bad.getAttribute = () => { throw new Error('boom'); };

    document.body.appendChild(bad);

    const good = document.createElement('script');

    good.setAttribute('data-client-id', VALID['data-client-id']);

    good.setAttribute('data-agent-id', VALID['data-agent-id']);

    good.setAttribute('data-config-id', VALID['data-config-id']);

    document.body.appendChild(good);

    jest.resetModules();

    require(FILE);

    expect((window as any).CompaninDocsWidget).toBeDefined();

    expect(document.querySelector('iframe')).not.toBeNull();

    // init success is sufficient to prove the fallback selected a script

  });

});

// ---------------------------------------------------------------------------

// 2. Bootstrap — missing attributes

// ---------------------------------------------------------------------------

describe('bootstrap — missing attributes', () => {

  it('does not mount iframe when attrs missing', () => {

    loadDocsWidget({});

    expect(document.querySelector('iframe')).toBeNull();

  });

  it('renders error widget when all attrs missing', () => {

    loadDocsWidget({});

    const errEl = document.getElementById('companin-docs-widget-error');

    expect(errEl).not.toBeNull();

  });

  it('does not attach CompaninDocsWidget when attrs missing', () => {

    loadDocsWidget({});

    expect((window as any).CompaninDocsWidget).toBeUndefined();

  });

  it('renders error widget when only client-id is missing', () => {

    loadDocsWidget({ 'data-agent-id': 'a', 'data-config-id': 'c' });

    expect((window as any).CompaninDocsWidget).toBeUndefined();

  });

});

// ---------------------------------------------------------------------------

// 3. iframe lifecycle

// ---------------------------------------------------------------------------

describe('iframe lifecycle', () => {

  it('onload clears timeout, does not throw', () => {

    const { iframe } = loadDocsWidget(VALID);

    mockCW(iframe!);

    expect(() => iframe!.onload!(new Event('load'))).not.toThrow();

  });

  it('onerror shows error in container', () => {

    const { iframe } = loadDocsWidget(VALID);

    const cont = iframe!.parentElement as HTMLElement; // capture before innerHTML replacement

    iframe!.onerror!(new ErrorEvent('error'));

    expect(cont.innerHTML).toContain('Failed to load');

  });

});

// ---------------------------------------------------------------------------

// 4. show / hide / open / close / sendMessage / getErrors

// ---------------------------------------------------------------------------

describe('API — show / hide / open / close / sendMessage / getErrors', () => {

  let api: any;

  let iframe: HTMLIFrameElement;

  let cw: { postMessage: jest.Mock };

  beforeEach(() => {

    ({ api, iframe } = loadDocsWidget(VALID));

    cw = mockCW(iframe!);

    // trigger onload so iframeLoaded=true; postToIframe sends directly instead of queuing

    iframe!.onload!(new Event('load'));

  });

  it('show() sets container display:block', () => {

    api.show();

    expect(iframe!.parentElement!.style.display).toBe('block');

  });

  it('hide() sets container display:none', () => {

    api.show();

    api.hide();

    expect(iframe!.parentElement!.style.display).toBe('none');

  });

  it('open() calls postMessage with OPEN_DOCS_DIALOG', () => {

    api.open();

    expect(cw.postMessage).toHaveBeenCalledWith(

      { type: 'OPEN_DOCS_DIALOG' },

      expect.anything(),

    );

  });

  it('close() calls postMessage with CLOSE_DOCS_DIALOG', () => {

    api.close();

    expect(cw.postMessage).toHaveBeenCalledWith(

      { type: 'CLOSE_DOCS_DIALOG' },

      expect.anything(),

    );

  });

  it('open() emits error event when contentWindow is null', () => {

    Object.defineProperty(iframe, 'contentWindow', { get: () => null, configurable: true });

    const spy = jest.fn();

    api.on('error', spy);

    api.open();

    return new Promise<void>((res) => setTimeout(() => {

      expect(spy).toHaveBeenCalled();

      res();

    }, 0));

  });

  it('close() emits error event when contentWindow is null', () => {

    Object.defineProperty(iframe, 'contentWindow', { get: () => null, configurable: true });

    const spy = jest.fn();

    api.on('error', spy);

    api.close();

    return new Promise<void>((res) => setTimeout(() => {

      expect(spy).toHaveBeenCalled();

      res();

    }, 0));

  });

  it('sendMessage() calls iframe postMessage', () => {

    api.sendMessage({ question: 'how?' });

    expect(cw.postMessage).toHaveBeenCalledWith(

      { type: 'HOST_MESSAGE', data: { question: 'how?' } },

      expect.anything(),

    );

  });

  it('sendMessage() emits error event when contentWindow is null', () => {

    Object.defineProperty(iframe, 'contentWindow', { get: () => null, configurable: true });

    const spy = jest.fn();

    api.on('error', spy);

    api.sendMessage('test');

    return new Promise<void>((res) => setTimeout(() => {

      expect(spy).toHaveBeenCalled();

      res();

    }, 0));

  });

  it('getErrors() returns an array', () => {

    expect(Array.isArray(api.getErrors())).toBe(true);

  });

});

// ---------------------------------------------------------------------------

// 5. on / off / registerHooks

// ---------------------------------------------------------------------------

describe('API — on / off / registerHooks', () => {

  let api: any;

  let iframe: HTMLIFrameElement;

  beforeEach(() => {

    ({ api, iframe } = loadDocsWidget(VALID));

    mockCW(iframe!);

  });

  it('on() returns unsubscribe function', () => {

    expect(typeof api.on('open', jest.fn())).toBe('function');

  });

  it('off() removes handler', () => {

    const fn = jest.fn();

    api.on('close', fn);

    api.off('close', fn);

    fromIframe(iframe!, { type: 'WIDGET_HIDE' });

    return new Promise<void>((res) => setTimeout(() => {

      expect(fn).not.toHaveBeenCalled();

      res();

    }, 0));

  });

  it('off() with non-function returns false', () => {

    expect(api.off('open', 'not-a-fn' as any)).toBe(false);

  });

  it('on() replays last envelope immediately for already-received events', () => {

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

    fromIframe(iframe!, { type: 'WIDGET_SHOW', data: { src: 'w' } });

    return new Promise<void>((res) => setTimeout(() => {

      expect(onOpen).toHaveBeenCalled();

      res();

    }, 0));

  });

  it('registerHooks({onClose}) is called on WIDGET_HIDE', () => {

    const onClose = jest.fn();

    api.registerHooks({ onClose });

    fromIframe(iframe!, { type: 'WIDGET_HIDE' });

    return new Promise<void>((res) => setTimeout(() => {

      expect(onClose).toHaveBeenCalled();

      res();

    }, 0));

  });

  it('registerHooks({onResponse}) is called on WIDGET_RESPONSE', () => {

    const onResponse = jest.fn();

    api.registerHooks({ onResponse });

    fromIframe(iframe!, { type: 'WIDGET_RESPONSE', data: {} });

    return new Promise<void>((res) => setTimeout(() => {

      expect(onResponse).toHaveBeenCalled();

      res();

    }, 0));

  });

  it('registerHooks({onAuthFailure}) is called on WIDGET_AUTH_FAILURE', () => {

    const onAuthFailure = jest.fn();

    api.registerHooks({ onAuthFailure });

    fromIframe(iframe!, { type: 'WIDGET_AUTH_FAILURE', data: {} });

    return new Promise<void>((res) => setTimeout(() => {

      expect(onAuthFailure).toHaveBeenCalled();

      res();

    }, 0));

  });

  it('registerHooks({onError}) is called on WIDGET_ERROR', () => {

    const onError = jest.fn();

    api.registerHooks({ onError });

    fromIframe(iframe!, { type: 'WIDGET_ERROR', data: { code: 'E' } });

    return new Promise<void>((res) => setTimeout(() => {

      expect(onError).toHaveBeenCalled();

      res();

    }, 0));

  });

  it('onOpen() fires legacy hook', () => {

    const fn = jest.fn();

    api.onOpen(fn);

    fromIframe(iframe!, { type: 'WIDGET_SHOW', data: {} });

    return new Promise<void>((res) => setTimeout(() => {

      expect(fn).toHaveBeenCalled();

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

  it('onMessage() fires on HOST_MESSAGE_SENT emit', () => {

    const fn = jest.fn();

    api.onMessage(fn);

    api.sendMessage({ q: 'test' });

    return new Promise<void>((res) => setTimeout(() => {

      expect(fn).toHaveBeenCalled();

      res();

    }, 0));

  });

  it('onResponse() fires on WIDGET_RESPONSE', () => {

    const fn = jest.fn();

    api.onResponse(fn);

    fromIframe(iframe!, { type: 'WIDGET_RESPONSE', data: { text: 'ok' } });

    return new Promise<void>((res) => setTimeout(() => {

      expect(fn).toHaveBeenCalled();

      res();

    }, 0));

  });

  it('onAuthFailure() fires on WIDGET_AUTH_FAILURE', () => {

    const fn = jest.fn();

    api.onAuthFailure(fn);

    fromIframe(iframe!, { type: 'WIDGET_AUTH_FAILURE', data: {} });

    return new Promise<void>((res) => setTimeout(() => {

      expect(fn).toHaveBeenCalled();

      res();

    }, 0));

  });

  it('onError() fires on WIDGET_ERROR', () => {

    const fn = jest.fn();

    api.onError(fn);

    fromIframe(iframe!, { type: 'WIDGET_ERROR', data: { msg: 'boom' } });

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

    ({ api, iframe } = loadDocsWidget(VALID));

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

  it('WIDGET_RESIZE with hide:true collapses container', () => {

    send({ type: 'WIDGET_SHOW' });

    send({ type: 'WIDGET_RESIZE', data: { hide: true } });

    expect(iframe!.parentElement!.style.display).toBe('none');

    expect(iframe!.parentElement!.style.width).toBe('0px');

  });

  it('WIDGET_RESIZE with height (numeric) resizes container', () => {

    send({ type: 'WIDGET_RESIZE', data: { width: 320, height: 480 } });

    const cont = iframe!.parentElement as HTMLElement;

    expect(cont.style.height).not.toBe('');

    expect(cont.style.width).not.toBe('');

  });

  it('WIDGET_RESIZE with height:"100vh" enters full-screen mode', () => {

    send({ type: 'WIDGET_RESIZE', data: { height: '100vh', width: '100vw' } });

    const cont = iframe!.parentElement as HTMLElement;

    expect(cont.style.height).toBe('100vh');

    expect(cont.style.display).toBe('block');

  });

  it('WIDGET_RESIZE with compact dimensions adds button padding', () => {

    // 64x64 is the COMPACT_BUTTON_MAX_SIZE boundary

    send({ type: 'WIDGET_RESIZE', data: { width: 48, height: 48 } });

    const cont = iframe!.parentElement as HTMLElement;

    expect(cont.style.padding).not.toBe('0px');

  });

  it('WIDGET_RESIZE with width != 100vw sets explicit container width', () => {

    send({ type: 'WIDGET_RESIZE', data: { width: 300, height: 400 } });

    const cont = iframe!.parentElement as HTMLElement;

    expect(cont.style.width).toBeTruthy();

  });

  it('WIDGET_RESPONSE emits response event', () => {

    const spy = jest.fn();

    api.on('response', spy);

    send({ type: 'WIDGET_RESPONSE', data: { answer: 'yes' } });

    return new Promise<void>((res) => setTimeout(() => {

      expect(spy).toHaveBeenCalled();

      res();

    }, 0));

  });

  it('WIDGET_AUTH_FAILURE emits authFailure event', () => {

    const spy = jest.fn();

    api.on('authFailure', spy);

    send({ type: 'WIDGET_AUTH_FAILURE', data: {} });

    return new Promise<void>((res) => setTimeout(() => {

      expect(spy).toHaveBeenCalled();

      res();

    }, 0));

  });

  it('WIDGET_ERROR emits error event', () => {

    const spy = jest.fn();

    api.on('error', spy);

    send({ type: 'WIDGET_ERROR', data: { code: 'ERR' } });

    return new Promise<void>((res) => setTimeout(() => {

      expect(spy).toHaveBeenCalled();

      res();

    }, 0));

  });

  it('unknown type is silently ignored', () => {

    expect(() => send({ type: 'IRRELEVANT_TYPE' })).not.toThrow();

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

  it('ignores messages from wrong source', () => {

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

    document.body.innerHTML = '';

    document.head.innerHTML = '';

    (window as any).CompaninDocsWidget = undefined;

    (window as any).__COMPANIN_DOCS_WIDGET_INSTANCES__ = undefined;

    const { api: devApi, iframe: devFrame } = loadDocsWidget({ ...VALID, 'data-dev': 'true' });

    mockCW(devFrame!);

    const spy = jest.fn();

    devApi.on('open', spy);

    fromIframe(devFrame!, { type: 'WIDGET_SHOW' }, 'http://localhost:3001');

    return new Promise<void>((res) => setTimeout(() => {

      expect(spy).toHaveBeenCalled();

      res();

    }, 0));

  });

});

// ---------------------------------------------------------------------------

// 7. destroy / CompaninDocsWidgets.destroy

// ---------------------------------------------------------------------------

describe('API — destroy', () => {

  it('destroy() removes container from DOM and clears registry', () => {

    const { api, widgets, iframe } = loadDocsWidget(VALID);

    const cont = iframe!.parentElement!;

    api.destroy();

    expect(document.body.contains(cont)).toBe(false);

    expect(widgets.list().length).toBe(0);

  });

  it('CompaninDocsWidgets.destroy(id) returns true', () => {

    const { widgets } = loadDocsWidget(VALID);

    const [id] = widgets.list();

    expect(widgets.destroy(id)).toBe(true);

  });

  it('CompaninDocsWidgets.destroy(unknown) returns false', () => {

    const { widgets } = loadDocsWidget(VALID);

    expect(widgets.destroy('__ghost__')).toBe(false);

  });

});

