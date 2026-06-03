declare global {

  interface Window {

    CompaninWidget?: any;

    CompaninWidgets?: {

      get: (id: string) => any;

      list: () => string[];

      destroy: (id: string) => boolean;

    };

    __COMPANIN_WIDGET_INSTANCES__?: Record<string, any>;

  }

}

import fs from 'fs';

import path from 'path';

import { WIDGET_SCRIPT_ID } from '../lib/constants';

// After build:embed, public/widget.js is a tiny stub that dynamically loads the

// versioned file from the CDN — jsdom never fetches it, so the widget never boots.

// Read the versioned file directly; it always contains the real widget code.

const { version } = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));

describe('public/widget.js loader', () => {

  let code: string;

  beforeAll(() => {

    code = fs.readFileSync(path.resolve(__dirname, `../public/widget-${version}.js`), 'utf8');

  });

  function inject(attrs: Record<string, string> = {}) {

    const script = document.createElement('script');

    script.id = 'companin-widget-script';

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

    return Array.from(document.querySelectorAll(`[id^="${WIDGET_SCRIPT_ID}-container-"]`));

  }

  afterEach(() => {

    getContainers().forEach((container) => {

      if (container && container.parentNode) container.parentNode.removeChild(container);

    });

    try { delete window.CompaninWidget; } catch {}

    try { delete window.CompaninWidgets; } catch {}

    try { delete window.__COMPANIN_WIDGET_INSTANCES__; } catch {}

  });

  it('injects iframe and connection hints', () => {

    inject({

      'data-client-id': 'c',

      'data-agent-id': 'a',

      'data-config-id': 'cfg',

    });

    const iframe = document.querySelector(`[id^="${WIDGET_SCRIPT_ID}-container-"] iframe`);

    expect(iframe).toBeTruthy();

    // no button should exist at all

    expect(document.querySelector(`[id^="${WIDGET_SCRIPT_ID}-container-"] button`)).toBeNull();

    // document head should now include connection hints

    const links = Array.from(document.head.querySelectorAll('link'));

    expect(links.some(l => l.rel === 'preconnect' && l.href.includes('widget.companin.tech'))).toBe(true);

    expect(links.some(l => l.rel === 'dns-prefetch' && l.href.includes('widget.companin.tech'))).toBe(true);

    expect(links.some(l => l.rel === 'prefetch' && l.href.includes('/embed/session'))).toBe(true);

  });

  it('still renders iframe when startOpen attribute is true', () => {

    inject({

      'data-client-id': 'c',

      'data-agent-id': 'a',

      'data-config-id': 'cfg',

      'data-start-open': 'true',

    });

    const iframe = document.querySelector(`[id^="${WIDGET_SCRIPT_ID}-container-"] iframe`);

    expect(iframe).toBeTruthy();

    expect(document.querySelector(`[id^="${WIDGET_SCRIPT_ID}-container-"] button`)).toBeNull();

  });

  it('supports multiple chat widget instances on one page', () => {

    inject({

      'data-client-id': 'c1',

      'data-agent-id': 'a1',

      'data-config-id': 'cfg1',

      'data-instance-id': 'chat-left',

    });

    inject({

      'data-client-id': 'c2',

      'data-agent-id': 'a2',

      'data-config-id': 'cfg2',

      'data-instance-id': 'chat-right',

    });

    const containers = getContainers();

    expect(containers).toHaveLength(2);

    expect(window.CompaninWidgets).toBeDefined();

    expect(window.CompaninWidgets?.list().sort()).toEqual(['chat-left', 'chat-right']);

    expect(window.CompaninWidgets?.get('chat-left')).toBeTruthy();

    expect(window.CompaninWidgets?.get('chat-right')).toBeTruthy();

  });

});

