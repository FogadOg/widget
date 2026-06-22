import { renderHook } from '@testing-library/react';
import { useWidgetStyles } from '../../hooks/useWidgetStyles';
import type { WidgetConfig } from '../../types/widget';

const minimalConfig = {
  primary_color: '#112233',
  secondary_color: '#445566',
  background_color: '#778899',
  text_color: '#000000',
  border_radius: 10,
  font_family: 'Arial',
  font_size: 14,
  font_weight: '400',
  shadow_intensity: 'lg',
  shadow_color: '#000000',
  size: 'sm',
  button_size: 'lg',
  message_bubble_radius: 8,
  button_border_radius: 6,
  opacity: 0.5,
  show_timestamps: false,
  show_typing_indicator: false,
  show_message_avatars: false,
  show_unread_badge: false,
};

describe('useWidgetStyles', () => {
  it('computes style values from config', () => {
    const { result } = renderHook(() => useWidgetStyles(minimalConfig as unknown as WidgetConfig));
    expect(result.current.primaryColor).toBe('#112233');
    expect(result.current.showTimestamps).toBe(false);
    expect(result.current.fontStyles.fontFamily).toBe('Arial');
    expect(result.current.getButtonSizeClasses.width).toBe('w-16');
  });

  it('falls back to defaults when config is undefined', () => {
    const { result } = renderHook(() => useWidgetStyles(undefined));
    expect(result.current.primaryColor).toBeDefined();
    expect(result.current.showTimestamps).toBe(true);
  });
});

describe('useWidgetStyles — spacing presets', () => {
  it('returns comfortable padding and gap by default', () => {
    const { result } = renderHook(() => useWidgetStyles(undefined));
    expect(result.current.spacingValues.padding).toBe('12px');
    expect(result.current.spacingValues.gap).toBe('10px');
  });

  it('returns compact padding and gap for compact preset', () => {
    const { result } = renderHook(() =>
      useWidgetStyles({ ...minimalConfig, spacing: 'compact' } as unknown as WidgetConfig)
    );
    expect(result.current.spacingValues.padding).toBe('8px');
    expect(result.current.spacingValues.gap).toBe('6px');
  });

  it('returns spacious padding and gap for spacious preset', () => {
    const { result } = renderHook(() =>
      useWidgetStyles({ ...minimalConfig, spacing: 'spacious' } as unknown as WidgetConfig)
    );
    expect(result.current.spacingValues.padding).toBe('20px');
    expect(result.current.spacingValues.gap).toBe('16px');
  });
});

describe('useWidgetStyles — animation values', () => {
  it('defaults open_animation to slide', () => {
    const { result } = renderHook(() => useWidgetStyles(undefined));
    expect(result.current.openAnimation).toBe('slide');
  });

  it('uses configured open_animation', () => {
    const { result } = renderHook(() =>
      useWidgetStyles({ ...minimalConfig, open_animation: 'spring' } as unknown as WidgetConfig)
    );
    expect(result.current.openAnimation).toBe('spring');
  });

  it('defaults bubble_animation to none', () => {
    const { result } = renderHook(() => useWidgetStyles(undefined));
    expect(result.current.bubbleAnimation).toBe('none');
  });

  it('uses configured bubble_animation', () => {
    const { result } = renderHook(() =>
      useWidgetStyles({ ...minimalConfig, bubble_animation: 'pulse' } as unknown as WidgetConfig)
    );
    expect(result.current.bubbleAnimation).toBe('pulse');
  });

  it('defaults message_animation to fade', () => {
    const { result } = renderHook(() => useWidgetStyles(undefined));
    expect(result.current.messageAnimation).toBe('fade');
  });

  it('uses configured message_animation', () => {
    const { result } = renderHook(() =>
      useWidgetStyles({ ...minimalConfig, message_animation: 'slide' } as unknown as WidgetConfig)
    );
    expect(result.current.messageAnimation).toBe('slide');
  });

  it('defaults respectReducedMotion to true', () => {
    const { result } = renderHook(() => useWidgetStyles(undefined));
    expect(result.current.respectReducedMotion).toBe(true);
  });

  it('reflects respect_reduced_motion = false', () => {
    const { result } = renderHook(() =>
      useWidgetStyles({ ...minimalConfig, respect_reduced_motion: false } as unknown as WidgetConfig)
    );
    expect(result.current.respectReducedMotion).toBe(false);
  });
});

describe('useWidgetStyles — visual effect styles', () => {
  it('returns no backdrop filter for visual_effect none', () => {
    const { result } = renderHook(() =>
      useWidgetStyles({ ...minimalConfig, visual_effect: 'none' } as unknown as WidgetConfig)
    );
    expect(result.current.visualEffectStyles.backdropFilter).toBeUndefined();
    expect(result.current.visualEffectStyles.backgroundOpacityOverride).toBeUndefined();
  });

  it('defaults to no effect when visual_effect is absent', () => {
    const { result } = renderHook(() => useWidgetStyles(minimalConfig as unknown as WidgetConfig));
    expect(result.current.visualEffectStyles.backdropFilter).toBeUndefined();
  });

  it('returns blur(12px) and 0.75 opacity override for glassmorphism', () => {
    const { result } = renderHook(() =>
      useWidgetStyles({ ...minimalConfig, visual_effect: 'glassmorphism' } as unknown as WidgetConfig)
    );
    expect(result.current.visualEffectStyles.backdropFilter).toBe('blur(12px)');
    expect(result.current.visualEffectStyles.WebkitBackdropFilter).toBe('blur(12px)');
    expect(result.current.visualEffectStyles.backgroundOpacityOverride).toBe(0.75);
  });

  it('returns blur(24px) and 0.45 opacity override for frosted', () => {
    const { result } = renderHook(() =>
      useWidgetStyles({ ...minimalConfig, visual_effect: 'frosted' } as unknown as WidgetConfig)
    );
    expect(result.current.visualEffectStyles.backdropFilter).toBe('blur(24px)');
    expect(result.current.visualEffectStyles.WebkitBackdropFilter).toBe('blur(24px)');
    expect(result.current.visualEffectStyles.backgroundOpacityOverride).toBe(0.45);
  });

  it('glassmorphism has heavier blur than frosted', () => {
    // Sanity: frosted blur > glassmorphism blur (more opaque = less blur)
    const glass = renderHook(() =>
      useWidgetStyles({ ...minimalConfig, visual_effect: 'glassmorphism' } as unknown as WidgetConfig)
    ).result.current.visualEffectStyles;
    const frosted = renderHook(() =>
      useWidgetStyles({ ...minimalConfig, visual_effect: 'frosted' } as unknown as WidgetConfig)
    ).result.current.visualEffectStyles;
    const glassBlur = parseInt(glass.backdropFilter!.replace(/[^\d]/g, ''), 10);
    const frostedBlur = parseInt(frosted.backdropFilter!.replace(/[^\d]/g, ''), 10);
    expect(frostedBlur).toBeGreaterThan(glassBlur);
  });
});
