
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
import { PoweredByFooter } from './components/PoweredByFooter';
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
import { EmptyStatePrompt } from './components/EmptyStatePrompt';
import MinimalEmbedShell from './layouts/MinimalEmbedShell';
import PanelEmbedShell from './layouts/PanelEmbedShell';

// Dispatches to the runtime-selected layout shell. Kept hook-free so the
// variant branch happens before any hooks run — the classic layout's hooks
// live in ClassicEmbedShell, which only mounts for the 'classic' variant.
import type { ClassicShellVM } from './EmbedShell.useClassicShell';

export function EmbeddedView({ vm }: { vm: ClassicShellVM }) {
  const {
    isCollapsed,
    toggleCollapsed,
    messages,
    isTyping,
    onStopStreaming,
    streamingMessage,
    input,
    setInput,
    error,
    onRetrySend,
    title,
    agentName,
    widgetConfig,
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
    sessionExpiredBanner,
    onDismissSessionExpiredBanner,
    isOffline,
    previewPositioning,
    showTeaser,
    teaserExpanded,
    teaserConfigured,
    teaserMessage,
    onDismissTeaser,
    fileUploadEnabled,
    pendingAttachments,
    uploadingFiles,
    onPickFiles,
    onRemoveAttachment,
    locale,
    messageFeedbackSet,
    clickedButtons,
    getButtonId,
    scrollContainerRef,
    inputRef,
    launcherRef,
    teaserBubbleRef,
    showJumpButton,
    handleScroll,
    scrollToBottom,
    handleFormSubmit,
    showSkeleton,
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
    btnWidth,
    btnHeight,
    btnIcon,
    previewLauncherPos,
    headerTextColor,
    getText,
    handleInteractionButtonClickWrapper,
    handleFollowUpButtonClickWrapper,
    showGreeting,
    greetingText,
    displayGreetingText,
    interactionButtons,
    showButtons,
    suggestionList,
    showSuggestions,
    handleSuggestionClick,
    mergedContent,
    openChatLabel,
    closeChatLabel,
    poweredByLabel,
    jumpToLatestLabel,
    placeholderText,
    composerAriaLabel,
    sendLabel,
    stopLabel,
    languageMenu,
    themeToggle,
    agentTypingLabel,
    botAvatarSrc,
    botAvatarAlt,
    bannerLabels,
    consentBanner,
  } = vm;
  return (
    <>
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
                        // Theme-aware: use the resolved surface/text so the teaser
                        // stays readable in dark/system themes (was hardcoded #fff,
                        // which paired with the light dark-theme text = invisible).
                        backgroundColor,
                        color: textColor,
                        border: `1px solid ${subtleBorderColor}`,
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
                          color: mutedTextColor,
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
                          backgroundColor,
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
                      <UnreadBadge count={unreadCount} variant="prominent" />
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
                      <UnreadBadge count={unreadCount} variant="prominent" />
                    )}
                </button>
              )
            ) : (
              <div
                data-ignore-reduced-motion={!respectReducedMotion ? 'true' : undefined}
                style={{
                  position: 'fixed',
                  ...(previewPositioning
                    ? {
                        inset: 0,
                        margin: '24px auto',
                        width: `${widgetWidth}px`,
                        height: `${widgetHeight}px`,
                        maxWidth: '100%',
                        maxHeight: 'calc(100% - 48px)'
                      }
                    : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '100%', height: '100%', maxWidth: `${widgetWidth}px`, maxHeight: `${widgetHeight}px` }),
                  zIndex: 999999,
                  boxShadow: 'rgba(0, 0, 0, 0.2) 0px 10px 40px',
                  borderRadius: `${borderRadius}px`,
                  overflow: 'hidden',
                  backgroundColor: 'transparent',
                  transition: '0.3s',
                  boxSizing: 'border-box'
                }}
                className={!previewPositioning && openAnimation !== 'none' ? `widget-panel--${openAnimation}` : undefined}
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
                    {themeToggle}
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
                  onRetry={onRetrySend}
                  isOffline={isOffline}
                  sessionExpired={sessionExpiredBanner}
                  onDismissSessionExpired={onDismissSessionExpiredBanner}
                  {...bannerLabels}
                />
                {consentBanner}
  
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
                      {!(showGreeting && greetingText) && !showSuggestions && mergedContent.length === 0 && !isTyping && !streamingMessage && (
                        <EmptyStatePrompt
                          label={translate(locale, 'emptyStatePrompt')}
                          textColor={textColor}
                          mutedTextColor={mutedTextColor}
                          fontStyles={fontStyles}
                        />
                      )}
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
                                  onRichAction={onRichAction}
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
                                  {flowResponse.buttons
                                  // Drop only genuinely unlabelled buttons. These views
                                  // also render an icon, which counts as a label — the
                                  // old code showed the literal word "Button" for both.
                                  .filter((button: FlowButton) => !!getText(button.label) || !!button.icon)
                                  .map((button: FlowButton) => {
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
                                        {getText(button.label)}
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
                  {/* Pinned to the end of the flow rather than inserted next to
                      the message that triggered it: the offer stays visible if
                      the visitor keeps typing, instead of scrolling away. */}
                  {leadCaptureCard}
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
                  textColor={textColor}
                  mutedTextColor={mutedTextColor}
                  inputBackgroundColor={agentBubbleBg}
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
                    removeAttachmentLabel={translate(locale, 'removeAttachmentNamed')}
                />
                {!widgetConfig?.hide_branding && (
                  <PoweredByFooter
                    locale={locale}
                    textColor={textColor}
                    mutedTextColor={mutedTextColor}
                    poweredByLabel={poweredByLabel}
                  />
                )}
              </div>
            </div>
            )}
          </>
    </>
  );
}
