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
  handleSubmit: (e: React.FormEvent, messageText?: string, skipAddingUserMessage?: boolean) => void;
  onStopStreaming?: () => void;
  onCloseUnsureModal?: () => void;
  onDismissHandoff?: () => void;
  error?: string | null;
  title?: string;
  agentName?: string;
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
  hideCloseButton?: boolean;
  isPersistent?: boolean;
  sessionExpiredBanner?: boolean;
  onDismissSessionExpiredBanner?: () => void;
  isOffline?: boolean;
  /** When true, anchors the widget to bottom-right (preview iframe). Default centers within the loader's small iframe. */
  previewPositioning?: boolean;
  /** When true, the greeting block is always shown regardless of conversation state. */
  isPreview?: boolean;
};
