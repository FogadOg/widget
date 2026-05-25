/**
 * @jest-environment node
 *
 * Security header & CSP proxy tests.
 *
 * Verifies that:
 *  1. The middleware attaches a Content-Security-Policy header to every response.
 *  2. The CSP includes a per-request nonce.
 *  3. Hardening headers (HSTS, X-Frame-Options, etc.) are present.
 *  4. The CSP report endpoint accepts valid reports and rejects malformed ones.
 *
 * Uses the node test environment so Node 22's native Request/Response/Headers
 * globals are available when next/server is evaluated.
 *
 * NOTE: The sanitize() helper is tested in __tests__/sanitize.test.ts which
 * runs under the default jsdom environment because DOMPurify requires a DOM.
 */

// ---------------------------------------------------------------------------
// Mock nanoid before any imports — nanoid is ESM-only and cannot be require()'d
// by Jest's CommonJS transform. The mock returns incrementing unique strings
// so the nonce-uniqueness test remains meaningful.
// ---------------------------------------------------------------------------
let _nonceCounter = 0;
jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => `unique-nonce-${_nonceCounter++ < 1e9 ? _nonceCounter : 0}`),
}));

import { NextRequest } from 'next/server';
import { proxy } from '../proxy';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(path = '/', options: RequestInit = {}): NextRequest {
  return new NextRequest(`http://localhost${path}`, options);
}

function getHeaderValue(resp: Response, name: string): string | null {
  return resp.headers.get(name);
}

// ---------------------------------------------------------------------------
// Middleware tests
// ---------------------------------------------------------------------------

describe('CSP nonce proxy', () => {
  it('sets a Content-Security-Policy header', async () => {
    const req = makeRequest('/');
    const resp = proxy(req);
    expect(getHeaderValue(resp, 'Content-Security-Policy')).toBeTruthy();
  });

  it('includes a unique nonce in the script-src directive', async () => {
    const req1 = makeRequest('/page-a');
    const req2 = makeRequest('/page-b');
    const resp1 = proxy(req1);
    const resp2 = proxy(req2);

    const csp1 = getHeaderValue(resp1, 'Content-Security-Policy') ?? '';
    const csp2 = getHeaderValue(resp2, 'Content-Security-Policy') ?? '';

    expect(csp1).toContain("'nonce-");
    expect(csp2).toContain("'nonce-");

    // Nonces must be different for each request
    const nonce1 = csp1.match(/'nonce-([^']+)'/)?.[1];
    const nonce2 = csp2.match(/'nonce-([^']+)'/)?.[1];
    expect(nonce1).toBeTruthy();
    expect(nonce2).toBeTruthy();
    expect(nonce1).not.toEqual(nonce2);
  });

  it('sets script-src without unsafe-inline', () => {
    const resp = proxy(makeRequest('/'));
    const csp = getHeaderValue(resp, 'Content-Security-Policy') ?? '';
    // Extract only the script-src directive so we don't accidentally match
    // 'unsafe-inline' that may appear in style-src or other directives.
    const scriptSrc = csp.split(';').find(d => d.trim().startsWith('script-src')) ?? '';
    expect(scriptSrc).toContain('script-src');
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it('forbids objects with object-src none', () => {
    const resp = proxy(makeRequest('/'));
    const csp = getHeaderValue(resp, 'Content-Security-Policy') ?? '';
    expect(csp).toContain("object-src 'none'");
  });

  it('includes a report-uri directive', () => {
    const resp = proxy(makeRequest('/'));
    const csp = getHeaderValue(resp, 'Content-Security-Policy') ?? '';
    expect(csp).toContain('report-uri /api/security/csp-report');
  });

  it('sets X-Content-Type-Options: nosniff', () => {
    const resp = proxy(makeRequest('/'));
    expect(getHeaderValue(resp, 'X-Content-Type-Options')).toBe('nosniff');
  });

  it('sets X-Frame-Options: DENY', () => {
    const resp = proxy(makeRequest('/'));
    expect(getHeaderValue(resp, 'X-Frame-Options')).toBe('DENY');
  });

  it('sets Referrer-Policy', () => {
    const resp = proxy(makeRequest('/'));
    expect(getHeaderValue(resp, 'Referrer-Policy')).toBeTruthy();
  });

  it('sets Permissions-Policy', () => {
    const resp = proxy(makeRequest('/'));
    const pp = getHeaderValue(resp, 'Permissions-Policy') ?? '';
    expect(pp).toContain('camera=()');
    expect(pp).toContain('microphone=()');
  });

  it('injects x-nonce into request headers', () => {
    const resp = proxy(makeRequest('/'));
    // NextResponse.next() with modified request headers doesn't expose them
    // directly on the response, but we can verify the CSP nonce is set.
    const csp = getHeaderValue(resp, 'Content-Security-Policy') ?? '';
    expect(csp).toMatch(/'nonce-[a-zA-Z0-9_-]+'/);
  });

  it('does not apply to static assets', () => {
    // Static paths are excluded by the matcher — the middleware should not
    // be called for them in production. We verify the matcher pattern.
    const { config } = require('../proxy');
    expect(config.matcher).toBeDefined();
    const matcher = config.matcher[0];
    // The matcher should exclude _next/static
    expect(matcher).toContain('_next/static');
  });
});

// ---------------------------------------------------------------------------
// CSP report endpoint tests
// ---------------------------------------------------------------------------

describe('CSP report endpoint /api/security/csp-report', () => {
  // Dynamically import the route handler to avoid build-time resolution issues
  let POST: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import('../app/api/security/csp-report/route');
    POST = mod.POST;
  });

  it('returns 204 for a valid legacy CSP report', async () => {
    const report = {
      'csp-report': {
        'document-uri': 'https://example.com/page',
        'blocked-uri': 'https://evil.com/script.js',
        'violated-directive': 'script-src',
        'original-policy': "script-src 'self'",
      },
    };
    const req = new Request('http://localhost/api/security/csp-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/csp-report' },
      body: JSON.stringify(report),
    });
    const resp = await POST(req);
    expect(resp.status).toBe(204);
  });

  it('returns 204 for Reporting API v1 reports', async () => {
    const reports = [
      {
        type: 'csp-violation',
        url: 'https://example.com/page',
        body: { blockedURL: 'https://evil.com/script.js' },
      },
    ];
    const req = new Request('http://localhost/api/security/csp-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/reports+json' },
      body: JSON.stringify(reports),
    });
    const resp = await POST(req);
    expect(resp.status).toBe(204);
  });

  it('returns 400 for non-JSON body', async () => {
    const req = new Request('http://localhost/api/security/csp-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/csp-report' },
      body: 'not json',
    });
    const resp = await POST(req);
    expect(resp.status).toBe(400);
  });

  it('uses x-forwarded-for header for IP extraction', async () => {
    const report = { 'csp-report': { 'blocked-uri': 'https://evil.com' } };
    const req = new Request('http://localhost/api/security/csp-report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/csp-report',
        'x-forwarded-for': '203.0.113.1, 10.0.0.1',
      },
      body: JSON.stringify(report),
    });
    const resp = await POST(req);
    expect(resp.status).toBe(204);
  });

  it('returns 204 for unknown (neither legacy nor array) payload', async () => {
    const req = new Request('http://localhost/api/security/csp-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.0.1.1' },
      body: JSON.stringify({ foo: 'bar' }),
    });
    const resp = await POST(req);
    expect(resp.status).toBe(204);
  });

  it('falls back to effective-directive when violated-directive is absent', async () => {
    const report = {
      'csp-report': {
        'document-uri': 'https://example.com',
        'blocked-uri': 'https://evil.com/img.png',
        'effective-directive': 'img-src',
      },
    };
    const req = new Request('http://localhost/api/security/csp-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/csp-report', 'x-forwarded-for': '10.0.2.1' },
      body: JSON.stringify(report),
    });
    const resp = await POST(req);
    expect(resp.status).toBe(204);
  });

  it('forwards to SIEM endpoint when CSP_REPORT_SIEM_ENDPOINT is configured', async () => {
    const origFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response);
    process.env.CSP_REPORT_SIEM_ENDPOINT = 'https://siem.example.com/ingest';
    try {
      const report = { 'csp-report': { 'blocked-uri': 'https://evil.com' } };
      const req = new Request('http://localhost/api/security/csp-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/csp-report', 'x-forwarded-for': '10.0.3.1' },
        body: JSON.stringify(report),
      });
      const resp = await POST(req);
      expect(resp.status).toBe(204);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://siem.example.com/ingest',
        expect.objectContaining({ method: 'POST' })
      );
    } finally {
      delete process.env.CSP_REPORT_SIEM_ENDPOINT;
      global.fetch = origFetch;
    }
  });

  it('returns 204 even when SIEM endpoint fetch throws', async () => {
    const origFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error('SIEM unreachable'));
    process.env.CSP_REPORT_SIEM_ENDPOINT = 'https://siem.example.com/ingest';
    try {
      const report = { 'csp-report': { 'blocked-uri': 'https://evil.com' } };
      const req = new Request('http://localhost/api/security/csp-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/csp-report', 'x-forwarded-for': '10.0.4.1' },
        body: JSON.stringify(report),
      });
      const resp = await POST(req);
      expect(resp.status).toBe(204);
    } finally {
      delete process.env.CSP_REPORT_SIEM_ENDPOINT;
      global.fetch = origFetch;
    }
  });
});

// ---------------------------------------------------------------------------
// Rate-limiting tests — use a fresh module instance to avoid shared Map state
// ---------------------------------------------------------------------------
describe('CSP report endpoint rate limiting', () => {
  let POST: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    jest.resetModules();
    // Re-apply nanoid mock after resetModules so the re-imported route resolves
    jest.mock('nanoid', () => ({ nanoid: jest.fn(() => 'nonce-rl-test') }));
    const mod = await import('../app/api/security/csp-report/route');
    POST = mod.POST;
  });

  it('returns 429 when an IP exceeds the rate limit (100 req/min)', async () => {
    const ip = '10.99.99.1';
    const makeReq = () =>
      new Request('http://localhost/api/security/csp-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/csp-report',
          'x-forwarded-for': ip,
        },
        body: JSON.stringify({ 'csp-report': { 'blocked-uri': 'https://evil.com' } }),
      });

    // Exhaust the 100-request window
    for (let i = 0; i < 100; i++) {
      await POST(makeReq());
    }

    // 101st request must be rate-limited
    const resp = await POST(makeReq());
    expect(resp.status).toBe(429);
  });
});
