/**
 * Unit tests for src/components/DevOverlay.tsx
 */

import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import {
  DevOverlay,
  detectDebugMode,
  pushDevEvent,
  enableDebug,
  disableDebug,
  useDebugMode,
} from '../src/components/DevOverlay';

// ── detectDebugMode ───────────────────────────────────────────────────────────

describe('detectDebugMode', () => {
  afterEach(() => {
    // Reset URL + localStorage + injected scripts between tests
    window.history.pushState({}, '', '/');
    localStorage.clear();
    document
      .querySelectorAll('script[data-client-id]')
      .forEach((el) => el.remove());
  });

  it('returns false when no debug signals are present', () => {
    window.history.pushState({}, '', '/');
    expect(detectDebugMode()).toBe(false);
  });

  it('returns true for ?widget_debug=1 query param', () => {
    window.history.pushState({}, '', '/?widget_debug=1');
    expect(detectDebugMode()).toBe(true);
  });

  it('returns true when localStorage key is set', () => {
    localStorage.setItem('widget_debug', '1');
    expect(detectDebugMode()).toBe(true);
  });

  it('returns true when script tag has data-dev attribute', () => {
    const script = document.createElement('script');
    script.setAttribute('data-client-id', 'test-client');
    script.setAttribute('data-dev', 'true');
    document.body.appendChild(script);
    expect(detectDebugMode()).toBe(true);
  });

  it('returns false when data-dev is "false"', () => {
    const script = document.createElement('script');
    script.setAttribute('data-client-id', 'test-client');
    script.setAttribute('data-dev', 'false');
    document.body.appendChild(script);
    expect(detectDebugMode()).toBe(false);
  });

  // Debug mode is intentionally NOT gated to non-production: integrators must
  // be able to debug live embeds via chat.enableDebug() / ?widget_debug=1.
  describe('production environment', () => {
    const prev = process.env.NODE_ENV;
    beforeAll(() => {
      Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true });
    });
    afterAll(() => {
      Object.defineProperty(process.env, 'NODE_ENV', { value: prev, configurable: true });
    });

    it('still activates from ?widget_debug=1 in production', () => {
      window.history.pushState({}, '', '/?widget_debug=1');
      expect(detectDebugMode()).toBe(true);
    });

    it('enableDebug() still sets the flag in production', () => {
      enableDebug();
      expect(localStorage.getItem('widget_debug')).toBe('1');
      expect(detectDebugMode()).toBe(true);
      disableDebug();
      expect(localStorage.getItem('widget_debug')).toBeNull();
    });
  });
});

// ── DevOverlay component ──────────────────────────────────────────────────────

describe('DevOverlay', () => {
  it('renders the overlay panel', () => {
    render(<DevOverlay />);
    expect(screen.getByTestId('dev-overlay')).toBeInTheDocument();
  });

  it('shows "Widget DevOverlay" header text', () => {
    render(<DevOverlay />);
    expect(screen.getByText(/Widget DevOverlay/)).toBeInTheDocument();
  });

  it('shows tab buttons for events, errors and timings', () => {
    render(<DevOverlay />);
    expect(screen.getByRole('button', { name: /events/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /errors/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /timings/ })).toBeInTheDocument();
  });

  it('shows "No events yet" when there are no events', () => {
    render(<DevOverlay />);
    expect(screen.getByText(/No events yet/)).toBeInTheDocument();
  });

  it('displays an event pushed via pushDevEvent', () => {
    render(<DevOverlay />);
    act(() => {
      pushDevEvent({ kind: 'event', label: 'widget.open', data: null });
    });
    expect(screen.getByText('widget.open')).toBeInTheDocument();
  });

  it('displays API request events', () => {
    render(<DevOverlay />);
    act(() => {
      pushDevEvent({ kind: 'api-request', label: 'GET /api/session' });
    });
    expect(screen.getByText('GET /api/session')).toBeInTheDocument();
  });

  it('increments event count in header', () => {
    render(<DevOverlay />);
    act(() => {
      pushDevEvent({ kind: 'event', label: 'e1' });
      pushDevEvent({ kind: 'event', label: 'e2' });
    });
    expect(screen.getByText(/2 events/)).toBeInTheDocument();
  });

  it('clears events when Clear button is clicked', () => {
    render(<DevOverlay />);
    act(() => {
      pushDevEvent({ kind: 'event', label: 'to-be-cleared' });
    });
    expect(screen.getByText('to-be-cleared')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(screen.queryByText('to-be-cleared')).not.toBeInTheDocument();
  });

  it('toggles collapsed state when header is clicked', () => {
    render(<DevOverlay />);
    // Tabs are visible initially (open = true)
    expect(screen.getByRole('button', { name: /events/ })).toBeVisible();

    // Click header to collapse
    fireEvent.click(screen.getByText(/Widget DevOverlay/));

    // After collapse tabs should not be present
    expect(screen.queryByRole('button', { name: /^events$/ })).not.toBeInTheDocument();
  });

  it('switches to the errors tab', () => {
    render(<DevOverlay />);
    act(() => {
      pushDevEvent({ kind: 'error', label: 'Something failed' });
    });
    fireEvent.click(screen.getByRole('button', { name: /errors/ }));
    expect(screen.getByText('Something failed')).toBeInTheDocument();
  });

  it('shows error count badge next to errors tab', () => {
    render(<DevOverlay />);
    act(() => {
      pushDevEvent({ kind: 'error', label: 'err' });
    });
    expect(screen.getByText('(1)')).toBeInTheDocument();
  });
});

// ── enableDebug / disableDebug ────────────────────────────────────────────────

describe('enableDebug / disableDebug', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('enableDebug sets localStorage.widget_debug to "1"', () => {
    enableDebug();
    expect(localStorage.getItem('widget_debug')).toBe('1');
  });

  it('disableDebug removes localStorage.widget_debug', () => {
    localStorage.setItem('widget_debug', '1');
    disableDebug();
    expect(localStorage.getItem('widget_debug')).toBeNull();
  });

  it('enableDebug dispatches companin:debug:change event', () => {
    const handler = jest.fn();
    window.addEventListener('companin:debug:change', handler);
    enableDebug();
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener('companin:debug:change', handler);
  });

  it('disableDebug dispatches companin:debug:change event', () => {
    const handler = jest.fn();
    window.addEventListener('companin:debug:change', handler);
    disableDebug();
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener('companin:debug:change', handler);
  });
});

// ── useDebugMode hook ─────────────────────────────────────────────────────────

describe('useDebugMode', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('returns false when debug is not active', () => {
    const TestComp = () => <span data-testid="val">{String(useDebugMode())}</span>;
    render(<TestComp />);
    expect(screen.getByTestId('val').textContent).toBe('false');
  });

  it('returns true after enableDebug is called', () => {
    const TestComp = () => <span data-testid="val">{String(useDebugMode())}</span>;
    render(<TestComp />);
    act(() => { enableDebug(); });
    expect(screen.getByTestId('val').textContent).toBe('true');
  });

  it('returns false after disableDebug is called', () => {
    localStorage.setItem('widget_debug', '1');
    const TestComp = () => <span data-testid="val">{String(useDebugMode())}</span>;
    render(<TestComp />);
    act(() => { disableDebug(); });
    expect(screen.getByTestId('val').textContent).toBe('false');
  });
});
