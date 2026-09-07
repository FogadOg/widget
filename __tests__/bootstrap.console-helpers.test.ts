/**
 * The console-inspection half of `src/bootstrap.ts` — `dumpState`,
 * `clearSession` and the simulated-offline controls (see DEV_EXPERIENCE.md).
 *
 * `bootstrap.test.ts` covers the debug toggles against the real DevOverlay;
 * this file mocks the registry and overlay so instance state can be arranged.
 */
const detectDebugMode = jest.fn();
const simulateOffline = jest.fn();
const restoreOnline = jest.fn();
const isSimulatedOffline = jest.fn();
const listInstances = jest.fn();

jest.mock('../src/components/DevOverlay', () => ({
  __esModule: true,
  default: () => null,
  detectDebugMode: (...a: unknown[]) => detectDebugMode(...a),
  enableDebug: jest.fn(),
  disableDebug: jest.fn(),
  simulateOffline: (...a: unknown[]) => simulateOffline(...a),
  restoreOnline: (...a: unknown[]) => restoreOnline(...a),
  isSimulatedOffline: (...a: unknown[]) => isSimulatedOffline(...a),
  useDebugMode: () => false,
}));

jest.mock('../src/lib/widgetRegistry', () => ({
  listInstances: (...a: unknown[]) => listInstances(...a),
}));

type Api = {
  dumpState: () => unknown[];
  clearSession: () => number;
  listInstances: () => unknown[];
  simulateOffline: () => void;
  restoreOnline: () => void;
  isSimulatedOffline: () => boolean;
};

const w = window as unknown as { CompaninWidget?: Record<string, unknown> };

const loadBootstrap = async () => {
  await jest.isolateModulesAsync(async () => {
    await import('../src/bootstrap');
  });
};

const api = () => w.CompaninWidget as unknown as Api;

describe('bootstrap console helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete w.CompaninWidget;
    window.localStorage.clear();
    detectDebugMode.mockReturnValue(false);
    isSimulatedOffline.mockReturnValue(false);
    listInstances.mockReturnValue([]);
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'table').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete w.CompaninWidget;
  });

  test('exposes the inspection helpers', async () => {
    await loadBootstrap();
    expect(typeof api().dumpState).toBe('function');
    expect(typeof api().clearSession).toBe('function');
    expect(typeof api().listInstances).toBe('function');
  });

  test('exposes the simulated-offline controls', async () => {
    // Patching fetch inside the iframe instead of using DevTools "Offline",
    // which would take the whole host page down.
    await loadBootstrap();
    expect(typeof api().simulateOffline).toBe('function');
    expect(typeof api().restoreOnline).toBe('function');
    expect(typeof api().isSimulatedOffline).toBe('function');
  });

  describe('dumpState', () => {
    test('tabulates every mounted instance', async () => {
      listInstances.mockReturnValue([
        { instanceId: 'a', clientId: 'c1', agentId: 'ag1', state: 'open' },
      ]);
      await loadBootstrap();

      const result = api().dumpState();

      expect(console.table).toHaveBeenCalledWith([
        { instanceId: 'a', clientId: 'c1', agentId: 'ag1', state: 'open' },
      ]);
      expect(result).toHaveLength(1);
    });

    test('blanks missing fields rather than printing undefined', async () => {
      listInstances.mockReturnValue([{ instanceId: 'a' }]);
      await loadBootstrap();

      api().dumpState();

      expect(console.table).toHaveBeenCalledWith([
        { instanceId: 'a', clientId: '', agentId: '', state: '' },
      ]);
    });

    test('reports the instance count alongside the debug flags', async () => {
      await loadBootstrap();
      api().dumpState();
      expect(console.info).toHaveBeenCalledWith(
        '[Widget] instances:',
        0,
        '· debugActive:',
        false,
        '· offlineSimulated:',
        false,
      );
    });
  });

  describe('clearSession', () => {
    test('removes only widget-owned keys', async () => {
      localStorage.setItem('companin-session', '1');
      localStorage.setItem('companin_visitor', '2');
      localStorage.setItem('unrelated', '3');
      await loadBootstrap();

      const removed = api().clearSession();

      expect(removed).toBe(2);
      expect(localStorage.getItem('unrelated')).toBe('3');
      expect(localStorage.getItem('companin-session')).toBeNull();
    });

    test('reports zero when there is nothing to clear', async () => {
      await loadBootstrap();
      expect(api().clearSession()).toBe(0);
    });

    test('survives a sandboxed iframe with no writable storage', async () => {
      await loadBootstrap();
      localStorage.setItem('companin-session', '1');
      const spy = jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('denied');
      });

      expect(() => api().clearSession()).not.toThrow();
      spy.mockRestore();
    });

    test('tells the developer to reload', async () => {
      await loadBootstrap();
      api().clearSession();
      expect(console.info).toHaveBeenCalledWith(expect.stringContaining('Reload the page'));
    });
  });
});
