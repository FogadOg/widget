import { useCallback, useState } from 'react';
import { createSupportTicket } from '../../../../lib/api';
import type { WidgetConfig } from '../../../../types/widget';

/**
 * Why the capture card appeared. It changes the wording, not the fields.
 */
export type CaptureReason = 'unanswered' | 'intent';

export type CaptureOffer = {
  reason: CaptureReason;
  /** What the ticket says: the visitor's own question, or the agent's summary of what they want. */
  question: string;
  unansweredQuestionId: string | null;
  conversationId: string | null;
  timestamp: number;
};

/**
 * Lead capture: the inline card offering to take the visitor's details when the
 * agent could not answer, or when it detected intent.
 *
 * Available on every plan, asks only what the agent was configured to ask, and
 * never blocks the conversation. Missing/unknown flags are treated as disabled.
 *
 * `captureResolved` is one-per-session and is set by BOTH submit and dismiss, so
 * a visitor who said no once is not asked again on the next unanswered question,
 * and the agent volunteering the card cannot turn into repeated asking.
 */
export function useCaptureFlow({
  widgetConfig,
  authToken,
  sessionId,
  embedHeaders,
}: {
  widgetConfig: Pick<WidgetConfig, 'lead_capture_enabled' | 'lead_capture_fields'> | null | undefined;
  authToken: string | null | undefined;
  sessionId: string | null;
  embedHeaders: Record<string, string>;
}) {
  const leadCaptureEnabled = widgetConfig?.lead_capture_enabled === true;
  const captureFields = widgetConfig?.lead_capture_fields;
  const [captureOffer, setCaptureOffer] = useState<CaptureOffer | null>(null);
  const [captureResolved, setCaptureResolved] = useState(false);

  // Deliberately does NOT catch: the capture card catches so it can show its
  // inline error state and keep the typed email, so a transient network failure
  // doesn't silently discard the lead.
  const handleCaptureSubmit = useCallback(async (values: Record<string, string>) => {
    if (!leadCaptureEnabled || !captureOffer) return;
    // `name` and `email` have their own columns server-side; everything else the
    // agent asked for travels in `fields`, where it is re-checked against that
    // agent's configuration before anything is stored.
    const { email = '', name = '', ...rest } = values;
    await createSupportTicket(
      authToken ?? '',
      {
        name,
        email,
        // What the operator needs in order to reply: the question the agent
        // couldn't answer, or its one-line summary of what the visitor wants.
        message: captureOffer.question,
        source: captureOffer.reason === 'intent' ? 'intent' : 'unanswered',
        unanswered_question_id: captureOffer.unansweredQuestionId ?? undefined,
        conversation_id: captureOffer.conversationId ?? undefined,
        session_id: sessionId ?? undefined,
        fields: Object.keys(rest).length > 0 ? rest : undefined,
      },
      embedHeaders,
    );
    // Only mark resolved after a confirmed write, so a failed attempt can be
    // retried from the same card.
    setCaptureResolved(true);
  }, [leadCaptureEnabled, captureOffer, authToken, sessionId, embedHeaders]);

  const handleCaptureDismiss = useCallback(() => {
    setCaptureOffer(null);
    setCaptureResolved(true);
  }, []);

  return {
    leadCaptureEnabled,
    captureFields,
    captureOffer,
    setCaptureOffer,
    captureResolved,
    setCaptureResolved,
    handleCaptureSubmit,
    handleCaptureDismiss,
  };
}
