import { useCallback } from 'react'
import { API } from '../../../../lib/api'
import { TIMEOUTS } from '../../../../lib/constants'
import { validateConfig } from '../../../../lib/validateConfig'
import { getVisitorId as helpersGetVisitorId } from '../helpers'
import { fetchWithTimeout } from '../resilientFetch'

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
  // Fetch widget config
  const fetchWidgetConfig = useCallback(async (configId: string, token: string): Promise<{ variant_id?: string; variant_name?: string } | undefined> => {
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
