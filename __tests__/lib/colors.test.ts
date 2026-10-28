import { normalizeHexColor, hexToRgb } from '../../lib/colors';

describe('colors utilities', () => {
  test('normalizeHexColor returns fallback on undefined', () => {
    expect(normalizeHexColor(undefined, '#123456')).toBe('#123456');
  });

  test('normalizeHexColor allows valid 3‑digit hex', () => {
    expect(normalizeHexColor('#abc', '#000')).toBe('#abc');
  });

  test('normalizeHexColor allows valid 6‑digit hex', () => {
    expect(normalizeHexColor('#a1b2c3', '#000')).toBe('#a1b2c3');
  });

  test('normalizeHexColor falls back on invalid string', () => {
    expect(normalizeHexColor('not-a-color', '#000')).toBe('#000');
  });

  test('hexToRgb converts correctly', () => {
    expect(hexToRgb('#000000')).toBe('0, 0, 0');
    expect(hexToRgb('#ffffff')).toBe('255, 255, 255');
  });

  test('hexToRgb returns white for invalid input', () => {
    expect(hexToRgb('foo')).toBe('255, 255, 255');
  });
});

describe('3-digit hex', () => {
  // normalizeHexColor accepts #rgb, so every consumer must read it as the
  // same colour as #rrggbb — a parser that didn't read `#fff` as black and
  // rendered muted text white on a white panel.
  const { mutedOn, contrastRatioHex, getReadableTextColor } = require('../../lib/colors');

  test('hexToRgb expands #rgb', () => {
    expect(hexToRgb('#fff')).toBe('255, 255, 255');
    expect(hexToRgb('0a0')).toBe('0, 170, 0');
  });

  test('contrast and readable text treat #fff as white', () => {
    expect(contrastRatioHex('#fff', '#ffffff')).toBeCloseTo(1);
    expect(getReadableTextColor('#fff')).toBe('#000000');
  });

  test('mutedOn on a #fff panel stays dark and readable', () => {
    const muted = mutedOn('#1f2937', '#fff', 0.6, 4.5);
    expect(muted).toMatch(/^rgba\(31, 41, 55, /);
  });
});
