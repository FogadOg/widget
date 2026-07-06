import { useState, useEffect, useCallback } from 'react';
import type { WidgetConfig } from '../../../../types/widget';

const DISMISSED_PREFIX = 'companin-teaser-dismissed-';

export function useTeaserBubble({
  widgetConfig,
  isCollapsed,
  locale,
}: {
  widgetConfig: WidgetConfig | null;
  isCollapsed: boolean;
  locale: string;
}) {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const rawMessage = widgetConfig?.teaser_message;
  const teaserMessage: string | null = rawMessage
    ? (rawMessage[locale] ?? rawMessage['en'] ?? Object.values(rawMessage)[0] ?? null)
    : null;

  const storageKey = widgetConfig?.id ? `${DISMISSED_PREFIX}${widgetConfig.id}` : null;

  // Restore permanent dismissal from localStorage
  useEffect(() => {
    if (!storageKey) return;
    try {
      if (localStorage.getItem(storageKey) === '1') setDismissed(true);
    } catch {}
  }, [storageKey]);

  // Show the teaser after the configured delay
  useEffect(() => {
    if (!teaserMessage || dismissed) {
      setVisible(false);
      return;
    }
    const delayMs = widgetConfig?.teaser_delay ?? 3000;
    if (delayMs <= 0) {
      setVisible(true);
      return;
    }
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  // delayMs is a primitive — spreading the dependency is intentional
  }, [teaserMessage, widgetConfig?.teaser_delay, dismissed]);

  // Hide when the widget panel is opened
  useEffect(() => {
    if (!isCollapsed) setVisible(false);
  }, [isCollapsed]);

  // Auto-dismiss after teaser_dismiss_after ms (0 = never)
  useEffect(() => {
    if (!visible) return;
    const dismissAfter = widgetConfig?.teaser_dismiss_after ?? 0;
    if (dismissAfter <= 0) return;
    const timer = setTimeout(() => {
      setVisible(false);
      setDismissed(true);
      if (storageKey) {
        try { localStorage.setItem(storageKey, '1'); } catch {}
      }
    }, dismissAfter);
    return () => clearTimeout(timer);
  }, [visible, widgetConfig?.teaser_dismiss_after, storageKey]);

  const dismissTeaser = useCallback(() => {
    setVisible(false);
    setDismissed(true);
    if (storageKey) {
      try { localStorage.setItem(storageKey, '1'); } catch {}
    }
  }, [storageKey]);

  return {
    showTeaser: visible && isCollapsed && !!teaserMessage,
    teaserMessage,
    dismissTeaser,
  };
}
