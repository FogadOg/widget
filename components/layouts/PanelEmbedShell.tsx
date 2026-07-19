'use client';

import React, { useRef } from 'react';
import { t as translate } from '../../lib/i18n';
import { useWidgetTranslation } from '../../hooks/useWidgetTranslation';
import { useWidgetStyles } from '../../hooks/useWidgetStyles';
import type { FlowButton } from '../../types/widget';
import type { Props } from '../EmbedShell.types';
import { FOCUS_RING } from '../EmbedShell.constants';
import MessageBubble from '../MessageBubble';
import { Composer } from '../components/Composer';
import { Suggestions } from '../components/Suggestions';

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
    locale: localeProp,
    previewPositioning = false,
    fileUploadEnabled = false,
    pendingAttachments = [],
    uploadingFiles = 0,
    onPickFiles,
    onRemoveAttachment,
    showFeedbackDialog = false,
    feedbackDialog,
    unsureModal,
    handoffModal,
    messageFeedbackSubmitted,
    onSubmitMessageFeedback,
    agentName,
  } = props;

  const { locale: hookLocale } = useWidgetTranslation();
  const locale = localeProp || hookLocale;
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
      <div className="h-full grid" style={{ gridTemplateColumns: '44px 1fr', ...fontStyles }}>
        <div className="border-r flex flex-col items-center py-2 gap-2" style={{ borderColor: subtleBorderColor }}>
          <button
            type="button"
            onClick={toggleCollapsed}
            className={`w-8 h-8 rounded text-xs border ${FOCUS_RING}`}
            style={{ borderColor: subtleBorderColor, color: textColor }}
            aria-label={translate(locale, 'chatControl', { context: 'close' })}
          >
            ×
          </button>
          <div className="w-8 h-8 rounded text-xs flex items-center justify-center" style={{ backgroundColor: primaryColor, color: readableOnPrimary }}>
            AI
          </div>
        </div>

        <div className="h-full flex flex-col">
          <div className="px-3 py-2 border-b" style={{ borderColor: subtleBorderColor }}>
            <h3 className="text-sm font-semibold" style={{ color: textColor }}>{getText(widgetConfig?.title) || title || translate(locale, 'chat')}</h3>
            <p className="text-xs" style={{ color: mutedTextColor }}>{getText(widgetConfig?.subtitle)}</p>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {suggestionList.length > 0 && messages.length === 0 && !isTyping && (
              <Suggestions
                suggestions={suggestionList}
                onSelect={(text) => handleSubmitWrapper({ preventDefault: () => {} } as React.FormEvent, text)}
                primaryColor={primaryColor}
                buttonBorderRadius={buttonBorderRadius}
                fontStyles={fontStyles}
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

      {showFeedbackDialog && feedbackDialog && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="max-w-md w-full">{feedbackDialog}</div>
        </div>
      )}
      {unsureModal && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="max-w-md w-full">{unsureModal}</div>
        </div>
      )}
      {handoffModal && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="max-w-md w-full">{handoffModal}</div>
        </div>
      )}
    </div>
  );
}
