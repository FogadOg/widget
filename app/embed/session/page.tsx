import EmbedClient from './EmbedClient';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { getTranslations } from '../../../lib/i18n';
import {
  getEmbedTokenSecretsFromEnv,
  isJwtLikeClientId,
  shouldEnforceEmbedTokenValidation,
  verifyEmbedToken,
} from '../../../lib/embedToken';
import { renderSessionEmbedErrorCard } from './renderEmbedErrorCard';

type Props = {
  searchParams: Promise<{
    clientId?: string;
    agentId?: string;
    configId?: string;
    locale?: string;
    startOpen?: string;
    pagePath?: string;
    parentOrigin?: string;
    strictOrigin?: string;
    forceVariantId?: string;
    consentRequired?: string;
    loaderVersion?: string;
  }>;
};

function fromBase64Url(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  const padded = padding === 0 ? normalized : normalized + '='.repeat(4 - padding);
  return Buffer.from(padded, 'base64');
}

function parseClientIdFromClaims(claims: Record<string, unknown> | null | undefined): string | null {
  if (!claims) return null;
  const candidates = [claims.sub, claims.client_id, claims.clientId];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function decodeJwtPayloadUnsafe(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[1]) return null;
    return JSON.parse(fromBase64Url(parts[1]).toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export default async function EmbedPage({ searchParams }: Props) {
  const params = await searchParams;
  const {
    clientId,
    agentId,
    configId,
    locale = 'en',
    startOpen = 'false',
    pagePath,
    parentOrigin,
    strictOrigin,
    forceVariantId,
    consentRequired,
    loaderVersion,
  } = params;

  const t = getTranslations(locale);

  if (!clientId || !agentId || !configId) {
    return renderSessionEmbedErrorCard(
      locale,
      t.widgetConfigError as string,
      <>
        <p style={{ color: '#6b7280', fontSize: '14px', lineHeight: '1.6' }}>
          {t.widgetConfigMissingParams as string}
        </p>
        <ul style={{ color: '#6b7280', fontSize: '14px', lineHeight: '1.8' }}>
          <li><code style={{ backgroundColor: '#f3f4f6', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>data-client-id</code></li>
          <li><code style={{ backgroundColor: '#f3f4f6', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>data-agent-id</code></li>
          <li><code style={{ backgroundColor: '#f3f4f6', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>data-config-id</code></li>
        </ul>
        <p
          style={{
            color: '#6b7280',
            fontSize: '12px',
            marginTop: '24px',
            paddingTop: '16px',
            borderTop: '1px solid #e5e7eb',
          }}
        >
          Need help? Visit <a href="https://companin.tech/docs" style={{ color: '#2563eb', textDecoration: 'none' }}>{t.widgetConfigOurDocumentation as string}</a>
        </p>
      </>,
      {
        errorType: 'missing_params',
        logMessage: 'Missing required embed parameters.',
        context: { locale, hasClientId: !!clientId, hasAgentId: !!agentId, hasConfigId: !!configId },
      }
    );
  }

  let resolvedClientId = clientId;
  const shouldVerifyToken = shouldEnforceEmbedTokenValidation();

  if (isJwtLikeClientId(clientId)) {
    const secrets = getEmbedTokenSecretsFromEnv();
    let verifiedClaims: Record<string, unknown> | null = null;

    if (shouldVerifyToken) {
      if (secrets.length === 0) {
        return renderSessionEmbedErrorCard(
          locale,
          t.widgetConfigError as string,
          <p style={{ color: '#6b7280', fontSize: '14px', lineHeight: '1.6' }}>
            Widget token verification is enabled but not configured correctly.
          </p>,
          {
            errorType: 'token_config_error',
            logMessage: 'JWT enforcement is enabled but no widget embed token secret is configured.',
            context: { locale, agentId, hasCurrentSecret: !!process.env.WIDGET_EMBED_TOKEN_SECRET },
          }
        );
      }

      verifiedClaims = verifyEmbedToken(clientId, secrets, {
        requiredAudience: process.env.WIDGET_EMBED_TOKEN_AUDIENCE,
        requiredIssuer: process.env.WIDGET_EMBED_TOKEN_ISSUER,
        agentId,
      }) as Record<string, unknown> | null;

      if (!verifiedClaims) {
        return renderSessionEmbedErrorCard(
          locale,
          'Unauthorized widget request',
          <p style={{ color: '#6b7280', fontSize: '14px', lineHeight: '1.6' }}>
            The embed token is invalid or expired. Please regenerate your widget snippet.
          </p>,
          {
            errorType: 'invalid_token',
            logMessage: 'Embed token verification failed. The token is invalid, expired, or signed with an unexpected secret.',
            context: {
              locale,
              agentId,
              hasAudience: !!process.env.WIDGET_EMBED_TOKEN_AUDIENCE,
              hasIssuer: !!process.env.WIDGET_EMBED_TOKEN_ISSUER,
              acceptedSecretCount: secrets.length,
            },
          }
        );
      }
    } else if (secrets.length > 0) {
      verifiedClaims = verifyEmbedToken(clientId, secrets, {
        requiredAudience: process.env.WIDGET_EMBED_TOKEN_AUDIENCE,
        requiredIssuer: process.env.WIDGET_EMBED_TOKEN_ISSUER,
        agentId,
      }) as Record<string, unknown> | null;
    }

    const fallbackClaims = !shouldVerifyToken && !verifiedClaims
      ? decodeJwtPayloadUnsafe(clientId)
      : null;
    const embeddedClientId = parseClientIdFromClaims(verifiedClaims || fallbackClaims);
    if (embeddedClientId) {
      resolvedClientId = embeddedClientId;
    }
  }

  return (
    <ErrorBoundary>
      <EmbedClient
        clientId={resolvedClientId}
        agentId={agentId}
        configId={configId}
        locale={locale}
        startOpen={startOpen === 'true'}
        pagePath={pagePath}
        parentOrigin={parentOrigin}
        strictOrigin={strictOrigin === 'true'}
        forceVariantId={forceVariantId}
        consentRequired={consentRequired === 'true'}
        loaderVersion={loaderVersion}
      />
    </ErrorBoundary>
  );
}
