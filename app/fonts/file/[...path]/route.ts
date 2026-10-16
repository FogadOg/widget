import { NextResponse } from 'next/server';
import { isValidFontFilePath, loadFontFile } from '../../../../lib/fontProxy';

/** Streams a Google Fonts .woff2 through the widget origin — see lib/fontProxy.ts. */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join('/');
  if (!isValidFontFilePath(path)) {
    return new NextResponse(null, { status: 404 });
  }

  const { status, body } = await loadFontFile(path);
  if (!body) return new NextResponse(null, { status });
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'font/woff2',
      // gstatic file paths are content-versioned.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
