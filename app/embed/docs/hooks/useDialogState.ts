import React, { useEffect } from 'react'
import { validateConfig } from '../../../../lib/validateConfig'
import { enableDebug, disableDebug } from '../../../../src/components/DevOverlay'
import {
  getStoredSession as helpersGetStoredSession,
} from '../helpers'
import { MessageType } from '../DocsClient.types'

interface UseDialogStateParams {
  open: boolean;
  setOpen: (open: boolean) => void;
  parentOrigin: string;
  initialPreviewConfig?: string;
  clientId: string;
  agentId: string;
  configId: string;
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  setMessages: React.Dispatch<React.SetStateAction<MessageType[]>>;
  setError: (err: string | null) => void;
  setWidgetConfig: (config: any) => void;
  widgetConfig: any;
  authError?: string | null;
  getAuthToken: (clientId: string, parentOrigin?: string) => Promise<string | null>;
  fetchWidgetConfig: (configId: string, token: string) => Promise<{ variant_id?: string; variant_name?: string } | undefined>;
  createSession: (token: string, variantInfo?: { variant_id?: string; variant_name?: string }) => Promise<void>;
  validateAndRestoreSession: (sessionId: string, token: string) => Promise<void>;
  resolveParentOrigin: () => string | undefined;
}

export function useDialogState({
  open,
  setOpen,
  parentOrigin,
  initialPreviewConfig,
  clientId,
  agentId,
  configId,
  sessionId,
  setSessionId,
  setMessages,
  setError,
  setWidgetConfig,
  widgetConfig,
  authError,
  getAuthToken,
  fetchWidgetConfig,
  createSession,
  validateAndRestoreSession,
  resolveParentOrigin,
}: UseDialogStateParams) {
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);

    // Send resize message to parent
    if (typeof window !== 'undefined' && window.parent) {
      if (newOpen) {
        // Full screen when dialog opens
        window.parent.postMessage({
          type: 'WIDGET_RESIZE',
          data: { width: '100vw', height: '100vh' }
        }, parentOrigin);
      } else {
        // Back to original size and position when dialog closes
        window.parent.postMessage({
          type: 'WIDGET_RESIZE',
          data: { width: 0, height: 0, hide: true }
        }, parentOrigin);
      }
    }
  };

  // Initialize session on mount
  useEffect(() => {
    if (initialPreviewConfig) return;
    if (clientId && agentId) {
      const detectedParentOrigin = resolveParentOrigin();

      getAuthToken(clientId, detectedParentOrigin).then(async (token) => {
        if (token) {
          // Fetch widget config first so variant info is available for session creation
          const variantInfo = await fetchWidgetConfig(configId, token);

          const storedSession = helpersGetStoredSession(clientId, agentId);
          if (storedSession) {
            validateAndRestoreSession(storedSession.sessionId, token);
          } else {
            createSession(token, variantInfo);
          }
        } else if (authError) {
          console.error('Auth error:', authError);
          setError(authError);
        } else {
          console.error('No token and no authError - check getAuthToken implementation');
          setError('Failed to authenticate');
        }
      }).catch(err => {
        console.error('Error getting auth token:', err);
        setError('Failed to authenticate');
      });
    } else {
      console.warn('Missing clientId or agentId');
    }
  }, [clientId, agentId, configId, createSession, validateAndRestoreSession, fetchWidgetConfig, getAuthToken, initialPreviewConfig, resolveParentOrigin]);

  // Preview mode only: apply live config updates pushed from the admin customize
  // panel via postMessage, so appearance edits update without reloading the
  // iframe (which would reset the widget to closed). Re-validated exactly as the
  // URL-based preview config, so no new trust surface.
  useEffect(() => {
    if (!initialPreviewConfig) return;
    const handler = (event: MessageEvent) => {
      const data = event?.data as { type?: string; config?: string } | undefined;
      if (!data || typeof data !== 'object') return;
      if (data.type !== 'COMPANIN_PREVIEW_CONFIG' || typeof data.config !== 'string') return;
      try {
        const decoded = JSON.parse(decodeURIComponent(atob(data.config)));
        const { config: validatedConfig } = validateConfig(decoded, 'docs');
        setWidgetConfig({ status: 'success', data: validatedConfig });
      } catch {
        // ignore malformed preview config
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [initialPreviewConfig]);

  useEffect(() => {
    if (!initialPreviewConfig) return;
    window.parent.postMessage({ type: 'COMPANIN_PREVIEW_READY' }, '*');
  }, [initialPreviewConfig]);

  // Periodic check for expired sessions
  useEffect(() => {
    const checkSessionExpiry = () => {
      const stored = helpersGetStoredSession(clientId, agentId);
      if (!stored && sessionId) {
        setSessionId(null);
        setMessages([]);
      }
    };

    const interval = setInterval(checkSessionExpiry, 60000);
    return () => clearInterval(interval);
  }, [sessionId]);

  // Apply hide_on_mobile from widget config for docs widget
  useEffect(() => {
    if (!widgetConfig) return;
    const ua = navigator.userAgent;
    const isMobileDevice = /Android|iPhone|iPad|iPod|Mobile|Mobi/i.test(ua);
    const hideOnMobile = Boolean(widgetConfig?.data?.hide_on_mobile);

    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          { type: hideOnMobile && isMobileDevice ? 'WIDGET_HIDE' : 'WIDGET_SHOW' },
          parentOrigin
        );
      }
    } catch (e) {
      // ignore
    }
  }, [widgetConfig, parentOrigin]);

  // Listen for messages from parent to open/close dialog or toggle debug mode
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const { type } = event.data || {};

      if (type === 'OPEN_DOCS_DIALOG') {
        handleOpenChange(true);
      } else if (type === 'CLOSE_DOCS_DIALOG') {
        handleOpenChange(false);
      } else if (type === 'WIDGET_DEBUG_ENABLE') {
        enableDebug();
      } else if (type === 'WIDGET_DEBUG_DISABLE') {
        disableDebug();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleOpenChange]);

  return { handleOpenChange };
}
