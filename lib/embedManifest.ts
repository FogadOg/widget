import fs from 'fs';
import path from 'path';

const WIDGET_HOST = 'https://widget.companin.tech';

type ManifestEntry = { version: string; file: string; integrity: string };

function readManifest(): Record<string, ManifestEntry> | null {
  try {
    const p = path.join(process.cwd(), 'public/widget-embed-manifest.json');
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

export function getEmbedSrc(key: 'widget' | 'docs-widget') {
  const fallbackFile = key === 'docs-widget' ? '/docs-widget.js' : '/widget.js';
  const manifest = readManifest();
  const entry = manifest?.[key];
  if (entry?.file && entry?.integrity) {
    return {
      src: `${WIDGET_HOST}${entry.file}`,
      integrityAttr: `integrity="${entry.integrity}" crossorigin="anonymous"`,
    };
  }
  return { src: `${WIDGET_HOST}${fallbackFile}`, integrityAttr: '' };
}
