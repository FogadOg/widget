/**
 * Smoke test for the BUILT loader artifacts.
 *
 * Every other loader test requires src/embed/*.js directly, so the suite
 * validates the source but never what esbuild actually ships. That gap matters
 * more here than it usually would: customer snippets pin widget-<version>.js by
 * SRI hash, so a build-stage regression reaches production and cannot be pulled
 * back — the old version stays live until each customer re-pastes their snippet.
 *
 * This asserts the artifact named by the SRI manifest still boots in a DOM and
 * exposes its public API, which is what a bundler/minifier change is most likely
 * to break.
 *
 * Requires `npm run build:embed` to have run.
 */
import fs from 'fs';
import path from 'path';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
const MANIFEST = path.join(PUBLIC_DIR, 'widget-embed-manifest.json');

type ManifestEntry = { version: string; file: string; integrity: string };

function readManifest(): Record<string, ManifestEntry> {
  if (!fs.existsSync(MANIFEST)) {
    throw new Error(
      `Missing ${MANIFEST}. Run "npm run build:embed" before this suite.`,
    );
  }
  return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
}

/** Evaluate a built IIFE bundle against the current jsdom document. */
function runBundle(code: string) {
  // Built loaders are self-executing and read their config off a <script> tag,
  // so plain indirect eval reproduces how a browser runs them.
  // eslint-disable-next-line no-eval
  (0, eval)(code);
}

function stubScript(id: string, attrs: Record<string, string>) {
  const stub = document.createElement('script');
  stub.id = id;
  for (const [k, v] of Object.entries(attrs)) stub.setAttribute(k, v);
  document.body.appendChild(stub);
  return stub;
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  window.history.pushState({}, '', '/');
  (window as any).CompaninWidget = undefined;
  (window as any).CompaninWidgets = undefined;
  (window as any).__COMPANIN_WIDGET_INSTANCES__ = undefined;
  (window as any).__COMPANIN_DOCS_WIDGET_INSTANCES__ = undefined;
});

describe('built embed artifacts', () => {
  it('manifest points at files that exist and carry an SRI hash', () => {
    const manifest = readManifest();
    for (const key of ['widget', 'docs-widget']) {
      const entry = manifest[key];
      expect(entry).toBeDefined();
      expect(entry.integrity).toMatch(/^sha384-[A-Za-z0-9+/]+=*$/);
      const onDisk = path.join(PUBLIC_DIR, entry.file.replace(/^\//, ''));
      expect(fs.existsSync(onDisk)).toBe(true);
    }
  });

  it('the built widget bundle boots and exposes its public API', () => {
    const manifest = readManifest();
    const file = path.join(
      PUBLIC_DIR,
      manifest.widget.file.replace(/^\//, ''),
    );
    stubScript('companin-widget-script', {
      'data-client-id': 'test-client',
      'data-agent-id': 'test-agent',
      'data-widget-key': 'test-key',
    });

    runBundle(fs.readFileSync(file, 'utf8'));

    const api = (window as any).CompaninWidget;
    expect(api).toBeDefined();
    // Same surface the source-level suite asserts, so a bundling change that
    // drops or renames a method fails here rather than in a customer's page.
    for (const method of [
      'on', 'off', 'show', 'hide', 'resize', 'sendMessage',
      'getErrors', 'destroy', 'registerHooks',
      'onOpen', 'onClose', 'onMessage', 'onResponse', 'onAuthFailure', 'onError',
    ]) {
      expect(typeof api[method]).toBe('function');
    }
  });

  it('the built docs bundle boots without throwing', () => {
    const manifest = readManifest();
    const file = path.join(
      PUBLIC_DIR,
      manifest['docs-widget'].file.replace(/^\//, ''),
    );
    stubScript('companin-docs-widget', {
      'data-widget-key': 'test-key',
      'data-instance-id': 'docs-help',
    });

    expect(() => runBundle(fs.readFileSync(file, 'utf8'))).not.toThrow();
  });

  it('the unversioned stub forwards its query string to the versioned bundle', () => {
    // The stub is what GTM/Webflow-style hosts load; dropping the query string
    // there strips ?key= and the widget reports a missing install key.
    const stub = fs.readFileSync(path.join(PUBLIC_DIR, 'widget.js'), 'utf8');
    expect(stub).toContain('parsed.search');
    expect(stub).toMatch(/s\.src\s*=\s*host\s*\+/);
  });
});
