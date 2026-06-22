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
import { MessageType, DocsTheme } from '../DocsClient.types'

interface PreviewModeWidgetProps {
  theme: DocsTheme;
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
}

export function PreviewModeWidget({
  theme,
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
}: PreviewModeWidgetProps) {
  return (
    <div style={{ ...theme.vars, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: theme.panelBackground, backdropFilter: theme.backdropFilter, WebkitBackdropFilter: theme.backdropFilter, overflow: 'hidden' }}>
      <div
        aria-live="polite" aria-atomic="true"
        style={{ position: 'absolute', left: '-9999px', height: '1px', width: '1px', overflow: 'hidden' }}
      >{liveMessage}</div>

      {/* Header */}
      <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${theme.border}`, flexShrink: 0 }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: theme.title, lineHeight: 1.3 }}>{title}</h2>
        {subtitle && <p style={{ margin: '4px 0 0', fontSize: '14px', color: theme.subtitle, lineHeight: 1.5 }}>{subtitle}</p>}
        {error && (
          <div style={{ marginTop: '8px', background: '#fefce8', borderLeft: '4px solid #facc15', color: '#713f12', padding: '6px 12px', fontSize: '13px' }} role="alert">
            {error}
          </div>
        )}
      </div>

      {/* Conversation */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
        <Conversation>
          <ConversationContent>
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
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse" />
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
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
      <div style={{ padding: '12px 24px 20px', borderTop: `1px solid ${theme.border}`, flexShrink: 0 }}>
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
            <PromptInputSubmit disabled={!(text.trim() || status) || status === 'streaming'} status={status} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
