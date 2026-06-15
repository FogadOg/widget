 

import React from 'react';

import '@testing-library/jest-dom';

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// mocks for libs

jest.mock('../lib/logger', () => ({

  logError: jest.fn(),

  logPerf: jest.fn(),

}));

// we'll override retryWithBackoff to make tests deterministic

jest.mock('../lib/errorHandling', () => {

  const original = jest.requireActual('../lib/errorHandling');

  return {

    ...original,

     

    retryWithBackoff: jest.fn((fn: () => Promise<any>, _opts: any) => fn()),

  };

});

// ensure rate limiter always allows in tests

jest.mock('../lib/rateLimiter', () => ({

  checkAndConsume: jest.fn(() => ({ allowed: true })),

}));

import MessageInput from '../components/MessageInput';

import { logError } from '../lib/logger';

import * as errorHandling from '../lib/errorHandling';

import * as rateLimiter from '../lib/rateLimiter';

// validation is a jest mock so we can override behavior per test

jest.mock('../lib/validation', () => {

  const real = jest.requireActual('../lib/validation');

  return {

    validateMessageInput: jest.fn((msg: string) => real.validateMessageInput(msg)),

  };

});

import { validateMessageInput } from '../lib/validation';

// helper to render the component with sensible defaults

function setup(overrides: Record<string, any> = {}) {

  const onMessageSent = jest.fn();

  const onError = jest.fn();

  const onTypingStart = jest.fn();

  const onTypingEnd = jest.fn();

  const onMessageFailed = jest.fn();

  const getPageContext = jest.fn().mockReturnValue({ foo: 'bar' });

  const props = {

    sessionId: 'session123',

    authToken: 'token',

    locale: 'en',

    onMessageSent,

    onError,

    onTypingStart,

    onTypingEnd,

    getPageContext,

    onMessageFailed,

    ...overrides,

  } as any;

  const utils = render(<MessageInput {...props} />);

  const input = screen.getByLabelText('Type your message') as HTMLInputElement;

  const button = screen.getByText('Send') as HTMLButtonElement;

  return { ...utils, input, button, onMessageSent, onError, onTypingStart, onTypingEnd, onMessageFailed };

}

describe('MessageInput component', () => {

  let mockFetch: jest.Mock;

  beforeEach(() => {

    jest.clearAllMocks();

    mockFetch = jest.fn();

    (global as any).fetch = mockFetch;

  });

  it('reports validation error when message is empty', async () => {

    const { container, onError } = setup();

    const form = container.querySelector('form')!;

    fireEvent.submit(form);

    await waitFor(() => {

      expect(onError).toHaveBeenCalledWith('Message cannot be empty');

    });

    expect(mockFetch).not.toHaveBeenCalled();

  });

  it('errors when session or auth token is missing', async () => {

    // make validateMessageInput always return valid so we pass validation

    (validateMessageInput as jest.Mock).mockReturnValue({ isValid: true, sanitized: 'hello' });

    const { container, onError } = setup({ sessionId: null });

    const form = container.querySelector('form')!;

    fireEvent.submit(form);

    await waitFor(() => {

      expect(onError).toHaveBeenCalledWith('Session or authentication token not available. Please check your widget configuration.');

    });

    expect(logError).toHaveBeenCalledWith('Missing session or auth token', {

      hasSession: false,

      hasAuth: true,

    });

    expect(mockFetch).not.toHaveBeenCalled();

  });

  it('catches session-expired response from server', async () => {

    // simulate POST failing with 401

    mockFetch.mockResolvedValueOnce({

      ok: false,

      status: 401,

      json: () => Promise.resolve({ message: 'Expired' }),

    });

    const { container, onError, onMessageFailed } = setup();

    const form = container.querySelector('form')!;

    // fill valid text so button would enable if it were

    const input = container.querySelector('input')!;

    fireEvent.change(input, { target: { value: 'hi' } });

    await act(async () => {

      fireEvent.submit(form);

    });

    // session error has userMessage from createSessionError

    expect(onError).toHaveBeenCalledWith('Failed to establish session. Please try again.');

    expect(onMessageFailed).toHaveBeenCalledWith(expect.stringMatching(/^temp-/));

    // logError should have been invoked via onRetry callback when retrying

    expect(logError).toHaveBeenCalled();

  });

  it('logs an error when loadLatestMessages GET fails', async () => {

    // first POST succeed, second GET fail

    mockFetch

      .mockResolvedValueOnce({

        ok: true,

        json: () => Promise.resolve({ status: 'success', data: {} }),

      })

      .mockResolvedValueOnce({

        ok: false,

        status: 500,

        json: () => Promise.resolve({}),

      });

    const { input, button } = setup();

    fireEvent.change(input, { target: { value: 'works' } });

    await act(async () => {

      fireEvent.click(button);

    });

    // wait for the second fetch to be called

    await waitFor(() => {

      expect(mockFetch).toHaveBeenCalledTimes(2);

    });

    // logError should have been called for the GET failure

    expect(logError).toHaveBeenCalledWith(expect.stringContaining('Failed to load messages'), expect.any(Object));

  });

  it('processes messages returned by loadLatestMessages', async () => {

    const now = new Date().toISOString();

    mockFetch

      .mockResolvedValueOnce({

        ok: true,

        json: () => Promise.resolve({ status: 'success', data: {} }),

      })

      .mockResolvedValueOnce({

        ok: true,

        json: () => Promise.resolve({

          status: 'success',

          data: {

            messages: [

              { id: 'a1', sender: 'assistant', content: 'hi', created_at: now },

              { id: 'u1', sender: 'user', content: 'hello', created_at: now },

            ],

          },

        }),

      });

    const { input, button, onMessageSent } = setup();

    fireEvent.change(input, { target: { value: 'go' } });

    await act(async () => {

      fireEvent.click(button);

    });

    // component adds user message before network, and then our simulated agent message

    expect(onMessageSent).toHaveBeenCalledWith(expect.objectContaining({ from: 'agent', text: 'hi' }));

  });

  it('handles 500 server error response from POST', async () => {

    mockFetch.mockResolvedValueOnce({

      ok: false,

      status: 500,

      json: () => Promise.resolve({ message: 'Oops' }),

    });

    const { container, onError, onMessageFailed } = setup();

    const form = container.querySelector('form')!;

    const input = container.querySelector('input')!;

    fireEvent.change(input, { target: { value: 'foo' } });

    await act(async () => {

      fireEvent.submit(form);

    });

    expect(onError).toHaveBeenCalledWith('Network error. Please check your connection and try again.');

    expect(onMessageFailed).toHaveBeenCalledWith(expect.stringMatching(/^temp-/));

  });

  it('converts AbortError into network timeout error', async () => {

    // simulate fetch throwing an AbortError

    mockFetch.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }));

    const { container, onError, onMessageFailed } = setup();

    const form = container.querySelector('form')!;

    const input = container.querySelector('input')!;

    fireEvent.change(input, { target: { value: 'bar' } });

    await act(async () => {

      fireEvent.submit(form);

    });

    expect(onError).toHaveBeenCalledWith('Network error. Please check your connection and try again.');

    expect(onMessageFailed).toHaveBeenCalledWith(expect.stringMatching(/^temp-/));

  });

  it('calls handleSubmit when Enter key pressed without shift', async () => {

    const { container } = setup();

    const input = container.querySelector('input')!;

    fireEvent.change(input, { target: { value: 'enter test' } });

    // make fetch resolve so retryWithBackoff doesn't swallow

    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status:'success', data:{} }) });

    await act(async () => {

      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', shiftKey: false });

      fireEvent.keyPress(input, { key: 'Enter', charCode: 13, shiftKey: false });

    });

    expect(mockFetch).toHaveBeenCalled();

  });

  it('onRetry callback invoked when retryWithBackoff retries', async () => {

    // override retryWithBackoff to simulate a retry

    (errorHandling.retryWithBackoff as jest.Mock).mockImplementation(async (fn: any, opts: any) => {

      // first call throws, invoke onRetry then second call succeeds

      try {

        await fn();

      } catch (err) {

        opts.onRetry?.(1, err);

        // simulate success on retry

        return 'ok';

      }

      // if fn succeeded initially, still return result

      return await fn();

    });

    // configure fetch to fail first then succeed

    mockFetch

      .mockRejectedValueOnce(new Error('network'))

      .mockResolvedValueOnce({

        ok: true,

        json: () => Promise.resolve({ status: 'success', data: {} }),

      });

    const { container } = setup();

    const form = container.querySelector('form')!;

    const input = container.querySelector('input')!;

    fireEvent.change(input, { target: { value: 'retry' } });

    await act(async () => {

      fireEvent.submit(form);

    });

    expect(logError).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ attempt: 1, action: 'sendMessage' }));

  });

  it('handles generic non-ok response and surfaces error message', async () => {

    // restore retryWithBackoff to default behavior (previous test may have changed it)

    (errorHandling.retryWithBackoff as jest.Mock).mockImplementation((fn: any) => fn());

    // ensure rate limiter allows

    (rateLimiter.checkAndConsume as jest.Mock).mockReturnValue({ allowed: true });

    mockFetch.mockResolvedValueOnce({

      ok: false,

      status: 400,

      json: () => Promise.resolve({ message: 'Bad' }),

    });

    const { input, button, onError, onMessageFailed } = setup();

    fireEvent.change(input, { target: { value: 'fails' } });

    await act(async () => {

      fireEvent.click(button);

    });

    // should have attempted network

    expect(mockFetch).toHaveBeenCalled();

    // error should propagate via outer catch

    await waitFor(() => expect(onError).toHaveBeenCalledWith('Bad'));

    expect(onMessageFailed).toHaveBeenCalledWith(expect.stringMatching(/^temp-/));

  });

  it('throws when response.ok but status not success', async () => {

    // reset retry stub

    (errorHandling.retryWithBackoff as jest.Mock).mockImplementation((fn: any) => fn());

    // rate limiter allow

    (rateLimiter.checkAndConsume as jest.Mock).mockReturnValue({ allowed: true });

    // first call for POST returns non-success

    // second call for loadLatestMessages must succeed to avoid swallow

    mockFetch

      .mockResolvedValueOnce({

        ok: true,

        json: () => Promise.resolve({ status: 'error', message: 'Bad' }),

      })

      .mockResolvedValueOnce({

        ok: true,

        json: () => Promise.resolve({ status: 'success', data: { messages: [] } }),

      });

    const { input, button, onError, onMessageFailed } = setup();

    fireEvent.change(input, { target: { value: 'word' } });

    await act(async () => {

      fireEvent.click(button);

    });

    expect(mockFetch).toHaveBeenCalled();

    await waitFor(() => expect(onError).toHaveBeenCalledWith('Bad'));

    expect(onMessageFailed).toHaveBeenCalledWith(expect.stringMatching(/^temp-/));

  });

  it('handles invalid JSON from server', async () => {

    (errorHandling.retryWithBackoff as jest.Mock).mockImplementation((fn: any) => fn());

    (rateLimiter.checkAndConsume as jest.Mock).mockReturnValue({ allowed: true });

    mockFetch.mockResolvedValueOnce({

      ok: true,

      json: () => Promise.reject(new Error('parse fail')),

    });

    const { input, button, onError, onMessageFailed } = setup();

    fireEvent.change(input, { target: { value: 'parse' } });

    await act(async () => {

      fireEvent.click(button);

    });

    // should call onError with appropriate message

    await waitFor(() => expect(onError).toHaveBeenCalledWith('Received an invalid response. Please try again.'));

    expect(onMessageFailed).toHaveBeenCalledWith(expect.stringMatching(/^temp-/));

  });});