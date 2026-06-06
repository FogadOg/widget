import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import MessageBubble from '../components/MessageBubble';

jest.mock('../hooks/useWidgetTranslation', () => ({
  useWidgetTranslation: () => ({ locale: 'en', translations: {} }),
}));

jest.mock('../lib/i18n', () => ({
  t: (_locale: string, key: string) => key,
}));

describe('MessageBubble', () => {
  test('renders agent message with avatar, feedback buttons, and timestamp', () => {
    const message = {
      id: 'a1',
      text: 'hello',
      from: 'agent' as const,
      timestamp: Date.now(),
      sources: [{ url: 'https://example.com', title: 'Title', snippet: 'snippet text' }],
    };

    const onFeedback = jest.fn();

    render(
      <MessageBubble
        message={message}
        widgetConfig={{ bot_avatar: 'https://img' } as any}
        agentName="Bot"
        onSubmitMessageFeedback={onFeedback}
      />,
    );

    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Bot avatar' })).toBeInTheDocument();
    // Source title is no longer in a separate panel — citations are inline in text
    expect(screen.queryByRole('list', { hidden: true })).not.toBeInTheDocument();

    const up = screen.getByLabelText('feedbackPositive');
    const down = screen.getByLabelText('feedbackNegative');
    fireEvent.click(up);
    expect(onFeedback).toHaveBeenCalledWith('a1', 'thumbs_up');
    fireEvent.click(down);
    expect(onFeedback).toHaveBeenCalledWith('a1', 'thumbs_down');
  });

  test('renders agent message without sources and without feedback controls when callback is missing', () => {
    const message = {
      id: 'a-no-sources',
      text: 'agent plain text',
      from: 'agent' as const,
    };

    render(<MessageBubble message={message} showTimestamps={false} />);

    expect(screen.getByText('agent plain text')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    // only copy button should be present
    const allButtons = screen.queryAllByRole('button');
    expect(allButtons.length).toBe(1);
    expect(screen.getByLabelText('copyMessage')).toBeInTheDocument();
  });

  test('renders agent message with non-URL source and shows submitted feedback label', () => {
    const message = {
      id: 'a2',
      text: 'agent no-link source',
      from: 'agent' as const,
      sources: [{ title: 'Local Source', snippet: 'x'.repeat(120) }],
    };

    render(
      <MessageBubble
        message={message}
        messageFeedbackSubmitted={new Set(['a2'])}
        showMessageAvatars={false}
        showTimestamps={false}
      />,
    );

    expect(screen.getByText('agent no-link source')).toBeInTheDocument();
    // Source title no longer rendered in a separate panel
    expect(screen.queryByText('Local Source')).not.toBeInTheDocument();
    expect(screen.getByText(/feedbackSubmitted/i)).toBeInTheDocument();
    const allButtons2 = screen.queryAllByRole('button');
    expect(allButtons2.length).toBe(1);
    expect(screen.getByLabelText('copyMessage')).toBeInTheDocument();
  });

  test('renders agent message with mixed url/non-url sources (no bottom panel)', () => {
    const message = {
      id: 'a3',
      text: 'mixed sources',
      from: 'agent' as const,
      sources: [
        { url: 'https://example.com/no-snippet', title: 'No Snippet Source' },
        { title: 'Short Snippet Source', snippet: 'short snippet' },
      ],
    };

    const { container } = render(<MessageBubble message={message} onSubmitMessageFeedback={jest.fn()} />);

    // Source titles are not rendered in a visible panel at the bottom
    expect(screen.queryByText('No Snippet Source')).not.toBeInTheDocument();
    expect(screen.queryByText('Short Snippet Source')).not.toBeInTheDocument();
    // No sources list
    expect(container.querySelector('ul.space-y-1')).not.toBeInTheDocument();
  });

  test('renders localized safety fallback chip when policy action indicates fallback', () => {
    const message = {
      id: 'a-safety',
      text: 'safe response',
      from: 'agent' as const,
      metadata: {
        safety_policy_action: 'low_confidence_fallback',
      },
    };

    render(<MessageBubble message={message as any} showTimestamps={false} />);

    expect(screen.getByText('safetyFallback')).toBeInTheDocument();
  });

  test('renders pending user message with offline status when attempts is 0', () => {
    const message = {
      id: 'u-offline',
      text: 'queued',
      from: 'user' as const,
      pending: true,
      attempts: 0,
      timestamp: Date.now(),
    };

    render(<MessageBubble message={message as any} />);

    expect(screen.getByText('queued')).toBeInTheDocument();
    expect(screen.getByText(/offlineStatus/i)).toBeInTheDocument();
  });

  test('renders pending user message with delivering status when attempts is between 1 and 2', () => {
    const message = {
      id: 'u-delivering',
      text: 'retrying',
      from: 'user' as const,
      pending: true,
      attempts: 2,
    };

    render(<MessageBubble message={message as any} />);

    expect(screen.getByText('retrying')).toBeInTheDocument();
    expect(screen.getByText(/deliveringStatus/i)).toBeInTheDocument();
  });

  test('renders pending user message failed state and dispatches retry event', () => {
    const message = {
      id: 'u-failed',
      text: 'failed once',
      from: 'user' as const,
      pending: true,
      attempts: 3,
    };

    const dispatchSpy = jest.spyOn(window, 'dispatchEvent');

    render(<MessageBubble message={message as any} />);

    expect(screen.getByText(/failedSend/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(dispatchSpy).toHaveBeenCalled();

    dispatchSpy.mockRestore();
  });

  test('handles retry dispatch errors gracefully', () => {
    const message = {
      id: 'u-failed-catch',
      text: 'failed twice',
      from: 'user' as const,
      pending: true,
      attempts: 3,
    };

    const originalDispatch = window.dispatchEvent;
    const throwingDispatch = jest.fn(() => {
      throw new Error('dispatch failed');
    });
    Object.defineProperty(window, 'dispatchEvent', {
      configurable: true,
      value: throwingDispatch,
    });

    render(<MessageBubble message={message as any} />);
    expect(() => fireEvent.click(screen.getByRole('button', { name: /retry/i }))).not.toThrow();

    Object.defineProperty(window, 'dispatchEvent', {
      configurable: true,
      value: originalDispatch,
    });
  });

  test('renders non-pending user message', () => {
    const message = { id: 'u1', text: 'me', from: 'user' as const, timestamp: Date.now() };

    render(<MessageBubble message={message} />);

    expect(screen.getByText('me')).toBeInTheDocument();
    expect(screen.queryByText(/offlineStatus/i)).not.toBeInTheDocument();
  });
});
