'use client';

import React from 'react';

// Agent typing indicator. Shared by both the embedded and inline render paths so
// the two never drift (previously one used agentBubbleBg, the other #e5e7eb).
export function TypingIndicator({
  agentBubbleBg,
  textColor,
  mutedTextColor,
  messageBubbleRadius,
  showAvatar,
  avatarSrc,
  avatarAlt,
  label,
}: {
  agentBubbleBg: string;
  textColor: string;
  mutedTextColor: string;
  messageBubbleRadius: number;
  showAvatar?: boolean;
  avatarSrc?: string;
  avatarAlt?: string;
  label: string;
}) {
  return (
    <div className="flex justify-start" role="status" aria-live="polite">
      <div className="flex items-start gap-2">
        {showAvatar && avatarSrc && (
          <img src={avatarSrc} alt={avatarAlt} className="w-8 h-8 rounded-full object-cover shrink-0" />
        )}
        <div className="px-3.5 py-3" style={{ backgroundColor: agentBubbleBg, color: textColor, borderRadius: `${messageBubbleRadius}px` }}>
          <span style={{ position: 'absolute', left: '-9999px' }}>{label}</span>
          <div className="flex gap-1 motion-reduce:hidden" aria-hidden="true">
            <span className="w-2 h-2 rounded-full animate-typing-dot" style={{ backgroundColor: mutedTextColor }} />
            <span className="w-2 h-2 rounded-full animate-typing-dot" style={{ backgroundColor: mutedTextColor, animationDelay: '0.15s' }} />
            <span className="w-2 h-2 rounded-full animate-typing-dot" style={{ backgroundColor: mutedTextColor, animationDelay: '0.3s' }} />
          </div>
          <span className="hidden motion-reduce:inline text-sm" style={{ color: mutedTextColor }}>…</span>
        </div>
      </div>
    </div>
  );
}
