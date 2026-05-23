describe('sessionStorage test suite', () => {
  test('getOrCreateVisitorId falls back when no secure random is available', () => {
    const origCrypto = (global as any).crypto;
    Object.defineProperty(globalThis, 'crypto', {
      value: {},
      configurable: true,
    });
    const sessionStorage = require('../lib/sessionStorage');
    try {
      const visitorId = sessionStorage.getOrCreateVisitorId('no-secure', 'fail');
      expect(visitorId).toMatch(/^fail-fallback-/);
    } finally {
      Object.defineProperty(globalThis, 'crypto', {
        value: origCrypto,
        configurable: true,
      });
    }
  });

  test('getOrCreateVisitorId falls back when crypto missing', () => {
    const orig = (global as any).crypto;
    const sessionStorage = require('../lib/sessionStorage');
    try {
      // remove crypto to force error
      // @ts-ignore
      delete (global as any).crypto;
      const res = sessionStorage.getOrCreateVisitorId('k1', 'pre');
      expect(typeof res).toBe('string');
      expect(res).toMatch(/^pre-/);
    } finally {
      // restore
      (global as any).crypto = orig;
    }
  });
});
