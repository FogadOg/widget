import { useEffect, useState, useSyncExternalStore } from 'react';
import en from '../locales/en.json';
import { API, getApiBaseUrl } from '../lib/api';
import { STORAGE_PREFIX } from '../lib/constants';
import {
  UI_BUNDLE_VERSION,
  getRuntimeRevision,
  hasRuntimeBundle,
  isTranslatableLocale,
  registerRuntimeBundle,
  resolveSupportedLocale,
  subscribeRuntimeBundles,
} from '../lib/i18n';

// 'native'  → the locale is bundled (or English); no runtime work needed.
// 'loading' → fetching a translation; the widget shows English meanwhile.
// 'ready'   → a runtime bundle is registered and in use.
// 'error'   → fetch failed; the widget stays on English (graceful degrade).
export type RuntimeTranslationStatus = 'native' | 'loading' | 'ready' | 'error';

const cacheKey = (base: string) => `${STORAGE_PREFIX}ui-i18n:${UI_BUNDLE_VERSION}:${base}`;

/**
 * Subscribes a component to runtime-bundle registrations. Include the returned
 * value in the dependency list of any `getTranslations`/`t` memo so it
 * re-localizes the instant a fetched bundle lands.
 */
export function useRuntimeRevision(): number {
  return useSyncExternalStore(subscribeRuntimeBundles, getRuntimeRevision, getRuntimeRevision);
}

/**
 * Ensures the widget has UI strings for `locale`. Native locales are a no-op.
 * For any other real language it warms from localStorage, else fetches an
 * LLM-translated bundle from the backend and registers it for `getTranslations`.
 */
export function useRuntimeTranslation(locale: string): RuntimeTranslationStatus {
  const [status, setStatus] = useState<RuntimeTranslationStatus>('native');

  useEffect(() => {
    const base = (locale || '').split('-')[0].toLowerCase();

    // Bundled natively (incl. aliases like no→nb), English, or not a real
    // language → nothing to fetch.
    if (!base || base === 'en' || resolveSupportedLocale(locale) || !isTranslatableLocale(locale)) {
      setStatus('native');
      return;
    }

    if (hasRuntimeBundle(base)) {
      setStatus('ready');
      return;
    }

    // Warm from the client cache first — survives reloads with no network hit.
    try {
      const cached = window.localStorage.getItem(cacheKey(base));
      if (cached) {
        registerRuntimeBundle(base, JSON.parse(cached));
        setStatus('ready');
        return;
      }
    } catch {
      /* ignore corrupt/unavailable storage */
    }

    if (!getApiBaseUrl()) {
      setStatus('error');
      return;
    }

    let cancelled = false;
    setStatus('loading');
    (async () => {
      try {
        const res = await fetch(API.uiTranslations(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locale: base, version: UI_BUNDLE_VERSION, strings: en }),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const body = await res.json();
        const strings = body?.data?.strings;
        if (!strings || typeof strings !== 'object') throw new Error('malformed response');
        if (cancelled) return;
        try {
          window.localStorage.setItem(cacheKey(base), JSON.stringify(strings));
        } catch {
          /* ignore storage write failures (private mode / quota) */
        }
        registerRuntimeBundle(base, strings);
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [locale]);

  return status;
}
