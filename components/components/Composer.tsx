'use client';

import React from 'react';
import { withAlpha, getReadableTextColor } from '../../lib/colors';
import { FOCUS_RING } from '../EmbedShell.constants';

// Shared message composer: auto-growing textarea with Enter-to-send /
// Shift+Enter for a newline, and a 16px font size to avoid iOS focus zoom.
export function Composer({
  input,
  setInput,
  onSubmit,
  onStop,
  isTyping,
  primaryColor,
  backgroundColor,
  subtleBorderColor,
  buttonBorderRadius,
  fontStyles,
  placeholder,
  ariaLabel,
  sendLabel,
  stopLabel,
  inputRef,
}: {
  input: string;
  setInput: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onStop?: () => void;
  isTyping: boolean;
  primaryColor: string;
  backgroundColor: string;
  subtleBorderColor: string;
  buttonBorderRadius: number;
  fontStyles: React.CSSProperties;
  placeholder: string;
  ariaLabel: string;
  sendLabel: string;
  stopLabel: string;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const autoGrow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };
  // Allow typing even while the agent is responding; only block submission.
  const canSend = !!input.trim() && !isTyping;
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSend) onSubmit(e as unknown as React.FormEvent);
    }
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSubmit(e);
      }}
      className="p-3 border-t"
      style={{ borderColor: subtleBorderColor }}
    >
      <div className="flex items-end space-x-2">
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            autoGrow(e.target);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label={ariaLabel}
          className="flex-1 resize-none overflow-y-auto px-3 py-2 border transition-shadow focus:outline-none focus-visible:ring-2"
          style={{
            maxHeight: '120px',
            borderRadius: `${buttonBorderRadius}px`,
            borderColor: subtleBorderColor,
            ['--tw-ring-color' as string]: withAlpha(primaryColor, 0.6),
            ...fontStyles,
            fontSize: '16px',
          }}
        />
        {isTyping && onStop ? (
          <button
            type="button"
            onClick={onStop}
            style={{
              backgroundColor: primaryColor,
              color: getReadableTextColor(primaryColor),
              borderRadius: `${buttonBorderRadius}px`,
              ['--tw-ring-color' as string]: primaryColor,
              ['--tw-ring-offset-color' as string]: backgroundColor,
              ...fontStyles,
            }}
            className={`shrink-0 inline-flex items-center justify-center px-4 py-2 hover:opacity-90 ${FOCUS_RING}`}
            aria-label={stopLabel}
            title={stopLabel}
          >
            <span style={{ display: 'inline-block', width: '10px', height: '10px', backgroundColor: getReadableTextColor(primaryColor), borderRadius: '2px' }} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            style={{
              backgroundColor: primaryColor,
              color: getReadableTextColor(primaryColor),
              borderRadius: `${buttonBorderRadius}px`,
              ['--tw-ring-color' as string]: primaryColor,
              ['--tw-ring-offset-color' as string]: backgroundColor,
              ...fontStyles,
            }}
            className={`shrink-0 inline-flex items-center justify-center px-4 py-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS_RING}`}
            aria-busy={isTyping}
            aria-label={sendLabel}
            title={sendLabel}
          >
            {isTyping ? (
              <span className="flex items-center gap-1" aria-hidden="true">
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-typing-dot" />
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-typing-dot" style={{ animationDelay: '0.15s' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-typing-dot" style={{ animationDelay: '0.3s' }} />
              </span>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M22 2 11 13" />
                <path d="M22 2 15 22l-4-9-9-4Z" />
              </svg>
            )}
          </button>
        )}
      </div>
    </form>
  );
}
