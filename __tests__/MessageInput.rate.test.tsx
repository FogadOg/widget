import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MessageInput from '../components/MessageInput';
import { resetLimiter } from '../lib/rateLimiter';

describe('MessageInput rate limiting', () => {
  const sessionId = 'mi-session';
  const authToken = 'token';

  beforeEach(() => {
    resetLimiter(sessionId);
    // mock fetch to always succeed for POST and GET
     
    (global as any).fetch = jest.fn().mockImplementation((url: string, opts: any) => {
      if (opts && opts.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success', data: { message_id: '1' } }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success', data: { messages: [] } }) });
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('shows error when sending too many messages quickly', async () => {
    const onMessageSent = jest.fn();
    const onError = jest.fn();
    const onTypingStart = jest.fn();
    const onTypingEnd = jest.fn();

    render(
      <MessageInput
        sessionId={sessionId}
        authToken={authToken}
        locale="en"
        onMessageSent={onMessageSent}
        onError={onError}
        onTypingStart={onTypingStart}
        onTypingEnd={onTypingEnd}
        getPageContext={() => ({})}
      />
    );

    const input = screen.getByPlaceholderText('Type your message...') as HTMLInputElement;
    const button = screen.getByRole('button', { name: /send/i });

    // Send MAX_MESSAGES quickly
    for (let i = 0; i < 5; i++) {
      fireEvent.change(input, { target: { value: `msg ${i}` } });
      fireEvent.click(button);
      // allow the microtask queue to progress
      // wait for sending to be processed
      // we don't need to await deeply since fetch is mocked to resolve
      await waitFor(() => expect(onTypingStart).toHaveBeenCalled());
      onTypingStart.mockClear();
    }

    // Next send should be rate limited
    fireEvent.change(input, { target: { value: 'last' } });
    fireEvent.click(button);

    await waitFor(() => {
      expect(onError).toHaveBeenCalled();
      const msg = onError.mock.calls[onError.mock.calls.length - 1][0] as string;
      expect(msg).toMatch(/too many messages/i);
    });
  });

  it('logs perf metric when message is sent', async () => {
    const onMessageSent = jest.fn();
    const onError = jest.fn();
    const onTypingStart = jest.fn();
    const onTypingEnd = jest.fn();

    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});

    render(
      <MessageInput
        sessionId={sessionId}
        authToken={authToken}
        locale="en"
        onMessageSent={onMessageSent}
        onError={onError}
        onTypingStart={onTypingStart}
        onTypingEnd={onTypingEnd}
        getPageContext={() => ({})}
      />
    );

    const input = screen.getByPlaceholderText('Type your message...') as HTMLInputElement;
    const button = screen.getByRole('button', { name: /send/i });

    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.click(button);

    await waitFor(() => expect(onMessageSent).toHaveBeenCalled());

    expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('messageSendTotal'), expect.anything());
    debugSpy.mockRestore();
  });
});
