import { buildFontStack, FALLBACK_FONT_STACK } from '../fontStack';

describe('buildFontStack', () => {
  test('keeps the named font first and always ends with the fallback stack', () => {
    expect(buildFontStack('Inter')).toBe(`"Inter", ${FALLBACK_FONT_STACK}`);
  });

  test('quotes names with spaces or digits', () => {
    expect(buildFontStack('Source Sans 3')).toBe(`"Source Sans 3", ${FALLBACK_FONT_STACK}`);
  });

  test('never quotes generic families or system keywords', () => {
    expect(buildFontStack('system-ui')).toBe(`system-ui, ${FALLBACK_FONT_STACK}`);
    expect(buildFontStack('Inter, -apple-system, sans-serif')).toBe(
      `"Inter", -apple-system, sans-serif, ${FALLBACK_FONT_STACK}`,
    );
  });

  test('leaves an already quoted name alone', () => {
    expect(buildFontStack("'Open Sans', serif")).toBe(`'Open Sans', serif, ${FALLBACK_FONT_STACK}`);
  });

  test('strips stray quotes and backslashes from a name before quoting it', () => {
    expect(buildFontStack('Bad"Font\\')).toBe(`"BadFont", ${FALLBACK_FONT_STACK}`);
  });

  test.each([undefined, null, '', ' , '])('falls back to the stack alone for %p', (value) => {
    expect(buildFontStack(value as string | null | undefined)).toBe(FALLBACK_FONT_STACK);
  });
});
