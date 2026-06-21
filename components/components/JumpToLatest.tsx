'use client';

import React from 'react';
import { getReadableTextColor } from '../../lib/colors';

// "Jump to latest" pill, shown when the user has scrolled up away from the bottom.
export function JumpToLatest({
  onClick,
  label,
  primaryColor,
}: {
  onClick: () => void;
  label: string;
  primaryColor: string;
}) {
  return (
    <div className="sticky bottom-1 z-10 flex justify-center pointer-events-none">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="pointer-events-auto flex items-center gap-1 rounded-full px-3 py-1.5 text-xs shadow-lg transition-opacity hover:opacity-90 animate-fade-in"
        style={{ backgroundColor: primaryColor, color: getReadableTextColor(primaryColor) }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6,9 12,15 18,9" />
        </svg>
        {label}
      </button>
    </div>
  );
}
