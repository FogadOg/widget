'use client';

import React from 'react';
import { t as translate } from '../../lib/i18n';
import { useWidgetTranslation } from '../../hooks/useWidgetTranslation';
import { useWidgetStyles } from '../../hooks/useWidgetStyles';
import { useShellChrome } from '../../hooks/useShellChrome';
import type { FlowButton } from '../../types/widget';
import type { Props } from '../EmbedShell.types';
import { UnreadBadge } from '../UnreadBadge';
import { FOCUS_RING } from '../EmbedShell.constants';
import MessageBubble from '../MessageBubble';
import { Suggestions } from '../components/Suggestions';
import { EmptyStatePrompt } from '../components/EmptyStatePrompt';
import { TeaserAnchor } from '../components/TeaserBubble';
import { TypingIndicator } from '../components/TypingIndicator';
import { Composer } from '../components/Composer';
import { LanguageMenu } from '../components/LanguageMenu';
import { ShellGreeting } from '../components/ShellGreeting';
import { isServerGreetingMessage } from '../../lib/greeting';
import { ThemeToggleButton } from '../components/ThemeToggleButton';
import { StatusBanners } from '../components/StatusBanners';
import { useShellFocus } from '../components/useShellFocus';
import { ConsentBanner } from '../components/ConsentBanner';
import { JumpToLatest } from '../components/JumpToLatest';
import { FocusTrap } from '../components/FocusTrap';
import { PoweredByFooter } from '../components/PoweredByFooter';

export default function MinimalEmbedShell(props: Props) {
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
    agentName,
    widgetConfig,
    title,
    getLocalizedText,
    flowResponses = [],
    onInteractionButtonClick,
    onFollowUpButtonClick,
    unreadCount = 0,
    locale: localeProp,
    availableLocales = [],
    onLocaleChange,
    onToggleTheme,
    previewPositioning = false,
    showTeaser = false,
    teaserExpanded = false,
    teaserConfigured = false,
    teaserMessage = null,
    onTeaserMeasure,
    onDismissTeaser,
    isPreview = false,
    fileUploadEnabled = false,
    pendingAttachments = [],
    uploadingFiles = 0,
    onPickFiles,
    onRemoveAttachment,
    messageFeedbackSubmitted,
    onSubmitMessageFeedback,
    onRichAction,
    leadCaptureCard,
    error,
    onRetrySend,
    isOffline,
    sessionExpiredBanner,
    onDismissSessionExpiredBanner,
    showConsentPrompt,
    onConsentAccept,
    onConsentDecline,
    hideCloseButton,
    unsureModal,
    onCloseUnsureModal,
    handoffModal,
    onDismissHandoff,
    showFeedbackDialog,
    feedbackDialog,
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
    secondaryColor,
    backgroundColor,
    textColor,
    readableOnPrimary,
    mutedTextColor,
    subtleBorderColor,
    agentBubbleBg,
    borderRadius,
    fontStyles,
    getButtonSizeClasses,
    panelShadow,
    widgetWidth,
    widgetHeight,
    messageBubbleRadius,
    buttonBorderRadius,
    showTimestamps,
    showTypingIndicator,
    showMessageAvatars,
    showUnreadBadge,
    spacingValues,
    isDarkTheme,
  } = useWidgetStyles(widgetConfig);

  const { width: btnWidth, height: btnHeight, icon: btnIcon } = getButtonSizeClasses;
  const getText = (textObj: Record<string, string> | string | undefined) => {
    if (getLocalizedText) return getLocalizedText(textObj as Record<string, string>);
    if (typeof textObj === 'string') return textObj;
    return textObj?.en || '';
  };

  const interactionButtons = (widgetConfig?.greeting_message?.buttons || []).filter((item) => {
    const langs = item.languages;
    if (!langs || langs.length === 0) return true;
    const base = locale.split('-')[0];
    return langs.includes(locale) || langs.includes(base);
  });

  // Always pin the greeting when configured. The backend also persists it as an
  // is_greeting chat message once a conversation exists; that copy is filtered out
  // of mergedContent below so the greeting never doubles or vanishes on send.
  const showGreeting = !!widgetConfig?.greeting_message;
  const greetingText = showGreeting ? getText(widgetConfig?.greeting_message?.text) : '';

  const rawSuggestions = widgetConfig?.suggestions;
  const suggestionList: string[] = Array.isArray(rawSuggestions)
    ? rawSuggestions
    : rawSuggestions
      ? rawSuggestions[locale] || rawSuggestions[locale.split('-')[0]] || rawSuggestions.en || []
      : [];
  const hasUserMessage = messages.some((m) => m.from === 'user');
  const showSuggestions = suggestionList.length > 0 && !hasUserMessage && !isTyping;

  const openLabel = unreadCount > 0
    ? `${translate(locale, 'chatControl', { context: 'open' })} (${unreadCount})`
    : translate(locale, 'chatControl', { context: 'open' });
  const languageMenu = onLocaleChange && availableLocales.length >= 2 ? (
    <LanguageMenu
      locale={locale}
      locales={availableLocales}
      onChange={onLocaleChange}
      label={translate(locale, 'selectLanguage')}
      // This header sits on the panel background beside bordered controls,
      // not on a brand-colored bar: a solid pill was its loudest element.
      variant="subtle"
      compact
      headerTextColor={readableOnPrimary}
      secondaryColor={secondaryColor}
      primaryColor={primaryColor}
      backgroundColor={backgroundColor}
      textColor={textColor}
      borderColor={subtleBorderColor}
      fontStyles={fontStyles}
      borderRadius={borderRadius}
    />
  ) : null;

  const mergedContent = [
    ...messages
      .filter((msg) => !isServerGreetingMessage(msg))
      .map((msg) => ({ type: 'message' as const, data: msg, timestamp: msg.timestamp || 0 })),
    ...flowResponses.map((flow) => ({ type: 'flow' as const, data: flow, timestamp: flow.timestamp || 0 })),
  ].sort((a, b) => a.timestamp - b.timestamp);

  const handleSubmitWrapper = (e: React.FormEvent, messageText?: string) => {
    void Promise.resolve(handleSubmit(e, messageText)).catch(() => {});
  };

  // Focus the composer on open and return focus to the launcher on close.
  // Shared with the classic shell so the three layouts stay in step.
  const launcherRef = React.useRef<HTMLButtonElement | null>(null);
  useShellFocus({ isCollapsed, inputRef, launcherRef });

  if (isCollapsed && teaserConfigured && !previewPositioning) {
    const anchoredButton = (
      <button
        type="button"
        ref={launcherRef}
        onClick={toggleCollapsed}
        aria-label={openLabel}
        aria-expanded={false}
        style={{
          position: 'relative',
          backgroundColor: primaryColor,
          color: readableOnPrimary,
          borderRadius: '12px',
          ...fontStyles,
        }}
        className={`${btnWidth} ${btnHeight} shadow-lg flex items-center justify-center ${FOCUS_RING}`}
      >
        {widgetConfig?.logo ? (
          <img src={widgetConfig.logo} alt={(getText(widgetConfig?.title) || title || 'logo') + ' logo'} className={`${btnIcon} object-contain`} />
        ) : (
          <svg className={btnIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z" />
          </svg>
        )}
        {showUnreadBadge && unreadCount > 0 && (
          <UnreadBadge count={unreadCount} variant="compact" />
        )}
      </button>
    );
    return (
      <TeaserAnchor
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
      >
        {anchoredButton}
      </TeaserAnchor>
    );
  }

  if (isCollapsed) {
    return (
      <button
        type="button"
        ref={launcherRef}
        onClick={toggleCollapsed}
        aria-label={openLabel}
        aria-expanded={false}
        style={{
          position: 'fixed',
          ...(previewPositioning
            ? { bottom: '20px', right: '20px' }
            : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }),
          zIndex: 999999,
          backgroundColor: primaryColor,
          color: readableOnPrimary,
          borderRadius: '12px',
          ...fontStyles,
        }}
        className={`${btnWidth} ${btnHeight} shadow-lg flex items-center justify-center ${FOCUS_RING}`}
      >
        {widgetConfig?.logo ? (
          <img src={widgetConfig.logo} alt={(getText(widgetConfig?.title) || title || 'logo') + ' logo'} className={`${btnIcon} object-contain`} />
        ) : (
          <svg className={btnIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z" />
          </svg>
        )}
        {showUnreadBadge && unreadCount > 0 && (
          <UnreadBadge count={unreadCount} variant="compact" />
        )}
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
        boxShadow: panelShadow,
        backgroundColor,
      }}
    >
      <div className="h-full flex flex-col" style={fontStyles}>
        <div className="px-3 py-2 flex items-center justify-between border-b" style={{ borderColor: subtleBorderColor }}>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: textColor }}>{getText(widgetConfig?.title) || title || translate(locale, 'chat')}</h3>
            <p className="text-xs" style={{ color: mutedTextColor }}>{getText(widgetConfig?.subtitle)}</p>
          </div>
          <div className="flex items-center gap-1.5">
            {onToggleTheme && (
              <ThemeToggleButton
                isDark={isDarkTheme}
                onToggle={onToggleTheme}
                label={translate(locale, 'themeToggle')}
                className={`w-11 h-11 rounded border flex items-center justify-center ${FOCUS_RING}`}
                style={{ borderColor: subtleBorderColor, color: textColor }}
              />
            )}
            {languageMenu}
            {/* Minimize, not close — the label used to say "close" while the
                handler collapsed, and the glyph was a bare "-" text character. */}
            <button
              type="button"
              onClick={toggleCollapsed}
              className={`w-11 h-11 rounded border flex items-center justify-center ${FOCUS_RING}`}
              style={{ borderColor: subtleBorderColor, color: textColor }}
              aria-label={translate(locale, 'chatControl', { context: 'minimize' })}
              title={translate(locale, 'chatControl', { context: 'minimize' })}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M5 12h14" />
              </svg>
            </button>
          </div>
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

        <div className="relative flex-1 min-h-0 flex flex-col">
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto overscroll-contain flex flex-col [&>*:first-child]:mt-auto"
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          aria-atomic="false"
          aria-label={translate(locale, 'chatMessages')}
          style={{ padding: spacingValues.padding }}
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
            <ShellGreeting
              text={greetingText}
              buttons={interactionButtons}
              onButtonClick={onInteractionButtonClick}
              borderColor={subtleBorderColor}
              bubbleBackground={agentBubbleBg}
              bubbleRadius={messageBubbleRadius}
              primaryColor={primaryColor}
              buttonBorderRadius={buttonBorderRadius}
              fontStyles={fontStyles}
              getLocalizedText={getText}
              backgroundColor={backgroundColor}
              textColor={textColor}
            />
          )}

          {showSuggestions && (
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
              <div key={item.data.id} className={`mb-2 flex ${item.data.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                <MessageBubble
                  message={item.data}
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
                  messageFeedbackSubmitted={messageFeedbackSubmitted}
                  showTimestamps={showTimestamps}
                />
              </div>
            ) : (
              <div key={`flow-${index}`} className="mb-2 space-y-2">
                {item.data.text && (
                  <MessageBubble
                    message={{ id: `flow-text-${index}`, text: item.data.text, from: 'agent' }}
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

          {streamingMessage ? (
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
          ) : (showTypingIndicator && isTyping && (
            <TypingIndicator
              agentBubbleBg={agentBubbleBg}
              textColor={textColor}
              mutedTextColor={mutedTextColor}
              messageBubbleRadius={messageBubbleRadius}
              showAvatar={showMessageAvatars}
              avatarSrc={widgetConfig?.bot_avatar}
              avatarAlt={(agentName || getText(widgetConfig?.title) || 'agent') + ' avatar'}
              label={translate(locale, 'agentTyping')}
            />
          ))}

          {/* Pinned to the end of the flow rather than inserted next to the
              message that triggered it: the offer stays visible if the visitor
              keeps typing, instead of scrolling out of view. */}
          {leadCaptureCard}
          {/* Inside the scroll container: the pill is `position: sticky`, so it
              only pins correctly against the element that actually scrolls. */}
          {showJumpButton && (
            <JumpToLatest
              onClick={scrollToBottom}
              label={translate(locale, 'jumpToLatest')}
              primaryColor={primaryColor}
            />
          )}
        </div>
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

      {/* This shell rendered none of these before: the handoff modal, the
          feedback dialog and the unsure-messages modal were all wired up in the
          controller but had nowhere to appear, so on `minimal` the escalation
          flow silently dead-ended. */}
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
