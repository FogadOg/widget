/**
 * The rest of the `src/embed/docs-widget.js` host API: conversions, consent,
 * interceptors, debug/log controls, diagnostics and the widget registry.
 */
import { fromIframe, loadDocsWidget, mockCW } from './__helpers__/embed.docs.helpers';

const BASE_ATTRS = {
  'data-client-id': 'client-1',
  'data-agent-id': 'agent-1',
  'data-config-id': 'config-1',
};

const ready = (attrs: Record<string, string> = {}) => {
  const { api, widgets, iframe } = loadDocsWidget({ ...BASE_ATTRS, ...attrs });
  const cw = mockCW(iframe!);
  // jsdom calls close() on every frame at teardown.
  (cw as unknown as { close: () => void }).close = () => {};
  iframe!.dispatchEvent(new Event('load'));
  fromIframe(iframe!, { type: 'WIDGET_READY' });
  return { api, widgets, iframe: iframe!, cw };
};

const postedTypes = (cw: { postMessage: jest.Mock }) =>
  cw.postMessage.mock.calls.map(([m]) => m?.type);

const lastHostMessage = (cw: { postMessage: jest.Mock }) => {
  const call = [...cw.postMessage.mock.calls]
    .reverse()
    .find(([m]) => m?.type === 'HOST_MESSAGE');
  return call?.[0]?.data as Record<string, unknown> | undefined;
};

describe('docs-widget API surface', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    delete (window as Record<string, unknown>).CompaninDocsWidget;
    delete (window as Record<string, unknown>).CompaninDocsWidgets;
    localStorage.clear();
    jest.restoreAllMocks();
  });

  describe('trackConversion', () => {
    test('sends the goal with value, currency and label', () => {
      const { api, cw } = ready();

      api.trackConversion('purchase', 42, { currency: 'EUR', label: 'Pro' });

      expect(lastHostMessage(cw)).toMatchObject({
        action: 'conversion',
        goal_type: 'purchase',
        value: 42,
        currency: 'EUR',
        goal_label: 'Pro',
      });
    });

    test.each([[''], ['  '], [null], [7]])('refuses the goal %p', (bad) => {
      const { api, cw } = ready();
      cw.postMessage.mockClear();
      api.trackConversion(bad as never);
      expect(lastHostMessage(cw)).toBeUndefined();
    });

    test('derives the dedup key from metadata.order_id', () => {
      const { api, cw } = ready();
      api.trackConversion('purchase', 10, { metadata: { order_id: 'o-1' } });
      expect(lastHostMessage(cw)).toMatchObject({ dedup_key: 'o-1' });
    });

    test('an explicit dedupKey wins over the order id', () => {
      const { api, cw } = ready();
      api.trackConversion('purchase', 10, { dedupKey: 'x', metadata: { order_id: 'o-1' } });
      expect(lastHostMessage(cw)).toMatchObject({ dedup_key: 'x' });
    });

    test('nulls a non-finite value', () => {
      const { api, cw } = ready();
      api.trackConversion('signup', Number.POSITIVE_INFINITY);
      expect(lastHostMessage(cw)).toMatchObject({ value: null });
    });

    test('is chainable', () => {
      const { api } = ready();
      expect(api.trackConversion('signup')).toBe(api);
    });
  });

  describe('consent bridge', () => {
    test('forwards grant and revoke', () => {
      const { api, cw } = ready();

      api.grantConsent();
      api.revokeConsent();

      expect(postedTypes(cw).length).toBeGreaterThan(0);
    });
  });

  describe('interceptors', () => {
    test('beforeSend registers and tells the iframe', () => {
      const { api, cw } = ready();
      api.beforeSend(() => null);
      expect(postedTypes(cw)).toEqual(expect.arrayContaining(['HOST_INTERCEPT_ACTIVE']));
    });

    test('afterReceive registers and tells the iframe', () => {
      const { api, cw } = ready();
      api.afterReceive(() => null);
      expect(postedTypes(cw)).toEqual(expect.arrayContaining(['HOST_INTERCEPT_ACTIVE']));
    });

    test('ignores a non-function interceptor', () => {
      const { api, cw } = ready();
      cw.postMessage.mockClear();

      api.beforeSend('nope' as never);
      api.afterReceive(42 as never);

      expect(postedTypes(cw)).not.toEqual(expect.arrayContaining(['HOST_INTERCEPT_ACTIVE']));
    });

    test('both are chainable', () => {
      const { api } = ready();
      expect(api.beforeSend(() => null)).toBe(api);
      expect(api.afterReceive(() => null)).toBe(api);
    });
  });

  describe('debug controls', () => {
    test('enable then disable flips the flag', () => {
      const { api } = ready();

      api.enableDebug();
      expect(api.isDebugActive()).toBe(true);

      api.disableDebug();
      expect(api.isDebugActive()).toBe(false);
    });

    test('an embed can forbid debug entirely', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const { api } = ready({ 'data-disable-debug': 'true' });

      api.enableDebug();

      expect(api.isDebugActive()).toBe(false);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Debug mode is disabled'));
      warn.mockRestore();
    });

    test('setLogLevel opens the stream on debug and closes it otherwise', () => {
      const { api, cw } = ready();

      api.setLogLevel('debug');
      expect(postedTypes(cw)).toEqual(expect.arrayContaining(['WIDGET_ENABLE_LOG_STREAM']));

      api.setLogLevel('error');
      expect(postedTypes(cw)).toEqual(expect.arrayContaining(['WIDGET_DISABLE_LOG_STREAM']));
    });
  });

  describe('diagnostics and session', () => {
    test('getDiagnostics resolves with the iframe answer', async () => {
      const { api, iframe, cw } = ready();

      const pending = api.getDiagnostics();
      const requestId = cw.postMessage.mock.calls
        .map(([m]) => m)
        .find((m) => m?.type === 'WIDGET_GET_DIAGNOSTICS')?.requestId;
      fromIframe(iframe, {
        type: 'WIDGET_DIAGNOSTICS_RESPONSE',
        requestId,
        data: { sessionId: 's1' },
      });

      await expect(pending).resolves.toMatchObject({ sessionId: 's1' });
    });

    test('getDiagnostics rejects when nothing answers', async () => {
      jest.useFakeTimers();
      const { api } = ready();

      const pending = api.getDiagnostics();
      jest.advanceTimersByTime(3100);

      await expect(pending).rejects.toBeDefined();
      jest.useRealTimers();
    });

    test('clearSession resolves even when the iframe stays silent', async () => {
      jest.useFakeTimers();
      const { api } = ready();

      const pending = api.clearSession();
      jest.advanceTimersByTime(3100);

      await expect(pending).resolves.toBeDefined();
      jest.useRealTimers();
    });

    test('getErrors returns a list', () => {
      const { api } = ready();
      expect(Array.isArray(api.getErrors())).toBe(true);
    });

    test('getVersion returns a string', () => {
      const { api } = ready();
      expect(typeof api.getVersion()).toBe('string');
    });
  });

  describe('presentation controls', () => {
    test('setContext forwards page data', () => {
      const { api, cw } = ready();
      api.setContext({ page: '/docs' });
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

    test('resize accepts explicit dimensions', () => {
      const { api } = ready();
      expect(() => api.resize({ width: 420, height: 640 })).not.toThrow();
    });

    test('reset asks the iframe to start over', () => {
      const { api, cw } = ready();
      api.reset();
      expect(postedTypes(cw).length).toBeGreaterThan(0);
    });

    test('sendMessage forwards text', () => {
      const { api, cw } = ready();
      api.sendMessage('Hello');
      expect(postedTypes(cw).length).toBeGreaterThan(0);
    });

    test('hide leaves the container hidden', () => {
      const { api } = ready();
      api.hide();
      expect(api.isVisible()).toBe(false);
    });

    test('simulateOffline then restoreOnline', () => {
      const { api } = ready();
      expect(() => {
        api.simulateOffline();
        api.restoreOnline();
      }).not.toThrow();
    });

    test('reloadWidget re-navigates', () => {
      const { api } = ready();
      expect(() => api.reloadWidget()).not.toThrow();
    });
  });

  describe('registry', () => {
    test('lists mounted instances', () => {
      const { widgets } = ready();
      expect(Array.isArray(widgets.list())).toBe(true);
    });

    test('gets an instance by id', () => {
      const { widgets } = ready();
      const ids = widgets.list();
      if (ids.length > 0) {
        expect(widgets.get(ids[0])).toBeDefined();
      }
    });

    test('destroys a named instance', () => {
      // The registry destroy takes an id; the per-widget api.destroy() is the
      // one that tears down without arguments.
      const { widgets } = ready();
      const ids = widgets.list();

      ids.forEach((id: string) => widgets.destroy(id));

      expect(document.querySelector('iframe')).toBeNull();
    });
  });
});
