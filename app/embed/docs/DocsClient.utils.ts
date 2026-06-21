// NOTE: exported for testing. Accepts explicit locale to avoid closure on hook.
export function getLocalizedText(textObj: { [lang: string]: string } | undefined, loc?: string): string {
  if (!textObj) return '';
  const useLoc = loc || 'en';

  if (textObj[useLoc]) return textObj[useLoc];
  if (textObj['en']) return textObj['en'];

  const values = Object.values(textObj);
  return values.length > 0 ? values[0] : '';
}

export function resolveLocalizedSuggestions(
  raw: unknown,
  loc?: string,
  defaultLanguage?: string,
): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((s): s is string => typeof s === 'string');
  }
  if (raw && typeof raw === 'object') {
    const map = raw as Record<string, unknown>;
    const candidates = [loc, defaultLanguage, 'en'].filter(Boolean) as string[];
    for (const lang of candidates) {
      const arr = map[lang];
      if (Array.isArray(arr) && arr.length > 0) {
        return arr.filter((s): s is string => typeof s === 'string');
      }
    }
    for (const arr of Object.values(map)) {
      if (Array.isArray(arr) && arr.length > 0) {
        return arr.filter((s): s is string => typeof s === 'string');
      }
    }
  }
  return [];
}

export function resolveParentOrigin(initialParentOrigin?: string): string | undefined {
  if (initialParentOrigin) return initialParentOrigin;
  if (typeof window === 'undefined') return undefined;

  try {
    if (document.referrer) {
      return new URL(document.referrer).origin;
    }

    if (window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0) {
      return window.location.ancestorOrigins[0];
    }
  } catch (e) {
    console.warn('Could not determine parent origin');
  }

  return undefined;
}
