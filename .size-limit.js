// Whole-app bundle ceiling.
//
// NOTE: this glob sums EVERY route's chunks — marketing pages, /dev, /preview,
// the docs site and both embed routes — into one number (~2.63 MB gzipped as of
// 2026-09-14). It is a coarse ceiling against runaway growth, not a measure of
// what a visitor downloads.
//
// The number that actually matters for an embedded widget is the per-route
// payload, and chunk filenames are content-hashed so no glob can select one
// route's chunks. That check lives in `scripts/check-embed-size.js`, which reads
// Next's client-reference manifest per route:
//
//   /embed/session   359 KB gzipped  (the chat widget)
//   /embed/docs      412 KB gzipped  (the docs widget)
//
// Both run in CI via `npm run ci:size-limit`.
module.exports = [
  {
    path: '.next/static/chunks/*.js',
    limit: '2.8 MB',
    gzip: true,
  },
];
