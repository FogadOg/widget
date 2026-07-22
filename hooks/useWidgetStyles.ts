import { useMemo, useSyncExternalStore } from 'react';
import { DEFAULTS, DEFAULT_COLORS, DARK_DEFAULTS, SHADOW_INTENSITY, SIZE_PRESETS } from '../lib/constants';
import type { WidgetConfig } from '../types/widget';
import { normalizeHexColor, getReadableTextColor, getRelativeLuminance, withAlpha } from '../lib/colors';

const SPACING_MAP = {
  compact:     { padding: '8px',  gap: '6px'  },
  comfortable: { padding: '12px', gap: '10px' },
  spacious:    { padding: '20px', gap: '16px' },
} as const;

// The visitor's OS-level dark-mode preference, exposed as an external store so
// React reads it via useSyncExternalStore — no effect + setState, no cascading
// render. Used to resolve theme='system'. SSR-safe (server snapshot is false).
const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

function subscribePrefersDark(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(DARK_MEDIA_QUERY);
  mq.addEventListener?.('change', onChange);
  return () => mq.removeEventListener?.('change', onChange);
}

function getPrefersDarkSnapshot(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(DARK_MEDIA_QUERY).matches;
}

function getPrefersDarkServerSnapshot(): boolean {
  return false;
}

function usePrefersDark(): boolean {
  return useSyncExternalStore(
    subscribePrefersDark,
    getPrefersDarkSnapshot,
    getPrefersDarkServerSnapshot,
  );
}

export function useWidgetStyles(widgetConfig?: WidgetConfig) {
  // Resolve the effective theme. 'system' follows the visitor's OS setting.
  const prefersDark = usePrefersDark();
  const themeSetting = widgetConfig?.theme ?? 'light';
  const isDarkTheme = themeSetting === 'dark' || (themeSetting === 'system' && prefersDark);

  // Per-mode palette: in dark mode prefer the admin's explicit dark_* color for
  // each field; a blank dark field falls back to the light value (and, for
  // background/text, to the legacy auto-derive below) so existing configs are
  // unchanged. Each field is independent — an admin can set only dark_background
  // and leave the rest to derive.
  const pick = (dark: string | undefined, light: string | undefined) =>
    isDarkTheme && dark ? dark : light;

  const primaryColor = normalizeHexColor(pick(widgetConfig?.dark_primary_color, widgetConfig?.primary_color), DEFAULT_COLORS.PRIMARY);
  const secondaryColor = normalizeHexColor(pick(widgetConfig?.dark_secondary_color, widgetConfig?.secondary_color), DEFAULT_COLORS.SECONDARY);
  const rawBackground = normalizeHexColor(pick(widgetConfig?.dark_background_color, widgetConfig?.background_color), DEFAULT_COLORS.BACKGROUND);
  const rawText = normalizeHexColor(pick(widgetConfig?.dark_text_color, widgetConfig?.text_color), DEFAULT_COLORS.TEXT);

  // Legacy auto-derive: when dark mode is active but NO explicit dark surface/text
  // was set, substitute the dark default only if the light color looks light — so
  // the derived neutrals below (which key off background/text) adapt for free.
  const backgroundColor = isDarkTheme && !widgetConfig?.dark_background_color && getRelativeLuminance(rawBackground) > 0.5
    ? DARK_DEFAULTS.BACKGROUND : rawBackground;
  const textColor = isDarkTheme && !widgetConfig?.dark_text_color && getRelativeLuminance(rawText) < 0.5
    ? DARK_DEFAULTS.TEXT : rawText;
  // WCAG-contrast text color for any surface painted with primaryColor (buttons,
  // user bubbles, etc.) so a light brand color doesn't yield unreadable white. (#10)
  const readableOnPrimary = getReadableTextColor(primaryColor);
  // Same, for surfaces painted with secondaryColor (header control buttons, the
  // docs header accent chip) so the icon/text stays legible on any secondary.
  const readableOnSecondary = getReadableTextColor(secondaryColor);

  // Theme-aware neutrals derived from the configured colors so secondary text,
  // hairlines, skeletons and the typing indicator adapt to any brand/dark theme
  // instead of using hardcoded gray shades. (Monochrome-first: color = meaning only.)
  const isLightBackground = getRelativeLuminance(backgroundColor) > 0.4;
  const mutedTextColor = withAlpha(textColor, 0.6);
  const subtleBorderColor = withAlpha(textColor, 0.12);
  const skeletonColor = withAlpha(textColor, 0.1);
  // Agent bubble surface: a faint wash off the page so it reads as a distinct
  // surface in both light and dark themes (previously computed inline in EmbedShell).
  const agentBubbleBg = isLightBackground ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)';

  const borderRadius = widgetConfig?.border_radius || DEFAULTS.BORDER_RADIUS;
  const fontFamily = widgetConfig?.font_family || DEFAULTS.FONT_FAMILY;
  const fontSize = widgetConfig?.font_size || DEFAULTS.FONT_SIZE;
  const fontWeight = widgetConfig?.font_weight || DEFAULTS.FONT_WEIGHT;
  const shadowIntensity = widgetConfig?.shadow_intensity || DEFAULTS.SHADOW_INTENSITY;
  const shadowColor = normalizeHexColor(widgetConfig?.shadow_color, DEFAULT_COLORS.SHADOW);
  // Prefer `size` preset if provided; fall back to defaults.
  const sizePreset = (widgetConfig?.size ?? DEFAULTS.WIDGET_SIZE) as keyof typeof SIZE_PRESETS;
  const preset = SIZE_PRESETS[sizePreset] ?? null;
  const widgetWidth = preset ? preset.w : DEFAULTS.WIDGET_WIDTH;
  const widgetHeight = preset ? preset.h : DEFAULTS.WIDGET_HEIGHT;
  const buttonSize = widgetConfig?.button_size || DEFAULTS.BUTTON_SIZE;
  const messageBubbleRadius = widgetConfig?.message_bubble_radius || borderRadius;
  const buttonBorderRadius = widgetConfig?.button_border_radius || borderRadius;
  const backgroundOpacity = widgetConfig?.opacity || DEFAULTS.OPACITY;
  const showTimestamps = widgetConfig?.show_timestamps ?? true;
  const showTypingIndicator = widgetConfig?.show_typing_indicator ?? true;
  const showMessageAvatars = widgetConfig?.show_message_avatars ?? true;
  const showUnreadBadge = widgetConfig?.show_unread_badge ?? true;

  // Design system
  const spacing = widgetConfig?.spacing ?? 'comfortable';
  const spacingValues = SPACING_MAP[spacing] ?? SPACING_MAP.comfortable;

  const openAnimation = widgetConfig?.open_animation ?? 'slide';
  const bubbleAnimation = widgetConfig?.bubble_animation ?? 'none';
  const messageAnimation = widgetConfig?.message_animation ?? 'fade';
  const respectReducedMotion = widgetConfig?.respect_reduced_motion ?? true;

  const visualEffect = widgetConfig?.visual_effect ?? 'none';
  const visualEffectStyles = useMemo(() => {
    if (visualEffect === 'glassmorphism') {
      return {
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        backgroundOpacityOverride: 0.75 as number | undefined,
      };
    }
    if (visualEffect === 'frosted') {
      return {
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        backgroundOpacityOverride: 0.45 as number | undefined,
      };
    }
    return { backdropFilter: undefined, WebkitBackdropFilter: undefined, backgroundOpacityOverride: undefined };
  }, [visualEffect]);

  const getShadowStyle = useMemo(() => {
    const shadowValue = SHADOW_INTENSITY[shadowIntensity as keyof typeof SHADOW_INTENSITY] || SHADOW_INTENSITY.md;
    return shadowValue !== 'none' ? `${shadowValue} ${shadowColor}40` : 'none';
  }, [shadowIntensity, shadowColor]);

  const getButtonSizeClasses = useMemo(() => {
    const sizeMap = {
      sm: { width: 'w-12', height: 'h-12', icon: 'w-5 h-5' },
      md: { width: 'w-14', height: 'h-14', icon: 'w-6 h-6' },
      lg: { width: 'w-16', height: 'h-16', icon: 'w-7 h-7' }
    };
    return sizeMap[buttonSize as keyof typeof sizeMap] || sizeMap.md;
  }, [buttonSize]);

  const fontStyles = useMemo(
    () => ({
      fontFamily,
      fontSize: `${fontSize}px`,
      fontWeight,
    }),
    [fontFamily, fontSize, fontWeight]
  );

  return {
    primaryColor,
    secondaryColor,
    backgroundColor,
    textColor,
    readableOnPrimary,
    readableOnSecondary,
    mutedTextColor,
    subtleBorderColor,
    skeletonColor,
    agentBubbleBg,
    isLightBackground,
    borderRadius,
    fontStyles,
    getShadowStyle,
    getButtonSizeClasses,
    widgetWidth,
    widgetHeight,
    messageBubbleRadius,
    buttonBorderRadius,
    backgroundOpacity,
    showTimestamps,
    showTypingIndicator,
    showMessageAvatars,
    showUnreadBadge,
    // Design system
    spacingValues,
    openAnimation,
    bubbleAnimation,
    messageAnimation,
    respectReducedMotion,
    visualEffectStyles,
  };
}
