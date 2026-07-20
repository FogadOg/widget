/**
 * Widget config validation module.
 *
 * Validates a raw config object against the expected widget_type.
 * - In development: throws on mismatch to surface problems early.
 * - In production: warns, sets typeMismatch flag, sanitizes config
 *   (strips chat-only fields when type is 'docs'), and continues.
 *
 * Legacy configs that omit widget_type are inferred from their content
 * and a deprecation warning is logged.
 *
 * Typed errors:
 *  - MissingFieldError  — a required config field is absent.
 *  - InvalidValueError  — a field value is outside the accepted set.
 */

import type { WidgetConfig } from '../types/widget';

// ── Typed error classes ────────────────────────────────────────────────────

/**
 * Thrown when a required widget config field is missing.
 *
 * @example
 *   // Missing required field: apiKey.
 *   // Add apiKey: "your-key" to widget config.
 *   // See: /docs/configuration#apiKey
 */
export class MissingFieldError extends Error {
  readonly field: string;
  readonly docLink?: string;

  constructor(field: string, docLink?: string) {
    const link = docLink ? `\n  See: ${docLink}` : '';
    super(
      `[widget] Missing required field: ${field}.\n` +
      `  Add ${field}: "<value>" to your widget config.${link}`
    );
    this.name = 'MissingFieldError';
    this.field = field;
    this.docLink = docLink;
  }
}

/**
 * Thrown when a widget config field has a value outside the accepted set.
 *
 * @example
 *   // Invalid position: "top-center".
 *   // Valid options: "bottom-right", "bottom-left", "top-right", "top-left".
 *   // See: /docs/configuration#position
 */
export class InvalidValueError extends Error {
  readonly field: string;
  readonly received: unknown;
  readonly validOptions: readonly unknown[];
  readonly docLink?: string;

  constructor(field: string, received: unknown, validOptions: readonly unknown[], docLink?: string) {
    const opts = validOptions.map((v) => `"${v}"`).join(', ');
    const link = docLink ? `\n  See: ${docLink}` : '';
    super(
      `[widget] Invalid ${field}: "${received}".\n` +
      `  Valid options: ${opts}.${link}`
    );
    this.name = 'InvalidValueError';
    this.field = field;
    this.received = received;
    this.validOptions = validOptions;
    this.docLink = docLink;
  }
}

/**
 * Fields that are only meaningful for 'chat' widgets.
 *
 * NOTE: `position`/`edge_offset` are intentionally NOT stripped for docs — the
 * docs widget now honors them (panel-variant side + preview placement) as part
 * of the "Widget layout styles" presets, mirroring the chat widget.
 */
const CHAT_ONLY_FIELDS: ReadonlyArray<keyof WidgetConfig> = [
  'start_open',
  'greeting_message',
  'show_timestamps',
  'show_typing_indicator',
  'show_message_avatars',
  'show_unread_badge',
];

const getIsDev = () => process.env.NODE_ENV === 'development';

export type ValidateConfigResult = {
  config: WidgetConfig;
  /** True when the config's widget_type does not match the expected runtime type. */
  typeMismatch: boolean;
};

/**
 * Infer widget_type from config fields when widget_type is absent.
 * Returns 'chat' as safe default.
 */
export function inferWidgetType(config: Partial<WidgetConfig>): 'chat' | 'docs' {
  // If it has chat-specific interactive fields, treat as chat.
  if (
    config.greeting_message !== undefined ||
    config.start_open !== undefined ||
    config.show_unread_badge !== undefined
  ) {
    return 'chat';
  }
  return 'chat'; // safe default; docs widgets should send widget_type explicitly
}

/** Required fields every widget config must have. */
const REQUIRED_FIELDS: ReadonlyArray<keyof WidgetConfig> = [
  'id',
  'primary_color',
  'background_color',
  'text_color',
];

/**
 * Validate rawConfig against the expected expectedType.
 *
 * Returns { config, typeMismatch } where config is safe to use at runtime.
 * Throws in dev if there is a type mismatch; warns + returns typeMismatch=true in prod.
 * Throws MissingFieldError for any required field that is absent.
 */
export function validateConfig(
  rawConfig: Partial<WidgetConfig>,
  expectedType: 'chat' | 'docs'
): ValidateConfigResult {
  // Check required fields — throw in dev, warn in prod (mirrors type-mismatch behaviour).
  for (const field of REQUIRED_FIELDS) {
    if (rawConfig[field] === undefined || rawConfig[field] === null) {
      const err = new MissingFieldError(
        field as string,
        `https://docs.companin.tech/widget/configuration#${field as string}`,
      );
      if (getIsDev()) {
        throw err;
      }
      console.warn(err.message);
    }
  }

  // Infer type if missing (legacy config).
  let resolvedType = rawConfig.widget_type;
  if (!resolvedType) {
    resolvedType = inferWidgetType(rawConfig);
    console.warn(
      `[widget] Config "${rawConfig.id}" is missing widget_type. ` +
        `Inferred as "${resolvedType}". ` +
        'Set widget_type explicitly in your embed snippet to suppress this warning.'
    );
  }

  let typeMismatch = false;

  if (resolvedType !== expectedType) {
    const msg =
      `[widget] Type mismatch: config "${rawConfig.id}" has widget_type="${resolvedType}" ` +
      `but was loaded by the "${expectedType}" runtime.`;

    if (getIsDev()) {
      throw new Error(msg);
    }
    console.warn(msg);
    typeMismatch = true;
  }

  // For docs runtime, strip chat-only fields to avoid confusing the runtime.
  const sanitized: Partial<WidgetConfig> = { ...rawConfig, widget_type: resolvedType };
  if (expectedType === 'docs') {
    for (const field of CHAT_ONLY_FIELDS) {
      delete (sanitized as Record<string, unknown>)[field as string];
    }
  }

  return { config: sanitized as WidgetConfig, typeMismatch };
}
