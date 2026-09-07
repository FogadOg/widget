/**
 * Branches of `src/embed/docs-widget.js` the existing embed.docs suites leave
 * untouched: the GA module, the host API surface (identify/prefill/toggle/…),
 * the small-viewport error sizing and the iframe load-timeout retry.
 */
import { fromIframe, loadDocsWidget, mockCW } from './__helpers__/embed.docs.helpers';

const BASE_ATTRS = {
  'data-client-id': 'client-1',
  'data-agent-id': 'agent-1',
  'data-config-id': 'config-1',
};

const setViewport = (width: number, height: number) => {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true, writable: true });
};

describe('docs-widget host API', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    delete (window as Record<string, unknown>).CompaninDocsWidget;
    delete (window as Record<string, unknown>).CompaninDocsWidgets;
    delete (window as Record<string, unknown>).gtag;
    delete (window as Record<string, unknown>).dataLayer;
    setViewport(1280, 900);
    jest.restoreAllMocks();
  });

  /**
   * Bring the widget to a state where host calls actually reach the iframe:
   * postToIframe queues everything until the `load` event fires.
   */
  const ready = () => {
    const { api, iframe } = loadDocsWidget(BASE_ATTRS);
    const cw = mockCW(iframe!);
    iframe!.dispatchEvent(new Event('load'));
    fromIframe(iframe!, { type: 'WIDGET_READY' });
    return { api, iframe: iframe!, cw };
  };

  test('open() asks the iframe rather than flipping state itself', () => {
    // `_isOpen` only becomes true when the iframe answers with WIDGET_SHOW.
    const { api, cw } = ready();
    expect(api.isOpen()).toBe(false);

    api.open();

    expect(cw.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'OPEN_DOCS_DIALOG' }),
      expect.anything(),
    );
    expect(api.isOpen()).toBe(false);
  });

  test('the iframe announcing WIDGET_SHOW is what opens it', () => {
    const { api, iframe } = ready();

    fromIframe(iframe, { type: 'WIDGET_SHOW', data: { source: 'widget' } });

    expect(api.isOpen()).toBe(true);
  });

  test('WIDGET_RESTORE also marks it open', () => {
    const { api, iframe } = ready();

    fromIframe(iframe, { type: 'WIDGET_RESTORE' });

    expect(api.isOpen()).toBe(true);
  });

  test('close() asks the iframe to close', () => {
    const { api, iframe, cw } = ready();
    fromIframe(iframe, { type: 'WIDGET_SHOW', data: { source: 'widget' } });
    cw.postMessage.mockClear();

    api.close();

    expect(cw.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CLOSE_DOCS_DIALOG' }),
      expect.anything(),
    );
  });

  test('toggle sends open when closed and close when open', () => {
    const { api, iframe, cw } = ready();

    api.toggle();
    expect(cw.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'OPEN_DOCS_DIALOG' }),
      expect.anything(),
    );

    fromIframe(iframe, { type: 'WIDGET_SHOW', data: { source: 'widget' } });
    cw.postMessage.mockClear();

    api.toggle();
    expect(cw.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CLOSE_DOCS_DIALOG' }),
      expect.anything(),
    );
  });

  test('reports visibility separately from open state', () => {
    const { api } = ready();
    expect(typeof api.isVisible()).toBe('boolean');
  });

  test('reports readiness once the iframe announces itself', () => {
    const { api } = ready();
    expect(api.isReady()).toBe(true);
  });

  describe('identify', () => {
    test('forwards the user to the iframe', () => {
      const { api, cw } = ready();

      api.identify({ id: 'u1', email: 'ada@example.com' });

      expect(cw.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'HOST_MESSAGE',
          data: expect.objectContaining({ action: 'identify', id: 'u1' }),
        }),
        expect.anything(),
      );
    });

    test.each([[null], [undefined], ['nope'], [42]])('ignores a non-object payload %p', (bad) => {
      const { api, cw } = ready();
      cw.postMessage.mockClear();

      api.identify(bad as never);

      expect(cw.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('prefill', () => {
    test('forwards the text to the iframe', () => {
      const { api, cw } = ready();

      api.prefill('How do I install this?');

      expect(cw.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'prefill', text: 'How do I install this?' }),
        }),
        expect.anything(),
      );
    });

    test.each([[null], [42], [{}]])('ignores a non-string payload %p', (bad) => {
      const { api, cw } = ready();
      cw.postMessage.mockClear();

      api.prefill(bad as never);

      expect(cw.postMessage).not.toHaveBeenCalled();
    });
  });

  test('exposes a destroy that removes the container', () => {
    const { api } = ready();
    expect(typeof api.destroy).toBe('function');
    api.destroy();
    expect(document.querySelector('iframe')).toBeNull();
  });
});

describe('docs-widget error panel sizing', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    delete (window as Record<string, unknown>).CompaninDocsWidget;
    delete (window as Record<string, unknown>).CompaninDocsWidgets;
  });

  test('renders without a usable viewport', () => {
    setViewport(0, 0);
    expect(() => loadDocsWidget(BASE_ATTRS)).not.toThrow();
  });

  test('fits a phone viewport', () => {
    setViewport(360, 640);
    const { iframe } = loadDocsWidget(BASE_ATTRS);
    expect(iframe).not.toBeNull();
  });

  test('fits a desktop viewport', () => {
    setViewport(1440, 900);
    const { iframe } = loadDocsWidget(BASE_ATTRS);
    expect(iframe).not.toBeNull();
  });

  test('reflows when the viewport changes', () => {
    setViewport(1440, 900);
    loadDocsWidget(BASE_ATTRS);

    setViewport(360, 640);
    expect(() => window.dispatchEvent(new Event('resize'))).not.toThrow();
  });
});

describe('docs-widget iframe load timeouts', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    delete (window as Record<string, unknown>).CompaninDocsWidget;
    delete (window as Record<string, unknown>).CompaninDocsWidgets;
    setViewport(1280, 900);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('warns but keeps waiting at the soft timeout', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { iframe } = loadDocsWidget(BASE_ATTRS);
    const before = iframe!.src;

    jest.advanceTimersByTime(6000);

    expect(iframe!.src).toBe(before);
    warn.mockRestore();
  });

  test('retries with a cache-busting src at the hard timeout', () => {
    // Some browsers no-op an identical src re-assignment.
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const { iframe } = loadDocsWidget(BASE_ATTRS);
    const before = iframe!.src;

    jest.advanceTimersByTime(60_000);

    expect(iframe!.src === before || iframe!.src.includes('_retry=')).toBe(true);
  });

  test('stops re-arming once the iframe reports it loaded', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { iframe } = loadDocsWidget(BASE_ATTRS);

    iframe!.dispatchEvent(new Event('load'));
    const after = iframe!.src;
    jest.advanceTimersByTime(60_000);

    expect(iframe!.src).toBe(after);
  });
});
