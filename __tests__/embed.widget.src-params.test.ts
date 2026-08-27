/**
 * Loader config carried in the script `src` query string.
 *
 * Google Tag Manager (sandboxed `injectScript(url, …)`) and Webflow
 * (`registered_scripts/hosted`, which takes a URL + integrity hash) inject the
 * loader as a bare URL and cannot set attributes on the tag. For those two
 * platforms the query string is the only channel, so `?key=` / `?theme=` /
 * `?locale=` have to work — and attributes have to keep winning when both are
 * present, or every existing pasted snippet would change behaviour.
 */
import fs from 'fs';
import path from 'path';
import { FILE } from './__helpers__/embed.widget.helpers';

const BASE = 'https://widget.companin.tech/widget-0.1.4.js';

/** Like loadWidget(), but the stub carries a real `src` so srcParam() can read it. */
function loadWithSrc(src: string, attrs: Record<string, string> = {}) {
  const stub = document.createElement('script');
  stub.id = 'companin-widget-script';
  stub.src = src;
  for (const [k, v] of Object.entries(attrs)) stub.setAttribute(k, v);
  document.body.appendChild(stub);
  jest.resetModules();
  require(FILE);
  return {
    api: (window as any).CompaninWidget as any,
    iframe: document.querySelector('iframe') as HTMLIFrameElement | null,
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  // The stub tests below install a currentScript getter, and jsdom keeps it
  // across tests. Clearing the DOM isn't enough — the loader tries
  // document.currentScript first, so a leftover getter would hand the next test
  // a detached script from the previous one.
  Object.defineProperty(document, 'currentScript', { configurable: true, get: () => null });
  window.history.pushState({}, '', '/');
  (window as any).CompaninWidget = undefined;
  (window as any).CompaninWidgets = undefined;
  (window as any).__COMPANIN_WIDGET_INSTANCES__ = undefined;
});

describe('install key from ?key=', () => {
  it('boots from the query string with no attributes at all', () => {
    const { api, iframe } = loadWithSrc(`${BASE}?key=wgt_from_query`);
    expect(api).toBeDefined();
    expect(iframe).not.toBeNull();
    expect(iframe!.src).toContain('key=wgt_from_query');
  });

  it('lets data-widget-key win when both are present', () => {
    const { iframe } = loadWithSrc(`${BASE}?key=wgt_from_query`, {
      'data-widget-key': 'wgt_from_attribute',
    });
    expect(iframe!.src).toContain('key=wgt_from_attribute');
    expect(iframe!.src).not.toContain('wgt_from_query');
  });

  it('still shows the config error when neither attribute nor query carries a key', () => {
    const { api, iframe } = loadWithSrc(BASE);
    expect(iframe).toBeNull();
    expect(api).toBeUndefined();
  });

  it('ignores an unrelated query string', () => {
    const { iframe } = loadWithSrc(`${BASE}?v=2&cachebust=1`);
    expect(iframe).toBeNull();
  });
});

describe('theme from ?theme=', () => {
  it('applies a valid theme from the query string', () => {
    const { iframe } = loadWithSrc(`${BASE}?key=wgt_k&theme=dark`);
    expect(iframe!.src).toContain('theme=dark');
  });

  it('lets data-theme win over ?theme=', () => {
    const { iframe } = loadWithSrc(`${BASE}?key=wgt_k&theme=dark`, {
      'data-theme': 'light',
    });
    expect(iframe!.src).toContain('theme=light');
    expect(iframe!.src).not.toContain('theme=dark');
  });

  it('ignores an invalid theme rather than forwarding it', () => {
    const { iframe } = loadWithSrc(`${BASE}?key=wgt_k&theme=neon`);
    expect(iframe!.src).not.toContain('theme=');
  });
});

describe('the unversioned /widget.js stub', () => {
  // The stable-channel entry point is a stub that re-injects the versioned
  // bundle. GTM and Webflow point at this URL (they cannot re-paste a pinned
  // one), so if the stub dropped its own query string the versioned loader
  // would come up with no key and no attributes — a dead install with no
  // console breadcrumb the site owner would recognise.
  function runStub(src: string) {
    const stub = document.createElement('script');
    stub.src = src;
    document.body.appendChild(stub);
    Object.defineProperty(document, 'currentScript', {
      configurable: true,
      get: () => stub,
    });
    // eslint-disable-next-line no-eval
    (0, eval)(fs.readFileSync(path.resolve(process.cwd(), 'public', 'widget.js'), 'utf8'));
    const injected = Array.from(document.head.querySelectorAll('script'));
    return injected[injected.length - 1] as HTMLScriptElement | undefined;
  }

  it('forwards the query string to the versioned bundle', () => {
    const injected = runStub('https://widget.companin.tech/widget.js?key=wgt_gtm&theme=dark');
    expect(injected).toBeDefined();
    expect(injected!.src).toMatch(/\/widget-\d+\.\d+\.\d+\.js\?/);
    expect(injected!.src).toContain('key=wgt_gtm');
    expect(injected!.src).toContain('theme=dark');
  });

  it('injects a bare versioned URL when there is no query string', () => {
    const injected = runStub('https://widget.companin.tech/widget.js');
    expect(injected!.src).toMatch(/\/widget-\d+\.\d+\.\d+\.js$/);
  });

  it('keeps copying data-* attributes across', () => {
    const stub = document.createElement('script');
    stub.src = 'https://widget.companin.tech/widget.js';
    stub.setAttribute('data-widget-key', 'wgt_attr');
    document.body.appendChild(stub);
    Object.defineProperty(document, 'currentScript', { configurable: true, get: () => stub });
    // eslint-disable-next-line no-eval
    (0, eval)(fs.readFileSync(path.resolve(process.cwd(), 'public', 'widget.js'), 'utf8'));
    const injected = document.head.querySelector('script') as HTMLScriptElement;
    expect(injected.getAttribute('data-widget-key')).toBe('wgt_attr');
  });
});

describe('locale from ?locale=', () => {
  it('honours ?locale= when data-locale is absent', () => {
    const { iframe } = loadWithSrc(`${BASE}?key=wgt_k&locale=fr`);
    expect(iframe!.src).toContain('locale=fr');
  });

  it('lets data-locale win over ?locale=', () => {
    const { iframe } = loadWithSrc(`${BASE}?key=wgt_k&locale=fr`, {
      'data-locale': 'de',
    });
    expect(iframe!.src).toContain('locale=de');
  });
});
