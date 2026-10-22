
'use client';

import React from 'react';
import InteractionButtons from './InteractionButtons';
import MessageBubble from './MessageBubble';
import DynamicIcon from './DynamicIcon';
import { t as translate } from '../lib/i18n';
import type { FlowButton } from '../types/widget';
import { hexToRgb, getReadableTextColor, withAlpha } from '../lib/colors';
import { PoweredByFooter } from './components/PoweredByFooter';
import { FOCUS_RING } from './EmbedShell.constants';
import { FocusTrap } from './components/FocusTrap';
import { Suggestions } from './components/Suggestions';
import { TypingIndicator } from './components/TypingIndicator';
import { StatusBanners } from './components/StatusBanners';
import { JumpToLatest } from './components/JumpToLatest';
import { Composer } from './components/Composer';
import { EmptyStatePrompt } from './components/EmptyStatePrompt';
import type { ClassicShellVM } from './EmbedShell.useClassicShell';

export function FloatingView({ vm }: { vm: ClassicShellVM }) {
  const {
    isCollapsed,
    toggleCollapsed,
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
    showFeedbackDialog,
    feedbackDialog,
    onSubmitMessageFeedback,
    onRichAction,
    unsureModal,
    handoffModal,
    leadCaptureCard,
    onCloseUnsureModal,
    onDismissHandoff,
    sessionExpiredBanner,
    onDismissSessionExpiredBanner,
    isOffline,
    previewPositioning,
    fileUploadEnabled,
    pendingAttachments,
    uploadingFiles,
    onPickFiles,
    onRemoveAttachment,
    locale,
    t,
    messageFeedbackSet,
    clickedButtons,
    getButtonId,
    scrollContainerRef,
    inputRef,
    launcherRef,
    showJumpButton,
    scrollToBottom,
    handleFormSubmit,
    primaryColor,
    secondaryColor,
    backgroundColor,
    textColor,
    readableOnPrimary,
    mutedTextColor,
    subtleBorderColor,
    agentBubbleBg,
    borderRadius,
    panelShadow,
    fontStyles,
    widgetWidth,
    widgetHeight,
    messageBubbleRadius,
    buttonBorderRadius,
    backgroundOpacity,
    showTimestamps,
    showMessageAvatars,
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
    minimizeChatLabel,
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
                  ...(previewPositioning
                    ? {
                        inset: 0,
                        margin: '24px auto',
                        width: `${widgetWidth}px`,
                        height: `${widgetHeight}px`,
                        maxWidth: '100%',
                        maxHeight: 'calc(100% - 48px)',
                      }
                    : {
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: `${widgetWidth}px`,
                        height: `${widgetHeight}px`,
                      }),
                  zIndex: 999999,
                  boxShadow: panelShadow,
                  borderRadius: `${borderRadius}px`,
                  overflow: 'hidden',
                  backgroundColor: 'transparent',
                  transition: '0.3s'
                }}
                className={!previewPositioning && openAnimation !== 'none' ? `widget-panel--${openAnimation}` : undefined}
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
                    {themeToggle}
                    {languageMenu}
                    <button
                      type="button"
                      onClick={toggleCollapsed}
                      style={{ backgroundColor: secondaryColor, ['--tw-ring-color' as string]: headerTextColor, ['--tw-ring-offset-color' as string]: primaryColor }}
                      className={`w-11 h-11 rounded flex items-center justify-center transition-opacity hover:opacity-90 ${FOCUS_RING}`}
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
                    onRetry={onRetrySend}
                    isOffline={isOffline}
                    sessionExpired={sessionExpiredBanner}
                    onDismissSessionExpired={onDismissSessionExpiredBanner}
                    {...bannerLabels}
                  />
                  {consentBanner}
  
                  <div
                    ref={scrollContainerRef}
                    className={`flex-1 overflow-y-auto overscroll-contain flex flex-col [&>*:first-child]:mt-auto p-3 space-y-3${messageAnimation !== 'none' ? ` widget-messages--${messageAnimation}` : ''}`}
                    role="log"
                    aria-live="polite"
                    aria-relevant="additions text"
                    aria-atomic="false"
                    aria-label={translate(locale, 'chatMessages')}
                    style={{ padding: spacingValues.padding, rowGap: spacingValues.gap }}
                  >

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
                              backgroundColor={backgroundColor}
                              textColor={textColor}
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
                                agentBubbleBg={agentBubbleBg}
                                backgroundColor={backgroundColor}
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
                                  backgroundColor={backgroundColor}
                                  textColor={textColor}
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
                                backgroundColor={backgroundColor}
                                fontStyles={fontStyles}
                                messageBubbleRadius={messageBubbleRadius}
                                showTimestamps={false}
                              />
                            )}
                            {flowResponse.buttons.length > 0 && (
                              <div className="flex flex-col gap-2" style={{ marginInlineStart: widgetConfig?.bot_avatar ? '40px' : '0' }}>
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
                          backgroundColor={backgroundColor}
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
                    {/* Pinned to the end of the flow rather than inserted next
                        to the message that triggered it: the offer stays
                        visible if the visitor keeps typing. */}
                    {leadCaptureCard}
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
