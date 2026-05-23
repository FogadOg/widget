import { getOrCreateVisitorId, getStoredSessionByKey, storeSessionByKey } from '../sessionStorage';

import * as sessionStorageModule from '../sessionStorage';

jest.mock('../logger', () => ({ logError: jest.fn() }));

describe('sessionStorage utilities', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
    jest.clearAllMocks();
    sessionStorageModule.setConsentRequired(false);
    sessionStorageModule.revokeStorageConsent();
  });

  afterEach(() => {
    sessionStorageModule.setConsentRequired(false);
    sessionStorageModule.revokeStorageConsent();
  });

  test('getOrCreateVisitorId returns existing id from localStorage', () => {
    localStorage.setItem('visitor-key', 'widget-existing');
    const id = getOrCreateVisitorId('visitor-key', 'widget');
    expect(id).toBe('widget-existing');
  });

  test('getOrCreateVisitorId creates and stores new visitor id when none exists', () => {
    const id = getOrCreateVisitorId('new-key', 'widget');
    expect(id).toMatch(/^widget-/);
    expect(localStorage.getItem('new-key')).toBe(id);
  });

  test('getOrCreateVisitorId falls back when localStorage access throws', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('fail'); });
    const id = getOrCreateVisitorId('visitor-key', 'pref');
    expect(id).toMatch(/^pref-fallback-/);
  });

  test('getOrCreateVisitorId falls back when secure random generation is unavailable', () => {
    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', {
      value: undefined,
      configurable: true,
    });

    try {
      const id = getOrCreateVisitorId('visitor-key', 'pref2');
      expect(id).toMatch(/^pref2-fallback-[a-z0-9-]+/i);
    } finally {
      Object.defineProperty(globalThis, 'crypto', {
        value: originalCrypto,
        configurable: true,
      });
    }
  });

  test('getOrCreateVisitorId uses crypto.getRandomValues when randomUUID is unavailable', () => {
    const originalCrypto = globalThis.crypto;
    const getRandomValues = jest.fn((bytes: Uint8Array) => {
      bytes.set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
      return bytes;
    });

    Object.defineProperty(globalThis, 'crypto', {
      value: { getRandomValues },
      configurable: true,
    });

    try {
      const id = getOrCreateVisitorId('random-values-key', 'widget');
      expect(id).toBe('widget-000102030405060708090a0b0c0d0e0f');
      expect(getRandomValues).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem('random-values-key')).toBe(id);
    } finally {
      Object.defineProperty(globalThis, 'crypto', {
        value: originalCrypto,
        configurable: true,
      });
    }
  });

  test('getStoredSessionByKey returns stored session when unexpired', () => {
    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const payload = { sessionId: 's1', expiresAt: future };
    localStorage.setItem('sess-key', JSON.stringify(payload));
    const res = getStoredSessionByKey('sess-key');
    expect(res).not.toBeNull();
    expect(res?.sessionId).toBe('s1');
  });

  test('getStoredSessionByKey removes expired sessions and returns null', () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const payload = { sessionId: 's2', expiresAt: past };
    localStorage.setItem('sess-key', JSON.stringify(payload));
    const res = getStoredSessionByKey('sess-key');
    expect(res).toBeNull();
    expect(localStorage.getItem('sess-key')).toBeNull();
  });

  test('getStoredSessionByKey returns null when session has no expiresAt field', () => {
    localStorage.setItem('no-exp-key', JSON.stringify({ sessionId: 'no-exp' }));
    const res = getStoredSessionByKey('no-exp-key');
    expect(res).toBeNull();
  });

  test('getStoredSessionByKey handles invalid JSON gracefully', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => '{notjson');
    const res = getStoredSessionByKey('bad-key');
    expect(res).toBeNull();
  });

  test('getStoredSessionByKey returns null when localStorage access throws', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    expect(getStoredSessionByKey('throwing-key')).toBeNull();
  });

  describe('consent gating and memory fallback', () => {
    const { setConsentRequired, grantStorageConsent, revokeStorageConsent } = sessionStorageModule;
    const testKey = 'widget-test-consent';
    const testExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    beforeEach(() => {
      localStorage.clear();
      revokeStorageConsent();
      setConsentRequired(false);
    });

    test('when consent is required, session writes stay out of localStorage but remain readable', () => {
      setConsentRequired(true);
      storeSessionByKey(testKey, 'foo', testExpiry);
      expect(localStorage.getItem(testKey)).toBeNull();
      expect(getStoredSessionByKey(testKey)?.sessionId).toBe('foo');
    });

    test('granting consent flushes in-memory session storage to localStorage', () => {
      setConsentRequired(true);
      storeSessionByKey(testKey, 'baz', testExpiry);
      expect(localStorage.getItem(testKey)).toBeNull();
      grantStorageConsent();
      const raw = localStorage.getItem(testKey);
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw as string).sessionId).toBe('baz');
    });

    test('granting consent tolerates localStorage.setItem failures', () => {
      setConsentRequired(true);
      storeSessionByKey(testKey, 'still-safe', testExpiry);

      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota');
      });

      expect(() => grantStorageConsent()).not.toThrow();
      setItemSpy.mockRestore();
    });

    test('revoking consent clears widget keys from localStorage and in-memory fallback', () => {
      localStorage.setItem('companin-foo', '1');
      localStorage.setItem('widget-bar', '2');
      localStorage.setItem('other', '3');

      setConsentRequired(true);
      storeSessionByKey(testKey, 'mem-only', testExpiry);

      revokeStorageConsent();
      expect(localStorage.getItem('companin-foo')).toBeNull();
      expect(localStorage.getItem('widget-bar')).toBeNull();
      expect(localStorage.getItem('other')).toBe('3');
      expect(getStoredSessionByKey(testKey)).toBeNull();
    });
  });
});

describe('sessionStorage test suite', () => {
  test('storeSessionByKey stores session JSON with createdAt', () => {
    storeSessionByKey('store-key', 'sess-10', new Date(Date.now() + 10000).toISOString());
    const raw = localStorage.getItem('store-key');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.sessionId).toBe('sess-10');
    expect(parsed.createdAt).toBeTruthy();
  });

  test('storeSessionByKey logs and continues when setItem throws', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(() => storeSessionByKey('store-key', 'sess-err', new Date().toISOString())).not.toThrow();
  });
});
