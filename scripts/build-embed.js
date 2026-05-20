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
  fs.writeFileSync(dstPath, output, 'utf8');
  fs.writeFileSync(versionedDstPath, output, 'utf8');

  const integrity = sha384(Buffer.from(output, 'utf8'));
  console.log(`build:embed  ${entry.src} → ${entry.dst} + ${entry.versionedDst(VERSION)} (v${VERSION}) ${integrity}`);
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

