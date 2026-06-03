// Helper utilities extracted from DocsClient for testing

export const getSessionStorageKey = (clientId: string, agentId: string) => {
  return `companin-docs-session-${clientId}-${agentId}`;
}

export const getVisitorKey = (clientId: string) => `companin-visitor-${clientId}`;

export const getVisitorId = (clientId: string) => {
  const visitorKey = getVisitorKey(clientId);
  let visitorId = localStorage.getItem(visitorKey);
  if (!visitorId) {
    visitorId = `docs-widget-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem(visitorKey, visitorId);
  }
  return visitorId;
}

export const getPageContext = (win: any = window, doc: any = document) => {
  try {
    return {
      url: win.location.href,
      pathname: win.location.pathname,
      title: doc.title,
      referrer: doc.referrer || null,
    };
  } catch (e) {
    return {
      url: (win && win.location && win.location.href) || '',
      pathname: (win && win.location && win.location.pathname) || '',
      title: 'Unknown Page',
      referrer: null,
    };
  }
}

export const getStoredSession = (clientId: string, agentId: string) => {
  try {
    const storageKey = getSessionStorageKey(clientId, agentId);
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const data = JSON.parse(stored);
      if (data.expiresAt && new Date(data.expiresAt).getTime() - 5 * 60 * 1000 > Date.now()) {
        return data;
      } else {
        localStorage.removeItem(storageKey);
      }
    }
  } catch (e) {
    // swallow
  }
  return null;
}

export const storeSession = (clientId: string, agentId: string, sessionId: string, expiresAt: string) => {
  try {
    const storageKey = getSessionStorageKey(clientId, agentId);
    localStorage.setItem(storageKey, JSON.stringify({ sessionId, expiresAt, createdAt: new Date().toISOString() }));
  } catch (e) {
    // swallow
  }
}

export const getLocalizedText = (textObj: { [lang: string]: string } | undefined, locale?: string): string => {
  if (!textObj) return '';
  if (locale && textObj[locale]) return textObj[locale];
  if (textObj['en']) return textObj['en'];
  const values = Object.values(textObj);
  return values.length > 0 ? values[0] : '';
}

export const scrollToBottom = (conversationEndElem: HTMLElement | null, scrollAreaElem: HTMLElement | null) => {
  if (conversationEndElem) {
    try { conversationEndElem.scrollIntoView({ behavior: 'smooth', block: 'end' }); } catch (e) { }
  }
  if (scrollAreaElem) {
    const viewport = scrollAreaElem.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    if (viewport) {
      try { viewport.scrollTop = viewport.scrollHeight; } catch (e) { }
    }
  }
}
