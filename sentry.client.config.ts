/**
 * Client-side Sentry init (LAUNCH-READINESS.md gap #18).
 *
 * No-ops when SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN is unset, so local dev
 * doesn't need a DSN. In production we attach widget_version / locale tags
 * to every event so the launch-day owner can slice by deploy.
 */
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_WIDGET_VERSION || undefined,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.1,
    // Tunnel through our own endpoint so ad blockers don't drop events. Wire
    // /api/monitoring/tunnel if you need this; until then events go direct.
    // tunnel: '/api/monitoring/tunnel',
    beforeSend(event) {
      try {
        if (typeof window !== 'undefined') {
          event.tags = {
            ...(event.tags || {}),
            widget_version: (window as { __COMPANIN_WIDGET_VERSION__?: string }).__COMPANIN_WIDGET_VERSION__,
            locale: (typeof document !== 'undefined' && document.documentElement?.lang) || undefined,
          };
        }
      } catch {}
      return event;
    },
  });
}
