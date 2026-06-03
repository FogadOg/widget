import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';

// allow accessing the global flag used by the docs widget script

declare const require: (path: string) => any;

declare const __dirname: string;

declare global {

  interface Window {

    CompaninDocsWidget?: any;

    CompaninDocsWidgets?: {

      get: (id: string) => any;

      list: () => string[];

      destroy: (id: string) => boolean;

    };

    __COMPANIN_DOCS_WIDGET_INSTANCES__?: Record<string, any>;

  }

}

import { DOCS_WIDGET_SCRIPT_ID } from '../lib/constants';

const fs = require('fs');

const path = require('path');

// After build:embed, public/docs-widget.js is a tiny stub that dynamically loads

// the versioned file from the CDN — jsdom never fetches it, so the widget never

// boots. Read the versioned file directly; it always contains the real widget code.

const { version } = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));

describe('public/docs-widget.js loader', () => {

  let code: string;

  beforeAll(() => {

    code = fs.readFileSync(path.resolve(__dirname, `../public/docs-widget-${version}.js`), 'utf8');

  });

  function inject(attrs: Record<string, string> = {}) {

    const script = document.createElement('script');

    script.id = 'companin-docs-widget-script';

    Object.entries(attrs).forEach(([k, v]) => script.setAttribute(k, v));

    Object.defineProperty(document, 'currentScript', {

      configurable: true,

      get: () => script,

    });

    script.text = code;

    document.head.appendChild(script);

    return script;

  }

  function getContainers() {

    return Array.from(document.querySelectorAll(`[id^="${DOCS_WIDGET_SCRIPT_ID}-container-"]`));

  }

  function getFirstContainer() {

    return document.querySelector(`[id^="${DOCS_WIDGET_SCRIPT_ID}-container-"]`) as HTMLElement | null;

  }

  afterEach(() => {

    getContainers().forEach((container) => {

      if (container && container.parentNode) container.parentNode.removeChild(container);

    });

    try { delete (window as any).CompaninDocsWidget; } catch {}

    try { delete (window as any).CompaninDocsWidgets; } catch {}

    try { delete (window as any).__COMPANIN_DOCS_WIDGET_INSTANCES__; } catch {}

  });

  it('injects container and iframe correctly', () => {

    inject({

      'data-client-id': 'c',

      'data-agent-id': 'a',

      'data-config-id': 'cfg',

    });

    const container = getFirstContainer();

    expect(container).toBeTruthy();

    expect(container?.style.display).toBe('none');

    const iframe = container?.querySelector('iframe');

    expect(iframe).toBeTruthy();

    expect((iframe as HTMLIFrameElement).src).toContain('/embed/docs');

  });

  it('requires required attributes', () => {

    // no attrs -> error path: container not created

    inject({});

    expect(getFirstContainer()).toBeNull();

  });

  it('exports API methods', () => {

    inject({

      'data-client-id': 'c',

      'data-agent-id': 'a',

      'data-config-id': 'cfg',

    });

    expect(window.CompaninDocsWidget).toBeDefined();

    const methods = ['on', 'off', 'onOpen', 'onClose', 'onMessage', 'onResponse', 'onAuthFailure', 'onError', 'open', 'close', 'show', 'hide', 'sendMessage', 'registerHooks'];

    methods.forEach(m => expect(typeof window.CompaninDocsWidget[m]).toBe('function'));

  });

  it('supports on/off with event envelope for open/close', () => {

    jest.useFakeTimers();

    inject({

      'data-client-id': 'c',

      'data-agent-id': 'a',

      'data-config-id': 'cfg',

    });

    const onOpen = jest.fn();

    const unsub = window.CompaninDocsWidget.on('open', onOpen);

    window.CompaninDocsWidget.show();

    jest.runOnlyPendingTimers();

    expect(onOpen).toHaveBeenCalledTimes(1);

    expect(onOpen.mock.calls[0][0]).toEqual(

      expect.objectContaining({

        event: 'open',

        data: expect.objectContaining({ source: 'host-api' }),

        context: expect.objectContaining({

          clientId: 'c',

          agentId: 'a',

          configId: 'cfg',

        }),

      })

    );

    unsub();

    window.CompaninDocsWidget.show();

    jest.runOnlyPendingTimers();

    expect(onOpen).toHaveBeenCalledTimes(1);

    jest.useRealTimers();

  });

  it('supports legacy onError hook', () => {

    jest.useFakeTimers();

    inject({

      'data-client-id': 'c',

      'data-agent-id': 'a',

      'data-config-id': 'cfg',

    });

    const iframe = document.querySelector(`[id^="${DOCS_WIDGET_SCRIPT_ID}-container-"] iframe`) as HTMLIFrameElement;

    Object.defineProperty(iframe, 'contentWindow', {

      writable: true,

      value: {

        postMessage: () => {

          throw new Error('postMessage failed');

        },

      },

    });

    // trigger onload so iframeLoaded=true; sendMessage will call postMessage directly, which throws

    iframe.onload!(new Event('load'));

    const onError = jest.fn();

    window.CompaninDocsWidget.onError(onError);

    window.CompaninDocsWidget.sendMessage('will-fail-without-iframe-contentwindow');

    jest.runOnlyPendingTimers();

    expect(onError).toHaveBeenCalled();

    expect(onError.mock.calls[0][0]).toEqual(

      expect.objectContaining({

        code: 'SEND_MESSAGE_FAILED',

      })

    );

    jest.useRealTimers();

  });

  it('open/close buttons post messages to iframe when iframe exists', () => {

    inject({

      'data-client-id': 'c',

      'data-agent-id': 'a',

      'data-config-id': 'cfg',

    });

    // create fake iframe contentWindow

    const iframe = document.querySelector(`[id^="${DOCS_WIDGET_SCRIPT_ID}-container-"] iframe`) as HTMLIFrameElement;

    const postSpy = jest.fn();

    Object.defineProperty(iframe, 'contentWindow', {

      writable: true,

      value: { postMessage: postSpy },

    });

    // trigger onload so iframeLoaded=true and postToIframe sends directly

    iframe.onload!(new Event('load'));

    window.CompaninDocsWidget.open();

    expect(postSpy).toHaveBeenCalledWith({ type: 'OPEN_DOCS_DIALOG' }, expect.any(String));

    window.CompaninDocsWidget.close();

    expect(postSpy).toHaveBeenCalledWith({ type: 'CLOSE_DOCS_DIALOG' }, expect.any(String));

    window.CompaninDocsWidget.sendMessage('foo');

    expect(postSpy).toHaveBeenCalledWith({ type: 'HOST_MESSAGE', data: 'foo' }, expect.any(String));

  });

  it('show/hide manipulate container display', () => {

    inject({

      'data-client-id': 'c',

      'data-agent-id': 'a',

      'data-config-id': 'cfg',

    });

    const container = getFirstContainer()!;

    window.CompaninDocsWidget.show();

    expect(container.style.display).toBe('block');

    window.CompaninDocsWidget.hide();

    expect(container.style.display).toBe('none');

  });

  it('supports multiple docs widget instances on one page', () => {

    inject({

      'data-client-id': 'c',

      'data-agent-id': 'a',

      'data-config-id': 'cfg',

      'data-instance-id': 'docs-left',

    });

    inject({

      'data-client-id': 'c',

      'data-agent-id': 'a',

      'data-config-id': 'cfg',

      'data-instance-id': 'docs-right',

    });

    const containers = getContainers();

    expect(containers).toHaveLength(2);

    expect(window.CompaninDocsWidgets).toBeDefined();

    expect(window.CompaninDocsWidgets?.list().sort()).toEqual(['docs-left', 'docs-right']);

  });

});