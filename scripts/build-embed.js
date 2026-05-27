#!/usr/bin/env node
/**
 * build-embed.js
 *
 * Copies each source embed script from src/embed/ → public/ and prepends a
 * "DO NOT EDIT" header so editors know where the real source lives.
 *
 * Files managed:
 *   src/embed/docs-widget.js  →  public/docs-widget.js
 *   src/embed/widget.js       →  public/widget.js
 *
 * Usage:
 *   node scripts/build-embed.js
 *   npm run build:embed
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const PKG = require(path.join(ROOT, 'package.json'));
const VERSION = String(PKG.version || '0.0.0');

// Each entry now writes BOTH widget.js (unversioned, redirect alias for legacy
// customers) and widget-<version>.js (immutable, cacheable forever). Customer
// snippets emitted by the dashboard reference the versioned URL plus an SRI
// hash so cache-poisoning or rollback windows can't downgrade the script
// (LAUNCH-READINESS.md #11).
const FILES = [
  {
    src: 'src/embed/docs-widget.js',
    dst: 'public/docs-widget.js',
    versionedDst: (v) => `public/docs-widget-${v}.js`,
    manifestKey: 'docs-widget',
  },
  {
    src: 'src/embed/widget.js',
    dst: 'public/widget.js',
    versionedDst: (v) => `public/widget-${v}.js`,
    manifestKey: 'widget',
  },
];

function sha384(buf) {
  return 'sha384-' + crypto.createHash('sha384').update(buf).digest('base64');
}

function buildEmbedFile(entry) {
  const srcPath = path.join(ROOT, entry.src);
  const dstPath = path.join(ROOT, entry.dst);
  const versionedDstPath = path.join(ROOT, entry.versionedDst(VERSION));

  const header = `// =============================================================================
// AUTO-GENERATED FILE — DO NOT EDIT DIRECTLY
// Source: ${entry.src}
// Version: ${VERSION}
// Regenerate: npm run build:embed
// =============================================================================
`;

  const source = fs.readFileSync(srcPath, 'utf8');
  const HEADER_RE = /^\/\/ =+\n\/\/ AUTO-GENERATED FILE[^\n]*\n\/\/ Source:[^\n]*\n(?:\/\/ Version:[^\n]*\n)?\/\/ Regenerate:[^\n]*\n\/\/ =+\n/;
  let stripped = HEADER_RE.test(source) ? source.replace(HEADER_RE, '') : source;
  stripped = stripped.replace(/['"]__WIDGET_VERSION__['"]/g, JSON.stringify(VERSION));

  const output = header + stripped;

  // The versioned file (e.g. widget-0.1.0.js) is the real bundle — immutable.
  fs.writeFileSync(versionedDstPath, output, 'utf8');

  // The unversioned alias (widget.js) is a tiny stub that dynamically loads the
  // pinned versioned file. This prevents a breaking v2 deploy from silently
  // upgrading customers who reference the unversioned URL: they stay on the
  // version that was current when they installed the widget until the stub
  // is explicitly advanced (by bumping package.json version and redeploying).
  const versionedPublicPath = '/' + entry.versionedDst(VERSION).replace(/^public\//, '');
  const stub = `${header}// Stable-channel loader: pins to the versioned release built alongside this file.
// Customers on this URL stay on v${VERSION} until this stub is redeployed.
// To advance the stable channel, bump the version in package.json and redeploy.
(function () {
  'use strict';
  var cur = document.currentScript;
  var host = 'https://widget.companin.tech';
  if (cur && cur.src) {
    try { host = new URL(cur.src, window.location.href).origin; } catch (e) {}
  }
  var s = document.createElement('script');
  // Copy all data-* attributes (client-id, assistant-id, etc.) to the versioned tag
  // so the widget loader can read them from document.currentScript as normal.
  if (cur) {
    var a = cur.attributes;
    for (var i = 0; i < a.length; i++) {
      if (a[i].name !== 'src' && a[i].name !== 'integrity') {
        try { s.setAttribute(a[i].name, a[i].value); } catch (e) {}
      }
    }
  }
  s.src = host + ${JSON.stringify(versionedPublicPath)};
  s.async = true;
  s.crossOrigin = 'anonymous';
  (document.head || document.documentElement).appendChild(s);
})();
`;
  fs.writeFileSync(dstPath, stub, 'utf8');

  const integrity = sha384(Buffer.from(output, 'utf8'));
  console.log(`build:embed  ${entry.src} → ${entry.versionedDst(VERSION)} (v${VERSION}) ${integrity}`);
  console.log(`build:embed  stub        → ${entry.dst} (pins to v${VERSION})`);
  return { manifestKey: entry.manifestKey, version: VERSION, integrity, file: entry.versionedDst(VERSION) };
}

const manifest = {};
for (const entry of FILES) {
  const result = buildEmbedFile(entry);
  manifest[result.manifestKey] = {
    version: result.version,
    file: result.file.replace(/^public\//, '/'),
    integrity: result.integrity,
  };
}

const manifestPath = path.join(ROOT, 'public/widget-embed-manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
console.log(`build:embed  wrote SRI manifest → ${manifestPath}`);

