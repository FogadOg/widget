#!/usr/bin/env node
/**
 * Bundle budget for the two embed routes — the only bundles a visitor on a
 * customer's site actually downloads.
 *
 * Why this exists alongside `.size-limit.js`: size-limit globs
 * `.next/static/chunks/*.js`, which sums EVERY route in the app (marketing
 * pages, /dev, /preview, the docs site) into one ~2.6 MB number. That number
 * cannot regress meaningfully and cannot tell you whether the widget got
 * slower. Chunk filenames are content-hashed, so a glob cannot select one
 * route's chunks either — the per-route chunk list has to come from Next's
 * client-reference manifest, which is what this reads.
 *
 * Run after `next build`. Update a budget only with a note saying why.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Gzipped KB. Set just above the measured value so the budget ratchets down
// over time rather than rubber-stamping whatever is there.
const BUDGETS = {
  'embed/session': 400, // chat widget — measured 355 KB on 2026-09-14
  'embed/docs': 450, // docs widget — measured 408 KB on 2026-09-14
};

const NEXT_DIR = path.join(__dirname, '..', '.next');
const CHUNK_RE = /static\/chunks\/[A-Za-z0-9_\-./]+\.js/g;

function measure(route) {
  const manifest = path.join(NEXT_DIR, 'server', 'app', route, 'page_client-reference-manifest.js');
  if (!fs.existsSync(manifest)) {
    return { error: `manifest not found: ${path.relative(process.cwd(), manifest)} — run \`next build\` first` };
  }
  const src = fs.readFileSync(manifest, 'utf8');
  const chunks = [...new Set(src.match(CHUNK_RE) || [])];
  let bytes = 0;
  let missing = 0;
  for (const chunk of chunks) {
    const file = path.join(NEXT_DIR, chunk);
    if (!fs.existsSync(file)) {
      missing += 1;
      continue;
    }
    bytes += zlib.gzipSync(fs.readFileSync(file)).length;
  }
  return { kb: bytes / 1024, chunks: chunks.length, missing };
}

let failed = false;
console.log('Embed route bundle budgets (gzipped)\n');
for (const [route, budget] of Object.entries(BUDGETS)) {
  const result = measure(route);
  if (result.error) {
    console.error(`  ${route}: ${result.error}`);
    failed = true;
    continue;
  }
  const { kb, chunks, missing } = result;
  const over = kb > budget;
  const status = over ? 'FAIL' : 'ok';
  console.log(
    `  ${status.padEnd(4)} /${route.padEnd(14)} ${kb.toFixed(0).padStart(4)} KB / ${budget} KB` +
      `  (${chunks} chunks${missing ? `, ${missing} unresolved` : ''})`,
  );
  if (over) {
    console.error(
      `       over budget by ${(kb - budget).toFixed(0)} KB. Either trim the route or raise the` +
        ` budget in scripts/check-embed-size.js with a note saying why.`,
    );
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
