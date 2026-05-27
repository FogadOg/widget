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
  it('returns status ok', async () => {
    const response = GET();
    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  it('returns a timestamp', async () => {
    const before = Date.now();
    const response = GET();
    const after = Date.now();
    const body = await response.json();
    const ts = new Date(body.timestamp).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('returns 200', () => {
    const response = GET();
    expect(response.status).toBe(200);
  });
});
