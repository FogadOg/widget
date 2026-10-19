const THEME_VALUES = ['light', 'dark', 'system'] as const;
export type ThemeOverride = (typeof THEME_VALUES)[number];

/** Validates the embed URL's `theme` param; anything unrecognised means "use the config's theme". */
export function parseThemeOverride(raw: string | undefined): ThemeOverride | undefined {
  return raw && (THEME_VALUES as readonly string[]).includes(raw)
    ? (raw as ThemeOverride)
    : undefined;
}
