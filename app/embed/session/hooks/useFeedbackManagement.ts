import { useEffect, useState } from 'react';
import { logError } from '../../../../lib/errorHandling';
import { trackEvent } from '../../../../lib/api';
import { API } from '../../../../lib/api';
import { STORAGE_KEYS } from '../../../../lib/embedConstants';
import type { Message } from '../../../../types/widget';

export function useFeedbackManagement({
  sessionId,
  authToken,
  messages,
  initialAgentId,
  initialClientId,
  embedHeaders,
  showFeedbackDialogOverride,
}: {
  sessionId: string | null;
  authToken: string | null | undefined;
  messages: Message[];
  initialAgentId: string;
  initialClientId: string;
  embedHeaders: Record<string, string>;
  showFeedbackDialogOverride?: boolean;
}) {
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [messageFeedbackSubmitted, setMessageFeedbackSubmitted] = useState<Set<string>>(new Set());

  const checkFeedbackStatus = async (sessionId: string, token: string) => {
    try {
      const response = await fetch(API.sessionFeedback(sessionId), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          ...embedHeaders,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success' && data.data.has_feedback) {
          setFeedbackSubmitted(true);
        }
      }
    } catch (error) {
      logError(error, { action: 'checkFeedbackStatus', sessionId });
    }
  };

  // Detect conversation end (inactivity) and show feedback dialog
  useEffect(() => {
    if (!sessionId || !authToken || feedbackSubmitted || showFeedbackDialog) return;
    if (messages.length === 0) return;

    // Set a timer to show feedback dialog after 30 seconds of inactivity
    const inactivityTimer = setTimeout(() => {
      if (!feedbackSubmitted && messages.length > 0) {
        setShowFeedbackDialog(true);
      }
    }, 30000); // 30 seconds

    return () => clearTimeout(inactivityTimer);
  }, [messages, sessionId, authToken, feedbackSubmitted, showFeedbackDialog]);

  const handleFeedbackSubmit = (rating: string, comment: string) => {
    // telemetry for feedback given includes rating/comment metadata
    trackEvent(
      'feedback_given',
      initialAgentId,
      { rating, comment },
      initialClientId,
      undefined,
      embedHeaders,
    ).catch(() => {});
    setFeedbackSubmitted(true);
    setShowFeedbackDialog(false);
    // Store feedback submitted flag in localStorage
    if (sessionId) {
      localStorage.setItem(STORAGE_KEYS.feedbackKey(sessionId), 'true');
    }
  };

  const handleFeedbackSkip = () => {
    setShowFeedbackDialog(false);
    setFeedbackSubmitted(true); // Don't show again this session
    if (sessionId) {
      localStorage.setItem(STORAGE_KEYS.feedbackKey(sessionId), 'skipped');
    }
  };

  const handleSubmitMessageFeedback = async (messageId: string, feedbackType: string = 'incorrect') => {
    if (!authToken) return;

    try {
      const response = await fetch(API.messageFeedback(messageId), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          ...embedHeaders,
        },
        body: JSON.stringify({
          feedback_type: feedbackType,
        }),
      });

      if (response.ok) {
        setMessageFeedbackSubmitted((prev) => new Set(prev).add(messageId));
        // Show success toast if available
      } else {
        const errorText = await response.text();
        logError(new Error('Failed to submit message feedback'), {
          action: 'handleSubmitMessageFeedback',
          messageId,
          status: response.status,
          statusText: response.statusText,
          body: errorText,
        });
      }
    } catch (error) {
      logError(error, { action: 'handleSubmitMessageFeedback', messageId });
    }
  };

  return {
    showFeedbackDialog,
    setShowFeedbackDialog,
    feedbackSubmitted,
    setFeedbackSubmitted,
    messageFeedbackSubmitted,
    checkFeedbackStatus,
    handleFeedbackSubmit,
    handleFeedbackSkip,
    handleSubmitMessageFeedback,
  };
}
