import { useCallback, useRef } from 'react'
import { API } from '../../../../lib/api'
import { TIMEOUTS } from '../../../../lib/constants'
import { validateConfig } from '../../../../lib/validateConfig'
import { getVisitorId as helpersGetVisitorId } from '../helpers'
import { fetchWithTimeout } from '../resilientFetch'

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
  initialParentOrigin?: string;
  embedHeaders: Record<string, string>;
  setWidgetConfig: (config: any) => void;
  setError: (err: string | null) => void;
}

export function useWidgetConfig({
  clientId,
  initialParentOrigin,
  embedHeaders,
  setWidgetConfig,
  setError,
}: UseWidgetConfigParams) {
  const rateLimitUntilRef = useRef<number>(0);

  // Fetch widget config
  const fetchWidgetConfig = useCallback(async (configId: string, token: string): Promise<{ variant_id?: string; variant_name?: string } | undefined> => {
    if (Date.now() < rateLimitUntilRef.current) {
      const waitSec = Math.max(1, Math.ceil((rateLimitUntilRef.current - Date.now()) / 1000));
      setError(`Rate limited. Please wait ${waitSec}s and try again.`);
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
            setError('Configuration warning: this config is set to "chat" type but is running in the docs widget. Check your widget_type setting in the admin.');
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
          ? `Rate limited. Please wait ${waitSec}s and try again.`
          : 'Widget is temporarily rate limited. Please try again shortly.';
        setError(msg);
        console.warn('Widget config fetch rate-limited', { waitSec, configId });
      } else {
        console.error('Failed to fetch widget config:', data);
      }
    } catch (err) {
      console.error('Error fetching widget config:', err);
    }
    return undefined;
  }, [clientId, initialParentOrigin]);

  return { fetchWidgetConfig };
}
