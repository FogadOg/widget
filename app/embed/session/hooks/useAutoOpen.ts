import { useEffect } from 'react';
import type { WidgetConfig } from '../../../../types/widget';

export function useAutoOpen({
  widgetConfig,
  setIsCollapsed,
}: {
  widgetConfig: WidgetConfig | null;
  setIsCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  // Proactive open trigger: delay-based and/or scroll-depth-based auto-open.
  // Reads auto_open_delay (ms) and auto_open_scroll_depth (0-100 %) from widgetConfig.
  // Only fires once per page-load and only when the widget is currently collapsed.
  useEffect(() => {
    if (!widgetConfig) return;
    // Don't auto-open if already explicitly open or if start_open already handled it
    const delayMs = widgetConfig.auto_open_delay ?? 0;
    const scrollDepth = widgetConfig.auto_open_scroll_depth ?? 0;
    if (delayMs <= 0 && scrollDepth <= 0) return;

    let fired = false;
    const open = () => {
      if (fired) return;
      fired = true;
      setIsCollapsed((prev) => {
        if (!prev) return prev; // already open
        return false;
      });
    };

    let delayTimer: ReturnType<typeof setTimeout> | null = null;
    if (delayMs > 0) {
      delayTimer = setTimeout(open, delayMs);
    }

    let scrollHandler: (() => void) | null = null;
    if (scrollDepth > 0) {
      scrollHandler = () => {
        if (fired) return;
        const scrolled = window.scrollY + window.innerHeight;
        const total = document.documentElement.scrollHeight;
        const pct = total > 0 ? (scrolled / total) * 100 : 0;
        if (pct >= scrollDepth) open();
      };
      // Fire against the parent document via postMessage since widget runs in an iframe
      // For non-iframe contexts (dev/test), listen on the local window
      window.addEventListener('scroll', scrollHandler, { passive: true });
    }

    return () => {
      if (delayTimer) clearTimeout(delayTimer);
      if (scrollHandler) window.removeEventListener('scroll', scrollHandler);
    };
  // widgetConfig.auto_open_delay and auto_open_scroll_depth are primitives — safe to spread
  }, [widgetConfig?.auto_open_delay, widgetConfig?.auto_open_scroll_depth]);
}
