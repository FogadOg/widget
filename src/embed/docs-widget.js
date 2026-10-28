import {
  STORAGE_PREFIX,
  WIDGET_SCRIPT_ID,
  COMPANY_NAME,
  BASE_WIDGET_HOST,
  WIDGET_HOST_SUFFIXES,
  isTrustedWidgetOrigin,
  sanitizeInstanceId,
  createRegistryAccessor,
  createErrorLog,
} from './_shared.js';
(function () {
  const DOCS_WIDGET_SCRIPT_ID = 'companin-docs-widget';
  let POWERED_BY_TEXT = (typeof window !== 'undefined' && window[`__${COMPANY_NAME.toUpperCase()}_WIDGET_LOCALES__`] && window[`__${COMPANY_NAME.toUpperCase()}_WIDGET_LOCALES__`].poweredBy) || 'Powered by ';
  const WIDGET_VERSION = '__WIDGET_VERSION__';
  try { window.__COMPANIN_WIDGET_VERSION__ = WIDGET_VERSION; } catch (e) {}

  // Strict origin parser: substring matching on 'companin.tech' would also accept
  // hosts like evil-companin.tech.attacker.com, so we require either an exact host
  // match or a trailing .companin.tech suffix.
  const DOCS_REGISTRY_KEY = `__${COMPANY_NAME.toUpperCase()}_DOCS_WIDGET_INSTANCES__`;
  const getOrCreateRegistry = createRegistryAccessor(DOCS_REGISTRY_KEY);

  // Capture any commands queued before this script executed (async/defer).
  const _preInitQueue = (function () {
    try {
      const ex = window.CompaninDocsWidget;
      if (Array.isArray(ex)) return ex.slice();
      if (ex && ex._isQueue && Array.isArray(ex._q)) return ex._q.slice();
    } catch (e) {}
    return null;
  })();

  // Error tracking.
  //
  // These MUST stay outside the big try/catch below. `const` is block-scoped,
  // so declaring them inside `try { ... }` leaves them invisible to the paired
  // `catch`, and the critical-error handler at the bottom of this file — which
  // calls logError — then threw "logError is not defined", replacing the real
  // failure with a bogus one and skipping the user-facing error UI entirely.
  // widget.js has always declared these at IIFE scope; this file drifted.
  const { errors, logError } = createErrorLog('Docs Widget Error');

  try {

  // Locate the embed <script> element that loaded this file. Prefer
  // `document.currentScript` when available, otherwise attempt known ids
  // and scan script tags for matching attributes or src patterns.
  let script = document.currentScript;
  if (!script) {
    try {
      script = document.getElementById('companin-docs-widget-script') || script;
    } catch (_e) {}
  }
  if (!script) {
    try {
      const scripts = Array.from(document.getElementsByTagName('script'));
      script = scripts.find(function (s) {
        try {
          if (s.getAttribute && s.getAttribute('data-companin-docs-widget-bound') === 'true') return false;
        } catch (_e) {}
        try {
          return s && s.getAttribute && (
            !!s.getAttribute('data-client-id') ||
            !!s.getAttribute('data-agent-id') ||
            (s.src && /docs-widget(\.|\/)/i.test(s.src))
          );
        } catch (_e) {
          return false;
        }
      }) || script;
    } catch (_e) {}
  }

    // Get attributes with validation
    const clientId = script.getAttribute("data-client-id");
    const agentId = script.getAttribute("data-agent-id");
    const configId = script.getAttribute("data-config-id");
    const debugDisabled = script.getAttribute("data-disable-debug") === 'true';
    // Read config out of the loader's own src query string — the attribute-less
    // fallback for host platforms that inject a bare URL (Google Tag Manager's
    // sandboxed injectScript, Webflow's registered hosted scripts). Kept
    // identical to the chat loader so a GTM template offering chat *or* docs
    // behaves the same either way. Attributes win when both are present, and
    // SRI still validates because a subresource hash covers content, not URL.
    const srcParam = (name) => {
      try {
        if (!script.src) return null;
        return new URL(script.src, window.location.href).searchParams.get(name);
      } catch (e) {
        return null;
      }
    };
    const detectLocale = () => {
      const explicitLocale = script.getAttribute("data-locale");
      if (explicitLocale) return explicitLocale;
      const localeFromSrc = srcParam('locale');
      if (localeFromSrc) return localeFromSrc;
      const browserLocale = (navigator.languages && navigator.languages[0]) || navigator.language;
      return browserLocale || "en";
    };
    const locale = detectLocale();
    const explicitInstanceId =
      script.getAttribute("data-instance-id") ||
      script.getAttribute("data-widget-id") ||
      script.getAttribute("data-instance") ||
      script.getAttribute("data-key");
    const startOpen = script.getAttribute("data-start-open") === "true";
    // Theme override (data-theme="light|dark|system"): forces the widget theme
    // from the embed, overriding the dashboard config. Invalid values are
    // ignored. Can also be changed at runtime via setTheme().
    var rawTheme = (script.getAttribute("data-theme") || srcParam('theme') || "").trim().toLowerCase();
    var theme = (rawTheme === 'light' || rawTheme === 'dark' || rawTheme === 'system') ? rawTheme : null;

    // Optional signed user JWT from the host app. When present the widget
    // re-authenticates with verified user claims and restores the user's
    // existing conversation across devices/browsers. Forwarded to the iframe
    // as an `identify` message once the app signals WIDGET_READY (never via the
    // URL, to keep the token out of server logs). Mirrors the chat widget.
    const userToken = script.getAttribute("data-user-token") || null;

    // Single install key (data-widget-key): one opaque key resolves the
    // client-id/agent-id/config-id triple server-side. Used only when the
    // explicit triple is absent, so the three-attribute form keeps working.
    // (data-key remains the instance-id alias above — do NOT reuse it here.)
    // ?key= on the loader's src is the attribute-less fallback (see srcParam).
    const installKey = script.getAttribute("data-widget-key") || srcParam('key');
    const usingInstallKey = !!installKey && (!clientId || !agentId || !configId);

    // Validate required attributes
    if (!usingInstallKey && (!clientId || !agentId || !configId)) {
      const missing = [];
      if (!clientId) missing.push("data-client-id");
      if (!agentId) missing.push("data-agent-id");
      if (!configId) missing.push("data-config-id");

      logError("Missing required attributes", { missing, hasInstallKey: !!installKey });

      // Lead with the single data-widget-key: it's what the default dashboard
      // snippet uses, so it's the form 95% of installs intend. Demoting the
      // explicit client/agent/config triple to "advanced" keeps the common
      // case from reading as "you're missing three attributes you never set."
      showErrorWidget(
        "Configuration Error",
        'Missing widget ID. Add data-widget-key="YOUR_WIDGET_ID" to the docs widget <script> tag ' +
        '(copy the full snippet from your dashboard Install page). Advanced setups may ' +
        'instead pass data-client-id, data-agent-id, and data-config-id. ' +
        'Please check your docs widget installation.'
      );
      return;
    }

    // Identity query params for the embed URL — either the single key or the triple.
    const setIdentityParams = (params) => {
      if (usingInstallKey) {
        params.set("key", installKey);
      } else {
        params.set("clientId", clientId);
        params.set("agentId", agentId);
        params.set("configId", configId);
      }
    };

    // Determine the iframe base URL with fallback. `data-dev=true` should only
    // force localhost when BOTH the host page and the embed script host are
    // local. This avoids false timeouts when local pages accidentally keep
    // data-dev enabled while loading the production docs-widget.js.
    const isDev = script.getAttribute("data-dev") === "true";
    const isLocalPage = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1|::1)$/i.test(window.location.hostname);
    const scriptUrl = (() => {
      try {
        return new URL(script.src, window.location.href);
      } catch {
        return null;
      }
    })();
    const scriptHost = scriptUrl?.hostname || "";
    const scriptOrigin = scriptUrl?.origin || "";
    const isLocalScriptHost = /^(localhost|127\.0\.0\.1|::1)$/i.test(scriptHost);
    const shouldUseLocalDevHost = isDev && isLocalPage && isLocalScriptHost;
    const baseUrl = shouldUseLocalDevHost
      ? (scriptOrigin || "http://localhost:3001")
      : BASE_WIDGET_HOST;

    // Allow the host page to explicitly set the iframe postMessage target origin.
    // Only `data-target-origin` is honored here. `data-parent-origin` refers
    // to the host page and can produce invalid iframe target-origin mismatches.
    const explicitTargetOrigin = script.getAttribute("data-target-origin");
    const targetOrigin = (explicitTargetOrigin && explicitTargetOrigin.trim()) || baseUrl;

    // Locale fetch disabled in the embed script to avoid cross-origin issues.
    // The embed should receive localized strings via either:
    // 1) `data-powered-by` attribute on the script tag, or
    // 2) a host-provided global `window.__COMPANIN_WIDGET_LOCALES__` object.

    const requestedInstanceId = explicitInstanceId
      || (usingInstallKey ? `${installKey}::${locale}` : `${clientId}::${agentId}::${configId}::${locale}`);
    const registry = getOrCreateRegistry();
    let instanceId = sanitizeInstanceId(requestedInstanceId);
    if (registry[instanceId]) {
      // The host re-executed the embed (e.g. host page changed locale and the
      // <script> remounted with a new src). The previous instance is now stale
      // — its iframe was created with the old locale. If the host gave an
      // explicit data-instance-id we reuse that slot by destroying the prior
      // instance; otherwise (anonymous instance) we fall back to a suffixed id
      // so two distinct embeds on the same page don't collide.
      if (explicitInstanceId) {
        try {
          const prior = registry[instanceId];
          if (prior && typeof prior.destroy === 'function') prior.destroy();
        } catch (_e) {}
        delete registry[instanceId];
      } else {
        let copyIndex = 2;
        while (registry[`${instanceId}-${copyIndex}`]) {
          copyIndex += 1;
        }
        instanceId = `${instanceId}-${copyIndex}`;
      }
    }
    const containerId = `${DOCS_WIDGET_SCRIPT_ID}-container-${instanceId}`;

    // Create container with error handling (initially hidden)
    // GA module
    let _gaGtag = null;
    let _gaMeasurementId = null;

    function initGA(measurementId) {
      if (!measurementId) return;
      // Validate format before using in script src to prevent injection
      if (!/^G-[A-Z0-9]{1,20}$/.test(measurementId)) {
        console.warn('[Companin GA] Invalid measurement ID format, skipping GA init');
        return;
      }
      _gaMeasurementId = measurementId;
      if (typeof window.gtag === 'function') {
        _gaGtag = window.gtag;
      } else {
        const existingScript = document.querySelector('script[src*="googletagmanager.com/gtag/js"]');
        if (!existingScript) {
          const script = document.createElement('script');
          script.async = true;
          script.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
          document.head.appendChild(script);
        }
        window.dataLayer = window.dataLayer || [];
        window.gtag = function() { window.dataLayer.push(arguments); };
        window.gtag('js', new Date());
        window.gtag('config', measurementId);
        _gaGtag = window.gtag;
      }
    }

    function _gaTrack(eventName, params) {
      if (!_gaGtag || !_gaMeasurementId) return;
      try {
        _gaGtag('event', eventName, Object.assign({}, params, { send_to: _gaMeasurementId }));
      } catch (e) {
        console.error('[Companin GA]', e);
      }
    }

    const container = document.createElement("div");
    container.id = containerId;
    const COMPACT_BUTTON_MAX_SIZE = 64;
    const COMPACT_BUTTON_OUTER_PADDING = 8;
    const parsePixelValue = (value) => {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string") {
        const parsed = parseFloat(value);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    };
    const getContainerPadding = (width, height) => {
      const isCompact =
        typeof width === "number" &&
        typeof height === "number" &&
        width <= COMPACT_BUTTON_MAX_SIZE &&
        height <= COMPACT_BUTTON_MAX_SIZE;
      return isCompact ? COMPACT_BUTTON_OUTER_PADDING : 0;
    };
    const isCompactContainer = () => {
      const currentWidth = parsePixelValue(container.style.width) || 0;
      const currentHeight = parsePixelValue(container.style.height) || 0;
      const compactThreshold = COMPACT_BUTTON_MAX_SIZE + (COMPACT_BUTTON_OUTER_PADDING * 2);
      return currentWidth > 0 && currentHeight > 0 && currentWidth <= compactThreshold && currentHeight <= compactThreshold;
    };
    const applyErrorContainerLayout = (errorData) => {
      const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
      const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
      const requestedWidth = parsePixelValue(errorData && errorData.width);
      const requestedHeight = parsePixelValue(errorData && errorData.height);
      const errorWidth = requestedWidth || 420;
      const errorHeight = requestedHeight || 280;

      container.style.display = 'block';
      container.style.padding = '0';
      container.style.top = '';
      container.style.left = '';
      container.style.maxWidth = '';
      container.style.maxHeight = '';
      container.style.bottom = '20px';
      container.style.right = '20px';

      if (viewportWidth > 0 && viewportWidth <= 480) {
        const horizontalMargin = 12;
        const verticalMargin = 12;
        container.style.left = `${horizontalMargin}px`;
        container.style.right = `${horizontalMargin}px`;
        container.style.bottom = `${verticalMargin}px`;
        container.style.width = `${Math.max(0, viewportWidth - (horizontalMargin * 2))}px`;
        container.style.height = `${Math.min(errorHeight, Math.max(180, viewportHeight - (verticalMargin * 2)))}px`;
        container.style.maxWidth = container.style.width;
        container.style.maxHeight = `${Math.max(180, viewportHeight - (verticalMargin * 2))}px`;
        return;
      }

      if (viewportWidth > 0) {
        container.style.width = `${Math.min(errorWidth, Math.max(280, viewportWidth - 40))}px`;
        container.style.maxWidth = `${Math.max(280, viewportWidth - 40)}px`;
      } else {
        container.style.width = `${errorWidth}px`;
      }

      if (viewportHeight > 0) {
        container.style.height = `${Math.min(errorHeight, Math.max(180, viewportHeight - 40))}px`;
        container.style.maxHeight = `${Math.max(180, viewportHeight - 40)}px`;
      } else {
        container.style.height = `${errorHeight}px`;
      }
    };
    // Collapsed docs search bar (the docs widget's launcher — see
    // DocsSearchBar.tsx): a bar-sized strip floating at the bottom-center of the
    // page. The container is sized to the bar and nothing more, so the rest of
    // the host page stays clickable while it is on screen.
    let bottomBarSize = null;
    const applyBottomCenterLayout = (barData) => {
      const requestedWidth = parsePixelValue(barData && barData.width) || 600;
      const requestedHeight = parsePixelValue(barData && barData.height) || 88;
      bottomBarSize = { width: requestedWidth, height: requestedHeight };
      const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
      // Requested width is a maximum — narrow viewports clamp to the screen.
      const width = viewportWidth > 0
        ? Math.min(requestedWidth, Math.max(240, viewportWidth - 24))
        : requestedWidth;
      container.style.padding = '0';
      // !important throughout for the same reason as the full-screen branch:
      // host-page `iframe`/`div` rules must not reshape the strip.
      container.style.setProperty('width', `${width}px`, 'important');
      container.style.setProperty('height', `${requestedHeight}px`, 'important');
      container.style.setProperty('left', '50%', 'important');
      container.style.setProperty('bottom', '0px', 'important');
      container.style.setProperty('transform', 'translateX(-50%)', 'important');
      container.style.setProperty('max-width', 'none', 'important');
      container.style.setProperty('max-height', 'none', 'important');
      container.style.removeProperty('top');
      container.style.removeProperty('right');
    };
    // Restore the default top-left anchoring used by every other layout.
    const clearBottomCenterLayout = () => {
      if (!bottomBarSize) return;
      bottomBarSize = null;
      container.style.removeProperty('transform');
      container.style.removeProperty('bottom');
      container.style.removeProperty('right');
      container.style.setProperty('top', '0');
      container.style.setProperty('left', '0');
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => {
        if (bottomBarSize) applyBottomCenterLayout(bottomBarSize);
      });
    }
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 0;
      height: 0;
      padding: 0;
      box-sizing: border-box;
      z-index: 999999;
      transition: none;
      display: none;
    `;

    // Ensure body is ready
    if (!document.body) {
      logError("Document body not ready", {});
      // Wait for DOM to be ready
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initWidget);
      } else {
        // DOM is already ready but body is missing - unusual case
        setTimeout(initWidget, 100);
      }
      return;
    }

    function initWidget() {
      try {
        // Create iframe with error handling
        const iframe = document.createElement("iframe");
        const params = new URLSearchParams({
          locale,
          startOpen: startOpen.toString(),
          pagePath: window.location.pathname,
          parentOrigin: window.location.origin,
          loaderVersion: WIDGET_VERSION,
        });
        setIdentityParams(params);
        if (theme) params.set('theme', theme);

        iframe.src = `${baseUrl}/embed/docs?${params.toString()}`;
        iframe.style.cssText = `
          width: 100%;
          height: 100%;
          max-width: none;
          max-height: none;
          border: 0;
          background-color: transparent;
        `;
        iframe.setAttribute("allow", "clipboard-write");
        iframe.setAttribute("title", COMPANY_NAME + ' Docs Widget');
        iframe.setAttribute(
          'sandbox',
          'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms'
        );
        iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
        // Do NOT use loading="lazy": the container starts display:none until
        // the iframe sends WIDGET_RESIZE/WIDGET_SHOW. Chrome defers navigation
        // for lazy iframes with zero layout area, so a lazy iframe inside a
        // hidden container never fetches → never runs → never posts → the
        // parent's load timeout fires.

        // Handle iframe load errors
        let iframeLoaded = false;
        // Messages posted before iframe.onload fires would target about:blank,
        // not the eventual http(s) origin — the browser warns "target origin
        // doesn't match recipient origin" and silently drops them. Queue calls
        // that arrive during the initial navigation and flush after load so
        // a fast click immediately after script injection still opens the
        // dialog as soon as it's ready.
        const pendingPosts = [];
        function postToIframe(message) {
          if (iframeLoaded) {
            if (iframe.contentWindow) {
              iframe.contentWindow.postMessage(message, targetOrigin);
            } else {
              throw new Error('iframe contentWindow is unavailable');
            }
          } else {
            pendingPosts.push(message);
          }
        }
        let visibilityFallbackTimeout = null;
        // True once the widget has told us its size (including an explicit
        // hide). Guards the load-fallback below: a widget that starts closed
        // legitimately hides its container, and sizing it to the 420x280 error
        // layout would create an invisible click-blocking overlay.
        let resizeSignalReceived = false;
        const parsedLoadTimeout = Number(script.getAttribute('data-load-timeout-ms'));
        // Per-attempt timeout. A configured value (min 20s) applies per attempt;
        // otherwise 60s in dev (webpack cold compile) / 15s in prod. Three
        // attempts tolerate a slow first load without one long single wait.
        const perAttemptTimeoutMs = Number.isFinite(parsedLoadTimeout) && parsedLoadTimeout > 0
          ? Math.max(parsedLoadTimeout, 20000)
          : isDev ? 60000 : 15000;
        const softTimeoutMs = Math.min(15000, Math.max(5000, Math.floor(perAttemptTimeoutMs / 2)));
        const baseIframeSrc = iframe.src;
        const MAX_LOAD_ATTEMPTS = 3;
        let loadAttempt = 1;
        // True while a reload is scheduled for a transient error card (e.g.
        // the install-key resolver was briefly unreachable). Suppresses the
        // card's WIDGET_SHOW so the visitor never sees an error we are about
        // to recover from.
        let transientRetryPending = false;
        const TRANSIENT_RETRY_DELAY_MS = 1500;
        let softTimeout = null;
        let hardTimeout = null;
        function clearLoadTimers() {
          clearTimeout(softTimeout);
          clearTimeout(hardTimeout);
        }
        // A single transient hiccup (cold server, slow network, CDN blip) must
        // not become a terminal error for a production visitor. iframe onerror
        // almost never fires for cross-origin network stalls, so the per-attempt
        // hard timeout is the real recovery mechanism: when it fires we abandon
        // the in-flight navigation and re-point the iframe at a cache-busted URL.
        // Only after every attempt is exhausted do we surface the error UI.
        function armLoadTimers() {
          clearLoadTimers();
          softTimeout = setTimeout(() => {
            if (!iframeLoaded) {
              try {
                console.warn(`${COMPANY_NAME} Docs Widget: iframe is still loading`, {
                  src: iframe.src,
                  elapsedMs: softTimeoutMs,
                });
              } catch (e) {}
            }
          }, softTimeoutMs);
          hardTimeout = setTimeout(() => {
            if (iframeLoaded) return;
            if (loadAttempt < MAX_LOAD_ATTEMPTS) {
              loadAttempt += 1;
              logError("Docs widget iframe load timed out; retrying", {
                attempt: loadAttempt,
                maxAttempts: MAX_LOAD_ATTEMPTS,
                src: iframe.src,
              });
              // A differing URL is required to force a fresh navigation; some
              // browsers no-op an identical src re-assignment.
              iframe.src = baseIframeSrc +
                (baseIframeSrc.indexOf('?') === -1 ? '?' : '&') +
                '_retry=' + loadAttempt;
              armLoadTimers();
            } else {
              logError("Docs widget iframe failed to load (timeout)", {
                src: iframe.src,
                timeoutMs: perAttemptTimeoutMs,
                attempts: loadAttempt,
              });
              showErrorInContainer(
                container,
                "Failed to load docs widget. Please refresh the page."
              );
            }
          }, perAttemptTimeoutMs);
        }
        armLoadTimers();

        iframe.onload = () => {
          iframeLoaded = true;
          clearLoadTimers();
          visibilityFallbackTimeout = setTimeout(() => {
            if (!resizeSignalReceived && container.style.display === 'none') {
              applyErrorContainerLayout({
                source: 'load-fallback',
                errorType: 'missing_resize_signal',
                width: 420,
                height: 280,
              });
            }
          }, 1200);
          while (pendingPosts.length && iframe.contentWindow) {
            try {
              iframe.contentWindow.postMessage(pendingPosts.shift(), targetOrigin);
            } catch (e) {
              logError("Failed to flush queued docs widget message", { error: e && e.message });
            }
          }
        };

        iframe.onerror = (error) => {
          clearLoadTimers();
          if (visibilityFallbackTimeout) {
            clearTimeout(visibilityFallbackTimeout);
          }
          logError("Docs widget iframe failed to load", { error, src: iframe.src });
          showErrorInContainer(
            container,
            "Failed to load docs widget. Please check your connection."
          );
        };

        container.appendChild(iframe);
        document.body.appendChild(container);

        // Defensive cleanup: replace inline 'right: 20px' with 'right: 0' on the docs container
        try {
          const _c = document.getElementById(containerId);
          if (_c) {
            _c.style.right = '0';
            const s = _c.getAttribute && _c.getAttribute('style');
            if (s && /right:\s*20px/.test(s)) {
              _c.setAttribute('style', s.replace(/right:\s*20px;?/g, 'right: 0;'));
            }
            Array.from(_c.querySelectorAll('[style]')).forEach((el) => {
              const ss = el.getAttribute('style');
              if (ss && /right:\s*20px/.test(ss)) {
                el.setAttribute('style', ss.replace(/right:\s*20px;?/g, 'right: 0;'));
              }
            });
          }
        } catch (e) {
          logError('Failed sanitizing docs-widget inline right spacing', { error: e && e.message });
        }

        // Listen for widget events with error handling
        window.addEventListener("message", handleMessage);

        const _beforeSendFns = [];
        const _afterReceiveFns = [];

        const callbackRegistry = {};
        const lastEventEnvelope = {};
        const debounceState = {};

        const LEGACY_NAME_MAP = { auth_failure: 'authFailure', authfailure: 'authFailure' };
        function normalizeEventName(name) {
          if (!name) return null;
          const s = String(name);
          return LEGACY_NAME_MAP[s.toLowerCase()] || s;
        }

        const EMIT_ALIASES = {
          open:        ['widget.opened'],
          close:       ['widget.closed'],
          message:     ['message.sent'],
          response:    ['message.received'],
          authFailure: ['auth.failed'],
        };

        function invokeCallbackSafely(fn, payload, label) {
          setTimeout(() => {
            try {
              fn(payload);
            } catch (error) {
              logError("Callback handler threw", { event: label, error: error && error.message });
            }
          }, 0);
        }

        function createEventEnvelope(name, data, rawType) {
          return {
            event: name,
            type: rawType || null,
            timestamp: new Date().toISOString(),
            data,
            context: {
              instanceId,
              clientId,
              agentId,
              configId,
              locale,
              pagePath: window.location.pathname,
              isOpen: container.style.display === "block",
            },
          };
        }

        function dispatchDomEvents(name, envelope) {
          try {
            // dispatch both docs-specific and generic widget-prefixed events
            window.dispatchEvent(new CustomEvent(DOCS_WIDGET_SCRIPT_ID + ':' + name, { detail: envelope }));
            window.dispatchEvent(new CustomEvent(WIDGET_SCRIPT_ID + ':' + name, { detail: envelope }));
            window.dispatchEvent(new CustomEvent(STORAGE_PREFIX + 'docs-widget:' + name, { detail: envelope }));
          } catch (e) {
            logError("Failed dispatching DOM docs widget event", { event: name, error: e && e.message });
          }

        }

        function emitNow(name, data, rawType) {
          const envelope = createEventEnvelope(name, data, rawType);
          lastEventEnvelope[name] = envelope;
          if (!callbackRegistry[name]) callbackRegistry[name] = new Set();
          const handlers = Array.from(callbackRegistry[name]);
          handlers.forEach((handler) => invokeCallbackSafely(handler, envelope, name));
          dispatchDomEvents(name, envelope);
          const aliases = EMIT_ALIASES[name];
          if (aliases) {
            aliases.forEach(function (alias) {
              const aliasEnvelope = createEventEnvelope(alias, data, rawType);
              lastEventEnvelope[alias] = aliasEnvelope;
              if (!callbackRegistry[alias]) callbackRegistry[alias] = new Set();
              Array.from(callbackRegistry[alias]).forEach(function (h) {
                invokeCallbackSafely(h, aliasEnvelope, alias);
              });
              dispatchDomEvents(alias, aliasEnvelope);
            });
          }
          return envelope;
        }

        function emitEvent(name, data, options = {}) {
          const debounceMs = Number(options.debounceMs || 0);
          if (!debounceMs) {
            return emitNow(name, data, options.rawType);
          }

          const now = Date.now();
          const state = debounceState[name] || {
            lastEmittedAt: 0,
            timer: null,
            pendingData: null,
            pendingRawType: null,
          };

          if (now - state.lastEmittedAt > debounceMs) {
            state.lastEmittedAt = now;
            debounceState[name] = state;
            return emitNow(name, data, options.rawType);
          }

          state.pendingData = data;
          state.pendingRawType = options.rawType;
          if (state.timer) clearTimeout(state.timer);
          state.timer = setTimeout(() => {
            state.lastEmittedAt = Date.now();
            emitNow(name, state.pendingData, state.pendingRawType);
            state.pendingData = null;
            state.pendingRawType = null;
            state.timer = null;
          }, debounceMs);
          debounceState[name] = state;
          return null;
        }

        function on(eventName, handler) {
          try {
            const normalized = normalizeEventName(eventName);
            if (!normalized || typeof handler !== "function") return () => {};
            if (!callbackRegistry[normalized]) callbackRegistry[normalized] = new Set();
            callbackRegistry[normalized].add(handler);

            if (lastEventEnvelope[normalized]) {
              invokeCallbackSafely(handler, lastEventEnvelope[normalized], normalized);
            }

            return () => {
              try {
                if (callbackRegistry[normalized]) callbackRegistry[normalized].delete(handler);
              } catch {
                // ignore
              }
            };
          } catch (e) {
            logError("Failed to register event handler", { eventName, error: e && e.message });
            return () => {};
          }
        }

        function off(eventName, handler) {
          try {
            const normalized = normalizeEventName(eventName);
            if (!normalized || typeof handler !== "function") return false;
            if (!callbackRegistry[normalized]) return false;
            return callbackRegistry[normalized].delete(handler);
          } catch (e) {
            logError("Failed to unregister event handler", { eventName, error: e && e.message });
            return false;
          }
        }

        function registerLegacyHook(eventName, fn) {
          if (typeof fn !== "function") return () => {};
          return on(eventName, (envelope) => {
            try {
              fn(envelope ? envelope.data : undefined);
            } catch (e) {
              logError("Legacy hook threw", { eventName, error: e && e.message });
            }
          });
        }

        // State tracking for isOpen/isReady/isVisible queries
        // allowDisplay starts true: docs widget uses WIDGET_RESIZE for initial display.
        // hide() sets it false to block re-appearance; show() restores it.
        let allowDisplay = true;
        let _isOpen = false;
        let _isReady = false;
        let _hasEmittedReady = false;
        let _debugActive = false;

        // Expose API for programmatic control
        const docsWidgetApi = {
          init: () => Promise.resolve(docsWidgetApi),
          on,
          off,
          onOpen: (fn) => registerLegacyHook("open", fn),
          onClose: (fn) => registerLegacyHook("close", fn),
          onMessage: (fn) => registerLegacyHook("message", fn),
          onResponse: (fn) => registerLegacyHook("response", fn),
          onAuthFailure: (fn) => registerLegacyHook("authFailure", fn),
          onError: (fn) => registerLegacyHook("error", fn),
          registerHooks: (hooks = {}) => {
            try {
              if (hooks.onOpen) docsWidgetApi.onOpen(hooks.onOpen);
              if (hooks.onClose) docsWidgetApi.onClose(hooks.onClose);
              if (hooks.onMessage) docsWidgetApi.onMessage(hooks.onMessage);
              if (hooks.onResponse) docsWidgetApi.onResponse(hooks.onResponse);
              if (hooks.onAuthFailure) docsWidgetApi.onAuthFailure(hooks.onAuthFailure);
              if (hooks.onError) docsWidgetApi.onError(hooks.onError);
            } catch (e) {
              logError("Failed to register hooks object", { error: e && e.message });
            }
          },
          open: () => {
            try {
              postToIframe({ type: "OPEN_DOCS_DIALOG" });
              emitEvent("open", { source: "host-api" }, { rawType: "HOST_OPEN_DOCS_DIALOG" });
            } catch (err) {
              logError("Failed to open docs widget", { error: err.message });
              emitEvent("error", { message: err.message, code: "OPEN_FAILED" }, { rawType: "HOST_OPEN_DOCS_DIALOG_ERROR" });
            }
          },
          close: () => {
            try {
              postToIframe({ type: "CLOSE_DOCS_DIALOG" });
              emitEvent("close", { source: "host-api" }, { rawType: "HOST_CLOSE_DOCS_DIALOG" });
            } catch (err) {
              logError("Failed to close docs widget", { error: err.message });
              emitEvent("error", { message: err.message, code: "CLOSE_FAILED" }, { rawType: "HOST_CLOSE_DOCS_DIALOG_ERROR" });
            }
          },
          show: () => {
            try {
              allowDisplay = true;
              container.style.display = "block";
              emitEvent("open", { source: "host-api" }, { rawType: "HOST_SHOW" });
            } catch (err) {
              logError("Failed to show docs widget", { error: err.message });
              emitEvent("error", { message: err.message, code: "SHOW_FAILED" }, { rawType: "HOST_SHOW_ERROR" });
            }
          },
          hide: () => {
            try {
              allowDisplay = false;
              container.style.display = "none";
              emitEvent("close", { source: "host-api" }, { rawType: "HOST_HIDE" });
            } catch (err) {
              logError("Failed to hide docs widget", { error: err.message });
              emitEvent("error", { message: err.message, code: "HIDE_FAILED" }, { rawType: "HOST_HIDE_ERROR" });
            }
          },
          toggle: () => {
            if (_isOpen) {
              docsWidgetApi.close();
            } else {
              docsWidgetApi.open();
            }
          },
          isOpen: () => _isOpen,
          isVisible: () => container.style.display !== "none",
          isReady: () => _isReady,
          identify: (user) => {
            try {
              if (!user || typeof user !== 'object') return;
              postToIframe({ type: 'HOST_MESSAGE', data: { action: 'identify', ...user } });
              emitEvent('user.updated', { source: 'host-api', user }, { rawType: 'HOST_IDENTIFY' });
            } catch (err) {
              logError('Failed to identify user in docs widget', { error: err.message });
            }
          },
          prefill: (text) => {
            try {
              if (typeof text !== 'string') return;
              postToIframe({ type: 'HOST_MESSAGE', data: { action: 'prefill', text } });
            } catch (err) {
              logError('Failed to prefill docs widget', { error: err.message });
            }
          },
          setContext: (data) => {
            try {
              if (!data || typeof data !== 'object') return;
              postToIframe({ type: 'HOST_MESSAGE', data: { action: 'context', ...data } });
            } catch (err) {
              logError('Failed to set context on docs widget', { error: err.message });
            }
          },
          update: (config) => {
            try {
              if (!config || typeof config !== 'object') return;
              postToIframe({ type: 'WIDGET_INIT_CONFIG', data: config });
            } catch (err) {
              logError('Failed to update docs widget config', { error: err.message });
            }
          },
          setTheme: (theme) => {
            try {
              const next = (typeof theme === 'string' ? theme : '').trim().toLowerCase();
              if (next !== 'light' && next !== 'dark' && next !== 'system') {
                logError("setTheme() requires 'light', 'dark', or 'system'", { theme });
                return docsWidgetApi;
              }
              postToIframe({ type: 'HOST_MESSAGE', data: { action: 'setTheme', theme: next } });
              emitEvent('theme.change', { theme: next }, { rawType: 'HOST_SET_THEME' });
            } catch (err) {
              logError('Failed to set docs widget theme', { error: err && err.message });
            }
            return docsWidgetApi;
          },
          /**
           * resize(width, height) — accepted for parity with CompaninWidget so
           * shared host integrations don't throw, but it is a no-op here: the
           * docs panel is a full-screen overlay whose dimensions come from the
           * dashboard's size preset, not from the container box.
           */
          resize: (width, height) => {
            logError('resize() does not apply to the docs widget (full-screen panel)', { width, height });
            return docsWidgetApi;
          },

          /**
           * trackConversion(goal, value, opts) — attribute a host-page goal
           * (signup, purchase, …) to the visitor's docs conversation. Mirrors
           * CompaninWidget.trackConversion so both embeds report the same way.
           * @param {string} goal - goal type, e.g. 'signup'
           * @param {number} [value] - monetary value
           * @param {{currency?: string, label?: string, dedupKey?: string, metadata?: object}} [opts]
           * @returns chainable
           */
          trackConversion: (goal, value, opts) => {
            try {
              const goalType = (typeof goal === 'string' ? goal : '').trim();
              if (!goalType) {
                logError('trackConversion() requires a non-empty goal string', { goal });
                return docsWidgetApi;
              }
              const o = (opts && typeof opts === 'object') ? opts : {};
              // Idempotency key: explicit opts.dedupKey wins, else fall back to a
              // metadata.order_id so a refreshed confirmation page dedupes
              // automatically without the integrator wiring anything extra.
              const meta = (o.metadata && typeof o.metadata === 'object') ? o.metadata : null;
              const dedupKey = typeof o.dedupKey === 'string'
                ? o.dedupKey
                : (meta && typeof meta.order_id === 'string' ? meta.order_id : null);
              const data = {
                action: 'conversion',
                goal_type: goalType,
                value: typeof value === 'number' && isFinite(value) ? value : null,
                currency: typeof o.currency === 'string' ? o.currency : null,
                goal_label: typeof o.label === 'string' ? o.label : null,
                dedup_key: dedupKey,
                metadata: meta,
              };
              postToIframe({ type: 'HOST_MESSAGE', data });
              emitEvent('conversion.tracked', data, { rawType: 'HOST_CONVERSION' });
            } catch (err) {
              logError('Failed to track conversion', { error: err && err.message });
            }
            return docsWidgetApi;
          },

          /**
           * grantConsent() / revokeConsent() — the host page's cookie banner
           * tells the widget whether it may persist visitor/session IDs.
           * Until consent is granted the widget keeps them in memory only.
           */
          grantConsent: () => {
            try {
              postToIframe({ type: 'WIDGET_CONSENT_GRANT' });
            } catch (err) {
              logError('Failed to forward consent grant', { error: err && err.message });
            }
            return docsWidgetApi;
          },
          revokeConsent: () => {
            try {
              postToIframe({ type: 'WIDGET_CONSENT_REVOKE' });
            } catch (err) {
              logError('Failed to forward consent revoke', { error: err && err.message });
            }
            return docsWidgetApi;
          },
          reset: () => {
            try {
              _isOpen = false;
              _isReady = false;
              _hasEmittedReady = false;
              postToIframe({ type: 'HOST_MESSAGE', data: { action: 'reset' } });
              emitEvent('conversation.closed', { source: 'host-api' }, { rawType: 'HOST_RESET' });
            } catch (err) {
              logError('Failed to reset docs widget', { error: err.message });
            }
          },
          sendMessage: (message) => {
            try {
              emitEvent("message", message, { rawType: "HOST_MESSAGE_SENT", debounceMs: 120 });
              postToIframe({ type: "HOST_MESSAGE", data: message });
            } catch (err) {
              logError("Failed to send message to docs widget", {
                error: err.message,
                message,
              });
              emitEvent("error", { message: err.message, code: "SEND_MESSAGE_FAILED", payload: message }, { rawType: "HOST_MESSAGE_ERROR" });
            }
          },

          /**
           * beforeSend(fn) — register an interceptor that runs before a user
           * message is sent to the API. Return a modified string to continue,
           * or `null` to cancel the send. Multiple interceptors run in order.
           *
           * @param {(message: string) => string | null | Promise<string | null>} fn
           * @returns chainable
           */
          beforeSend: (fn) => {
            try {
              if (typeof fn !== 'function') return docsWidgetApi;
              _beforeSendFns.push(fn);
              postToIframe({ type: 'HOST_INTERCEPT_ACTIVE', data: { beforeSend: true } });
            } catch (err) {
              logError('Failed to register beforeSend interceptor', { error: err && err.message });
            }
            return docsWidgetApi;
          },

          /**
           * afterReceive(fn) — register an interceptor that runs after the
           * agent's complete response is received, before it is rendered.
           * Return the (possibly modified) string to display.
           *
           * @param {(message: string) => string | Promise<string>} fn
           * @returns chainable
           */
          afterReceive: (fn) => {
            try {
              if (typeof fn !== 'function') return docsWidgetApi;
              _afterReceiveFns.push(fn);
              postToIframe({ type: 'HOST_INTERCEPT_ACTIVE', data: { afterReceive: true } });
            } catch (err) {
              logError('Failed to register afterReceive interceptor', { error: err && err.message });
            }
            return docsWidgetApi;
          },

          enableDebug: () => {
            if (debugDisabled) { console.warn('[Widget] Debug mode is disabled for this embed.'); return docsWidgetApi; }
            try {
              postToIframe({ type: 'WIDGET_DEBUG_ENABLE' });
              _debugActive = true;
              emitEvent('debug.enabled', { source: 'host-api' }, { rawType: 'HOST_ENABLE_DEBUG' });
              emitEvent('debug.change', { active: true }, { rawType: 'HOST_ENABLE_DEBUG' });
            } catch (err) {
              logError('Failed to enable debug mode', { error: err && err.message });
            }
            return docsWidgetApi;
          },
          disableDebug: () => {
            try {
              postToIframe({ type: 'WIDGET_DEBUG_DISABLE' });
              _debugActive = false;
              emitEvent('debug.disabled', { source: 'host-api' }, { rawType: 'HOST_DISABLE_DEBUG' });
              emitEvent('debug.change', { active: false }, { rawType: 'HOST_DISABLE_DEBUG' });
            } catch (err) {
              logError('Failed to disable debug mode', { error: err && err.message });
            }
            return docsWidgetApi;
          },
          isDebugActive: () => _debugActive,
          getDiagnostics: () => new Promise((resolve, reject) => {
            try {
              const requestId = 'diag-' + Math.random().toString(36).slice(2) + '-' + Date.now();
              const timer = setTimeout(() => {
                window.removeEventListener('message', handler);
                reject(new Error('getDiagnostics timed out'));
              }, 3000);
              function handler(event) {
                if (!event.data || event.data.type !== 'WIDGET_DIAGNOSTICS_RESPONSE') return;
                if (event.data.requestId !== requestId) return;
                clearTimeout(timer);
                window.removeEventListener('message', handler);
                resolve(event.data.data);
              }
              window.addEventListener('message', handler);
              postToIframe({ type: 'WIDGET_GET_DIAGNOSTICS', requestId });
            } catch (err) {
              reject(err);
            }
          }),
          clearSession: () => new Promise((resolve) => {
            try {
              const requestId = 'cls-' + Math.random().toString(36).slice(2);
              const timer = setTimeout(() => {
                window.removeEventListener('message', handler);
                resolve(0);
              }, 3000);
              function handler(event) {
                if (!event.data || event.data.type !== 'WIDGET_CLEAR_SESSION_RESPONSE') return;
                if (event.data.requestId !== requestId) return;
                clearTimeout(timer);
                window.removeEventListener('message', handler);
                resolve(event.data.removed ?? 0);
              }
              window.addEventListener('message', handler);
              postToIframe({ type: 'WIDGET_CLEAR_SESSION', requestId });
            } catch {
              resolve(0);
            }
          }),
          simulateOffline: () => {
            try { postToIframe({ type: 'WIDGET_SIMULATE_OFFLINE' }); } catch (err) {
              logError('Failed to simulate offline', { error: err && err.message });
            }
            return docsWidgetApi;
          },
          restoreOnline: () => {
            try { postToIframe({ type: 'WIDGET_RESTORE_ONLINE' }); } catch (err) {
              logError('Failed to restore online', { error: err && err.message });
            }
            return docsWidgetApi;
          },
          setLogLevel: (level) => {
            try {
              postToIframe({ type: 'WIDGET_SET_LOG_LEVEL', level });
              if (level === 'debug') {
                postToIframe({ type: 'WIDGET_ENABLE_LOG_STREAM' });
              } else {
                postToIframe({ type: 'WIDGET_DISABLE_LOG_STREAM' });
              }
            } catch (err) {
              logError('Failed to set log level', { error: err && err.message });
            }
            return docsWidgetApi;
          },
          getVersion: () => WIDGET_VERSION,
          reloadWidget: () => {
            try {
              iframe.src = iframe.src;
            } catch (err) {
              logError('Failed to reload widget', { error: err && err.message });
            }
            return docsWidgetApi;
          },

          getErrors: () => errors,
          destroy: () => {
            try {
              window.removeEventListener("message", handleMessage);
              Object.keys(debounceState).forEach((eventName) => {
                const state = debounceState[eventName];
                if (state && state.timer) clearTimeout(state.timer);
              });
              _isOpen = false;
              _isReady = false;
              _hasEmittedReady = false;
              allowDisplay = false;
              if (container.parentNode) {
                container.parentNode.removeChild(container);
              }
              try {
                delete registry[instanceId];
              } catch (_e) {}
              try {
                const remainingIds = Object.keys(registry);
                if (window.CompaninDocsWidget === docsWidgetApi) {
                  window.CompaninDocsWidget = remainingIds.length ? registry[remainingIds[remainingIds.length - 1]] : undefined;
                }
              } catch (e) {
                logError("Failed to update global CompaninDocsWidget reference", { error: e && e.message });
              }
            } catch (err) {
              logError("Failed to destroy docs widget", { error: err.message });
            }
          },
        };

        registry[instanceId] = docsWidgetApi;
        window.CompaninDocsWidgets = {
          get: (id) => registry[id] || null,
          list: () => Object.keys(registry),
          destroy: (id) => {
            const target = registry[id];
            if (!target || typeof target.destroy !== 'function') return false;
            target.destroy();
            return true;
          },
        };
        window.CompaninDocsWidget = docsWidgetApi;

        // Keyboard shortcut: Shift+Alt+D toggles the DevOverlay.
        try {
          document.addEventListener('keydown', function _debugShortcut(e) {
            if (e.shiftKey && e.altKey && (e.key === 'D' || e.key === 'd')) {
              if (_debugActive) { docsWidgetApi.disableDebug(); } else { docsWidgetApi.enableDebug(); }
            }
          });
        } catch (e) {}

        // Replay commands that were queued before the script executed.
        if (_preInitQueue) {
          _preInitQueue.forEach(function (cmd) {
            try {
              if (!cmd) return;
              if (typeof cmd === 'function') { cmd(docsWidgetApi); return; }
              if (Array.isArray(cmd)) {
                const [method, ...args] = cmd;
                if (typeof docsWidgetApi[method] === 'function') docsWidgetApi[method](...args);
              }
            } catch (e) {
              logError('Pre-init queue replay error', { error: e && e.message });
            }
          });
        }

        function handleMessage(event) {
          try {
            if (event.source !== iframe.contentWindow) return;

            // Verify origin - always validate, even in dev mode.
            // Use strict URL parsing to defeat substring bypasses (gap #3/#13 in
            // LAUNCH-READINESS.md).
            const validOrigins = new Set([baseUrl, targetOrigin]);
            let isDevOrigin = false;
            try {
              const _u = new URL(event.origin);
              isDevOrigin = _u.hostname === 'localhost' || _u.hostname === '127.0.0.1';
            } catch (e) {}
            if (isDev) {
              if (!validOrigins.has(event.origin) && !isDevOrigin && !isTrustedWidgetOrigin(event.origin, true)) return;
            } else if (!validOrigins.has(event.origin) && !isTrustedWidgetOrigin(event.origin, false)) {
              return;
            }

            const { type, data } = event.data || {};
            if (!type) return;

            switch (type) {
              case "WIDGET_RESIZE":
                resizeSignalReceived = true;
                // A resize means the real widget booted — the retried load
                // recovered, so error-card suppression no longer applies.
                transientRetryPending = false;
                // The resize payload IS the open/closed signal for the docs
                // widget (full-viewport = panel open; bar-sized or hidden =
                // collapsed). Deriving state here keeps isOpen()/toggle() honest
                // and emits open/close exactly once per transition — the widget
                // deliberately doesn't post WIDGET_SHOW on load, which would
                // otherwise fire a spurious "open" on every page view.
                (function trackOpenState() {
                  const nextOpen = !data?.hide && data?.height === "100vh";
                  if (nextOpen === _isOpen) return;
                  _isOpen = nextOpen;
                  _isReady = true;
                  if (nextOpen) {
                    emitEvent("open", { source: "widget" }, { rawType: "WIDGET_RESIZE" });
                    _gaTrack('widget_open', { agent_id: agentId });
                  } else {
                    emitEvent("close", { source: "widget" }, { rawType: "WIDGET_RESIZE" });
                    _gaTrack('widget_close', { agent_id: agentId });
                  }
                })();
                if (data?.hide) {
                  clearBottomCenterLayout();
                  container.style.display = "none";
                  container.style.width = "0";
                  container.style.height = "0";
                  container.style.padding = "0";
                } else if (data?.anchor === "bottom-center") {
                  // Collapsed search bar — a floating strip, not a corner box.
                  applyBottomCenterLayout(data);
                  if (allowDisplay) {
                    container.style.display = "block";
                  }
                } else if (data?.height) {
                  clearBottomCenterLayout();
                  const parsedWidth = parsePixelValue(data?.width);
                  const parsedHeight = parsePixelValue(data?.height);
                  const containerPadding = getContainerPadding(parsedWidth, parsedHeight);
                  container.style.padding = `${containerPadding}px`;
                  if (data.height === "100vh") {
                    if (allowDisplay) {
                      container.style.display = "block";
                    }
                    // Use setProperty with !important to defeat any parent-page
                    // CSS rules (e.g. `iframe { max-height: 80vh }`) that would
                    // otherwise constrain the container and make the overlay
                    // appear as only a partial-height backdrop.
                    container.style.setProperty('height', '100vh', 'important');
                    container.style.setProperty('width', '100vw', 'important');
                    container.style.setProperty('top', '0', 'important');
                    container.style.setProperty('left', '0', 'important');
                    container.style.setProperty('max-height', 'none', 'important');
                    container.style.setProperty('max-width', 'none', 'important');
                    container.style.setProperty('transform', 'none', 'important');
                    container.style.removeProperty('bottom');
                    container.style.removeProperty('right');
                  } else {
                    const effectiveHeight = parsedHeight !== null ? parsedHeight + (containerPadding * 2) : data.height;
                    container.style.height = `${effectiveHeight}px`;
                    if (allowDisplay) {
                      container.style.display = "block";
                    }
                  }
                }
                // The bottom-center branch already sized the container (and
                // clamped it to the viewport) — don't overwrite that here.
                if (data?.anchor !== "bottom-center" && data?.width && data.width !== "100vw") {
                  const parsedWidth = parsePixelValue(data.width);
                  const parsedHeight = parsePixelValue(data?.height);
                  const containerPadding = getContainerPadding(parsedWidth, parsedHeight);
                  const effectiveWidth = parsedWidth !== null ? parsedWidth + (containerPadding * 2) : data.width;
                  container.style.width = `${effectiveWidth}px`;
                }
                break;

              case "WIDGET_HIDE":
                _isOpen = false;
                container.style.display = "none";
                emitEvent("close", data || { source: "widget" }, { rawType: type });
                _gaTrack('widget_close', { agent_id: agentId });
                break;

              case "WIDGET_MINIMIZE":
                _isOpen = false;
                emitEvent("close", data || { source: "widget" }, { rawType: type });
                _gaTrack('widget_close', { agent_id: agentId });
                break;

              case "WIDGET_SHOW":
                // The transient error card also posts WIDGET_SHOW; keep the
                // container hidden while its reload is pending.
                if (transientRetryPending && data && data.source === 'embed-error') {
                  break;
                }
                _isOpen = true;
                _isReady = true;
                if (visibilityFallbackTimeout) {
                  clearTimeout(visibilityFallbackTimeout);
                  visibilityFallbackTimeout = null;
                }
                if (data && data.source === 'embed-error') {
                  applyErrorContainerLayout(data);
                } else {
                  container.style.display = "block";
                }
                emitEvent("open", data || { source: "widget" }, { rawType: type });
                _gaTrack('widget_open', { agent_id: agentId });
                break;

              case "WIDGET_RESTORE":
                _isOpen = true;
                emitEvent("open", data || { source: "widget" }, { rawType: type });
                _gaTrack('widget_open', { agent_id: agentId });
                break;

              case "WIDGET_READY":
                _isReady = true;
                if (!_hasEmittedReady) {
                  _hasEmittedReady = true;
                  emitNow('widget.ready', data || {}, type);
                }
                // Auto-forward the initial-load user token (data-user-token) so
                // the app re-auths and restores the logged-in user's session.
                if (userToken) {
                  try {
                    postToIframe({ type: 'HOST_MESSAGE', data: { action: 'identify', token: userToken } });
                  } catch (e) { /* non-fatal — widget still works anonymously */ }
                }
                break;

              case "WIDGET_CONVERSATION_CREATED":
                emitNow('conversation.created', data || {}, type);
                break;

              case "WIDGET_CONVERSATION_CLOSED":
                emitNow('conversation.closed', data || {}, type);
                break;

              case "WIDGET_USER_UPDATED":
                emitNow('user.updated', data || {}, type);
                break;

              case "WIDGET_FILE_UPLOADED":
                emitNow('file.uploaded', data || {}, type);
                break;

              case "WIDGET_MESSAGE":
                emitEvent("message", data, { rawType: type, debounceMs: 120 });
                break;

              case "WIDGET_RESPONSE":
                emitEvent("response", data, { rawType: type, debounceMs: 120 });
                _gaTrack('widget_response_received', { agent_id: agentId });
                break;

              case "WIDGET_AUTH_FAILURE":
                emitEvent("authFailure", data, { rawType: type });
                break;

              case 'WIDGET_INTERCEPT_REQUEST': {
                // The iframe posts these at the message root (see EMBED_EVENTS
                // usage in the widget clients); older builds nested them under
                // `data`, so accept both rather than silently running zero
                // interceptors and echoing the content back unchanged.
                var _msg = event.data || {};
                var _reqId = (data && data.requestId) || _msg.requestId;
                var _interceptType = (data && data.interceptType) || _msg.interceptType;
                var _origContent = (data && data.content != null)
                  ? data.content
                  : (_msg.content != null ? _msg.content : null);
                var _fns = _interceptType === 'before_send' ? _beforeSendFns
                         : _interceptType === 'after_receive' ? _afterReceiveFns
                         : [];
                Promise.resolve(_origContent)
                  .then(function(_val) {
                    return _fns.reduce(function(p, fn) {
                      return p.then(function(v) {
                        if (v === null || v === undefined) return null;
                        try { return Promise.resolve(fn(v)); } catch (e) { return v; }
                      });
                    }, Promise.resolve(_val));
                  })
                  .catch(function() { return _origContent; })
                  .then(function(result) {
                    postToIframe({
                      type: 'HOST_INTERCEPT_RESPONSE', requestId: _reqId,
                      content: result != null ? String(result) : null,
                    });
                  });
                break;
              }

              case 'WIDGET_GA_INIT':
                if (data && data.gaMeasurementId) {
                  initGA(data.gaMeasurementId);
                }
                break;

              case "WIDGET_ERROR":
                // A transient error card (backend blip while resolving the
                // embed) is recoverable: spend the remaining load-attempt
                // budget reloading the embed instead of surfacing a terminal
                // error to a production visitor. Only when every attempt is
                // exhausted does the card show and the error event fire.
                if (data && data.transient === true && loadAttempt < MAX_LOAD_ATTEMPTS) {
                  loadAttempt += 1;
                  transientRetryPending = true;
                  logError("Docs widget reported a transient error; retrying", {
                    errorType: data && data.errorType,
                    attempt: loadAttempt,
                    maxAttempts: MAX_LOAD_ATTEMPTS,
                  });
                  if (visibilityFallbackTimeout) {
                    clearTimeout(visibilityFallbackTimeout);
                    visibilityFallbackTimeout = null;
                  }
                  clearLoadTimers();
                  iframeLoaded = false;
                  // First retry is immediate (the embed server already applied
                  // its own backoff before giving up); later ones back off.
                  setTimeout(() => {
                    iframe.src = baseIframeSrc +
                      (baseIframeSrc.indexOf('?') === -1 ? '?' : '&') +
                      '_retry=' + loadAttempt;
                    armLoadTimers();
                  }, TRANSIENT_RETRY_DELAY_MS * (loadAttempt - 2));
                  break;
                }
                transientRetryPending = false;
                logError("Docs widget reported an error", data);
                if ((data && data.source === 'embed-error') || isCompactContainer()) {
                  applyErrorContainerLayout(data);
                }
                emitEvent("error", data, { rawType: type });
                _gaTrack('widget_error', { agent_id: agentId, error_type: data && data.errorType });
                break;

              case 'WIDGET_LOG_STREAM':
                if (_debugActive) {
                  try {
                    const lvl = (data && data.level) || 'debug';
                    const msg = '[Widget] ' + (data && data.message || '');
                    if (lvl === 'error') console.error(msg, data && data.context || '');
                    else if (lvl === 'warn') console.warn(msg, data && data.context || '');
                    else console.debug(msg, data && data.context || '');
                    window.dispatchEvent(new CustomEvent('companin:log', { detail: data }));
                  } catch (e) {}
                }
                break;

              default:
                break;
            }

            // Track message sent events
            try {
              const t = (type || '').toString().toLowerCase();
              if (type !== 'WIDGET_MESSAGE' && (t.includes('message') || t.includes('msg'))) {
                const _gaMessageText = (data && (data.content || data.message || data.text)) || '';
                _gaTrack('widget_message_sent', { agent_id: agentId, message_length: _gaMessageText.length });
              }
            } catch (e) {
              logError('GA message tracking failed', { error: e && e.message });
            }
          } catch (err) {
            logError("Error handling message from docs widget", {
              error: err.message,
              eventType: event?.data?.type,
            });
          }
        }
      } catch (err) {
        logError("Failed to initialize docs widget", {
          error: err.message,
          stack: err.stack,
        });
        showErrorWidget(
          "Initialization Error",
          "Failed to initialize the docs widget. Please try refreshing the page."
        );
      }
    }

    // Initialize immediately if body is ready
    if (document.body) {
      initWidget();
    }
  } catch (err) {
    logError("Critical error in docs widget script", {
      error: err.message,
      stack: err.stack,
    });
  }

  // Build a "Powered by Companin" footer node. createElement / textContent
  // throughout, as in widget.js: POWERED_BY_TEXT comes from a page global.
  function buildPoweredByFooter() {
    const footer = document.createElement('div');
    footer.style.cssText = 'margin-top:8px; font-size:12px; color:#6b7280;';
    footer.appendChild(document.createTextNode(POWERED_BY_TEXT + ' '));
    const link = document.createElement('a');
    link.href = 'https://' + COMPANY_NAME.toLowerCase() + '.tech';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.cssText = 'color:#2563eb; text-decoration:none; margin-left:6px;';
    link.textContent = COMPANY_NAME;
    footer.appendChild(link);
    return footer;
  }

  // Helper function to show error in a styled widget.
  //
  // Built with createElement / textContent rather than an innerHTML template:
  // the title and message render as text (the "Missing widget ID" message
  // names a `<script>` tag, which innerHTML parsed as markup and dropped), and
  // the close button is a real listener instead of an inline onclick, which a
  // host page's CSP blocks.
  function showErrorWidget(title, message) {
    try {
      const errorContainer = document.createElement("div");
      errorContainer.id = DOCS_WIDGET_SCRIPT_ID + '-error';
      errorContainer.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 0;
        width: 320px;
        background: #fef2f2;
        border: 1px solid #dc2626;
        border-radius: 8px;
        padding: 16px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        font-family: system-ui, -apple-system, sans-serif;
        z-index: 999999;
      `;

      const row = document.createElement('div');
      row.style.cssText = 'display: flex; align-items: start; gap: 12px;';

      const iconWrap = document.createElement('div');
      iconWrap.style.cssText = 'flex-shrink: 0; width: 20px; height: 20px; color: #dc2626;';
      // Static literal — nothing interpolated, so innerHTML is safe here.
      iconWrap.innerHTML = '<svg viewBox="0 0 20 20" fill="currentColor">'
        + '<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>'
        + '</svg>';

      const body = document.createElement('div');
      body.style.cssText = 'flex: 1;';
      const h4 = document.createElement('h4');
      h4.style.cssText = 'margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #dc2626;';
      h4.textContent = String(title || '');
      const para = document.createElement('p');
      para.style.cssText = 'margin: 0; font-size: 13px; color: #6b7280; line-height: 1.5;';
      para.textContent = String(message || '');
      body.appendChild(h4);
      body.appendChild(para);

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.setAttribute('aria-label', 'Close');
      closeBtn.style.cssText = 'flex-shrink: 0; background: none; border: none; cursor: pointer; color: #9ca3af; font-size: 20px; line-height: 1; padding: 0;';
      closeBtn.textContent = '\u00d7';
      closeBtn.addEventListener('click', () => errorContainer.remove());

      row.appendChild(iconWrap);
      row.appendChild(body);
      row.appendChild(closeBtn);
      errorContainer.appendChild(row);
      errorContainer.appendChild(buildPoweredByFooter());

      if (document.body) {
        document.body.appendChild(errorContainer);
      } else {
        document.addEventListener("DOMContentLoaded", () => {
          document.body.appendChild(errorContainer);
        });
      }
    } catch (err) {
      console.error("Failed to show error widget:", err);
    }
  }

  // Helper to show error in existing container. Same construction as above.
  function showErrorInContainer(container, message) {
    try {
      const card = document.createElement('div');
      card.style.cssText = 'background: #fef2f2; border: 1px solid #dc2626; border-radius: 8px; padding: 16px; font-family: system-ui, -apple-system, sans-serif; max-width: 320px;';

      const para = document.createElement('p');
      para.style.cssText = 'margin: 0; font-size: 14px; color: #dc2626;';
      para.textContent = String(message || '');

      const reloadBtn = document.createElement('button');
      reloadBtn.type = 'button';
      reloadBtn.style.cssText = 'margin-top: 12px; background: #dc2626; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-size: 13px; cursor: pointer;';
      reloadBtn.textContent = 'Reload Page';
      reloadBtn.addEventListener('click', () => window.location.reload());

      card.appendChild(para);
      card.appendChild(reloadBtn);
      card.appendChild(buildPoweredByFooter());
      container.textContent = '';
      container.appendChild(card);
    } catch (err) {
      console.error("Failed to show error in container:", err);
    }
  }
})();
