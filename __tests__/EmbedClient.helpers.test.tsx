import {
  applyCustomAssetsFromQuery,
  getNormalizedEdgeOffset,
  injectCustomAssets,
  injectCustomAssetsFromConfig,
  parseHostMessageCommand,
  resolveParentTargetOrigin,
} from '../app/embed/session/EmbedClient';

jest.mock('../lib/errorHandling', () => ({ logError: jest.fn() }));
jest.mock('../lib/cssValidator', () => ({ sanitizeCss: jest.fn((css: string) => css) }));

describe('EmbedClient helpers', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  test('injectCustomAssets appends a style element with provided css', () => {
    const css = '.test-foo{color:red}';
    injectCustomAssets(css);
    const styles = Array.from(document.head.querySelectorAll('style'));
    expect(styles.length).toBeGreaterThan(0);
    const last = styles[styles.length - 1];
    expect(last.textContent).toBe(css);
  });

  test('injectCustomAssets skips rendering when sanitizeCss returns empty content', () => {
    const { sanitizeCss } = require('../lib/cssValidator') as { sanitizeCss: jest.Mock };
    sanitizeCss.mockReturnValueOnce('');

    injectCustomAssets('.bad-css');

    expect(document.head.querySelectorAll('style')).toHaveLength(0);
  });

  test('applyCustomAssetsFromQuery injects decoded css from provided search string', () => {
    const css = '.test-bar{background:blue}';
    const encoded = encodeURIComponent(css);
    applyCustomAssetsFromQuery(`?customCss=${encoded}`);
    const styles = Array.from(document.head.querySelectorAll('style'));
    expect(styles.length).toBeGreaterThan(0);
    const last = styles[styles.length - 1];
    expect(last.textContent).toBe(css);
  });

  test('applyCustomAssetsFromQuery logs error when decodeURIComponent throws', () => {
    const mockedErrorHandling = require('../lib/errorHandling') as { logError: jest.Mock };
    const decodeSpy = jest.spyOn(global, 'decodeURIComponent').mockImplementation(() => {
      throw new Error('decode failed');
    });

    applyCustomAssetsFromQuery('?customCss=%');

    expect(mockedErrorHandling.logError).toHaveBeenCalled();
    decodeSpy.mockRestore();
  });

  test('injectCustomAssetsFromConfig ignores nullish and empty config values, but injects custom_css when present', () => {
    injectCustomAssetsFromConfig(null);
    injectCustomAssetsFromConfig(undefined);
    injectCustomAssetsFromConfig({ custom_css: '' });
    expect(document.head.querySelectorAll('style')).toHaveLength(0);

    injectCustomAssetsFromConfig({ custom_css: '.from-config{display:block}' });
    const styles = Array.from(document.head.querySelectorAll('style'));
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toBe('.from-config{display:block}');
  });

  test('parseHostMessageCommand parses plain string and object payloads', () => {
    expect(parseHostMessageCommand('hello from host')).toEqual({
      kind: 'message',
      text: 'hello from host',
    });
    expect(parseHostMessageCommand(' SHOW ')).toEqual({
      kind: 'action',
      action: 'open',
    });
    expect(parseHostMessageCommand({ command: 'toggle' })).toEqual({
      kind: 'action',
      action: 'toggle',
    });
    expect(parseHostMessageCommand({ content: 'question?' })).toEqual({
      kind: 'message',
      text: 'question?',
    });
    expect(parseHostMessageCommand({})).toBeNull();
  });

  test('resolveParentTargetOrigin honors explicit, referrer, and strict fallback behavior', () => {
    expect(resolveParentTargetOrigin('https://host.example.com', 'https://referrer.example.com/path')).toBe(
      'https://host.example.com'
    );
    expect(resolveParentTargetOrigin(undefined, 'https://referrer.example.com/path?a=1')).toBe(
      'https://referrer.example.com'
    );
    expect(resolveParentTargetOrigin(undefined, 'not-a-valid-url')).toBe('*');
    expect(resolveParentTargetOrigin(undefined, 'not-a-valid-url', true)).toBeNull();
  });

  test('resolveParentTargetOrigin uses document.referrer when referrer param is not provided', () => {
    Object.defineProperty(document, 'referrer', { value: 'https://host.example.com/page', configurable: true });
    expect(resolveParentTargetOrigin(undefined, undefined)).toBe('https://host.example.com');
    Object.defineProperty(document, 'referrer', { value: '', configurable: true });
  });

  test('getNormalizedEdgeOffset handles missing, numeric, string, and invalid values', () => {
    expect(getNormalizedEdgeOffset()).toBe(20);
    expect(getNormalizedEdgeOffset({ edgeOffset: 32 } as any)).toBe(32);
    expect(getNormalizedEdgeOffset({ edge_offset: 16 } as any)).toBe(16);
    expect(getNormalizedEdgeOffset({ edgeOffset: '12.5' } as any)).toBe(12.5);
    expect(getNormalizedEdgeOffset({ edgeOffset: 'abc' } as any)).toBe(20);
    expect(getNormalizedEdgeOffset({ edgeOffset: Infinity } as any)).toBe(20);
  });
});
