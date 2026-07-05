import { useEffect } from 'react';
import { logError } from '../../../../lib/errorHandling';
import { validateConfig } from '../../../../lib/validateConfig';
import * as helpers from '../helpers';
import { injectCustomAssetsFromConfig, injectGoogleFont } from '../EmbedClient.utils';
import type { WidgetConfig } from '../../../../types/widget';

export function useBootstrap({
  initialPreviewConfig,
  initialClientId,
  initialAgentId,
  initialConfigId,
  initialParentOrigin,
  sessionStorageKey,
  getAuthToken,
  scheduleAutoRefresh,
  getTokenExpiresAt,
  setWidgetConfig,
  setIsEmbedded,
  setIsBootstrapping,
  setError,
  fetchAgentDetails,
  fetchWidgetConfig,
  validateAndRestoreSession,
  createSession,
  t,
  postedShowUnreadBadge,
  postedEdgeOffset,
}: {
  initialPreviewConfig: string | undefined;
  initialClientId: string;
  initialAgentId: string;
  initialConfigId: string;
  initialParentOrigin: string | undefined;
  sessionStorageKey: string;
  getAuthToken: (...args: any[]) => Promise<string | null>;
  scheduleAutoRefresh: (...args: any[]) => void;
  getTokenExpiresAt: (() => number | null) | undefined;
  setWidgetConfig: React.Dispatch<React.SetStateAction<WidgetConfig | null>>;
  setIsEmbedded: React.Dispatch<React.SetStateAction<boolean>>;
  setIsBootstrapping: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  fetchAgentDetails: (agentId: string, token: string) => Promise<void>;
  fetchWidgetConfig: (configId: string, token: string) => Promise<ReturnType<typeof validateConfig>['config'] | undefined>;
  validateAndRestoreSession: (sessionId: string, agentId: string, token: string, configSnapshot?: ReturnType<typeof validateConfig>['config'] | null) => Promise<void>;
  createSession: (agent: string, token: string, configSnapshot?: ReturnType<typeof validateConfig>['config'] | null, skipMessageLoad?: boolean) => Promise<void>;
  t: Record<string, unknown>;
  postedShowUnreadBadge?: React.MutableRefObject<boolean | undefined>;
  postedEdgeOffset?: React.MutableRefObject<number | undefined>;
}) {
  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      // Preview mode — use inline config without auth/API calls
      if (initialPreviewConfig) {
        try {
          const decoded = JSON.parse(decodeURIComponent(atob(initialPreviewConfig)));
          const { config: validatedConfig } = validateConfig(decoded, 'chat');
          setWidgetConfig(validatedConfig);
          injectCustomAssetsFromConfig(validatedConfig as unknown as { custom_css?: string | null } | null);
          if ((validatedConfig as any).font_source === 'google' && (validatedConfig as any).font_family) {
            injectGoogleFont((validatedConfig as any).font_family);
          }
          // Treat the preview iframe as embedded so EmbedShell uses its responsive
          // 100% × 100% layout (maxWidth 400px / maxHeight 600px) instead of the
          // standalone fixed-pixel layout which overflows the 360px preview panel.
          setIsEmbedded(true);
        } catch {
          // ignore parse errors in preview mode
        } finally {
          setIsBootstrapping(false);
        }
        return;
      }
      // Use props instead of URL params
      const clientIdParam = initialClientId;
      const agentIdParam = initialAgentId;
      const configIdParam = initialConfigId;

      try {
        // Detect iframe embedding and render a stripped layout when embedded
        try {
          setIsEmbedded(window.top !== window);
        } catch {
          setIsEmbedded(true);
        }

        if (!(clientIdParam && agentIdParam)) {
          return;
        }

        const token = await getAuthToken(clientIdParam, initialParentOrigin);
        if (!token) {
          // getAuthToken returned null — authError will be set by the hook.
          // The useEffect below watches authError and sets fatalError.
          return;
        }

        // Schedule silent token refresh. The hook records the server-reported
        // expires_in on tokenExpiresAtRef; we read it back via getTokenExpiresAt
        // and fall back to a 55-minute window if (and only if) the server omitted
        // the field (LAUNCH-READINESS.md gap #15).
        const reportedExpiry = typeof getTokenExpiresAt === 'function' ? getTokenExpiresAt() : null;
        const tokenExpiryMs = (reportedExpiry && Number.isFinite(reportedExpiry))
          ? reportedExpiry
          : Date.now() + 55 * 60 * 1000;
        scheduleAutoRefresh(tokenExpiryMs, clientIdParam, initialParentOrigin);

        if (cancelled) return;

        // Validate agent exists
        await fetchAgentDetails(agentIdParam, token);

        // Validate config exists if provided
        let fetchedConfig: ReturnType<typeof validateConfig>['config'] | null = null;
        if (configIdParam) {
          fetchedConfig = await fetchWidgetConfig(configIdParam, token) ?? null;
          // Inject server-side custom CSS (LAUNCH-READINESS #20). The sanitizer
          // strips url() / position:fixed / @font-face etc., so even a compromised
          // config field can't exfiltrate or clickjack the host page.
          injectCustomAssetsFromConfig(fetchedConfig as unknown as { custom_css?: string | null } | null);
          if ((fetchedConfig as any)?.font_source === 'google' && (fetchedConfig as any)?.font_family) {
            injectGoogleFont((fetchedConfig as any).font_family);
          }
          if (fetchedConfig?.ga_measurement_id && initialParentOrigin) {
            // GA measurement ID is non-sensitive but still gated on a known
            // parent origin so we don't leak it via '*' (LAUNCH-READINESS #6).
            window.parent.postMessage(
              { type: 'WIDGET_GA_INIT', data: { gaMeasurementId: fetchedConfig.ga_measurement_id } },
              initialParentOrigin
            );
          }
        }

        if (cancelled) return;

        // Try to restore existing session first
        const storedSession = helpers.getStoredSession(sessionStorageKey);
        if (storedSession) {
          await validateAndRestoreSession(storedSession.sessionId, agentIdParam, token, fetchedConfig);
        } else {
          await createSession(agentIdParam, token, fetchedConfig);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        // If validation fails, set error
        const errorMessage = (err as { userMessage?: string })?.userMessage || String(t.failedToLoadWidget);
        setError(errorMessage);
        const errCode = (err as { code?: number | string })?.code;
        if (errCode !== 3005) {
          logError(err as Error, {
            clientId: initialClientId,
            agentId: initialAgentId,
            configId: initialConfigId,
            action: 'validateWidget'
          });
        }
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false);
        }
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [getAuthToken, initialAgentId, initialClientId, initialConfigId, initialParentOrigin, initialPreviewConfig, sessionStorageKey]);
}
