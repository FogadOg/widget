'use client'

import { t as translate } from '../../../../lib/i18n'

interface MessageFeedbackButtonsProps {
  messageKey: string;
  messageFeedbackSubmitted: Set<string>;
  handleSubmitMessageFeedback: (messageId: string, feedbackType: string) => void;
  activeLocale: string;
  feedbackThumbsUp: string;
  feedbackThumbsDown: string;
  feedbackSubmittedMessage: string;
}

export function MessageFeedbackButtons({
  messageKey,
  messageFeedbackSubmitted,
  handleSubmitMessageFeedback,
  activeLocale,
  feedbackThumbsUp,
  feedbackThumbsDown,
  feedbackSubmittedMessage,
}: MessageFeedbackButtonsProps) {
  if (messageFeedbackSubmitted.has(messageKey)) {
    return (
      <div className="mt-2 text-xs opacity-50">
        {feedbackSubmittedMessage}
      </div>
    );
  }

  return (
    <div className="mt-2 flex gap-2">
      <button
        type="button"
        onClick={() => handleSubmitMessageFeedback(messageKey, 'thumbs_up')}
        className="text-xs opacity-50 hover:opacity-100 transition-opacity flex items-center gap-1"
        title={feedbackThumbsUp}
        aria-label={translate(activeLocale, 'feedbackPositive')}
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => handleSubmitMessageFeedback(messageKey, 'thumbs_down')}
        className="text-xs opacity-50 hover:opacity-100 transition-opacity flex items-center gap-1"
        title={feedbackThumbsDown}
        aria-label={translate(activeLocale, 'feedbackNegative')}
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.737 3h4.017c.163 0 .326.02.485.06L17 4m-7 10v5a2 2 0 002 2h.095c.5 0 .905-.405.905-.905 0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m6-10h-2" />
        </svg>
      </button>
    </div>
  );
}
