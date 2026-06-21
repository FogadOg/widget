import path from 'path';

const FILE = path.resolve(process.cwd(), 'src', 'embed', 'docs-widget.js');

export function loadDocsWidget(attrs: Record<string, string> = {}) {

  const stub = document.createElement('script');

  stub.id = 'companin-docs-widget-script';

  for (const [k, v] of Object.entries(attrs)) stub.setAttribute(k, v);

  document.body.appendChild(stub);

  jest.resetModules();

  require(FILE);

  return {

    api: (window as any).CompaninDocsWidget as any,

    widgets: (window as any).CompaninDocsWidgets as any,

    iframe: document.querySelector('iframe') as HTMLIFrameElement | null,

  };

}

export function mockCW(iframe: HTMLIFrameElement) {

  const mock = { postMessage: jest.fn() };

  Object.defineProperty(iframe, 'contentWindow', { get: () => mock, configurable: true });

  return mock;

}

export function fromIframe(

  iframe: HTMLIFrameElement,

  data: unknown,

  origin = 'https://widget.companin.tech',

) {

  const cw = (iframe as any).contentWindow;

  window.dispatchEvent(new MessageEvent('message', { data, origin, source: cw as any }));

}
