import { resolveDocsLayout } from '../app/embed/docs/DocsClient.utils';

// Locks the three docs "Widget variant" shells as genuinely distinct
// (parity with the chat widget's classic/minimal/panel), not merely cosmetic.
describe('resolveDocsLayout — per-variant distinctions', () => {
  const classic = resolveDocsLayout({ layout_variant: 'classic' });
  const minimal = resolveDocsLayout({ layout_variant: 'minimal' });
  const panel = resolveDocsLayout({ layout_variant: 'panel' });

  it('classic = full chrome (chip, subtitle, search, borders, 18px title)', () => {
    expect(classic).toMatchObject({
      variant: 'classic', showAccentChip: true, showSubtitle: true,
      showSearch: true, showRail: false, showSectionBorders: true, titlePx: 18,
    });
  });

  it('minimal = lean/flat/dense (no chip/subtitle/search/borders, 15px title, tight gap)', () => {
    expect(minimal).toMatchObject({
      variant: 'minimal', showAccentChip: false, showSubtitle: false,
      showSearch: false, showRail: false, showSectionBorders: false, titlePx: 15,
    });
    expect(minimal.conversationClassName).toContain('gap-3');
  });

  it('panel = app rail + medium density (rail on, chip in rail not header, search kept, 16px)', () => {
    expect(panel).toMatchObject({
      variant: 'panel', showRail: true, showAccentChip: false, showSearch: true, titlePx: 16,
    });
  });

  it('variants differ on every lever that matters', () => {
    expect(new Set([classic.showSearch, minimal.showSearch]).size).toBe(2);
    expect(new Set([classic.showRail, panel.showRail]).size).toBe(2);
    expect(new Set([classic.titlePx, minimal.titlePx, panel.titlePx]).size).toBe(3);
    expect(new Set([classic.conversationClassName, minimal.conversationClassName, panel.conversationClassName]).size).toBe(3);
    expect(new Set([classic.showSectionBorders, minimal.showSectionBorders]).size).toBe(2);
  });

  it('defaults to classic and honors size/spacing independently of variant', () => {
    expect(resolveDocsLayout({}).variant).toBe('classic');
    expect(resolveDocsLayout(undefined).variant).toBe('classic');
    const lg = resolveDocsLayout({ layout_variant: 'classic', size: 'lg', spacing: 'spacious' });
    expect(lg.widthVw).toBeGreaterThan(classic.widthVw);
    expect(lg.padX).toBeGreaterThan(classic.padX);
  });
});
