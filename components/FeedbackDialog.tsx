'use client';


import React, { useState } from 'react';
import { useWidgetTranslation } from '../hooks/useWidgetTranslation';
import { t as translate } from '../lib/i18n';
import DynamicIcon from './DynamicIcon';
import { API, embedOriginHeader } from '../lib/api';
import { logError } from '../lib/errorHandling';
import { getReadableTextColor } from '../lib/colors';

type FeedbackRating = 'positive' | 'neutral' | 'negative';

interface FeedbackDialogProps {
  sessionId: string | null;
  authToken: string | null;
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  borderRadius: number;
  // new: submit callback receives rating and comment for telemetry
  onSubmit: (rating: FeedbackRating, comment: string) => void;
  onSkip: () => void;
}

export default function FeedbackDialog({
  sessionId,
  authToken,
  primaryColor,
  backgroundColor,
  textColor,
  borderRadius,
  onSubmit,
  onSkip,
}: FeedbackDialogProps) {
  const { locale } = useWidgetTranslation();
  const [selectedRating, setSelectedRating] = useState<FeedbackRating | null>(null);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!selectedRating) return;

    if (!sessionId) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(API.sessionFeedback(sessionId), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          ...embedOriginHeader(),
        },
        body: JSON.stringify({
          rating: selectedRating,
          comment: comment.trim(),
        }),
      });

      let data: unknown = {};
      if (response && response.headers?.get && response.headers.get('content-type')?.includes('application/json')) {
        try {
          data = await response.json();
        } catch (_err) {
          // ignore parsing errors
        }
      }

      if (response && response.ok) {
        setSubmitted(true);
        setTimeout(() => {
          onSubmit(selectedRating as FeedbackRating, comment.trim());
        }, 2000);
      } else {
        logError(new Error('Failed to submit feedback'), {
          action: 'feedbackDialogSubmit',
          status: response?.status,
          data,
        });
        // still call with current values so telemetry can record attempt
        onSubmit(selectedRating as FeedbackRating, comment.trim());
      }
    } catch (error) {
      logError(error, { action: 'feedbackDialogSubmit' });
      // Ensure we call the submit callback with the same contract
      onSubmit(selectedRating as FeedbackRating, comment.trim());
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div
        className="p-6 text-center animate-fade-in"
        style={{
          backgroundColor: backgroundColor,
          borderRadius: `${borderRadius}px`,
          color: textColor,
        }}
      >
        <div
          className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
          style={{ backgroundColor: `${primaryColor}20` }}
        >
          <DynamicIcon name="ThumbsUp" className="w-8 h-8" fallback={<svg />} />
        </div>
        <h3 className="text-lg font-semibold mb-2">{translate(locale, 'thankYouFeedback')}</h3>
        <p className="text-sm opacity-70">{translate(locale, 'feedbackSubmitted')}</p>
      </div>
    );
  }

  return (
    <div
      className="p-6 relative"
      style={{
        backgroundColor: backgroundColor,
        borderRadius: `${borderRadius}px`,
        color: textColor,
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-dialog-title"
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onSkip}
        className="absolute top-4 right-4 p-1 rounded-full hover:opacity-70 transition-opacity"
        style={{ color: textColor }}
        aria-label={translate(locale, 'closeFeedback')}
      >
        <DynamicIcon name="X" className="w-5 h-5" fallback={<span /> } />
      </button>

      {/* Title */}
      <h3 id="feedback-dialog-title" className="text-lg font-semibold mb-6 pr-8">{translate(locale, 'rateConversation')}</h3>

      {/* Rating buttons */}
      <div className="flex justify-center gap-4 mb-6">
        <button
          type="button"
          onClick={() => setSelectedRating('positive')}
          className={`flex flex-col items-center gap-2 p-4 rounded-lg transition-all ${
            selectedRating === 'positive' ? 'ring-2' : 'hover:opacity-80'
          }`}
          style={{
            backgroundColor: selectedRating === 'positive' ? `${primaryColor}20` : `${primaryColor}10`,
            borderColor: primaryColor,
            color: textColor,
          }}
          aria-pressed={selectedRating === 'positive'}
        >
          <DynamicIcon name="ThumbsUp" className="w-8 h-8" fallback={<span />} />
          <span className="text-sm font-medium">{translate(locale, 'feedbackPositive')}</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedRating('neutral')}
          className={`flex flex-col items-center gap-2 p-4 rounded-lg transition-all ${
            selectedRating === 'neutral' ? 'ring-2' : 'hover:opacity-80'
          }`}
          style={{
            backgroundColor: selectedRating === 'neutral' ? `${primaryColor}20` : `${primaryColor}10`,
            borderColor: primaryColor,
            color: textColor,
          }}
          aria-pressed={selectedRating === 'neutral'}
        >
          <DynamicIcon name="Minus" className="w-8 h-8" fallback={<span />} />
          <span className="text-sm font-medium">{translate(locale, 'feedbackNeutral')}</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedRating('negative')}
          className={`flex flex-col items-center gap-2 p-4 rounded-lg transition-all ${
            selectedRating === 'negative' ? 'ring-2' : 'hover:opacity-80'
          }`}
          style={{
            backgroundColor: selectedRating === 'negative' ? `${primaryColor}20` : `${primaryColor}10`,
            borderColor: primaryColor,
            color: textColor,
          }}
          aria-pressed={selectedRating === 'negative'}
        >
          <DynamicIcon name="ThumbsDown" className="w-8 h-8" fallback={<span />} />
          <span className="text-sm font-medium">{translate(locale, 'feedbackNegative')}</span>
        </button>
      </div>

      {/* Comment textarea */}
      {selectedRating && (
        <div className="mb-6 animate-fade-in">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={translate(locale, 'feedbackCommentPlaceholder')}
            aria-label={translate(locale, 'feedbackCommentPlaceholder')}
            className="w-full p-3 rounded-lg border resize-none focus:outline-none focus:ring-2"
            style={{
              backgroundColor: `${primaryColor}05`,
              borderColor: `${primaryColor}30`,
              color: textColor,
            }}
            rows={3}
          />
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onSkip}
          className="flex-1 py-2 px-4 rounded-lg font-medium transition-opacity hover:opacity-80"
          style={{
            backgroundColor: `${primaryColor}10`,
            color: textColor,
          }}
        >
          {translate(locale, 'skipFeedback')}
        </button>
        <button
          onClick={handleSubmit}
          disabled={!selectedRating || isSubmitting}
          className="flex-1 py-2 px-4 rounded-lg font-medium transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: primaryColor,
            // Contrast-aware text against the brand color. (#10)
            color: getReadableTextColor(primaryColor),
          }}
        >
          {isSubmitting ? '...' : translate(locale, 'submitFeedback')}
        </button>
      </div>
    </div>
  );
}
