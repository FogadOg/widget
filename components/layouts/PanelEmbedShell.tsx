'use client';

import React from 'react';
import { t as translate } from '../../lib/i18n';
import { useWidgetTranslation } from '../../hooks/useWidgetTranslation';
import { useWidgetStyles } from '../../hooks/useWidgetStyles';
import { useShellChrome } from '../../hooks/useShellChrome';
import type { FlowButton } from '../../types/widget';
import type { Props } from '../EmbedShell.types';
import { FOCUS_RING } from '../EmbedShell.constants';
import MessageBubble from '../MessageBubble';
import InteractionButtons from '../InteractionButtons';
import { Composer } from '../components/Composer';
import { Suggestions } from '../components/Suggestions';
import { EmptyStatePrompt } from '../components/EmptyStatePrompt';
import { TeaserBubble } from '../components/TeaserBubble';
import { ThemeToggleButton } from '../components/ThemeToggleButton';
import { StatusBanners } from '../components/StatusBanners';
import { ConsentBanner } from '../components/ConsentBanner';
import { JumpToLatest } from '../components/JumpToLatest';
import { FocusTrap } from '../components/FocusTrap';
import { PoweredByFooter } from '../components/PoweredByFooter';

export default function PanelEmbedShell(props: Props) {
  const {
    isCollapsed,
    toggleCollapsed,
    messages,
    isTyping,
    streamingMessage = null,
    input,
    setInput,
    handleSubmit,
    onStopStreaming,
    widgetConfig,
    title,
    getLocalizedText,
    flowResponses = [],
    onFollowUpButtonClick,
    onInteractionButtonClick,
    locale: localeProp,
    previewPositioning = false,
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
    showFeedbackDialog = false,
    feedbackDialog,
    unsureModal,
    handoffModal,
    leadCaptureCard,
    messageFeedbackSubmitted,
    onSubmitMessageFeedback,
    onRichAction,
    agentName,
    onToggleTheme,
    error,
    onRetrySend,
    isOffline,
    sessionExpiredBanner,
    onDismissSessionExpiredBanner,
    showConsentPrompt,
    onConsentAccept,
    onConsentDecline,
    hideCloseButton,
    onCloseUnsureModal,
    onDismissHandoff,
  } = props;

  const { locale: hookLocale } = useWidgetTranslation();
  const locale = localeProp || hookLocale;

  // Auto-scroll, jump-to-latest, Escape-to-close and composer focus. Shared with
  // the classic shell so this layout can't silently drift out of parity again.
  const {
    scrollContainerRef,
    inputRef,
    showJumpButton,
    handleScroll,
    scrollToBottom,
  } = useShellChrome({
    isCollapsed,
    toggleCollapsed,
    hideCloseButton,
    scrollDeps: [messages, flowResponses, isTyping, streamingMessage],
    unsureModal,
    onCloseUnsureModal,
    handoffModal,
    onDismissHandoff,
    showFeedbackDialog,
    feedbackDialog,
  });

  const {
    primaryColor,
    backgroundColor,
    textColor,
    readableOnPrimary,
    mutedTextColor,
    subtleBorderColor,
    agentBubbleBg,
    borderRadius,
    fontStyles,
    widgetWidth,
    widgetHeight,
    messageBubbleRadius,
    buttonBorderRadius,
    showTimestamps,
    showMessageAvatars,
    isDarkTheme,
  } = useWidgetStyles(widgetConfig);

  const getText = (textObj: Record<string, string> | string | undefined) => {
    if (getLocalizedText) return getLocalizedText(textObj as Record<string, string>);
    if (typeof textObj === 'string') return textObj;
    return textObj?.en || '';
  };

  const rawSuggestions = widgetConfig?.suggestions;
  const suggestionList: string[] = Array.isArray(rawSuggestions)
    ? rawSuggestions
    : rawSuggestions
      ? rawSuggestions[locale] || rawSuggestions[locale.split('-')[0]] || rawSuggestions.en || []
      : [];

  // Configured greeting + its interaction buttons, pinned the same way the
  // minimal and classic layouts do. This layout used to render neither, so a
  // merchant who picked it silently lost their whole greeting flow — including
  // AI-answered buttons — and visitors got the generic empty-state prompt.
  const interactionButtons = (widgetConfig?.greeting_message?.buttons || []).filter((item) => {
    const langs = item.languages;
    if (!langs || langs.length === 0) return true;
    const base = locale.split('-')[0];
    return langs.includes(locale) || langs.includes(base);
  });
  // The backend also persists the greeting as an is_greeting chat message once a
  // conversation exists; drop that copy so the pinned greeting never doubles.
  const isServerGreetingMessage = (m: { id: string; metadata?: unknown }) =>
    m.id.startsWith('greeting-') ||
    (m.metadata as Record<string, unknown> | undefined)?.is_greeting === true;
  const showGreeting = !!widgetConfig?.greeting_message;
  const greetingText = showGreeting ? getText(widgetConfig?.greeting_message?.text) : '';

  const mergedContent = [
    ...messages
      .filter((msg) => !isServerGreetingMessage(msg))
      .map((msg) => ({ type: 'message' as const, data: msg, timestamp: msg.timestamp || 0 })),
    ...flowResponses.map((flow) => ({ type: 'flow' as const, data: flow, timestamp: flow.timestamp || 0 })),
  ].sort((a, b) => a.timestamp - b.timestamp);

  const handleSubmitWrapper = (e: React.FormEvent, messageText?: string) => {
    void Promise.resolve(handleSubmit(e, messageText)).catch(() => {});
  };

  // A configured teaser needs the launcher anchored to the iframe's bottom-right
  // with the bubble stacked above it (the controller grows the iframe to fit),
  // exactly as the classic layout does. Without this the iframe still grew for
  // the teaser but nothing rendered in it, leaving an invisible click-blocking box.
  if (isCollapsed && teaserConfigured && !previewPositioning) {
    const anchoredButton = (
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={translate(locale, 'chatControl', { context: 'open' })}
        style={{
          position: 'relative',
          backgroundColor: primaryColor,
          color: readableOnPrimary,
          borderRadius: '10px',
          padding: '10px 12px',
          ...fontStyles,
        }}
        className={`shadow-lg ${FOCUS_RING}`}
      >
        {getText(widgetConfig?.title) || title || translate(locale, 'chat')}
      </button>
    );
    return (
      <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 999999, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
        <TeaserBubble
          teaserExpanded={teaserExpanded}
          showTeaser={showTeaser}
          teaserMessage={teaserMessage}
          onTeaserMeasure={onTeaserMeasure}
          onDismissTeaser={onDismissTeaser}
          onOpen={toggleCollapsed}
          locale={locale}
          backgroundColor={backgroundColor}
          textColor={textColor}
          mutedTextColor={mutedTextColor}
          subtleBorderColor={subtleBorderColor}
          fontStyles={fontStyles}
        />
        {anchoredButton}
      </div>
    );
  }

  if (isCollapsed) {
    return (
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={translate(locale, 'chatControl', { context: 'open' })}
        style={{
          position: 'fixed',
          ...(previewPositioning
            ? { bottom: '20px', right: '20px' }
            : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }),
          zIndex: 999999,
          backgroundColor: primaryColor,
          color: readableOnPrimary,
          borderRadius: '10px',
          padding: '10px 12px',
          ...fontStyles,
        }}
        className={`shadow-lg ${FOCUS_RING}`}
      >
        {getText(widgetConfig?.title) || title || translate(locale, 'chat')}
      </button>
    );
  }

  return (
    <div
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
        borderRadius: `${borderRadius}px`,
        overflow: 'hidden',
        boxShadow: 'rgba(0, 0, 0, 0.2) 0px 10px 40px',
        backgroundColor,
      }}
    >
      {/* `minmax(0, 1fr)`, not `1fr`: a bare 1fr track has min-width:auto, so it
          grows to its widest content's min-content size (long unbreakable
          source-card titles) and blew the content column out to ~664px inside a
          300-350px panel — clipping the header and every answer on the right. */}
      <div className="h-full grid" style={{ gridTemplateColumns: '44px minmax(0, 1fr)', ...fontStyles }}>
        <div className="border-r flex flex-col items-center py-2 gap-2" style={{ borderColor: subtleBorderColor }}>
          {/* Minimize, not close — the handler collapses the panel, so the
              label has to say so. */}
          <button
            type="button"
            onClick={toggleCollapsed}
            className={`w-8 h-8 rounded border flex items-center justify-center ${FOCUS_RING}`}
            style={{ borderColor: subtleBorderColor, color: textColor }}
            aria-label={translate(locale, 'chatControl', { context: 'minimize' })}
            title={translate(locale, 'chatControl', { context: 'minimize' })}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M5 12h14" />
            </svg>
          </button>
          {onToggleTheme && (
            <ThemeToggleButton
              isDark={isDarkTheme}
              onToggle={onToggleTheme}
              label={translate(locale, 'themeToggle')}
              className={`w-8 h-8 rounded border flex items-center justify-center ${FOCUS_RING}`}
              style={{ borderColor: subtleBorderColor, color: textColor }}
            />
          )}
          <div className="w-8 h-8 rounded text-xs flex items-center justify-center" style={{ backgroundColor: primaryColor, color: readableOnPrimary }}>
            AI
          </div>
        </div>

        <div className="h-full flex flex-col">
          <div className="px-3 py-2 border-b" style={{ borderColor: subtleBorderColor }}>
            <h3 className="text-sm font-semibold" style={{ color: textColor }}>{getText(widgetConfig?.title) || title || translate(locale, 'chat')}</h3>
            <p className="text-xs" style={{ color: mutedTextColor }}>{getText(widgetConfig?.subtitle)}</p>
          </div>

          <StatusBanners
            error={error}
            onRetry={onRetrySend}
            retryLabel={translate(locale, 'retry')}
            isOffline={isOffline}
            sessionExpired={sessionExpiredBanner}
            onDismissSessionExpired={onDismissSessionExpiredBanner}
            offlineTitle={translate(locale, 'offlineBannerTitle')}
            offlineDesc={translate(locale, 'offlineBannerDesc')}
            sessionExpiredTitle={translate(locale, 'sessionExpiredTitle')}
            sessionExpiredBody={translate(locale, 'sessionExpiredBody')}
            sessionExpiredDismiss={translate(locale, 'sessionExpiredDismiss')}
          />
          {showConsentPrompt && onConsentAccept && onConsentDecline && (
            <ConsentBanner
              title={translate(locale, 'consentNoticeTitle')}
              body={translate(locale, 'consentNoticeBody')}
              acceptLabel={translate(locale, 'consentAccept')}
              declineLabel={translate(locale, 'consentDecline')}
              onAccept={onConsentAccept}
              onDecline={onConsentDecline}
            />
          )}

          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-2"
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
            aria-atomic="false"
            aria-label={translate(locale, 'chatMessages')}
          >
            {!(showGreeting && greetingText) && suggestionList.length === 0 && mergedContent.length === 0 && !isTyping && !streamingMessage && (
              <EmptyStatePrompt
                label={translate(locale, 'emptyStatePrompt')}
                textColor={textColor}
                mutedTextColor={mutedTextColor}
                fontStyles={fontStyles}
              />
            )}
            {showGreeting && greetingText && (
              <div className="mb-3">
                <div className="max-w-[85%] px-3 py-2 border" style={{ borderColor: subtleBorderColor, borderRadius: `${messageBubbleRadius}px`, backgroundColor: agentBubbleBg, color: textColor }}>
                  {greetingText}
                </div>
                {interactionButtons.length > 0 && (
                  <div className="mt-2">
                    <InteractionButtons
                      buttons={interactionButtons}
                      clickedButtons={new Set<string>()}
                      onButtonClick={(button) => { if (onInteractionButtonClick) void onInteractionButtonClick(button); }}
                      primaryColor={primaryColor}
                      buttonBorderRadius={buttonBorderRadius}
                      fontStyles={fontStyles}
                      getLocalizedText={getText}
                    />
                  </div>
                )}
              </div>
            )}
            {suggestionList.length > 0 && messages.length === 0 && !isTyping && (
              <Suggestions
                suggestions={suggestionList}
                onSelect={(text) => handleSubmitWrapper({ preventDefault: () => {} } as React.FormEvent, text)}
                primaryColor={primaryColor}
                buttonBorderRadius={buttonBorderRadius}
                fontStyles={fontStyles}
                indent="0"
              />
            )}

            {mergedContent.map((item, index) => (
              item.type === 'message' ? (
                <div key={item.data.id} className={`flex ${item.data.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <MessageBubble
                    message={item.data}
                    widgetConfig={widgetConfig}
                    agentName={agentName}
                    showMessageAvatars={showMessageAvatars}
                    textColor={textColor}
                    agentBubbleBg={agentBubbleBg}
                    fontStyles={fontStyles}
                    messageBubbleRadius={messageBubbleRadius}
                    onSubmitMessageFeedback={onSubmitMessageFeedback}
                    onRichAction={onRichAction}
                    messageFeedbackSubmitted={messageFeedbackSubmitted}
                    showTimestamps={showTimestamps}
                  />
                </div>
              ) : (
                <div key={`flow-${index}`} className="space-y-2">
                  {item.data.text && (
                    <MessageBubble
                      message={{ id: `flow-text-${index}`, text: item.data.text, from: 'agent' }}
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
                  {item.data.buttons.filter((button: FlowButton) => !!getText(button.label)).map((button: FlowButton) => (
                    <button
                      key={button.id}
                      type="button"
                      onClick={() => { if (onFollowUpButtonClick) void onFollowUpButtonClick(button); }}
                      className={`px-3 py-2 text-sm rounded ${FOCUS_RING}`}
                      style={{ backgroundColor: primaryColor, color: readableOnPrimary, borderRadius: `${buttonBorderRadius}px` }}
                    >
                      {getText(button.label)}
                    </button>
                  ))}
                </div>
              )
            ))}

            {streamingMessage && (
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
            )}

            {/* Pinned to the end of the flow rather than inserted next to the
                message that triggered it: the offer stays visible if the
                visitor keeps typing, instead of scrolling out of view. */}
            {leadCaptureCard}
            {/* Inside the scroll container: the pill is `position: sticky`, so
                it only pins correctly against the element that actually scrolls. */}
            {showJumpButton && (
              <JumpToLatest
                onClick={scrollToBottom}
                label={translate(locale, 'jumpToLatest')}
                primaryColor={primaryColor}
              />
            )}
          </div>

          <Composer
            input={input}
            setInput={setInput}
            onSubmit={handleSubmitWrapper}
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
            placeholder={getText(widgetConfig?.placeholder) || translate(locale, 'typeYourMessage')}
            ariaLabel={translate(locale, 'typeYourMessageLabel')}
            sendLabel={translate(locale, 'send')}
            stopLabel={translate(locale, 'stopStreaming')}
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
            />
          )}
        </div>
      </div>

      {/* FocusTrap on each overlay, matching the classic shell: without it a
          keyboard visitor tabs straight out of the dialog into the page behind. */}
      {showFeedbackDialog && feedbackDialog && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <FocusTrap>
            <div className="max-w-md w-full">{feedbackDialog}</div>
          </FocusTrap>
        </div>
      )}
      {unsureModal && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <FocusTrap onEscape={onCloseUnsureModal}>
            <div className="max-w-md w-full">{unsureModal}</div>
          </FocusTrap>
        </div>
      )}
      {handoffModal && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <FocusTrap onEscape={onDismissHandoff}>
            <div className="max-w-md w-full">{handoffModal}</div>
          </FocusTrap>
        </div>
      )}
    </div>
  );
}
