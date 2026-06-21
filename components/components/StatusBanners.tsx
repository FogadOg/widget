'use client';

import React from 'react';
import { STATUS_COLORS } from '../../lib/constants';

// Error / offline / session-expired banners. Shared by both render paths and
// sourced from the semantic STATUS_COLORS palette (color = meaning only).
export function StatusBanners({
  error,
  isOffline,
  sessionExpired,
  onDismissSessionExpired,
  offlineTitle,
  offlineDesc,
  sessionExpiredTitle,
  sessionExpiredBody,
  sessionExpiredDismiss,
}: {
  error?: string | null;
  isOffline?: boolean;
  sessionExpired?: boolean;
  onDismissSessionExpired?: () => void;
  offlineTitle: string;
  offlineDesc: string;
  sessionExpiredTitle: string;
  sessionExpiredBody: string;
  sessionExpiredDismiss: string;
}) {
  return (
    <>
      {error && (
        <div
          className="border-l-4 p-3 mx-3 mt-3 rounded"
          role="alert"
          style={{ backgroundColor: STATUS_COLORS.error.bg, borderColor: STATUS_COLORS.error.border, color: STATUS_COLORS.error.text }}
        >
          <p className="text-sm">{error}</p>
        </div>
      )}

      {isOffline && (
        <div role="status" aria-live="polite" className="flex items-center gap-2 mx-3 mt-3 px-3 py-2 rounded text-xs" style={{ background: STATUS_COLORS.offline.bg, border: `1px solid ${STATUS_COLORS.offline.border}`, color: STATUS_COLORS.offline.text }}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 102 0V6zm-1 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          <span><strong className="mr-1">{offlineTitle}</strong>{offlineDesc}</span>
        </div>
      )}

      {sessionExpired && (
        <div role="status" aria-live="polite" className="flex items-center justify-between gap-2 mx-3 mt-3 px-3 py-2 rounded text-xs" style={{ background: STATUS_COLORS.warning.bg, border: `1px solid ${STATUS_COLORS.warning.border}`, color: STATUS_COLORS.warning.text }}>
          <span><strong className="mr-1">{sessionExpiredTitle}</strong>{sessionExpiredBody}</span>
          {onDismissSessionExpired && (
            <button type="button" onClick={onDismissSessionExpired} aria-label={sessionExpiredDismiss} style={{ background: 'transparent', border: 'none', color: STATUS_COLORS.warning.text, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 2 }}>×</button>
          )}
        </div>
      )}
    </>
  );
}
