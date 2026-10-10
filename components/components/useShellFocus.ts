'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Move focus into the composer when the panel opens, and back to the launcher
 * when it closes.
 *
 * Without this a keyboard or screen-reader visitor opens the widget and focus
 * stays on the host page behind it — they have to tab blind to find the input —
 * and on close they are dropped at the top of the host document rather than on
 * the control they just used.
 *
 * The classic shell has carried this since early on; the `minimal` and `panel`
 * layouts shipped without it. Extracted here so the three shells cannot drift
 * again.
 */
export function useShellFocus({
  isCollapsed,
  inputRef,
  launcherRef,
}: {
  isCollapsed: boolean;
  inputRef: RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  launcherRef: RefObject<HTMLButtonElement | null>;
}) {
  // Tracks whether the panel has actually been open, so the initial mount does
  // not steal focus from the host page on page load.
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!isCollapsed) {
      wasOpenRef.current = true;
      // A tick after paint: the composer is only mounted once the panel renders.
      const id = window.setTimeout(() => inputRef.current?.focus(), 60);
      return () => window.clearTimeout(id);
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      const id = window.setTimeout(() => launcherRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [isCollapsed, inputRef, launcherRef]);
}
