import React, { useCallback } from 'react'
import { API } from '../../../../lib/api'
import { getPageContext as helpersGetPageContext } from '../helpers'
import { MessageType } from '../DocsClient.types'
import { type PromptInputMessage } from '@/components/ai-elements/prompt-input'
import { toast } from 'sonner'

interface UseMessageOperationsParams {
  sessionId: string | null;
  authToken: string | null | undefined;
  activeLocale: string;
  initialParentOrigin?: string;
  initialPreviewConfig?: string;
  embedHeaders: Record<string, string>;
  setStatus: (status: "submitted" | "streaming" | "ready" | "error") => void;
  setError: (err: string | null) => void;
  setMessages: React.Dispatch<React.SetStateAction<MessageType[]>>;
  setMessageFeedbackSubmitted: React.Dispatch<React.SetStateAction<Set<string>>>;
  setText: (text: string) => void;
  loadSessionMessages: (sessionId: string, token: string, isNewSession?: boolean) => Promise<void>;
}

export function useMessageOperations({
  sessionId,
  authToken,
  activeLocale,
  initialParentOrigin,
  initialPreviewConfig,
  embedHeaders,
  setStatus,
  setError,
  setMessages,
  setMessageFeedbackSubmitted,
  setText,
  loadSessionMessages,
}: UseMessageOperationsParams) {
  // Send message to API
  const sendMessageToAPI = useCallback(async (content: string) => {
    if (!sessionId || !authToken) {
      console.error('No sessionId or authToken available');
      return;
    }

    try {
      setStatus("streaming");
      const response = await fetch(API.sessionMessages(sessionId), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          ...embedHeaders,
        },
        body: JSON.stringify({
          content: content,
          locale: activeLocale,
          page_context: helpersGetPageContext(),
        }),
      });


      const data = await response.json();

      if (response.ok && data.status === 'success') {
        // Reload all messages from the server to get the agent's response
        await loadSessionMessages(sessionId, authToken);
      } else {
        console.error('Failed to send message:', data);
        setError(data.detail || 'Failed to send message');
        setStatus("error");
      }
    } catch (err) {
      console.error('Error sending message:', err);
      setError('Network error: Unable to send message');
      setStatus("error");
    } finally {
      setStatus("ready");
    }
  }, [sessionId, authToken, activeLocale, loadSessionMessages, initialParentOrigin]);

  // Handle message feedback submission
  const handleSubmitMessageFeedback = useCallback(async (messageId: string, feedbackType: string = 'thumbs_up') => {
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
        console.error('Failed to submit message feedback:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
      }
    } catch (error) {
      console.error('Error submitting message feedback:', error);
    }
  }, [authToken, initialParentOrigin]);

  const addUserMessage = useCallback(
    async (content: string) => {

      if (!sessionId || !authToken) {
        console.error('Cannot send message: missing sessionId or authToken', { sessionId, authToken: !!authToken });
        setError('Session not initialized. Please refresh the page.');
        return;
      }

      const userMessage: MessageType = {
        key: `user-${Date.now()}`,
        from: "user",
        versions: [
          {
            id: `user-${Date.now()}`,
            content,
          },
        ],
      };

      setMessages((prev) => [...prev, userMessage]);
      setStatus("submitted");

      await sendMessageToAPI(content);
    },
    [sendMessageToAPI, sessionId, authToken]
  );

  const handleSubmit = (message: PromptInputMessage) => {
    const hasText = Boolean(message.text);
    const hasAttachments = Boolean(message.files?.length);

    if (!(hasText || hasAttachments)) {
      return;
    }

    // Preview mode: add user message then return a dummy agent reply
    if (initialPreviewConfig) {
      const content = message.text || 'Sent with attachments';
      const ts = Date.now();
      setMessages(prev => [
        ...prev,
        { key: `user-${ts}`, from: 'user', versions: [{ id: `user-${ts}`, content }] },
      ]);
      setText('');
      setStatus('streaming');
      setTimeout(() => {
        setMessages(prev => [
          ...prev,
          {
            key: `preview-agent-${Date.now()}`,
            from: 'agent',
            versions: [{ id: `preview-agent-${Date.now()}`, content: 'This is a preview — in the live widget your AI agent will respond here.' }],
          },
        ]);
        setStatus('ready');
      }, 800);
      return;
    }

    setStatus("submitted");

    if (message.files?.length) {
      toast.success("Files attached", {
        description: `${message.files.length} file(s) attached to message`,
      });
    }

    addUserMessage(message.text || "Sent with attachments");
    setText("");
  };

  const handleSuggestionClick = (suggestion: string) => {
    // Don't set status here - let addUserMessage handle it
    addUserMessage(suggestion);
  };

  return { sendMessageToAPI, handleSubmitMessageFeedback, addUserMessage, handleSubmit, handleSuggestionClick };
}
