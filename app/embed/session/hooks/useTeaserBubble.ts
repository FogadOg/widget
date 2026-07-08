import { useState, useEffect, useCallback } from 'react';
import type { WidgetConfig } from '../../../../types/widget';

// Historic versions persisted dismissal here; cleared on load so the teaser
// isn't still suppressed for visitors who dismissed it under the old scheme.
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
  // Lags `visible` by the parent iframe's resize transition (300ms) so the
  // bubble never renders into a viewport that is still growing around it.
  const [bubbleShown, setBubbleShown] = useState(false);
  // In-memory only: dismissal hides the teaser for this page view; a reload
  // starts fresh and the teaser is shown again after its delay.
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

  // Clean up the legacy persisted-dismissal flag from older widget versions.
  useEffect(() => {
    if (!storageKey) return;
    try { localStorage.removeItem(storageKey); } catch {}
  }, [storageKey]);

  // Show the teaser after the configured delay
  useEffect(() => {
    if (!teaserMessage || dismissed) {
      const timer = setTimeout(() => setVisible(false), 0);
      return () => clearTimeout(timer);
    }
    const delayMs = widgetConfig?.teaser_delay ?? 3000;
    const timer = setTimeout(() => setVisible(true), Math.max(delayMs, 0));
    return () => clearTimeout(timer);
  // delayMs is a primitive — spreading the dependency is intentional
  }, [teaserMessage, widgetConfig?.teaser_delay, dismissed]);

  // Render the bubble only after the iframe has finished expanding: `visible`
  // triggers the resize; the bubble follows once the parent's 0.3s CSS
  // transition has run. Hiding is immediate (shrink happens after removal).
  useEffect(() => {
    if (!visible) {
      const timer = setTimeout(() => setBubbleShown(false), 0);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => setBubbleShown(true), 350);
    return () => clearTimeout(timer);
  }, [visible]);

  // Hide when the widget panel is opened
  useEffect(() => {
    if (!isCollapsed) {
      const timer = setTimeout(() => setVisible(false), 0);
      return () => clearTimeout(timer);
    }
  }, [isCollapsed]);

  // Auto-dismiss after teaser_dismiss_after ms (0 = never)
  useEffect(() => {
    if (!visible) return;
    const dismissAfter = widgetConfig?.teaser_dismiss_after ?? 0;
    if (dismissAfter <= 0) return;
    const timer = setTimeout(() => {
      setVisible(false);
      setDismissed(true);
    }, dismissAfter);
    return () => clearTimeout(timer);
  }, [visible, widgetConfig?.teaser_dismiss_after]);

  const dismissTeaser = useCallback(() => {
    setVisible(false);
    setDismissed(true);
  }, []);

  return {
    showTeaser: bubbleShown && isCollapsed && !!teaserMessage,
    // True while the iframe must be sized to fit the bubble — from the moment
    // the teaser fires until it is dismissed/hidden. While false the iframe
    // stays button-sized so it doesn't cover the host page.
    teaserExpanded: visible && isCollapsed && !!teaserMessage,
    teaserConfigured: !!teaserMessage,
    teaserMessage,
    dismissTeaser,
  };
}
