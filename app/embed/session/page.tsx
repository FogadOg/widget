import EmbedClient from './EmbedClient';

import ErrorBoundary from '../../../components/ErrorBoundary';

import { getTranslations } from '../../../lib/i18n';

import { getEmbedTokenSecretsFromEnv, isJwtLikeClientId, shouldEnforceEmbedTokenValidation, verifyEmbedToken } from '../../../lib/embedToken';

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

export default async function EmbedPage({ searchParams }: Props) {

  const params = await searchParams;

  const { clientId, agentId, configId, locale = "en", startOpen = "false", pagePath, parentOrigin, strictOrigin, forceVariantId, consentRequired, loaderVersion } = params;

  const t = getTranslations(locale);

  // Validate required parameters

  if (!clientId || !agentId || !configId) {

    return (

      renderSessionEmbedErrorCard(

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

          <p style={{

            color: '#6b7280',

            fontSize: '12px',

            marginTop: '24px',

            paddingTop: '16px',

            borderTop: '1px solid #e5e7eb',

          }}>

            Need help? Visit <a href="https://companin.tech/docs" style={{ color: '#2563eb', textDecoration: 'none' }}>{t.widgetConfigOurDocumentation as string}</a>

          </p>

        </>,

        {

          errorType: 'missing_params',

          logMessage: 'Missing required embed parameters.',

          context: { locale, hasClientId: !!clientId, hasAgentId: !!agentId, hasConfigId: !!configId },

        }

      )

    );

  }

  const shouldVerifyToken = shouldEnforceEmbedTokenValidation();

  if (shouldVerifyToken) {

    const secrets = getEmbedTokenSecretsFromEnv();

    if (secrets.length === 0) {

      // Fail closed when JWT enforcement is enabled but secret is missing.

      return (

        renderSessionEmbedErrorCard(

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

        )

      );

    }

    if (isJwtLikeClientId(clientId)) {

      const claims = verifyEmbedToken(clientId, secrets, {

        requiredAudience: process.env.WIDGET_EMBED_TOKEN_AUDIENCE,

        requiredIssuer: process.env.WIDGET_EMBED_TOKEN_ISSUER,

        agentId,

      });

      if (!claims) {

        return (

          renderSessionEmbedErrorCard(

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

          )

        );

      }

    }

  }

  // Pass validated params to client component wrapped in error boundary

  return (

    <ErrorBoundary>

      <EmbedClient

        clientId={clientId}

        agentId={agentId}

        configId={configId}

        locale={locale}

        startOpen={startOpen === "true"}

        pagePath={pagePath}

        parentOrigin={parentOrigin}

        strictOrigin={strictOrigin === "true"}

        forceVariantId={forceVariantId}

        consentRequired={consentRequired === "true"}

        loaderVersion={loaderVersion}

      />

    </ErrorBoundary>

  );

}

