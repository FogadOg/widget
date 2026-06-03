/**
 * Tests for src/embed/host.tsx
 *
 * Mocks createHostHandshake so we can invoke the registered READY / RESIZE /
 * ERROR callbacks directly and assert the component reaction.
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { WidgetHost } from '../src/embed/host';
import { createHostHandshake } from '../src/embed/handshake';

// ---------------------------------------------------------------------------
// Module mock
// ---------------------------------------------------------------------------

jest.mock('../src/embed/handshake', () => ({
  createHostHandshake: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Shared mock helpers
// ---------------------------------------------------------------------------

let mockOn: jest.Mock;
let mockSendInit: jest.Mock;

/** Return the handler registered for a given HostHandshake event type */
function getHandler(type: string): ((...args: unknown[]) => void) | undefined {
  const call = mockOn.mock.calls.find(([t]: string[]) => t === type);
  return call?.[1] as ((...args: unknown[]) => void) | undefined;
}

beforeEach(() => {
  mockOn = jest.fn();
  mockSendInit = jest.fn();

  (createHostHandshake as jest.Mock).mockReturnValue({
    on: mockOn,
    sendInit: mockSendInit,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const DEFAULT_ORIGIN = 'https://widget.example.com';
const DEFAULT_CONFIG = { agentId: 'bot-1' };

describe('WidgetHost – iframe rendering', () => {
  it('renders an iframe with the default title', async () => {
    await act(async () => {
      render(<WidgetHost widgetOrigin={DEFAULT_ORIGIN} />);
    });

    expect(screen.getByTitle('Agent Widget')).toBeInTheDocument();
  });

  it('accepts a custom title prop', async () => {
    await act(async () => {
      render(<WidgetHost widgetOrigin={DEFAULT_ORIGIN} title="Customer Support" />);
    });

    expect(screen.getByTitle('Customer Support')).toBeInTheDocument();
  });

  it('defaults src to <widgetOrigin>/embed/widget', async () => {
    await act(async () => {
      render(<WidgetHost widgetOrigin={DEFAULT_ORIGIN} />);
    });

    const iframe = screen.getByTitle('Agent Widget') as HTMLIFrameElement;
    expect(iframe.src).toBe(`${DEFAULT_ORIGIN}/embed/widget`);
  });

  it('uses widgetUrl prop as src when provided', async () => {
    await act(async () => {
      render(
        <WidgetHost widgetOrigin={DEFAULT_ORIGIN} widgetUrl="https://cdn.example.com/widget" />,
      );
    });

    const iframe = screen.getByTitle('Agent Widget') as HTMLIFrameElement;
    expect(iframe.src).toBe('https://cdn.example.com/widget');
  });

  it('sets sandbox to "allow-scripts allow-forms"', async () => {
    await act(async () => {
      render(<WidgetHost widgetOrigin={DEFAULT_ORIGIN} />);
    });

    const iframe = screen.getByTitle('Agent Widget') as HTMLIFrameElement;
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-forms');
  });

  it('sets referrerpolicy to no-referrer', async () => {
    await act(async () => {
      render(<WidgetHost widgetOrigin={DEFAULT_ORIGIN} />);
    });

    const iframe = screen.getByTitle('Agent Widget') as HTMLIFrameElement;
    expect(iframe.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('renders with initial height of 600', async () => {
    await act(async () => {
      render(<WidgetHost widgetOrigin={DEFAULT_ORIGIN} />);
    });

    const iframe = screen.getByTitle('Agent Widget') as HTMLIFrameElement;
    expect(iframe.height).toBe('600');
  });

  it('renders with width 100%', async () => {
    await act(async () => {
      render(<WidgetHost widgetOrigin={DEFAULT_ORIGIN} />);
    });

    const iframe = screen.getByTitle('Agent Widget') as HTMLIFrameElement;
    expect(iframe.width).toBe('100%');
  });

  it('applies custom className to the iframe', async () => {
    await act(async () => {
      render(<WidgetHost widgetOrigin={DEFAULT_ORIGIN} className="my-widget" />);
    });

    const iframe = screen.getByTitle('Agent Widget');
    expect(iframe).toHaveClass('my-widget');
  });
});

describe('WidgetHost – handshake initialisation', () => {
  it('calls createHostHandshake with the iframe element and widgetOrigin', async () => {
    await act(async () => {
      render(<WidgetHost widgetOrigin={DEFAULT_ORIGIN} config={DEFAULT_CONFIG} />);
    });

    expect(createHostHandshake).toHaveBeenCalledWith(
      expect.objectContaining({ widgetOrigin: DEFAULT_ORIGIN }),
    );
    // The iframe element should have been passed (not null)
    const callArg = (createHostHandshake as jest.Mock).mock.calls[0][0];
    expect(callArg.iframe).toBeInstanceOf(HTMLIFrameElement);
  });

  it('registers READY, RESIZE and ERROR handlers', async () => {
    await act(async () => {
      render(<WidgetHost widgetOrigin={DEFAULT_ORIGIN} config={DEFAULT_CONFIG} />);
    });

    const registeredTypes = mockOn.mock.calls.map(([t]: string[]) => t);
    expect(registeredTypes).toContain('READY');
    expect(registeredTypes).toContain('RESIZE');
    expect(registeredTypes).toContain('ERROR');
  });
});

describe('WidgetHost – READY → sendInit', () => {
  it('calls sendInit with the handshake token and config on READY', async () => {
    await act(async () => {
      render(<WidgetHost widgetOrigin={DEFAULT_ORIGIN} config={DEFAULT_CONFIG} />);
    });

    const readyHandler = getHandler('READY')!;
    expect(readyHandler).toBeDefined();

    act(() => {
      readyHandler({ type: 'READY', handshakeToken: 'handshake-tok', version: '1' });
    });

    expect(mockSendInit).toHaveBeenCalledWith('handshake-tok', DEFAULT_CONFIG);
  });

  it('passes the default empty config to sendInit when config prop is omitted', async () => {
    await act(async () => {
      render(<WidgetHost widgetOrigin={DEFAULT_ORIGIN} />);
    });

    const readyHandler = getHandler('READY')!;
    act(() => {
      readyHandler({ type: 'READY', handshakeToken: 'tok', version: '1' });
    });

    expect(mockSendInit).toHaveBeenCalledWith('tok', {});
  });
});

describe('WidgetHost – RESIZE', () => {
  it('updates the iframe height when RESIZE is received', async () => {
    await act(async () => {
      render(<WidgetHost widgetOrigin={DEFAULT_ORIGIN} />);
    });

    const resizeHandler = getHandler('RESIZE')!;
    expect(resizeHandler).toBeDefined();

    await act(async () => {
      resizeHandler({ type: 'RESIZE', height: 1024 });
    });

    const iframe = screen.getByTitle('Agent Widget') as HTMLIFrameElement;
    expect(iframe.height).toBe('1024');
  });

  it('handles multiple successive RESIZE events', async () => {
    await act(async () => {
      render(<WidgetHost widgetOrigin={DEFAULT_ORIGIN} />);
    });

    const resizeHandler = getHandler('RESIZE')!;

    await act(async () => {
      resizeHandler({ type: 'RESIZE', height: 400 });
    });
    await act(async () => {
      resizeHandler({ type: 'RESIZE', height: 800 });
    });

    const iframe = screen.getByTitle('Agent Widget') as HTMLIFrameElement;
    expect(iframe.height).toBe('800');
  });
});

describe('WidgetHost – ERROR', () => {
  it('logs widget errors via console.error', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await act(async () => {
      render(<WidgetHost widgetOrigin={DEFAULT_ORIGIN} />);
    });

    const errorHandler = getHandler('ERROR')!;
    act(() => {
      errorHandler({ type: 'ERROR', code: 'INIT_TIMEOUT', detail: 'timed out' });
    });

    expect(errorSpy).toHaveBeenCalledWith(
      '[WidgetHost] Widget error',
      'INIT_TIMEOUT',
      'timed out',
    );
  });
});
