import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import DevHarness from '../app/dev/DevHarness';

const ORIGIN = window.location.origin;

function fillIds() {
  fireEvent.change(screen.getByPlaceholderText('data-client-id'), { target: { value: 'c1' } });
  fireEvent.change(screen.getByPlaceholderText('data-agent-id'), { target: { value: 'a1' } });
  fireEvent.change(screen.getByPlaceholderText('data-config-id'), { target: { value: 'cfg1' } });
}

describe('DevHarness', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  it('shows the placeholder until all three IDs are provided', () => {
    render(<DevHarness />);
    expect(screen.getByText(/Enter Client \/ Agent \/ Config IDs/)).toBeInTheDocument();
    // Apply button is disabled until ready
    expect(screen.getByRole('button', { name: /Apply & reload/ })).toBeDisabled();
  });

  it('enables apply and renders the iframe with the embed URL once IDs are applied', () => {
    render(<DevHarness />);
    fillIds();

    const applyBtn = screen.getByRole('button', { name: /Apply & reload/ });
    expect(applyBtn).not.toBeDisabled();

    fireEvent.click(applyBtn);

    const iframe = screen.getByTitle('Widget under test') as HTMLIFrameElement;
    expect(iframe).toBeInTheDocument();
    expect(iframe.src).toContain(`${ORIGIN}/embed/session?`);
    expect(iframe.src).toContain('clientId=c1');
    expect(iframe.src).toContain('agentId=a1');
    expect(iframe.src).toContain('configId=cfg1');
    expect(iframe.src).toContain('parentOrigin=');
    expect(iframe.src).toContain('pagePath=%2Fdev');
    // showOverlay defaults to true → widget_debug=1
    expect(iframe.src).toContain('widget_debug=1');
  });

  it('persists IDs to localStorage and restores them on remount', () => {
    const { unmount } = render(<DevHarness />);
    fillIds();
    expect(localStorage.getItem('companin-devharness-clientId')).toBe('c1');
    unmount();

    render(<DevHarness />);
    expect((screen.getByPlaceholderText('data-client-id') as HTMLInputElement).value).toBe('c1');
  });

  it('toggles the start-open and DevOverlay checkboxes (drops widget_debug when off)', () => {
    render(<DevHarness />);
    fillIds();

    const checkboxes = screen.getAllByRole('checkbox');
    const [startOpen, showOverlay] = checkboxes;
    fireEvent.click(startOpen);
    fireEvent.click(showOverlay); // turn overlay off

    fireEvent.click(screen.getByRole('button', { name: /Apply & reload/ }));

    const iframe = screen.getByTitle('Widget under test') as HTMLIFrameElement;
    expect(iframe.src).toContain('startOpen=true');
    expect(iframe.src).not.toContain('widget_debug=1');
  });

  it('changes locale via the select', () => {
    render(<DevHarness />);
    fillIds();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'fr' } });
    fireEvent.click(screen.getByRole('button', { name: /Apply & reload/ }));
    const iframe = screen.getByTitle('Widget under test') as HTMLIFrameElement;
    expect(iframe.src).toContain('locale=fr');
  });

  it('reloads the iframe without changing the applied src', () => {
    render(<DevHarness />);
    fillIds();
    fireEvent.click(screen.getByRole('button', { name: /Apply & reload/ }));
    const firstSrc = (screen.getByTitle('Widget under test') as HTMLIFrameElement).src;
    fireEvent.click(screen.getByRole('button', { name: /Reload iframe/ }));
    expect((screen.getByTitle('Widget under test') as HTMLIFrameElement).src).toBe(firstSrc);
  });

  it('clears only widget storage keys (not harness keys) and reloads', () => {
    localStorage.setItem('companin-session', 'x');
    localStorage.setItem('companin_token', 'y');
    localStorage.setItem('companin-devharness-clientId', 'keep');
    localStorage.setItem('unrelated', 'z');

    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});

    render(<DevHarness />);
    fireEvent.click(screen.getByRole('button', { name: /Clear session/ }));

    expect(localStorage.getItem('companin-session')).toBeNull();
    expect(localStorage.getItem('companin_token')).toBeNull();
    // harness key and unrelated key are preserved
    expect(localStorage.getItem('companin-devharness-clientId')).toBe('keep');
    expect(localStorage.getItem('unrelated')).toBe('z');
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('Cleared 2'));
  });

  it('toggles offline/online and dispatches connectivity events to the iframe', () => {
    render(<DevHarness />);
    fillIds();
    fireEvent.click(screen.getByRole('button', { name: /Apply & reload/ }));

    const offlineBtn = screen.getByRole('button', { name: /Simulate offline/ });
    fireEvent.click(offlineBtn);
    expect(screen.getByRole('button', { name: /Restore online/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Restore online/ }));
    expect(screen.getByRole('button', { name: /Simulate offline/ })).toBeInTheDocument();
  });

  it('logs WIDGET_ postMessages from the iframe and ignores everything else', () => {
    render(<DevHarness />);

    // ignored: wrong origin
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { origin: 'https://evil.com', data: { type: 'WIDGET_X' } }));
    });
    // ignored: non-object data
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { origin: ORIGIN, data: 'nope' }));
    });
    // ignored: type not a WIDGET_ string
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { origin: ORIGIN, data: { type: 'OTHER' } }));
    });
    // ignored: type not a string
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { origin: ORIGIN, data: { type: 42 } }));
    });

    expect(screen.getByText(/No messages yet/)).toBeInTheDocument();
    expect(screen.getByText(/postMessage log \(0\)/)).toBeInTheDocument();

    // accepted: WIDGET_ message with a nested data payload
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', { origin: ORIGIN, data: { type: 'WIDGET_READY', data: { ok: true } } })
      );
    });

    expect(screen.getByText(/postMessage log \(1\)/)).toBeInTheDocument();
    expect(screen.getByText('WIDGET_READY')).toBeInTheDocument();
    expect(screen.getByText('{"ok":true}')).toBeInTheDocument();
  });

  it('renders [unserializable] for circular payloads and clears the log', () => {
    render(<DevHarness />);

    const circular: Record<string, unknown> = { type: 'WIDGET_BAD' };
    circular.self = circular;

    act(() => {
      window.dispatchEvent(new MessageEvent('message', { origin: ORIGIN, data: circular }));
    });

    expect(screen.getByText('[unserializable]')).toBeInTheDocument();

    const logPanel = screen.getByText(/postMessage log/).closest('div')!.parentElement!;
    fireEvent.click(within(logPanel).getByRole('button', { name: 'Clear' }));
    expect(screen.getByText(/No messages yet/)).toBeInTheDocument();
  });

  it('falls back to defaults when localStorage access throws', () => {
    const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    render(<DevHarness />);
    // initial read fell back to '' without throwing
    const input = screen.getByPlaceholderText('data-client-id') as HTMLInputElement;
    expect(input.value).toBe('');
    // writing also swallows the error
    fireEvent.change(input, { target: { value: 'c1' } });
    expect(input.value).toBe('c1');

    getItem.mockRestore();
    setItem.mockRestore();
  });
});
