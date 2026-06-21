import { useState, useEffect } from 'react'

export function usePreviewMode(initialPreviewConfig: string | undefined, startOpen: boolean) {
  const [open, setOpen] = useState(() => {
    if (initialPreviewConfig && typeof window !== 'undefined') {
      try {
        const stored = window.localStorage.getItem('companin-preview-docs-open');
        if (stored === 'true') return true;
      } catch {
        // storage unavailable — fall back to the default
      }
    }
    return startOpen;
  });
  useEffect(() => {
    if (!initialPreviewConfig || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('companin-preview-docs-open', String(open));
    } catch {
      // storage unavailable — non-fatal
    }
  }, [open, initialPreviewConfig]);

  return { open, setOpen };
}
