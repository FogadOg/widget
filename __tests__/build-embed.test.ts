import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const ROOT = process.cwd();

describe('scripts/build-embed.js', () => {
  it('copies embed files to public/ with header and is idempotent', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-build-'));

    // prepare minimal project layout in tmp
    fs.mkdirSync(path.join(tmp, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'src', 'embed'), { recursive: true });

    const scriptSrc = path.join(ROOT, 'scripts', 'build-embed.js');
    const docsSrc = path.join(ROOT, 'src', 'embed', 'docs-widget.js');
    const widgetSrc = path.join(ROOT, 'src', 'embed', 'widget.js');

    // copy script and sources
    fs.copyFileSync(scriptSrc, path.join(tmp, 'scripts', 'build-embed.js'));
    const docsContent = fs.readFileSync(docsSrc, 'utf8');
    const widgetContent = fs.readFileSync(widgetSrc, 'utf8');
    fs.writeFileSync(path.join(tmp, 'src', 'embed', 'docs-widget.js'), docsContent, 'utf8');
    fs.writeFileSync(path.join(tmp, 'src', 'embed', 'widget.js'), widgetContent, 'utf8');
    // ensure output dir exists (script does not create it)
    fs.mkdirSync(path.join(tmp, 'public'), { recursive: true });
    // the idempotency run requires the temp copy of build-embed.js which resolves
    // package.json relative to its own __dirname, so we need a copy in tmp
    fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(tmp, 'package.json'));

    // Run build script by requiring the repo script in-process so Jest collects
    // coverage for the original `scripts/build-embed.js`. We mock `fs` so the
    // script reads sources from our tmp layout and writes outputs into tmp.
    const realFs = fs;
    jest.resetModules();
    jest.isolateModules(() => {
      jest.doMock('fs', () => ({
        readFileSync: (p: string, enc: string) => {
          if (p.endsWith(path.join('src', 'embed', 'docs-widget.js'))) return realFs.readFileSync(path.join(tmp, 'src', 'embed', 'docs-widget.js'), 'utf8');
          if (p.endsWith(path.join('src', 'embed', 'widget.js'))) return realFs.readFileSync(path.join(tmp, 'src', 'embed', 'widget.js'), 'utf8');
          return realFs.readFileSync(p, enc);
        },
        writeFileSync: (p: string, data: string, enc: string) => {
          // mirror writes into the tmp directory preserving relative path
          const rel = path.relative(ROOT, p);
          const target = path.join(tmp, rel);
          realFs.mkdirSync(path.dirname(target), { recursive: true });
          realFs.writeFileSync(target, data, enc);
        },
        mkdirSync: (p: string, opts: any) => {
          const rel = path.relative(ROOT, p);
          return realFs.mkdirSync(path.join(tmp, rel), opts);
        },
        copyFileSync: realFs.copyFileSync,
        existsSync: (p: string) => true,
      }));

      // require the repo script (coverage will map to this file)
      require(path.join(ROOT, 'scripts', 'build-embed.js'));
    });

    // Resolve package version first — needed to locate the versioned output files.
    // The build script writes the real bundle to public/docs-widget-{VERSION}.js and
    // only a small stub loader to public/docs-widget.js, so content checks must target
    // the versioned file.
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const VERSION = String(pkg.version || '0.0.0');

    const outDocs = fs.readFileSync(path.join(tmp, 'public', `docs-widget-${VERSION}.js`), 'utf8');
    const outWidget = fs.readFileSync(path.join(tmp, 'public', `widget-${VERSION}.js`), 'utf8');

    // header should be present at start
    expect(outDocs.startsWith('// =============================================================================')).toBe(true);
    expect(outWidget.startsWith('// =============================================================================')).toBe(true);

    // The versioned bundle is minified before shipping (#9), so it no longer ends
    // with the verbatim source. Assert instead that the build-time version token was
    // substituted (no raw __WIDGET_VERSION__ remains) and a non-empty body follows
    // the header — both hold whether or not esbuild minified the output.
    expect(outDocs).not.toContain('__WIDGET_VERSION__');
    expect(outWidget).not.toContain('__WIDGET_VERSION__');
    expect(outWidget.length).toBeGreaterThan(200);
    expect(outDocs.length).toBeGreaterThan(200);

    // Idempotency: run again and ensure versioned files unchanged
    const beforeDocs = outDocs;
    const beforeWidget = outWidget;
    jest.resetModules();
    // clear cached module then require again to simulate re-run
    delete require.cache[require.resolve(path.join(tmp, 'scripts', 'build-embed.js'))];
    require(path.join(tmp, 'scripts', 'build-embed.js'));
    const afterDocs = fs.readFileSync(path.join(tmp, 'public', `docs-widget-${VERSION}.js`), 'utf8');
    const afterWidget = fs.readFileSync(path.join(tmp, 'public', `widget-${VERSION}.js`), 'utf8');
    expect(afterDocs).toBe(beforeDocs);
    expect(afterWidget).toBe(beforeWidget);

    // Now simulate source already containing a generated header and ensure no duplicate headers.
    // Check the versioned output (which strips the existing header before prepending).
    const header = `// =============================================================================\n// AUTO-GENERATED FILE — DO NOT EDIT DIRECTLY\n// Source: src/embed/docs-widget.js\n// Version: ${VERSION}\n// Regenerate: npm run build:embed\n// =============================================================================\n`;
    fs.writeFileSync(path.join(tmp, 'src', 'embed', 'docs-widget.js'), header + docsContent, 'utf8');
    // write header to source and require again
    jest.resetModules();
    delete require.cache[require.resolve(path.join(tmp, 'scripts', 'build-embed.js'))];
    require(path.join(tmp, 'scripts', 'build-embed.js'));
    const singleHeaderOut = fs.readFileSync(path.join(tmp, 'public', `docs-widget-${VERSION}.js`), 'utf8');
    // header should appear exactly once at start
    expect(singleHeaderOut.indexOf(header)).toBe(0);
    expect(singleHeaderOut.substr(header.length).startsWith(header)).toBe(false);
  });
});
