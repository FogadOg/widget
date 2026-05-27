/** @jest-environment node */

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
}));

import fs from 'fs';
import { getEmbedSrc } from '../../lib/embedManifest';

const mockReadFileSync = fs.readFileSync as jest.Mock;

describe('lib/embedManifest', () => {
  beforeEach(() => {
    mockReadFileSync.mockReset();
  });

  describe('getEmbedSrc – catch branch (readManifest throws)', () => {
    it('returns widget fallback when readFileSync throws', () => {
      mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
      expect(getEmbedSrc('widget')).toEqual({
        src: 'https://widget.companin.tech/widget.js',
        integrityAttr: '',
      });
    });

    it('returns docs-widget fallback when readFileSync throws', () => {
      mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
      expect(getEmbedSrc('docs-widget')).toEqual({
        src: 'https://widget.companin.tech/docs-widget.js',
        integrityAttr: '',
      });
    });
  });

  describe('getEmbedSrc – fallback return (entry missing file or integrity)', () => {
    it('returns fallback when manifest has no entry for key', () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({}));
      expect(getEmbedSrc('widget')).toEqual({
        src: 'https://widget.companin.tech/widget.js',
        integrityAttr: '',
      });
    });

    it('returns fallback when manifest entry lacks integrity', () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ widget: { version: '1.0.0', file: '/widget-1.0.0.js' } }),
      );
      expect(getEmbedSrc('widget')).toEqual({
        src: 'https://widget.companin.tech/widget.js',
        integrityAttr: '',
      });
    });

    it('returns fallback when manifest entry lacks file', () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ widget: { version: '1.0.0', integrity: 'sha384-abc' } }),
      );
      expect(getEmbedSrc('widget')).toEqual({
        src: 'https://widget.companin.tech/widget.js',
        integrityAttr: '',
      });
    });
  });

  describe('getEmbedSrc – with valid manifest entry', () => {
    it('returns src and integrity when manifest has full widget entry', () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          widget: { version: '1.0.0', file: '/widget-1.0.0.js', integrity: 'sha384-abc' },
        }),
      );
      expect(getEmbedSrc('widget')).toEqual({
        src: 'https://widget.companin.tech/widget-1.0.0.js',
        integrityAttr: 'integrity="sha384-abc" crossorigin="anonymous"',
      });
    });

    it('returns src and integrity when manifest has full docs-widget entry', () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          'docs-widget': { version: '1.0.0', file: '/docs-widget-1.0.0.js', integrity: 'sha384-xyz' },
        }),
      );
      expect(getEmbedSrc('docs-widget')).toEqual({
        src: 'https://widget.companin.tech/docs-widget-1.0.0.js',
        integrityAttr: 'integrity="sha384-xyz" crossorigin="anonymous"',
      });
    });
  });
});
