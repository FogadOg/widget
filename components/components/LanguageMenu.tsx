'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LOCALE_LABELS, type SupportedLocale } from '../../lib/i18n';
import { FOCUS_RING } from '../EmbedShell.constants';

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

const LOCALE_TO_FLAG: Record<string, string> = {
  en: 'gb',
  de: 'de',
  es: 'es',
  fr: 'fr',
  pt: 'pt',
  sv: 'se',
  nl: 'nl',
  nb: 'no',
  no: 'no',
  da: 'dk',
  fi: 'fi',
  it: 'it',
  pl: 'pl',
  cs: 'cz',
  sk: 'sk',
  ro: 'ro',
  hu: 'hu',
  tr: 'tr',
  el: 'gr',
  uk: 'ua',
  ru: 'ru',
  ja: 'jp',
  ko: 'kr',
  zh: 'cn',
  ar: 'sa',
};

const localeFlagCode = (locale: string): string | null => {
  const parts = locale.split('-');
  const explicitRegion = parts.length > 1 ? parts[1] : '';
  if (explicitRegion && /^[A-Za-z]{2}$/.test(explicitRegion)) return explicitRegion.toLowerCase();
  const base = parts[0].toLowerCase();
  return LOCALE_TO_FLAG[base] ?? null;
};

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

// A custom button+menu dropdown rather than a native <select>. Native select
// popups are unreliable inside the sandboxed cross-origin iframe that hosts the
// widget (Chromium frequently refuses to open the listbox), so the picker
// appeared dead when clicked. The menu is portalled to <body> with fixed
// positioning so the chat panel's `overflow: hidden` (and the message list that
// paints below the header) can't clip or cover it.
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
  const [coords, setCoords] = useState<{ top: number; right: number; minWidth: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

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

  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : rect.right;
    setCoords({
      top: rect.bottom + 4,
      right: Math.max(viewportWidth - rect.right, 8),
      minWidth: Math.max(rect.width, 160),
    });
  }, []);

  // Position the portalled menu against the trigger the moment it opens, and
  // keep it anchored while the visitor scrolls or resizes the page.
  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, reposition]);

  // Close on outside click / Escape. The menu lives in a portal, so an outside
  // click must ignore both the trigger and the portalled menu itself —
  // otherwise a mousedown on a menu item would close before its click lands.
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const choose = (next: string) => {
    if (next !== locale) onChange(next);
    setOpen(false);
  };

  const menuRadius = Math.min(borderRadius, 12);

  const menu =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            id="widget-language-menu"
            role="menu"
            aria-label={label}
            style={{
              position: 'fixed',
              top: coords ? `${coords.top}px` : '0',
              right: coords ? `${coords.right}px` : '0',
              minWidth: coords ? `${coords.minWidth}px` : '160px',
              maxHeight: '260px',
              overflowY: 'auto',
              backgroundColor,
              color: textColor,
              border: `1px solid ${borderColor}`,
              borderRadius: `${menuRadius}px`,
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
              zIndex: 2147483647,
              padding: '4px',
              visibility: coords ? 'visible' : 'hidden',
              ...fontStyles,
            }}
          >
            {locales.map((code) => {
              const active = code === locale;
              const flag = localeFlagCode(code);
              return (
                <button
                  key={code}
                  type="button"
                  role="menuitem"
                  onClick={() => choose(code)}
                  title={nativeName(code)}
                  style={{
                    display: 'flex',
                    width: '100%',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    gap: '8px',
                    padding: '8px 10px',
                    fontSize: '13px',
                    fontWeight: active ? 700 : 500,
                    color: textColor,
                    backgroundColor: active ? `${primaryColor}1a` : 'transparent',
                    border: 'none',
                    borderRadius: `${Math.max(menuRadius - 4, 2)}px`,
                    cursor: 'pointer',
                    textAlign: 'left',
                    ...fontStyles,
                  }}
                  className="hover:opacity-80"
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    {flag ? (
                      <img
                        src={`/flags/${flag}.svg`}
                        alt=""
                        aria-hidden="true"
                        style={{ width: '16px', height: '16px', objectFit: 'cover', borderRadius: '9999px', flexShrink: 0 }}
                      />
                    ) : (
                      <span aria-hidden="true" style={{ fontSize: '14px', lineHeight: 1, flexShrink: 0 }}>🌐</span>
                    )}
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nativeName(code)}</span>
                  </span>
                </button>
              );
            })}
          </div>,
          document.body
        )
      : null;

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="widget-language-menu"
        style={{
          ...triggerStyle,
          borderRadius: `${Math.min(borderRadius, 8)}px`,
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
        }}
        className={`px-2 py-1 flex items-center gap-1.5 hover:opacity-90 ${FOCUS_RING}`}
      >
        {(() => {
          const flag = localeFlagCode(locale);
          return flag ? (
            <img
              src={`/flags/${flag}.svg`}
              alt=""
              aria-hidden="true"
              style={{ width: '16px', height: '16px', objectFit: 'cover', borderRadius: '9999px', flexShrink: 0 }}
            />
          ) : (
            <span aria-hidden="true" style={{ fontSize: '14px', lineHeight: 1, flexShrink: 0 }}>🌐</span>
          );
        })()}
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
          style={{ opacity: 0.75, flexShrink: 0, transition: 'transform 150ms', transform: open ? 'rotate(180deg)' : 'none' }}
        >
          <polyline points="6,9 12,15 18,9" />
        </svg>
      </button>
      {menu}
    </div>
  );
}

export default LanguageMenu;
