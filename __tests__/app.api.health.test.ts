jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      json: async () => body,
      status: init?.status ?? 200,
    }),
  },
}));

import { GET } from '../app/api/health/route';

describe('GET /api/health', () => {
  let savedApiBaseUrl: string | undefined;
  let savedHealthcheckUrl: string | undefined;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    savedApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
    savedHealthcheckUrl = process.env.HEALTHCHECK_UPSTREAM_URL;
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    delete process.env.HEALTHCHECK_UPSTREAM_URL;
    mockFetch = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    if (savedApiBaseUrl !== undefined) {
      process.env.NEXT_PUBLIC_API_BASE_URL = savedApiBaseUrl;
    } else {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
    }
    if (savedHealthcheckUrl !== undefined) {
      process.env.HEALTHCHECK_UPSTREAM_URL = savedHealthcheckUrl;
    } else {
      delete process.env.HEALTHCHECK_UPSTREAM_URL;
    }
  });

  it('returns status ok', async () => {
    const response = await GET();
    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  it('returns a timestamp', async () => {
    const before = Date.now();
    const response = await GET();
    const after = Date.now();
    const body = await response.json();
    const ts = new Date(body.timestamp).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('returns 200', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
  });

  it('returns app and upstream checks', async () => {
    const response = await GET();
    const body = await response.json();
    expect(body.checks.app.status).toBe('ok');
    expect(['ok', 'error', 'skipped']).toContain(body.checks.upstreamApi.status);
  });

  it('skips upstream check and returns skipped detail when no URL is configured', async () => {
    const response = await GET();
    const body = await response.json();
    expect(body.checks.upstreamApi.status).toBe('skipped');
    expect(body.checks.upstreamApi.detail).toBeTruthy();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('checks upstream via NEXT_PUBLIC_API_BASE_URL and returns ok when it succeeds', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'http://example.com';
    const response = await GET();
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(response.status).toBe(200);
    expect(body.checks.upstreamApi.status).toBe('ok');
    expect(body.checks.upstreamApi.url).toBe('http://example.com/api/health');
    expect(mockFetch).toHaveBeenCalled();
  });

  it('uses HEALTHCHECK_UPSTREAM_URL directly when set', async () => {
    process.env.HEALTHCHECK_UPSTREAM_URL = 'http://custom.example.com/health';
    const response = await GET();
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://custom.example.com/health',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('returns degraded when upstream returns non-ok status', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'http://example.com';
    mockFetch.mockResolvedValue({ ok: false, status: 503 });
    const response = await GET();
    const body = await response.json();
    expect(body.status).toBe('degraded');
    expect(response.status).toBe(503);
    expect(body.checks.upstreamApi.status).toBe('error');
    expect(body.checks.upstreamApi.detail).toBe('HTTP 503');
  });

  it('returns degraded and timeout detail when upstream request is aborted', async () => {
    process.env.HEALTHCHECK_UPSTREAM_URL = 'http://example.com/health';
    const abortError = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    mockFetch.mockRejectedValue(abortError);
    const response = await GET();
    const body = await response.json();
    expect(body.status).toBe('degraded');
    expect(body.checks.upstreamApi.detail).toContain('timeout');
  });

  it('returns degraded with request failed detail on general network error', async () => {
    process.env.HEALTHCHECK_UPSTREAM_URL = 'http://example.com/health';
    mockFetch.mockRejectedValue(new TypeError('fetch failed'));
    const response = await GET();
    const body = await response.json();
    expect(body.status).toBe('degraded');
    expect(body.checks.upstreamApi.detail).toBe('request failed');
  });

  it('skips upstream check when NEXT_PUBLIC_API_BASE_URL is not a valid URL', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'not-a-valid-url';
    const response = await GET();
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.checks.upstreamApi.status).toBe('skipped');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
