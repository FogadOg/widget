import EmbedClient from './EmbedClient';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { getLocaleDirection, getTranslations } from '../../../lib/i18n';
import { shouldEnforceEmbedTokenValidation, verifyEmbedToken } from '../../../lib/embedToken';

type Props = {
  searchParams: Promise<{
    clientId?: string;
    assistantId?: string;
    configId?: string;
    locale?: string;
    startOpen?: string;
    pagePath?: string;
    parentOrigin?: string;
    strictOrigin?: string;
    forceVariantId?: string;
    consentRequired?: string;
  }>;
};

function renderEmbedErrorCard(
  locale: string,
  title: string,
  message: React.ReactNode,
) {
  const dir = getLocaleDirection(locale);

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
        {message}
      </div>
    </div>
  );
}

export default async function EmbedPage({ searchParams }: Props) {
  const params = await searchParams;
  const { clientId, assistantId, configId, locale = "en", startOpen = "false", pagePath, parentOrigin, strictOrigin, forceVariantId, consentRequired } = params;

  const t = getTranslations(locale);

  // Validate required parameters
  if (!clientId || !assistantId || !configId) {
    return (
      renderEmbedErrorCard(
        locale,
        t.widgetConfigError as string,
        <>
          <p style={{ color: '#6b7280', fontSize: '14px', lineHeight: '1.6' }}>
            {t.widgetConfigMissingParams as string}
          </p>
          <ul style={{ color: '#6b7280', fontSize: '14px', lineHeight: '1.8' }}>
            <li><code style={{ backgroundColor: '#f3f4f6', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>data-client-id</code></li>
            <li><code style={{ backgroundColor: '#f3f4f6', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>data-assistant-id</code></li>
            <li><code style={{ backgroundColor: '#f3f4f6', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>data-config-id</code></li>
          </ul>
          <p style={{
            color: '#6b7280',
            fontSize: '12px',
            marginTop: '24px',
            paddingTop: '16px',
            borderTop: '1px solid #e5e7eb',
          }}>
            Need help? Visit <a href="https://companin.tech/docs" style={{ color: '#2563eb', textDecoration: 'none' }}>{t.widgetConfigOurDocumentation as string}</a>
          </p>
        </>
      )
    );
  }

  const shouldVerifyToken = shouldEnforceEmbedTokenValidation();
  if (shouldVerifyToken) {
    const secret = process.env.WIDGET_EMBED_TOKEN_SECRET;
    if (!secret) {
      // Fail closed when JWT enforcement is enabled but secret is missing.
      return (
        renderEmbedErrorCard(
          locale,
          t.widgetConfigError as string,
          <p style={{ color: '#6b7280', fontSize: '14px', lineHeight: '1.6' }}>
            Widget token verification is enabled but not configured correctly.
          </p>
        )
      );
    }

    const claims = verifyEmbedToken(clientId, secret, {
      requiredAudience: process.env.WIDGET_EMBED_TOKEN_AUDIENCE,
      requiredIssuer: process.env.WIDGET_EMBED_TOKEN_ISSUER,
      assistantId,
    });

    if (!claims) {
      return (
        renderEmbedErrorCard(
          locale,
          'Unauthorized widget request',
          <p style={{ color: '#6b7280', fontSize: '14px', lineHeight: '1.6' }}>
            The embed token is invalid or expired. Please regenerate your widget snippet.
          </p>
        )
      );
    }
  }

  // Pass validated params to client component wrapped in error boundary
  return (
    <ErrorBoundary>
      <EmbedClient
        clientId={clientId}
        assistantId={assistantId}
        configId={configId}
        locale={locale}
        startOpen={startOpen === "true"}
        pagePath={pagePath}
        parentOrigin={parentOrigin}
        strictOrigin={strictOrigin === "true"}
        forceVariantId={forceVariantId}
        consentRequired={consentRequired === "true"}
      />
    </ErrorBoundary>
  );
}
