'use client';
import { useWidgetAuth } from '../../../hooks/useWidgetAuth';
import { getLocaleDirection, t as tFn, getTranslations, resolveInitialWidgetLocale, resolveSupportedLocale, isTranslatableLocale, SUPPORTED_LOCALES, WIDGET_LOCALE_STORAGE_KEY, WIDGET_THEME_STORAGE_KEY, resolveInitialWidgetTheme } from '../../../lib/i18n';
import { useRuntimeTranslation, useRuntimeRevision } from '../../../hooks/useRuntimeTranslation';
import type {
  Message,
  WidgetConfig,
  FlowResponse,
  FlowButton,
  Flow,
  SourceData,
} from '../../../types/widget';
import { ButtonLike } from '../../../hooks/useClickedButtons';
import { validateMessageInput } from '../../../lib/validation';
import { checkAndConsume } from '../../../lib/rateLimiter';
import { trackEvent, embedOriginHeader, createSupportTicket } from '../../../lib/api';
import { HandoffModal } from '../HandoffModal';
import { LeadCaptureCard } from '../LeadCaptureCard';
import FeedbackDialog from '../../../components/FeedbackDialog';
import {
  createSessionError,
  createNetworkError,
  retryWithBackoff,
  logError,
  parseApiError,
  WidgetErrorCode,
} from '../../../lib/errorHandling';
import { API } from '../../../lib/api';
import { EMBED_EVENTS, targetOrigin, sensitiveOrigin } from '../../../lib/embedConstants';

import * as helpers from './helpers';
import { queueMessage } from '../../../src/lib/offline';
import { onInitConfig } from './events';
import { validateConfig } from '../../../lib/validateConfig';
import { enableDebug, disableDebug, useDebugMode, reportDevState, DevOverlay, simulateOffline, restoreOnline } from '../../../src/components/DevOverlay';
import { setLogLevel, enableLogStream, disableLogStream } from '../../../lib/logger';
import {
  registerInstance,
  deregisterInstance,
  makeInstanceId,
  open as registryOpen,
  close as registryClose,
} from '../../../src/lib/widgetRegistry';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// For streaming decoding
const textDecoder = typeof window !== 'undefined' && window.TextDecoder ? new window.TextDecoder() : undefined;
import EmbedShell from 'components/EmbedShell';
import {
  applyCustomAssetsFromQuery,
  isTrustedParentMessage,
  injectCustomAssetsFromConfig,
  injectCustomAssets,
  injectGoogleFont,
} from './EmbedClient.utils';
import { PREVIEW_COLLAPSED_KEY } from './EmbedClient.constants';
import {
  parseHostMessageCommand,
  resolveParentTargetOrigin,
  getNormalizedEdgeOffset,
} from './embed.utils';

// Re-export helpers so tests importing from 'EmbedClient' continue to work
export {
  injectCustomAssets,
  applyCustomAssetsFromQuery,
  isTrustedParentMessage,
  injectCustomAssetsFromConfig,
} from './EmbedClient.utils';
export {
  parseHostMessageCommand,
  resolveParentTargetOrigin,
  getNormalizedEdgeOffset,
  getButtonPixelSize,
} from './embed.utils';
import type { EmbedClientProps } from './EmbedClient.types';
import { UnsureMessagesModal } from './components/UnsureMessagesModal';
import { WidgetNotAuthorized } from '../../../components/WidgetNotAuthorized';
import { useStreamingMessage } from './hooks/useStreamingMessage';
import { useUnreadTracking } from './hooks/useUnreadTracking';
import { useWidgetResize } from './hooks/useWidgetResize';
import { useTeaserBubble } from './hooks/useTeaserBubble';
import { useSessionManagement } from './hooks/useSessionManagement';
import { useHeartbeat } from '../useHeartbeat';
import { useQueuedMessageManagement } from './hooks/useQueuedMessageManagement';
import { useFeedbackManagement } from './hooks/useFeedbackManagement';
import { useBootstrap } from './hooks/useBootstrap';

import { useEmbedController } from './EmbedClient.controller';
import { useWidgetStyles } from '../../../hooks/useWidgetStyles';

export default function EmbedClient(props: EmbedClientProps) {
  const ctrl = useEmbedController(props);
  const {
    embedHeaders,
    messages,
    setMessages,
    flowResponses,
    identifiedUserName,
    consentPromptVisible,
    input,
    setInput,
    isTyping,
    pendingAttachments,
    uploadingFiles,
    streamingMessage,
    handleStopStreaming,
    isCollapsed,
    authToken,
    authErrorCode,
    sessionId,
    error,
    isOffline,
    isEmbedded,
    agentName,
    widgetConfig,
    themeOverride,
    visitorTheme,
    handleToggleTheme,
    isBootstrapping,
    shouldRender,
    activeLocale,
    t,
    availableLocales,
    handleLocaleChange,
    unsureMessages,
    showUnsureModal,
    setShowUnsureModal,
    showHandoffModal,
    setShowHandoffModal,
    lastUserMessage,
    setHasEscalated,
    handoffConversationIdRef,
    supportTicketsEnabled,
    captureFields,
    captureOffer,
    handleCaptureSubmit,
    handleCaptureDismiss,
    unreadCount,
    fatalError,
    handleConsentAccept,
    handleConsentDecline,
    containerRef,
    instanceId,
    sessionExpiredBanner,
    setSessionExpiredBanner,
    showFeedbackDialog,
    messageFeedbackSubmitted,
    handleFeedbackSubmit,
    handleFeedbackSkip,
    handleSubmitMessageFeedback,
    showTeaser,
    teaserExpanded,
    teaserConfigured,
    teaserMessage,
    dismissTeaser,
    handleTeaserMeasure,
    getLocalizedText,
    handlePickFiles,
    handleRemoveAttachment,
    handleSubmit,
    retryLastSend,
    handleFollowUpButtonClick,
    handleInteractionButtonClick,
    handleRichAction,
    toggleCollapsed,
    isDebug,
    isPersistent,
    showFeedbackDialogOverride,
    initialPreviewConfig,
  } = ctrl;
  // Use a safe default config when widgetConfig hasn't loaded so tests and
  // embedded consumers can still render a minimal shell during initialization.
  // An embed-level themeOverride (data-theme / setTheme() / update({theme}))
  // wins over the dashboard WidgetConfig.theme — see useWidgetStyles for how the
  // resolved theme drives light/dark colors.
  const baseWidgetConfig: WidgetConfig = widgetConfig || ({} as WidgetConfig);
  // Precedence: the visitor's in-widget toggle wins, then the embed's data-theme
  // / setTheme() override, then the dashboard config's own theme.
  const effectiveTheme = visitorTheme ?? themeOverride ?? null;
  const safeWidgetConfig: WidgetConfig = effectiveTheme
    ? { ...baseWidgetConfig, theme: effectiveTheme }
    : baseWidgetConfig;

  // The feedback / handoff dialogs below share the shell's resolved styles, so
  // they follow the same defaults, dark palette and 0-radius handling.
  const dialogStyles = useWidgetStyles(safeWidgetConfig);

  if (fatalError) {
    // Origin violations show a visible error even in production — a blank widget
    // on an unauthorized domain is indistinguishable from a load failure for site
    // owners. All other fatal errors stay silent (parent got AUTH_FAILURE).
    if (authErrorCode === WidgetErrorCode.ORIGIN_NOT_ALLOWED) {
      return <WidgetNotAuthorized />;
    }
    // In production integrations, silently render nothing — a broken widget
    // is less disruptive than a red error box on the host site. The parent
    // already received an AUTH_FAILURE postMessage for programmatic handling.
    if (!isDebug) return null;
    return (
      <>
      <DevOverlay />
      <div style={{
        position: 'fixed',
        bottom: 0,
        right: 0,
        left: 0,
        background: 'color-mix(in oklab, var(--destructive, #dc2626) 8%, var(--background, #ffffff))',
        border: '1px solid var(--destructive, #fca5a5)',
        borderRadius: '12px',
        padding: '16px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        zIndex: 999999,
        boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <div style={{ flexShrink: 0, color: 'var(--destructive, #dc2626)', marginTop: '2px' }}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: '0 0 4px 0', fontSize: '13px', fontWeight: 600, color: 'var(--destructive, #991b1b)' }}>
              Widget unavailable
            </p>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted-foreground, #6b7280)', lineHeight: '1.5', wordBreak: 'break-word' }}>
              {fatalError}
            </p>
          </div>
        </div>
      </div>
      </>
    );
  }

  if (!shouldRender || isBootstrapping) {
    // Still surface the overlay while bootstrapping so the handshake/auth
    // sequence is observable — this is the most useful time to debug.
    return isDebug ? <DevOverlay /> : null;
  }

  return (
    <div ref={containerRef} data-widget-instance={instanceId} style={{ position: 'relative' }}>
      {/* A/B variant debug badge removed to avoid rendering variant text in the host page */}
      <EmbedShell
        isEmbedded={isEmbedded}
        isCollapsed={isCollapsed}
        isPreview={!!initialPreviewConfig}
        previewPositioning={!!initialPreviewConfig}
        toggleCollapsed={toggleCollapsed}
        messages={messages}
        isTyping={isTyping}
        onStopStreaming={handleStopStreaming}
        streamingMessage={streamingMessage}
        input={input}
        setInput={setInput}
        handleSubmit={handleSubmit}
        // File-upload composer UI is built but intentionally OFF for now.
        // The picker (attach button + chips), upload wiring, event emission, and
        // backend endpoint all still exist — to turn it on, restore the
        // plan-gated line below and remove the hardcoded `false`.
        // fileUploadEnabled={!!safeWidgetConfig?.file_upload_enabled}
        fileUploadEnabled={false}
        pendingAttachments={pendingAttachments}
        uploadingFiles={uploadingFiles}
        onPickFiles={handlePickFiles}
        onRemoveAttachment={handleRemoveAttachment}
        error={error}
        onRetrySend={retryLastSend}
        locale={activeLocale}
        availableLocales={availableLocales}
        onLocaleChange={handleLocaleChange}
        onToggleTheme={handleToggleTheme}
        agentName={agentName}
        identifiedUserName={identifiedUserName}
        widgetConfig={safeWidgetConfig}
        onInteractionButtonClick={handleInteractionButtonClick}
        onFollowUpButtonClick={handleFollowUpButtonClick}
        onRichAction={handleRichAction}
        flowResponses={flowResponses}
        getLocalizedText={getLocalizedText}
        showFeedbackDialog={showFeedbackDialogOverride ?? showFeedbackDialog}
        messageFeedbackSubmitted={messageFeedbackSubmitted}
        onSubmitMessageFeedback={handleSubmitMessageFeedback}
        unreadCount={unreadCount}
        sessionExpiredBanner={sessionExpiredBanner}
        onDismissSessionExpiredBanner={() => setSessionExpiredBanner(false)}
        showConsentPrompt={consentPromptVisible}
        onConsentAccept={handleConsentAccept}
        onConsentDecline={handleConsentDecline}
        isOffline={isOffline}
        feedbackDialog={
          ((showFeedbackDialogOverride !== undefined ? showFeedbackDialogOverride : showFeedbackDialog) && (showFeedbackDialogOverride !== undefined ? true : (sessionId && authToken))) ? (
            <FeedbackDialog
              sessionId={sessionId}
              authToken={authToken}
              primaryColor={dialogStyles.primaryColor}
              backgroundColor={dialogStyles.backgroundColor}
              textColor={dialogStyles.textColor}
              borderRadius={dialogStyles.borderRadius}
              onSubmit={handleFeedbackSubmit}
              onSkip={handleFeedbackSkip}
            />
          ) : undefined
        }
        unsureModal={
          showUnsureModal ? (
            <UnsureMessagesModal
              messages={unsureMessages}
              onClose={() => setShowUnsureModal(false)}
              primaryColor={dialogStyles.primaryColor}
              backgroundColor={dialogStyles.backgroundColor}
              textColor={dialogStyles.textColor}
              borderRadius={dialogStyles.borderRadius}
            />
          ) : undefined
        }
        leadCaptureCard={
          captureOffer ? (
            <LeadCaptureCard
              translations={{
                leadCaptureTitle: String(t.leadCaptureTitle),
                leadCaptureBody: String(t.leadCaptureBody),
                leadCaptureIntentTitle: String(t.leadCaptureIntentTitle),
                leadCaptureIntentBody: String(t.leadCaptureIntentBody),
                leadCaptureNameLabel: String(t.leadCaptureNameLabel),
                leadCaptureEmailLabel: String(t.leadCaptureEmailLabel),
                leadCaptureSubmit: String(t.leadCaptureSubmit),
                leadCaptureSubmitting: String(t.leadCaptureSubmitting),
                leadCaptureSuccess: String(t.leadCaptureSuccess),
                leadCaptureError: String(t.leadCaptureError),
                leadCaptureDismiss: String(t.leadCaptureDismiss),
                leadCaptureOptional: String(t.leadCaptureOptional),
              }}
              fields={captureFields}
              reason={captureOffer.reason}
              onSubmit={handleCaptureSubmit}
              onDismiss={handleCaptureDismiss}
              primaryColor={dialogStyles.primaryColor}
              backgroundColor={dialogStyles.backgroundColor}
              textColor={dialogStyles.textColor}
              borderRadius={dialogStyles.borderRadius}
            />
          ) : undefined
        }
        unsureMessages={unsureMessages}
        onShowUnsureModal={() => setShowUnsureModal(true)}
        onCloseUnsureModal={() => setShowUnsureModal(false)}
        onDismissHandoff={() => setShowHandoffModal(false)}
        showTeaser={showTeaser}
        teaserExpanded={teaserExpanded}
        teaserConfigured={teaserConfigured}
        teaserMessage={teaserMessage}
        onTeaserMeasure={handleTeaserMeasure}
        onDismissTeaser={dismissTeaser}
        hideCloseButton={isPersistent}
        isPersistent={isPersistent}
        handoffModal={showHandoffModal && supportTicketsEnabled ? (
          <HandoffModal
            lastUserMessage={lastUserMessage}
            translations={{
              handoffTitle: String(t.handoffTitle),
              handoffNameLabel: String(t.handoffNameLabel),
              handoffEmailLabel: String(t.handoffEmailLabel),
              handoffMessageLabel: String(t.handoffMessageLabel),
              handoffSubmitButton: String(t.handoffSubmitButton),
              handoffSubmittingButton: String(t.handoffSubmittingButton),
              handoffError: String(t.handoffError),
              dismiss: String(t.dismiss),
            }}
            primaryColor={dialogStyles.primaryColor}
            backgroundColor={dialogStyles.backgroundColor}
            textColor={dialogStyles.textColor}
            borderRadius={dialogStyles.borderRadius}
            onSubmit={async (name, email, handoffMessage) => {
              if (!supportTicketsEnabled) return;
              await createSupportTicket(authToken ?? '', {
                name,
                email,
                message: handoffMessage,
                conversation_id: handoffConversationIdRef.current ?? undefined,
                session_id: sessionId ?? undefined,
              }, embedHeaders);
              setShowHandoffModal(false);
              setHasEscalated(false);
              const confirmationMessage: Message = {
                id: `temp-handoff-${Date.now()}`,
                text: String(t.handoffConfirmation),
                from: 'agent',
                timestamp: Date.now(),
              };
              setMessages(prev => [...prev, confirmationMessage]);
            }}
            onDismiss={() => { setShowHandoffModal(false); setHasEscalated(false); }}
          />
        ) : undefined}
      />
      {isDebug && <DevOverlay />}
    </div>
  );
}

