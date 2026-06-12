import en from "../locales/en.json";
import de from "../locales/de.json";
import es from "../locales/es.json";
import fr from "../locales/fr.json";
import pt from "../locales/pt.json";
import sv from "../locales/sv.json";
import nl from "../locales/nl.json";
import nb from "../locales/nb.json";
import it from "../locales/it.json";
import pl from "../locales/pl.json";

const LOCALES = {
  en,
  de,
  es,
  fr,
  pt,
  sv,
  nl,
  nb,
  it,
  pl,
} as const;

export type SupportedLocale = keyof typeof LOCALES;
export type Locale = string;

export const SUPPORTED_LOCALES = Object.keys(LOCALES) as SupportedLocale[];

type PluralForms = {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
};

type TranslationMap = Record<string, string | PluralForms>;
type TranslationValue = string | PluralForms | TranslationMap;

export { LOCALES };

const RTL_LOCALES = new Set(["ar", "he", "fa", "ur"]);
const PLURAL_KEYS = new Set(["zero", "one", "two", "few", "many", "other"]);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const isPluralObject = (value: unknown): value is PluralForms =>
  isPlainObject(value) && Object.keys(value).some((key) => PLURAL_KEYS.has(key));

const normalizeLocale = (locale?: string | null): string | null => {
  if (!locale || typeof locale !== "string") return null;
  const normalized = locale.trim().replace("_", "-").toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

const isValidLocaleTag = (locale?: string | null): boolean => {
  if (!locale) return false;
  return /^[a-z]{2,3}(-[a-z0-9]+)*$/i.test(locale);
};

export const getLocaleDirection = (locale?: string | null): "ltr" | "rtl" => {
  const normalized = normalizeLocale(locale);
  if (!normalized) return "ltr";
  const short = normalized.split("-")[0];
  // Only flip dir when we have a translation for this locale. Showing an RTL
  // layout with English-fallback text is worse than leaving it LTR-English.
  if (!RTL_LOCALES.has(short)) return "ltr";
  if (!(short in LOCALES)) return "ltr";
  return "rtl";
};

// Maps alternate/regional codes to the project's supported locale code
const LOCALE_ALIASES: Record<string, SupportedLocale> = {
  no: "nb",  // Norwegian (generic) → Norwegian Bokmål
};

const resolveSupportedLocale = (locale?: string | null): SupportedLocale | null => {
  const normalized = normalizeLocale(locale);
  if (!normalized) return null;
  const short = normalized.split("-")[0];
  if (short in LOCALES) return short as SupportedLocale;
  if (short in LOCALE_ALIASES) return LOCALE_ALIASES[short];
  return null;
};

const getRawTranslation = (locale: string, key: string): TranslationValue | undefined => {
  const supported = resolveSupportedLocale(locale) ?? "en";
  return (LOCALES as Record<string, Record<string, TranslationValue>>)[supported]?.[key]
    ?? (LOCALES as Record<string, Record<string, TranslationValue>>).en?.[key];
};

const applyInterpolation = (
  template: string,
  vars?: Record<string, string | number>
): string => {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_match, key) => {
    const value = vars[key];
    return value === undefined || value === null ? "" : String(value);
  });
};

const pickPluralForm = (locale: string, forms: PluralForms, count: number): string => {
  try {
    const rule = new Intl.PluralRules(locale);
    const category = rule.select(count) as keyof PluralForms;
    return forms[category] || forms.other || "";
  } catch {
    return forms.other || "";
  }
};

export function t(
  locale: Locale,
  key: string,
  options?: {
    count?: number;
    context?: string;
    vars?: Record<string, string | number>;
  }
): string {
  let value = getRawTranslation(locale, key);

  if (options?.context && isPlainObject(value) && !isPluralObject(value)) {
    const contextValue = value[options.context];
    value = contextValue !== undefined ? contextValue : value;
  }

  if (typeof options?.count === "number") {
    if (isPluralObject(value)) {
      const form = pickPluralForm(locale, value, options.count);
      return applyInterpolation(form || key, { ...options.vars, count: options.count });
    }
  }

  if (typeof value === "string") {
    return applyInterpolation(value, options?.vars);
  }

  if (value !== undefined) {
    return String(value);
  }

  return key;
}

export function getTranslations(locale: string): Record<string, TranslationValue> {
  const supported = resolveSupportedLocale(locale);
  if (supported) return LOCALES[supported];
  return LOCALES.en;
}

export function resolveLocaleCandidates(candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    const normalized = normalizeLocale(candidate);
    if (!normalized || !isValidLocaleTag(normalized)) continue;
    const supported = resolveSupportedLocale(normalized);
    if (supported) return supported;
    if (getLocaleDirection(normalized) === "rtl") return normalized.split("-")[0];
  }
  return "en";
}