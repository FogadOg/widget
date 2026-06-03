/* global jest, describe, test, expect, beforeEach, afterEach */

describe('docs-widget edge cases', () => {

  beforeEach(() => {

    jest.useRealTimers();

    jest.resetModules();

    // clean DOM and restore common document properties

    document.documentElement.innerHTML = '<head></head><body></body>';

    try {

      Object.defineProperty(document, 'body', { value: document.getElementsByTagName('body')[0], configurable: true, writable: true });

    } catch (e) {

      // ignore - jsdom may already have body

    }

    try {

      Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true });

    } catch (e) {}

  });

  function addBootScript(attrs: Record<string, string>) {

    const s = document.createElement('script');

    Object.keys(attrs).forEach((k) => s.setAttribute(k, attrs[k]));

    document.head.appendChild(s);

    return s;

  }

  test('schedules initWidget on DOMContentLoaded when body missing', async () => {

    // Simulate missing body and loading readyState

    Object.defineProperty(document, 'body', { value: null, configurable: true });

    Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true });

    addBootScript({ 'data-client-id': 'c', 'data-agent-id': 'a', 'data-config-id': 'cfg' });

    // load the script (it should early-return but attach DOMContentLoaded listener)

    require('../src/embed/docs-widget.js');

    // restore body and fire DOMContentLoaded so initWidget runs

    const b = document.createElement('body');

    Object.defineProperty(document, 'body', { value: b, configurable: true });

    document.dispatchEvent(new Event('DOMContentLoaded'));

    // allow async callbacks to run

    await new Promise((r) => setTimeout(r, 0));

    const widget = (window as any).CompaninDocsWidget;

    expect(widget).toBeDefined();

    const errors = widget.getErrors();

    expect(errors.some((e: any) => /Document body not ready/.test(e.message))).toBe(true);

  });

  test('iframe load timeout logs error and shows error in container (via onerror)', async () => {

    // Instead of waiting 15s, trigger the iframe.onerror handler directly.

    addBootScript({ 'data-client-id': 'c2', 'data-agent-id': 'a2', 'data-config-id': 'cfg2' });

    require('../src/embed/docs-widget.js');

    // allow init synchronous tasks to run

    await new Promise((r) => setTimeout(r, 0));

    const widget = (window as any).CompaninDocsWidget;

    const container = document.querySelector('[id^="companin-docs-widget-container-"]');

    expect(container).not.toBeNull();

    const iframe = (container as HTMLElement).querySelector('iframe') as HTMLIFrameElement;

    // call the onerror handler as if the iframe failed to load

    if ((iframe as any).onerror) (iframe as any).onerror(new Error('fake'));

    // allow synchronous error handling to run

    await new Promise((r) => setTimeout(r, 0));

    const errors = widget.getErrors();

    expect(errors.some((e: any) => /Docs widget iframe failed to load/.test(e.message))).toBe(true);

    const c = container as HTMLElement;

    expect(c.innerHTML).toContain('Failed to load docs widget.');

  });

  test('debounce queues pending message and fires after timer', async () => {

    // Use real timers here to avoid fake-timer interaction with Date.now()

    addBootScript({ 'data-client-id': 'c3', 'data-agent-id': 'a3', 'data-config-id': 'cfg3' });

    require('../src/embed/docs-widget.js');

    const widget = (window as any).CompaninDocsWidget;

    const handler = jest.fn();

    widget.on('message', handler);

    // first call

    widget.sendMessage({ x: 1 });

    // allow immediate callback

    await new Promise((r) => setTimeout(r, 10));

    // second call within debounce window should be queued

    widget.sendMessage({ x: 2 });

    // after debounce window the queued message should fire

    // 500ms gives a wide buffer: 120ms debounce + invokeCallbackSafely's setTimeout(0) hop

    // + any timer drift on loaded CI machines

    await new Promise((r) => setTimeout(r, 500));

    expect(handler).toHaveBeenCalledTimes(2);

  });

  test('on returns an unregister function that removes the handler', () => {

    addBootScript({ 'data-client-id': 'c4', 'data-agent-id': 'a4', 'data-config-id': 'cfg4' });

    require('../src/embed/docs-widget.js');

    const widget = (window as any).CompaninDocsWidget;

    const handler = jest.fn();

    const unregister = widget.on('message', handler);

    // remove right away

    unregister();

    // sending a message should not call handler

    widget.sendMessage({ hello: 'world' });

    expect(handler).not.toHaveBeenCalled();

  });

  test('handleMessage catches errors when event.data.type getter throws', async () => {

    addBootScript({ 'data-client-id': 'c5', 'data-agent-id': 'a5', 'data-config-id': 'cfg5' });

    require('../src/embed/docs-widget.js');

    // wait for init to settle

    await new Promise((r) => setTimeout(r, 10));

    const container = document.querySelector('[id^="companin-docs-widget-container-"]') as HTMLElement;

    expect(container).not.toBeNull();

    const iframe = container.querySelector('iframe') as HTMLIFrameElement;

    const widget = (window as any).CompaninDocsWidget;

    const bad: any = {};

    let thrown = false;

    Object.defineProperty(bad, 'type', {

      get() {

        if (!thrown) {

          thrown = true;

          throw new Error('boom');

        }

        return undefined;

      },

      configurable: true,

    });

    // dispatch a message that will throw when the handler attempts to read `type`

    const evt = new MessageEvent('message', { data: bad, origin: iframe.src.split('?')[0], source: iframe.contentWindow });

    window.dispatchEvent(evt);

    // allow any async error logging to run

    await new Promise((r) => setTimeout(r, 10));

    const errors = widget.getErrors();

    expect(errors.some((e: any) => /Error handling message from docs widget/.test(e.message))).toBe(true);

  });

  test('initWidget catch shows initialization error UI when iframe creation fails', async () => {

    // monkeypatch createElement to throw when creating an iframe so initWidget's inner try/catch triggers

    const originalCreate = document.createElement.bind(document);

    document.createElement = ((name: string) => {

      if (name === 'iframe') throw new Error('initfail');

      return originalCreate(name) as any;

    }) as any;

    addBootScript({ 'data-client-id': 'c6', 'data-agent-id': 'a6', 'data-config-id': 'cfg6' });

    require('../src/embed/docs-widget.js');

    // restore createElement

    document.createElement = originalCreate as any;

    // allow any async UI updates to run

    await new Promise((r) => setTimeout(r, 10));

    const errEl = document.getElementById('companin-docs-widget-error');

    expect(errEl).not.toBeNull();

    expect(errEl!.innerHTML).toContain('Initialization Error');

  });

});

