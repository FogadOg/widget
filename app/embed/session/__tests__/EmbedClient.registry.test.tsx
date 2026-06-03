import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import EmbedClient from '../EmbedClient';

// Mock heavy children and hooks (mirrors EmbedClient.component.test.tsx)
jest.mock('components/EmbedShell', () => (props: any) => (
  <div data-testid="embed-shell">{props.feedbackDialog ?? null}</div>
));
jest.mock('components/FeedbackDialog', () => () => <div data-testid="feedback-dialog" />);

const mockGetAuthToken = jest.fn();
jest.mock('../../../../hooks/useWidgetAuth', () => ({
  useWidgetAuth: () => ({
    getAuthToken: mockGetAuthToken,
    authToken: null,
    authError: null,
    scheduleAutoRefresh: jest.fn(),
  }),
}));
jest.mock('../../../../hooks/useWidgetTranslation', () => ({
  useWidgetTranslation: () => ({ translations: {}, locale: 'en' }),
}));
jest.mock('../../../../lib/api', () => ({
  trackEvent: jest.fn(() => Promise.resolve()),
  embedOriginHeader: jest.fn(() => ({})),
  API: {
    agent: (id: string) => `/api/agents/${id}`,
    widgetConfig: (id: string) => `/api/config/${id}`,
    sessions: () => '/api/sessions',
    sessionMessages: (id: string) => `/api/sessions/${id}/messages`,
    session: (id: string) => `/api/sessions/${id}`,
    sessionFeedback: (id: string) => `/api/sessions/${id}/feedback`,
  },
}));
jest.mock('../../../../lib/logger', () => ({ logError: jest.fn(), logPerf: jest.fn() }));
jest.mock('../../../../lib/cssValidator', () => ({ sanitizeCss: (s: string) => s }));
jest.mock('../../../../src/lib/offline', () => ({
  getQueuedMessages: jest.fn().mockResolvedValue([]),
  removeQueuedMessage: jest.fn().mockResolvedValue(undefined),
  queueMessage: jest.fn().mockResolvedValue(undefined),
  incrementAttempt: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../../src/lib/widgetRegistry', () => ({
  registerInstance: jest.fn(),
  deregisterInstance: jest.fn(),
  makeInstanceId: jest.fn(() => 'test-instance-id'),
  open: jest.fn(),
  close: jest.fn(),
}));

const registry = require('../../../../src/lib/widgetRegistry');

const baseProps = {
  clientId: 'c1',
  agentId: 'a1',
  configId: 'cfg1',
  locale: 'en',
  startOpen: false as boolean,
};

describe('EmbedClient widget-registry lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuthToken.mockResolvedValue(null);
    if ((global.fetch as jest.Mock)?.mockReset) {
      (global.fetch as jest.Mock).mockReset();
    }
  });

  test('survives registry failures on register, sync-close and deregister', async () => {
    // Each registry interaction throws — the component must swallow them so a
    // broken registry never takes the widget down.
    (registry.registerInstance as jest.Mock).mockImplementation(() => {
      throw new Error('register boom');
    });
    (registry.close as jest.Mock).mockImplementation(() => {
      throw new Error('close boom');
    });
    (registry.deregisterInstance as jest.Mock).mockImplementation(() => {
      throw new Error('deregister boom');
    });

    const { unmount } = render(<EmbedClient {...baseProps} />);

    await waitFor(() => expect(screen.getByTestId('embed-shell')).toBeInTheDocument(), { timeout: 3000 });

    // register failure is handled as non-fatal rather than thrown.
    expect(registry.registerInstance).toHaveBeenCalled();
    // isCollapsed starts true, so the sync effect calls registry.close (which threw).
    expect(registry.close).toHaveBeenCalledWith('test-instance-id');

    // Deregister throwing on unmount must not surface an error.
    expect(() => unmount()).not.toThrow();
    expect(registry.deregisterInstance).toHaveBeenCalledWith('test-instance-id');
  });

  test('opens the registry instance once config expands the widget', async () => {
    mockGetAuthToken.mockResolvedValue('tok-open');

    const fetchMock = jest.fn();
    // fetchAgentDetails
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'success', data: { name: 'Bot' } }),
    });
    // fetchWidgetConfig — start_open expands the widget (isCollapsed -> false)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'success',
        data: { id: 'cfg1', widget_type: 'chat', start_open: true },
      }),
    });
    // createSession + any subsequent message loads
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', data: { session_id: 'sess-open', messages: [] } }),
    });
    global.fetch = fetchMock;

    const { unmount } = render(<EmbedClient {...baseProps} startOpen={true} parentOrigin={window.location.origin} />);

    await waitFor(() => expect(screen.getByTestId('embed-shell')).toBeInTheDocument(), { timeout: 5000 });

    // Once the widget is expanded, the registry-sync effect takes the open branch.
    await waitFor(() => expect(registry.open).toHaveBeenCalledWith('test-instance-id', expect.any(Object)), {
      timeout: 5000,
    });

    unmount();
  });
});
