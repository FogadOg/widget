'use client'



import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from '@/components/ui/scroll-area'
import { useWidgetAuth } from '../../../hooks/useWidgetAuth'
import { t as translate, getTranslations, resolveInitialWidgetLocale, SUPPORTED_LOCALES, WIDGET_LOCALE_STORAGE_KEY } from '../../../lib/i18n'
import { LanguageMenu } from '../../../components/components/LanguageMenu'
import { embedOriginHeader } from '../../../lib/api'
import { validateConfig } from '../../../lib/validateConfig'
import { STATUS_COLORS } from '../../../lib/constants'
import {
  MessageBranch,
  MessageBranchContent,
  MessageBranchNext,
  MessageBranchPage,
  MessageBranchPrevious,
  MessageBranchSelector,
} from "@/components/ai-elements/message"
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import { Message, MessageContent } from "@/components/ai-elements/message"
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input"
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning"
import { MessageResponse } from "@/components/ai-elements/message"
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion"
import { getLocalizedText, resolveLocalizedSuggestions, resolveParentOrigin as resolveParentOriginUtil, buildDocsTheme, resolveDocsLayout } from './DocsClient.utils'
import { cn } from '@/lib/utils'
import { useWidgetStyles } from '../../../hooks/useWidgetStyles'
import { Props, MessageType } from './DocsClient.types'
import { initialMessages } from './DocsClient.constants'
import { usePreviewMode } from './hooks/usePreviewMode'
import { useWidgetLifecycle } from './hooks/useWidgetLifecycle'
import { useSessionManagement } from './hooks/useSessionManagement'
import { useHeartbeat } from '../useHeartbeat'
import { useWidgetConfig } from './hooks/useWidgetConfig'
import { useMessageOperations } from './hooks/useMessageOperations'
import { useDialogState } from './hooks/useDialogState'
import { PreviewModeWidget } from './components/PreviewModeWidget'
import { MessageFeedbackButtons } from './components/MessageFeedbackButtons'
import { DevOverlay, useDebugMode, reportDevState } from '../../../src/components/DevOverlay'
import { useInstantSearch } from './hooks/useInstantSearch'
import { DocSearchResults } from './components/DocSearchResults'
import type { SearchHit } from './hooks/useInstantSearch'
import { injectCustomAssetsFromConfig } from '../session/EmbedClient.utils'

export { getLocalizedText, resolveLocalizedSuggestions }

export default function DocsClient({ clientId, agentId, configId, locale: initialLocale, startOpen, pagePath, parentOrigin: initialParentOrigin, loaderVersion, previewConfig: initialPreviewConfig }: Props) {
  const embedHeaders = useMemo(
    () => embedOriginHeader(initialParentOrigin, loaderVersion),
    [initialParentOrigin, loaderVersion],
  );

  // Preview mode (admin "Customize" panel): the iframe reloads on every config
  // edit and on dev Fast Refresh, which would otherwise snap the widget back to
  // closed and force the admin to re-open it after each tweak. Restore/persist
  // the open state so the preview reloads in the same state it was left in.
  // Scoped to preview — production is unaffected.
  const { open, setOpen } = usePreviewMode(initialPreviewConfig, startOpen);
  const [text, setText] = useState<string>("");
  const [status, setStatus] = useState<
    "submitted" | "streaming" | "ready" | "error"
  >("ready");
  const [messages, setMessages] = useState<MessageType[]>(() => initialPreviewConfig ? initialMessages : []);
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { getAuthToken, authToken, authError } = useWidgetAuth();
  // Active UI/response locale, resolved once on the first client render
  // (priority: saved manual choice → loader-resolved locale → browser fallback)
  // so it is correct before the session is created. The visitor can switch
  // languages via the header control; parity with the chat widget (K2).
  const [selectedLocale, setSelectedLocale] = useState<string>(() =>
    resolveInitialWidgetLocale(initialLocale)
  );
  const activeLocale = selectedLocale;
  // Translations follow the active locale so a switch re-localizes every string.
  const t = useMemo(() => getTranslations(activeLocale), [activeLocale]);
  const availableLocales = SUPPORTED_LOCALES as unknown as string[];
  const handleLocaleChange = useCallback((next: string) => {
    setSelectedLocale(next);
    try {
      localStorage.setItem(WIDGET_LOCALE_STORAGE_KEY, next);
    } catch {
      // storage unavailable — non-fatal.
    }
  }, []);
  const [liveMessage, setLiveMessage] = useState<string>('');
  const lastAnnouncedKey = useRef<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [messageFeedbackSubmitted, setMessageFeedbackSubmitted] = useState<Set<string>>(new Set());
  const [widgetConfig, setWidgetConfig] = useState<any>(() => {
    if (initialPreviewConfig) {
      try {
        const decoded = JSON.parse(decodeURIComponent(atob(initialPreviewConfig)));
        const { config: validatedConfig } = validateConfig(decoded, 'docs');
        return { status: 'success', data: validatedConfig };
      } catch {
        return null;
      }
    }
    return null;
  });
  // Parent origin is provided by docs-widget.js as a URL param. The token's
  // `origin` claim is pinned to this value at /auth/widget-token mint time,
  // and WidgetScopeMiddleware rejects (403 Origin mismatch) any later API
  // call whose X-Embed-Origin/Origin/Referer doesn't match. Falling back to
  // document.referrer is unreliable under strict-origin-when-cross-origin.
  const [parentOrigin] = useState<string>(() => {
    if (initialParentOrigin) return initialParentOrigin;
    if (typeof window === 'undefined') return '*';
    try {
      if (document.referrer) {
        return new URL(document.referrer).origin;
      }
      if (window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0) {
        return window.location.ancestorOrigins[0];
      }
    } catch {
      // Ignore parent-origin detection failures and keep wildcard fallback.
    }
    return '*';
  });

  const resolveParentOrigin = useCallback((): string | undefined => {
    return resolveParentOriginUtil(initialParentOrigin);
  }, [initialParentOrigin]);

  useWidgetLifecycle({
    messages,
    activeLocale,
    open,
    clientId,
    agentId,
    configId,
    embedHeaders,
    conversationEndRef,
    scrollAreaRef,
    lastAnnouncedKey,
    setLiveMessage,
  });

  // helper utilities are provided by ./helpers

  const { createSession, validateAndRestoreSession, loadSessionMessages } = useSessionManagement({
    agentId,
    activeLocale,
    clientId,
    initialParentOrigin,
    embedHeaders,
    setSessionId,
    setError,
    setMessages,
    setIsInitialLoad,
  });

  // Presence heartbeat — keeps the admin "live visitors" count accurate.
  useHeartbeat({ sessionId, token: authToken, embedHeaders });

  const { fetchWidgetConfig } = useWidgetConfig({
    clientId,
    initialParentOrigin,
    embedHeaders,
    setWidgetConfig,
    setError,
  });

  const { sendMessageToAPI, handleSubmitMessageFeedback, addUserMessage, handleSubmit, handleSuggestionClick, flushQueue, retryQueuedMessage } = useMessageOperations({
    sessionId,
    authToken,
    activeLocale,
    initialParentOrigin,
    initialPreviewConfig,
    embedHeaders,
    setStatus,
    setError,
    setMessages,
    setMessageFeedbackSubmitted,
    setText,
    loadSessionMessages,
  });

  // Connectivity: detect offline/online so the user is never left wondering why
  // a message didn't go through. Going offline shows a banner; coming back
  // online flushes any messages queued while disconnected (auto-reconnect).
  // Preview mode skips this — it never touches the network.
  const [isOffline, setIsOffline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const flushQueueRef = useRef(flushQueue);
  useEffect(() => {
    flushQueueRef.current = flushQueue;
  });
  useEffect(() => {
    if (initialPreviewConfig || typeof window === 'undefined') return;
    const onOffline = () => setIsOffline(true);
    const onOnline = () => {
      setIsOffline(false);
      // Defer to let any session/auth refresh settle before resending.
      flushQueueRef.current?.();
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [initialPreviewConfig]);

  const { query: searchQuery, setQuery: setSearchQuery, state: searchState, clearSearch } = useInstantSearch(
    agentId,
    authToken,
    embedHeaders,
  );

  const handleSearchSelect = useCallback((hit: SearchHit) => {
    clearSearch();
    setText(hit.title);
  }, [clearSearch, setText]);

  const { handleOpenChange } = useDialogState({
    open,
    setOpen,
    parentOrigin,
    initialPreviewConfig,
    clientId,
    agentId,
    configId,
    sessionId,
    setSessionId,
    setMessages,
    setError,
    setWidgetConfig,
    widgetConfig,
    authError,
    embedHeaders,
    getAuthToken,
    fetchWidgetConfig,
    createSession,
    validateAndRestoreSession,
    resolveParentOrigin,
    messages,
    error,
  });

  // Developer overlay: active when debug mode is on (?widget_debug=1,
  // localStorage, or chat.enableDebug() from the host page). Works in
  // production embeds so integrators can debug their live widget.
  const isDebug = useDebugMode();

  // Feed the live state snapshot to the DevOverlay "State" tab. No-op cost when
  // not debugging — the overlay isn't mounted so there are no listeners.
  useEffect(() => {
    if (!isDebug) return;
    reportDevState({
      sessionId,
      clientId,
      agentId,
      configId,
      messageCount: messages.length,
      offline: isOffline,
      handshake: sessionId ? 'CONNECTED' : 'READY',
      config: (widgetConfig as unknown as Record<string, unknown>) ?? null,
    });
  }, [isDebug, sessionId, messages.length, isOffline, widgetConfig, clientId, agentId, configId]);

  const title = getLocalizedText(widgetConfig?.data?.title, activeLocale) || translate(activeLocale, 'docsTitleFallback');
  const subtitle = getLocalizedText(widgetConfig?.data?.subtitle, activeLocale) || translate(activeLocale, 'docsSubtitleFallback');
  const placeholderText = getLocalizedText(widgetConfig?.data?.placeholder, activeLocale) || translate(activeLocale, 'typeYourMessage');
  const resolvedSuggestions = resolveLocalizedSuggestions(widgetConfig?.data?.suggestions, activeLocale, widgetConfig?.data?.default_language);

  // Theme the docs widget from the config. The ai-elements consume shadcn CSS
  // tokens, so mapping the config onto those custom properties re-themes the
  // whole surface (colors, radius, font). See buildDocsTheme.
  const widgetStyles = useWidgetStyles(widgetConfig?.data);
  const theme = buildDocsTheme(widgetStyles);
  // Resolve the "Widget variant" + "Widget layout styles" into concrete layout
  // (chrome flags, spacing, size, animation) — parity with the chat widget.
  const layout = resolveDocsLayout(widgetConfig?.data);
  const isDocsPanel = layout.variant === 'panel';
  // Panel = right-anchored full-height side panel (override Radix's centering);
  // classic/minimal = centered modal sized from the size preset. `!` utilities
  // beat Radix's own positioning/max-width classes deterministically.
  const docsContentClass = cn(
    'flex gap-0 p-0 overflow-hidden',
    isDocsPanel
      ? '!top-0 !right-0 !bottom-0 !left-auto !translate-x-0 !translate-y-0 !max-w-none sm:!max-w-none !rounded-none border-l flex-row'
      : 'mb-8 !max-w-none sm:!max-w-none flex-col justify-between',
    layout.openAnimationClass,
  );
  const docsContentStyle = {
    ...theme.vars,
    background: theme.panelBackground,
    backdropFilter: theme.backdropFilter,
    WebkitBackdropFilter: theme.backdropFilter,
    ...(isDocsPanel
      ? { width: layout.panelWidthPx, maxWidth: '100%', height: '100%' }
      : { width: `${layout.widthVw}vw`, height: `${layout.heightVh}vh`, maxWidth: '100%', maxHeight: 'calc(100vh - 2rem)' }),
  };

  // Load the selected Google Font (parity with the chat widget).
  const fontSource = widgetConfig?.data?.font_source;
  const fontFamily = widgetConfig?.data?.font_family;
  useEffect(() => {
    if (fontSource !== 'google' || !fontFamily || typeof document === 'undefined') return;
    const id = `gf-${String(fontFamily).replace(/\s+/g, '-').toLowerCase()}`;
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@300;400;500;600;700&display=swap`;
    document.head.appendChild(link);
  }, [fontSource, fontFamily]);

  // Inject the org's custom CSS (parity with the chat widget, which injects it
  // via injectCustomAssetsFromConfig after config load). The backend gates
  // custom_css behind the widget_custom_css plan feature before it's served,
  // so it's already permission-checked by the time it reaches here.
  const customCss = (widgetConfig?.data as { custom_css?: string | null } | undefined)?.custom_css;
  useEffect(() => {
    if (customCss) injectCustomAssetsFromConfig({ custom_css: customCss });
  }, [customCss]);

  // Preview mode: bypass the Dialog stub entirely and render the widget as a
  // direct full-height panel so layout works correctly inside the preview iframe.
  if (initialPreviewConfig) {
    return (
      <>
        <PreviewModeWidget
          theme={theme}
          layout={layout}
          accentBg={widgetStyles.secondaryColor}
          accentFg={widgetStyles.readableOnSecondary}
          logo={widgetConfig?.data?.logo}
          liveMessage={liveMessage}
          title={title}
          subtitle={subtitle}
          error={error}
          messages={messages}
          messageFeedbackSubmitted={messageFeedbackSubmitted}
          handleSubmitMessageFeedback={handleSubmitMessageFeedback}
          activeLocale={activeLocale}
          feedbackSubmittedMessage={typeof t.feedbackSubmittedMessage === 'string' ? t.feedbackSubmittedMessage : String(t.feedbackSubmittedMessage)}
          status={status}
          conversationEndRef={conversationEndRef}
          resolvedSuggestions={resolvedSuggestions}
          handleSuggestionClick={handleSuggestionClick}
          handleSubmit={handleSubmit}
          text={text}
          setText={setText}
          placeholderText={placeholderText}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSearchClear={clearSearch}
          searchLoading={searchState.status === 'loading'}
          searchHits={searchState.status === 'success' ? searchState.hits : []}
          searchActive={searchState.status !== 'idle'}
          onSearchSelect={handleSearchSelect}
          searchPlaceholder={translate(activeLocale, 'docsSearchPlaceholder')}
          searchNoResultsLabel={translate(activeLocale, 'docsSearchNoResults')}
          searchResultsLabel={translate(activeLocale, 'docsSearchResultsLabel')}
          searchClearLabel={translate(activeLocale, 'docsSearchClear')}
          searchResultQuery={searchState.status === 'success' ? searchState.query : searchQuery}
        />
        {isDebug && <DevOverlay />}
      </>
    );
  }

  return (
    <div className="w-full h-full">
      <div
        aria-live="polite"
        aria-atomic="true"
        style={{ position: 'absolute', left: '-9999px', height: '1px', width: '1px', overflow: 'hidden' }}
      >
        {liveMessage}
      </div>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          showCloseButton={!isDocsPanel}
          className={docsContentClass}
          style={docsContentStyle}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            const textarea = (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>('textarea[name="message"]');
            textarea?.focus();
          }}
        >
          {layout.showRail && (
            <div
              className='flex shrink-0 flex-col items-center gap-3 border-r py-3'
              style={{ width: 56, borderColor: theme.border, background: widgetStyles.agentBubbleBg }}
            >
              <span
                aria-hidden
                className='flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg'
                style={{ backgroundColor: widgetStyles.secondaryColor, color: widgetStyles.readableOnSecondary }}
              >
                {widgetConfig?.data?.logo ? (
                  <img src={widgetConfig.data.logo} alt='' className='h-full w-full object-contain p-1' />
                ) : (
                  <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2} className='h-4 w-4'>
                    <path strokeLinecap='round' strokeLinejoin='round' d='M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z' />
                  </svg>
                )}
              </span>
              <span aria-hidden className='my-0.5 h-px w-6' style={{ background: theme.border }} />
              {/* Decorative nav affordances so the rail reads as an app sidebar
                  (parity with the chat Support Panel's rail chip). */}
              <span aria-hidden className='flex h-9 w-9 items-center justify-center rounded-lg opacity-70' style={{ color: widgetStyles.textColor, background: widgetStyles.backgroundColor }}>
                <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2} className='h-4 w-4'>
                  <path strokeLinecap='round' strokeLinejoin='round' d='M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z' />
                </svg>
              </span>
              <span aria-hidden className='flex h-9 w-9 items-center justify-center rounded-lg opacity-50' style={{ color: widgetStyles.textColor }}>
                <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2} className='h-4 w-4'>
                  <path strokeLinecap='round' strokeLinejoin='round' d='M4 6h16M4 12h16M4 18h10' />
                </svg>
              </span>
              <button
                type='button'
                onClick={() => handleOpenChange(false)}
                aria-label={translate(activeLocale, 'close')}
                className='mt-auto flex h-9 w-9 items-center justify-center rounded-lg opacity-70 transition-opacity hover:opacity-100'
                style={{ color: widgetStyles.textColor }}
              >
                <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2} className='h-4 w-4'>
                  <path strokeLinecap='round' strokeLinejoin='round' d='M6 18L18 6M6 6l12 12' />
                </svg>
              </button>
            </div>
          )}
          <div className='flex min-h-0 flex-1 flex-col justify-between overflow-hidden'>
          <ScrollArea ref={scrollAreaRef} className='flex min-h-0 flex-1 flex-col justify-between overflow-hidden'>
            <DialogHeader className='contents space-y-0 text-left'>
              <div
                className='flex items-start justify-between gap-3'
                style={{ paddingLeft: layout.padX, paddingRight: layout.padX + (isDocsPanel ? 0 : 32), paddingTop: layout.padY }}
              >
                <div className='flex min-w-0 items-center gap-2.5'>
                  {/* Brand accent chip — shown in the header for the classic
                      variant (parity with the chat widget's secondary-colored
                      header controls). Minimal drops it for reduced chrome; panel
                      moves it into the utility rail. Shows the widget logo when
                      set, else a docs icon. */}
                  {layout.showAccentChip && (
                  <span
                    aria-hidden
                    className='flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md'
                    style={{ backgroundColor: widgetStyles.secondaryColor, color: widgetStyles.readableOnSecondary }}
                  >
                    {widgetConfig?.data?.logo ? (
                      <img src={widgetConfig.data.logo} alt='' className='h-full w-full object-contain p-1' />
                    ) : (
                      <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2} className='h-4 w-4'>
                        <path strokeLinecap='round' strokeLinejoin='round' d='M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z' />
                      </svg>
                    )}
                  </span>
                  )}
                  <DialogTitle className='truncate p-0' style={{ fontSize: layout.titlePx }}>{getLocalizedText(widgetConfig?.data?.title, activeLocale) || translate(activeLocale, 'docsTitleFallback')}</DialogTitle>
                </div>
                {availableLocales.length >= 2 && (
                  <LanguageMenu
                    variant='subtle'
                    locale={activeLocale}
                    locales={availableLocales}
                    onChange={handleLocaleChange}
                    label={translate(activeLocale, 'selectLanguage')}
                    headerTextColor={widgetStyles.textColor}
                    secondaryColor={widgetStyles.secondaryColor}
                    primaryColor={widgetStyles.primaryColor}
                    backgroundColor={widgetStyles.backgroundColor}
                    textColor={widgetStyles.textColor}
                    borderColor={widgetStyles.subtleBorderColor}
                    fontStyles={widgetStyles.fontStyles}
                    borderRadius={widgetStyles.borderRadius}
                  />
                )}
              </div>
              {layout.showSubtitle && (
              <DialogDescription className='text-sm text-muted-foreground' style={{ paddingLeft: layout.padX, paddingRight: layout.padX }}>
                {getLocalizedText(widgetConfig?.data?.subtitle, activeLocale) || translate(activeLocale, 'docsSubtitleFallback')}
              </DialogDescription>
              )}
              {/* Instant search input — dropped in the minimal variant for an
                  ask-first, reduced-chrome shell (parity with the chat minimal). */}
              {layout.showSearch && (
              <div className='pt-3 pb-1' style={{ paddingLeft: layout.padX, paddingRight: layout.padX }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <svg
                    aria-hidden
                    style={{ position: 'absolute', left: '10px', width: '14px', height: '14px', color: 'var(--muted-foreground)', pointerEvents: 'none', flexShrink: 0 }}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                  </svg>
                  <input
                    type="text"
                    aria-label={translate(activeLocale, 'docsSearchPlaceholder')}
                    placeholder={translate(activeLocale, 'docsSearchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      paddingLeft: '32px',
                      paddingRight: searchQuery ? '32px' : '10px',
                      paddingTop: '7px',
                      paddingBottom: '7px',
                      fontSize: '13px',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      background: 'var(--background)',
                      color: 'var(--foreground)',
                      outline: 'none',
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--primary)' }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      aria-label={translate(activeLocale, 'docsSearchClear')}
                      onClick={clearSearch}
                      style={{ position: 'absolute', right: '8px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', display: 'flex', padding: '2px' }}
                    >
                      <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                {/* Search results dropdown */}
                {searchState.status !== 'idle' && (
                  <div
                    style={{
                      marginTop: '4px',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      background: 'var(--background)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      maxHeight: '260px',
                      overflowY: 'auto',
                    }}
                  >
                    <DocSearchResults
                      hits={searchState.status === 'success' ? searchState.hits : []}
                      query={searchState.status === 'success' ? searchState.query : searchQuery}
                      loading={searchState.status === 'loading'}
                      noResultsLabel={translate(activeLocale, 'docsSearchNoResults')}
                      resultsLabel={translate(activeLocale, 'docsSearchResultsLabel')}
                      onSelect={handleSearchSelect}
                    />
                  </div>
                )}
              </div>
              )}
              {isOffline && (
                <div
                  className="border-l-4 px-6 py-2 text-sm"
                  style={{ backgroundColor: STATUS_COLORS.offline.bg, borderColor: STATUS_COLORS.offline.border, color: STATUS_COLORS.offline.text }}
                  role="status"
                >
                  {translate(activeLocale, 'offlineBannerTitle')}
                </div>
              )}
              {error && (
                <div className="bg-warning/10 border-l-4 border-warning/60 text-warning px-6 py-2 text-sm" role="alert">
                  {error}
                </div>
              )}
              <DialogDescription asChild>
                <div style={{ paddingLeft: layout.padX, paddingRight: layout.padX, paddingTop: layout.padY, paddingBottom: layout.padY }}>
                  <div className="flex flex-col min-h-0">
                    <div className="flex-1 mb-4">
                      <Conversation>
                        <ConversationContent className={cn(layout.conversationClassName, layout.messageAnimationClass)}>
                          {messages.map(({ versions, ...message }) => (
                            <MessageBranch defaultBranch={0} key={message.key}>
                              <MessageBranchContent>
                                {versions.map((version) => (
                                  <Message
                                    from={message.from === 'agent' ? 'assistant' : message.from}
                                    key={`${message.key}-${version.id}`}
                                  >
                                    <div>
                                      {message.reasoning && (
                                        <Reasoning duration={message.reasoning.duration}>
                                          <ReasoningTrigger />
                                          <ReasoningContent>
                                            {message.reasoning.content}
                                          </ReasoningContent>
                                        </Reasoning>
                                      )}
                                      <MessageContent>
                                        <MessageResponse sources={message.sources}>{version.content}</MessageResponse>
                                      </MessageContent>
                                      {message.from === 'agent' && (
                                        <MessageFeedbackButtons
                                          messageKey={message.key}
                                          messageFeedbackSubmitted={messageFeedbackSubmitted}
                                          handleSubmitMessageFeedback={handleSubmitMessageFeedback}
                                          activeLocale={activeLocale}
                                          feedbackThumbsUp={typeof t.feedbackThumbsUp === 'string' ? t.feedbackThumbsUp : String(t.feedbackThumbsUp)}
                                          feedbackThumbsDown={typeof t.feedbackThumbsDown === 'string' ? t.feedbackThumbsDown : String(t.feedbackThumbsDown)}
                                          feedbackSubmittedMessage={typeof t.feedbackSubmittedMessage === 'string' ? t.feedbackSubmittedMessage : String(t.feedbackSubmittedMessage)}
                                        />
                                      )}
                                      {message.from === 'user' && message.failed && (
                                        <div className="mt-1 flex items-center gap-2 text-xs" role="alert" style={{ color: STATUS_COLORS.error.text }}>
                                          <span>{translate(activeLocale, 'failedSend')}</span>
                                          <button
                                            type="button"
                                            className="underline"
                                            style={{ color: STATUS_COLORS.error.text }}
                                            onClick={() => message.queueId && retryQueuedMessage(message.queueId)}
                                          >
                                            {translate(activeLocale, 'retry')}
                                          </button>
                                        </div>
                                      )}
                                      {message.from === 'user' && message.pending && !message.failed && (
                                        <div className="mt-1 text-xs" style={{ color: STATUS_COLORS.offline.text }}>
                                          {translate(activeLocale, 'deliveringStatus')}
                                        </div>
                                      )}
                                    </div>
                                  </Message>
                                ))}
                              </MessageBranchContent>
                              {versions.length > 1 && (
                                <MessageBranchSelector from={message.from === 'agent' ? 'assistant' : message.from}>
                                  <MessageBranchPrevious />
                                  <MessageBranchPage />
                                  <MessageBranchNext />
                                </MessageBranchSelector>
                              )}
                            </MessageBranch>
                          ))}
                          {status === "streaming" && (
                            <div className="flex justify-start">
                              <div className="p-3" style={{ backgroundColor: 'var(--muted)', borderRadius: 'var(--radius)' }}>
                                <div className="flex space-x-1">
                                  <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse"></div>
                                  <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                                  <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                                </div>
                              </div>
                            </div>
                          )}
                        </ConversationContent>
                        <ConversationScrollButton />
                      </Conversation>
                      <div ref={conversationEndRef} />
                    </div>
                  </div>
                </div>
              </DialogDescription>
            </DialogHeader>
          </ScrollArea>
          <DialogFooter className='sm:justify-end w-full' style={{ paddingLeft: layout.padX, paddingRight: layout.padX, paddingBottom: layout.padY, paddingTop: layout.padY }}>
            <div className="flex flex-col gap-4 w-full">
              {(() => {
                const resolved = resolveLocalizedSuggestions(
                  widgetConfig?.data?.suggestions,
                  activeLocale,
                  widgetConfig?.data?.default_language,
                );
                if (resolved.length === 0) return null;
                return (
                  <Suggestions>
                    {resolved.map((suggestion: string) => (
                      <Suggestion
                        key={suggestion}
                        onClick={() => handleSuggestionClick(suggestion)}
                        suggestion={suggestion}
                      />
                    ))}
                  </Suggestions>
                );
              })()}
              <PromptInput globalDrop multiple onSubmit={handleSubmit}>
                <PromptInputHeader>
                  <PromptInputAttachments>
                    {(attachment) => <PromptInputAttachment data={attachment} />}
                  </PromptInputAttachments>
                </PromptInputHeader>
                <PromptInputBody>
                  <PromptInputTextarea
                    onChange={(event) => setText(event.target.value)}
                    value={text}
                    placeholder={
                      getLocalizedText(widgetConfig?.data?.placeholder, activeLocale)
                        || translate(activeLocale, 'typeYourMessage')
                    }
                  />
                </PromptInputBody>
                <PromptInputFooter>
                  <PromptInputTools>
                    {/* <PromptInputActionMenu>
                      <PromptInputActionMenuTrigger />
                      <PromptInputActionMenuContent>
                        <PromptInputActionAddAttachments />
                      </PromptInputActionMenuContent>
                    </PromptInputActionMenu> */}
                  </PromptInputTools>
                  <PromptInputSubmit
                    disabled={!text.trim() || status === "streaming"}
                    status={status}
                  />
                </PromptInputFooter>
              </PromptInput>
            </div>
          </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
      {isDebug && <DevOverlay />}
    </div>
  );
}
