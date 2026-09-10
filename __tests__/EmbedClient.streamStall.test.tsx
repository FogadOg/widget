/**
 * Regression tests for the SSE stream stall watchdog.
 *
 * The send request's 30s timeout is cleared the moment response headers arrive,
 * and the backend flushes headers immediately (it opens the stream with a 2 KB
 * comment pad). That left the token read loop with no deadline at all: a stream
 * that went quiet mid-answer parked `reader.read()` forever and the visitor sat
 * on a typing indicator with no error and no retry.
 *
 * The watchdog fires on *silence*, so both halves matter and are covered here:
 * a stalled stream must abort, and a slow-but-alive stream must not.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import EmbedClient from '../app/embed/session/EmbedClient';
import { defaultProps } from './__fixtures__/EmbedClient.fixtures';
import { setupBeforeEach } from './__helpers__/EmbedClient.helpers';
import { TIMEOUTS } from '../lib/constants';

// Run the watchdog on a window measured in milliseconds rather than the real 45
// seconds. Fake timers are not an option here: the component's setup awaits real
// promises, and installing them before render deadlocks it — while installing
// them afterwards would leave the already-armed watchdog on the real clock,
// proving nothing.
jest.mock('../lib/constants', () => {
  const actual = jest.requireActual('../lib/constants');
  return { ...actual, TIMEOUTS: { ...actual.TIMEOUTS, STREAM_STALL: 120 } };
});

jest.mock('../app/embed/session/helpers');
jest.mock('../app/embed/session/events', () => ({
  onInitConfig: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock('../hooks/useWidgetAuth');
jest.mock('../hooks/useWidgetTranslation');
jest.mock('../lib/errorHandling', () => ({
  createSessionError: (msg: string, code: string) => ({ message: msg, code, userMessage: msg }),
  createNetworkError: (msg: string, code: string) => ({ message: msg, code, userMessage: msg }),
  createAuthError: (msg: string, code: string) => ({ message: msg, code, userMessage: msg }),
  // Single attempt: retries would just repeat the stall and slow the test.
  retryWithBackoff: jest.fn((fn: () => unknown) => fn()),
  logError: jest.fn(),
  parseApiError: jest.fn((_data: unknown, defaultMsg: string) => defaultMsg),
  WidgetErrorCode: {
    SESSION_CREATE_FAILED: 'SESSION_CREATE_FAILED',
    SESSION_EXPIRED: 'SESSION_EXPIRED',
    NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
    NETWORK_SERVER_ERROR: 'NETWORK_SERVER_ERROR',
    AUTH_TOKEN_FAILED: 'AUTH_TOKEN_FAILED',
    INVALID_CONFIG: 'INVALID_CONFIG',
    ORIGIN_NOT_ALLOWED: 1004,
  },
}));
jest.mock('../lib/logger', () => ({ logError: jest.fn(), logPerf: jest.fn() }));
jest.mock('../src/lib/offline', () => ({
  getQueuedMessages: jest.fn().mockResolvedValue([]),
  removeQueuedMessage: jest.fn().mockResolvedValue(undefined),
  queueMessage: jest.fn().mockResolvedValue(undefined),
  incrementAttempt: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../lib/api', () => {
  const actual = jest.requireActual('../lib/api');
  return { ...actual, trackEvent: jest.fn().mockResolvedValue(undefined) };
});
jest.mock('../components/EmbedShell', () => {
  return function MockEmbedShell(props: any) {
    return (
      <div data-testid="embed-shell">
        <button
          data-testid="submit-btn"
          onClick={() => props.handleSubmit({ preventDefault: jest.fn() })}
        >
          Submit
        </button>
        <input
          data-testid="input"
          value={props.input || ''}
          onChange={(e: any) => props.setInput(e.target.value)}
        />
      </div>
    );
  };
});

type FakeReader = {
  read: jest.Mock;
  cancel: jest.Mock;
  releaseLock: jest.Mock;
  /** Settle the deliberately-parked read so it can't outlive the test. */
  release: () => void;
};

/**
 * A reader that delivers `chunks` one every `gapMs`, then goes silent forever —
 * what a dropped-but-not-closed connection looks like from the client. The final
 * pending read settles only when the fetch signal aborts, which is how the
 * platform behaves and is the thing under test. With `gapMs` of 0 the chunks
 * arrive immediately and the stream stalls straight away.
 */
function createPacedReader(signal: AbortSignal, chunks: string[], gapMs: number): FakeReader {
  const encoder = new TextEncoder();
  let index = 0;
  const abortError = () => Object.assign(new Error('Aborted'), { name: 'AbortError' });
  const pending: Array<() => void> = [];
  const timers: ReturnType<typeof setTimeout>[] = [];

  return {
    read: jest.fn(() => {
      if (index < chunks.length) {
        const value = encoder.encode(chunks[index++]);
        if (gapMs === 0) return Promise.resolve({ value, done: false });
        return new Promise((resolve) => {
          timers.push(setTimeout(() => resolve({ value, done: false }), gapMs));
        });
      }
      return new Promise((resolve, reject) => {
        if (signal.aborted) {
          reject(abortError());
          return;
        }
        pending.push(() => resolve({ value: undefined, done: true }));
        signal.addEventListener('abort', () => reject(abortError()), { once: true });
      });
    }),
    cancel: jest.fn().mockResolvedValue(undefined),
    releaseLock: jest.fn(),
    release: () => {
      timers.splice(0).forEach(clearTimeout);
      pending.splice(0).forEach((settle) => settle());
    },
  };
}

describe('EmbedClient SSE stall watchdog', () => {
  let mockFetch: jest.Mock;
  let capturedSignal: AbortSignal | null;
  let reader: FakeReader | null;

  const installStreamMock = (chunks: string[], gapMs: number) => {
    mockFetch.mockImplementation((url: string, options?: any) => {
      if (url.includes('/messages') && options?.method === 'POST') {
        capturedSignal = options.signal;
        reader = createPacedReader(options.signal, chunks, gapMs);
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => 'text/event-stream' },
          body: { getReader: () => reader },
        });
      }
      if (url.includes('/messages')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'success', data: { messages: [] } }),
        });
      }
      if (url.includes('/agents/')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'success', data: { name: 'Test' } }),
        });
      }
      if (url.includes('/widget-config/')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: {} }) });
      }
      if (url.includes('/sessions')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'success', data: { session_id: 'sess-1' } }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: {} }) });
    });
  };

  const sendAMessage = async () => {
    render(<EmbedClient {...defaultProps} startOpen={true} />);
    await waitFor(() => expect(screen.getByTestId('embed-shell')).toBeInTheDocument(), {
      timeout: 5000,
    });
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/sessions'),
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    fireEvent.change(screen.getByTestId('input'), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByTestId('submit-btn'));
    await waitFor(() => expect(capturedSignal).not.toBeNull());
  };

  beforeEach(() => {
    ({ mockFetch } = setupBeforeEach());
    capturedSignal = null;
    reader = null;
  });

  afterEach(async () => {
    // A parked read is the whole point of these fixtures, but leaving one
    // pending keeps the Jest worker alive after the suite finishes.
    reader?.release();
    await Promise.resolve();
  });

  test('aborts a stream that goes silent after the first token', async () => {
    installStreamMock(['data: {"type":"token","text":"Hel"}\n\n'], 0);
    await sendAMessage();

    // First token lands, then the connection holds open saying nothing.
    await waitFor(() => expect(reader!.read).toHaveBeenCalledTimes(2));
    expect(capturedSignal!.aborted).toBe(false);

    await waitFor(() => expect(capturedSignal!.aborted).toBe(true), { timeout: 3000 });
    // The reader is still released on the way out, so the body isn't left locked.
    await waitFor(() => expect(reader!.cancel).toHaveBeenCalled());
  });

  test('does not abort while the stream keeps producing output', async () => {
    // Heartbeat comments and tokens both count as output; each one pushes the
    // deadline back, so a long answer is never cut off part-way through.
    const chunks = [
      ': ping\n\n',
      'data: {"type":"token","text":"a"}\n\n',
      ': ping\n\n',
      'data: {"type":"token","text":"b"}\n\n',
    ];
    const gapMs = Math.floor(TIMEOUTS.STREAM_STALL * 0.6);
    installStreamMock(chunks, gapMs);
    await sendAMessage();

    // Every chunk is consumed, so total elapsed runs well past the stall window
    // while the stream is never silent for a full one.
    await waitFor(() => expect(reader!.read).toHaveBeenCalledTimes(chunks.length + 1), {
      timeout: 5000,
    });
    expect(gapMs * chunks.length).toBeGreaterThan(TIMEOUTS.STREAM_STALL);
    expect(capturedSignal!.aborted).toBe(false);

    // Once output really does stop, the watchdog still fires.
    await waitFor(() => expect(capturedSignal!.aborted).toBe(true), { timeout: 3000 });
  });
});
