import type { CSSProperties } from 'react';
import { hexToRgb } from '../../../lib/colors';
import type { DocsTheme, DocsLayoutSpec } from './DocsClient.types';

// Section padding (px) per spacing density. `comfortable` maps to 24/20 so it
// matches the docs widget's previous hardcoded padding (p-6) — no regression for
// existing configs, which default to `comfortable`.
const DOCS_SPACING_PAD: Record<string, { x: number; y: number }> = {
  compact: { x: 16, y: 14 },
  comfortable: { x: 24, y: 20 },
  spacious: { x: 32, y: 28 },
};

// Modal/side-panel dimensions per size preset. Kept viewport-relative (parity
// with the docs widget's previous 80vw × 80vh) so `md` — the default — is
// unchanged; sm/lg scale around it. Panel width is a fixed px side-rail width.
const DOCS_SIZE: Record<string, { vw: number; vh: number; panel: number }> = {
  sm: { vw: 64, vh: 70, panel: 400 },
  md: { vw: 80, vh: 80, panel: 480 },
  lg: { vw: 92, vh: 90, panel: 600 },
};

const OPEN_ANIM_CLASS: Record<string, string> = {
  slide: 'docs-open--slide',
  spring: 'docs-open--spring',
  fade: 'docs-open--fade',
  none: 'docs-open--none',
};

// Reuses the chat widget's message-entrance keyframes (translateY-based, so they
// are safe on the docs surface — unlike the panel keyframes, which assume the
// chat panel's -50% centering transform).
const MSG_ANIM_CLASS: Record<string, string> = {
  fade: 'widget-messages--fade',
  slide: 'widget-messages--slide',
  none: '',
};

/**
 * Resolve the docs widget's layout from its config. Mirrors the chat widget's
 * `layout_variant` dispatch and layout-style handling (size/spacing/animation)
 * so the "Widget variant" and "Widget layout styles" admin controls take effect
 * on the docs widget too. `position`/`edge_offset` are chat-only (stripped for
 * docs by validateConfig) and intentionally ignored.
 */
export function resolveDocsLayout(data: unknown): DocsLayoutSpec {
  const cfg = (data ?? {}) as Record<string, unknown>;
  const variant = (['classic', 'minimal', 'panel'].includes(cfg.layout_variant as string)
    ? (cfg.layout_variant as string)
    : 'classic') as DocsLayoutSpec['variant'];
  const size = (['sm', 'md', 'lg'].includes(cfg.size as string) ? (cfg.size as string) : 'md');
  // The panel variant attaches to the side implied by `position` (a "Widget
  // layout style" field): a left-* corner → left panel, otherwise right. The
  // centered classic/minimal modal ignores position (stays centered) so existing
  // docs configs — whose default position is bottom-right — don't shift.
  const panelSide: 'left' | 'right' = /left/.test(String(cfg.position ?? '')) ? 'left' : 'right';
  const spacing = (['compact', 'comfortable', 'spacious'].includes(cfg.spacing as string)
    ? (cfg.spacing as string)
    : 'comfortable');
  const pad = DOCS_SPACING_PAD[spacing];
  const dim = DOCS_SIZE[size];
  // Only override the panel's built-in entrance / add per-message animation when
  // the admin explicitly picked one (i.e. the field is present) — an unset field
  // keeps the previous default behavior for legacy configs.
  const openAnimationClass = cfg.open_animation
    ? (OPEN_ANIM_CLASS[cfg.open_animation as string] ?? '')
    : '';
  const messageAnimationClass = cfg.message_animation
    ? (MSG_ANIM_CLASS[cfg.message_animation as string] ?? '')
    : '';

  // Per-variant chrome — deliberately distinct, mirroring the chat widget's three
  // shells (classic = full reader, minimal = lean/flat/dense, panel = app rail).
  const CONVO_DENSITY: Record<DocsLayoutSpec['variant'], string> = {
    classic: 'gap-6 p-4',
    minimal: 'gap-3 p-2',
    panel: 'gap-4 p-3',
  };
  const TITLE_PX: Record<DocsLayoutSpec['variant'], number> = {
    classic: 18,
    minimal: 15,
    panel: 16,
  };

  return {
    variant,
    showAccentChip: variant === 'classic',
    showSubtitle: variant !== 'minimal',
    showRail: variant === 'panel',
    panelSide,
    showSearch: variant !== 'minimal',
    showSectionBorders: variant !== 'minimal',
    titlePx: TITLE_PX[variant],
    conversationClassName: CONVO_DENSITY[variant],
    padX: pad.x,
    padY: pad.y,
    widthVw: dim.vw,
    heightVh: dim.vh,
    panelWidthPx: dim.panel,
    openAnimationClass,
    messageAnimationClass,
  };
}

/** Subset of useWidgetStyles() output that buildDocsTheme consumes. */
type DocsStyleInput = {
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  readableOnPrimary: string;
  mutedTextColor: string;
  subtleBorderColor: string;
  agentBubbleBg: string;
  borderRadius: number;
  fontStyles: { fontFamily: string; fontSize: string; fontWeight: string };
  visualEffectStyles: { backdropFilter?: string; WebkitBackdropFilter?: string; backgroundOpacityOverride?: number };
};

/**
 * Map the widget config (normalized by useWidgetStyles) onto the shadcn CSS
 * custom properties the docs widget's ai-elements consume, plus the inline
 * chrome colors. Setting these variables on a scope element re-themes every
 * Dialog/Conversation/Message/PromptInput at once — colors, radius and font.
 * A glassmorphism/frosted `visual_effect` becomes a translucent panel surface
 * with a backdrop-filter. (Spacing density and open/message animations are
 * chat-panel concepts and aren't mapped onto the docs modal.)
 */
export function buildDocsTheme(s: DocsStyleInput): DocsTheme {
  const opacityOverride = s.visualEffectStyles.backgroundOpacityOverride;
  const panelBackground =
    opacityOverride != null
      ? `rgba(${hexToRgb(s.backgroundColor)}, ${opacityOverride})`
      : s.backgroundColor;

  const vars = {
    '--background': s.backgroundColor,
    '--foreground': s.textColor,
    '--card': s.backgroundColor,
    '--card-foreground': s.textColor,
    '--popover': s.backgroundColor,
    '--popover-foreground': s.textColor,
    '--primary': s.primaryColor,
    '--primary-foreground': s.readableOnPrimary,
    '--secondary': s.agentBubbleBg,
    '--secondary-foreground': s.textColor,
    '--muted': s.agentBubbleBg,
    '--muted-foreground': s.mutedTextColor,
    '--accent': s.agentBubbleBg,
    '--accent-foreground': s.textColor,
    '--border': s.subtleBorderColor,
    '--input': s.subtleBorderColor,
    '--ring': s.primaryColor,
    '--radius': `${s.borderRadius}px`,
    // Base color/font so any element without an explicit token still inherits.
    color: s.textColor,
    fontFamily: s.fontStyles.fontFamily,
    fontSize: s.fontStyles.fontSize,
  } as CSSProperties;

  return {
    vars,
    panelBackground,
    backdropFilter: s.visualEffectStyles.backdropFilter,
    title: s.textColor,
    subtitle: s.mutedTextColor,
    border: s.subtleBorderColor,
  };
}

// NOTE: exported for testing. Accepts explicit locale to avoid closure on hook.
export function getLocalizedText(textObj: { [lang: string]: string } | undefined, loc?: string): string {
  if (!textObj) return '';
  const useLoc = loc || 'en';

  if (textObj[useLoc]) return textObj[useLoc];
  if (textObj['en']) return textObj['en'];

  const values = Object.values(textObj);
  return values.length > 0 ? values[0] : '';
}

export function resolveLocalizedSuggestions(
  raw: unknown,
  loc?: string,
  defaultLanguage?: string,
): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((s): s is string => typeof s === 'string');
  }
  if (raw && typeof raw === 'object') {
    const map = raw as Record<string, unknown>;
    const candidates = [loc, defaultLanguage, 'en'].filter(Boolean) as string[];
    for (const lang of candidates) {
      const arr = map[lang];
      if (Array.isArray(arr) && arr.length > 0) {
        return arr.filter((s): s is string => typeof s === 'string');
      }
    }
    for (const arr of Object.values(map)) {
      if (Array.isArray(arr) && arr.length > 0) {
        return arr.filter((s): s is string => typeof s === 'string');
      }
    }
  }
  return [];
}

// Validates that an inbound postMessage actually originates from the host page
// we expect, mirroring the session widget's gate (EmbedClient.utils.ts). Used to
// stop a malicious framing/sibling window from forging control messages
// (clear-session, log-stream, diagnostics, identify) to the docs widget. Under
// dynamic embed-allowlist mode any HTTPS site can frame the widget, so this is
// the authoritative gate for inbound commands.
export function isTrustedParentMessage(
  event: MessageEvent,
  expectedOrigin: string | null | undefined,
): boolean {
  if (typeof window === 'undefined' || window.parent === window) return false;
  // Tests dispatch plain objects whose `source` is not window.parent; in that
  // case fall back to matching the expected origin.
  if (event.source === window.parent) return true;
  if (!expectedOrigin) return false;
  if (expectedOrigin !== '*' && event.origin !== expectedOrigin) return false;
  return true;
}

export function resolveParentOrigin(initialParentOrigin?: string): string | undefined {
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
}
