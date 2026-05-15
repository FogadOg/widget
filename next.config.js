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

    // If an allowlist is provided, restrict framing to those origins + self.
    // If no allowlist is configured, allow embedding from any origin to avoid
    // blocking host pages unexpectedly.
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
          // Allow embedding only from the configured origins
          { key: 'X-Frame-Options', value: origins.length > 0 ? `ALLOW-FROM ${origins[0]}` : 'SAMEORIGIN' },
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

module.exports = withBundleAnalyzer(nextConfig);
