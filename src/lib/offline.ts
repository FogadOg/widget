/* Minimal offline queue using IndexedDB (no external deps). */
const DB_NAME = "companin-offline";
const STORE_NAME = "message-queue";

// Queued messages older than this are dropped instead of replayed. The queue
// survives reloads (and days of dev restarts), and the server's idempotency
// replay is scoped to the original conversation — so replaying an hours-old
// message into a fresh session posts it as brand-new spam.
export const MAX_QUEUE_AGE_MS = 60 * 60 * 1000;

// True when a queued item should no longer be sent: it has aged out, or it was
// queued under a different session than the one we'd send it to now.
export function isQueueItemStale(
  item: { timestamp?: number; seq?: number; sessionId?: string },
  currentSessionId?: string | null
): boolean {
  const queuedAt = item.timestamp || item.seq || 0;
  if (!queuedAt || Date.now() - queuedAt > MAX_QUEUE_AGE_MS) return true;
  if (item.sessionId && currentSessionId && item.sessionId !== currentSessionId) return true;
  return false;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function waitForTx(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function queueMessage(item: any) {
  try {
    // ensure attempts metadata exists
    const queued = { ...item, attempts: item.attempts || 0, lastAttempt: item.lastAttempt || 0 };
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(queued);
    await waitForTx(tx);
    return;
  } catch (e) {
    // fail silently
  }
}

export async function getQueuedMessages(): Promise<any[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return [];
  }
}

export async function removeQueuedMessage(id: string) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    await waitForTx(tx);
    return;
  } catch (e) {
    // ignore
  }
}

export async function incrementAttempt(id: string) {
  try {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id as any);
      req.onsuccess = () => {
        const item = req.result;
        if (!item) return resolve();
        item.attempts = (item.attempts || 0) + 1;
        item.lastAttempt = Date.now();
        store.put(item);
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    // ignore
  }
}

// Attempt to flush queue by calling provided send function for each item in sequence.
export async function flushQueue(sendFn: (item: any) => Promise<void>) {
  const items = await getQueuedMessages();
  for (const item of items.sort((a, b) => (a.seq || 0) - (b.seq || 0))) {
    try {
      await sendFn(item);
      await removeQueuedMessage(item.id);
    } catch (e) {
      // increment attempt count for the failed item so UI can show delivering/failed
      try { await incrementAttempt(item.id); } catch {}
      // stop on first failure to preserve order
      break;
    }
  }
}

// Service worker registration helper
export function registerServiceWorker(swPath = "/sw.js") {
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';
    const enableSwInDev = (process && (process.env as any)?.NEXT_PUBLIC_ENABLE_SW_DEV) === 'true';

    // In local development we disable SW by default to avoid stale cache/
    // redirect handling issues (especially around localhost route changes).
    if (isDev && !enableSwInDev) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          registration.unregister();
        });
      }).catch(() => {
        // ignore cleanup failures
      });
      return;
    }

    navigator.serviceWorker
      .register(swPath)
      .then((registration) => {
        try {
          // If an API URL is configured at build time, pass it to the SW so it can
          // attempt background delivery when possible. Use NEXT_PUBLIC_OFFLINE_API
          // if present in the environment.
          const api = (process && (process.env as any)?.NEXT_PUBLIC_OFFLINE_API) || null;
          if (api) {
            // If the service worker is active, post message; otherwise wait until it becomes active.
            if (registration.active) {
              registration.active.postMessage({ type: 'SET_API', apiUrl: api });
            } else if (registration.installing) {
              registration.installing.addEventListener('statechange', () => {
                if (registration.active) {
                  registration.active.postMessage({ type: 'SET_API', apiUrl: api });
                }
              });
            }
          }
        } catch (_) {
          // ignore messaging failures
        }
      })
      .catch(() => {
        // ignore registration failures
      });
  }
}

export function isOnline() {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}
