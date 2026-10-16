// Widget Type Definitions
// Minimal runtime export used for tests/coverage. Remove only if you want this file
// excluded from coverage again.
export const __TEST_TYPES = true

export type SourceData = {
  type: string;
  title: string;
  snippet?: string;
  url?: string;
  reference_id?: string;
};

export type MessageAttachment = {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  url: string | null;
};

/**
 * What taking a rich-block action does.
 *
 * - `link`       — opens `url`.
 * - `reply`      — sends `payload` as if the visitor had typed it.
 * - `conversion` — records the goal and nothing else (the outcome itself
 *                  happens on the host page).
 */
export type RichActionKind = 'link' | 'reply' | 'conversion';

export type RichAction = {
  /** Stable within its message; half of the conversion dedup key. */
  id: string;
  kind: RichActionKind;
  label: string;
  /** Required for `link`. Always absolute, https/mailto/tel (server-enforced). */
  url?: string;
  /** Required for `reply`; defaults to the label server-side. */
  payload?: string;
  /** When set, taking the action records a ConversionEvent under this goal. */
  conversion_goal?: string;
};

/** Always https — the embed CSP is `img-src 'self' data: https:`. */
export type RichImage = { url: string; alt?: string };

/** One line under a card title: price, dates, availability. */
export type RichMetaRow = { label?: string; value: string };

export type RichCard = {
  title: string;
  subtitle?: string;
  image?: RichImage;
  meta?: RichMetaRow[];
  actions?: RichAction[];
};

export type RichBlock =
  | ({ type: 'card' } & RichCard)
  | { type: 'carousel'; items: RichCard[] }
  | { type: 'image'; url: string; alt?: string; link?: string }
  | { type: 'links'; items: Array<{ label: string; url: string }> }
  | { type: 'buttons'; buttons: RichAction[] };

/**
 * Structured content attached to an agent reply, minted server-side only
 * (`core/services/rich_blocks.py`). A `v` the widget doesn't recognize renders
 * as nothing — that's what lets the schema grow without breaking transcripts
 * already in the database.
 */
export type RichContent = { v: number; blocks: RichBlock[] };

export type Message = {
  id: string;
  text: string;
  from: 'user' | 'agent';
  timestamp?: number;
  hasFeedback?: boolean;
  sources?: SourceData[];
  attachments?: MessageAttachment[];
  metadata?: {
    assistant_unsure?: boolean;
    handoff?: boolean;
    safety_policy_action?: string;
    safety_decision_reason?: string;
    citation_validation_passed?: boolean;
    citation_validation_reason?: string;
    confidence_score?: number;
    confidence_threshold?: number;
    rich?: RichContent;
  };
  pending?: boolean;
};

/**
 * How a clicked button (or a triggered flow) produces its reply.
 *
 * `manual` — the merchant authored the reply text; the widget renders it
 * client-side without touching the backend. This is the default and the only
 * behaviour that existed before AI answers; a missing field means `manual`.
 *
 * `ai` — the merchant authored nothing but the label. On click the widget sends
 * the label (or `ai_prompt`) through the normal message endpoint so the agent
 * answers live from the knowledge base.
 */
export type AnswerMode = 'manual' | 'ai';

export type FlowButton = {
  id: string;
  label: Record<string, string>;
  action: string;
  icon?: string;
  // Optional language whitelist. Undefined/empty means visible in all locales.
  languages?: string[];
  answer_mode?: AnswerMode;
  /** Sent to the agent instead of the label. Empty means "use the label". */
  ai_prompt?: string;
  response?: {
    text?: Record<string, string>;
    buttons?: FlowButton[];
  };
};

export type FlowResponse = {
  text: string;
  buttons: FlowButton[];
  timestamp: number;
};

export type Flow = {
  id: string;
  trigger: string;
  // Optional language whitelist. Undefined/empty means visible in all locales.
  languages?: string[];
  answer_mode?: AnswerMode;
  /** Sent to the agent instead of the triggering button's label. */
  ai_prompt?: string;
  responses: Array<{
    text?: Record<string, string>;
    buttons?: FlowButton[];
  }>;
};

/**
 * One page-targeted teaser rule. Shape and bounds are enforced server-side by
 * `WidgetConfigSerializer.validate_teaser_rules`, so the widget treats these as
 * already-validated — but still resolves defensively, because a config can also
 * arrive from a host page via `WIDGET_INIT_CONFIG`.
 */
export type TeaserRule = {
  /** Stable id, used to attribute impressions and opens back to the rule. */
  id: string;
  match: {
    type: 'prefix' | 'contains' | 'regex';
    value: string;
  };
  delay_ms?: number;
  dismiss_after_ms?: number;
  /** Locale → text, resolved with the same fallback chain as `teaser_message`. */
  message: Record<string, string>;
  /** `open` is reserved for the auto-open phase; today every rule renders a bubble. */
  action?: 'bubble' | 'open';
  /** Requires a loader new enough to report exit intent from the host page. */
  on_exit_intent?: boolean;
};

/**
 * One input on the in-chat capture card, as configured on the agent.
 *
 * `label` is operator-authored and rendered verbatim. It is empty for the two
 * reserved keys on an unconfigured agent, which is the card's signal to use its
 * own localized string instead — that is what keeps the default card translated
 * in every locale while a custom field shows exactly what was typed.
 */
export type LeadCaptureField = {
  key: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'textarea';
  required: boolean;
};

export type WidgetConfig = {
  id: string;
  widget_type?: 'chat' | 'docs';
  primary_color: string;
  secondary_color: string;
  background_color: string;
  text_color: string;
  // Dark-mode palette. Blank/absent = derive a dark surface from the light
  // palette (legacy behavior). Used by useWidgetStyles when the theme resolves dark.
  dark_primary_color?: string;
  dark_secondary_color?: string;
  dark_background_color?: string;
  dark_text_color?: string;
  border_radius: number;
  start_open: boolean;
  hide_on_mobile: boolean;
  title: Record<string, string>;
  subtitle: Record<string, string>;
  placeholder: Record<string, string>;
  suggestions?: string[] | Record<string, string[]>;
  greeting_message: {
    text: Record<string, string>;
    buttons?: FlowButton[];
    flows?: Flow[];
  };
  default_language: string;
  font_family: string;
  font_size: number;
  font_weight: string;
  shadow_intensity: string;
  shadow_color: string;
  size?: 'sm' | 'md' | 'lg';
  button_size: string;
  message_bubble_radius: number;
  button_border_radius: number;
  opacity: number;
  // Positioning
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  edge_offset: number;
  edgeOffset?: number | string;
  // Optional images
  logo?: string;
  bot_avatar?: string;
  // Behavior flags
  show_timestamps?: boolean;
  show_typing_indicator?: boolean;
  show_message_avatars?: boolean;
  show_unread_badge?: boolean;
  // Proactive teaser bubble
  /** Nudge message shown beside the launcher before the user opens the widget (locale → text) */
  teaser_message?: Record<string, string>;
  /** Delay in ms before the teaser bubble appears (default: 3000; 0 = show immediately) */
  teaser_delay?: number;
  /** Auto-hide the teaser after this many ms (default: 0 = stays until dismissed or widget opens) */
  teaser_dismiss_after?: number;
  /**
   * Page-targeted nudges, in priority order — the first rule that matches the
   * visitor's path and resolves a message for their locale wins. Absent or
   * empty (including for any org whose plan doesn't unlock
   * `widget_proactive_triggers`) means the three fields above are used as-is.
   */
  teaser_rules?: TeaserRule[];
  // Security
  /** When true, postMessage is only sent to the exact parentOrigin — never '*' */
  strict_origin?: boolean;
  // A/B testing — populated by the backend when ab_test_enabled=true and visitor_id is provided
  ab_test_enabled?: boolean;
  /** UUID of the assigned variant (present only when A/B is active) */
  variant_id?: string;
  /** Human-readable name of the assigned variant */
  variant_name?: string;
  // Analytics
  /** Google Analytics measurement ID (e.g. "G-XXXXXXXXXX") — sent to host page via postMessage */
  ga_measurement_id?: string | null;
  // Plan-derived flags (resolved server-side from the org's plan in the public config)
  /** When true, hide the "Powered by" badge (remove_branding plan feature). */
  hide_branding?: boolean;
  /** When false, the org's plan doesn't include support tickets — the human-handoff flow is disabled. */
  support_tickets_enabled?: boolean;
  /**
   * When true, the widget may offer inline email capture after an unanswered
   * question (lead_capture plan feature — available on every plan).
   */
  lead_capture_enabled?: boolean;
  /**
   * What the capture card asks for, configured per agent. The server always
   * sends a usable list (email plus an optional name when the agent was never
   * configured), so the card renders from this and nothing else.
   */
  lead_capture_fields?: LeadCaptureField[];
  /** When true, the composer shows a file-attach control (widget_file_upload plan feature + org toggle). */
  file_upload_enabled?: boolean;
  // Design system
  spacing?: 'compact' | 'comfortable' | 'spacious';
  open_animation?: 'none' | 'slide' | 'spring' | 'fade';
  bubble_animation?: 'none' | 'pulse' | 'bounce';
  message_animation?: 'none' | 'fade' | 'slide';
  respect_reduced_motion?: boolean;
  visual_effect?: 'none' | 'glassmorphism' | 'frosted';
  font_source?: 'system' | 'google';
  layout_variant?: 'classic' | 'minimal' | 'panel';
  // Color theme. 'system' follows the visitor's prefers-color-scheme; 'dark'
  // swaps in a dark surface/text set (all derived neutrals adapt in useWidgetStyles).
  theme?: 'light' | 'dark' | 'system';
};

/**
 * A single A/B testing variant as returned by the admin API.
 * config_overrides is a partial WidgetConfig that is merged on top of the base.
 */
export type WidgetConfigVariant = {
  id: string;
  name: string;
  traffic_weight: number;
  is_active: boolean;
  config_overrides: Partial<Omit<WidgetConfig, 'id' | 'variant_id' | 'variant_name' | 'ab_test_enabled' | 'variants'>>;
  created_at: string;
  updated_at: string;
};

export type ApiResponse<T> = {
  status: 'success' | 'error';
  data?: T;
  message?: string;
  error?: string;
};

export type SessionData = {
  session_id: string;
  expires_at: string;
};

export type TokenData = {
  token: string;
  /** ISO-8601 expiry timestamp returned by the auth endpoint */
  expires_at?: string;
};

export type MessageData = {
  user_message: {
    id: string;
    content: string;
    created_at: string;
  };
  assistant_message: {
    id: string;
    content: string;
    created_at: string;
    sources?: SourceData[];
    metadata?: {
      assistant_unsure?: boolean;
      handoff?: boolean;
      safety_policy_action?: string;
      safety_decision_reason?: string;
      citation_validation_passed?: boolean;
      citation_validation_reason?: string;
      confidence_score?: number;
      confidence_threshold?: number;
      rich?: RichContent;
      /** Links a capture back to the question that went unanswered. */
      unanswered_question_id?: string | null;
      /**
       * Present when the agent itself asked for the capture card, because the
       * visitor wanted something a human should pick up. `topic` is the agent's
       * one-line summary and becomes the ticket's message.
       */
      capture_offer?: { reason?: string; topic?: string } | null;
    };
  };
};

export type PageContext = {
  url: string;
  pathname: string | null;
  title: string | null;
  referrer: string | null;
};

export type UnsureMessage = {
  userMessage: string;
  agentMessage: string;
  timestamp: number;
};
