import type { CSSProperties } from 'react';
import { hexToRgb } from '../../../lib/colors';
import type { DocsTheme } from './DocsClient.types';

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
