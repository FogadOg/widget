/**
 * Same-origin proxy for customer-selected Google Fonts.
 *
 * Loading fonts.googleapis.com / fonts.gstatic.com straight from the visitor's
 * browser hands Google every visitor's IP address, which German courts have
 * ruled unlawful without consent (LG München I, 3 O 17493/20). The widget is
 * sold as EU-native, so instead the browser only ever talks to the widget
 * origin: `/fonts/css` fetches Google's stylesheet server-side and rewrites its
 * font URLs to `/fonts/file/…`, which streams the .woff2 through.
 *
 * Both routes are pinned to the two Google hosts, serve only the curated
 * families below, and validate file paths against the exact shape Google
 * produces, so this can't be used to fetch anything else.
 */

const CSS_UPSTREAM = 'https://fonts.googleapis.com/css2';
const FILE_UPSTREAM = 'https://fonts.gstatic.com/';
export const FONT_FILE_ROUTE = '/fonts/file/';

// Google serves woff2 with per-script unicode-range subsets only to modern
// user agents; a server-side fetch without one gets legacy TTF.
const UPSTREAM_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const UPSTREAM_TIMEOUT_MS = 5000;

/**
 * The Google families a widget can use: the dashboard's picker offers exactly
 * these, and the backend stores any other family under the system source. So
 * nothing else can legitimately reach the proxy, and refusing it up front means
 * a random name never costs a Google request or a cached miss.
 *
 * Mirrors GOOGLE_FONTS in assistant/components/models/widgetFonts.ts and
 * GOOGLE_FONT_FAMILIES in assistantApp/organization/fonts.py.
 */
export const GOOGLE_FONT_FAMILIES: ReadonlySet<string> = new Set([
  // Sans-serif
  'DM Sans', 'Inter', 'Lato', 'Lexend', 'Manrope', 'Montserrat',
  'Nunito', 'Open Sans', 'Outfit', 'Plus Jakarta Sans', 'Poppins',
  'Raleway', 'Roboto', 'Sora', 'Source Sans 3', 'Ubuntu', 'Work Sans',
  // Serif
  'Crimson Pro', 'EB Garamond', 'Libre Baskerville', 'Lora',
  'Merriweather', 'Playfair Display',
  // Display / Geometric
  'Barlow', 'Bebas Neue', 'Bricolage Grotesque', 'Josefin Sans',
  'Oswald', 'Space Grotesk',
  // Monospace
  'Fira Code', 'IBM Plex Mono', 'JetBrains Mono', 'Space Mono',
]);
// Every file URL in a css2 response is `s/<family>/v<N>/<hash>.woff2`.
const FILE_PATH_RE = /^s\/[a-z0-9]+\/v\d+\/[A-Za-z0-9_-]+\.woff2$/;

export const CSS_TTL_SECONDS = 60 * 60 * 24;
const NEGATIVE_TTL_SECONDS = 60 * 60;

export function isValidFontFamily(family: string | null | undefined): family is string {
  return typeof family === 'string' && GOOGLE_FONT_FAMILIES.has(family.trim());
}

export function isValidFontFilePath(path: string): boolean {
  return FILE_PATH_RE.test(path);
}

/** Same-origin stylesheet URL for a font family, as used by the embed pages. */
export function fontStylesheetUrl(family: string): string {
  return `/fonts/css?family=${encodeURIComponent(family.trim())}`;
}

export function buildUpstreamCssUrl(family: string): string {
  const name = family.trim().replace(/ +/g, '+');
  return `${CSS_UPSTREAM}?family=${name}:wght@300;400;500;600;700&display=swap`;
}

/**
 * Point every font URL at the proxy. Returns null if the stylesheet references
 * anything we wouldn't serve, so a changed upstream format fails closed rather
 * than leaking a direct Google request.
 */
export function rewriteFontCss(css: string): string | null {
  let ok = true;
  const rewritten = css.replace(/url\(([^)]+)\)/g, (_match, raw: string) => {
    const url = raw.trim().replace(/^['"]|['"]$/g, '');
    const path = url.startsWith(FILE_UPSTREAM) ? url.slice(FILE_UPSTREAM.length) : '';
    if (!isValidFontFilePath(path)) {
      ok = false;
      return _match;
    }
    return `url(${FONT_FILE_ROUTE}${path})`;
  });
  return ok ? rewritten : null;
}

type CacheEntry = { body: string | ArrayBuffer; status: number; expires: number; size: number };

/** Small byte-bounded cache; Map iteration order makes the oldest entry first. */
class BoundedCache {
  private entries = new Map<string, CacheEntry>();
  private bytes = 0;

  constructor(private readonly maxBytes: number) {}

  get(key: string): CacheEntry | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= Date.now()) {
      this.delete(key);
      return undefined;
    }
    return entry;
  }

  set(key: string, body: string | ArrayBuffer, status: number, ttlSeconds: number): void {
    const size = typeof body === 'string' ? body.length : body.byteLength;
    if (size > this.maxBytes) return;
    this.delete(key);
    while (this.bytes + size > this.maxBytes && this.entries.size) {
      this.delete(this.entries.keys().next().value as string);
    }
    this.entries.set(key, { body, status, expires: Date.now() + ttlSeconds * 1000, size });
    this.bytes += size;
  }

  clear(): void {
    this.entries.clear();
    this.bytes = 0;
  }

  private delete(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.bytes -= entry.size;
    this.entries.delete(key);
  }
}

const cssCache = new BoundedCache(2 * 1024 * 1024);
const fileCache = new BoundedCache(32 * 1024 * 1024);

/** Test hook. */
export function clearFontCaches(): void {
  cssCache.clear();
  fileCache.clear();
}

async function fetchUpstream(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { 'User-Agent': UPSTREAM_USER_AGENT },
      cache: 'no-store',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** `{ status, css }`: 200 with the rewritten stylesheet, 404 unknown family, 502 upstream failure. */
export async function loadFontCss(family: string): Promise<{ status: number; css: string }> {
  // Keyed on the upstream request itself. Case-folding the key let a request
  // for `inter` (which Google rejects) cache a 404 under the key that `Inter`
  // reads, breaking the font for every widget on this server.
  const url = buildUpstreamCssUrl(family);
  const cached = cssCache.get(url);
  if (cached) return { status: cached.status, css: cached.body as string };

  let res: Response;
  try {
    res = await fetchUpstream(url);
  } catch {
    return { status: 502, css: '' };
  }
  if (res.status === 400 || res.status === 404) {
    cssCache.set(url, '', 404, NEGATIVE_TTL_SECONDS);
    return { status: 404, css: '' };
  }
  if (!res.ok) return { status: 502, css: '' };

  const css = rewriteFontCss(await res.text());
  if (css === null) return { status: 502, css: '' };
  cssCache.set(url, css, 200, CSS_TTL_SECONDS);
  return { status: 200, css };
}

/** `{ status, body }`: 200 with the woff2 bytes, otherwise the upstream failure. */
export async function loadFontFile(path: string): Promise<{ status: number; body: ArrayBuffer | null }> {
  const cached = fileCache.get(path);
  if (cached) return { status: 200, body: cached.body as ArrayBuffer };

  let res: Response;
  try {
    res = await fetchUpstream(FILE_UPSTREAM + path);
  } catch {
    return { status: 502, body: null };
  }
  if (res.status === 404) return { status: 404, body: null };
  if (!res.ok) return { status: 502, body: null };

  const body = await res.arrayBuffer();
  // gstatic paths are content-versioned, so a cached file never goes stale.
  fileCache.set(path, body, 200, 60 * 60 * 24 * 7);
  return { status: 200, body };
}
