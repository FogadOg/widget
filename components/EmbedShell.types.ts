import React from 'react';
import type {
  Message,
  WidgetConfig,
  FlowResponse,
  UnsureMessage,
} from '../types/widget';
import { ButtonLike } from '../hooks/useClickedButtons';

export type Props = {
  isEmbedded: boolean;
  isCollapsed: boolean;
  toggleCollapsed: () => void;
  messages: Message[];
  isTyping: boolean;
  /** Partial agent text while a response streams in (null when idle). */
  streamingMessage?: string | null;
  input: string;
  setInput: (v: string) => void;
  handleSubmit: (e: React.FormEvent, messageText?: string, skipAddingUserMessage?: boolean) => void | Promise<void>;
  onStopStreaming?: () => void;
  onCloseUnsureModal?: () => void;
  onDismissHandoff?: () => void;
  error?: string | null;
  title?: string;
  agentName?: string;
  /** Display name of the identified user — personalizes the greeting (e.g. "Hi Alice!"). */
  identifiedUserName?: string | null;
  widgetConfig?: WidgetConfig;
  onInteractionButtonClick?: (button: ButtonLike) => void | Promise<void>;
  onFollowUpButtonClick?: (button: ButtonLike) => void | Promise<void>;
  flowResponses?: FlowResponse[];
  getLocalizedText?: (textObj: Record<string, string> | undefined) => string;
  showFeedbackDialog?: boolean;
  feedbackDialog?: React.ReactNode;
  messageFeedbackSubmitted?: Set<string>;
  onSubmitMessageFeedback?: (messageId: string, feedbackType?: string) => void;
  unsureModal?: React.ReactNode;
  handoffModal?: React.ReactNode;
  unsureMessages?: UnsureMessage[];
  onShowUnsureModal?: () => void;
  unreadCount?: number;
  /** Locale passed directly from the parent (server-provided). Takes priority over hook detection. */
  locale?: string;
  /** Locale codes to offer in the in-widget language switcher. Switcher is hidden when fewer than 2. */
  availableLocales?: string[];
  /** Called when the visitor picks a language from the switcher. Omit to hide the switcher. */
  onLocaleChange?: (locale: string) => void;
  hideCloseButton?: boolean;
  isPersistent?: boolean;
  /** Whether the proactive teaser bubble is currently visible */
  showTeaser?: boolean;
  /** True while the teaser is live (fired, not dismissed). During the gap before
   *  showTeaser the bubble renders hidden so it can be measured for the resize. */
  teaserExpanded?: boolean;
  /** Whether a teaser is configured (pre-sizes the iframe even before the delay fires) */
  teaserConfigured?: boolean;
  /** Locale-resolved teaser message string */
  teaserMessage?: string | null;
  /** Reports the rendered bubble's size so the iframe can be sized to fit it exactly */
  onTeaserMeasure?: (size: { width: number; height: number }) => void;
  /** Dismiss the teaser for this page view */
  onDismissTeaser?: () => void;
  /** Widget file-upload composer wiring (gated by the widget_file_upload plan feature). */
  fileUploadEnabled?: boolean;
  pendingAttachments?: Array<{ id: string; filename: string }>;
  uploadingFiles?: number;
  onPickFiles?: (files: FileList) => void;
  onRemoveAttachment?: (id: string) => void;
  sessionExpiredBanner?: boolean;
  onDismissSessionExpiredBanner?: () => void;
  /** Storage-consent notice (data-consent-required): shown until the visitor
   *  or the host page grants/declines. Both callbacks present ⇒ banner renders. */
  showConsentPrompt?: boolean;
  onConsentAccept?: () => void;
  onConsentDecline?: () => void;
  isOffline?: boolean;
  /** When true, anchors the widget to bottom-right (preview iframe). Default centers within the loader's small iframe. */
  previewPositioning?: boolean;
  /** When true, the greeting block is always shown regardless of conversation state. */
  isPreview?: boolean;
};
