import { renderHook, act } from '@testing-library/react';
import { useWidgetConfig } from '../app/embed/docs/hooks/useWidgetConfig';

jest.mock('../app/embed/docs/resilientFetch', () => ({
  fetchWithTimeout: jest.fn(),
}));
jest.mock('../app/embed/docs/helpers', () => ({
  getVisitorId: jest.fn(() => 'visitor-1'),
}));

import { fetchWithTimeout } from '../app/embed/docs/resilientFetch';

const mockFetchWithTimeout = fetchWithTimeout as jest.Mock;

const validDocsConfig = {
  id: 'cfg-1',
  primary_color: '#000',
  background_color: '#fff',
  text_color: '#111',
  widget_type: 'docs' as const,
};

function res({ ok = true, status = 200, json = {}, headers = {} }: {
  ok?: boolean; status?: number; json?: unknown; headers?: Record<string, string>;
}) {
  return {
    ok,
    status,
    headers: { get: (name: string) => headers[name] ?? null },
    json: jest.fn().mockResolvedValue(json),
  };
}

function makeParams() {
  const setWidgetConfig = jest.fn();
  const setError = jest.fn();
  return {
    setWidgetConfig,
    setError,
    params: {
      clientId: 'client-1',
      activeLocale: 'en',
      initialParentOrigin: 'https://host.example',
      embedHeaders: { 'X-Embed-Origin': 'https://host.example' },
      setWidgetConfig,
      setError,
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useWidgetConfig (docs)', () => {
  it('fetches, validates, and stores the config, returning variant info', async () => {
    mockFetchWithTimeout.mockResolvedValue(res({
      ok: true,
      json: { status: 'success', data: { ...validDocsConfig, variant_id: 'v1', variant_name: 'V1' } },
    }));
    const { params, setWidgetConfig } = makeParams();
    const { result } = renderHook(() => useWidgetConfig(params));
    let variant: unknown;
    await act(async () => { variant = await result.current.fetchWidgetConfig('cfg-1', 'tok'); });
    expect(setWidgetConfig).toHaveBeenCalled();
    expect(variant).toEqual({ variant_id: 'v1', variant_name: 'V1' });
  });

  // A type mismatch is the site owner's to fix in the dashboard. The visitor
  // can do nothing about it, so it is logged rather than shown in a banner
  // telling them to check a `widget_type` setting they cannot see.
  it('logs a type mismatch for the owner without showing the visitor an error', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockFetchWithTimeout.mockResolvedValue(res({
      ok: true,
      json: { status: 'success', data: { ...validDocsConfig, widget_type: 'chat' } },
    }));
    const { params, setError, setWidgetConfig } = makeParams();
    const { result } = renderHook(() => useWidgetConfig(params));
    await act(async () => { await result.current.fetchWidgetConfig('cfg-1', 'tok'); });
    expect(setError).not.toHaveBeenCalled();
    // The config is still coerced and applied, so the widget keeps working.
    expect(setWidgetConfig).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('handles a payload without data gracefully', async () => {
    mockFetchWithTimeout.mockResolvedValue(res({ ok: true, json: { status: 'success' } }));
    const { params, setWidgetConfig } = makeParams();
    const { result } = renderHook(() => useWidgetConfig(params));
    let variant: unknown;
    await act(async () => { variant = await result.current.fetchWidgetConfig('cfg-1', 'tok'); });
    expect(setWidgetConfig).toHaveBeenCalledWith({ status: 'success' });
    expect(variant).toEqual({ variant_id: undefined, variant_name: undefined });
  });

  it('enters a cooldown on 429 with a numeric Retry-After and blocks the next call', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockFetchWithTimeout.mockResolvedValue(res({ ok: false, status: 429, headers: { 'Retry-After': '12' } }));
    const { params, setError } = makeParams();
    const { result } = renderHook(() => useWidgetConfig(params));
    await act(async () => { await result.current.fetchWidgetConfig('cfg-1', 'tok'); });
    expect(setError).toHaveBeenCalledWith('Too many messages. Please wait 12 seconds before trying again.');

    // Second call during the cooldown never reaches the network.
    mockFetchWithTimeout.mockClear();
    await act(async () => { await result.current.fetchWidgetConfig('cfg-1', 'tok'); });
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
    expect(setError).toHaveBeenLastCalledWith(expect.stringMatching(/^Too many messages\. Please wait \d+ seconds?/));
    warnSpy.mockRestore();
  });

  it('uses a date Retry-After header for the cooldown message', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const retryAt = new Date(Date.now() + 30_000).toUTCString();
    mockFetchWithTimeout.mockResolvedValue(res({ ok: false, status: 429, headers: { 'Retry-After': retryAt } }));
    const { params, setError } = makeParams();
    const { result } = renderHook(() => useWidgetConfig(params));
    await act(async () => { await result.current.fetchWidgetConfig('cfg-1', 'tok'); });
    expect(setError).toHaveBeenCalledWith(expect.stringMatching(/^Too many messages\. Please wait \d+ seconds?/));
    warnSpy.mockRestore();
  });

  it('falls back to the generic rate-limit message when Retry-After is unparseable', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockFetchWithTimeout.mockResolvedValue(res({ ok: false, status: 429, headers: { 'Retry-After': 'not-a-date' } }));
    const { params, setError } = makeParams();
    const { result } = renderHook(() => useWidgetConfig(params));
    await act(async () => { await result.current.fetchWidgetConfig('cfg-1', 'tok'); });
    expect(setError).toHaveBeenCalledWith('The widget is temporarily unavailable. Please try again in a moment.');
    warnSpy.mockRestore();
  });

  it('logs non-429 failures without setting an error', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFetchWithTimeout.mockResolvedValue(res({ ok: false, status: 500, json: { detail: 'boom' } }));
    const { params, setError } = makeParams();
    const { result } = renderHook(() => useWidgetConfig(params));
    let variant: unknown = 'sentinel';
    await act(async () => { variant = await result.current.fetchWidgetConfig('cfg-1', 'tok'); });
    expect(variant).toBeUndefined();
    expect(setError).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('swallows network errors and returns undefined', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFetchWithTimeout.mockRejectedValue(new Error('offline'));
    const { params } = makeParams();
    const { result } = renderHook(() => useWidgetConfig(params));
    let variant: unknown = 'sentinel';
    await act(async () => { variant = await result.current.fetchWidgetConfig('cfg-1', 'tok'); });
    expect(variant).toBeUndefined();
    errSpy.mockRestore();
  });
});
