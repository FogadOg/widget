import fs from 'fs';
import path from 'path';
import {
  GOOGLE_FONT_FAMILIES,
  buildUpstreamCssUrl,
  clearFontCaches,
  fontStylesheetUrl,
  isValidFontFamily,
  isValidFontFilePath,
  loadFontCss,
  loadFontFile,
  rewriteFontCss,
} from '../fontProxy';

const GOOGLE_CSS = `/* latin */
@font-face {
  font-family: 'Inter';
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZJhiI2B.woff2) format('woff2');
}`;

const mockFetch = (impl: (url: string) => Partial<Response>) => {
  const fn = jest.fn(async (url: string) => impl(url) as Response);
  global.fetch = fn as unknown as typeof fetch;
  return fn;
};

describe('fontProxy', () => {
  const realFetch = global.fetch;
  beforeEach(() => clearFontCaches());
  afterAll(() => {
    global.fetch = realFetch;
  });

  describe('input validation', () => {
    test.each(['Inter', 'Open Sans', 'Source Sans 3', 'IBM Plex Mono'])('accepts %s', (f) => {
      expect(isValidFontFamily(f)).toBe(true);
    });

    test.each(['', 'Inter&family=x', 'Inter:wght@900', '../etc', 'a'.repeat(51), null, undefined])(
      'rejects %p',
      (f) => expect(isValidFontFamily(f as string)).toBe(false),
    );

    // Well-formed names that aren't one of the curated families: a real Google
    // font the picker doesn't offer, a miscased one, and a junk name. None of
    // them may cost a Google request or a cached miss.
    test.each(['Comic Neue', 'inter', 'Open  Sans', 'Totally Made Up'])('refuses uncurated %p', (f) => {
      expect(isValidFontFamily(f)).toBe(false);
    });

    test('accepts only the versioned woff2 path shape Google emits', () => {
      expect(isValidFontFilePath('s/inter/v20/UcCO3Fwr_K-3.woff2')).toBe(true);
      expect(isValidFontFilePath('s/inter/v20/../../x.woff2')).toBe(false);
      expect(isValidFontFilePath('l/font?kit=abc')).toBe(false);
      expect(isValidFontFilePath('s/inter/v20/a.ttf')).toBe(false);
    });
  });

  test('builds same-origin and upstream URLs', () => {
    expect(fontStylesheetUrl('Open Sans')).toBe('/fonts/css?family=Open%20Sans');
    expect(buildUpstreamCssUrl('Open Sans')).toBe(
      'https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;500;600;700&display=swap',
    );
  });

  describe('rewriteFontCss', () => {
    test('points every font URL at the proxy', () => {
      const out = rewriteFontCss(GOOGLE_CSS)!;
      expect(out).toContain('url(/fonts/file/s/inter/v20/');
      expect(out).not.toContain('gstatic');
    });

    test('fails closed on a URL it would not serve', () => {
      expect(rewriteFontCss('src: url(https://evil.example/x.woff2)')).toBeNull();
    });
  });

  describe('loadFontCss', () => {
    test('returns the rewritten stylesheet and caches it', async () => {
      const fetchFn = mockFetch(() => ({ ok: true, status: 200, text: async () => GOOGLE_CSS }));

      const first = await loadFontCss('Inter');
      const second = await loadFontCss(' Inter ');

      expect(first.status).toBe(200);
      expect(first.css).toContain('/fonts/file/');
      expect(second).toEqual(first);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    test("a miss for another spelling can't poison the real family", async () => {
      // Google rejects `inter`; that 404 must not be served for `Inter`.
      const fetchFn = mockFetch((url) =>
        url.includes('family=Inter:')
          ? { ok: true, status: 200, text: async () => GOOGLE_CSS }
          : { ok: false, status: 400 },
      );

      expect((await loadFontCss('inter')).status).toBe(404);
      expect((await loadFontCss('Inter')).status).toBe(200);
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    test('maps an unknown family to 404 and caches the miss', async () => {
      const fetchFn = mockFetch(() => ({ ok: false, status: 400 }));

      expect((await loadFontCss('Nope')).status).toBe(404);
      expect((await loadFontCss('Nope')).status).toBe(404);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    test('reports 502 when Google is unreachable', async () => {
      global.fetch = jest.fn(async () => {
        throw new Error('network');
      }) as unknown as typeof fetch;
      expect((await loadFontCss('Inter')).status).toBe(502);
    });
  });

  describe('loadFontFile', () => {
    test('fetches from gstatic and caches the bytes', async () => {
      const bytes = new Uint8Array([1, 2, 3]).buffer;
      const fetchFn = mockFetch(() => ({ ok: true, status: 200, arrayBuffer: async () => bytes }));

      const path = 's/inter/v20/abc.woff2';
      expect((await loadFontFile(path)).body).toBe(bytes);
      await loadFontFile(path);

      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(fetchFn.mock.calls[0][0]).toBe('https://fonts.gstatic.com/s/inter/v20/abc.woff2');
    });

    test('passes through a 404', async () => {
      mockFetch(() => ({ ok: false, status: 404 }));
      expect(await loadFontFile('s/inter/v20/gone.woff2')).toEqual({ status: 404, body: null });
    });
  });
});

// The dashboard offers exactly these families; a font added there but not here
// would be picked, saved as Google, and then refused by the proxy. Only
// checkable where the dashboard is checked out next to the widget.
const DASHBOARD_FONTS = path.resolve(__dirname, '../../../assistant/components/models/widgetFonts.ts');
(fs.existsSync(DASHBOARD_FONTS) ? describe : describe.skip)('GOOGLE_FONT_FAMILIES', () => {
  test("matches the dashboard's GOOGLE_FONTS", () => {
    const source = fs.readFileSync(DASHBOARD_FONTS, 'utf8');
    const block = source.match(/export const GOOGLE_FONTS[^=]*=\s*\[([\s\S]*?)\];/);
    expect(block).not.toBeNull();
    const dashboard = [...block![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect([...GOOGLE_FONT_FAMILIES].sort()).toEqual(dashboard.sort());
  });
});
