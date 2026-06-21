import { useEffect, MutableRefObject } from 'react'
import { getLocaleDirection, t as translate } from '../../../../lib/i18n'
import { trackEvent } from '../../../../lib/api'
import { scrollToBottom as helpersScrollToBottom } from '../helpers'
import { MessageType } from '../DocsClient.types'

interface UseWidgetLifecycleParams {
  messages: MessageType[];
  activeLocale: string;
  open: boolean;
  clientId: string;
  agentId: string;
  configId: string;
  embedHeaders: Record<string, string>;
  conversationEndRef: MutableRefObject<HTMLDivElement | null>;
  scrollAreaRef: MutableRefObject<HTMLDivElement | null>;
  lastAnnouncedKey: MutableRefObject<string | null>;
  setLiveMessage: (msg: string) => void;
}

export function useWidgetLifecycle({
  messages,
  activeLocale,
  open,
  clientId,
  agentId,
  configId,
  embedHeaders,
  conversationEndRef,
  scrollAreaRef,
  lastAnnouncedKey: lastAnnouncedKeyRef,
  setLiveMessage,
}: UseWidgetLifecycleParams) {
  useEffect(() => {
    helpersScrollToBottom(conversationEndRef.current, scrollAreaRef.current);
  }, [messages]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = activeLocale;
      document.documentElement.dir = getLocaleDirection(activeLocale);
    }
  }, [activeLocale]);

  // Emit widget_load telemetry once per browser session so the install-status
  // endpoint can confirm the docs widget is active on a site.
  useEffect(() => {
    if (!clientId || !agentId) return;
    const loadKey = `companin-telemetry-load-${clientId}-${agentId}-${configId}`;
    try {
      if (localStorage.getItem(loadKey)) return;
    } catch {
      // localStorage unavailable — fire anyway
    }
    trackEvent('widget_load', agentId, { widget_config_id: configId }, clientId, undefined, embedHeaders).catch(() => {});
    try {
      localStorage.setItem(loadKey, '1');
    } catch {
      // ignore storage errors
    }
  }, [agentId, clientId]);

  useEffect(() => {
    const latestAgent = [...messages].reverse().find((msg) => msg.from === 'agent');
    if (!latestAgent) return;
    const latestContent = latestAgent.versions?.[latestAgent.versions.length - 1]?.content || '';
    const announcementKey = `${latestAgent.key}-${latestContent}`;

    if (announcementKey !== lastAnnouncedKeyRef.current) {
      lastAnnouncedKeyRef.current = announcementKey;
      setLiveMessage(
        translate(activeLocale, 'newMessageAnnouncement', {
          vars: { message: latestContent },
        })
      );
    }
  }, [messages, activeLocale]);

  useEffect(() => {
    if (open && messages.length > 0) {
      // Scroll to bottom when dialog opens and has messages with a longer delay
      setTimeout(() => helpersScrollToBottom(conversationEndRef.current, scrollAreaRef.current), 300);
    }
  }, [open]);
}
