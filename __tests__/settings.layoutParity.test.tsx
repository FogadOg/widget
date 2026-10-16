/**
 * Settings → rendered output, through the REAL useWidgetStyles in every
 * layout shell. The shells pick from the hook's result individually, so a
 * setting can be computed correctly and still never reach the screen — the
 * shadow controls were dead for seven months that way, in every layout, while
 * the hook's own unit tests stayed green.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import EmbedShell from '../components/EmbedShell';
import { minimalProps } from './__fixtures__/EmbedShell.fixtures';

jest.mock('../hooks/useWidgetTranslation', () => ({
  useWidgetTranslation: () => ({ locale: 'en', translations: {} }),
}));

const LAYOUTS: Array<{ name: string; layout_variant: string; isEmbedded: boolean }> = [
  { name: 'classic (floating)', layout_variant: 'classic', isEmbedded: false },
  { name: 'classic (embedded)', layout_variant: 'classic', isEmbedded: true },
  { name: 'minimal', layout_variant: 'minimal', isEmbedded: false },
  { name: 'panel', layout_variant: 'panel', isEmbedded: false },
];

/** The open chat panel: the one fixed-position surface every shell stacks at 999999. */
function renderPanel(layout: (typeof LAYOUTS)[number], config: Record<string, unknown>) {
  const { container } = render(
    <EmbedShell
      {...(minimalProps as any)}
      isEmbedded={layout.isEmbedded}
      isCollapsed={false}
      widgetConfig={{ layout_variant: layout.layout_variant, ...config } as any}
    />,
  );
  const panel = Array.from(container.querySelectorAll<HTMLElement>('div')).find(
    (el) => el.style.zIndex === '999999' && el.style.overflow === 'hidden',
  );
  if (!panel) throw new Error(`no panel element rendered for ${layout.name}`);
  return panel;
}

describe.each(LAYOUTS)('$name layout', (layout) => {
  test('applies the configured shadow intensity and colour', () => {
    const panel = renderPanel(layout, { shadow_intensity: 'xl', shadow_color: '#ff0000' });
    expect(panel.style.boxShadow).toBe('0 24px 72px rgba(255, 0, 0, 0.32)');
  });

  test('keeps the pre-existing shadow for the default intensity', () => {
    const panel = renderPanel(layout, {});
    expect(panel.style.boxShadow).toBe('0 10px 40px rgba(0, 0, 0, 0.2)');
  });

  test('drops the shadow when intensity is none', () => {
    const panel = renderPanel(layout, { shadow_intensity: 'none' });
    expect(panel.style.boxShadow).toBe('none');
  });

  test('renders square corners when the radius is 0', () => {
    const panel = renderPanel(layout, { border_radius: 0 });
    expect(panel.style.borderRadius).toBe('0px');
  });
});
