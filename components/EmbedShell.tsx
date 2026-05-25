
'use client';

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
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
import { hexToRgb } from '../lib/colors';
import { COMPANY_NAME } from '../lib/constants';

type Props = {
  isEmbedded: boolean;
  isCollapsed: boolean;
  toggleCollapsed: () => void;
  messages: Message[];
  isTyping: boolean;
  input: string;
  setInput: (v: string) => void;
  handleSubmit: (e: React.FormEvent) => void;
  error?: string | null;
  title?: string;
  assistantName?: string;
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
};


// Simple chat skeleton loader
function ChatSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4 animate-pulse">
      {[...Array(4)].map((_, i) => (
        <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
          <div className="h-6 w-2/3 rounded-lg bg-gray-200/60" style={{ minWidth: 120 }} />
        </div>
      ))}
    </div>
  );
}

export default function EmbedShell({
  isEmbedded,
  isCollapsed,
  toggleCollapsed,
  messages,
  isTyping,
  input,
  setInput,
  handleSubmit,
  error,
  title,
  assistantName,
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
  unreadCount = 0,
  hideCloseButton = false,
  isPersistent = false,
  locale: localeProp,
  sessionExpiredBanner = false,
  onDismissSessionExpiredBanner,
  isOffline = false,
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
  const inputRef = useRef<HTMLInputElement>(null);

  // Robust Escape-to-close and modal Escape handling
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // If a modal is open, close it first
        if (unsureModal && typeof unsureModal === 'object' && onShowUnsureModal) {
          onShowUnsureModal();
          e.stopPropagation();
          return;
        }
        if (handoffModal) {
          // Handoff modal should provide a close prop (handled by parent)
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
  }, [isCollapsed, hideCloseButton, toggleCollapsed, unsureModal, onShowUnsureModal, handoffModal, showFeedbackDialog, feedbackDialog]);

  // Helper: should auto-scroll if user is at or near bottom
  const shouldAutoScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    const threshold = 64; // px from bottom
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  };

  // Auto-scroll to bottom only if user is at/near bottom
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (shouldAutoScroll()) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, flowResponses, isTyping]);

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
    const latestAssistant = [...messages]
      .reverse()
      .find((msg) => msg.from === 'assistant' && !msg.id.startsWith('greeting-'));
    if (latestAssistant && latestAssistant.id !== lastAnnouncedId.current) {
      lastAnnouncedId.current = latestAssistant.id;
      const timeoutId = window.setTimeout(() => {
        setLiveMessage(
          translate(locale, 'newMessageAnnouncement', {
            vars: { message: latestAssistant.text },
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

  // Show greeting message and buttons always (not just when no user messages)
  const hasGreetingMessage = messages.some(m => m.id.startsWith('greeting-'));
  const showGreeting = widgetConfig?.greeting_message && !hasGreetingMessage;
  const greetingText = showGreeting ? getText(widgetConfig.greeting_message.text) : '';
  // Only show interaction buttons whose `languages` whitelist includes the
  // current locale (legacy buttons with no `languages` field are visible in
  // all locales). The admin manages this per editing-language.
  const isVisibleInLocale = (item: { languages?: string[] } | null | undefined) => {
    if (!item) return false;
    const langs = item.languages;
    if (!langs || langs.length === 0) return true;
    return langs.includes(locale);
  };
  const interactionButtons = (widgetConfig?.greeting_message?.buttons || []).filter(isVisibleInLocale);
  const showButtons = interactionButtons.length > 0;

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
              type="button"
              onClick={toggleCollapsed}
              aria-label={openChatLabel}
              style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 999999,
                backgroundColor: primaryColor,
                borderRadius: `${buttonBorderRadius * 2}px`,
                ...fontStyles
              }}
              className={`${btnWidth} ${btnHeight} text-white shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-105 hover:opacity-90 relative`}
              title={translate(locale, 'chatControl', { context: 'open' })}
            >
                {widgetConfig?.bot_avatar ? (
                  <img src={widgetConfig.bot_avatar} alt={(assistantName || getText(widgetConfig?.title) || 'assistant') + ' avatar'} className={`${btnIcon} rounded-full object-cover`} />
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
                      backgroundColor: '#ef4444',
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
                width: '100%',
                height: '100%',
                maxWidth: `${widgetWidth}px`,
                maxHeight: `${widgetHeight}px`,
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
              <div className="text-white p-3 flex items-center justify-between" style={{ backgroundColor: primaryColor }}>
                <div className="flex items-center gap-3">
                  {widgetConfig?.logo && (
                    <img src={widgetConfig.logo} alt={(getText(widgetConfig?.title) || title || 'logo') + ' logo'} className="w-10 h-10 object-contain rounded" />
                  )}
                  <div className="flex flex-col">
                    <h3 className="font-semibold">{getText(widgetConfig?.title) || title || translate(locale, 'chat')}</h3>
                    <p className="text-sm text-gray-300">{getText(widgetConfig?.subtitle)}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {unsureMessages.length > 0 && onShowUnsureModal && (
                    <button
                      type="button"
                      onClick={onShowUnsureModal}
                      style={{ backgroundColor: secondaryColor }}
                      className="px-2 py-1 rounded text-sm flex items-center justify-center hover:opacity-90 relative"
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
                    style={{ backgroundColor: secondaryColor }}
                    className="px-2 py-1 rounded text-sm flex items-center justify-center hover:opacity-90"
                    aria-label={closeChatLabel}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6,9 12,15 18,9" />
                    </svg>
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-3 mx-3 mt-3 rounded" role="alert">
                  <p className="text-sm">{error}</p>
                </div>
              )}

              {isOffline && (
                <div role="status" aria-live="polite" className="flex items-center gap-2 mx-3 mt-3 px-3 py-2 rounded text-xs" style={{ background: '#f0f9ff', border: '1px solid #7dd3fc', color: '#0c4a6e' }}>
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 102 0V6zm-1 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                  <span><strong className="mr-1">You&apos;re offline.</strong>Messages will be sent when your connection is restored.</span>
                </div>
              )}

              {sessionExpiredBanner && (
                <div role="status" aria-live="polite" className="flex items-center justify-between gap-2 mx-3 mt-3 px-3 py-2 rounded text-xs" style={{ background: '#fef3c7', border: '1px solid #fcd34d', color: '#78350f' }}>
                  <span><strong className="mr-1">{translate(locale, 'sessionExpiredTitle')}</strong>{translate(locale, 'sessionExpiredBody')}</span>
                  {onDismissSessionExpiredBanner && (
                    <button type="button" onClick={onDismissSessionExpiredBanner} aria-label={translate(locale, 'sessionExpiredDismiss')} style={{ background: 'transparent', border: 'none', color: '#78350f', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 2 }}>×</button>
                  )}
                </div>
              )}

              <div
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto p-3 space-y-3"
                role="log"
                aria-live="polite"
                aria-relevant="additions text"
                aria-atomic="false"
                aria-label={translate(locale, 'chatMessages')}
                style={mobileSafeAreaStyle}
              >
                {showSkeleton ? (
                  <ChatSkeleton />
                ) : (
                  <>
                    {showGreeting && (
                      <div className="flex flex-col items-start w-full">
                        <div className="flex items-start gap-2">
                          {showMessageAvatars && widgetConfig?.bot_avatar && (
                            <img src={widgetConfig.bot_avatar} alt={(assistantName || getText(widgetConfig?.title) || 'assistant') + ' avatar'} className="w-8 h-8 rounded-full object-cover shrink-0" />
                          )}
                          <div className="max-w-[80%] p-2 rounded-lg bg-gray-200" style={{ color: textColor, borderRadius: `${messageBubbleRadius}px`, ...fontStyles }}>
                            {greetingText}
                          </div>
                        </div>
                      </div>
                    )}

                    {showButtons && (
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

                    {mergedContent.map((item, index) => {
                      if (item.type === 'message') {
                        const message = item.data;
                        return (
                          <div key={message.id} className={`flex w-full ${message.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <MessageBubble
                              message={message}
                              widgetConfig={widgetConfig}
                              assistantName={assistantName}
                              showMessageAvatars={showMessageAvatars}
                              textColor={textColor}
                              fontStyles={fontStyles}
                              messageBubbleRadius={messageBubbleRadius}
                              onSubmitMessageFeedback={onSubmitMessageFeedback}
                              messageFeedbackSubmitted={messageFeedbackSet}
                              showTimestamps={showTimestamps}
                            />
                          </div>
                        );
                      } else {
                        const flowResponse = item.data;
                        return (
                          <div key={`flow-${index}`} className="space-y-2">
                            {flowResponse.text && (
                              <MessageBubble
                                message={{ id: `flow-text-${index}`, text: flowResponse.text, from: 'assistant' }}
                                widgetConfig={widgetConfig}
                                assistantName={assistantName}
                                showMessageAvatars={showMessageAvatars}
                                textColor={textColor}
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
                                        backgroundColor: isClicked ? '#9ca3af' : primaryColor,
                                        borderRadius: `${buttonBorderRadius}px`,
                                        ...fontStyles
                                      }}
                                      className={`w-fit px-3 py-2 text-white text-sm transition-opacity flex items-center gap-2 ${
                                        isClicked ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'
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

                    {showTypingIndicator && isTyping && (
                      <div className="flex justify-start" role="status" aria-live="polite">
                        <div className="flex items-start gap-2">
                          {showMessageAvatars && widgetConfig?.bot_avatar && (
                            <img src={widgetConfig.bot_avatar} alt={(assistantName || getText(widgetConfig?.title) || 'assistant') + ' avatar'} className="w-8 h-8 rounded-full object-cover shrink-0" />
                          )}
                          <div className="p-3" style={{ backgroundColor: '#e5e7eb', color: textColor, borderRadius: `${messageBubbleRadius}px` }}>
                            <span style={{ position: 'absolute', left: '-9999px' }}>{translate(locale, 'assistantTyping')}</span>
                            <div className="flex space-x-1">
                              <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse"></div>
                              <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                              <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Feedback Dialog Overlay for Embedded View */}
              {showFeedbackDialog && feedbackDialog && (
                <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 animate-fade-in">
                  <div className="max-w-md w-full">
                    {feedbackDialog}
                  </div>
                </div>
              )}

              {/* Unsure Messages Modal Overlay for Embedded View */}
              {unsureModal && (
                <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 animate-fade-in">
                  <div className="max-w-md w-full">
                    {unsureModal}
                  </div>
                </div>
              )}

              {/* Handoff Modal Overlay for Embedded View */}
              {handoffModal && (
                <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                  <div className="max-w-md w-full">
                    {handoffModal}
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="p-3 border-t">
                <div className="flex space-x-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={(getText(widgetConfig?.placeholder) || t.typeYourMessage || translate(locale, 'typeYourMessage')) as unknown as string}
                    aria-label={(t.typeYourMessageLabel || translate(locale, 'typeYourMessageLabel')) as unknown as string}
                    className="flex-1 p-2 border focus:outline-none focus:ring-2"
                    style={{
                      borderRadius: `${buttonBorderRadius}px`,
                      borderColor: primaryColor,
                      ...fontStyles
                    }}
                    disabled={isTyping}
                    tabIndex={0}
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || isTyping}
                    style={{
                      backgroundColor: primaryColor,
                      borderRadius: `${buttonBorderRadius}px`,
                      ...fontStyles
                    }}
                    className="px-4 py-2 text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                    tabIndex={0}
                  >
                    {translate(locale, 'send')}
                  </button>
                </div>
              </form>
              <div className="p-2 text-center text-xs text-gray-500">
                {poweredByLabel}<a href="https://companin.tech" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">{COMPANY_NAME}</a>
              </div>
            </div>
          </div>
          )}
        </>
      ) : (
        <>
          {isCollapsed ? (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={openChatLabel}
              style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 999999,
                backgroundColor: primaryColor,
                borderRadius: `${buttonBorderRadius * 2}px`,
                ...fontStyles
              }}
              className={`${btnWidth} ${btnHeight} text-white shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-105 hover:opacity-90`}
              title={typeof t.openChat === 'string' ? t.openChat : String(t.openChat)}
            >
                {widgetConfig?.bot_avatar ? (
                  <img src={widgetConfig.bot_avatar} alt={(assistantName || getText(widgetConfig?.title) || 'assistant') + ' avatar'} className={`${btnIcon} rounded-full object-cover`} />
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
                <div className="text-white p-3 flex items-center justify-between" style={{ backgroundColor: primaryColor, borderRadius: `${borderRadius}px` }}>
                  <div className="flex items-center gap-3">
                    {widgetConfig?.logo && (
                      <img src={widgetConfig.logo} alt={(getText(widgetConfig?.title) || title || 'logo') + ' logo'} className="w-10 h-10 object-contain rounded" />
                    )}
                    <div className="flex flex-col">
                      <h3 className="font-semibold">{getText(widgetConfig?.title) || title || translate(locale, 'chat')}</h3>
                      <p className="text-sm text-gray-300">{getText(widgetConfig?.subtitle)}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={toggleCollapsed}
                    style={{ backgroundColor: secondaryColor }}
                    className="w-6 h-6 rounded flex items-center justify-center transition-opacity hover:opacity-90"
                    title={typeof t.minimizeChat === 'string' ? t.minimizeChat : String(t.minimizeChat)}
                    aria-label={minimizeChatLabel}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6,9 12,15 18,9" />
                    </svg>
                  </button>
                </div>

                {error && (
                  <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-3 mx-3 mt-3 rounded" role="alert">
                    <p className="text-sm">{error}</p>
                  </div>
                )}

                {isOffline && (
                  <div role="status" aria-live="polite" className="flex items-center gap-2 mx-3 mt-3 px-3 py-2 rounded text-xs" style={{ background: '#f0f9ff', border: '1px solid #7dd3fc', color: '#0c4a6e' }}>
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 102 0V6zm-1 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                    </svg>
                    <span><strong className="mr-1">You&apos;re offline.</strong>Messages will be sent when your connection is restored.</span>
                  </div>
                )}

                {sessionExpiredBanner && (
                  <div role="status" aria-live="polite" className="flex items-center justify-between gap-2 mx-3 mt-3 px-3 py-2 rounded text-xs" style={{ background: '#fef3c7', border: '1px solid #fcd34d', color: '#78350f' }}>
                    <span><strong className="mr-1">{translate(locale, 'sessionExpiredTitle')}</strong>{translate(locale, 'sessionExpiredBody')}</span>
                    {onDismissSessionExpiredBanner && (
                      <button type="button" onClick={onDismissSessionExpiredBanner} aria-label={translate(locale, 'sessionExpiredDismiss')} style={{ background: 'transparent', border: 'none', color: '#78350f', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 2 }}>×</button>
                    )}
                  </div>
                )}

                <div
                  ref={scrollContainerRef}
                  className="flex-1 overflow-y-auto p-3 space-y-3"
                  role="log"
                  aria-live="polite"
                  aria-relevant="additions text"
                  aria-atomic="false"
                  aria-label={translate(locale, 'chatMessages')}
                >

                  {showGreeting && (
                    <div className="flex flex-col items-start w-full">
                      <div className="flex items-start gap-2">
                        {widgetConfig?.bot_avatar && (
                          <img src={widgetConfig.bot_avatar} alt={(assistantName || getText(widgetConfig?.title) || 'assistant') + ' avatar'} className="w-8 h-8 rounded-full object-cover shrink-0" />
                        )}
                        <div className="max-w-[80%] p-2 bg-gray-200" style={{ color: textColor, borderRadius: `${messageBubbleRadius}px`, ...fontStyles }}>
                          {greetingText}
                        </div>
                      </div>
                    </div>
                  )}

                  {showButtons && (
                    <div className="flex flex-col gap-2" style={{ marginInlineStart: widgetConfig?.bot_avatar ? '40px' : '0' }}>
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

                  {mergedContent.map((item, index) => {
                    if (item.type === 'message') {
                      const message = item.data;
                      return (
                        <div key={message.id} className={`flex w-full ${message.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <MessageBubble
                            message={message}
                            widgetConfig={widgetConfig}
                            assistantName={assistantName}
                            showMessageAvatars={showMessageAvatars}
                            textColor={textColor}
                            fontStyles={fontStyles}
                            messageBubbleRadius={messageBubbleRadius}
                            onSubmitMessageFeedback={onSubmitMessageFeedback}
                            messageFeedbackSubmitted={messageFeedbackSet}
                            showTimestamps={showTimestamps}
                          />
                        </div>
                      );
                    } else {
                      const flowResponse = item.data;
                      return (
                        <div key={`flow-${index}`} className="space-y-2">
                          {flowResponse.text && (
                            <MessageBubble
                              message={{ id: `flow-text-${index}`, text: flowResponse.text, from: 'assistant' }}
                              widgetConfig={widgetConfig}
                              assistantName={assistantName}
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
                                      backgroundColor: isClicked ? '#9ca3af' : primaryColor,
                                      borderRadius: `${buttonBorderRadius}px`,
                                      ...fontStyles
                                    }}
                                    className={`w-fit px-3 py-2 text-white text-sm transition-opacity flex items-center gap-2 ${
                                      isClicked ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'
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

                  {isTyping && (
                    <div className="flex justify-start" role="status" aria-live="polite">
                      <div className="p-3" style={{ backgroundColor: '#e5e7eb', color: textColor, borderRadius: `${messageBubbleRadius}px` }}>
                        <span style={{ position: 'absolute', left: '-9999px' }}>{translate(locale, 'assistantTyping')}</span>
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse"></div>
                          <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                          <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Feedback Dialog Overlay */}
                {showFeedbackDialog && feedbackDialog && (
                  <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 animate-fade-in">
                    <div className="max-w-md w-full">
                      {feedbackDialog}
                    </div>
                  </div>
                )}

                {/* Unsure Messages Modal Overlay */}
                {unsureModal && (
                  <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 animate-fade-in">
                    <div className="max-w-md w-full">
                      {unsureModal}
                    </div>
                  </div>
                )}

                {/* Handoff Modal Overlay */}
                {handoffModal && (
                  <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="max-w-md w-full">
                      {handoffModal}
                    </div>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="p-3 border-t">
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={(getText(widgetConfig?.placeholder) || t.typeYourMessage || translate(locale, 'typeYourMessage')) as unknown as string}
                      aria-label={(t.typeYourMessageLabel || translate(locale, 'typeYourMessageLabel')) as unknown as string}
                      className="flex-1 p-2 border focus:outline-none focus:ring-2"
                      style={{
                        borderRadius: `${buttonBorderRadius}px`,
                        borderColor: primaryColor,
                        ...fontStyles
                      }}
                      disabled={isTyping}
                    />
                    <button
                      type="submit"
                      disabled={!input.trim() || isTyping}
                      style={{
                        backgroundColor: primaryColor,
                        borderRadius: `${buttonBorderRadius}px`,
                        ...fontStyles
                      }}
                      className="px-4 py-2 text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {translate(locale, 'send')}
                    </button>
                  </div>
                </form>
                <div className="p-2 text-center text-xs text-gray-500">
                  {poweredByLabel}<a href="https://companin.tech" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">{COMPANY_NAME}</a>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      {unsureModal}
    </>
  );
}
