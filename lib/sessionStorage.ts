import { logError } from './logger';

const SESSION_EXPIRY_BUFFER_MS = 30 * 1000;

// Consent gate (LAUNCH-READINESS.md #16). When the host page sets
// data-consent-required="true" on the widget snippet, the widget loader forwards
// `consentRequired=true` to the embed page, which calls setConsentRequired(true).
// Until the host explicitly calls window.CompaninWidget.grantConsent(),
// localStorage writes are no-ops and reads return null. Visitor IDs become
// per-session (regenerated each page load) so we never persist an identifier
// without consent — required for GDPR-strict deployments.
let consentRequired = false;
let consentGranted = false;
// In-memory fallback used when storage is gated. Map<storageKey, value>.
const memoryFallback = new Map<string, string>();

export const setConsentRequired = (required: boolean): void => {
  consentRequired = !!required;
};

export const isStorageConsentGranted = (): boolean => {
  return !consentRequired || consentGranted;
};

export const grantStorageConsent = (): void => {
  consentGranted = true;
  // Flush memory fallback to real storage now that consent is granted.
  try {
    if (typeof localStorage !== 'undefined') {
      for (const [key, value] of memoryFallback.entries()) {
        try { localStorage.setItem(key, value); } catch {}
      }
      memoryFallback.clear();
    }
  } catch {
    // ignore — caller's environment may have no storage at all
  }
};

export const revokeStorageConsent = (): void => {
  consentGranted = false;
  try {
    // Clear any widget-prefixed keys to honor the revocation.
    if (typeof localStorage !== 'undefined') {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('companin-') || key.startsWith('widget-'))) {
          toRemove.push(key);
        }
      }
      toRemove.forEach((k) => { try { localStorage.removeItem(k); } catch {} });
    }
  } catch {}
  memoryFallback.clear();
};

const safeGet = (key: string): string | null => {
  if (!isStorageConsentGranted()) {
    return memoryFallback.get(key) ?? null;
  }
  return localStorage.getItem(key);
};

const safeSet = (key: string, value: string): void => {
  if (!isStorageConsentGranted()) {
    memoryFallback.set(key, value);
    return;
  }
  try {
    localStorage.setItem(key, value);
  } catch {
    memoryFallback.set(key, value);
  }
};

const safeRemove = (key: string): void => {
  memoryFallback.delete(key);
  try { localStorage.removeItem(key); } catch {}
};

const createRandomId = (): string => {
  const c = (globalThis as unknown as { crypto?: Crypto }).crypto;
  if (typeof c !== 'undefined' && typeof (c as { randomUUID?: () => string }).randomUUID === 'function') {
    return (c as { randomUUID: () => string }).randomUUID();
  }

  if (typeof c !== 'undefined' && typeof (c as Crypto).getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    (c as Crypto).getRandomValues(bytes as Uint8Array);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  throw new Error('Secure random generation is unavailable in this environment');
};

export const getOrCreateVisitorId = (storageKey: string, prefix: string = 'widget'): string => {
  try {
    const storedVisitorId = safeGet(storageKey);
    if (storedVisitorId) {
      return storedVisitorId;
    }
    const visitorId = `${prefix}-${createRandomId()}`;
    safeSet(storageKey, visitorId);
    return visitorId;
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error), {
      context: 'getOrCreateVisitorId',
      storageKey,
    });
    try {
      // Fallback: use timestamp/random, do NOT call createRandomId (which throws)
      const randomPart = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
      return `${prefix}-fallback-${randomPart}`;
    } catch {
      return `${prefix}-fallback-${Date.now().toString(36)}`;
    }
  }
};

export type StoredSession = {
  sessionId: string;
  expiresAt?: string;
  createdAt?: string;
};

export const getStoredSessionByKey = (storageKey: string): StoredSession | null => {
  try {
    const stored = safeGet(storageKey);
    if (!stored) return null;

    const data = JSON.parse(stored) as StoredSession;
    if (data.expiresAt && new Date(data.expiresAt).getTime() - SESSION_EXPIRY_BUFFER_MS > Date.now()) {
      return data;
    }

    safeRemove(storageKey);
    return null;
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error), {
      context: 'getStoredSessionByKey',
      storageKey,
    });
    return null;
  }
};

export const storeSessionByKey = (storageKey: string, sessionId: string, expiresAt: string) => {
  try {
    safeSet(
      storageKey,
      JSON.stringify({
        sessionId,
        expiresAt,
        createdAt: new Date().toISOString(),
      })
    );
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error), {
      context: 'storeSessionByKey',
      sessionId,
      storageKey,
    });
  }
};
