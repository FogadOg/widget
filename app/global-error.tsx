'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { t as translate, getLocaleDirection } from '../lib/i18n';

/**
 * Last-resort boundary for failures in the ROOT layout itself.
 *
 * Next replaces the whole document when this renders, so it owns its own
 * `<html>`/`<body>` and cannot rely on the app's providers, tokens or
 * stylesheet — every style here is inline on purpose.
 *
 * This matters more for the widget than for a normal app: the widget renders
 * inside an iframe on someone else's site, and without a boundary a render error
 * leaves the customer's visitor staring at a blank frame with nothing reported.
 * That blank-frame failure mode is the one `renderSessionEmbedErrorCard` already
 * guards on the server path; this covers the client render.
 *
 * Locale is read from the URL because no provider is available here — the embed
 * is always loaded with `?locale=…` by the loader.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Companin Widget GlobalError:root]', error);
    Sentry.captureException(error);
  }, [error]);

  let locale = 'en';
  try {
    locale = new URLSearchParams(window.location.search).get('locale') || 'en';
  } catch {
    /* window unavailable during a failed hydration — English is the fallback */
  }

  return (
    <html lang={locale} dir={getLocaleDirection(locale)}>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.75rem',
          padding: '1.5rem',
          textAlign: 'center',
          background: '#ffffff',
          color: '#0a0a0a',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          boxSizing: 'border-box',
        }}
      >
        <p style={{ margin: 0, fontSize: '0.875rem' }}>{translate(locale, 'serverError')}</p>
        {error.digest ? (
          <p style={{ margin: 0, fontSize: '0.75rem', color: '#71717a' }}>
            {`Reference: ${error.digest}`}
          </p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          style={{
            cursor: 'pointer',
            borderRadius: '0.625rem',
            border: '1px solid #e4e4e7',
            background: '#ffffff',
            color: 'inherit',
            padding: '0.5rem 1rem',
            font: 'inherit',
            fontSize: '0.875rem',
          }}
        >
          {translate(locale, 'retry')}
        </button>
      </body>
    </html>
  );
}
