export type EmbedClientProps = {
  clientId: string;
  agentId: string;
  configId: string;
  locale: string;
  startOpen: boolean;
  pagePath?: string;
  parentOrigin?: string;
  /** Mirror of data-strict-origin. When true, never send postMessage to '*'. */
  strictOrigin?: boolean;
  /** Admin-only: force a specific variant ID to bypass hash assignment (for preview/testing). */
  forceVariantId?: string;
  /** When true, the host page requires explicit storage consent before the widget
   *  may write visitor IDs or session IDs to localStorage (LAUNCH-READINESS #16). */
  consentRequired?: boolean;
  /** When true, the widget is embedded inline (persistent mode) — hides the close/collapse button. */
  persistent?: boolean;
  /** Version of the embed loader script (e.g. "0.1.0"). Absent on pre-versioning installs.
   *  Use this to gate behavior changes so old loaders keep working after a breaking deploy. */
  loaderVersion?: string;
  /**
   * test-only: forcibly display the feedback dialog regardless of timer state
   */
  showFeedbackDialogOverride?: boolean;
  /** Base64-encoded JSON widget config for preview mode. When set, auth and API calls are skipped. */
  previewConfig?: string;
  /** Theme forced by the embed (data-theme attribute). Overrides the dashboard
   *  WidgetConfig.theme. The host can change it at runtime via setTheme(). */
  themeOverride?: 'light' | 'dark' | 'system';
};

export type HostWidgetAction =
  | 'open' | 'close' | 'toggle' | 'reset'
  | 'identify' | 'prefill' | 'context' | 'setTheme';

export type ParsedHostMessageCommand =
  | { kind: 'action'; action: HostWidgetAction; data?: unknown }
  | { kind: 'message'; text: string }
  | null;

export type UnsureMessagesModalProps = {
  messages: Array<{userMessage: string, agentMessage: string, timestamp: number}>;
  onClose: () => void;
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  borderRadius: number;
};
