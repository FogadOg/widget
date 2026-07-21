import type { CSSProperties } from 'react';

export type Props = {
  clientId: string;
  agentId: string;
  configId: string;
  locale: string;
  startOpen: boolean;
  pagePath?: string;
  parentOrigin?: string;
  loaderVersion?: string;
  /** Base64-encoded JSON widget config for preview mode. When set, auth and API calls are skipped. */
  previewConfig?: string;
  /** Theme forced by the embed (data-theme attribute). Overrides the dashboard
   *  WidgetConfig.theme. The host can change it at runtime via setTheme(). */
  themeOverride?: 'light' | 'dark' | 'system';
};

/**
 * Resolved theme for the docs widget. `vars` holds the shadcn CSS custom
 * properties (mapped from the widget config) so every ai-element themes at
 * once; the remaining fields theme the non-token chrome (header/footer borders,
 * panel surface) that uses plain inline styles.
 */
export type DocsTheme = {
  /** CSS custom properties (--primary, --background, --radius, …) + base color/font. */
  vars: CSSProperties;
  /** Outer panel background — opaque, or a translucent rgba() when a visual effect is set. */
  panelBackground: string;
  /** backdrop-filter for glassmorphism/frosted effects (undefined when 'none'). */
  backdropFilter?: string;
  /** Heading text color. */
  title: string;
  /** Muted/secondary text color. */
  subtitle: string;
  /** Hairline/border color. */
  border: string;
};

/**
 * Resolved layout for the docs widget, derived from the config's `layout_variant`
 * ("Widget variant") plus the size / spacing / animation fields set by the
 * "Widget layout styles" presets. Parity with the chat widget's three shells:
 *  - classic — full centered modal with brand chip + subtitle.
 *  - minimal — reduced chrome (no chip, no subtitle) and tighter density.
 *  - panel   — right-anchored side panel with a slim utility rail.
 * Consumed by both render paths (the live Dialog and the admin PreviewModeWidget).
 */
export type DocsLayoutSpec = {
  variant: 'classic' | 'minimal' | 'panel';
  /** Show the brand accent chip in the header (classic only — panel puts it in the rail). */
  showAccentChip: boolean;
  /** Show the subtitle line (hidden in minimal for reduced chrome). */
  showSubtitle: boolean;
  /** Render the left utility rail (panel only). */
  showRail: boolean;
  /** Which edge the panel-variant side panel attaches to (from config `position`). */
  panelSide: 'left' | 'right';
  /** Show the instant-search box (dropped in minimal for an ask-first, lean shell). */
  showSearch: boolean;
  /** Draw the header/footer section divider borders (dropped in minimal for a flat look). */
  showSectionBorders: boolean;
  /** Header title font size, px (18 classic / 15 minimal / 16 panel). */
  titlePx: number;
  /** Density override for the ai-element conversation list (gap/padding per variant). */
  conversationClassName: string;
  /** Horizontal section padding, px (from spacing density). */
  padX: number;
  /** Vertical section padding, px (from spacing density). */
  padY: number;
  /** Centered-modal width, vw (classic/minimal; from size preset). */
  widthVw: number;
  /** Centered-modal height, vh (classic/minimal; from size preset). */
  heightVh: number;
  /** Side-panel width, px (panel variant; from size preset). */
  panelWidthPx: number;
  /** Entrance-animation class for the panel ('' keeps the default Radix entrance). */
  openAnimationClass: string;
  /** Per-message entrance-animation class for the conversation ('' = none). */
  messageAnimationClass: string;
};

export type MessageType = {
  key: string;
  from: "user" | "agent";
  sources?: { url?: string; href?: string; title?: string; snippet?: string; type?: string; reference_id?: string }[];
  versions: {
    id: string;
    content: string;
  }[];
  reasoning?: {
    content: string;
    duration: number;
  };
  /**
   * Offline-queue / retry correlation id. Set on optimistic user messages so a
   * failed send can be matched back to its queued payload and retried.
   */
  queueId?: string;
  /** Message is queued/in-flight (sent while offline or awaiting retry). */
  pending?: boolean;
  /** Send permanently failed (non-retryable, or retries exhausted). */
  failed?: boolean;
  /** Delivery attempts so far, for surfacing "delivering…" vs "failed". */
  attempts?: number;
};
