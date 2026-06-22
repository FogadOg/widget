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

export type Message = {
  id: string;
  text: string;
  from: 'user' | 'agent';
  timestamp?: number;
  hasFeedback?: boolean;
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
  };
  pending?: boolean;
};

export type FlowButton = {
  id: string;
  label: Record<string, string>;
  action: string;
  icon?: string;
  // Optional language whitelist. Undefined/empty means visible in all locales.
  languages?: string[];
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
  responses: Array<{
    text?: Record<string, string>;
    buttons?: FlowButton[];
  }>;
};

export type WidgetConfig = {
  id: string;
  widget_type?: 'chat' | 'docs';
  primary_color: string;
  secondary_color: string;
  background_color: string;
  text_color: string;
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
  // Proactive open triggers
  /** Delay in milliseconds before automatically opening the widget (0 = disabled) */
  auto_open_delay?: number;
  /** Scroll depth percentage (0–100) that triggers auto-open (0 = disabled) */
  auto_open_scroll_depth?: number;
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
  // Design system
  spacing?: 'compact' | 'comfortable' | 'spacious';
  open_animation?: 'none' | 'slide' | 'spring' | 'fade';
  bubble_animation?: 'none' | 'pulse' | 'bounce';
  message_animation?: 'none' | 'fade' | 'slide';
  respect_reduced_motion?: boolean;
  visual_effect?: 'none' | 'glassmorphism' | 'frosted';
  font_source?: 'system' | 'google';
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
