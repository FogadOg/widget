import type { WidgetConfig } from '../../../types/widget';
import { BUTTON_SIZES } from '../../../lib/constants';
import type { HostWidgetAction, ParsedHostMessageCommand } from './EmbedClient.types';

export const getButtonPixelSize = (buttonSize: string) => {
  return BUTTON_SIZES[buttonSize as keyof typeof BUTTON_SIZES] || BUTTON_SIZES.md;
};

export const getNormalizedEdgeOffset = (config?: WidgetConfig | null): number => {
  if (!config) return 20;

  const raw = (config as WidgetConfig & { edgeOffset?: unknown }).edgeOffset ?? config.edge_offset;

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }

  if (typeof raw === 'string') {
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 20;
};

export function parseHostMessageCommand(raw: unknown): ParsedHostMessageCommand {
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return null;
    const cmd = text.toLowerCase();
    if (cmd === 'open' || cmd === 'show' || cmd === 'restore') return { kind: 'action', action: 'open' };
    if (cmd === 'close' || cmd === 'hide' || cmd === 'minimize') return { kind: 'action', action: 'close' };
    if (cmd === 'toggle') return { kind: 'action', action: 'toggle' };
    return { kind: 'message', text };
  }

  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const payload = raw as Record<string, unknown>;
  const commandValue = [payload.action, payload.command, payload.event, payload.type]
    .find((value) => typeof value === 'string');
  const command = typeof commandValue === 'string' ? commandValue.trim().toLowerCase() : '';

  if (command) {
    if (command === 'open' || command === 'show' || command === 'restore') {
      return { kind: 'action', action: 'open' };
    }

    if (command === 'close' || command === 'hide' || command === 'minimize') {
      return { kind: 'action', action: 'close' };
    }

    if (command === 'toggle') {
      return { kind: 'action', action: 'toggle' };
    }
  }

  const textValue = [payload.text, payload.message, payload.content, payload.prompt, payload.query]
    .find((value) => typeof value === 'string');
  const text = typeof textValue === 'string' ? textValue.trim() : '';
  if (!text) {
    return null;
  }

  return { kind: 'message', text };
}

export function resolveParentTargetOrigin(
  explicit?: string,
  referrer?: string,
  /** When true, fall back to the document referrer origin but never '*' */
  strict?: boolean,
): string | null {
  const explicitOrigin = (explicit || '').trim();
  if (explicitOrigin) {
    return explicitOrigin;
  }

  const fallbackReferrer = typeof referrer === 'string'
    ? referrer
    : (typeof document !== 'undefined' ? document.referrer : '');

  if (fallbackReferrer) {
    try {
      const parsed = new URL(fallbackReferrer);
      if (parsed.origin) {
        return parsed.origin;
      }
    } catch {
      // ignore invalid referrer
    }
  }

  // In strict mode never fall back to wildcard — refuse to post to unknown origins.
  // The parent window will not receive messages until it re-embeds with a valid origin.
  if (strict) return null;
  return '*';
}
