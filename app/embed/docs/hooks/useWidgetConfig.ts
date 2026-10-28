import { useCallback, useRef } from 'react'
import { API } from '../../../../lib/api'
import { TIMEOUTS } from '../../../../lib/constants'
import { logError, logWarn } from '../../../../lib/logger'
import { validateConfig } from '../../../../lib/validateConfig'
import { getVisitorId as helpersGetVisitorId } from '../helpers'
import { fetchWithTimeout } from '../resilientFetch'
import { t as translate } from '../../../../lib/i18n'

function getRetryAfterSeconds(headerValue: string | null): number {
  if (!headerValue) return 0;
  const numeric = Number(headerValue);
  if (Number.isFinite(numeric) && numeric > 0) return Math.floor(numeric);
  const asDate = Date.parse(headerValue);
  if (!Number.isFinite(asDate)) return 0;
  const seconds = Math.ceil((asDate - Date.now()) / 1000);
  return seconds > 0 ? seconds : 0;
}

const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 30_000;

function parseRetryAfterMs(headerValue: string | null): number {
  if (!headerValue) return DEFAULT_RATE_LIMIT_COOLDOWN_MS;
  const numeric = Number(headerValue);
  if (Number.isFinite(numeric) && numeric >= 0) return Math.max(1000, numeric * 1000);
  const asDate = Date.parse(headerValue);
  if (!Number.isNaN(asDate)) return Math.max(1000, asDate - Date.now());
  return DEFAULT_RATE_LIMIT_COOLDOWN_MS;
}

interface UseWidgetConfigParams {
  clientId: string;
  /** Visitor's locale — every message this hook surfaces is shown to them. */
  activeLocale: string;
  initialParentOrigin?: string;
  embedHeaders: Record<string, string>;
  setWidgetConfig: (config: any) => void;
  setError: (err: string | null) => void;
}

export function useWidgetConfig({
  clientId,
  activeLocale,
  initialParentOrigin,
  embedHeaders,
  setWidgetConfig,
  setError,
}: UseWidgetConfigParams) {
  const rateLimitUntilRef = useRef<number>(0);
  // Read through a ref: the callback is memoized on the ids, so closing over
  // `activeLocale` would localize errors in whatever language was active when
  // it was created, not the one the visitor has since switched to.
  const localeRef = useRef(activeLocale);
  localeRef.current = activeLocale;

  // Fetch widget config
  const fetchWidgetConfig = useCallback(async (configId: string, token: string): Promise<{ variant_id?: string; variant_name?: string } | undefined> => {
    if (Date.now() < rateLimitUntilRef.current) {
      const waitSec = Math.max(1, Math.ceil((rateLimitUntilRef.current - Date.now()) / 1000));
      setError(translate(localeRef.current, 'rateLimitWait', { count: waitSec }));
      return undefined;
    }
    try {
      const visitorId = helpersGetVisitorId(clientId);
      const response = await fetchWithTimeout(API.widgetConfig(configId, visitorId), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          ...embedHeaders,
        },
      }, TIMEOUTS.WIDGET_LOAD);

      const data = await response.json();

      if (response.ok) {
        if (data?.data) {
          const { config: validatedConfig, typeMismatch } = validateConfig(data.data, 'docs');
          data.data = validatedConfig;
          if (typeMismatch) {
            // This is a misconfiguration the site owner has to fix in the
            // dashboard; the visitor can do nothing about it and should not be
            // shown a red banner naming an admin setting. validateConfig has
            // already coerced the type, so the widget still works — log it for
            // the owner instead of surfacing it.
            logWarn('Widget config type mismatch: chat config rendered by the docs widget', { configId });
          }
        }
        setWidgetConfig(data);
        return {
          variant_id: data?.data?.variant_id,
          variant_name: data?.data?.variant_name,
        };
      } else if (response.status === 429) {
        rateLimitUntilRef.current = Math.max(
          rateLimitUntilRef.current,
          Date.now() + parseRetryAfterMs(response.headers.get('Retry-After')),
        );
        const waitSec = getRetryAfterSeconds(response.headers.get('Retry-After'));
        const msg = waitSec > 0
          ? translate(localeRef.current, 'rateLimitWait', { count: waitSec })
          : translate(localeRef.current, 'sessionRateLimitGeneric');
        setError(msg);
        logWarn('Widget config fetch rate-limited', { waitSec, configId });
      } else {
        logError('Failed to fetch widget config', { data });
      }
    } catch (err) {
      logError('Error fetching widget config', { error: err });
    }
    return undefined;
  }, [clientId, initialParentOrigin]);

  return { fetchWidgetConfig };
}
