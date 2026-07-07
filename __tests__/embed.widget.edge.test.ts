/* global jest, describe, test, expect, beforeEach, afterEach */
describe('widget edge cases', () => {
  beforeEach(() => {
    jest.resetModules();
    // Error UI is dev-gated; reset the URL so an opt-in ?widget_debug=1 from one
    // test doesn't leak into the next.
    try { window.history.pushState({}, '', '/'); } catch (e) {}
    document.documentElement.innerHTML = '<head></head><body></body>';
    try { Object.defineProperty(document, 'body', { value: document.getElementsByTagName('body')[0], configurable: true, writable: true }); } catch (e) {}
    try { Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true }); } catch (e) {}
  });
  function addBootScript(attrs: Record<string, string>) {
    const s = document.createElement('script');
    Object.keys(attrs).forEach((k) => s.setAttribute(k, attrs[k]));
    document.head.appendChild(s);
    return s;
  }
  test('selects script by data attributes when currentScript missing', async () => {
    // no document.currentScript
    try { Object.defineProperty(document, 'currentScript', { get: () => null, configurable: true }); } catch (e) {}
    addBootScript({ 'data-client-id': 'c', 'data-agent-id': 'a', 'data-config-id': 'cfg' });
    require('../src/embed/widget.js');
    // wait for init
    await new Promise((r) => setTimeout(r, 0));
    const widget = (window as any).CompaninWidget;
    expect(widget).toBeDefined();
  });
  test('fallback stub is used and logs when no script found', () => {
    // ensure no scripts match
    try { Object.defineProperty(document, 'currentScript', { get: () => null, configurable: true }); } catch (e) {}
    // remove existing script nodes
    Array.from(document.getElementsByTagName('script')).forEach((s) => s.remove());
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    require('../src/embed/widget.js');
    expect(spy).toHaveBeenCalled();
    const called = spy.mock.calls.some((c) => String(c[0]).includes('Failed to get current script reference') || String(c[1]).includes('Failed to get current script reference'));
    expect(called).toBe(true);
    spy.mockRestore();
  });
  test('schedules initWidget on DOMContentLoaded when body missing', async () => {
    Object.defineProperty(document, 'body', { value: null, configurable: true });
    Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true });
    addBootScript({ 'data-client-id': 'c2', 'data-agent-id': 'a2', 'data-config-id': 'cfg2' });
    require('../src/embed/widget.js');
    const b = document.createElement('body');
    Object.defineProperty(document, 'body', { value: b, configurable: true });
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await new Promise((r) => setTimeout(r, 0));
    const widget = (window as any).CompaninWidget;
    expect(widget).toBeDefined();
    const errs = widget.getErrors();
    expect(errs.some((e: any) => /Document body not ready/.test(e.message))).toBe(true);
  });
  test('iframe onerror triggers error UI', async () => {
    window.history.pushState({}, '', '/?widget_debug=1');
    addBootScript({ 'data-client-id': 'c3', 'data-agent-id': 'a3', 'data-config-id': 'cfg3' });
    require('../src/embed/widget.js');
    await new Promise((r) => setTimeout(r, 0));
    const widget = (window as any).CompaninWidget;
    const container = document.querySelector('[id^="companin-widget-container-"]') as HTMLElement;
    expect(container).not.toBeNull();
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    // simulate error
    if ((iframe as any).onerror) (iframe as any).onerror(new Error('fake'));
    await new Promise((r) => setTimeout(r, 0));
    const errs = widget.getErrors();
    expect(errs.some((e: any) => /Widget iframe failed to load/.test(e.message))).toBe(true);
    expect(container.innerHTML).toContain('Failed to load widget.');
  });
  test('debounce in sendMessage queues and emits', async () => {
    addBootScript({ 'data-client-id': 'c4', 'data-agent-id': 'a4', 'data-config-id': 'cfg4' });
    require('../src/embed/widget.js');
    await new Promise((r) => setTimeout(r, 0));
    const widget = (window as any).CompaninWidget;
    const handler = jest.fn();
    widget.on('message', handler);
    widget.sendMessage({ id: 'm1' });
    await new Promise((r) => setTimeout(r, 0));
    widget.sendMessage({ id: 'm2' });
    // The trailing debounce flush (~120ms) can be delayed when the full suite
    // runs in parallel and starves the event loop, so poll for the second emit
    // instead of asserting after a single fixed (and racy) wait.
    for (let i = 0; i < 50 && handler.mock.calls.length < 2; i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(handler).toHaveBeenCalledTimes(2);
  });
  test('resize catches errors and records them', async () => {
    addBootScript({ 'data-client-id': 'c5', 'data-agent-id': 'a5', 'data-config-id': 'cfg5' });
    require('../src/embed/widget.js');
    await new Promise((r) => setTimeout(r, 0));
    const widget = (window as any).CompaninWidget;
    const badWidth: any = { toString() { throw new Error('boom'); } };
    widget.resize(badWidth, 100);
    await new Promise((r) => setTimeout(r, 10));
    const errs = widget.getErrors();
    expect(errs.some((e: any) => /Failed to resize widget/.test(e.message))).toBe(true);
  });
  test('generic hooks processing error is caught and logged', async () => {
    addBootScript({ 'data-client-id': 'c6', 'data-agent-id': 'a6', 'data-config-id': 'cfg6' });
    require('../src/embed/widget.js');
    await new Promise((r) => setTimeout(r, 0));
    const container = document.querySelector('[id^="companin-widget-container-"]') as HTMLElement;
    expect(container).not.toBeNull();
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    const mockCW = {};
    Object.defineProperty(iframe, 'contentWindow', { get: () => mockCW, configurable: true });
    const widget = (window as any).CompaninWidget;
    const badType: any = { toString() { throw new Error('boom'); } };
    const evt = new MessageEvent('message', { data: { type: badType, data: {} }, origin: 'https://widget.companin.tech', source: mockCW });
    window.dispatchEvent(evt);
    await new Promise((r) => setTimeout(r, 10));
    const errs = widget.getErrors();
    expect(errs.some((e: any) => /Failed to process generic hooks/.test(e.message))).toBe(true);
  });
  test('outer message handler errors are logged', async () => {
    addBootScript({ 'data-client-id': 'c7', 'data-agent-id': 'a7', 'data-config-id': 'cfg7' });
    require('../src/embed/widget.js');
    await new Promise((r) => setTimeout(r, 0));
    const widget = (window as any).CompaninWidget;
    // simulate iframe getter throwing (causes outer catch in handler)
    const container = document.querySelector('[id^="companin-widget-container-"]') as HTMLElement;
    const iframe = container && container.querySelector('iframe') as HTMLIFrameElement;
    if (iframe) {
      iframe.remove();
      try {
        Object.defineProperty(iframe, 'contentWindow', { get: () => { throw new Error('boom'); }, configurable: true });
      } catch (e) {}
    }
    const evt = new MessageEvent('message', { data: { type: 'WIDGET_SHOW' }, origin: 'https://widget.companin.tech', source: {} as any });
    window.dispatchEvent(evt);
    await new Promise((r) => setTimeout(r, 10));
    const errs = widget.getErrors();
    expect(errs.some((e: any) => /Error handling message from widget/.test(e.message))).toBe(true);
  });
  test('script.find handles getAttribute throwing and matches src regex', async () => {
    try { Object.defineProperty(document, 'currentScript', { get: () => null, configurable: true }); } catch (e) {}
    // script that throws from getAttribute should be skipped
    const s1 = document.createElement('script');
    Object.defineProperty(s1, 'getAttribute', { value: () => { throw new Error('boom'); }, configurable: true });
    s1.src = 'https://example.com/loader.js';
    document.head.appendChild(s1);
    // script that matches src regex should be chosen
    const s2 = document.createElement('script');
    s2.src = 'https://cdn.example.com/widget.loader.js';
    document.head.appendChild(s2);
    require('../src/embed/widget.js');
    await new Promise((r) => setTimeout(r, 0));
    expect((window as any).CompaninWidget).toBeDefined();
  });
  test('parsePixelValue and parseOffsetValue parse numeric strings and apply left-offset fallback', async () => {
    addBootScript({ 'data-client-id': 'c8', 'data-agent-id': 'a8', 'data-config-id': 'cfg8' });
    require('../src/embed/widget.js');
    await new Promise((r) => setTimeout(r, 0));
    const container = document.querySelector('[id^="companin-widget-container-"]') as HTMLElement;
    expect(container).not.toBeNull();
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    const mockCW = {};
    Object.defineProperty(iframe, 'contentWindow', { get: () => mockCW, configurable: true });
    const evt = new MessageEvent('message', {
      data: { type: 'WIDGET_RESIZE', data: { width: '50', height: '50', position: 'bottom-left', edge_offset: '0' } },
      origin: 'https://widget.companin.tech',
      source: mockCW,
    });
    window.dispatchEvent(evt);
    await new Promise((r) => setTimeout(r, 10));
    // width: 50 + padding*2 (padding=8) => 66px
    expect(container.style.width).toBe('66px');
    // left offset should be 16px because edge_offset parsed to 0 and position includes left
    expect(container.style.left).toContain('16px');
  });
  test('iframe load timeout shows error in container', async () => {
    jest.useFakeTimers();
    try {
      window.history.pushState({}, '', '/?widget_debug=1');
      addBootScript({ 'data-client-id': 'c9', 'data-agent-id': 'a9', 'data-config-id': 'cfg9' });
      require('../src/embed/widget.js');
      // advance the iframe load timeout (15s)
      jest.advanceTimersByTime(15000);
      // allow pending tasks
      await Promise.resolve();
      const widget = (window as any).CompaninWidget;
      const errs = widget.getErrors();
      expect(errs.some((e: any) => /Widget iframe failed to load \(timeout\)/.test(e.message))).toBe(true);
      const container = document.querySelector('[id^="companin-widget-container-"]') as HTMLElement;
      expect(container.innerHTML).toContain('Failed to load widget. Please refresh the page.');
    } finally {
      jest.useRealTimers();
    }
  });
});
