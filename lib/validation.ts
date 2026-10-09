// Input validation and sanitization utilities

import { INPUT_LIMITS } from './constants';

/**
 * Validates message input
 * @param message - The message to validate
 * @returns Object with isValid flag and optional error message
 */
export function validateMessageInput(message: string): {
  isValid: boolean;
  /** Machine-readable failure cause, so callers can show a LOCALIZED message.
   *  `error` below is hardcoded English and must not be rendered to visitors —
   *  the embed controller used to collapse every failure into one generic
   *  "Please enter a valid message." string precisely because this did not
   *  exist, which left an over-long message with no hint of the real problem
   *  and a Retry button that could never succeed. */
  reason?: 'empty' | 'too_long';
  error?: string;
  sanitized: string;
} {
  // Check if message is empty or only whitespace
  const trimmed = message.trim();

  if (trimmed.length < INPUT_LIMITS.MIN_MESSAGE_LENGTH) {
    return {
      isValid: false,
      reason: 'empty',
      error: 'Message cannot be empty',
      sanitized: trimmed
    };
  }

  // Check maximum length
  if (trimmed.length > INPUT_LIMITS.MAX_MESSAGE_LENGTH) {
    return {
      isValid: false,
      reason: 'too_long',
      error: `Message exceeds maximum length of ${INPUT_LIMITS.MAX_MESSAGE_LENGTH} characters`,
      sanitized: trimmed
    };
  }

  // Basic XSS prevention - remove potentially dangerous characters
  // This is a basic implementation; for production, consider using DOMPurify
  const sanitized = sanitizeInput(trimmed);

  return {
    isValid: true,
    sanitized
  };
}

/**
 * Basic input sanitization
 * Removes HTML tags and potentially dangerous characters
 * @param input - The input to sanitize
 * @returns Sanitized string
 */
export function sanitizeInput(input: string): string {
  // Remove HTML tags
  let sanitized = input.replace(/<[^>]*>/g, '');

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');

  // Normalize whitespace
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  return sanitized;
}

/**
 * Validates hex color code
 * @param color - The color string to validate
 * @returns true if valid hex color, false otherwise
 */
export function isValidHexColor(color: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color);
}

/**
 * Validates URL
 * @param url - The URL string to validate
 * @returns true if valid URL, false otherwise
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates client ID format
 * @param clientId - The client ID to validate
 * @returns true if valid format, false otherwise
 */
export function isValidClientId(clientId: string): boolean {
  return typeof clientId === 'string' &&
         clientId.trim().length > 0 &&
         clientId.length <= 255; // Reasonable max length
}

/**
 * Validates UUID format
 * @param uuid - The UUID to validate
 * @returns true if valid UUID, false otherwise
 */
export function isValidUuid(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validates locale code
 * @param locale - The locale to validate
 * @param supportedLocales - Array of supported locales
 * @returns true if valid and supported locale, false otherwise
 */
export function isValidLocale(locale: string, supportedLocales: readonly string[]): boolean {
  return supportedLocales.includes(locale);
}
