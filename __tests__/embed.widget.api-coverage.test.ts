/**
 * Host-API branches of `src/embed/widget.js` the existing embed.widget suites
 * leave untouched: identify/prefill, the consent bridge, trackConversion's
 * dedup-key derivation and the GA module's validation.
 */
import { fromIframe, loadWidget, mockCW } from './__helpers__/embed.widget.helpers';

const BASE_ATTRS = {
  'data-client-id': 'client-1',
  'data-agent-id': 'agent-1',
  'data-config-id': 'config-1',
};

/** Load, mark the iframe loaded (postToIframe queues until then), and announce ready. */
const ready = (attrs: Record<string, string> = {}) => {
  const { api, iframe } = loadWidget({ ...BASE_ATTRS, ...attrs });
  const cw = mockCW(iframe!);
  // jsdom calls close() on every frame during teardown; the bare postMessage
  // mock has none, which crashes the whole suite at exit.
  (cw as unknown as { close: () => void }).close = () => {};
  iframe!.dispatchEvent(new Event('load'));
  fromIframe(iframe!, { type: 'WIDGET_READY' });
  return { api, iframe: iframe!, cw };
};

/** The `data` payload of the last HOST_MESSAGE posted to the iframe. */
const lastHostMessage = (cw: { postMessage: jest.Mock }) => {
  const call = [...cw.postMessage.mock.calls]
    .reverse()
    .find(([msg]) => msg?.type === 'HOST_MESSAGE');
  return call?.[0]?.data as Record<string, unknown> | undefined;
};

describe('widget.js host API', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    delete (window as Record<string, unknown>).CompaninWidget;
    delete (window as Record<string, unknown>).CompaninWidgets;
    delete (window as Record<string, unknown>).gtag;
    delete (window as Record<string, unknown>).dataLayer;
    jest.restoreAllMocks();
  });

  describe('identify', () => {
    test('normalizes the user into a fixed safe shape', () => {
      const { api, cw } = ready();

      api.identify({ id: 'u1', email: 'ada@example.com', name: 'Ada', token: 'jwt' });

      expect(lastHostMessage(cw)).toMatchObject({
        action: 'identify',
        userId: 'u1',
        email: 'ada@example.com',
        name: 'Ada',
        token: 'jwt',
      });
    });

    test('prefers userId over id', () => {
      const { api, cw } = ready();
      api.identify({ userId: 'primary', id: 'fallback' });
      expect(lastHostMessage(cw)).toMatchObject({ userId: 'primary' });
    });

    test('drops non-string fields rather than forwarding them', () => {
      const { api, cw } = ready();

      api.identify({ id: 'u1', email: 42, name: {}, token: [] });

      expect(lastHostMessage(cw)).toMatchObject({ email: null, name: null, token: null });
    });

    test('keeps an object metadata bag and nulls anything else', () => {
      const { api, cw } = ready();

      api.identify({ id: 'u1', metadata: { plan: 'pro' } });
      expect(lastHostMessage(cw)).toMatchObject({ metadata: { plan: 'pro' } });

      api.identify({ id: 'u2', metadata: 'nope' });
      expect(lastHostMessage(cw)).toMatchObject({ metadata: null });
    });

    test.each([[null], [undefined], ['nope'], [7]])('refuses a non-object %p', (bad) => {
      const { api, cw } = ready();
      cw.postMessage.mockClear();

      api.identify(bad as never);

      expect(lastHostMessage(cw)).toBeUndefined();
    });
  });

  describe('prefill', () => {
    test('posts the text to the iframe', () => {
      const { api, cw } = ready();
      api.prefill('Draft question');
      expect(lastHostMessage(cw)).toMatchObject({ action: 'prefill', text: 'Draft question' });
    });

    test.each([[null], [42], [{}]])('ignores a non-string %p', (bad) => {
      const { api, cw } = ready();
      cw.postMessage.mockClear();

      api.prefill(bad as never);

      expect(lastHostMessage(cw)).toBeUndefined();
    });
  });

  describe('storage consent bridge', () => {
    test('forwards a grant', () => {
      const { api, cw } = ready();
      api.grantConsent();
      expect(cw.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'WIDGET_CONSENT_GRANT' }),
        expect.anything(),
      );
    });

    test('forwards a revoke', () => {
      const { api, cw } = ready();
      api.revokeConsent();
      expect(cw.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'WIDGET_CONSENT_REVOKE' }),
        expect.anything(),
      );
    });

    test('survives an unavailable iframe', () => {
      const { api, iframe } = ready();
      Object.defineProperty(iframe, 'contentWindow', { get: () => null, configurable: true });

      expect(() => {
        api.grantConsent();
        api.revokeConsent();
      }).not.toThrow();
    });
  });

  describe('trackConversion', () => {
    test('sends the goal with its value and currency', () => {
      const { api, cw } = ready();

      api.trackConversion('purchase', 99.5, { currency: 'EUR', label: 'Pro plan' });

      expect(lastHostMessage(cw)).toMatchObject({
        action: 'conversion',
        goal_type: 'purchase',
        value: 99.5,
        currency: 'EUR',
        goal_label: 'Pro plan',
      });
    });

    test('trims the goal name', () => {
      const { api, cw } = ready();
      api.trackConversion('  signup  ');
      expect(lastHostMessage(cw)).toMatchObject({ goal_type: 'signup' });
    });

    test.each([[''], ['   '], [null], [42]])('refuses the goal %p', (bad) => {
      const { api, cw } = ready();
      cw.postMessage.mockClear();

      api.trackConversion(bad as never);

      expect(lastHostMessage(cw)).toBeUndefined();
    });

    test('nulls a non-finite value', () => {
      const { api, cw } = ready();
      api.trackConversion('signup', Number.NaN);
      expect(lastHostMessage(cw)).toMatchObject({ value: null });
    });

    test('an explicit dedupKey wins', () => {
      const { api, cw } = ready();

      api.trackConversion('purchase', 10, {
        dedupKey: 'explicit',
        metadata: { order_id: 'order-1' },
      });

      expect(lastHostMessage(cw)).toMatchObject({ dedup_key: 'explicit' });
    });

    test('falls back to metadata.order_id so a refreshed receipt page dedupes itself', () => {
      const { api, cw } = ready();

      api.trackConversion('purchase', 10, { metadata: { order_id: 'order-1' } });

      expect(lastHostMessage(cw)).toMatchObject({ dedup_key: 'order-1' });
    });

    test('leaves the dedup key null when neither is present', () => {
      const { api, cw } = ready();
      api.trackConversion('purchase', 10);
      expect(lastHostMessage(cw)).toMatchObject({ dedup_key: null, metadata: null });
    });

    test('ignores a non-object opts bag', () => {
      const { api, cw } = ready();
      api.trackConversion('purchase', 10, 'nope' as never);
      expect(lastHostMessage(cw)).toMatchObject({ goal_type: 'purchase', currency: null });
    });

    test('returns the api so calls can be chained', () => {
      const { api } = ready();
      expect(api.trackConversion('signup')).toBe(api);
    });
  });
});

describe('widget.js Google Analytics module', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    delete (window as Record<string, unknown>).CompaninWidget;
    delete (window as Record<string, unknown>).CompaninWidgets;
    delete (window as Record<string, unknown>).gtag;
    delete (window as Record<string, unknown>).dataLayer;
  });

  /** GA is configured by the iframe, not by a script attribute. */
  const initGa = (id: string) => {
    const { iframe } = ready();
    fromIframe(iframe, { type: 'WIDGET_GA_INIT', data: { gaMeasurementId: id } });
    return iframe;
  };

  test('injects the gtag script for a valid measurement id', () => {
    initGa('G-ABC123');
    expect(
      document.querySelector('script[src*="googletagmanager.com/gtag/js"]'),
    ).toBeInTheDocument();
  });

  test('refuses an id that could smuggle something into the script src', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    initGa('G-BAD"><script>');

    expect(document.querySelector('script[src*="googletagmanager.com"]')).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Invalid measurement ID'));
    warn.mockRestore();
  });

  test('reuses an existing gtag rather than re-injecting', () => {
    (window as Record<string, unknown>).gtag = jest.fn();

    initGa('G-ABC123');

    expect(document.querySelector('script[src*="googletagmanager.com/gtag/js"]')).toBeNull();
  });

  test('does nothing without a measurement id', () => {
    const { iframe } = ready();
    fromIframe(iframe, { type: 'WIDGET_GA_INIT', data: {} });
    expect(document.querySelector('script[src*="googletagmanager.com"]')).toBeNull();
  });

  test('reports widget events to GA once configured', () => {
    const iframe = initGa('G-ABC123');
    const dataLayer = (window as unknown as { dataLayer: unknown[] }).dataLayer ?? [];
    const before = dataLayer.length;

    fromIframe(iframe, { type: 'WIDGET_SHOW', data: { source: 'widget' } });

    expect(
      ((window as unknown as { dataLayer?: unknown[] }).dataLayer ?? []).length,
    ).toBeGreaterThanOrEqual(before);
  });
});
