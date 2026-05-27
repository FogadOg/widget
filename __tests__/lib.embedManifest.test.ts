jest.mock('fs');

describe('lib/embedManifest', () => {
  const WIDGET_HOST = 'https://widget.companin.tech';

  beforeEach(() => {
    jest.resetModules();
  });

  function fsMock() {
    return require('fs') as jest.Mocked<typeof import('fs')>;
  }

  function load() {
    return require('../lib/embedManifest') as typeof import('../lib/embedManifest');
  }

  it('returns fallback src with empty integrityAttr when manifest file is missing (widget)', () => {
    fsMock().readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
    const { getEmbedSrc } = load();
    const result = getEmbedSrc('widget');
    expect(result.src).toBe(`${WIDGET_HOST}/widget.js`);
    expect(result.integrityAttr).toBe('');
  });

  it('returns fallback src with empty integrityAttr when manifest file is missing (docs-widget)', () => {
    fsMock().readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
    const { getEmbedSrc } = load();
    const result = getEmbedSrc('docs-widget');
    expect(result.src).toBe(`${WIDGET_HOST}/docs-widget.js`);
    expect(result.integrityAttr).toBe('');
  });

  it('returns versioned src and integrityAttr when manifest has a valid widget entry', () => {
    fsMock().readFileSync.mockReturnValue(
      JSON.stringify({ widget: { version: '1.2.3', file: '/widget-1.2.3.js', integrity: 'sha384-testHash' } })
    );
    const { getEmbedSrc } = load();
    const result = getEmbedSrc('widget');
    expect(result.src).toBe(`${WIDGET_HOST}/widget-1.2.3.js`);
    expect(result.integrityAttr).toBe('integrity="sha384-testHash" crossorigin="anonymous"');
  });

  it('returns versioned src and integrityAttr when manifest has a valid docs-widget entry', () => {
    fsMock().readFileSync.mockReturnValue(
      JSON.stringify({ 'docs-widget': { version: '1.2.3', file: '/docs-widget-1.2.3.js', integrity: 'sha384-docsHash' } })
    );
    const { getEmbedSrc } = load();
    const result = getEmbedSrc('docs-widget');
    expect(result.src).toBe(`${WIDGET_HOST}/docs-widget-1.2.3.js`);
    expect(result.integrityAttr).toBe('integrity="sha384-docsHash" crossorigin="anonymous"');
  });

  it('returns fallback when entry exists but integrity is missing', () => {
    fsMock().readFileSync.mockReturnValue(
      JSON.stringify({ widget: { version: '1.2.3', file: '/widget-1.2.3.js' } })
    );
    const { getEmbedSrc } = load();
    const result = getEmbedSrc('widget');
    expect(result.src).toBe(`${WIDGET_HOST}/widget.js`);
    expect(result.integrityAttr).toBe('');
  });

  it('returns fallback when entry exists but file is missing', () => {
    fsMock().readFileSync.mockReturnValue(
      JSON.stringify({ widget: { version: '1.2.3', integrity: 'sha384-testHash' } })
    );
    const { getEmbedSrc } = load();
    const result = getEmbedSrc('widget');
    expect(result.src).toBe(`${WIDGET_HOST}/widget.js`);
    expect(result.integrityAttr).toBe('');
  });

  it('returns fallback when requested key is not in manifest', () => {
    fsMock().readFileSync.mockReturnValue(
      JSON.stringify({ 'docs-widget': { version: '1.0.0', file: '/docs-widget-1.0.0.js', integrity: 'sha384-x' } })
    );
    const { getEmbedSrc } = load();
    const result = getEmbedSrc('widget');
    expect(result.src).toBe(`${WIDGET_HOST}/widget.js`);
    expect(result.integrityAttr).toBe('');
  });
});
