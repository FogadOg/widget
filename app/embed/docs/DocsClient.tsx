'use client'



import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronLeftIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from '@/components/ui/scroll-area'
import { useWidgetAuth } from '../../../hooks/useWidgetAuth'
import { useWidgetTranslation } from '../../../hooks/useWidgetTranslation'
import { getLocaleDirection, t as translate } from '../../../lib/i18n'
import { API, embedOriginHeader } from '../../../lib/api'
import { validateConfig } from '../../../lib/validateConfig'
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
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input"
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorLogoGroup,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector"
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning"
import { MessageResponse } from "@/components/ai-elements/message"
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ai-elements/sources"
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion"
import { CheckIcon, GlobeIcon, MicIcon } from "lucide-react"
import { nanoid } from "nanoid"
import { toast } from "sonner"
import {
  getSessionStorageKey,
  getVisitorId as helpersGetVisitorId,
  getPageContext as helpersGetPageContext,
  getStoredSession as helpersGetStoredSession,
  storeSession as helpersStoreSession,
  getLocalizedText as helpersGetLocalizedText,
  scrollToBottom as helpersScrollToBottom,
} from './helpers'

// NOTE: exported for testing. Accepts explicit locale to avoid closure on hook.
export function getLocalizedText(textObj: { [lang: string]: string } | undefined, loc?: string): string {
  if (!textObj) return '';
  const useLoc = loc || 'en';

  if (textObj[useLoc]) return textObj[useLoc];
  if (textObj['en']) return textObj['en'];

  const values = Object.values(textObj);
  return values.length > 0 ? values[0] : '';
}

type Props = {
  clientId: string;
  assistantId: string;
  configId: string;
  locale: string;
  startOpen: boolean;
  suggestions?: string[];
  pagePath?: string;
  parentOrigin?: string;
};

type MessageType = {
  key: string;
  from: "user" | "assistant";
  sources?: { url?: string; href?: string; title?: string; snippet?: string; type?: string; reference_id?: string }[];
  versions: {
    id: string;
    content: string;
  }[];
  reasoning?: {
    content: string;
    duration: number;
  };
};

const initialMessages: MessageType[] = [
  {
    key: nanoid(),
    from: "assistant",
    versions: [
      {
        id: nanoid(),
        content: "Hello! I'm your documentation assistant. How can I help you today?",
      },
    ],
  },
];


const defaultSuggestions = [
  "How do I get started?",
  "What are the main features?",
  "Show me code examples",
  "Explain the API",
  "What are best practices?",
  "How do I troubleshoot issues?",
];

export default function DocsClient({ clientId, assistantId, configId, locale: initialLocale, startOpen, suggestions, pagePath, parentOrigin: initialParentOrigin }: Props) {
  const currentSuggestions = suggestions || defaultSuggestions;
  const [open, setOpen] = useState(startOpen);
  const [text, setText] = useState<string>("");
  const [status, setStatus] = useState<
    "submitted" | "streaming" | "ready" | "error"
  >("ready");
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null
  );
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { getAuthToken, authToken, authError } = useWidgetAuth();
  const { translations: t, locale } = useWidgetTranslation();
  const activeLocale = initialLocale || locale || 'en';
  const [liveMessage, setLiveMessage] = useState<string>('');
  const lastAnnouncedKey = useRef<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [messageFeedbackSubmitted, setMessageFeedbackSubmitted] = useState<Set<string>>(new Set());
  const [widgetConfig, setWidgetConfig] = useState<any>(null);
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
    if (initialParentOrigin) return initialParentOrigin;
    if (typeof window === 'undefined') return undefined;

    try {
      if (document.referrer) {
        return new URL(document.referrer).origin;
      }

      if (window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0) {
        return window.location.ancestorOrigins[0];
      }
    } catch (e) {
      console.warn('Could not determine parent origin');
    }

    return undefined;
  }, [initialParentOrigin]);

  useEffect(() => {
    helpersScrollToBottom(conversationEndRef.current, scrollAreaRef.current);
  }, [messages]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = activeLocale;
      document.documentElement.dir = getLocaleDirection(activeLocale);
    }
  }, [activeLocale]);

  useEffect(() => {
    const latestAssistant = [...messages].reverse().find((msg) => msg.from === 'assistant');
    if (!latestAssistant) return;
    const latestContent = latestAssistant.versions?.[latestAssistant.versions.length - 1]?.content || '';
    const announcementKey = `${latestAssistant.key}-${latestContent}`;

    if (announcementKey !== lastAnnouncedKey.current) {
      lastAnnouncedKey.current = announcementKey;
      setLiveMessage(
        translate(activeLocale, 'newMessageAnnouncement', {
          vars: { message: latestContent },
        })
      );
    }
  }, [messages, activeLocale]);

  useEffect(() => {
    if (open && messages.length > 0) {
      // Scroll to bottom when dialog opens and has messages with a longer delay
      setTimeout(() => helpersScrollToBottom(conversationEndRef.current, scrollAreaRef.current), 300);
    }
  }, [open]);

  // helper utilities are provided by ./helpers


  // Create session
  const createSession = useCallback(async (token: string, variantInfo?: { variant_id?: string; variant_name?: string }) => {
    try {
      const visitorId = helpersGetVisitorId(clientId);

            const requestBody: Record<string, unknown> = {
        assistant_id: assistantId,
        visitor_id: visitorId,
        locale: activeLocale,
        ...(variantInfo?.variant_id ? { metadata: { variant_id: variantInfo.variant_id, variant_name: variantInfo.variant_name } } : {}),
            };

      const response = await fetch(API.sessions(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...embedOriginHeader(initialParentOrigin),
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (response.ok && data.status === 'success') {
        setSessionId(data.data.session_id);
        setError(null);
        // Store session data in localStorage
        if (data.data.expires_at) {
          helpersStoreSession(clientId, assistantId, data.data.session_id, data.data.expires_at);
        }
        // Load messages after session creation
        await loadSessionMessages(data.data.session_id, token, true);
      } else {
        const errorMsg = data.detail || 'Failed to create session';
        console.error('Session creation failed:', errorMsg);
        setError(errorMsg);
      }
    } catch (err) {
      const errorMsg = 'Network error: Unable to connect';
      console.error('Session creation error:', err);
      setError(errorMsg);
    }
  }, [assistantId, activeLocale, clientId, initialParentOrigin]);

  // Validate and restore existing session
  const validateAndRestoreSession = useCallback(async (sessionId: string, token: string) => {
    if (!sessionId) {
      console.error('validateAndRestoreSession called with empty sessionId');
      return;
    }
    try {
      const response = await fetch(API.sessionMessages(sessionId), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          ...embedOriginHeader(initialParentOrigin),
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success') {
          setSessionId(sessionId);
          setError(null);
          // Load messages
          const loadedMessages: MessageType[] = data.data.messages
            .filter((msg: any) => {
              if (msg.sender === 'assistant') {
                const userMessages = data.data.messages.filter((m: any) => m.sender === 'user');
                return userMessages.length > 0;
              }
              return true;
            })
            .map((msg: any) => ({
              key: msg.id,
              from: msg.sender as 'user' | 'assistant',
              sources: msg.sources || [],
              versions: [{
                id: msg.id,
                content: msg.content
              }]
            }));
          setMessages(loadedMessages);
          setIsInitialLoad(false);
        } else {
          localStorage.removeItem(getSessionStorageKey(clientId, assistantId));
          createSession(token);
        }
      } else {
        localStorage.removeItem(getSessionStorageKey(clientId, assistantId));
        createSession(token);
      }
    } catch (err) {
      console.error('Session validation error:', err);
      localStorage.removeItem(getSessionStorageKey(clientId, assistantId));
      createSession(token);
    }
  }, [createSession]);

  // Load session messages
  async function loadSessionMessages(sessionId: string, token: string, isNewSession = false) {
    if (!sessionId) {
      console.error('Skipping loadSessionMessages: missing sessionId');
      return;
    }
    try {
      const response = await fetch(API.sessionMessages(sessionId), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          ...embedOriginHeader(initialParentOrigin),
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success') {
          const loadedMessages: MessageType[] = data.data.messages
            .filter((msg: any) => {
              if (msg.sender === 'assistant') {
                const userMessages = data.data.messages.filter((m: any) => m.sender === 'user');
                return userMessages.length > 0;
              }
              return true;
            })
            .map((msg: any) => ({
              key: msg.id,
              from: msg.sender as 'user' | 'assistant',
              sources: msg.sources || [],
              versions: [{
                id: msg.id,
                content: msg.content
              }]
            }));
          setMessages(loadedMessages);
          setIsInitialLoad(false);
        }
      }
    } catch (err) {
      console.error('Error loading messages:', err);
    }
  }

  // Fetch widget config
  const fetchWidgetConfig = useCallback(async (configId: string, token: string): Promise<{ variant_id?: string; variant_name?: string } | undefined> => {
    try {
      const visitorId = helpersGetVisitorId(clientId);
      const response = await fetch(API.widgetConfig(configId, visitorId), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          ...embedOriginHeader(initialParentOrigin),
        },
      });

      const data = await response.json();

      if (response.ok) {
        if (data?.data) {
          const { config: validatedConfig, typeMismatch } = validateConfig(data.data, 'docs');
          data.data = validatedConfig;
          if (typeMismatch) {
            setError('Configuration warning: this config is set to "chat" type but is running in the docs widget. Check your widget_type setting in the admin.');
          }
        }
        setWidgetConfig(data);
        return {
          variant_id: data?.data?.variant_id,
          variant_name: data?.data?.variant_name,
        };
      } else {
        console.error('Failed to fetch widget config:', data);
      }
    } catch (err) {
      console.error('Error fetching widget config:', err);
    }
    return undefined;
  }, [clientId, initialParentOrigin]);



  // Send message to API
  const sendMessageToAPI = useCallback(async (content: string) => {
    if (!sessionId || !authToken) {
      console.error('No sessionId or authToken available');
      return;
    }

    try {
      setStatus("streaming");
      const response = await fetch(API.sessionMessages(sessionId), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          ...embedOriginHeader(initialParentOrigin),
        },
        body: JSON.stringify({
          content: content,
          locale: activeLocale,
          page_context: helpersGetPageContext(),
        }),
      });


      const data = await response.json();

      if (response.ok && data.status === 'success') {
        // Reload all messages from the server to get the assistant's response
        await loadSessionMessages(sessionId, authToken);
      } else {
        console.error('Failed to send message:', data);
        setError(data.detail || 'Failed to send message');
        setStatus("error");
      }
    } catch (err) {
      console.error('Error sending message:', err);
      setError('Network error: Unable to send message');
      setStatus("error");
    } finally {
      setStatus("ready");
    }
  }, [sessionId, authToken, activeLocale, loadSessionMessages, initialParentOrigin]);

  // Handle message feedback submission
  const handleSubmitMessageFeedback = useCallback(async (messageId: string, feedbackType: string = 'thumbs_up') => {
    if (!authToken) return;

    try {
      const response = await fetch(API.messageFeedback(messageId), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          ...embedOriginHeader(initialParentOrigin),
        },
        body: JSON.stringify({
          feedback_type: feedbackType,
        }),
      });

      if (response.ok) {
        setMessageFeedbackSubmitted((prev) => new Set(prev).add(messageId));
        // Show success toast if available
      } else {
        const errorText = await response.text();
        console.error('Failed to submit message feedback:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
      }
    } catch (error) {
      console.error('Error submitting message feedback:', error);
    }
  }, [authToken, initialParentOrigin]);

  const addUserMessage = useCallback(
    async (content: string) => {

      if (!sessionId || !authToken) {
        console.error('Cannot send message: missing sessionId or authToken', { sessionId, authToken: !!authToken });
        setError('Session not initialized. Please refresh the page.');
        return;
      }

      const userMessage: MessageType = {
        key: `user-${Date.now()}`,
        from: "user",
        versions: [
          {
            id: `user-${Date.now()}`,
            content,
          },
        ],
      };

      setMessages((prev) => [...prev, userMessage]);
      setStatus("submitted");

      await sendMessageToAPI(content);
    },
    [sendMessageToAPI, sessionId, authToken]
  );

  const handleSubmit = (message: PromptInputMessage) => {
    const hasText = Boolean(message.text);
    const hasAttachments = Boolean(message.files?.length);

    if (!(hasText || hasAttachments)) {
      return;
    }

    setStatus("submitted");

    if (message.files?.length) {
      toast.success("Files attached", {
        description: `${message.files.length} file(s) attached to message`,
      });
    }

    addUserMessage(message.text || "Sent with attachments");
    setText("");
  };

  const handleSuggestionClick = (suggestion: string) => {
    // Don't set status here - let addUserMessage handle it
    addUserMessage(suggestion);
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);

    // Send resize message to parent
    if (typeof window !== 'undefined' && window.parent) {
      if (newOpen) {
        // Full screen when dialog opens
        window.parent.postMessage({
          type: 'WIDGET_RESIZE',
          data: { width: '100vw', height: '100vh' }
        }, parentOrigin);
      } else {
        // Back to original size and position when dialog closes
        window.parent.postMessage({
          type: 'WIDGET_RESIZE',
          data: { width: 0, height: 0, hide: true }
        }, parentOrigin);
      }
    }
  };

  // Initialize session on mount
  useEffect(() => {
    if (clientId && assistantId) {
      const detectedParentOrigin = resolveParentOrigin();

      getAuthToken(clientId, detectedParentOrigin).then(async (token) => {
        if (token) {
          // Fetch widget config first so variant info is available for session creation
          const variantInfo = await fetchWidgetConfig(configId, token);

          const storedSession = helpersGetStoredSession(clientId, assistantId);
          if (storedSession) {
            validateAndRestoreSession(storedSession.sessionId, token);
          } else {
            createSession(token, variantInfo);
          }
        } else if (authError) {
          console.error('Auth error:', authError);
          setError(authError);
        } else {
          console.error('No token and no authError - check getAuthToken implementation');
          setError('Failed to authenticate');
        }
      }).catch(err => {
        console.error('Error getting auth token:', err);
        setError('Failed to authenticate');
      });
    } else {
      console.warn('Missing clientId or assistantId');
    }
  }, [clientId, assistantId, configId, createSession, validateAndRestoreSession, fetchWidgetConfig, getAuthToken, resolveParentOrigin]);

  // Periodic check for expired sessions
  useEffect(() => {
    const checkSessionExpiry = () => {
      const stored = helpersGetStoredSession(clientId, assistantId);
      if (!stored && sessionId) {
        setSessionId(null);
        setMessages([]);
      }
    };

    const interval = setInterval(checkSessionExpiry, 60000);
    return () => clearInterval(interval);
  }, [sessionId]);

  // Apply hide_on_mobile from widget config for docs widget
  useEffect(() => {
    if (!widgetConfig) return;
    const ua = navigator.userAgent;
    const isMobileDevice = /Android|iPhone|iPad|iPod|Mobile|Mobi/i.test(ua);
    const hideOnMobile = Boolean(widgetConfig?.data?.hide_on_mobile);

    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          { type: hideOnMobile && isMobileDevice ? 'WIDGET_HIDE' : 'WIDGET_SHOW' },
          parentOrigin
        );
      }
    } catch (e) {
      // ignore
    }
  }, [widgetConfig, parentOrigin]);

  // Listen for messages from parent to open/close dialog
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const { type } = event.data || {};

      if (type === 'OPEN_DOCS_DIALOG') {
        handleOpenChange(true);
      } else if (type === 'CLOSE_DOCS_DIALOG') {
        handleOpenChange(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleOpenChange]);

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
        <DialogContent className='mb-8 flex h-[calc(100vh-20vh)] min-w-[calc(100vw-20vw)] flex-col justify-between gap-0 p-0'>
          <ScrollArea ref={scrollAreaRef} className='flex flex-col justify-between overflow-hidden'>
            <DialogHeader className='contents space-y-0 text-left'>
              <DialogTitle className='px-6 pt-6'>{getLocalizedText(widgetConfig?.data?.title, activeLocale) || 'Documentation Assistant'}</DialogTitle>
              <DialogDescription className='px-6 text-sm text-muted-foreground'>
                {getLocalizedText(widgetConfig?.data?.subtitle, activeLocale) || 'How can we help you today?'}
              </DialogDescription>
              {error && (
                <div className="bg-yellow-50 border-l-4 border-yellow-400 text-yellow-800 px-6 py-2 text-sm" role="alert">
                  {error}
                </div>
              )}
              <DialogDescription asChild>
                <div className='p-6'>
                  <div className="flex flex-col min-h-0">
                    <div className="flex-1 mb-4">
                      <Conversation>
                        <ConversationContent>
                          {messages.map(({ versions, ...message }) => (
                            <MessageBranch defaultBranch={0} key={message.key}>
                              <MessageBranchContent>
                                {versions.map((version) => (
                                  <Message
                                    from={message.from}
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
                                      {message.from === 'assistant' && !messageFeedbackSubmitted.has(message.key) && (
                                        <div className="mt-2 flex gap-2">
                                          <button
                                            type="button"
                                            onClick={() => handleSubmitMessageFeedback(message.key, 'thumbs_up')}
                                            className="text-xs opacity-50 hover:opacity-100 transition-opacity flex items-center gap-1"
                                            title={typeof t.feedbackThumbsUp === 'string' ? t.feedbackThumbsUp : String(t.feedbackThumbsUp)}
                                            aria-label={translate(activeLocale, 'feedbackPositive')}
                                          >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                                            </svg>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleSubmitMessageFeedback(message.key, 'thumbs_down')}
                                            className="text-xs opacity-50 hover:opacity-100 transition-opacity flex items-center gap-1"
                                            title={typeof t.feedbackThumbsDown === 'string' ? t.feedbackThumbsDown : String(t.feedbackThumbsDown)}
                                            aria-label={translate(activeLocale, 'feedbackNegative')}
                                          >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.737 3h4.017c.163 0 .326.02.485.06L17 4m-7 10v5a2 2 0 002 2h.095c.5 0 .905-.405.905-.905 0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m6-10h-2" />
                                            </svg>
                                          </button>
                                        </div>
                                      )}
                                      {message.from === 'assistant' && messageFeedbackSubmitted.has(message.key) && (
                                        <div className="mt-2 text-xs opacity-50">
                                          {typeof t.feedbackSubmittedMessage === 'string' ? t.feedbackSubmittedMessage : String(t.feedbackSubmittedMessage)}
                                        </div>
                                      )}
                                    </div>
                                  </Message>
                                ))}
                              </MessageBranchContent>
                              {versions.length > 1 && (
                                <MessageBranchSelector from={message.from}>
                                  <MessageBranchPrevious />
                                  <MessageBranchPage />
                                  <MessageBranchNext />
                                </MessageBranchSelector>
                              )}
                            </MessageBranch>
                          ))}
                          {status === "streaming" && (
                            <div className="flex justify-start">
                              <div className="p-3" style={{ backgroundColor: '#e5e7eb', borderRadius: '8px' }}>
                                <div className="flex space-x-1">
                                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse"></div>
                                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
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
          <DialogFooter className='px-6 pb-6 sm:justify-end w-full'>
            <div className="flex flex-col gap-4 w-full">
              <Suggestions>
                {currentSuggestions.map((suggestion: string) => (
                  <Suggestion
                    key={suggestion}
                    onClick={() => handleSuggestionClick(suggestion)}
                    suggestion={suggestion}
                  />
                ))}
              </Suggestions>
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
                    disabled={!(text.trim() || status) || status === "streaming"}
                    status={status}
                  />
                </PromptInputFooter>
              </PromptInput>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}