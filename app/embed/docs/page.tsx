import DocsClient from "./DocsClient";
import { getLocaleDirection, getTranslations } from '../../../lib/i18n';
import { shouldEnforceEmbedTokenValidation, verifyEmbedToken } from '../../../lib/embedToken';

type Props = {
  searchParams: Promise<{
    clientId?: string;
    assistantId?: string;
    configId?: string;
    locale?: string;
    startOpen?: string;
    suggestions?: string;
    pagePath?: string;
  }>;
};

export default async function DocsPage({ searchParams }: Props) {
  const params = await searchParams;
  const { clientId, assistantId, configId, locale = "en", startOpen = "false", suggestions, pagePath } = params;

  // Parse suggestions if provided (comma-separated)
  const parsedSuggestions = suggestions ? suggestions.split(',').map(s => s.trim()).filter(s => s.length > 0) : undefined;

  const t = getTranslations(locale);

  // Validate required parameters
  if (!clientId || !assistantId || !configId) {
    const dir = getLocaleDirection(locale);
    return (
      <html lang={locale} dir={dir}>
        <head>
          <title>{t.docsConfigError as string}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
        </head>
        <body style={{
          margin: 0,
          padding: 16,
          fontFamily: "system-ui, -apple-system, sans-serif",
          backgroundColor: "#fef2f2"
        }}>
          <div style={{
            maxWidth: "500px",
            margin: "0 auto",
            padding: "24px",
            backgroundColor: "white",
            borderRadius: "8px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
          }}>
            <h3 style={{
              color: "#dc2626",
              marginTop: 0,
              fontSize: "18px",
              fontWeight: "600"
            }}>
              {t.docsConfigError as string}
            </h3>
            <p style={{ color: "#6b7280", fontSize: "14px", lineHeight: "1.6" }}>
              {t.widgetConfigMissingParams as string}
            </p>
            <ul style={{ color: "#6b7280", fontSize: "14px", lineHeight: "1.8" }}>
              <li><code style={{
                backgroundColor: "#f3f4f6",
                padding: "2px 6px",
                borderRadius: "4px",
                fontFamily: "monospace"
              }}>data-client-id</code></li>
              <li><code style={{
                backgroundColor: "#f3f4f6",
                padding: "2px 6px",
                borderRadius: "4px",
                fontFamily: "monospace"
              }}>data-assistant-id</code></li>
              <li><code style={{
                backgroundColor: "#f3f4f6",
                padding: "2px 6px",
                borderRadius: "4px",
                fontFamily: "monospace"
              }}>data-config-id</code></li>
            </ul>
            <p style={{
              color: "#6b7280",
              fontSize: "12px",
              marginTop: "24px",
              paddingTop: "16px",
              borderTop: "1px solid #e5e7eb"
            }}>
              Need help? Visit <a
                href="https://companin.tech/docs"
                style={{ color: "#2563eb", textDecoration: "none" }}
              >{t.widgetConfigOurDocumentation as string}</a>
            </p>
          </div>
        </body>
      </html>
    );
  }

  const shouldVerifyToken = shouldEnforceEmbedTokenValidation();
  if (shouldVerifyToken) {
    const secret = process.env.WIDGET_EMBED_TOKEN_SECRET;
    if (!secret) {
      const dir = getLocaleDirection(locale);
      return (
        <html lang={locale} dir={dir}>
          <head>
            <title>{t.docsConfigError as string}</title>
            <meta name="viewport" content="width=device-width, initial-scale=1" />
          </head>
          <body style={{
            margin: 0,
            padding: 16,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            backgroundColor: '#fef2f2',
          }}>
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
                {t.docsConfigError as string}
              </h3>
              <p style={{ color: '#6b7280', fontSize: '14px', lineHeight: '1.6' }}>
                Widget token verification is enabled but not configured correctly.
              </p>
            </div>
          </body>
        </html>
      );
    }

    const claims = verifyEmbedToken(clientId, secret, {
      requiredAudience: process.env.WIDGET_EMBED_TOKEN_AUDIENCE,
      requiredIssuer: process.env.WIDGET_EMBED_TOKEN_ISSUER,
      assistantId,
    });

    if (!claims) {
      const dir = getLocaleDirection(locale);
      return (
        <html lang={locale} dir={dir}>
          <head>
            <title>{t.docsConfigError as string}</title>
            <meta name="viewport" content="width=device-width, initial-scale=1" />
          </head>
          <body style={{
            margin: 0,
            padding: 16,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            backgroundColor: '#fef2f2',
          }}>
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
                Unauthorized widget request
              </h3>
              <p style={{ color: '#6b7280', fontSize: '14px', lineHeight: '1.6' }}>
                The embed token is invalid or expired. Please regenerate your widget snippet.
              </p>
            </div>
          </body>
        </html>
      );
    }
  }

  // Pass validated params to client component
  return <DocsClient
    clientId={clientId}
    assistantId={assistantId}
    configId={configId}
    locale={locale}
    startOpen={startOpen === "true"}
    suggestions={parsedSuggestions}
    pagePath={pagePath}
  />;
}