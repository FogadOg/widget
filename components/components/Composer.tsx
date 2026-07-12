'use client';

import React from 'react';
import { withAlpha, getReadableTextColor } from '../../lib/colors';
import { FOCUS_RING } from '../EmbedShell.constants';

// Shared message composer: auto-growing textarea with Enter-to-send /
// Shift+Enter for a newline, and a 16px font size to avoid iOS focus zoom.
type ComposerAttachment = { id: string; filename: string };

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
  fileUploadEnabled = false,
  pendingAttachments = [],
  uploadingFiles = 0,
  onPickFiles,
  onRemoveAttachment,
  attachLabel = 'Attach file',
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
  fileUploadEnabled?: boolean;
  pendingAttachments?: ComposerAttachment[];
  uploadingFiles?: number;
  onPickFiles?: (files: FileList) => void;
  onRemoveAttachment?: (id: string) => void;
  attachLabel?: string;
}) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
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
      {fileUploadEnabled && (pendingAttachments.length > 0 || uploadingFiles > 0) && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {pendingAttachments.map((att) => (
            <span
              key={att.id}
              className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs"
              style={{ borderColor: subtleBorderColor, ...fontStyles }}
            >
              <span className="truncate max-w-[140px]">📎 {att.filename}</span>
              {onRemoveAttachment && (
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(att.id)}
                  aria-label={`Remove ${att.filename}`}
                  className="opacity-60 hover:opacity-100"
                >
                  ×
                </button>
              )}
            </span>
          ))}
          {uploadingFiles > 0 && (
            <span className="inline-flex items-center gap-1 text-xs opacity-70" style={fontStyles}>
              <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden="true" />
            </span>
          )}
        </div>
      )}
      <div className="flex items-end space-x-2">
        {fileUploadEnabled && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0 && onPickFiles) {
                  onPickFiles(e.target.files);
                }
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label={attachLabel}
              title={attachLabel}
              className={`shrink-0 inline-flex items-center justify-center px-2.5 py-2 border hover:opacity-90 ${FOCUS_RING}`}
              style={{
                borderColor: subtleBorderColor,
                borderRadius: `${buttonBorderRadius}px`,
                color: 'inherit',
                ['--tw-ring-color' as string]: withAlpha(primaryColor, 0.6),
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
          </>
        )}
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
