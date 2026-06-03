/**

 * Tests for src/embed/embedEntry.tsx

 *

 * Mocks createHandshake so message handlers can be invoked directly without

 * relying on real postMessage dispatch across origins.

 */

import React from 'react';

import { render, screen, act } from '@testing-library/react';

import { EmbedEntry } from '../src/embed/embedEntry';

import { createHandshake } from '../src/embed/handshake';

// ---------------------------------------------------------------------------

// Module mocks

// ---------------------------------------------------------------------------

jest.mock('../src/embed/handshake', () => ({

  createHandshake: jest.fn(),

}));

// ---------------------------------------------------------------------------

// ResizeObserver stub (not provided by jsdom)

// ---------------------------------------------------------------------------

const mockRoObserve = jest.fn();

const mockRoDisconnect = jest.fn();

class MockResizeObserver {

  observe = mockRoObserve;

  disconnect = mockRoDisconnect;

  unobserve = jest.fn();

}

beforeAll(() => {

  Object.defineProperty(global, 'ResizeObserver', {

    writable: true,

    configurable: true,

    value: MockResizeObserver,

  });

});

// ---------------------------------------------------------------------------

// Shared mock helpers

// ---------------------------------------------------------------------------

let mockOn: jest.Mock;

let mockSendReady: jest.Mock;

let mockSendResize: jest.Mock;

/** Return the handler registered for a given message type */

function getHandler(type: string): ((...args: unknown[]) => void) | undefined {

  const call = mockOn.mock.calls.find(([t]: string[]) => t === type);

  return call?.[1] as ((...args: unknown[]) => void) | undefined;

}

beforeEach(() => {

  mockOn = jest.fn();

  mockSendReady = jest.fn();

  mockSendResize = jest.fn();

  mockRoObserve.mockClear();

  mockRoDisconnect.mockClear();

  (createHandshake as jest.Mock).mockReturnValue({

    on: mockOn,

    sendReady: mockSendReady,

    sendResize: mockSendResize,

    handshakeToken: 'mock-token-abc',

  });

});

afterEach(() => {

  jest.restoreAllMocks();

  delete process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS;

});

// ---------------------------------------------------------------------------

// Tests

// ---------------------------------------------------------------------------

describe('EmbedEntry – initial loading state', () => {

  it('renders loading spinner before INIT is received', async () => {

    await act(async () => {

      render(<EmbedEntry allowedOrigins={['https://host.example.com']} />);

    });

    expect(screen.getByRole('status')).toBeInTheDocument();

    expect(screen.getByText('Loading…')).toBeInTheDocument();

  });

  it('calls sendReady on mount', async () => {

    await act(async () => {

      render(<EmbedEntry allowedOrigins={['https://host.example.com']} />);

    });

    expect(mockSendReady).toHaveBeenCalledTimes(1);

  });

  it('calls sendResize with the initial document height on mount', async () => {

    await act(async () => {

      render(<EmbedEntry allowedOrigins={['https://host.example.com']} />);

    });

    expect(mockSendResize).toHaveBeenCalled();

  });

  it('starts observing document.body for resize changes', async () => {

    await act(async () => {

      render(<EmbedEntry allowedOrigins={['https://host.example.com']} />);

    });

    expect(mockRoObserve).toHaveBeenCalledWith(document.body);

  });

});

describe('EmbedEntry – after receiving INIT', () => {

  it('hides the loading spinner and renders the widget shell', async () => {

    await act(async () => {

      render(<EmbedEntry allowedOrigins={['https://host.example.com']} />);

    });

    const initHandler = getHandler('INIT')!;

    await act(async () => {

      initHandler({ type: 'INIT', config: { agentId: 'agent-42', theme: 'dark' } });

    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();

  });

  it('renders WidgetShell with the agentId from config', async () => {

    await act(async () => {

      render(<EmbedEntry allowedOrigins={['https://host.example.com']} />);

    });

    const initHandler = getHandler('INIT')!;

    await act(async () => {

      initHandler({ type: 'INIT', config: { agentId: 'bot-99' } });

    });

    const shell = document.querySelector('[data-widget-config]');

    expect(shell).not.toBeNull();

    const parsed = JSON.parse(shell!.getAttribute('data-widget-config') ?? '{}');

    expect(parsed.agentId).toBe('bot-99');

  });

  it('renders widget-shell div with correct data-agent-id', async () => {

    await act(async () => {

      render(<EmbedEntry allowedOrigins={['https://host.example.com']} />);

    });

    const initHandler = getHandler('INIT')!;

    await act(async () => {

      initHandler({ type: 'INIT', config: { agentId: 'bot-77' } });

    });

    const widgetShell = document.querySelector('.widget-shell');

    expect(widgetShell).not.toBeNull();

    expect(widgetShell!.getAttribute('data-agent-id')).toBe('bot-77');

  });

  it('handles config without agentId (renders empty data-agent-id)', async () => {

    await act(async () => {

      render(<EmbedEntry allowedOrigins={['https://host.example.com']} />);

    });

    const initHandler = getHandler('INIT')!;

    await act(async () => {

      initHandler({ type: 'INIT', config: {} });

    });

    const widgetShell = document.querySelector('.widget-shell');

    expect(widgetShell!.getAttribute('data-agent-id')).toBe('');

  });

});

describe('EmbedEntry – PING/PONG', () => {

  it('responds to PING by posting PONG to parent', async () => {

    const postMessageSpy = jest

      .spyOn(window, 'postMessage')

      .mockImplementation(() => {});

    await act(async () => {

      render(<EmbedEntry allowedOrigins={['https://host.example.com']} />);

    });

    const pingHandler = getHandler('PING')!;

    expect(pingHandler).toBeDefined();

    act(() => {

      pingHandler({ type: 'PING' });

    });

    expect(postMessageSpy).toHaveBeenCalledWith({ type: 'PONG' }, '*');

  });

});

describe('EmbedEntry – allowed origins', () => {

  it('passes provided allowedOrigins prop to createHandshake', async () => {

    await act(async () => {

      render(<EmbedEntry allowedOrigins={['https://a.com', 'https://b.com']} />);

    });

    expect(createHandshake).toHaveBeenCalledWith(

      expect.objectContaining({ allowedOrigins: ['https://a.com', 'https://b.com'] }),

    );

  });

  it('falls back to NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS env var when prop is empty', async () => {

    process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS = 'https://env.example.com, https://env2.example.com';

    await act(async () => {

      render(<EmbedEntry allowedOrigins={[]} />);

    });

    expect(createHandshake).toHaveBeenCalledWith(

      expect.objectContaining({

        allowedOrigins: ['https://env.example.com', 'https://env2.example.com'],

      }),

    );

  });

  it('warns when no allowed origins are configured', async () => {

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    delete process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS;

    await act(async () => {

      render(<EmbedEntry allowedOrigins={[]} />);

    });

    expect(warnSpy).toHaveBeenCalledWith(

      expect.stringContaining('No allowed origins configured'),

    );

  });

  it('uses empty default allowedOrigins when prop is omitted', async () => {

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await act(async () => {

      render(<EmbedEntry />);

    });

    // createHandshake is still called (origins may be empty → warns)

    expect(createHandshake).toHaveBeenCalled();

    warnSpy.mockRestore();

  });

});

describe('EmbedEntry – cleanup', () => {

  it('disconnects the ResizeObserver when the component unmounts', async () => {

    let unmount!: () => void;

    await act(async () => {

      const result = render(<EmbedEntry allowedOrigins={['https://host.example.com']} />);

      unmount = result.unmount;

    });

    act(() => {

      unmount();

    });

    expect(mockRoDisconnect).toHaveBeenCalled();

  });

});

