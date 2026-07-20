'use client';

import React, { useMemo, useRef } from 'react';
import { t as translate } from '../../lib/i18n';
import { useWidgetTranslation } from '../../hooks/useWidgetTranslation';
import { useWidgetStyles } from '../../hooks/useWidgetStyles';
import type { FlowButton } from '../../types/widget';
import type { Props } from '../EmbedShell.types';
import { FOCUS_RING } from '../EmbedShell.constants';
import MessageBubble from '../MessageBubble';
import InteractionButtons from '../InteractionButtons';
import { Suggestions } from '../components/Suggestions';
import { TypingIndicator } from '../components/TypingIndicator';
import { Composer } from '../components/Composer';
import { LanguageMenu } from '../components/LanguageMenu';

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
    previewPositioning = false,
    isPreview = false,
    fileUploadEnabled = false,
    pendingAttachments = [],
    uploadingFiles = 0,
    onPickFiles,
    onRemoveAttachment,
    messageFeedbackSubmitted,
    onSubmitMessageFeedback,
  } = props;

  const { locale: hookLocale } = useWidgetTranslation();
  const locale = localeProp || hookLocale;
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
    widgetWidth,
    widgetHeight,
    messageBubbleRadius,
    buttonBorderRadius,
    showTimestamps,
    showTypingIndicator,
    showMessageAvatars,
    showUnreadBadge,
    spacingValues,
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

  const showGreeting =
    !!widgetConfig?.greeting_message &&
    (isPreview || (messages.length === 0 && flowResponses.length === 0));
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
    ...messages.map((msg) => ({ type: 'message' as const, data: msg, timestamp: msg.timestamp || 0 })),
    ...flowResponses.map((flow) => ({ type: 'flow' as const, data: flow, timestamp: flow.timestamp || 0 })),
  ].sort((a, b) => a.timestamp - b.timestamp);

  const handleSubmitWrapper = (e: React.FormEvent, messageText?: string) => {
    void Promise.resolve(handleSubmit(e, messageText)).catch(() => {});
  };

  if (isCollapsed) {
    return (
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={openLabel}
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
          <span className="absolute -top-1 -right-1 rounded-full bg-red-500 text-white text-xs px-1.5 py-0.5">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
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
        boxShadow: 'rgba(0, 0, 0, 0.2) 0px 10px 40px',
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
            {languageMenu}
            <button
              type="button"
              onClick={toggleCollapsed}
              className={`w-7 h-7 rounded border ${FOCUS_RING}`}
              style={{ borderColor: subtleBorderColor, color: textColor }}
              aria-label={translate(locale, 'chatControl', { context: 'close' })}
            >
              -
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ padding: spacingValues.padding }}>
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
                  fontStyles={fontStyles}
                  messageBubbleRadius={messageBubbleRadius}
                  onSubmitMessageFeedback={onSubmitMessageFeedback}
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
                    fontStyles={fontStyles}
                    messageBubbleRadius={messageBubbleRadius}
                    showTimestamps={false}
                  />
                )}
                {item.data.buttons.map((button: FlowButton) => (
                  <button
                    key={button.id}
                    type="button"
                    onClick={() => { if (onFollowUpButtonClick) void onFollowUpButtonClick(button); }}
                    className={`px-3 py-2 text-sm rounded ${FOCUS_RING}`}
                    style={{ backgroundColor: primaryColor, color: readableOnPrimary, borderRadius: `${buttonBorderRadius}px` }}
                  >
                    {getText(button.label) || 'Button'}
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
        />
      </div>
    </div>
  );
}
