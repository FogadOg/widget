// ensure logger treats this as development mode
// TypeScript warns that NODE_ENV is readonly; just ignore it for test

// @ts-ignore

(process.env as any).NODE_ENV = 'development';

import { logError, logWarn, logInfo, logDebug, logPerf, getWindowUrl } from '../lib/logger';

describe('logger convenience functions', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'debug').mockImplementation(() => {});
    // stub fetch for perf tests

    (global as any).fetch = jest.fn().mockResolvedValue({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logError calls console.error in development', () => {
    logError('test error', { foo: 'bar' });
    expect(console.error).toHaveBeenCalledWith(
      '%c[Widget] Error: test error',
      'color: #ef4444; font-weight: bold',
      { foo: 'bar' }
    );
  });

  it('logError prints empty string when context is undefined', () => {
    logError('no context');
    expect(console.error).toHaveBeenLastCalledWith(
      '%c[Widget] Error: no context',
      'color: #ef4444; font-weight: bold',
      ''
    );
  });

  it('logWarn calls console.warn in development', () => {
    logWarn('test warn');
    expect(console.warn).toHaveBeenCalledWith(
      '%c[Widget] Warn: test warn',
      'color: #eab308; font-weight: bold',
      ''
    );
  });

  it('logInfo calls console.info in development', () => {
    logInfo('test info');
    expect(console.info).toHaveBeenCalledWith(
      '%c[Widget] test info',
      'color: #3b82f6; font-weight: bold',
      ''
    );
  });

  it('logDebug calls console.debug in development', () => {
    logDebug('test debug');
    expect(console.debug).toHaveBeenCalledWith(
      '%c[Widget] test debug',
      'color: #9ca3af; font-weight: normal',
      ''
    );
  });

  it('logPerf logs a perf message', () => {
    logPerf('load', 123, { page: 'home' });
    expect(console.debug).toHaveBeenCalledWith('load: 123ms', { page: 'home' });
  });

  it('logPerf ignores blacklisted names', () => {
    logPerf('fetchAgentDetails', 50);
    logPerf('fetchWidgetConfig', 60);
    // should not call console.debug at all for blacklisted names
    expect(console.debug).toHaveBeenCalledTimes(0);
  });

  describe('getWindowUrl helper', () => {
    it('returns undefined when global window is unavailable', () => {
      // pass null to bypass default global

      expect(getWindowUrl(null as any)).toBeUndefined();
    });

    it('returns href when provided window object has it', () => {
      const fake = { location: { href: 'http://foo' } };
      expect(getWindowUrl(fake)).toBe('http://foo');
    });

    it('returns undefined if provided object lacks location', () => {
      expect(getWindowUrl({})).toBeUndefined();
    });
  });
});

// production-mode behaviour requires reloading the module after adjusting env

describe('logger in production', () => {
  // logger type is a class, but we only treat it as an object in tests
  // using any avoids signature mismatches

  let prodLog: any;
  let fetchSpy: jest.Mock;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
    // NODE_ENV is readonly on process.env; ignore type error

    // @ts-ignore
    process.env.NODE_ENV = 'production';
    // require inside test to pick up new env; singleton is exported as `logger`

    const mod = require('../lib/logger');
    prodLog = mod.logger;
    fetchSpy = jest.fn().mockResolvedValue({});

    (global as any).fetch = fetchSpy;
  });

  it('sends errors via fetch instead of console', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    prodLog.error('prod-error', { a: 1 });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalled();
    const call = fetchSpy.mock.calls[0];
    expect(call[1].method).toBe('POST');
    const body = JSON.parse(call[1].body);
    expect(body.level).toBe('error');
    expect(body.message).toBe('prod-error');
    expect(body.context).toEqual({ a: 1 });
  });

  it('sendToErrorTracking does not throw if fetch missing', () => {

    delete (global as any).fetch;

    expect(() => (prodLog as any).sendToErrorTracking('error', 'no fetch')).not.toThrow();
  });

  it('produces undefined userAgent when navigator.userAgent missing', () => {
    // redefine navigator.userAgent to undefined
    Object.defineProperty(global, 'navigator', {
      value: { userAgent: undefined },
      configurable: true,
    });

    prodLog.error('check undefined');
    expect(fetchSpy).toHaveBeenCalled();
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.userAgent).toBeUndefined();
    // url may still be populated by jsdom; no assertion here
  });

  it('posts perf data via fetch', () => {
    prodLog.perf('abc', 999, { x: 2 });
    expect(fetchSpy).toHaveBeenCalled();
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.type).toBe('perf');
    expect(body.name).toBe('abc');
    expect(body.durationMs).toBe(999);
  });

  it('does not post perf for blacklisted name', () => {
    prodLog.perf('fetchWidgetConfig', 10);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});