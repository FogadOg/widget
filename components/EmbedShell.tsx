
'use client';

import React, { useRef, useEffect, useLayoutEffect, useState, useMemo, useCallback, memo } from 'react';
import InteractionButtons from './InteractionButtons';
import MessageBubble from './MessageBubble';
import DynamicIcon from './DynamicIcon';
import { useWidgetTranslation } from '../hooks/useWidgetTranslation';
import { t as translate } from '../lib/i18n';
import type {
  Message,
  WidgetConfig,
  FlowButton,
  FlowResponse,
  UnsureMessage,
} from '../types/widget';
import { useClickedButtons, ButtonLike } from '../hooks/useClickedButtons';
import { useWidgetStyles } from '../hooks/useWidgetStyles';
import { hexToRgb, getReadableTextColor, withAlpha } from '../lib/colors';
import { COMPANY_NAME, STATUS_COLORS } from '../lib/constants';

const FOCUSABLE = 'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Shared visible focus affordance (DESIGN_STANDARD §6: every interactive element
// gets a focus-visible ring). Ring/offset colors are supplied inline per-surface
// via --tw-ring-color / --tw-ring-offset-color so they contrast with the
// customer's brand colors instead of a fixed token.
const FOCUS_RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

const FocusTrap = memo(function FocusTrap({ children, onEscape }: { children: React.ReactNode; onEscape?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const savedFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    savedFocus.current = document.activeElement as HTMLElement;
    const el = ref.current;
    if (!el) return;
    (el.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onEscape?.(); return; }
      if (e.key !== 'Tab') return;
      const focusable = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };
    el.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('keydown', onKey);
      savedFocus.current?.focus();
    };
  }, [onEscape]);
  return <div ref={ref}>{children}</div>;
});

type Props = {
  isEmbedded: boolean;
  isCollapsed: boolean;
  toggleCollapsed: () => void;
  messages: Message[];
  isTyping: boolean;
  /** Partial agent text while a response streams in (null when idle). */
  streamingMessage?: string | null;
  input: string;
  setInput: (v: string) => void;
  handleSubmit: (e: React.FormEvent, messageText?: string, skipAddingUserMessage?: boolean) => void;
  onStopStreaming?: () => void;
  onCloseUnsureModal?: () => void;
  onDismissHandoff?: () => void;
  error?: string | null;
  title?: string;
  agentName?: string;
  widgetConfig?: WidgetConfig;
  onInteractionButtonClick?: (button: ButtonLike) => void | Promise<void>;
  onFollowUpButtonClick?: (button: ButtonLike) => void | Promise<void>;
  flowResponses?: FlowResponse[];
  getLocalizedText?: (textObj: Record<string, string> | undefined) => string;
  showFeedbackDialog?: boolean;
  feedbackDialog?: React.ReactNode;
  messageFeedbackSubmitted?: Set<string>;
  onSubmitMessageFeedback?: (messageId: string, feedbackType?: string) => void;
  unsureModal?: React.ReactNode;
  handoffModal?: React.ReactNode;
  unsureMessages?: UnsureMessage[];
  onShowUnsureModal?: () => void;
  unreadCount?: number;
  /** Locale passed directly from the parent (server-provided). Takes priority over hook detection. */
  locale?: string;
  hideCloseButton?: boolean;
  isPersistent?: boolean;
  sessionExpiredBanner?: boolean;
  onDismissSessionExpiredBanner?: () => void;
  isOffline?: boolean;
  /** When true, anchors the widget to bottom-right (preview iframe). Default centers within the loader's small iframe. */
  previewPositioning?: boolean;
};


// Simple chat skeleton loader. Skeleton color is derived from the configured
// text color so it stays visible on dark/branded backgrounds.
function ChatSkeleton({ skeletonColor }: { skeletonColor: string }) {
  return (
    <div className="flex flex-col gap-4 p-4 animate-pulse">
      {[...Array(4)].map((_, i) => (
        <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
          <div className="h-6 w-2/3 rounded-lg" style={{ minWidth: 120, backgroundColor: skeletonColor }} />
        </div>
      ))}
    </div>
  );
}

// Suggested-prompt chips shown before the first user message.
function Suggestions({
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

// Agent typing indicator. Shared by both the embedded and inline render paths so
// the two never drift (previously one used agentBubbleBg, the other #e5e7eb).
function TypingIndicator({
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

// Error / offline / session-expired banners. Shared by both render paths and
// sourced from the semantic STATUS_COLORS palette (color = meaning only).
function StatusBanners({
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

// "Jump to latest" pill, shown when the user has scrolled up away from the bottom.
function JumpToLatest({
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

// Shared message composer: auto-growing textarea with Enter-to-send /
// Shift+Enter for a newline, and a 16px font size to avoid iOS focus zoom.
function Composer({
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

export default function EmbedShell({
  isEmbedded,
  isCollapsed,
  toggleCollapsed,
  messages,
  isTyping,
  onStopStreaming,
  streamingMessage = null,
  input,
  setInput,
  handleSubmit,
  error,
  title,
  agentName,
  widgetConfig,
  onInteractionButtonClick,
  onFollowUpButtonClick,
  flowResponses = [],
  getLocalizedText,
  showFeedbackDialog = false,
  feedbackDialog,
  messageFeedbackSubmitted,
  onSubmitMessageFeedback,
  unsureModal,
  handoffModal,
  unsureMessages = [],
  onShowUnsureModal,
  onCloseUnsureModal,
  onDismissHandoff,
  unreadCount = 0,
  hideCloseButton = false,
  isPersistent = false,
  locale: localeProp,
  sessionExpiredBanner = false,
  onDismissSessionExpiredBanner,
  isOffline = false,
  previewPositioning = false,
}: Props) {
  const { translations: t, locale: hookLocale } = useWidgetTranslation();
  const locale = localeProp || hookLocale;
  const [liveMessage, setLiveMessage] = useState('');
  const lastAnnouncedId = useRef<string | null>(null);
  const messageFeedbackSet = useMemo(
    () => messageFeedbackSubmitted ?? new Set<string>(),
    [messageFeedbackSubmitted]
  );

  // track which buttons have been clicked
  const { clickedButtons, handleClick: onButtonClickInternal, getButtonId } = useClickedButtons();

  // Ref for scroll container
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Ref for input (for focus management)
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Ref for the collapsed launcher button, so focus returns to it on close. (#15)
  const launcherRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

  // "Jump to latest" affordance: shown when the user has scrolled up so new
  // messages don't yank them back to the bottom mid-read.
  const [showJumpButton, setShowJumpButton] = useState(false);

  // Robust Escape-to-close and modal Escape handling
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Close the topmost open modal, then fall through to collapsing the widget
        if (unsureModal && onCloseUnsureModal) {
          onCloseUnsureModal();
          e.stopPropagation();
          return;
        }
        if (handoffModal && onDismissHandoff) {
          onDismissHandoff();
          e.stopPropagation();
          return;
        }
        if (showFeedbackDialog && feedbackDialog) {
          e.stopPropagation();
          return;
        }
        // If widget is open and not collapsed, minimize/close
        if (!isCollapsed && !hideCloseButton) {
          toggleCollapsed();
          e.stopPropagation();
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, [isCollapsed, hideCloseButton, toggleCollapsed, unsureModal, onCloseUnsureModal, handoffModal, onDismissHandoff, showFeedbackDialog, feedbackDialog]);

  // Helper: should auto-scroll if user is at or near bottom
  const shouldAutoScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    const threshold = 64; // px from bottom
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  };

  // Auto-scroll to bottom only if user is at/near bottom; otherwise surface the
  // "jump to latest" pill so the user knows new content arrived.
  // useLayoutEffect reads DOM scroll position synchronously after paint.
  // The setState calls here gate on DOM measurements unavailable at render time,
  // so there is no way to avoid them in the effect body.
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (shouldAutoScroll()) {
      el.scrollTop = el.scrollHeight;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowJumpButton(false);
    } else {
      setShowJumpButton(true);
    }
  }, [messages, flowResponses, isTyping, streamingMessage]);

  const handleScroll = useCallback(() => {
    setShowJumpButton(!shouldAutoScroll());
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setShowJumpButton(false);
  }, []);

  // Move focus into the composer when the widget opens, and after each send,
  // so keyboard and screen-reader users aren't stranded on the host page.
  useEffect(() => {
    if (!isCollapsed) {
      wasOpenRef.current = true;
      const id = window.setTimeout(() => inputRef.current?.focus(), 60);
      return () => window.clearTimeout(id);
    }
    // Widget just closed (open → collapsed): return focus to the launcher so
    // keyboard users aren't dropped to the top of the host page. Skip on the
    // initial mount (was never open) so we don't steal focus on page load. (#15)
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      const id = window.setTimeout(() => launcherRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [isCollapsed]);

  const handleFormSubmit = useCallback(
    (e: React.FormEvent, messageText?: string) => {
      handleSubmit(e, messageText);
      // Keep focus in the composer after sending (textarea is not unmounted).
      window.setTimeout(() => inputRef.current?.focus(), 0);
    },
    [handleSubmit]
  );

  // Skeleton loading state for chat
  const [showSkeleton, setShowSkeleton] = useState(
    messages.length === 0 && flowResponses.length === 0 && !widgetConfig?.greeting_message?.text
  );
  useEffect(() => {
    const t = setTimeout(() => setShowSkeleton(false), 1000);
    return () => clearTimeout(t);
  }, []);

  // Mobile input anchoring: add bottom padding for safe-area-inset
  const mobileSafeAreaStyle = {
    paddingBottom: 'env(safe-area-inset-bottom, 0px)'
  };

  useEffect(() => {
    const latestAgent = [...messages]
      .reverse()
      .find((msg) => msg.from === 'agent' && !msg.id.startsWith('greeting-'));
    if (latestAgent && latestAgent.id !== lastAnnouncedId.current) {
      lastAnnouncedId.current = latestAgent.id;
      const timeoutId = window.setTimeout(() => {
        setLiveMessage(
          translate(locale, 'newMessageAnnouncement', {
            vars: { message: latestAgent.text },
          })
        );
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }
  }, [messages, locale]);

  // compute colours, sizes and flags from config using a memoized hook
  const {
    primaryColor,
    secondaryColor,
    backgroundColor,
    textColor,
    readableOnPrimary,
    mutedTextColor,
    subtleBorderColor,
    skeletonColor,
    agentBubbleBg,
    borderRadius,
    fontStyles,
    getButtonSizeClasses,
    widgetWidth,
    widgetHeight,
    messageBubbleRadius,
    buttonBorderRadius,
    backgroundOpacity,
    showTimestamps,
    showTypingIndicator,
    showMessageAvatars,
    showUnreadBadge,
  } = useWidgetStyles(widgetConfig);

  const { width: btnWidth, height: btnHeight, icon: btnIcon } = getButtonSizeClasses;

  // Readable text color for the header which uses primaryColor as background.
  // Prevents white-on-light unreadable headers when a customer picks a light brand color.
  const headerTextColor = getReadableTextColor(primaryColor);




  // Get localized text helper
  const getText = (textObj: Record<string, string> | string | undefined) => {
    if (getLocalizedText) return getLocalizedText(textObj as Record<string, string>);
    if (typeof textObj === 'string') return textObj;
    return textObj?.en || '';
  };

  // wrappers that mark buttons clicked and forward the event
  const handleInteractionButtonClickWrapper = (button: ButtonLike) => {
    onButtonClickInternal(button, onInteractionButtonClick);
  };

  const handleFollowUpButtonClickWrapper = (button: ButtonLike) => {
    onButtonClickInternal(button, onFollowUpButtonClick);
  };

  // Hide the static greeting section (and buttons) once any messages exist or a flow has fired.
  const hasGreetingMessage = messages.length > 0 || (flowResponses?.length ?? 0) > 0;
  const showGreeting = widgetConfig?.greeting_message && !hasGreetingMessage;
  const greetingText = showGreeting ? getText(widgetConfig.greeting_message.text) : '';
  // Only show interaction buttons whose `languages` whitelist includes the
  // current locale (legacy buttons with no `languages` field are visible in
  // all locales). The admin manages this per editing-language.
  const isVisibleInLocale = (item: { languages?: string[] } | null | undefined) => {
    if (!item) return false;
    const langs = item.languages;
    if (!langs || langs.length === 0) return true;
    // Match full locale ('nb-NO') or base language code ('nb')
    const baseLocale = locale.split('-')[0];
    return langs.includes(locale) || langs.includes(baseLocale);
  };
  const interactionButtons = (widgetConfig?.greeting_message?.buttons || []).filter(isVisibleInLocale);
  // Always show interaction buttons when configured — clicked buttons are disabled
  // individually via clickedButtons, not by hiding the whole group.
  const showButtons = interactionButtons.length > 0;

  // Suggested prompts (conversation starters). Config may provide a flat list
  // or a per-locale map; fall back to English. Only shown before the visitor's
  // first message so they have an idea of what to ask.
  const rawSuggestions = widgetConfig?.suggestions;
  const suggestionList: string[] = Array.isArray(rawSuggestions)
    ? rawSuggestions
    : rawSuggestions
      ? rawSuggestions[locale] || rawSuggestions[locale.split('-')[0]] || rawSuggestions.en || []
      : [];
  const hasUserMessage = messages.some((m) => m.from === 'user');
  const showSuggestions = suggestionList.length > 0 && !hasUserMessage && !isTyping;
  const handleSuggestionClick = (text: string) => {
    handleFormSubmit({ preventDefault: () => {} } as React.FormEvent, text);
  };

  // Merge messages and flow responses, then sort by timestamp
  const mergedContent = [
    ...messages.map(msg => ({ type: 'message' as const, data: msg, timestamp: msg.timestamp || 0 })),
    ...flowResponses.map(flow => ({ type: 'flow' as const, data: flow, timestamp: flow.timestamp || 0 }))
  ].sort((a, b) => a.timestamp - b.timestamp);

  const openChatLabel = unreadCount > 0
    ? `${translate(locale, 'chatControl', { context: 'open' })}. ${translate(locale, 'unreadMessages', { count: unreadCount, vars: { count: unreadCount } })}`
    : translate(locale, 'chatControl', { context: 'open' });
  const closeChatLabel = translate(locale, 'chatControl', { context: 'close' });
  const minimizeChatLabel = translate(locale, 'chatControl', { context: 'minimize' });
  const poweredByLabel = typeof t?.poweredBy === 'string' ? t.poweredBy : '';
  const jumpToLatestLabel = translate(locale, 'jumpToLatest');
  const placeholderText = (getText(widgetConfig?.placeholder) || t.typeYourMessage || translate(locale, 'typeYourMessage')) as unknown as string;
  const composerAriaLabel = (t.typeYourMessageLabel || translate(locale, 'typeYourMessageLabel')) as unknown as string;
  const sendLabel = translate(locale, 'send');
  const stopLabel = translate(locale, 'stopStreaming');
  const agentTypingLabel = translate(locale, 'agentTyping');
  const botAvatarSrc = widgetConfig?.bot_avatar;
  const botAvatarAlt = (agentName || getText(widgetConfig?.title) || 'agent') + ' avatar';
  const bannerLabels = {
    offlineTitle: translate(locale, 'offlineBannerTitle'),
    offlineDesc: translate(locale, 'offlineBannerDesc'),
    sessionExpiredTitle: translate(locale, 'sessionExpiredTitle'),
    sessionExpiredBody: translate(locale, 'sessionExpiredBody'),
    sessionExpiredDismiss: translate(locale, 'sessionExpiredDismiss'),
  };

  return (
    <>
      <div
        aria-live="polite"
        aria-atomic="true"
        style={{ position: 'absolute', left: '-9999px', height: '1px', width: '1px', overflow: 'hidden' }}
      >
        {liveMessage}
      </div>
      {isEmbedded ? (
        <>
          {isCollapsed ? (
            <button
              ref={launcherRef}
              type="button"
              onClick={toggleCollapsed}
              aria-label={openChatLabel}
              aria-expanded={!isCollapsed}
              aria-haspopup="dialog"
              style={{
                position: 'fixed',
                ...(previewPositioning
                  ? { bottom: '20px', right: '20px' }
                  : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }),
                zIndex: 999999,
                backgroundColor: primaryColor,
                color: readableOnPrimary,
                borderRadius: '9999px',
                ['--tw-ring-color' as string]: primaryColor,
                ['--tw-ring-offset-color' as string]: 'transparent',
                ...fontStyles
              }}
              className={`${btnWidth} ${btnHeight} shadow-lg hover:shadow-xl flex items-center justify-center transition-all duration-200 hover:scale-105 hover:opacity-90 relative ${FOCUS_RING}`}
              title={translate(locale, 'chatControl', { context: 'open' })}
            >
                {widgetConfig?.bot_avatar ? (
                  <img src={widgetConfig.bot_avatar} alt={(agentName || getText(widgetConfig?.title) || 'agent') + ' avatar'} className={`${btnIcon} rounded-full object-cover`} />
                ) : widgetConfig?.logo ? (
                  <img src={widgetConfig.logo} alt={(getText(widgetConfig?.title) || title || 'logo') + ' logo'} className={`${btnIcon} object-contain`} />
                ) : (
                  <svg className={btnIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z" />
                  </svg>
                )}
                {showUnreadBadge && unreadCount > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-4px',
                      right: '-4px',
                      backgroundColor: STATUS_COLORS.danger,
                      color: 'white',
                      borderRadius: '50%',
                      width: unreadCount > 9 ? '24px' : '20px',
                      height: unreadCount > 9 ? '24px' : '20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: unreadCount > 9 ? '11px' : '12px',
                      fontWeight: 'bold',
                      border: '2px solid white',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                    }}
                    className="animate-pulse"
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
            </button>
          ) : (
            <div
              style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                ...(previewPositioning
                  ? { width: `${widgetWidth}px`, height: `${widgetHeight}px` }
                  : { width: '100%', height: '100%', maxWidth: `${widgetWidth}px`, maxHeight: `${widgetHeight}px` }),
                zIndex: 999999,
                boxShadow: 'rgba(0, 0, 0, 0.2) 0px 10px 40px',
                borderRadius: `${borderRadius}px`,
                overflow: 'hidden',
                backgroundColor: 'transparent',
                transition: '0.3s',
                boxSizing: 'border-box'
              }}
            >
              <div
                className="h-full flex flex-col"
                style={{
                  backgroundColor: `rgba(${hexToRgb(backgroundColor)}, ${backgroundOpacity})`,
                  ...fontStyles
                }}
              >
              <div className="p-3 flex items-center justify-between" style={{ backgroundColor: primaryColor, color: headerTextColor }}>
                <div className="flex items-center gap-3">
                  {widgetConfig?.logo && (
                    <img src={widgetConfig.logo} alt={(getText(widgetConfig?.title) || title || 'logo') + ' logo'} className="w-10 h-10 object-contain rounded" />
                  )}
                  <div className="flex flex-col">
                    <h3 className="font-semibold">{getText(widgetConfig?.title) || title || translate(locale, 'chat')}</h3>
                    <p className="text-sm opacity-80">{getText(widgetConfig?.subtitle)}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {unsureMessages.length > 0 && onShowUnsureModal && (
                    <button
                      type="button"
                      onClick={onShowUnsureModal}
                      style={{ backgroundColor: secondaryColor, ['--tw-ring-color' as string]: headerTextColor, ['--tw-ring-offset-color' as string]: primaryColor }}
                      className={`px-2 py-1 rounded text-sm flex items-center justify-center hover:opacity-90 relative ${FOCUS_RING}`}
                      aria-label={translate(locale, 'viewUncertaintyLog')}
                      title={translate(locale, 'uncertaintyResponsesHint')}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="m15 9-6 6"/>
                        <path d="m9 9 6 6"/>
                      </svg>
                      <span className="ml-1 text-xs">{unsureMessages.length}</span>
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                        !
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={toggleCollapsed}
                    style={{ backgroundColor: secondaryColor, ['--tw-ring-color' as string]: headerTextColor, ['--tw-ring-offset-color' as string]: primaryColor }}
                    className={`px-2 py-1 rounded text-sm flex items-center justify-center hover:opacity-90 ${FOCUS_RING}`}
                    aria-label={closeChatLabel}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6,9 12,15 18,9" />
                    </svg>
                  </button>
                </div>
              </div>

              <StatusBanners
                error={error}
                isOffline={isOffline}
                sessionExpired={sessionExpiredBanner}
                onDismissSessionExpired={onDismissSessionExpiredBanner}
                {...bannerLabels}
              />

              <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-3"
                role="log"
                aria-live="polite"
                aria-relevant="additions text"
                aria-atomic="false"
                aria-label={translate(locale, 'chatMessages')}
                style={mobileSafeAreaStyle}
              >
                {showSkeleton ? (
                  <ChatSkeleton skeletonColor={skeletonColor} />
                ) : (
                  <>
                    {showGreeting && greetingText && (
                      <div className="flex flex-col items-start w-full">
                        <div className="flex items-start gap-2">
                          {showMessageAvatars && widgetConfig?.bot_avatar && (
                            <img src={widgetConfig.bot_avatar} alt={(agentName || getText(widgetConfig?.title) || 'agent') + ' avatar'} className="w-8 h-8 rounded-full object-cover shrink-0" />
                          )}
                          <div className="max-w-[80%] px-3.5 py-2.5 border" style={{ backgroundColor: agentBubbleBg, borderColor: subtleBorderColor, color: textColor, borderRadius: `${messageBubbleRadius}px`, ...fontStyles }}>
                            {greetingText}
                          </div>
                        </div>
                        {showButtons && (
                          <div className="flex flex-col gap-2 mt-2" style={{ marginInlineStart: (showMessageAvatars && widgetConfig?.bot_avatar) ? '40px' : '0' }}>
                            <InteractionButtons
                              buttons={interactionButtons}
                              clickedButtons={clickedButtons}
                              onButtonClick={handleInteractionButtonClickWrapper}
                              primaryColor={primaryColor}
                              buttonBorderRadius={buttonBorderRadius}
                              fontStyles={fontStyles}
                              getLocalizedText={getText}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {showSuggestions && (
                      <Suggestions
                        suggestions={suggestionList}
                        onSelect={handleSuggestionClick}
                        primaryColor={primaryColor}
                        buttonBorderRadius={buttonBorderRadius}
                        fontStyles={fontStyles}
                        indent={(showMessageAvatars && widgetConfig?.bot_avatar) ? '40px' : '0'}
                      />
                    )}

                    {mergedContent.map((item, index) => {
                      if (item.type === 'message') {
                        const message = item.data;
                        const isGreetingMsg = (message.metadata as Record<string, unknown>)?.is_greeting === true;
                        return (
                          <React.Fragment key={message.id}>
                            <div className={`flex w-full ${message.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                              <MessageBubble
                                message={message}
                                widgetConfig={widgetConfig}
                                agentName={agentName}
                                showMessageAvatars={showMessageAvatars}
                                textColor={textColor}
                                agentBubbleBg={agentBubbleBg}
                                fontStyles={fontStyles}
                                messageBubbleRadius={messageBubbleRadius}
                                onSubmitMessageFeedback={onSubmitMessageFeedback}
                                messageFeedbackSubmitted={messageFeedbackSet}
                                showTimestamps={showTimestamps}
                              />
                            </div>
                            {isGreetingMsg && showButtons && (
                              <div className="flex flex-col gap-2" style={{ marginInlineStart: (showMessageAvatars && widgetConfig?.bot_avatar) ? '40px' : '0' }}>
                                <InteractionButtons
                                  buttons={interactionButtons}
                                  clickedButtons={clickedButtons}
                                  onButtonClick={handleInteractionButtonClickWrapper}
                                  primaryColor={primaryColor}
                                  buttonBorderRadius={buttonBorderRadius}
                                  fontStyles={fontStyles}
                                  getLocalizedText={getText}
                                />
                              </div>
                            )}
                          </React.Fragment>
                        );
                      } else {
                        const flowResponse = item.data;
                        return (
                          <div key={`flow-${index}`} className="space-y-2">
                            {flowResponse.text && (
                              <MessageBubble
                                message={{ id: `flow-text-${index}`, text: flowResponse.text, from: 'agent' }}
                                widgetConfig={widgetConfig}
                                agentName={agentName}
                                showMessageAvatars={showMessageAvatars}
                                textColor={textColor}
                                agentBubbleBg={agentBubbleBg}
                                fontStyles={fontStyles}
                                messageBubbleRadius={messageBubbleRadius}
                                showTimestamps={false}
                              />
                            )}
                            {flowResponse.buttons.length > 0 && (
                              <div className="flex flex-col gap-2" style={{ marginInlineStart: (showMessageAvatars && widgetConfig?.bot_avatar) ? '40px' : '0' }}>
                                {flowResponse.buttons.map((button: FlowButton) => {
                                  const buttonId = getButtonId(button);
                                  const isClicked = clickedButtons.has(buttonId);
                                  return (
                                    <button
                                      key={buttonId}
                                      type="button"
                                      onClick={() => handleFollowUpButtonClickWrapper(button)}
                                      disabled={isClicked}
                                      style={{
                                        backgroundColor: isClicked ? withAlpha(textColor, 0.12) : primaryColor,
                                        color: isClicked ? mutedTextColor : getReadableTextColor(primaryColor),
                                        borderRadius: `${buttonBorderRadius}px`,
                                        ['--tw-ring-color' as string]: primaryColor,
                                        ['--tw-ring-offset-color' as string]: backgroundColor,
                                        ...fontStyles
                                      }}
                                      className={`w-fit px-3 py-2 text-sm transition-opacity flex items-center gap-2 ${FOCUS_RING} ${
                                        isClicked ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-90'
                                      }`}
                                    >
                                      {button.icon && (() => {
                                        const name = (button.icon as string).split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
                                        return (
                                          <DynamicIcon name={name} className="w-4 h-4" fallback={<span>{button.icon}</span>} />
                                        );
                                      })()}
                                      {getText(button.label) || 'Button'}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      }
                    })}

                    {streamingMessage ? (
                      <div className="flex w-full justify-start">
                        <MessageBubble
                          message={{ id: '__streaming__', text: streamingMessage, from: 'agent' }}
                          widgetConfig={widgetConfig}
                          agentName={agentName}
                          showMessageAvatars={showMessageAvatars}
                          textColor={textColor}
                          agentBubbleBg={agentBubbleBg}
                          fontStyles={fontStyles}
                          messageBubbleRadius={messageBubbleRadius}
                          showTimestamps={false}
                        />
                      </div>
                    ) : (showTypingIndicator && isTyping && (
                      <TypingIndicator
                        agentBubbleBg={agentBubbleBg}
                        textColor={textColor}
                        mutedTextColor={mutedTextColor}
                        messageBubbleRadius={messageBubbleRadius}
                        showAvatar={showMessageAvatars}
                        avatarSrc={botAvatarSrc}
                        avatarAlt={botAvatarAlt}
                        label={agentTypingLabel}
                      />
                    ))}
                  </>
                )}
                {showJumpButton && (
                  <JumpToLatest onClick={scrollToBottom} label={jumpToLatestLabel} primaryColor={primaryColor} />
                )}
              </div>

              {/* Feedback Dialog Overlay for Embedded View */}
              {showFeedbackDialog && feedbackDialog && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-fade-in">
                  <FocusTrap>
                    <div className="max-w-md w-full">
                      {feedbackDialog}
                    </div>
                  </FocusTrap>
                </div>
              )}

              {/* Unsure Messages Modal Overlay for Embedded View */}
              {unsureModal && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-fade-in">
                  <FocusTrap onEscape={onCloseUnsureModal}>
                    <div className="max-w-md w-full">
                      {unsureModal}
                    </div>
                  </FocusTrap>
                </div>
              )}

              {/* Handoff Modal Overlay for Embedded View */}
              {handoffModal && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                  <FocusTrap onEscape={onDismissHandoff}>
                    <div className="max-w-md w-full">
                      {handoffModal}
                    </div>
                  </FocusTrap>
                </div>
              )}

              <Composer
                input={input}
                setInput={setInput}
                onSubmit={handleFormSubmit}
                onStop={onStopStreaming}
                isTyping={isTyping}
                primaryColor={primaryColor}
                backgroundColor={backgroundColor}
                subtleBorderColor={subtleBorderColor}
                buttonBorderRadius={buttonBorderRadius}
                fontStyles={fontStyles}
                placeholder={placeholderText}
                ariaLabel={composerAriaLabel}
                sendLabel={sendLabel}
                stopLabel={stopLabel}
                inputRef={inputRef}
              />
              {!widgetConfig?.hide_branding && (
              <div className="p-2 text-center text-xs flex items-center justify-center gap-2 flex-wrap" style={{ color: mutedTextColor }}>
                <span title="Hosted in the EU · GDPR compliant">🇪🇺 EU hosted · GDPR</span>
                <span aria-hidden>·</span>
                <span>{poweredByLabel}<a href="https://companin.tech" target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline" style={{ color: textColor, fontWeight: 500 }}>{COMPANY_NAME}</a></span>
              </div>
              )}
            </div>
          </div>
          )}
        </>
      ) : (
        <>
          {isCollapsed ? (
            <button
              ref={launcherRef}
              type="button"
              onClick={toggleCollapsed}
              aria-label={openChatLabel}
              aria-expanded={!isCollapsed}
              aria-haspopup="dialog"
              style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 999999,
                backgroundColor: primaryColor,
                color: readableOnPrimary,
                borderRadius: '9999px',
                ['--tw-ring-color' as string]: primaryColor,
                ['--tw-ring-offset-color' as string]: 'transparent',
                ...fontStyles
              }}
              className={`${btnWidth} ${btnHeight} shadow-lg hover:shadow-xl flex items-center justify-center transition-all duration-200 hover:scale-105 hover:opacity-90 ${FOCUS_RING}`}
              title={typeof t.openChat === 'string' ? t.openChat : String(t.openChat)}
            >
                {widgetConfig?.bot_avatar ? (
                  <img src={widgetConfig.bot_avatar} alt={(agentName || getText(widgetConfig?.title) || 'agent') + ' avatar'} className={`${btnIcon} rounded-full object-cover`} />
                ) : widgetConfig?.logo ? (
                  <img src={widgetConfig.logo} alt={(getText(widgetConfig?.title) || title || 'logo') + ' logo'} className={`${btnIcon} object-contain`} />
                ) : (
                  <svg className={btnIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z" />
                  </svg>
                )}
            </button>
          ) : (
            <div
              style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: `${widgetWidth}px`,
                height: `${widgetHeight}px`,
                zIndex: 999999,
                boxShadow: 'rgba(0, 0, 0, 0.2) 0px 10px 40px',
                borderRadius: `${borderRadius}px`,
                overflow: 'hidden',
                backgroundColor: 'transparent',
                transition: '0.3s'
              }}
            >
              <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: `rgba(${hexToRgb(backgroundColor)}, ${backgroundOpacity})`, ...fontStyles }}>
                <div className="p-3 flex items-center justify-between" style={{ backgroundColor: primaryColor, color: headerTextColor, borderRadius: `${borderRadius}px` }}>
                  <div className="flex items-center gap-3">
                    {widgetConfig?.logo && (
                      <img src={widgetConfig.logo} alt={(getText(widgetConfig?.title) || title || 'logo') + ' logo'} className="w-10 h-10 object-contain rounded" />
                    )}
                    <div className="flex flex-col">
                      <h3 className="font-semibold">{getText(widgetConfig?.title) || title || translate(locale, 'chat')}</h3>
                      <p className="text-sm opacity-80">{getText(widgetConfig?.subtitle)}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={toggleCollapsed}
                    style={{ backgroundColor: secondaryColor, ['--tw-ring-color' as string]: headerTextColor, ['--tw-ring-offset-color' as string]: primaryColor }}
                    className={`w-7 h-7 rounded flex items-center justify-center transition-opacity hover:opacity-90 ${FOCUS_RING}`}
                    title={typeof t.minimizeChat === 'string' ? t.minimizeChat : String(t.minimizeChat)}
                    aria-label={minimizeChatLabel}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6,9 12,15 18,9" />
                    </svg>
                  </button>
                </div>

                <StatusBanners
                  error={error}
                  isOffline={isOffline}
                  sessionExpired={sessionExpiredBanner}
                  onDismissSessionExpired={onDismissSessionExpiredBanner}
                  {...bannerLabels}
                />

                <div
                  ref={scrollContainerRef}
                  className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-3"
                  role="log"
                  aria-live="polite"
                  aria-relevant="additions text"
                  aria-atomic="false"
                  aria-label={translate(locale, 'chatMessages')}
                >

                  {showGreeting && greetingText && (
                    <div className="flex flex-col items-start w-full">
                      <div className="flex items-start gap-2">
                        {showMessageAvatars && widgetConfig?.bot_avatar && (
                          <img src={widgetConfig.bot_avatar} alt={(agentName || getText(widgetConfig?.title) || 'agent') + ' avatar'} className="w-8 h-8 rounded-full object-cover shrink-0" />
                        )}
                        <div className="max-w-[80%] px-3.5 py-2.5 border" style={{ backgroundColor: agentBubbleBg, borderColor: subtleBorderColor, color: textColor, borderRadius: `${messageBubbleRadius}px`, ...fontStyles }}>
                          {greetingText}
                        </div>
                      </div>
                      {showButtons && (
                        <div className="flex flex-col gap-2 mt-2" style={{ marginInlineStart: (showMessageAvatars && widgetConfig?.bot_avatar) ? '40px' : '0' }}>
                          <InteractionButtons
                            buttons={interactionButtons}
                            clickedButtons={clickedButtons}
                            onButtonClick={handleInteractionButtonClickWrapper}
                            primaryColor={primaryColor}
                            buttonBorderRadius={buttonBorderRadius}
                            fontStyles={fontStyles}
                            getLocalizedText={getText}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {showSuggestions && (
                    <Suggestions
                      suggestions={suggestionList}
                      onSelect={handleSuggestionClick}
                      primaryColor={primaryColor}
                      buttonBorderRadius={buttonBorderRadius}
                      fontStyles={fontStyles}
                      indent={(showMessageAvatars && widgetConfig?.bot_avatar && greetingText) ? '40px' : '0'}
                    />
                  )}

                  {mergedContent.map((item, index) => {
                    if (item.type === 'message') {
                      const message = item.data;
                      const isGreetingMsg = (message.metadata as Record<string, unknown>)?.is_greeting === true;
                      return (
                        <React.Fragment key={message.id}>
                          <div className={`flex w-full ${message.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <MessageBubble
                              message={message}
                              widgetConfig={widgetConfig}
                              agentName={agentName}
                              showMessageAvatars={showMessageAvatars}
                              textColor={textColor}
                              fontStyles={fontStyles}
                              messageBubbleRadius={messageBubbleRadius}
                              onSubmitMessageFeedback={onSubmitMessageFeedback}
                              messageFeedbackSubmitted={messageFeedbackSet}
                              showTimestamps={showTimestamps}
                            />
                          </div>
                          {isGreetingMsg && showButtons && (
                            <div className="flex flex-col gap-2" style={{ marginInlineStart: (showMessageAvatars && widgetConfig?.bot_avatar) ? '40px' : '0' }}>
                              <InteractionButtons
                                buttons={interactionButtons}
                                clickedButtons={clickedButtons}
                                onButtonClick={handleInteractionButtonClickWrapper}
                                primaryColor={primaryColor}
                                buttonBorderRadius={buttonBorderRadius}
                                fontStyles={fontStyles}
                                getLocalizedText={getText}
                              />
                            </div>
                          )}
                        </React.Fragment>
                      );
                    } else {
                      const flowResponse = item.data;
                      return (
                        <div key={`flow-${index}`} className="space-y-2">
                          {flowResponse.text && (
                            <MessageBubble
                              message={{ id: `flow-text-${index}`, text: flowResponse.text, from: 'agent' }}
                              widgetConfig={widgetConfig}
                              agentName={agentName}
                              showMessageAvatars={showMessageAvatars}
                              textColor={textColor}
                              fontStyles={fontStyles}
                              messageBubbleRadius={messageBubbleRadius}
                              showTimestamps={false}
                            />
                          )}
                          {flowResponse.buttons.length > 0 && (
                            <div className="flex flex-col gap-2" style={{ marginInlineStart: widgetConfig?.bot_avatar ? '40px' : '0' }}>
                              {flowResponse.buttons.map((button: FlowButton) => {
                                const buttonId = getButtonId(button);
                                const isClicked = clickedButtons.has(buttonId);
                                return (
                                  <button
                                    key={buttonId}
                                    type="button"
                                    onClick={() => handleFollowUpButtonClickWrapper(button)}
                                    disabled={isClicked}
                                    style={{
                                      backgroundColor: isClicked ? withAlpha(textColor, 0.12) : primaryColor,
                                      color: isClicked ? mutedTextColor : getReadableTextColor(primaryColor),
                                      borderRadius: `${buttonBorderRadius}px`,
                                      ['--tw-ring-color' as string]: primaryColor,
                                      ['--tw-ring-offset-color' as string]: backgroundColor,
                                      ...fontStyles
                                    }}
                                    className={`w-fit px-3 py-2 text-sm transition-opacity flex items-center gap-2 ${FOCUS_RING} ${
                                      isClicked ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-90'
                                    }`}
                                  >
                                    {button.icon && (() => {
                                      const name = (button.icon as string).split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
                                      return (
                                        <DynamicIcon name={name} className="w-4 h-4" fallback={<span>{button.icon}</span>} />
                                      );
                                    })()}
                                    {getText(button.label) || 'Button'}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    }
                  })}

                  {streamingMessage ? (
                    <div className="flex w-full justify-start">
                      <MessageBubble
                        message={{ id: '__streaming__', text: streamingMessage, from: 'agent' }}
                        widgetConfig={widgetConfig}
                        agentName={agentName}
                        showMessageAvatars={showMessageAvatars}
                        textColor={textColor}
                        fontStyles={fontStyles}
                        messageBubbleRadius={messageBubbleRadius}
                        showTimestamps={false}
                      />
                    </div>
                  ) : (isTyping && (
                    <TypingIndicator
                      agentBubbleBg={agentBubbleBg}
                      textColor={textColor}
                      mutedTextColor={mutedTextColor}
                      messageBubbleRadius={messageBubbleRadius}
                      showAvatar={showMessageAvatars}
                      avatarSrc={botAvatarSrc}
                      avatarAlt={botAvatarAlt}
                      label={agentTypingLabel}
                    />
                  ))}
                  {showJumpButton && (
                    <JumpToLatest onClick={scrollToBottom} label={jumpToLatestLabel} primaryColor={primaryColor} />
                  )}
                </div>

                {/* Feedback Dialog Overlay */}
                {showFeedbackDialog && feedbackDialog && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-fade-in">
                    <FocusTrap>
                      <div className="max-w-md w-full">
                        {feedbackDialog}
                      </div>
                    </FocusTrap>
                  </div>
                )}

                {/* Unsure Messages Modal Overlay */}
                {unsureModal && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-fade-in">
                    <FocusTrap onEscape={onCloseUnsureModal}>
                      <div className="max-w-md w-full">
                        {unsureModal}
                      </div>
                    </FocusTrap>
                  </div>
                )}

                {/* Handoff Modal Overlay */}
                {handoffModal && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <FocusTrap onEscape={onDismissHandoff}>
                      <div className="max-w-md w-full">
                        {handoffModal}
                      </div>
                    </FocusTrap>
                  </div>
                )}

                <Composer
                  input={input}
                  setInput={setInput}
                  onSubmit={handleFormSubmit}
                  onStop={onStopStreaming}
                  isTyping={isTyping}
                  primaryColor={primaryColor}
                  backgroundColor={backgroundColor}
                  subtleBorderColor={subtleBorderColor}
                  buttonBorderRadius={buttonBorderRadius}
                  fontStyles={fontStyles}
                  placeholder={placeholderText}
                  ariaLabel={composerAriaLabel}
                  sendLabel={sendLabel}
                  stopLabel={stopLabel}
                  inputRef={inputRef}
                />
                {!widgetConfig?.hide_branding && (
                <div className="p-2 text-center text-xs" style={{ color: mutedTextColor }}>
                  {poweredByLabel}<a href="https://companin.tech" target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline" style={{ color: textColor, fontWeight: 500 }}>{COMPANY_NAME}</a>
                </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
