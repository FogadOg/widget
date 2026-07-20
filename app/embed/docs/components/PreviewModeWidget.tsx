'use client'

import { MutableRefObject } from 'react'
import { t as translate } from '../../../../lib/i18n'
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
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  type PromptInputMessage,
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
import { MessageType, DocsTheme, DocsLayoutSpec } from '../DocsClient.types'
import type { SearchHit } from '../hooks/useInstantSearch'
import { DocSearchResults } from './DocSearchResults'

interface PreviewModeWidgetProps {
  theme: DocsTheme;
  /** Resolved "Widget variant" + "Widget layout styles" layout (parity with the live widget). */
  layout: DocsLayoutSpec;
  /** Utility-rail accent chip background (config secondary color). */
  accentBg: string;
  /** Utility-rail accent chip foreground (readable on secondary). */
  accentFg: string;
  /** Optional widget logo shown in the rail chip. */
  logo?: string;
  liveMessage: string;
  title: string;
  subtitle: string;
  error: string | null;
  messages: MessageType[];
  messageFeedbackSubmitted: Set<string>;
  handleSubmitMessageFeedback: (messageId: string, feedbackType: string) => void;
  activeLocale: string;
  feedbackSubmittedMessage: string;
  status: "submitted" | "streaming" | "ready" | "error";
  conversationEndRef: MutableRefObject<HTMLDivElement | null>;
  resolvedSuggestions: string[];
  handleSuggestionClick: (suggestion: string) => void;
  handleSubmit: (message: PromptInputMessage) => void;
  text: string;
  setText: (text: string) => void;
  placeholderText: string;
  // Instant search
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSearchClear: () => void;
  searchLoading: boolean;
  searchHits: SearchHit[];
  searchActive: boolean;
  onSearchSelect: (hit: SearchHit) => void;
  searchPlaceholder: string;
  searchNoResultsLabel: string;
  searchResultsLabel: string;
  searchClearLabel: string;
  searchResultQuery: string;
}

export function PreviewModeWidget({
  theme,
  layout,
  accentBg,
  accentFg,
  logo,
  liveMessage,
  title,
  subtitle,
  error,
  messages,
  messageFeedbackSubmitted,
  handleSubmitMessageFeedback,
  activeLocale,
  feedbackSubmittedMessage,
  status,
  conversationEndRef,
  resolvedSuggestions,
  handleSuggestionClick,
  handleSubmit,
  text,
  setText,
  placeholderText,
  searchQuery,
  onSearchChange,
  onSearchClear,
  searchLoading,
  searchHits,
  searchActive,
  onSearchSelect,
  searchPlaceholder,
  searchNoResultsLabel,
  searchResultsLabel,
  searchClearLabel,
  searchResultQuery,
}: PreviewModeWidgetProps) {
  return (
    <div className={layout.openAnimationClass || undefined} style={{ ...theme.vars, width: '100%', height: '100%', display: 'flex', flexDirection: layout.showRail ? 'row' : 'column', background: theme.panelBackground, backdropFilter: theme.backdropFilter, WebkitBackdropFilter: theme.backdropFilter, overflow: 'hidden' }}>
      <div
        aria-live="polite" aria-atomic="true"
        style={{ position: 'absolute', left: '-9999px', height: '1px', width: '1px', overflow: 'hidden' }}
      >{liveMessage}</div>

      {/* Utility rail (panel variant) — mirrors the chat widget's Support Panel:
          brand chip, decorative nav affordances, subtle surface. */}
      {layout.showRail && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', width: '56px', padding: '12px 0', borderRight: `1px solid ${theme.border}`, flexShrink: 0, background: 'var(--muted)' }}>
          <span aria-hidden style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: 'var(--radius)', overflow: 'hidden', background: accentBg, color: accentFg }}>
            {logo ? (
              <img src={logo} alt='' style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '4px' }} />
            ) : (
              <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2} style={{ width: '16px', height: '16px' }}>
                <path strokeLinecap='round' strokeLinejoin='round' d='M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z' />
              </svg>
            )}
          </span>
          <span aria-hidden style={{ width: '24px', height: '1px', background: theme.border }} />
          <span aria-hidden style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: 'var(--radius)', background: 'var(--background)', color: 'var(--foreground)', opacity: 0.7 }}>
            <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2} style={{ width: '16px', height: '16px' }}>
              <path strokeLinecap='round' strokeLinejoin='round' d='M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z' />
            </svg>
          </span>
          <span aria-hidden style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: 'var(--radius)', color: 'var(--foreground)', opacity: 0.5 }}>
            <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2} style={{ width: '16px', height: '16px' }}>
              <path strokeLinecap='round' strokeLinejoin='round' d='M4 6h16M4 12h16M4 18h10' />
            </svg>
          </span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: `${layout.padY}px ${layout.padX}px`, borderBottom: layout.showSectionBorders ? `1px solid ${theme.border}` : 'none', flexShrink: 0 }}>
        <h2 style={{ margin: 0, fontSize: `${layout.titlePx}px`, fontWeight: 600, color: theme.title, lineHeight: 1.3 }}>{title}</h2>
        {layout.showSubtitle && subtitle && <p style={{ margin: '4px 0 0', fontSize: '14px', color: theme.subtitle, lineHeight: 1.5 }}>{subtitle}</p>}
        {error && (
          <div style={{ marginTop: '8px', background: 'color-mix(in oklab, var(--warning) 10%, var(--background))', borderLeft: '4px solid var(--warning)', color: 'var(--warning)', padding: '6px 12px', fontSize: '13px' }} role="alert">
            {error}
          </div>
        )}
        {/* Instant search */}
        {layout.showSearch && (
        <div style={{ marginTop: '12px', position: 'relative' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <svg aria-hidden style={{ position: 'absolute', left: '10px', width: '14px', height: '14px', color: 'var(--muted-foreground)', pointerEvents: 'none' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              aria-label={searchPlaceholder}
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              style={{ width: '100%', paddingLeft: '32px', paddingRight: searchQuery ? '32px' : '10px', paddingTop: '7px', paddingBottom: '7px', fontSize: '13px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--background)', color: 'var(--foreground)', outline: 'none' }}
            />
            {searchQuery && (
              <button type="button" aria-label={searchClearLabel} onClick={onSearchClear} style={{ position: 'absolute', right: '8px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', display: 'flex', padding: '2px' }}>
                <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          {searchActive && (
            <div style={{ marginTop: '4px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--background)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: '240px', overflowY: 'auto' }}>
              <DocSearchResults
                hits={searchHits}
                query={searchResultQuery}
                loading={searchLoading}
                noResultsLabel={searchNoResultsLabel}
                resultsLabel={searchResultsLabel}
                onSelect={onSearchSelect}
              />
            </div>
          )}
        </div>
        )}
      </div>

      {/* Conversation */}
      <div style={{ flex: 1, overflowY: 'auto', padding: `${layout.padY}px ${layout.padX}px` }}>
        <Conversation>
          <ConversationContent className={[layout.conversationClassName, layout.messageAnimationClass].filter(Boolean).join(' ') || undefined}>
            {messages.map(({ versions, ...message }) => (
              <MessageBranch defaultBranch={0} key={message.key}>
                <MessageBranchContent>
                  {versions.map((version) => (
                    <Message from={message.from === 'agent' ? 'assistant' : message.from} key={`${message.key}-${version.id}`}>
                      <div>
                        {message.reasoning && (
                          <Reasoning duration={message.reasoning.duration}>
                            <ReasoningTrigger />
                            <ReasoningContent>{message.reasoning.content}</ReasoningContent>
                          </Reasoning>
                        )}
                        <MessageContent>
                          <MessageResponse sources={message.sources}>{version.content}</MessageResponse>
                        </MessageContent>
                        {message.from === 'agent' && !messageFeedbackSubmitted.has(message.key) && (
                          <div className="mt-2 flex gap-2">
                            <button type="button" onClick={() => handleSubmitMessageFeedback(message.key, 'thumbs_up')} className="text-xs opacity-50 hover:opacity-100 transition-opacity flex items-center gap-1" aria-label={translate(activeLocale, 'feedbackPositive')}>
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" /></svg>
                            </button>
                            <button type="button" onClick={() => handleSubmitMessageFeedback(message.key, 'thumbs_down')} className="text-xs opacity-50 hover:opacity-100 transition-opacity flex items-center gap-1" aria-label={translate(activeLocale, 'feedbackNegative')}>
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.737 3h4.017c.163 0 .326.02.485.06L17 4m-7 10v5a2 2 0 002 2h.095c.5 0 .905-.405.905-.905 0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m6-10h-2" /></svg>
                            </button>
                          </div>
                        )}
                        {message.from === 'agent' && messageFeedbackSubmitted.has(message.key) && (
                          <div className="mt-2 text-xs opacity-50">{feedbackSubmittedMessage}</div>
                        )}
                      </div>
                    </Message>
                  ))}
                </MessageBranchContent>
                {versions.length > 1 && (
                  <MessageBranchSelector from={message.from === 'agent' ? 'assistant' : message.from}>
                    <MessageBranchPrevious /><MessageBranchPage /><MessageBranchNext />
                  </MessageBranchSelector>
                )}
              </MessageBranch>
            ))}
            {status === 'streaming' && (
              <div className="flex justify-start">
                <div className="p-3" style={{ backgroundColor: 'var(--muted)', borderRadius: 'var(--radius)' }}>
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse" />
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
                  </div>
                </div>
              </div>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
        <div ref={conversationEndRef} />
      </div>

      {/* Footer */}
      <div style={{ padding: `${layout.padY}px ${layout.padX}px`, borderTop: layout.showSectionBorders ? `1px solid ${theme.border}` : 'none', flexShrink: 0 }}>
        {resolvedSuggestions.length > 0 && (
          <div style={{ marginBottom: '10px' }}>
            <Suggestions>
              {resolvedSuggestions.map((s: string) => (
                <Suggestion key={s} onClick={() => handleSuggestionClick(s)} suggestion={s} />
              ))}
            </Suggestions>
          </div>
        )}
        <PromptInput globalDrop multiple onSubmit={handleSubmit}>
          <PromptInputHeader>
            <PromptInputAttachments>{(attachment) => <PromptInputAttachment data={attachment} />}</PromptInputAttachments>
          </PromptInputHeader>
          <PromptInputBody>
            <PromptInputTextarea onChange={(e) => setText(e.target.value)} value={text} placeholder={placeholderText} />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools />
            <PromptInputSubmit disabled={!text.trim() || status === 'streaming'} status={status} />
          </PromptInputFooter>
        </PromptInput>
      </div>
      </div>
    </div>
  );
}
