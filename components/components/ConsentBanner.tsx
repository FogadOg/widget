'use client';

import React from 'react';
import { STATUS_COLORS } from '../../lib/constants';

// In-widget storage-consent notice (data-consent-required). Follows the
// StatusBanners pattern: semantic STATUS_COLORS palette, role="status", inline
// styles (the widget renders in an isolated iframe — no shared stylesheet).
// Chat works fully before a choice is made; accepting only enables persistence.
export function ConsentBanner({
  title,
  body,
  acceptLabel,
  declineLabel,
  onAccept,
  onDecline,
}: {
  title: string;
  body: string;
  acceptLabel: string;
  declineLabel: string;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const palette = STATUS_COLORS.offline; // informational blue, not a warning
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-3 mt-3 px-3 py-2 rounded text-xs"
      style={{ background: palette.bg, border: `1px solid ${palette.border}`, color: palette.text }}
    >
      <p className="m-0"><strong className="mr-1">{title}</strong>{body}</p>
      <div className="flex gap-2 mt-2">
        <button
          type="button"
          onClick={onAccept}
          className="px-2.5 py-1 rounded text-xs font-medium cursor-pointer"
          style={{ background: palette.text, color: palette.bg, border: `1px solid ${palette.text}` }}
        >
          {acceptLabel}
        </button>
        <button
          type="button"
          onClick={onDecline}
          className="px-2.5 py-1 rounded text-xs font-medium cursor-pointer"
          style={{ background: 'transparent', color: palette.text, border: `1px solid ${palette.border}` }}
        >
          {declineLabel}
        </button>
      </div>
    </div>
  );
}
