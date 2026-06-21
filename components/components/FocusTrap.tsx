'use client';

import React, { useRef, useEffect, memo } from 'react';
import { FOCUSABLE } from '../EmbedShell.constants';

export const FocusTrap = memo(function FocusTrap({ children, onEscape }: { children: React.ReactNode; onEscape?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const savedFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    savedFocus.current = document.activeElement as HTMLElement;
    const el = ref.current;
    if (!el) return;
    (el.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onEscape?.(); return; }
      if (e.key !== 'Tab') return;
      const focusable = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };
    el.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('keydown', onKey);
      savedFocus.current?.focus();
    };
  }, [onEscape]);
  return <div ref={ref}>{children}</div>;
});
