import { resolveInitialWidgetLocale, WIDGET_LOCALE_STORAGE_KEY } from '../lib/i18n';

describe('resolveInitialWidgetLocale', () => {
  const originalLanguages = Object.getOwnPropertyDescriptor(navigator, 'languages');

  const setBrowserLanguages = (langs: string[]) => {
    Object.defineProperty(navigator, 'languages', {
      value: langs,
      configurable: true,
    });
  };

  afterEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
    if (originalLanguages) {
      Object.defineProperty(navigator, 'languages', originalLanguages);
    }
  });

  it('prefers a saved manual choice over the loader locale and browser', () => {
    localStorage.setItem(WIDGET_LOCALE_STORAGE_KEY, 'fr');
    setBrowserLanguages(['de-DE', 'de']);
    expect(resolveInitialWidgetLocale('en')).toBe('fr');
  });

  it('respects the loader-resolved locale (explicit pin) over the browser', () => {
    // Owner pinned data-locale="fr"; a German-browser visitor must still get
    // French rather than having the widget re-detect the browser.
    setBrowserLanguages(['de-DE', 'de']);
    expect(resolveInitialWidgetLocale('fr')).toBe('fr');
  });

  it('falls back to the browser language only when no loader locale is given', () => {
    // Direct-iframe embed that bypasses the loader and passes no locale.
    setBrowserLanguages(['de-DE', 'de']);
    expect(resolveInitialWidgetLocale(undefined)).toBe('de');
  });

  it('maps regional/aliased codes to a supported locale (no → nb)', () => {
    setBrowserLanguages(['en']);
    expect(resolveInitialWidgetLocale('no')).toBe('nb');
  });

  it('preserves a real non-native language so it can be runtime-translated', () => {
    // Japanese isn't a bundled locale, but it's a real language — keep it
    // (base "ja") so the widget fetches a runtime translation instead of
    // silently falling back to English.
    setBrowserLanguages(['ja-JP']);
    expect(resolveInitialWidgetLocale(undefined)).toBe('ja');
  });

  it('defaults to English when nothing valid resolves', () => {
    setBrowserLanguages(['zz-ZZ']);
    expect(resolveInitialWidgetLocale(undefined)).toBe('en');
  });
});
