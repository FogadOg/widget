'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LOCALE_LABELS, type SupportedLocale } from '../../lib/i18n';
import { FOCUS_RING } from '../EmbedShell.constants';
import { withAlpha } from '../../lib/colors';

type LanguageMenuProps = {
  /** Currently active locale code (e.g. "de" or "nb-NO"). */
  locale: string;
  /** Locale codes to offer, in display order. */
  locales: string[];
  /** Called with the chosen locale code. */
  onChange: (locale: string) => void;
  /** Accessible label for the trigger (localized "Select language"). */
  label: string;
  /**
   * Trigger appearance:
   *  - 'solid'  (default): sits on the chat widget's brand-colored header bar.
   *  - 'subtle': bordered/transparent, for a light panel (the docs widget).
   */
  variant?: 'solid' | 'subtle';
  // Config-driven colors so the control matches the customer's branding
  // (both widgets style from config, not a shared token stylesheet).
  headerTextColor: string;
  secondaryColor: string;
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  fontStyles: React.CSSProperties;
  borderRadius: number;
};

// Short display code shown on the trigger (e.g. "de-CH" → "DE").
const shortCode = (locale: string) => locale.split('-')[0].toUpperCase();
const nativeName = (locale: string) => {
  const base = locale.split('-')[0];
  if (base in LOCALE_LABELS) return LOCALE_LABELS[base as SupportedLocale];
  // Runtime-translated locales aren't in LOCALE_LABELS; show the language's
  // own endonym (e.g. "ja" → "日本語") so the visitor recognizes it.
  try {
    const name = new Intl.DisplayNames([base], { type: 'language', fallback: 'code' }).of(base);
    if (name && name.toLowerCase() !== base.toLowerCase()) return name;
  } catch {
    /* Intl.DisplayNames unavailable — fall through */
  }
  return locale.toUpperCase();
};

export function LanguageMenu({
  locale,
  locales,
  onChange,
  label,
  variant = 'solid',
  headerTextColor,
  secondaryColor,
  primaryColor,
  backgroundColor,
  textColor,
  borderColor,
  fontStyles,
  borderRadius,
}: LanguageMenuProps) {
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const activeIndex = Math.max(
    0,
    locales.findIndex((l) => l === locale || l.split('-')[0] === locale.split('-')[0])
  );

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    setDropdownPos(null);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  const handleToggle = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right,
      });
    }
    setOpen((v) => !v);
  };

  // Close on outside click — check both the trigger container and the portalled dropdown.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        !containerRef.current?.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  // Move focus to the active/selected option when the menu opens.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => optionRefs.current[activeIndex]?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open, activeIndex]);

  const select = (next: string) => {
    if (next !== locale) onChange(next);
    close();
  };

  // 'solid' sits on the brand-colored chat header; 'subtle' is a bordered
  // control for a light panel (docs widget). The ring follows the text color
  // so it stays visible against either backdrop.
  const triggerTextColor = variant === 'subtle' ? textColor : headerTextColor;
  const triggerStyle: React.CSSProperties =
    variant === 'subtle'
      ? {
          backgroundColor: 'transparent',
          color: triggerTextColor,
          border: `1px solid ${borderColor}`,
          ['--tw-ring-color' as string]: primaryColor,
          ['--tw-ring-offset-color' as string]: backgroundColor,
          ...fontStyles,
        }
      : {
          backgroundColor: secondaryColor,
          color: triggerTextColor,
          ['--tw-ring-color' as string]: headerTextColor,
          ['--tw-ring-offset-color' as string]: primaryColor,
          ...fontStyles,
        };

  const onMenuKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Escape') {
      e.stopPropagation(); // don't also collapse the whole widget
      close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      optionRefs.current[(index + 1) % locales.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      optionRefs.current[(index - 1 + locales.length) % locales.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      optionRefs.current[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      optionRefs.current[locales.length - 1]?.focus();
    }
  };

  const dropdown =
    open && dropdownPos ? (
      <div
        ref={dropdownRef}
        role="menu"
        aria-label={label}
        style={{
          position: 'fixed',
          top: `${dropdownPos.top}px`,
          right: `${dropdownPos.right}px`,
          minWidth: '160px',
          backgroundColor,
          color: textColor,
          border: `1px solid ${borderColor}`,
          borderRadius: `${Math.min(borderRadius, 12)}px`,
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          zIndex: 9999,
          padding: '4px',
          ...fontStyles,
        }}
      >
        {locales.map((code, index) => {
          const isSelected = index === activeIndex;
          return (
            <button
              key={code}
              ref={(el) => { optionRefs.current[index] = el; }}
              type="button"
              role="menuitemradio"
              aria-checked={isSelected}
              onClick={() => select(code)}
              onKeyDown={(e) => onMenuKeyDown(e, index)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                padding: '8px 10px',
                borderRadius: `${Math.min(borderRadius, 8)}px`,
                backgroundColor: isSelected ? withAlpha(primaryColor, 0.12) : 'transparent',
                color: textColor,
                fontWeight: isSelected ? 600 : 400,
                textAlign: 'start',
                cursor: 'pointer',
                ['--tw-ring-color' as string]: primaryColor,
                ['--tw-ring-offset-color' as string]: backgroundColor,
                ...fontStyles,
              }}
              className={`text-sm hover:opacity-80 ${FOCUS_RING}`}
            >
              <span>{nativeName(code)}</span>
              {isSelected && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    ) : null;

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        style={triggerStyle}
        className={`px-2 py-1 rounded text-sm flex items-center gap-1 hover:opacity-90 ${FOCUS_RING}`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        <span className="text-xs font-medium">{shortCode(locale)}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ opacity: 0.7, transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }}
        >
          <polyline points="6,9 12,15 18,9" />
        </svg>
      </button>

      {typeof document !== 'undefined' && dropdown && createPortal(dropdown, document.body)}
    </div>
  );
}

export default LanguageMenu;
