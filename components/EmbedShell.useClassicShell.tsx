
'use client';

import React, { useRef, useEffect, useLayoutEffect, useState, useMemo, useCallback } from 'react';
import InteractionButtons from './InteractionButtons';
import MessageBubble from './MessageBubble';
import DynamicIcon from './DynamicIcon';
import { useWidgetTranslation } from '../hooks/useWidgetTranslation';
import { useRuntimeRevision } from '../hooks/useRuntimeTranslation';
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
import { COMPANY_NAME } from '../lib/constants';
import { UnreadBadge } from './UnreadBadge';
import { FOCUSABLE, FOCUS_RING } from './EmbedShell.constants';
import type { Props } from './EmbedShell.types';
import { FocusTrap } from './components/FocusTrap';
import { ChatSkeleton } from './components/ChatSkeleton';
import { Suggestions } from './components/Suggestions';
import { TypingIndicator } from './components/TypingIndicator';
import { StatusBanners } from './components/StatusBanners';
import { ConsentBanner } from './components/ConsentBanner';
import { JumpToLatest } from './components/JumpToLatest';
import { Composer } from './components/Composer';
import { LanguageMenu } from './components/LanguageMenu';
import { ThemeToggleButton } from './components/ThemeToggleButton';
import MinimalEmbedShell from './layouts/MinimalEmbedShell';
import PanelEmbedShell from './layouts/PanelEmbedShell';

// Dispatches to the runtime-selected layout shell. Kept hook-free so the
// variant branch happens before any hooks run — the classic layout's hooks
// live in ClassicEmbedShell, which only mounts for the 'classic' variant.

export function useClassicShell(props: Props) {
  const {
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
  onRetrySend,
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
  onRichAction,
  unsureModal,
  handoffModal,
  leadCaptureCard,
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
  onToggleTheme,
  sessionExpiredBanner = false,
  onDismissSessionExpiredBanner,
  showConsentPrompt = false,
  onConsentAccept,
  onConsentDecline,
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
  } = props;
  const { locale: hookLocale } = useWidgetTranslation();
  const locale = localeProp || hookLocale;
  // Re-localize when a runtime-translated bundle registers for a non-native
  // locale (the revision bumps on registration).
  const runtimeRevision = useRuntimeRevision();
  // Derive translations from the resolved locale (not the hook's own detected
  // locale) so a mid-conversation language switch re-localizes every string,
  // including the ones read off the `t` map below.
  const t = useMemo(() => getTranslations(locale), [locale, runtimeRevision]);
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
    isDarkTheme,
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

  // The greeting is always rendered as a pinned static block at the top of the
  // conversation whenever one is configured. The backend also persists the greeting
  // as an `is_greeting` chat message once a conversation exists (with the same text
  // and buttons), so we filter that server copy out of the message stream below
  // (see mergedContent) — otherwise it renders twice, and sending a message makes
  // the static block vanish. Keeping it static means it never disappears.
  const isServerGreetingMessage = (m: { id: string; metadata?: Message['metadata'] }) =>
    m.id.startsWith('greeting-') ||
    (m.metadata as Record<string, unknown> | undefined)?.is_greeting === true;
  const showGreeting = !!widgetConfig?.greeting_message;
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

  // Merge messages and flow responses, then sort by timestamp. The server's
  // is_greeting copy is dropped here because the greeting is shown as the static
  // block above; rendering it as a bubble too would duplicate it.
  const mergedContent = [
    ...messages
      .filter((msg) => !isServerGreetingMessage(msg))
      .map(msg => ({ type: 'message' as const, data: msg, timestamp: msg.timestamp || 0 })),
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
  // Visitor-facing light/dark toggle. Styled to match this shell's close button
  // (primary-colored header → secondary fill + readable header text color).
  const themeToggle = onToggleTheme ? (
    <ThemeToggleButton
      isDark={isDarkTheme}
      onToggle={onToggleTheme}
      label={translate(locale, 'themeToggle')}
      className={`w-11 h-11 rounded text-sm flex items-center justify-center hover:opacity-90 ${FOCUS_RING}`}
      style={{ backgroundColor: secondaryColor, color: headerTextColor, ['--tw-ring-color' as string]: headerTextColor, ['--tw-ring-offset-color' as string]: primaryColor }}
    />
  ) : null;
  const agentTypingLabel = translate(locale, 'agentTyping');
  const botAvatarSrc = widgetConfig?.bot_avatar;
  const botAvatarAlt = (agentName || getText(widgetConfig?.title) || 'agent') + ' avatar';
  const bannerLabels = {
    retryLabel: translate(locale, 'retry'),
    offlineTitle: translate(locale, 'offlineBannerTitle'),
    offlineDesc: translate(locale, 'offlineBannerDesc'),
    sessionExpiredTitle: translate(locale, 'sessionExpiredTitle'),
    sessionExpiredBody: translate(locale, 'sessionExpiredBody'),
    sessionExpiredDismiss: translate(locale, 'sessionExpiredDismiss'),
  };
  // Storage-consent notice, shared by both render paths below.
  const consentBanner =
    showConsentPrompt && onConsentAccept && onConsentDecline ? (
      <ConsentBanner
        title={translate(locale, 'consentNoticeTitle')}
        body={translate(locale, 'consentNoticeBody')}
        acceptLabel={translate(locale, 'consentAccept')}
        declineLabel={translate(locale, 'consentDecline')}
        onAccept={onConsentAccept}
        onDecline={onConsentDecline}
      />
    ) : null;

  const vm = {
    isEmbedded,
    isCollapsed,
    toggleCollapsed,
    messages,
    isTyping,
    onStopStreaming,
    streamingMessage,
    input,
    setInput,
    handleSubmit,
    error,
    onRetrySend,
    title,
    agentName,
    identifiedUserName,
    widgetConfig,
    onInteractionButtonClick,
    onFollowUpButtonClick,
    flowResponses,
    getLocalizedText,
    showFeedbackDialog,
    feedbackDialog,
    messageFeedbackSubmitted,
    onSubmitMessageFeedback,
    onRichAction,
    unsureModal,
    handoffModal,
    leadCaptureCard,
    unsureMessages,
    onShowUnsureModal,
    onCloseUnsureModal,
    onDismissHandoff,
    unreadCount,
    hideCloseButton,
    isPersistent,
    localeProp,
    availableLocales,
    onLocaleChange,
    onToggleTheme,
    sessionExpiredBanner,
    onDismissSessionExpiredBanner,
    showConsentPrompt,
    onConsentAccept,
    onConsentDecline,
    isOffline,
    previewPositioning,
    isPreview,
    showTeaser,
    teaserExpanded,
    teaserConfigured,
    teaserMessage,
    onTeaserMeasure,
    onDismissTeaser,
    fileUploadEnabled,
    pendingAttachments,
    uploadingFiles,
    onPickFiles,
    onRemoveAttachment,
    hookLocale,
    locale,
    runtimeRevision,
    t,
    liveMessage,
    setLiveMessage,
    lastAnnouncedId,
    messageFeedbackSet,
    clickedButtons,
    onButtonClickInternal,
    getButtonId,
    scrollContainerRef,
    inputRef,
    launcherRef,
    wasOpenRef,
    teaserBubbleRef,
    showJumpButton,
    setShowJumpButton,
    shouldAutoScroll,
    handleScroll,
    scrollToBottom,
    handleFormSubmit,
    showSkeleton,
    setShowSkeleton,
    mobileSafeAreaStyle,
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
    isDarkTheme,
    btnWidth,
    btnHeight,
    btnIcon,
    edgeOffsetVal,
    widgetPos,
    previewLauncherPos,
    headerTextColor,
    getText,
    handleInteractionButtonClickWrapper,
    handleFollowUpButtonClickWrapper,
    isServerGreetingMessage,
    showGreeting,
    greetingText,
    displayGreetingText,
    isVisibleInLocale,
    interactionButtons,
    showButtons,
    rawSuggestions,
    suggestionList,
    hasUserMessage,
    showSuggestions,
    handleSuggestionClick,
    mergedContent,
    openChatLabel,
    closeChatLabel,
    minimizeChatLabel,
    poweredByLabel,
    jumpToLatestLabel,
    placeholderText,
    composerAriaLabel,
    sendLabel,
    stopLabel,
    selectLanguageLabel,
    showLanguageMenu,
    languageMenu,
    themeToggle,
    agentTypingLabel,
    botAvatarSrc,
    botAvatarAlt,
    bannerLabels,
    consentBanner,
  };
  return vm;
}

export type ClassicShellVM = ReturnType<typeof useClassicShell>;
