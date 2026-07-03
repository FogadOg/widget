import { useState } from 'react';
import { getReadableTextColor } from '../../lib/colors';

interface HandoffTranslations {
  handoffTitle: string;
  handoffNameLabel: string;
  handoffEmailLabel: string;
  handoffMessageLabel: string;
  handoffSubmitButton: string;
  handoffSubmittingButton: string;
  handoffError: string;
  dismiss: string;
}

interface HandoffModalProps {
  lastUserMessage: string;
  translations: HandoffTranslations;
  onSubmit: (name: string, email: string, message: string) => Promise<void>;
  onDismiss: () => void;
  primaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  borderRadius?: number;
}

export function HandoffModal({ lastUserMessage, translations: tr, onSubmit, onDismiss, primaryColor = '#111827', backgroundColor = '#ffffff', textColor = '#1f2937', borderRadius = 12 }: HandoffModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState(lastUserMessage);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(name, email, message);
    } catch {
      setError(tr.handoffError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        backgroundColor,
        color: textColor,
        borderRadius,
        padding: 24,
        width: '100%',
        maxWidth: 340,
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        position: 'relative',
      }}
    >
        <button
          type="button"
          onClick={onDismiss}
          aria-label={tr.dismiss}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            background: 'none',
            border: 'none',
            fontSize: 18,
            cursor: 'pointer',
            color: textColor,
            opacity: 0.6,
          }}
        >
          ×
        </button>

        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: textColor }}>
          {tr.handoffTitle}
        </h2>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label htmlFor="handoff-name" style={{ display: 'block', fontSize: 13, marginBottom: 4, color: textColor, opacity: 0.75 }}>
              {tr.handoffNameLabel}
            </label>
            <input
              id="handoff-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: `1px solid ${textColor}33`,
                backgroundColor: 'transparent',
                color: textColor,
                borderRadius: 6,
                fontSize: 14,
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label htmlFor="handoff-email" style={{ display: 'block', fontSize: 13, marginBottom: 4, color: textColor, opacity: 0.75 }}>
              {tr.handoffEmailLabel}
            </label>
            <input
              id="handoff-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: `1px solid ${textColor}33`,
                backgroundColor: 'transparent',
                color: textColor,
                borderRadius: 6,
                fontSize: 14,
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label htmlFor="handoff-message" style={{ display: 'block', fontSize: 13, marginBottom: 4, color: textColor, opacity: 0.75 }}>
              {tr.handoffMessageLabel}
            </label>
            <textarea
              id="handoff-message"
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: `1px solid ${textColor}33`,
                backgroundColor: 'transparent',
                color: textColor,
                borderRadius: 6,
                fontSize: 14,
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {error && (
            <p style={{ color: 'var(--destructive, #dc2626)', fontSize: 13, margin: 0 }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
            padding: '10px 0',
            backgroundColor: primaryColor,
            color: getReadableTextColor(primaryColor),
            border: 'none',
            borderRadius,
            fontSize: 14,
            fontWeight: 500,
            cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.7 : 1,
          }}
          >
            {submitting ? tr.handoffSubmittingButton : tr.handoffSubmitButton}
          </button>
        </form>
    </div>
  );
}
