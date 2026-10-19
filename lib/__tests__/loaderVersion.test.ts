import { HIDDEN_ERROR_LOADER_VERSION, loaderAtLeast } from '../loaderVersion';

describe('loaderAtLeast', () => {
  it('compares numerically, not as strings', () => {
    expect(loaderAtLeast('0.1.10', '0.1.8')).toBe(true);
    expect(loaderAtLeast('0.1.8', '0.1.8')).toBe(true);
    expect(loaderAtLeast('0.2.0', '0.1.8')).toBe(true);
    expect(loaderAtLeast('0.1.7', '0.1.8')).toBe(false);
  });

  it.each([undefined, null, '', '__WIDGET_VERSION__', 'abc', '1'])(
    'treats %p as an older loader',
    (version) => {
      expect(loaderAtLeast(version as string | null | undefined, HIDDEN_ERROR_LOADER_VERSION)).toBe(false);
    },
  );

  it('never throws on a non-string version (a repeated query param arrives as an array)', () => {
    expect(loaderAtLeast(['0.1.8', '0.1.7'], HIDDEN_ERROR_LOADER_VERSION)).toBe(true);
    expect(loaderAtLeast(42, HIDDEN_ERROR_LOADER_VERSION)).toBe(false);
    expect(loaderAtLeast({}, HIDDEN_ERROR_LOADER_VERSION)).toBe(false);
  });
});
