'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { t as translate, getLocaleDirection } from '../lib/i18n';

/**
 * Segment boundary for render errors below the root layout — which is every
 * route, including `/embed/session` and `/embed/docs`.
 *
 * Without this, a client render error in the widget shows the visitor a blank
 * iframe on the customer's site and reports nothing. See `global-error.tsx` for
 * the root-layout case it cannot catch.
 *
 * Styles are inline and the copy is resolved off the URL locale so this renders
 * correctly even when the failure happened before the app's providers mounted.
 */
export default function EmbedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Companin Widget Error]', error);
    Sentry.captureException(error);
  }, [error]);

  let locale = 'en';
  try {
    locale = new URLSearchParams(window.location.search).get('locale') || 'en';
  } catch {
    /* window unavailable — English is the fallback */
  }

  return (
    <div
      dir={getLocaleDirection(locale)}
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
        background: 'var(--background, #ffffff)',
        color: 'var(--foreground, #0a0a0a)',
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
          background: 'transparent',
          color: 'inherit',
          padding: '0.5rem 1rem',
          font: 'inherit',
          fontSize: '0.875rem',
        }}
      >
        {translate(locale, 'retry')}
      </button>
    </div>
  );
}
