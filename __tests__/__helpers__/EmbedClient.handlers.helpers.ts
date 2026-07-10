/**
 * Sets up a navigator.serviceWorker mock that captures the 'message' event handler.
 * Returns the mock serviceWorker object.
 */
export function setupServiceWorkerMock(): { serviceWorkerMock: any; getSwHandler: () => any } {
  let swHandler: any = null;

  const serviceWorkerMock = {
    addEventListener: jest.fn((ev: string, h: any) => {
      if (ev === 'message') swHandler = h;
    }),
    removeEventListener: jest.fn(() => {
      swHandler = null;
    }),
  } as any;

  (global as any).navigator = (global as any).navigator || {};
  (global as any).navigator.serviceWorker = serviceWorkerMock;

  // make navigator.onLine true so flush runs
  Object.defineProperty((global as any).navigator, 'onLine', { value: true, configurable: true });

  return {
    serviceWorkerMock,
    getSwHandler: () => swHandler,
  };
}

/**
 * Sets window.parent to a given object (or a fresh empty object by default).
 * Returns the parent reference.
 */
export function setupParentWindow(parent?: any): any {
  const parentObj = parent ?? ({} as any);
  Object.defineProperty(window, 'parent', { value: parentObj, writable: true });
  return parentObj;
}

/**
 * Creates a fetch mock that returns sensible default responses for the widget's API calls.
 */
export function createFetchMock(): jest.Mock {
  return jest.fn((url: string, options?: any) => {
    if (url.includes('/agents/'))
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: { name: 'Test' } }) });

    if (url.includes('/widget-config/'))
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: {} }) });

    if (url.includes('/sessions') && !url.includes('/messages'))
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: { session_id: 'sess-1' } }) });

    if (url.includes('/messages') && options?.method === 'POST')
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: {} }) });

    if (url.includes('/messages'))
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: { messages: [] } }) });

    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

/**
 * Dispatches a HOST_MESSAGE window event that looks like it came from the given parent frame.
 */
export function dispatchHostMessage(parent: any, data: string | object, origin = 'https://example.com'): void {
  window.dispatchEvent({
    source: parent,
    origin,
    data: { type: 'HOST_MESSAGE', data },
  } as unknown as MessageEvent);
}
