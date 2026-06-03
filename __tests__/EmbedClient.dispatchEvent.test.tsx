import React from 'react';
import { render, act } from '@testing-library/react';
import EmbedClient from '../app/embed/session/EmbedClient';

// Minimal mocks reused from other EmbedClient tests
jest.mock('../app/embed/session/helpers');
jest.mock('../app/embed/session/events', () => ({ onInitConfig: jest.fn(() => ({ remove: jest.fn() })) }));
jest.mock('../hooks/useWidgetAuth');
jest.mock('../hooks/useWidgetTranslation');
jest.mock('../lib/errorHandling', () => ({ logError: jest.fn(), retryWithBackoff: jest.fn((fn) => fn()), WidgetErrorCode: {} }));
jest.mock('../lib/api', () => ({ trackEvent: jest.fn(), embedOriginHeader: () => ({}) }));
jest.mock('../lib/logger', () => ({ logError: jest.fn(), logPerf: jest.fn() }));

// Simple EmbedShell mock so component can render
jest.mock('../components/EmbedShell', () => (props: any) => (
  <div data-testid="embed-shell">
    <div data-testid="messages-count">{props.messages?.length || 0}</div>
  </div>
));

describe('EmbedClient dispatchEvent wrapper', () => {
  const defaultProps = {
    clientId: 'c1',
    agentId: 'a1',
    configId: 'cfg',
    locale: 'en',
    startOpen: false,
    parentOrigin: 'https://example.com',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // lightweight global mocks used by EmbedClient
    Object.defineProperty(window, 'localStorage', { value: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() } });
    (global as any).navigator = (global as any).navigator || {};
    (global as any).navigator.serviceWorker = { addEventListener: jest.fn(), removeEventListener: jest.fn() };
    Object.defineProperty((global as any).navigator, 'onLine', { value: true, configurable: true });
    (global as any).fetch = jest.fn(() => Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: { session_id: 'sess-1' } }) }));

    // Provide minimal hook mock behaviors used by the component
    const useWidgetAuth = require('../hooks/useWidgetAuth').useWidgetAuth;
    useWidgetAuth.mockReturnValue({ getAuthToken: jest.fn().mockResolvedValue('token'), authToken: 'token', authError: null });
    const useWidgetTranslation = require('../hooks/useWidgetTranslation').useWidgetTranslation;
    useWidgetTranslation.mockReturnValue({ translations: {}, locale: 'en' });
    // Ensure trackEvent returns a promise so `.catch` calls are safe in the
    // component's passive effects.
    const api = require('../lib/api');
    if (api.trackEvent && typeof api.trackEvent.mockResolvedValue === 'function') api.trackEvent.mockResolvedValue(undefined);
  });

  test('dispatches plain-object message without throwing', async () => {
    await act(async () => {
      render(<EmbedClient {...defaultProps} />);
    });

    // Dispatch a plain object (not an Event) to exercise the wrapper that
    // coerces it into a MessageEvent and forwards to the original dispatch.
    const plain = { data: { type: 'SOME_OTHER_TYPE', payload: {} }, origin: 'https://example.com', source: window.parent };

    await act(async () => {
      // should not throw
      (window as any).dispatchEvent(plain);
    });

    // If we reach here, the wrapper executed successfully.
    expect(true).toBe(true);
  });
});
