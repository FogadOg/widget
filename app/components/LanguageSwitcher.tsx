'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

const LANGUAGES = [
  { code: 'en', name: 'English', flag: 'us' },
  { code: 'nb', name: 'Norsk', flag: 'no' },
  { code: 'de', name: 'Deutsch', flag: 'de' },
  { code: 'fr', name: 'Français', flag: 'fr' },
  { code: 'es', name: 'Español', flag: 'es' },
  { code: 'nl', name: 'Nederlands', flag: 'nl' },
  { code: 'pt', name: 'Português', flag: 'pt' },
  { code: 'sv', name: 'Svenska', flag: 'se' },
  { code: 'it', name: 'Italiano', flag: 'it' },
  { code: 'pl', name: 'Polski', flag: 'pl' },
];

const LOCALE_PATTERN = new RegExp(`^/(${LANGUAGES.map((l) => l.code).join('|')})(?=/|$)`);

export default function LanguageSwitcher({
  locale,
  ariaLabel = 'Switch language',
}: {
  locale: string;
  ariaLabel?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const current = LANGUAGES.find((l) => l.code === locale) ?? LANGUAGES[0];

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (wrapperRef.current && target && !wrapperRef.current.contains(target)) {
        setOpen(false);
      }
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

  const switchLanguage = (newLocale: string) => {
    const pathWithoutLocale = pathname.replace(LOCALE_PATTERN, '') || '/';
    const newPath = `/${newLocale}${pathWithoutLocale === '/' ? '' : pathWithoutLocale}`;
    if (newPath !== pathname) router.push(newPath);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent transition-colors"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="language-switcher-menu"
      >
        <img
          src={`https://cdn.jsdelivr.net/gh/HatScripts/circle-flags@2.7.0/flags/${current.flag}.svg`}
          width={20}
          height={20}
          alt={current.name}
          className="flex-shrink-0"
        />
        <span>{current.code.toUpperCase()}</span>
        <svg
          className={`h-3.5 w-3.5 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <div
        id="language-switcher-menu"
        role="menu"
        className={`absolute right-0 top-full mt-1 w-44 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg transition-all z-50 ${
          open ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'
        }`}
      >
        {LANGUAGES.map((lang) => (
          <button
            type="button"
            key={lang.code}
            onClick={() => switchLanguage(lang.code)}
            role="menuitem"
            className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors first:rounded-t-lg last:rounded-b-lg ${
              lang.code === locale ? 'font-semibold text-foreground' : 'text-muted-foreground'
            }`}
          >
            <img
              src={`https://cdn.jsdelivr.net/gh/HatScripts/circle-flags@2.7.0/flags/${lang.flag}.svg`}
              width={20}
              height={20}
              alt={lang.name}
              className="flex-shrink-0"
            />
            <span>{lang.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
