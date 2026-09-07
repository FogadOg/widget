/**
 * The parts of `app/embed/session/helpers.ts` the other helpers suites leave
 * alone: file upload, the locale/variant storage keys, the storage-availability
 * probe, and `loadSessionMessages`' two error contracts.
 *
 * The storage helpers matter more than they look: `clearStoredSession` and
 * `isStorageAvailable` both exist to survive Safari private mode, where
 * localStorage throws on write. Their whole reason to exist is the throwing
 * path, so that is what these tests force.
 */
import * as helpers from '../app/embed/session/helpers';
import { STORAGE_PREFIX } from '../lib/constants';

const jsonResponse = (body: unknown, init: { ok?: boolean; status?: number } = {}) => ({
  ok: init.ok ?? true,
  status: init.status ?? 200,
  json: async () => body,
});

describe('uploadSessionFile', () => {
  const file = new File(['hello'], 'note.txt', { type: 'text/plain' });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('posts multipart and returns the created attachment', async () => {
    const attachment = { id: 'att-1', filename: 'note.txt' };
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse({ status: 'success', data: attachment }));
    // @ts-expect-error test override
    global.fetch = fetchMock;

    await expect(helpers.uploadSessionFile('sess-1', file, 'tok-1')).resolves.toEqual(attachment);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('sess-1');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers.Authorization).toBe('Bearer tok-1');
    // The browser must set the multipart boundary itself.
    expect(init.headers['Content-Type']).toBeUndefined();
  });

  it('omits Authorization when there is no token', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse({ status: 'success', data: { id: 'a' } }));
    // @ts-expect-error test override
    global.fetch = fetchMock;

    await helpers.uploadSessionFile('sess-1', file);

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('rejects an empty sessionId before touching the network', async () => {
    const fetchMock = jest.fn();
    // @ts-expect-error test override
    global.fetch = fetchMock;

    await expect(helpers.uploadSessionFile('', file)).rejects.toThrow(/empty sessionId/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces the server detail message on failure', async () => {
    // @ts-expect-error test override
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse({ detail: 'File too large' }, { ok: false, status: 413 }));

    await expect(helpers.uploadSessionFile('sess-1', file)).rejects.toThrow('File too large');
  });

  it('falls back to the status code when the body carries no detail', async () => {
    // @ts-expect-error test override
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 500 }));

    await expect(helpers.uploadSessionFile('sess-1', file)).rejects.toThrow(/500/);
  });

  it('treats an unparseable body as a failure rather than throwing a SyntaxError', async () => {
    // @ts-expect-error test override
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('not json');
      },
    });

    await expect(helpers.uploadSessionFile('sess-1', file)).rejects.toThrow(/File upload failed/);
  });

  it('rejects a 200 that is not status:success', async () => {
    // @ts-expect-error test override
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({ status: 'error' }));

    await expect(helpers.uploadSessionFile('sess-1', file)).rejects.toThrow(/File upload failed/);
  });
});

describe('storage key helpers', () => {
  it('suffixes the session key with the locale to stop cross-locale bleed', () => {
    expect(helpers.sessionStorageKeyForLocale('c1', 'a1', 'fr')).toBe(
      `${STORAGE_PREFIX}session-c1-a1-fr`,
    );
  });

  it('matches the plain key when no locale is given', () => {
    expect(helpers.sessionStorageKeyForLocale('c1', 'a1')).toBe(helpers.sessionStorageKey('c1', 'a1'));
    expect(helpers.sessionStorageKeyForLocale('c1', 'a1', '')).toBe(
      helpers.sessionStorageKey('c1', 'a1'),
    );
  });

  it('builds the A/B variant key from client and config', () => {
    expect(helpers.variantStorageKey('c1', 'cfg1')).toBe(`${STORAGE_PREFIX}variant-c1-cfg1`);
  });

  it('builds the flow and local-message keys from the session', () => {
    expect(helpers.flowResponsesStorageKey('s1')).toBe(`${STORAGE_PREFIX}flow-s1`);
    expect(helpers.localMessagesStorageKey('s1')).toBe(`${STORAGE_PREFIX}local-msgs-s1`);
  });
});

describe('clearStoredSession', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  it('removes the key', () => {
    localStorage.setItem('k', 'v');
    helpers.clearStoredSession('k');
    expect(localStorage.getItem('k')).toBeNull();
  });

  it('swallows a throwing removeItem (Safari private mode)', () => {
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    expect(() => helpers.clearStoredSession('k')).not.toThrow();
  });
});

describe('isStorageAvailable', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  it('is true when a probe round-trips, and leaves nothing behind', () => {
    expect(helpers.isStorageAvailable()).toBe(true);
    expect(localStorage.getItem('__companin_storage_probe__')).toBeNull();
  });

  it('is false when writing throws', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(helpers.isStorageAvailable()).toBe(false);
  });
});

describe('loadSessionMessages', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps the API shape onto Message and hands it to the callback', async () => {
    // @ts-expect-error test override
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        status: 'success',
        data: {
          messages: [
            {
              id: 'm1',
              content: 'Hi',
              sender: 'assistant',
              created_at: '2026-01-01T00:00:00.000Z',
            },
            { id: 'm2', content: 'Hello', sender: 'user' },
          ],
        },
      }),
    );
    const setMessages = jest.fn();

    await helpers.loadSessionMessages('sess-1', 'tok-1', setMessages);

    const [loaded] = setMessages.mock.calls[0];
    // `sender: 'assistant'` becomes `from: 'agent'` — the widget's own vocabulary.
    expect(loaded[0]).toMatchObject({ id: 'm1', text: 'Hi', from: 'agent' });
    expect(loaded[1]).toMatchObject({ id: 'm2', text: 'Hello', from: 'user' });
    // A message without created_at still gets a usable timestamp.
    expect(typeof loaded[1].timestamp).toBe('number');
  });

  it('returns without fetching when the sessionId is empty', async () => {
    const fetchMock = jest.fn();
    // @ts-expect-error test override
    global.fetch = fetchMock;

    await expect(helpers.loadSessionMessages('')).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('swallows the error when a callback was supplied', async () => {
    // @ts-expect-error test override
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

    await expect(helpers.loadSessionMessages('sess-1', null, jest.fn())).resolves.toBeUndefined();
  });

  it('rethrows when no callback was supplied, so the caller can log with context', async () => {
    // @ts-expect-error test override
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

    await expect(helpers.loadSessionMessages('sess-1')).rejects.toThrow('network down');
  });

  it('rethrows a non-ok response when no callback was supplied', async () => {
    // @ts-expect-error test override
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 500 }));

    await expect(helpers.loadSessionMessages('sess-1')).rejects.toThrow(/500/);
  });

  it('ignores a success body whose messages are not an array', async () => {
    // @ts-expect-error test override
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse({ status: 'success', data: { messages: null } }));
    const setMessages = jest.fn();

    await helpers.loadSessionMessages('sess-1', null, setMessages);

    expect(setMessages).not.toHaveBeenCalled();
  });

  it('treats a boolean setMessages as "no callback" and rethrows', async () => {
    // @ts-expect-error test override
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

    await expect(helpers.loadSessionMessages('sess-1', null, true)).rejects.toThrow('network down');
  });
});
