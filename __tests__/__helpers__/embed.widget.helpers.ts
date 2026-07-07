import path from 'path';

export const FILE = path.resolve(process.cwd(), 'src', 'embed', 'widget.js');
/** Creates a stub <script>, appends to DOM, then requires the module fresh. */

export function loadWidget(attrs: Record<string, string> = {}) {
  const stub = document.createElement('script');
  stub.id = 'companin-widget-script';
  for (const [k, v] of Object.entries(attrs)) stub.setAttribute(k, v);
  document.body.appendChild(stub);
  jest.resetModules();
  require(FILE);
  return {
    api: (window as any).CompaninWidget as any,
    widgets: (window as any).CompaninWidgets as any,
    iframe: document.querySelector('iframe') as HTMLIFrameElement | null,
  };
}
/** Attach a stable mock object as the iframe's contentWindow. */

export function mockCW(iframe: HTMLIFrameElement) {
  const mock = { postMessage: jest.fn() };
  Object.defineProperty(iframe, 'contentWindow', { get: () => mock, configurable: true });
  return mock;
}
/** Dispatch a MessageEvent that looks as if it came from inside the iframe. */

export function fromIframe(
  iframe: HTMLIFrameElement,
  data: unknown,
  origin = 'https://widget.companin.tech',
) {
  const cw = (iframe as any).contentWindow;
  window.dispatchEvent(new MessageEvent('message', { data, origin, source: cw as any }));
}
