import Script from 'next/script';
import { getLocaleDirection } from '../../../lib/i18n';
import { logError } from '../../../lib/logger';

export function renderDocsEmbedErrorCard(
  locale: string,
  title: string,
  message: React.ReactNode,
  options?: {
    errorType?: string;
    logMessage?: string;
    context?: Record<string, unknown>;
  },
) {
  const dir = getLocaleDirection(locale);
  const consoleMessage = options?.logMessage || title;
  const errorType = options?.errorType || 'embed_error';
  const payload = {
    title,
    message: consoleMessage,
    errorType,
    scope: 'docs',
    ...(options?.context || {}),
  };
  const encodedPayload = encodeURIComponent(JSON.stringify(payload));

  logError('[Companin Docs Embed Error]', {
    errorType,
    title,
    message: consoleMessage,
    ...(options?.context || {}),
  });

  return (
    <div
      dir={dir}
      style={{
        margin: 0,
        padding: 16,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        backgroundColor: '#fef2f2',
        minHeight: '100vh',
        boxSizing: 'border-box',
      }}
    >
      <div style={{
        maxWidth: '500px',
        margin: '0 auto',
        padding: '24px',
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}>
        <h3 style={{
          color: '#dc2626',
          marginTop: 0,
          fontSize: '18px',
          fontWeight: '600',
        }}>
          {title}
        </h3>
        <Script src="/embed-error-reporter.js" data-error-payload={encodedPayload} strategy="afterInteractive" />
        {message}
      </div>
    </div>
  );
}
