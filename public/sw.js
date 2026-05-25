const CACHE_NAME = 'companin-static-v2';
const CACHE_PREFIX = 'companin-static-';
const PRECACHE_URLS = [];

self.addEventListener('install', (evt) => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evt) => {
  // Cache-first strategy for same-origin requests
  if (evt.request.method !== 'GET') return;
  // Do not intercept requests that are not allowed to follow redirects.
  // Returning a redirected response for these requests causes browser errors.
  if (evt.request.redirect && evt.request.redirect !== 'follow') return;
  // Guard against empty or non-parseable URLs (e.g. data:, blob:, or empty
  // synthetic requests) that would throw inside new URL().
  let url;
  try {
    if (!evt.request.url) return;
    url = new URL(evt.request.url);
  } catch {
    return;
  }
  if (url.origin === self.location.origin) {
    // Navigation/doc requests should always go to network to avoid serving a
    // stale cached redirect for '/'.
    if (evt.request.mode === 'navigate' || evt.request.destination === 'document') {
      evt.respondWith(fetch(evt.request));
      return;
    }

    evt.respondWith(
      caches.match(evt.request).then((cached) => {
        if (cached && !cached.redirected) return cached;
        return fetch(evt.request).then((response) => {
          if (response && response.ok && !response.redirected) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(evt.request, response.clone());
            });
          }
          return response;
        });
      })
    );
  }
});

let API_URL = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('companin-offline', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('message-queue')) {
        db.createObjectStore('message-queue', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getQueued() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('message-queue', 'readonly');
    const req = tx.objectStore('message-queue').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function removeQueued(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('message-queue', 'readwrite');
    const req = tx.objectStore('message-queue').delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function sendQueuedToApi() {
  if (!API_URL) {
    // fallback: notify clients to flush via page context
    const clients = await self.clients.matchAll();
    for (const client of clients) client.postMessage({ type: 'FLUSH_QUEUE' });
    return;
  }

  const queued = await getQueued();
  const results = [];

  for (const item of queued.sort((a, b) => (a.seq || 0) - (b.seq || 0))) {
    try {
      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });

      if (!resp.ok) throw new Error('Bad response');

      let serverData = null;
      try { serverData = await resp.json(); } catch {}

      await removeQueued(item.id);
      results.push({ id: item.id, success: true, serverMessage: serverData?.data || null });
    } catch (_err) {
      results.push({ id: item.id, success: false });
      // stop on first failure to preserve order
      break;
    }
  }

  // Notify clients of the result mapping so they can reconcile pending messages
  const clients = await self.clients.matchAll();
  for (const client of clients) client.postMessage({ type: 'QUEUE_FLUSH_RESULT', results });
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'companin-send-queue') {
    event.waitUntil(sendQueuedToApi());
  }
});

self.addEventListener('message', (evt) => {
  const data = evt.data || {};
  if (!data || !data.type) return;

  if (data.type === 'SET_API') {
    API_URL = data.apiUrl || null;
  }

  if (data.type === 'SEND_QUEUE_NOW') {
    evt.waitUntil(sendQueuedToApi());
  }
});
