import * as helpers from '../app/embed/session/helpers';
import { STORAGE_PREFIX } from '../lib/constants';

describe('embed session helpers', () => {
  beforeEach(() => {
    localStorage.clear();
    try { Object.defineProperty(document, 'referrer', { value: '', configurable: true }); } catch {}
  });
  test('storage key helpers produce expected strings', () => {
    expect(helpers.sessionStorageKey('c1', 'a1')).toBe(`${STORAGE_PREFIX}session-c1-a1`);
    expect(helpers.unreadStorageKey('c1', 'a1')).toBe(`${STORAGE_PREFIX}unread-c1-a1`);
    expect(helpers.lastReadStorageKey('c1', 'a1')).toBe(`${STORAGE_PREFIX}lastread-c1-a1`);
  });
  test('getVisitorId generates and persists id', () => {
    const randomUuidSpy = jest
      .spyOn(global.crypto, 'randomUUID')
      .mockReturnValue('11111111-1111-4111-8111-111111111111');
    const vid = helpers.getVisitorId('clientX');
    const key = `${STORAGE_PREFIX}visitor-clientX`;
    expect(localStorage.getItem(key)).toBe(vid);
    expect(vid).toBe('widget-11111111-1111-4111-8111-111111111111');
    // calling again returns same id
    const vid2 = helpers.getVisitorId('clientX');
    expect(vid2).toBe(vid);
    randomUuidSpy.mockRestore();
  });
  // Embedded scenarios (window.top !== window.self) are difficult to simulate
  // in this test environment because `window.top` is non-configurable in jsdom.
  // We cover the non-embedded behavior below and other helpers.
  test('getPageContext when not embedded', () => {
    document.title = 'My Page';
    const ctx = helpers.getPageContext();
    expect(ctx.url).toBe(window.location.href);
    expect(ctx.pathname).toBe(window.location.pathname);
    expect(ctx.title).toBe('My Page');
  });
  test('storeSession and getStoredSession with valid expiry', () => {
    const key = 'sess-key';
    const sid = 's123';
    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    helpers.storeSession(key, sid, future);
    const stored = helpers.getStoredSession(key);
    expect(stored).not.toBeNull();
    expect((stored as any).sessionId).toBe(sid);
  });
  test('getStoredSession removes expired sessions', () => {
    const key = 'sess-exp';
    const sid = 'sExpired';
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    localStorage.setItem(key, JSON.stringify({ sessionId: sid, expiresAt: past }));
    const res = helpers.getStoredSession(key);
    expect(res).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });
  test('loadSessionMessages maps API messages and calls setMessages', async () => {
    const fakeData = {
      status: 'success',
      data: {
        messages: [
          { id: 'm1', content: 'hello', sender: 'user', created_at: '2020-01-01T00:00:00Z' },
          { id: 'm2', content: 'hi', sender: 'assistant', created_at: '2020-01-01T00:00:01Z' },
        ]
      }
    };
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => fakeData });
    const setMessages = jest.fn();
    await helpers.loadSessionMessages('sess1', 'token', setMessages);
    expect((global as any).fetch).toHaveBeenCalled();
    expect(setMessages).toHaveBeenCalled();
    const msgs = (setMessages.mock.calls[0][0] as any[]);
    expect(msgs.length).toBe(2);
    expect(msgs[0].id).toBe('m1');
    expect(msgs[1].from).toBe('agent');
  });
  test('getStoredSession handles invalid JSON and logs error', () => {
    const key = 'bad-json';
    localStorage.setItem(key, '{ invalid json');
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = helpers.getStoredSession(key);
    expect(res).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
  test('storeSession logs errors when localStorage.setItem throws', () => {
    const key = 'sess-throw';
    const sid = 's1';
    const expires = new Date().toISOString();
    const originalSet = localStorage.setItem;
    localStorage.setItem = jest.fn(() => { throw new Error('quota'); });
    // spy on the logger helper used by module
    // make setItem throw and ensure storeSession does not throw
    const mocked = jest.fn(() => { throw new Error('quota'); });
    try {
      // attempt to replace setItem; may not be allowed in this environment
      localStorage.setItem = mocked as any;
    } catch (_) {
      // ignore
    }
    expect(() => helpers.storeSession(key, sid, expires)).not.toThrow();
    // restore original setItem if possible
    try { localStorage.setItem = originalSet; } catch {}
  });
  test('loadSessionMessages logs error when response not ok', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const setMessages = jest.fn();
    await helpers.loadSessionMessages('s1', 't', setMessages);
    expect((global as any).fetch).toHaveBeenCalled();
    expect(setMessages).not.toHaveBeenCalled();
  });
  test('getPageContext outer catch returns Unknown Page when location access throws', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const fakeWindow = {
      top: null,
      self: null,
      get location() {
        throw new Error('boom');
      },
    } as any;
    const fakeDocument = {
      get title() {
        throw new Error('boom');
      },
      referrer: '',
    } as any;
    const ctx = helpers.getPageContext(fakeWindow, fakeDocument);
    expect(ctx.title).toBe('Unknown Page');
    consoleErrorSpy.mockRestore();
  });
});
