import { NextResponse } from 'next/server';

const HEALTH_TIMEOUT_MS = 2500;

function resolveUpstreamHealthUrl(): string | null {
  const explicit = process.env.HEALTHCHECK_UPSTREAM_URL?.trim();
  if (explicit) {
    return explicit;
  }

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (!apiBase) {
    return null;
  }

  try {
    return new URL('/api/health', apiBase).toString();
  } catch {
    return null;
  }
}

async function checkUpstreamApi(url: string): Promise<{ ok: boolean; detail?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return { ok: false, detail: `HTTP ${response.status}` };
    }
    return { ok: true };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, detail: `timeout after ${HEALTH_TIMEOUT_MS}ms` };
    }
    return { ok: false, detail: 'request failed' };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const upstreamUrl = resolveUpstreamHealthUrl();
  const upstreamCheck = upstreamUrl === null ? null : await checkUpstreamApi(upstreamUrl);

  const degraded = upstreamCheck !== null && !upstreamCheck.ok;

  return NextResponse.json(
    {
      status: degraded ? 'degraded' : 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      checks: {
        app: { status: 'ok' },
        upstreamApi:
          upstreamCheck === null
            ? {
                status: 'skipped',
                detail: 'NEXT_PUBLIC_API_BASE_URL or HEALTHCHECK_UPSTREAM_URL not configured',
              }
            : {
                status: upstreamCheck.ok ? 'ok' : 'error',
                url: upstreamUrl!,
                ...(upstreamCheck.detail ? { detail: upstreamCheck.detail } : {}),
              },
      },
    },
    { status: degraded ? 503 : 200 }
  );
}
