'use client';

import React from 'react';
import { withAlpha } from '../../lib/colors';

// Suggested-prompt chips shown before the first user message.
export function Suggestions({
  suggestions,
  onSelect,
  primaryColor,
  buttonBorderRadius,
  fontStyles,
  indent,
}: {
  suggestions: string[];
  onSelect: (text: string) => void;
  primaryColor: string;
  buttonBorderRadius: number;
  fontStyles: React.CSSProperties;
  indent: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" style={{ marginInlineStart: indent }}>
      {suggestions.map((text, i) => (
        <button
          key={`${i}-${text}`}
          type="button"
          onClick={() => onSelect(text)}
          className="px-3 py-1.5 text-sm border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
          style={{
            borderRadius: `${buttonBorderRadius}px`,
            borderColor: withAlpha(primaryColor, 0.4),
            backgroundColor: withAlpha(primaryColor, 0.06),
            color: primaryColor,
            ...fontStyles,
            ['--tw-ring-color' as string]: withAlpha(primaryColor, 0.5),
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = withAlpha(primaryColor, 0.14); }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = withAlpha(primaryColor, 0.06); }}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
