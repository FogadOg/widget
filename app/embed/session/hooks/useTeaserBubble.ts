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

  // Same locale-resolution priority as getLocalizedText in EmbedClient:
  // user's locale -> base locale -> widget default language -> English -> first available.
  // Empty strings count as missing so a blank entry doesn't block fallback.
  const rawMessage = widgetConfig?.teaser_message;
  const teaserMessage: string | null = (() => {
    if (!rawMessage || typeof rawMessage !== 'object') return null;
    const baseLocale = locale.split('-')[0];
    const defaultLang = widgetConfig?.default_language || 'en';
    const candidates = [locale, baseLocale, defaultLang, 'en'];
    for (const lang of candidates) {
      const value = rawMessage[lang];
      if (typeof value === 'string' && value.trim()) return value;
    }
    const first = Object.values(rawMessage).find(
      (v) => typeof v === 'string' && v.trim()
    );
    return first ?? null;
  })();

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
    teaserConfigured: !!teaserMessage,
    teaserMessage,
    dismissTeaser,
  };
}
