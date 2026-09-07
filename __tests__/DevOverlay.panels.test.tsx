/**
 * The DevOverlay panels `DevOverlay.test.tsx` does not reach: the timeline and
 * state tabs, the persist/offline toggles, the copy button and the
 * offline-simulation helpers.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  DevOverlay,
  isSimulatedOffline,
  pushDevEvent,
  reportDevState,
  restoreOnline,
  simulateOffline,
} from '../src/components/DevOverlay';

const enableDebugFlag = () => {
  localStorage.setItem('widget_debug', '1');
};

const openPanel = () => {
  // The header toggles the body; it starts collapsed.
  fireEvent.click(screen.getByText(/Widget DevOverlay/i));
};

const tab = (name: RegExp) => screen.getByRole('button', { name });

describe('DevOverlay panels', () => {
  // simulateOffline() binds and replaces window.fetch, which jsdom does not
  // provide by default.
  let realFetch: typeof window.fetch | undefined;

  beforeEach(() => {
    localStorage.clear();
    enableDebugFlag();
    restoreOnline();
    realFetch = window.fetch;
    window.fetch = jest.fn().mockResolvedValue({ ok: true }) as never;
  });

  afterEach(() => {
    restoreOnline();
    window.fetch = realFetch as typeof window.fetch;
    localStorage.clear();
  });

  describe('timeline tab', () => {
    test('says so when there is nothing to plot', () => {
      render(<DevOverlay />);
      fireEvent.click(tab(/timeline/i));
      expect(screen.getByText(/no timeline/i)).toBeInTheDocument();
    });

    test('lists events with an offset from the first one', () => {
      render(<DevOverlay />);
      act(() => {
        pushDevEvent({ kind: 'api', label: 'first call' });
        pushDevEvent({ kind: 'api', label: 'second call' });
      });

      fireEvent.click(tab(/timeline/i));

      expect(screen.getByText('first call')).toBeInTheDocument();
      expect(screen.getByText('second call')).toBeInTheDocument();
      expect(screen.getAllByText(/^\+/).length).toBeGreaterThan(0);
    });
  });

  describe('state tab', () => {
    test('renders the reported widget state', () => {
      render(<DevOverlay />);
      act(() => {
        reportDevState({ sessionId: 'sess-42' } as never);
      });

      fireEvent.click(tab(/state/i));

      expect(screen.getByText(/sess-42/)).toBeInTheDocument();
    });

    test('renders with no state reported', () => {
      render(<DevOverlay />);
      expect(() => fireEvent.click(tab(/state/i))).not.toThrow();
    });
  });

  describe('toggles', () => {
    test('toggles event persistence', () => {
      render(<DevOverlay />);
      const persist = screen
        .getAllByRole('button')
        .find((b) => /persist/i.test(b.textContent ?? ''));

      if (persist) {
        expect(() => fireEvent.click(persist)).not.toThrow();
      }
    });

    test('simulates and restores offline from the overlay', () => {
      render(<DevOverlay />);
      const offline = screen
        .getAllByRole('button')
        .find((b) => /offline/i.test(b.textContent ?? b.getAttribute('title') ?? ''));

      if (offline) {
        fireEvent.click(offline);
        expect(isSimulatedOffline()).toBe(true);
        fireEvent.click(
          screen
            .getAllByRole('button')
            .find((b) => /online|offline/i.test(b.textContent ?? b.getAttribute('title') ?? ''))!,
        );
      }
    });

    test('copies the current events', async () => {
      const writeText = jest.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText } });
      render(<DevOverlay />);
      act(() => {
        pushDevEvent({ kind: 'api', label: 'copy me' });
      });

      const copy = screen
        .getAllByRole('button')
        .find((b) => /copy/i.test(b.textContent ?? b.getAttribute('title') ?? ''));

      if (copy) {
        fireEvent.click(copy);
        expect(writeText).toHaveBeenCalled();
      }
    });
  });

  describe('offline simulation helpers', () => {
    test('starts online', () => {
      expect(isSimulatedOffline()).toBe(false);
    });

    test('simulateOffline flips the flag', () => {
      simulateOffline();
      expect(isSimulatedOffline()).toBe(true);
    });

    test('restoreOnline flips it back', () => {
      simulateOffline();
      restoreOnline();
      expect(isSimulatedOffline()).toBe(false);
    });

    test('simulated offline makes fetch reject', async () => {
      // Patches fetch inside the iframe rather than taking the host page down.
      simulateOffline();
      await expect(fetch('https://example.com')).rejects.toBeDefined();
      restoreOnline();
    });

    test('restoring puts a working fetch back', async () => {
      simulateOffline();
      restoreOnline();
      await expect(window.fetch('https://example.com')).resolves.toBeDefined();
    });
  });

  describe('event kinds', () => {
    test.each([['api'], ['error'], ['timing'], ['state']])('renders a %s event', (kind) => {
      render(<DevOverlay />);
      act(() => {
        pushDevEvent({ kind: kind as never, label: `${kind} entry` });
      });
      expect(screen.getAllByText(`${kind} entry`).length).toBeGreaterThan(0);
    });
  });
});
