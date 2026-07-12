
'use client';

import React, { useRef, useEffect, useLayoutEffect, useState, useMemo, useCallback } from 'react';
import InteractionButtons from './InteractionButtons';
import MessageBubble from './MessageBubble';
import DynamicIcon from './DynamicIcon';
import { useWidgetTranslation } from '../hooks/useWidgetTranslation';
import { t as translate, getTranslations } from '../lib/i18n';
import type {
  Message,
  WidgetConfig,
  FlowButton,
  FlowResponse,
} from '../types/widget';
import { useClickedButtons, ButtonLike } from '../hooks/useClickedButtons';
import { useWidgetStyles } from '../hooks/useWidgetStyles';
import { hexToRgb, getReadableTextColor, withAlpha } from '../lib/colors';
import { COMPANY_NAME, STATUS_COLORS } from '../lib/constants';
import { FOCUSABLE, FOCUS_RING } from './EmbedShell.constants';
import type { Props } from './EmbedShell.types';
import { FocusTrap } from './components/FocusTrap';
import { ChatSkeleton } from './components/ChatSkeleton';
import { Suggestions } from './components/Suggestions';
import { TypingIndicator } from './components/TypingIndicator';
import { StatusBanners } from './components/StatusBanners';
import { JumpToLatest } from './components/JumpToLatest';
import { Composer } from './components/Composer';
import { LanguageMenu } from './components/LanguageMenu';

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
  identifiedUserName,
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
  availableLocales = [],
  onLocaleChange,
  sessionExpiredBanner = false,
  onDismissSessionExpiredBanner,
  isOffline = false,
  previewPositioning = false,
  isPreview = false,
  showTeaser = false,
  teaserExpanded = false,
  teaserConfigured = false,
  teaserMessage = null,
  onTeaserMeasure,
  onDismissTeaser,
  fileUploadEnabled = false,
  pendingAttachments = [],
  uploadingFiles = 0,
  onPickFiles,
  onRemoveAttachment,
}: Props) {
  const { locale: hookLocale } = useWidgetTranslation();
  const locale = localeProp || hookLocale;
  // Derive translations from the resolved locale (not the hook's own detected
  // locale) so a mid-conversation language switch re-localizes every string,
  // including the ones read off the `t` map below.
  const t = useMemo(() => getTranslations(locale), [locale]);
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

  // Measure the teaser bubble as soon as it renders (hidden at first) so the
  // iframe can be resized to the bubble's real footprint instead of its
  // 240px max-width — a short message shouldn't reserve a wide click-blocking
  // strip of the host page.
  const teaserBubbleRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!teaserExpanded || !teaserMessage || !onTeaserMeasure) return;
    const el = teaserBubbleRef.current;
    if (el) onTeaserMeasure({ width: el.offsetWidth, height: el.offsetHeight });
  }, [teaserExpanded, teaserMessage, onTeaserMeasure]);

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
      // handleSubmit is async — void it explicitly so the floating Promise is
      // intentional. handleSubmit catches all its own errors; this .catch is a
      // last-resort guard so any unexpected rejection never surfaces as an
      // unhandled rejection in the Next.js dev overlay.
      void Promise.resolve(handleSubmit(e, messageText)).catch(() => {});
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
    spacingValues,
    openAnimation,
    bubbleAnimation,
    messageAnimation,
    respectReducedMotion,
    visualEffectStyles,
  } = useWidgetStyles(widgetConfig);

  const { width: btnWidth, height: btnHeight, icon: btnIcon } = getButtonSizeClasses;

  // Compute launcher fixed-position style from config (only used in preview mode).
  // edge_offset controls the gap from each edge; position controls which corner.
  const edgeOffsetVal = (() => {
    const raw = widgetConfig?.edge_offset;
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : 20;
  })();
  const widgetPos = widgetConfig?.position ?? 'bottom-right';
  const previewLauncherPos: React.CSSProperties = (() => {
    const px = `${edgeOffsetVal}px`;
    if (widgetPos === 'bottom-left') return { bottom: px, left: px };
    if (widgetPos === 'top-right')   return { top: px, right: px };
    if (widgetPos === 'top-left')    return { top: px, left: px };
    return { bottom: px, right: px };
  })();

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

  // In preview mode keep the greeting block pinned so it doesn't vanish when the
  // user sends a message. In the live widget the server re-delivers the greeting
  // as the first chat message, so the static block correctly hides once messages load.
  const hasGreetingMessage = !isPreview && (messages.length > 0 || (flowResponses?.length ?? 0) > 0);
  const showGreeting = widgetConfig?.greeting_message && !hasGreetingMessage;
  const greetingText = showGreeting ? getText(widgetConfig.greeting_message.text) : '';
  const displayGreetingText = identifiedUserName && greetingText
    ? `Hi ${identifiedUserName}! ${greetingText}`
    : greetingText;
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
  const selectLanguageLabel = translate(locale, 'selectLanguage');
  // Only surface the switcher when there's a real choice to make and the host
  // wired up a change handler. Shared by both header layouts below.
  const showLanguageMenu = !!onLocaleChange && availableLocales.length >= 2;
  const languageMenu = showLanguageMenu ? (
    <LanguageMenu
      locale={locale}
      locales={availableLocales}
      onChange={onLocaleChange!}
      label={selectLanguageLabel}
      headerTextColor={headerTextColor}
      secondaryColor={secondaryColor}
      primaryColor={primaryColor}
      backgroundColor={backgroundColor}
      textColor={textColor}
      borderColor={subtleBorderColor}
      fontStyles={fontStyles}
      borderRadius={borderRadius}
    />
  ) : null;
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
            teaserConfigured ? (
              /* Wrapper anchors the launcher at bottom-right whenever a teaser is
                 configured. The iframe grows just before the bubble renders and
                 shrinks back to button size once it's hidden (see useTeaserBubble /
                 useWidgetResize), so the collapsed iframe never overhangs the page. */
              <div
                style={{
                  position: 'fixed',
                  ...(previewPositioning
                    ? previewLauncherPos
                    : { bottom: '24px', right: '24px' }),
                  zIndex: 999999,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: '8px',
                }}
              >
                {/* Speech bubble — mounted (hidden) while the teaser is live so it
                    can be measured before the iframe resize; revealed once the
                    parent's size transition has settled (showTeaser). */}
                {(teaserExpanded || showTeaser) && (
                  <div
                    ref={teaserBubbleRef}
                    role="status"
                    aria-live="polite"
                    style={{
                      // While hidden for measurement the bubble is pulled out of
                      // flow with width:max-content — the iframe is still
                      // button-sized at that point and would otherwise squeeze
                      // the text into a wrapped, unrepresentative footprint.
                      ...(showTeaser
                        ? { position: 'relative' as const }
                        : { position: 'absolute' as const, bottom: 0, right: 0, width: 'max-content' as const }),
                      maxWidth: '240px',
                      backgroundColor: '#ffffff',
                      color: textColor,
                      borderRadius: '12px',
                      padding: '10px 32px 10px 14px',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                      cursor: 'pointer',
                      lineHeight: '1.5',
                      visibility: showTeaser ? 'visible' : 'hidden',
                      ...fontStyles,
                    }}
                    className={showTeaser ? 'teaser-bubble-enter' : undefined}
                    onClick={toggleCollapsed}
                  >
                    <p style={{ margin: 0 }}>{teaserMessage}</p>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onDismissTeaser?.(); }}
                      aria-label={translate(locale, 'dismiss')}
                      style={{
                        position: 'absolute',
                        top: '6px',
                        right: '8px',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#9ca3af',
                        fontSize: '16px',
                        lineHeight: 1,
                        padding: '2px 4px',
                      }}
                      className={FOCUS_RING}
                    >
                      ×
                    </button>
                    {/* Tail pointing toward the launcher button */}
                    <div
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        bottom: '-6px',
                        right: '22px',
                        width: '12px',
                        height: '12px',
                        backgroundColor: '#ffffff',
                        transform: 'rotate(45deg)',
                        boxShadow: '2px 2px 4px rgba(0,0,0,0.1)',
                      }}
                    />
                  </div>
                )}

                {/* Launcher button (position:relative — wrapper is the fixed anchor) */}
                <button
                  ref={launcherRef}
                  type="button"
                  onClick={toggleCollapsed}
                  aria-label={openChatLabel}
                  aria-expanded={!isCollapsed}
                  aria-haspopup="dialog"
                  style={{
                    position: 'relative',
                    backgroundColor: primaryColor,
                    color: readableOnPrimary,
                    borderRadius: '9999px',
                    ['--tw-ring-color' as string]: primaryColor,
                    ['--tw-ring-offset-color' as string]: 'transparent',
                    ...fontStyles
                  }}
                  className={`${btnWidth} ${btnHeight} shadow-lg hover:shadow-xl flex items-center justify-center transition-all duration-200 hover:scale-105 hover:opacity-90 relative ${FOCUS_RING}${bubbleAnimation === 'pulse' ? ' bubble-pulse' : bubbleAnimation === 'bounce' ? ' bubble-bounce' : ''}`}
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
              </div>
            ) : (
              /* Original launcher button — no teaser configured */
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
                    ? previewLauncherPos
                    : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }),
                  zIndex: 999999,
                  backgroundColor: primaryColor,
                  color: readableOnPrimary,
                  borderRadius: '9999px',
                  ['--tw-ring-color' as string]: primaryColor,
                  ['--tw-ring-offset-color' as string]: 'transparent',
                  ...fontStyles
                }}
                className={`${btnWidth} ${btnHeight} shadow-lg hover:shadow-xl flex items-center justify-center transition-all duration-200 hover:scale-105 hover:opacity-90 relative ${FOCUS_RING}${bubbleAnimation === 'pulse' ? ' bubble-pulse' : bubbleAnimation === 'bounce' ? ' bubble-bounce' : ''}`}
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
            )
          ) : (
            <div
              data-ignore-reduced-motion={!respectReducedMotion ? 'true' : undefined}
              style={{
                position: 'fixed',
                ...(previewPositioning
                  ? { inset: 0, margin: 'auto', width: `${widgetWidth}px`, height: `${widgetHeight}px`, maxWidth: '100%', maxHeight: '100%' }
                  : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '100%', height: '100%', maxWidth: `${widgetWidth}px`, maxHeight: `${widgetHeight}px` }),
                zIndex: 999999,
                boxShadow: 'rgba(0, 0, 0, 0.2) 0px 10px 40px',
                borderRadius: `${borderRadius}px`,
                overflow: 'hidden',
                backgroundColor: 'transparent',
                transition: '0.3s',
                boxSizing: 'border-box'
              }}
              className={openAnimation !== 'none' ? `widget-panel--${openAnimation}` : undefined}
            >
              <div
                className="h-full flex flex-col"
                style={{
                  backgroundColor: `rgba(${hexToRgb(backgroundColor)}, ${visualEffectStyles.backgroundOpacityOverride ?? backgroundOpacity})`,
                  backdropFilter: visualEffectStyles.backdropFilter,
                  WebkitBackdropFilter: visualEffectStyles.WebkitBackdropFilter,
                  ...fontStyles
                }}
              >
              <div className="p-3 flex items-center justify-between" style={{ backgroundColor: primaryColor, color: headerTextColor, padding: spacingValues.padding }}>
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
                  {languageMenu}
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
                      <span className="absolute -top-1 -right-1 bg-destructive text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
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
                className={`flex-1 overflow-y-auto overscroll-contain p-3 space-y-3${messageAnimation !== 'none' ? ` widget-messages--${messageAnimation}` : ''}`}
                role="log"
                aria-live="polite"
                aria-relevant="additions text"
                aria-atomic="false"
                aria-label={translate(locale, 'chatMessages')}
                style={{ ...mobileSafeAreaStyle, padding: spacingValues.padding, rowGap: spacingValues.gap }}
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
                            {displayGreetingText}
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
                fileUploadEnabled={fileUploadEnabled}
                pendingAttachments={pendingAttachments}
                uploadingFiles={uploadingFiles}
                onPickFiles={onPickFiles}
                onRemoveAttachment={onRemoveAttachment}
                attachLabel={translate(locale, 'uploadFiles')}
              />
              {!widgetConfig?.hide_branding && (
              <div className="p-2 text-center text-xs flex items-center justify-center gap-2 flex-wrap" style={{ color: mutedTextColor }}>
                <span title={translate(locale, 'euHostedGdpr')}>🇪🇺 EU hosted · GDPR</span>
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
              className={`${btnWidth} ${btnHeight} shadow-lg hover:shadow-xl flex items-center justify-center transition-all duration-200 hover:scale-105 hover:opacity-90 ${FOCUS_RING}${bubbleAnimation === 'pulse' ? ' bubble-pulse' : bubbleAnimation === 'bounce' ? ' bubble-bounce' : ''}`}
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
              data-ignore-reduced-motion={!respectReducedMotion ? 'true' : undefined}
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
              className={openAnimation !== 'none' ? `widget-panel--${openAnimation}` : undefined}
            >
              <div
                className="h-full flex flex-col overflow-hidden"
                style={{
                  backgroundColor: `rgba(${hexToRgb(backgroundColor)}, ${visualEffectStyles.backgroundOpacityOverride ?? backgroundOpacity})`,
                  backdropFilter: visualEffectStyles.backdropFilter,
                  WebkitBackdropFilter: visualEffectStyles.WebkitBackdropFilter,
                  ...fontStyles
                }}
              >
                <div className="p-3 flex items-center justify-between" style={{ backgroundColor: primaryColor, color: headerTextColor, borderRadius: `${borderRadius}px`, padding: spacingValues.padding }}>
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
                  {languageMenu}
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
                  className={`flex-1 overflow-y-auto overscroll-contain p-3 space-y-3${messageAnimation !== 'none' ? ` widget-messages--${messageAnimation}` : ''}`}
                  role="log"
                  aria-live="polite"
                  aria-relevant="additions text"
                  aria-atomic="false"
                  aria-label={translate(locale, 'chatMessages')}
                  style={{ padding: spacingValues.padding, rowGap: spacingValues.gap }}
                >

                  {showGreeting && greetingText && (
                    <div className="flex flex-col items-start w-full">
                      <div className="flex items-start gap-2">
                        {showMessageAvatars && widgetConfig?.bot_avatar && (
                          <img src={widgetConfig.bot_avatar} alt={(agentName || getText(widgetConfig?.title) || 'agent') + ' avatar'} className="w-8 h-8 rounded-full object-cover shrink-0" />
                        )}
                        <div className="max-w-[80%] px-3.5 py-2.5 border" style={{ backgroundColor: agentBubbleBg, borderColor: subtleBorderColor, color: textColor, borderRadius: `${messageBubbleRadius}px`, ...fontStyles }}>
                          {displayGreetingText}
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
                  fileUploadEnabled={fileUploadEnabled}
                  pendingAttachments={pendingAttachments}
                  uploadingFiles={uploadingFiles}
                  onPickFiles={onPickFiles}
                  onRemoveAttachment={onRemoveAttachment}
                  attachLabel={translate(locale, 'uploadFiles')}
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
