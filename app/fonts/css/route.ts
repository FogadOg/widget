import { NextResponse } from 'next/server';
import { CSS_TTL_SECONDS, isValidFontFamily, loadFontCss } from '../../../lib/fontProxy';

/** Same-origin Google Fonts stylesheet — see lib/fontProxy.ts for why. */
export async function GET(request: Request) {
  const family = new URL(request.url).searchParams.get('family');
  if (!isValidFontFamily(family)) {
    return new NextResponse('', { status: 400, headers: { 'Content-Type': 'text/css; charset=utf-8' } });
  }

  const { status, css } = await loadFontCss(family);
  return new NextResponse(css, {
    status,
    headers: {
      'Content-Type': 'text/css; charset=utf-8',
      'Cache-Control': status === 200
        ? `public, max-age=${CSS_TTL_SECONDS}, stale-while-revalidate=${CSS_TTL_SECONDS}`
        : 'public, max-age=300',
    },
  });
}
