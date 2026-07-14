import { useMemo, useEffect, useState } from 'react';
import { DEFAULTS, DEFAULT_COLORS, DARK_DEFAULTS, SHADOW_INTENSITY, SIZE_PRESETS } from '../lib/constants';
import type { WidgetConfig } from '../types/widget';
import { normalizeHexColor, getReadableTextColor, getRelativeLuminance, withAlpha } from '../lib/colors';

const SPACING_MAP = {
  compact:     { padding: '8px',  gap: '6px'  },
  comfortable: { padding: '12px', gap: '10px' },
  spacious:    { padding: '20px', gap: '16px' },
} as const;

// Tracks the visitor's OS-level dark-mode preference, re-rendering when it
// changes. Used to resolve theme='system'. SSR-safe (returns false until mounted).
function usePrefersDark(): boolean {
  const [prefersDark, setPrefersDark] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setPrefersDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersDark(e.matches);
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);
  return prefersDark;
}

export function useWidgetStyles(widgetConfig?: WidgetConfig) {
  const primaryColor = normalizeHexColor(widgetConfig?.primary_color, DEFAULT_COLORS.PRIMARY);
  const secondaryColor = normalizeHexColor(widgetConfig?.secondary_color, DEFAULT_COLORS.SECONDARY);
  const rawBackground = normalizeHexColor(widgetConfig?.background_color, DEFAULT_COLORS.BACKGROUND);
  const rawText = normalizeHexColor(widgetConfig?.text_color, DEFAULT_COLORS.TEXT);
  // Resolve the effective theme. 'system' follows the visitor's OS setting.
  const prefersDark = usePrefersDark();
  const themeSetting = widgetConfig?.theme ?? 'light';
  const isDarkTheme = themeSetting === 'dark' || (themeSetting === 'system' && prefersDark);
  // In dark mode substitute a dark surface/text only when the configured colors
  // look light — so an admin who deliberately set dark colors is respected, and
  // the derived neutrals below (which key off background/text) adapt for free.
  const backgroundColor = isDarkTheme && getRelativeLuminance(rawBackground) > 0.5
    ? DARK_DEFAULTS.BACKGROUND : rawBackground;
  const textColor = isDarkTheme && getRelativeLuminance(rawText) < 0.5
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
