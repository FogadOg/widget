'use client';

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

export default function LanguageSwitcher({ locale }: { locale: string }) {
  const router = useRouter();
  const pathname = usePathname();

  const current = LANGUAGES.find((l) => l.code === locale) ?? LANGUAGES[0];

  const switchLanguage = (newLocale: string) => {
    const pathWithoutLocale = pathname.replace(LOCALE_PATTERN, '') || '/';
    const newPath = `/${newLocale}${pathWithoutLocale === '/' ? '' : pathWithoutLocale}`;
    if (newPath !== pathname) router.push(newPath);
  };

  return (
    <div className="relative group">
      <button
        className="flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
        aria-label="Switch language"
      >
        <img
          src={`https://cdn.jsdelivr.net/gh/HatScripts/circle-flags@2.7.0/flags/${current.flag}.svg`}
          width={20}
          height={20}
          alt={current.name}
          className="flex-shrink-0"
        />
        <span>{current.code.toUpperCase()}</span>
        <svg className="h-3.5 w-3.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <div className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
        {LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            onClick={() => switchLanguage(lang.code)}
            className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors first:rounded-t-lg last:rounded-b-lg ${
              lang.code === locale ? 'font-semibold text-zinc-900 dark:text-zinc-50' : 'text-zinc-600 dark:text-zinc-400'
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
