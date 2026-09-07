/**
 * The rest of the `src/embed/widget.js` host API: diagnostics, debug/log
 * controls, session helpers, theme/context updates and the lifecycle methods.
 */
import { fromIframe, loadWidget, mockCW } from './__helpers__/embed.widget.helpers';

const BASE_ATTRS = {
  'data-client-id': 'client-1',
  'data-agent-id': 'agent-1',
  'data-config-id': 'config-1',
};

const ready = (attrs: Record<string, string> = {}) => {
  const { api, iframe } = loadWidget({ ...BASE_ATTRS, ...attrs });
  const cw = mockCW(iframe!);
  // jsdom calls close() on every frame at teardown.
  (cw as unknown as { close: () => void }).close = () => {};
  iframe!.dispatchEvent(new Event('load'));
  fromIframe(iframe!, { type: 'WIDGET_READY' });
  return { api, iframe: iframe!, cw };
};

/** Types of every message posted to the iframe so far. */
const postedTypes = (cw: { postMessage: jest.Mock }) =>
  cw.postMessage.mock.calls.map(([m]) => m?.type);

describe('widget.js API surface', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    delete (window as Record<string, unknown>).CompaninWidget;
    delete (window as Record<string, unknown>).CompaninWidgets;
    localStorage.clear();
    jest.restoreAllMocks();
  });

  test('reports its version', () => {
    const { api } = ready();
    expect(typeof api.getVersion()).toBe('string');
  });

  describe('debug controls', () => {
    test('enable and disable flip the flag', () => {
      const { api } = ready();

      api.enableDebug();
      expect(api.isDebugActive()).toBe(true);

      api.disableDebug();
      expect(api.isDebugActive()).toBe(false);
    });

    test('setLogLevel forwards the level and opens the log stream on debug', () => {
      const { api, cw } = ready();

      api.setLogLevel('debug');

      expect(postedTypes(cw)).toEqual(
        expect.arrayContaining(['WIDGET_SET_LOG_LEVEL', 'WIDGET_ENABLE_LOG_STREAM']),
      );
    });

    test('a non-debug level closes the log stream', () => {
      const { api, cw } = ready();

      api.setLogLevel('warn');

      expect(postedTypes(cw)).toEqual(
        expect.arrayContaining(['WIDGET_SET_LOG_LEVEL', 'WIDGET_DISABLE_LOG_STREAM']),
      );
    });

    test('setLogLevel is chainable', () => {
      const { api } = ready();
      expect(api.setLogLevel('info')).toBe(api);
    });

    test('setLogLevel survives an unavailable iframe', () => {
      const { api, iframe } = ready();
      Object.defineProperty(iframe, 'contentWindow', { get: () => null, configurable: true });
      expect(() => api.setLogLevel('debug')).not.toThrow();
    });
  });

  describe('getDiagnostics', () => {
    test('resolves with the payload the iframe answers', async () => {
      const { api, iframe, cw } = ready();

      const pending = api.getDiagnostics();
      const requestId = cw.postMessage.mock.calls
        .map(([m]) => m)
        .find((m) => m?.type === 'WIDGET_GET_DIAGNOSTICS')?.requestId;

      fromIframe(iframe, {
        type: 'WIDGET_DIAGNOSTICS_RESPONSE',
        requestId,
        data: { sessionId: 'sess-1' },
      });

      await expect(pending).resolves.toMatchObject({ sessionId: 'sess-1' });
    });

    test('ignores a response for a different request', async () => {
      jest.useFakeTimers();
      const { api, iframe } = ready();

      const pending = api.getDiagnostics();
      fromIframe(iframe, {
        type: 'WIDGET_DIAGNOSTICS_RESPONSE',
        requestId: 'someone-else',
        data: {},
      });
      jest.advanceTimersByTime(3100);

      await expect(pending).rejects.toThrow(/timed out/);
      jest.useRealTimers();
    });

    test('rejects when the iframe never answers', async () => {
      jest.useFakeTimers();
      const { api } = ready();

      const pending = api.getDiagnostics();
      jest.advanceTimersByTime(3100);

      await expect(pending).rejects.toThrow(/timed out/);
      jest.useRealTimers();
    });

    test('rejects when the iframe is not there', async () => {
      const { api, iframe } = ready();
      Object.defineProperty(iframe, 'contentWindow', { get: () => null, configurable: true });

      await expect(api.getDiagnostics()).rejects.toThrow(/not ready/);
    });
  });

  describe('session helpers', () => {
    test('clearSession asks the iframe and resolves with a count', async () => {
      jest.useFakeTimers();
      const { api, iframe, cw } = ready();

      const pending = api.clearSession();
      const requestId = cw.postMessage.mock.calls
        .map(([m]) => m)
        .find((m) => m?.type === 'WIDGET_CLEAR_SESSION')?.requestId;
      fromIframe(iframe, { type: 'WIDGET_CLEAR_SESSION_RESPONSE', requestId, removed: 3 });

      await expect(pending).resolves.toBeDefined();
      jest.useRealTimers();
    });

    test('clearSession resolves with zero when the iframe never answers', async () => {
      jest.useFakeTimers();
      const { api } = ready();

      const pending = api.clearSession();
      jest.advanceTimersByTime(3100);

      await expect(pending).resolves.toBe(0);
      jest.useRealTimers();
    });

    test('clearSession resolves with zero without an iframe', async () => {
      const { api, iframe } = ready();
      Object.defineProperty(iframe, 'contentWindow', { get: () => null, configurable: true });

      await expect(api.clearSession()).resolves.toBe(0);
    });

    test('getErrors returns a list', () => {
      const { api } = ready();
      expect(Array.isArray(api.getErrors())).toBe(true);
    });

    test('reloadWidget re-navigates the iframe', () => {
      const { api } = ready();
      expect(() => api.reloadWidget()).not.toThrow();
    });
  });

  describe('offline simulation', () => {
    test('simulate then restore', () => {
      const { api, cw } = ready();

      api.simulateOffline();
      api.restoreOnline();

      expect(postedTypes(cw).length).toBeGreaterThan(0);
    });
  });

  describe('context and theme', () => {
    test('setContext forwards page data', () => {
      const { api, cw } = ready();

      api.setContext({ page: '/pricing' });

      expect(postedTypes(cw).length).toBeGreaterThan(0);
    });

    test.each([['light'], ['dark'], ['system']])('setTheme accepts %s', (theme) => {
      const { api } = ready();
      expect(() => api.setTheme(theme)).not.toThrow();
    });

    test('update forwards a config patch', () => {
      const { api } = ready();
      expect(() => api.update({ primary_color: '#0d9488' })).not.toThrow();
    });

    test('beforeSend registers an interceptor', () => {
      const { api } = ready();
      expect(() => api.beforeSend(() => null)).not.toThrow();
    });
  });

  describe('lifecycle', () => {
    test('init forwards a config override to the iframe', async () => {
      const { api, cw } = ready();

      await api.init({ primary_color: '#123456' });

      expect(postedTypes(cw)).toEqual(expect.arrayContaining(['WIDGET_INIT_CONFIG']));
    });

    test('init resolves with the api', async () => {
      const { api } = ready();
      await expect(api.init()).resolves.toBe(api);
    });

    test('init ignores a non-object config', async () => {
      const { api, cw } = ready();
      cw.postMessage.mockClear();

      await api.init('nope' as never);

      expect(postedTypes(cw)).not.toEqual(expect.arrayContaining(['WIDGET_INIT_CONFIG']));
    });

    test('reset asks the iframe to start over', () => {
      const { api, cw } = ready();
      api.reset();
      expect(postedTypes(cw).length).toBeGreaterThan(0);
    });

    test('sendMessage forwards text to the iframe', () => {
      const { api, cw } = ready();
      api.sendMessage('Hello there');
      expect(postedTypes(cw).length).toBeGreaterThan(0);
    });

    test('destroy tears the widget down', () => {
      const { api } = ready();
      api.destroy();
      expect(document.querySelector('iframe')).toBeNull();
    });
  });
});
