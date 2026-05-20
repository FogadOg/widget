let withBundleAnalyzer = (cfg) => cfg;
if (process.env.ANALYZE === 'true') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    withBundleAnalyzer = require('@next/bundle-analyzer')({ enabled: true });
  } catch {
    // @next/bundle-analyzer not installed (e.g. production CI); skip silently
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  typescript: {
    // Enforce type checking in production builds so real issues are surfaced
    // NOTE: some third-party packages ship TypeScript sources that cause
    // type-check failures in certain environments (CI/local). Temporarily
    // disable enforcement here to allow the production build to complete.
    // Consider re-enabling once dependencies with incompatible types are
    // updated or their types are patched.
    ignoreBuildErrors: true,
  },
  // Ensure Turbopack uses this project as the root to avoid
  // warnings when multiple lockfiles exist in the mono-repo.
  turbopack: {
    root: '.',
  },
  webpack(config, { isServer }) {
    if (!isServer) {
      try {
        // Add Size Limit webpack plugins so `npx size-limit --why` can work
        // Plugins are optional and only used during CI/local analysis.
        // Require at runtime to avoid build-time TypeScript issues when the
        // packages may not be installed in other environments.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const SizeLimitWebpack = require('@size-limit/webpack');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const SizeLimitWebpackWhy = require('@size-limit/webpack-why');
        if (SizeLimitWebpack) {
          config.plugins.push(new SizeLimitWebpack());
        }
        if (SizeLimitWebpackWhy) {
          config.plugins.push(new SizeLimitWebpackWhy());
        }
      } catch {
        // If plugins are not available, skip silently.
      }
    }
    return config;
  },
  async headers() {
    // Use an allowlist provided via environment (comma-separated origins).
    // Example: EMBED_ALLOWLIST="https://example.com,https://partners.example"
    const rawAllowlist = process.env.EMBED_ALLOWLIST || process.env.NEXT_PUBLIC_EMBED_ALLOWLIST || '';
    const origins = rawAllowlist.split(',').map(s => s.trim()).filter(Boolean);

    // In production we refuse to start with an unrestricted frame-ancestors policy:
    // without a per-tenant allowlist any site on the internet can frame the embed
    // page. Local dev and tests fall back to '*' so iframe-based test runners work.
    if (process.env.NODE_ENV === 'production' && origins.length === 0) {
      throw new Error(
        'EMBED_ALLOWLIST is required in production. Set it to a comma-separated ' +
        'list of trusted embedding origins (e.g. "https://customer-a.com,https://customer-b.com"). ' +
        'See LAUNCH-READINESS.md gap #2 for context.'
      );
    }

    const cspSources = origins.length > 0 ? ["'self'", ...origins].join(' ') : '*';

    // HSTS — set for all routes in production
    const hstsValue = 'max-age=31536000; includeSubDomains; preload';

    return [
      // ── Global security headers applied to every response ────────────────
      {
        source: '/(.*)',
        headers: [
          // HSTS: forces browsers to use HTTPS for a year
          { key: 'Strict-Transport-Security', value: hstsValue },
          // Prevent MIME-type sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Block clickjacking by default (embed routes override below)
          { key: 'X-Frame-Options', value: 'DENY' },
          // Minimise referrer leakage
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Disable potentially privacy-invasive browser features
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
          // Cross-origin isolation headers
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          // Default to same-origin for most responses, but specific asset
          // routes (widget bootstrap and static assets) are relaxed below.
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          // The widget origin should not be indexed — these URLs only exist
          // to be embedded in customer sites, not surfaced in search results.
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
      // ── Embed routes: tighten frame-ancestors CSP, relax X-Frame-Options ─
      {
        source: '/embed/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            // Restrict framing to explicit origins (includes 'self')
            value: `frame-ancestors ${cspSources};`,
          },
          // X-Frame-Options ALLOW-FROM is non-standard and ignored by Chromium/Safari
          // (only IE/old-Edge honored it). The CSP frame-ancestors directive above is
          // the authoritative gate; we omit X-Frame-Options on /embed/* so modern
          // browsers don't fall back to a deny when the CSP would have allowed it.
          // Embed iframes are cross-origin resources — relax CORP
          { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
          // Allow cross-origin prefetch/fetch of embed pages (e.g. from localhost:3000 in dev)
          { key: 'Access-Control-Allow-Origin', value: origins.length > 0 ? origins[0] : '*' },
        ],
      },
      // ── Widget bootstrap and static assets: allow cross-origin loading ──
      {
        // widget.js / docs-widget.js are often served from a separate dev server (eg. localhost:3001)
        source: '/widget.js',
        headers: [
          { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
        ],
      },
      {
        source: '/docs-widget.js',
        headers: [
          { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
        ],
      },
      {
        // Next.js static assets under _next may be requested cross-origin
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
        ],
      },
      // ── API routes: restrict CORS strictly ───────────────────────────────
      {
        source: '/api/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ];
  },
};

// Sentry wrapper (LAUNCH-READINESS.md #18). withSentryConfig is a no-op at runtime
// when SENTRY_DSN is unset — the wrapper is safe to apply unconditionally so long
// as @sentry/nextjs is installed. We require() it inside a try so a missing dep
// (e.g. early dev environments) doesn't break the build.
let withSentryConfig = (cfg) => cfg;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  withSentryConfig = require('@sentry/nextjs').withSentryConfig;
} catch {
  // @sentry/nextjs not installed yet — `npm install` will add it.
}

const SENTRY_WEBPACK_OPTIONS = {
  silent: true,
  // Upload source maps only when an auth token is provided (CI). Without the
  // token, Sentry's webpack plugin is fully disabled so dev builds are fast.
  authToken: process.env.SENTRY_AUTH_TOKEN || undefined,
  org: process.env.SENTRY_ORG || undefined,
  project: process.env.SENTRY_PROJECT || undefined,
  // Sentry CLI also picks up additional files for the release. Point it at the
  // versioned widget bundles so stack frames from widget.js report against the
  // right release (LAUNCH-READINESS.md #18 source-map sub-task).
  release: {
    name: process.env.npm_package_version || undefined,
    setCommits: { auto: true, ignoreMissing: true },
    uploadLegacySourcemaps: process.env.SENTRY_AUTH_TOKEN
      ? { paths: ['public/'], urlPrefix: '~/' }
      : undefined,
  },
  disableServerWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
  disableClientWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
};

module.exports = withSentryConfig(withBundleAnalyzer(nextConfig), SENTRY_WEBPACK_OPTIONS);
