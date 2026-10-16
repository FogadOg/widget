/**
 * The docs widget themes its panel from the same useWidgetStyles result as the
 * chat widget (DocsClient → buildDocsTheme), so the shared appearance settings
 * have to survive that mapping.
 */
import { renderHook } from '@testing-library/react';
import { useWidgetStyles } from '../hooks/useWidgetStyles';
import { buildDocsTheme } from '../app/embed/docs/DocsClient.utils';
import { FALLBACK_FONT_STACK } from '../lib/fontStack';
import type { WidgetConfig } from '../types/widget';

const themeFor = (config: Record<string, unknown>) => {
  const styles = renderHook(() => useWidgetStyles(config as unknown as WidgetConfig)).result.current;
  return buildDocsTheme(styles);
};

describe('buildDocsTheme', () => {
  test('carries the configured panel shadow', () => {
    expect(themeFor({ shadow_intensity: 'lg', shadow_color: '#ff0000' }).panelShadow).toBe(
      '0 16px 56px rgba(255, 0, 0, 0.26)',
    );
  });

  test('turns the shadow off for intensity none', () => {
    expect(themeFor({ shadow_intensity: 'none' }).panelShadow).toBe('none');
  });

  test('keeps a 0 radius', () => {
    expect((themeFor({ border_radius: 0 }).vars as Record<string, string>)['--radius']).toBe('0px');
  });

  test('gives the font a fallback stack', () => {
    expect(themeFor({ font_family: 'Poppins' }).vars.fontFamily).toBe(`"Poppins", ${FALLBACK_FONT_STACK}`);
  });
});
