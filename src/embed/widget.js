/* eslint-disable @typescript-eslint/no-unused-vars */
(function () {
  // Local constants to mirror centralized app constants (keeps single-place edits easy)
  const STORAGE_PREFIX = 'companin-';
  const WIDGET_SCRIPT_ID = 'companin-widget';
  const COMPANY_NAME = 'Companin';
  let POWERED_BY_TEXT = (typeof window !== 'undefined' && window[`__${COMPANY_NAME.toUpperCase()}_WIDGET_LOCALES__`] && window[`__${COMPANY_NAME.toUpperCase()}_WIDGET_LOCALES__`].poweredBy) || 'Powered by ';
  const BASE_WIDGET_HOST = 'https://widget.companin.tech';
  // __WIDGET_VERSION__ is replaced at build time by scripts/build-embed.js using
  // package.json's version. The literal token below is the build-time sentinel.
  const WIDGET_VERSION = '__WIDGET_VERSION__';
  try {
    window.__COMPANIN_WIDGET_VERSION__ = WIDGET_VERSION;
  } catch (e) {}

  // Parse an origin string and decide if it belongs to the widget host (companin.tech
  // or a subdomain). Substring matching would accept e.g. evil-companin.tech.attacker.com,
  // so we must compare hostnames after URL parsing.
  const WIDGET_HOST_SUFFIXES = ['companin.tech'];
  const isTrustedWidgetOrigin = function (origin, allowInsecure) {
    if (!origin || typeof origin !== 'string') return false;
    try {
      const u = new URL(origin);
      if (!u.host) return false;
      if (!allowInsecure && u.protocol !== 'https:') return false;
      const host = u.host.toLowerCase();
      for (let i = 0; i < WIDGET_HOST_SUFFIXES.length; i++) {
        const suffix = WIDGET_HOST_SUFFIXES[i];
        if (host === suffix || host.endsWith('.' + suffix)) return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  };

  const REGISTRY_KEY = `__${COMPANY_NAME.toUpperCase()}_WIDGET_INSTANCES__`;
  const sanitizeInstanceId = (value) => String(value || 'default').replace(/[^a-zA-Z0-9_-]/g, '-');
  const getOrCreateRegistry = () => {
    if (!window[REGISTRY_KEY] || typeof window[REGISTRY_KEY] !== 'object') {
      window[REGISTRY_KEY] = {};
    }
    return window[REGISTRY_KEY];
  };

  // Loader-wide dev/debug gate. When false (the default in production) the
  // widget must fail INVISIBLY: a chat widget crashing on a customer's site
  // should silently disappear, never paint a red error card over their page.
  // Opt back in with data-dev="true" on the script tag or ?widget_debug=1 in
  // the URL so support/QA can still see failures. Computed independently of
  // selectAndBindScript() so it is available to the hoisted error helpers
  // regardless of when (or whether) a script tag is bound.
  const IS_DEV = (function () {
    try {
      if (new URLSearchParams(window.location.search).get('widget_debug') === '1') return true;
    } catch (e) {}
    try {
      const tags = document.querySelectorAll(
        'script[data-client-id],script[data-agent-id],#companin-widget-script,[id^="companin-widget-script"]'
      );
      for (let i = 0; i < tags.length; i++) {
        if (tags[i].getAttribute && tags[i].getAttribute('data-dev') === 'true') return true;
      }
    } catch (e) {}
    return false;
  })();

  // Error tracking
  const errors = [];
  const logError = (message, context) => {
    const error = {
      timestamp: new Date().toISOString(),
      message,
      context,
    };
    errors.push(error);
    console.error(COMPANY_NAME + ' Widget Error:', message, context);
  };

  // Atomically pick an unbound script tag AND mark it bound before returning,
  // so that multiple widget loaders running back-to-back (LAUNCH-READINESS #21)
  // never read attributes from a tag that another instance is about to claim.
  // The bound flag is set inside this helper, not after attribute reads.
  function selectAndBindScript() {
    var isBound = function (s) {
      try { return !!(s && s.getAttribute && s.getAttribute('data-companin-widget-bound') === 'true'); }
      catch (e) { return false; }
    };
    var hasWidgetAttrs = function (s) {
      try {
        return !!(s && s.getAttribute && (
          s.getAttribute('data-client-id') ||
          s.getAttribute('data-agent-id') ||
          (s.src && /widget(\.|\/)/i.test(s.src))
        ));
      } catch (e) { return false; }
    };

    var candidate = document.currentScript;
    if (candidate && isBound(candidate)) candidate = null;

    if (!candidate) {
      try {
        var byId = document.getElementById('companin-widget-script');
        if (byId && !isBound(byId)) {
          candidate = byId;
        } else {
          var idMatches = Array.from(document.querySelectorAll('[id^="companin-widget-script"]'));
          for (var i = 0; i < idMatches.length; i++) {
            if (!isBound(idMatches[i])) { candidate = idMatches[i]; break; }
          }
        }
      } catch (e) {}
    }

    if (!candidate) {
      try {
        var scripts = Array.from(document.getElementsByTagName('script'));
        for (var j = 0; j < scripts.length; j++) {
          if (!isBound(scripts[j]) && hasWidgetAttrs(scripts[j])) {
            candidate = scripts[j];
            break;
          }
        }
      } catch (e) {}
    }

    // Mark bound BEFORE returning so the next invocation (whether sync or async)
    // sees the flag and can't pick the same tag mid-attribute-read.
    if (candidate && candidate.setAttribute) {
      try { candidate.setAttribute('data-companin-widget-bound', 'true'); } catch (e) {}
    }
    return candidate;
  }

  try {
    var script = selectAndBindScript();

    if (!script) {
      // As a last resort, avoid crashing the embed and proceed with a safe stub.
      logError("Failed to get current script reference; using fallback stub", {});
      script = { getAttribute: function () { return null; } };
    }

    // Resolve powered-by text: attribute -> global locales -> default
    try {
      const poweredByAttr = script.getAttribute && script.getAttribute('data-powered-by');
      if (poweredByAttr) {
        POWERED_BY_TEXT = poweredByAttr;
      } else {
        const globalLocales = window[`__${COMPANY_NAME.toUpperCase()}_WIDGET_LOCALES__`];
        if (globalLocales && globalLocales.poweredBy) POWERED_BY_TEXT = globalLocales.poweredBy;
      }
    } catch (e) {}

    // Get attributes with validation
    const clientId = script.getAttribute("data-client-id");
    const agentId = script.getAttribute("data-agent-id");
    const configId = script.getAttribute("data-config-id");
    const detectLocale = () => {
      const explicitLocale = script.getAttribute("data-locale");
      if (explicitLocale) return explicitLocale;

      // Fallback: allow host to pass locale in script src query
      try {
        if (script.src) {
          const parsed = new URL(script.src, window.location.href);
          const localeFromSrc = parsed.searchParams.get('locale');
          if (localeFromSrc) return localeFromSrc;
        }
      } catch (e) {}

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
    // Proactive open triggers
    const autoOpenDelay = parseInt(script.getAttribute("data-auto-open-delay") || '0', 10) || 0;
    const autoOpenScrollDepth = parseFloat(script.getAttribute("data-auto-open-scroll-depth") || '0') || 0;
    // Strict origin mode: refuse to postMessage to '*' — only send to the known parent origin
    const strictOrigin = script.getAttribute("data-strict-origin") === "true";
    // Consent-required mode (LAUNCH-READINESS #16): when set, the widget will
    // not persist visitor IDs / sessions in localStorage until the host page
    // calls window.CompaninWidget.grantConsent(). Required for GDPR-strict deploys.
    const consentRequired = script.getAttribute("data-consent-required") === "true";
    if (!clientId || !agentId || !configId) {
      const missing = [];
      if (!clientId) missing.push("data-client-id");
      if (!agentId) missing.push("data-agent-id");
      if (!configId) missing.push("data-config-id");

      logError("Missing required attributes", { missing });

      // Show user-friendly error in widget space
      showErrorWidget(
        "Configuration Error",
        `Missing required attributes: ${missing.join(", ")}. Please check your widget installation.`
      );
      return;
    }

    // Determine the base URL with fallback. Treat `data-dev=true` as local-only
    // so production pages do not try to prefetch or load loopback resources.
    const isDev = script.getAttribute("data-dev") === "true";
    const isLocalPage = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1|::1)$/i.test(window.location.hostname);
    const baseUrl = isDev && isLocalPage
      ? "http://localhost:3001"
      : BASE_WIDGET_HOST;

    // Allow the host page to explicitly set the postMessage target origin.
    // This is useful when the widget is hosted on a different / custom domain.
    const explicitTargetOrigin = script.getAttribute("data-target-origin") || script.getAttribute("data-parent-origin");
    const targetOrigin = (explicitTargetOrigin && explicitTargetOrigin.trim()) || baseUrl;

    // Locale fetch disabled in the embed script to avoid cross-origin issues.
    // The embed should receive localized strings via either:
    // 1) `data-powered-by` attribute on the script tag, or
    // 2) a host-provided global `window.__COMPANIN_WIDGET_LOCALES__` object.

    // performance hint: warm up connection to widget host
    (function addPreconnectHints() {
      try {
        if (document.head) {
          const pc = document.createElement('link');
          pc.rel = 'preconnect';
          pc.href = baseUrl;
          pc.crossOrigin = 'anonymous';
          document.head.appendChild(pc);

          const dns = document.createElement('link');
          dns.rel = 'dns-prefetch';
          dns.href = baseUrl;
          document.head.appendChild(dns);

          // optional prefetch of the embed page itself; browser may fetch early
          const pf = document.createElement('link');
          pf.rel = 'prefetch';
          const pfParams = new URLSearchParams({
            clientId,
            agentId,
            configId,
            locale,
            startOpen: startOpen.toString(),
            pagePath: window.location.pathname,
            parentOrigin: window.location.origin,
            loaderVersion: WIDGET_VERSION,
          });
          pf.href = `${baseUrl}/embed/session?${pfParams.toString()}`;
          pf.crossOrigin = 'anonymous';
          document.head.appendChild(pf);
        }
      } catch (e) {
        // silently ignore failures – not critical
      }
    })();

    const requestedInstanceId = explicitInstanceId || `${clientId}::${agentId}::${configId}::${locale}`;
    const registry = getOrCreateRegistry();
    let instanceId = sanitizeInstanceId(requestedInstanceId);
    if (registry[instanceId]) {
      let copyIndex = 2;
      while (registry[`${instanceId}-${copyIndex}`]) {
        copyIndex += 1;
      }
      instanceId = `${instanceId}-${copyIndex}`;
    }
    const containerId = `${WIDGET_SCRIPT_ID}-container-${instanceId}`;

    // Create container with error handling
    const container = document.createElement("div");
    container.id = containerId;
    const COMPACT_BUTTON_MAX_SIZE = 90;
    const COMPACT_BUTTON_OUTER_PADDING = 8;
    const parsePixelValue = (value) => {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string") {
        const parsed = parseFloat(value);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    };
    const parseOffsetValue = (value, fallback = 20) => {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string") {
        const parsed = parseFloat(value);
        if (Number.isFinite(parsed)) return parsed;
      }
      return fallback;
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
      container.style.left = '';
      container.style.top = '';
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
    container.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: max(20px, env(safe-area-inset-right, 0px));
      width: 72px;
      height: 72px;
      padding: 0;
      box-sizing: border-box;
      z-index: 999999;
      transition: all 0.3s ease;
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

    function initWidget() {
      try {
        // we no longer render a placeholder button; build iframe immediately
        const iframe = document.createElement("iframe");
        const params = new URLSearchParams({
          clientId,
          agentId,
          configId,
          locale,
          startOpen: startOpen.toString(),
          pagePath: window.location.pathname,
          parentOrigin: window.location.origin,
          loaderVersion: WIDGET_VERSION,
        });

        // Custom CSS is no longer forwarded via the URL query (LAUNCH-READINESS #20).
        // The dashboard now stores it on WidgetConfig.custom_css and the embed
        // page reads it from the loaded config. Passing `data-custom-css` is now
        // a deprecation warning so existing snippets keep working until the
        // next breaking release.
        const legacyCustomCss = script.getAttribute("data-custom-css");
        if (legacyCustomCss) {
          console.warn(COMPANY_NAME + ' Widget: data-custom-css is deprecated; ' +
            'set custom_css on your widget configuration in the dashboard instead.');
        }
        // Proactive trigger params
        if (autoOpenDelay > 0) params.set('autoOpenDelay', String(autoOpenDelay));
        if (autoOpenScrollDepth > 0) params.set('autoOpenScrollDepth', String(autoOpenScrollDepth));
        if (strictOrigin) params.set('strictOrigin', 'true');
        if (consentRequired) params.set('consentRequired', 'true');

        iframe.src = `${baseUrl}/embed/session?${params.toString()}`;
        iframe.style.cssText = `
          width: 100%;
          height: 100%;
          border: 0;
          background-color: transparent;
          contain: strict;
        `;
        iframe.setAttribute("allow", "clipboard-write");
        iframe.setAttribute("title", COMPANY_NAME + ' Chat Widget');
        // Defense-in-depth: sandbox the iframe and constrain referrer leakage.
        // allow-same-origin is required so the embed page can read its own cookies
        // / localStorage. allow-popups + allow-popups-to-escape-sandbox lets handoff
        // / source links open in a new tab without inheriting the sandbox.
        iframe.setAttribute(
          'sandbox',
          'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms'
        );
        iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
        // Do NOT use loading="lazy" here: the container starts display:none
        // until the iframe sends WIDGET_RESIZE/WIDGET_SHOW. Chrome defers
        // navigation for lazy iframes with zero layout area, so a lazy iframe
        // inside a hidden container never fetches → never runs → never posts
        // → the parent's load timeout fires.

        // Handle iframe load errors
        // Use a longer timeout in dev mode since Next.js cold compilation can exceed 15s
        let iframeLoaded = false;
        let visibilityFallbackTimeout = null;
        const loadTimeout = setTimeout(() => {
          if (!iframeLoaded) {
            logError("Widget iframe failed to load (timeout)", { src: iframe.src });
            showErrorInContainer(
              container,
              "Failed to load widget. Please refresh the page."
            );
          }
        }, isDev ? 60000 : 15000); // 60s in dev (Next.js cold start), 15s in prod

      iframe.onload = () => {
        iframeLoaded = true;
        clearTimeout(loadTimeout);
        visibilityFallbackTimeout = setTimeout(() => {
          if (container.style.display === 'none') {
            applyErrorContainerLayout({
              source: 'load-fallback',
              errorType: 'missing_resize_signal',
              width: 420,
              height: 280,
            });
          }
        }, 1200);
        try {
          // If the host page provided an inline ChatWidgetConfig, forward it into the iframe
          let iframeWindow = null;
          try {
            iframeWindow = iframe.contentWindow;
          } catch (err) {
            logError('Failed to access iframe contentWindow', { error: err && err.message });
          }
          if (window.ChatWidgetConfig && iframeWindow) {
            iframeWindow.postMessage(
              { type: 'WIDGET_INIT_CONFIG', data: window.ChatWidgetConfig },
              targetOrigin
            );
          }
        } catch (err) {
          logError('Failed to post initial config to iframe', { error: err && err.message });
        }
      };

      iframe.onerror = (error) => {
        clearTimeout(loadTimeout);
        if (visibilityFallbackTimeout) {
          clearTimeout(visibilityFallbackTimeout);
        }
        logError("Widget iframe failed to load", { error, src: iframe.src });
        showErrorInContainer(
          container,
          "Failed to load widget. Please check your connection."
        );
      };

      container.appendChild(iframe);

      document.body.appendChild(container);

      // Defensive: sanitize right:20px from container inline styles.
      // Use the direct reference — document.getElementById can't reach into shadow DOM.
      try {
        const s = container.getAttribute && container.getAttribute('style');
        if (s && /right:\s*20px/.test(s)) {
          container.setAttribute('style', s.replace(/right:\s*20px;?/g, ''));
        }
        Array.from(container.querySelectorAll('[style]')).forEach((el) => {
          const ss = el.getAttribute('style');
          if (ss && /right:\s*20px/.test(ss)) {
            el.setAttribute('style', ss.replace(/right:\s*20px;?/g, ''));
          }
        });
      } catch (e) {
        logError('Failed sanitizing inline right spacing', { error: e && e.message });
      }

      // Listen for widget events with error handling
      window.addEventListener("message", handleMessage);

      // Expose API for programmatic control
        const eventNames = ["open", "close", "message", "response", "authFailure", "error"];
        const callbackRegistry = eventNames.reduce((acc, name) => {
          acc[name] = new Set();
          return acc;
        }, {});
        const lastEventEnvelope = {};
        const debounceState = {};
        let __lastHostMessage = null;

        function normalizeEventName(name) {
          if (!name) return null;
          const normalized = String(name).toLowerCase();
          if (normalized === 'auth_failure' || normalized === 'authfailure') return 'authFailure';
          if (normalized === 'open' || normalized === 'close' || normalized === 'message' || normalized === 'response' || normalized === 'error' || normalized === 'authfailure') {
            return normalized === 'authfailure' ? 'authFailure' : normalized;
          }
          return null;
        }

        function invokeCallbackSafely(fn, payload, label) {
          setTimeout(() => {
            try {
              fn(payload);
            } catch (error) {
              logError('Callback handler threw', { event: label, error: error && error.message });
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
              isOpen: container.style.display === 'block',
            },
          };
        }

        function dispatchDomEvents(name, envelope) {
          try {
            // Emit events using configured script IDs and storage prefix
            window.dispatchEvent(new CustomEvent(WIDGET_SCRIPT_ID + ':' + name, { detail: envelope }));
            window.dispatchEvent(new CustomEvent(STORAGE_PREFIX + 'widget:' + name, { detail: envelope }));
          } catch (e) {
            logError('Failed dispatching DOM widget event', { event: name, error: e && e.message });
          }
        }

        function emitNow(name, data, rawType) {
          const envelope = createEventEnvelope(name, data, rawType);
          lastEventEnvelope[name] = envelope;

          const handlers = Array.from(callbackRegistry[name] || []);
          handlers.forEach((handler) => invokeCallbackSafely(handler, envelope, name));
          dispatchDomEvents(name, envelope);

          return envelope;
        }

        function emitEvent(name, data, options = {}) {
          const debounceMs = Number(options.debounceMs || 0);
          if (!debounceMs) {
            return emitNow(name, data, options.rawType);
          }

          const now = Date.now();
          const state = debounceState[name] || { lastEmittedAt: 0, timer: null, pendingData: null, pendingRawType: null };
          const elapsedSinceLast = now - state.lastEmittedAt;

          if (elapsedSinceLast > debounceMs) {
            state.lastEmittedAt = now;
            debounceState[name] = state;
            return emitNow(name, data, options.rawType);
          }

          state.pendingData = data;
          state.pendingRawType = options.rawType;
          if (state.timer) clearTimeout(state.timer);
          const trailingDelay = Math.max(0, debounceMs - elapsedSinceLast);
          state.timer = setTimeout(() => {
            state.lastEmittedAt = Date.now();
            emitNow(name, state.pendingData, state.pendingRawType);
            state.pendingData = null;
            state.pendingRawType = null;
            state.timer = null;
          }, trailingDelay);
          debounceState[name] = state;
          return null;
        }

        function on(eventName, handler) {
          try {
            const normalized = normalizeEventName(eventName);
            if (!normalized || typeof handler !== 'function') return () => {};
            callbackRegistry[normalized].add(handler);

            if (lastEventEnvelope[normalized]) {
              invokeCallbackSafely(handler, lastEventEnvelope[normalized], normalized);
            }

            return () => {
              try { callbackRegistry[normalized].delete(handler); } catch (e) {}
            };
          } catch (e) {
            logError('Failed to register event handler', { eventName, error: e && e.message });
            return () => {};
          }
        }

        function off(eventName, handler) {
          try {
            const normalized = normalizeEventName(eventName);
            if (!normalized || typeof handler !== 'function') return false;
            return callbackRegistry[normalized].delete(handler);
          } catch (e) {
            logError('Failed to unregister event handler', { eventName, error: e && e.message });
            return false;
          }
        }

        function registerLegacyHook(eventName, fn) {
          if (typeof fn !== 'function') return () => {};
          return on(eventName, (envelope) => {
            try {
              fn(envelope ? envelope.data : undefined);
            } catch (e) {
              logError('Legacy hook threw', { eventName, error: e && e.message });
            }
          });
        }

        const widgetApi = {
          on,
          off,
          onOpen: (fn) => registerLegacyHook('open', fn),
          onClose: (fn) => registerLegacyHook('close', fn),
          onMessage: (fn) => registerLegacyHook('message', fn),
          onResponse: (fn) => registerLegacyHook('response', fn),
          onAuthFailure: (fn) => registerLegacyHook('authFailure', fn),
          onError: (fn) => registerLegacyHook('error', fn),

          registerHooks: (hooks = {}) => {
            try {
              if (hooks.onOpen) widgetApi.onOpen(hooks.onOpen);
              if (hooks.onClose) widgetApi.onClose(hooks.onClose);
              if (hooks.onMessage) widgetApi.onMessage(hooks.onMessage);
              if (hooks.onResponse) widgetApi.onResponse(hooks.onResponse);
              if (hooks.onAuthFailure) widgetApi.onAuthFailure(hooks.onAuthFailure);
              if (hooks.onError) widgetApi.onError(hooks.onError);
            } catch (e) {
              logError('Failed to register hooks object', { error: e && e.message });
            }
          },

          show: () => {
            try {
              container.style.display = "block";
              emitEvent('open', { source: 'host-api' }, { rawType: 'HOST_SHOW' });
            } catch (err) {
              logError("Failed to show widget", { error: err.message });
              emitEvent('error', { message: err.message, code: 'SHOW_FAILED' }, { rawType: 'HOST_SHOW_ERROR' });
            }
          },
          hide: () => {
            try {
              container.style.display = "none";
              emitEvent('close', { source: 'host-api' }, { rawType: 'HOST_HIDE' });
            } catch (err) {
              logError("Failed to hide widget", { error: err.message });
              emitEvent('error', { message: err.message, code: 'HIDE_FAILED' }, { rawType: 'HOST_HIDE_ERROR' });
            }
          },
          resize: (width, height) => {
            try {
              if (width) container.style.width = `${width}px`;
              if (height) container.style.height = `${height}px`;
            } catch (err) {
              logError("Failed to resize widget", {
                error: err.message,
                width,
                height,
              });
              emitEvent('error', { message: err.message, code: 'RESIZE_FAILED', width, height }, { rawType: 'HOST_RESIZE_ERROR' });
            }
          },
          sendMessage: (message) => {
            try {
              __lastHostMessage = message;
              emitEvent('message', message, { rawType: 'HOST_MESSAGE_SENT', debounceMs: 120 });
              if (!iframe.contentWindow) {
                throw new Error("iframe not ready");
              }
              iframe.contentWindow.postMessage(
                { type: "HOST_MESSAGE", data: message },
                targetOrigin
              );
            } catch (err) {
              logError("Failed to send message to widget", {
                error: err.message,
                message,
              });
              emitEvent('error', { message: err.message, code: 'SEND_MESSAGE_FAILED', payload: message }, { rawType: 'HOST_MESSAGE_ERROR' });
            }
          },
          getErrors: () => errors,
          // Storage-consent API (LAUNCH-READINESS #16). The host page calls
          // grantConsent() once the visitor accepts the cookie banner;
          // revokeConsent() purges widget-prefixed localStorage entries.
          grantConsent: () => {
            try {
              if (iframe.contentWindow) {
                iframe.contentWindow.postMessage(
                  { type: 'WIDGET_CONSENT_GRANT' },
                  targetOrigin
                );
              }
            } catch (err) {
              logError('Failed to forward consent grant', { error: err && err.message });
            }
          },
          revokeConsent: () => {
            try {
              if (iframe.contentWindow) {
                iframe.contentWindow.postMessage(
                  { type: 'WIDGET_CONSENT_REVOKE' },
                  targetOrigin
                );
              }
            } catch (err) {
              logError('Failed to forward consent revoke', { error: err && err.message });
            }
          },
          destroy: () => {
            try {
              window.removeEventListener("message", handleMessage);
              Object.keys(debounceState).forEach((eventName) => {
                const state = debounceState[eventName];
                if (state && state.timer) clearTimeout(state.timer);
              });
              const _mount = container;
              if (_mount.parentNode) {
                _mount.parentNode.removeChild(_mount);
              }
              try {
                delete registry[instanceId];
              } catch (e) {}
              try {
                const remainingIds = Object.keys(registry);
                if (window.CompaninWidget === widgetApi) {
                  window.CompaninWidget = remainingIds.length ? registry[remainingIds[remainingIds.length - 1]] : undefined;
                }
              } catch (e) {
                logError("Failed to update global CompaninWidget reference", { error: e && e.message });
              }
            } catch (err) {
              logError("Failed to destroy widget", { error: err.message });
            }
          },
        };

        registry[instanceId] = widgetApi;
        window.CompaninWidgets = {
          get: (id) => registry[id] || null,
          list: () => Object.keys(registry),
          destroy: (id) => {
            const target = registry[id];
            if (!target || typeof target.destroy !== 'function') return false;
            target.destroy();
            return true;
          },
        };
        window.CompaninWidget = widgetApi;

        let allowDisplay = false;

        function handleMessage(event) {
          try {
            let iframeWindow = null;
            try {
              iframeWindow = iframe.contentWindow;
            } catch (err) {
              logError('Error handling message from widget', { error: err && err.message, eventType: event && event.data && event.data.type });
              return;
            }

            if (!iframeWindow || event.source !== iframeWindow) return;

            // Verify origin - always validate, even in dev mode.
            // Allow explicit host-target origin to support custom widget domains.
            // NOTE: previously this used event.origin.includes("companin.tech"), which
            // matched any host with that substring (e.g. evil-companin.tech.attacker.com).
            // We now parse the origin and compare hostnames against a suffix allowlist.
            const validOrigins = new Set([baseUrl, targetOrigin]);
            let isDevOrigin = false;
            try {
              const _u = new URL(event.origin);
              isDevOrigin = _u.hostname === 'localhost' || _u.hostname === '127.0.0.1';
            } catch (e) {}
            const isValidOrigin = isDev
              ? (validOrigins.has(event.origin) || isDevOrigin || isTrustedWidgetOrigin(event.origin, true))
              : (validOrigins.has(event.origin) || isTrustedWidgetOrigin(event.origin, false));

            if (!isValidOrigin) {
              logError("Message from unauthorized origin", { origin: event.origin });
              return;
            }

            const { type, data } = event.data || {};
            if (!type) return;

            switch (type) {
            case "WIDGET_RESIZE":
                if (data?.hide) {
                  allowDisplay = false;
                  container.style.display = "none";
                  break;
                }
                if (allowDisplay) {
                  container.style.display = "block";
                }
                const resizeWidth = parsePixelValue(data?.width);
                const resizeHeight = parsePixelValue(data?.height);
                const containerPadding = getContainerPadding(resizeWidth, resizeHeight);
                container.style.padding = `${containerPadding}px`;

                if (resizeHeight !== null) {
                  container.style.height = `${resizeHeight + (containerPadding * 2)}px`;
                }
                if (resizeWidth !== null) {
                  container.style.width = `${resizeWidth + (containerPadding * 2)}px`;
                }

                // Handle dynamic positioning if provided
                if (data?.position) {
                  const baseOffset = parseOffsetValue(
                    typeof data.edge_offset !== 'undefined' ? data.edge_offset : data.edgeOffset,
                    20
                  );
                  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
                  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
                  const isSmallScreen = viewportWidth > 0 && viewportWidth < 480;
                  const isLauncherButton = containerPadding > 0;
                  const isLeftPosition = data.position.includes('left');
                  const offset = isLeftPosition && baseOffset === 0
                    ? (isSmallScreen && isLauncherButton ? 4 : 16)
                    : isSmallScreen && isLauncherButton && isLeftPosition
                      ? Math.min(baseOffset, 4)
                      : isSmallScreen && isLauncherButton && !isLeftPosition
                        ? baseOffset - 62
                        : baseOffset;
                  const desiredWidth = resizeWidth !== null ? resizeWidth + (containerPadding * 2) : null;
                  const desiredHeight = resizeHeight !== null ? resizeHeight + (containerPadding * 2) : null;
                  // Reset all corner properties
                  container.style.bottom = '';
                  container.style.top = '';
                  container.style.right = '';
                  container.style.left = '';
                  container.style.maxWidth = '';
                  container.style.maxHeight = '';

                  const isMobile = containerPadding === 0 && viewportWidth > 0 && desiredWidth !== null && desiredWidth >= viewportWidth * 0.85;

                  if (isMobile) {
                    // Full-width on small screens: stretch edge to edge with safe-area margins
                    const mobileMargin = 8;
                    container.style.left = `max(${mobileMargin}px, env(safe-area-inset-left, 0px))`;
                    container.style.right = `max(${mobileMargin}px, env(safe-area-inset-right, 0px))`;
                    container.style.width = '';
                    container.style.maxWidth = '';
                    if (data.position.includes('bottom')) {
                      container.style.bottom = `max(${offset}px, env(safe-area-inset-bottom, 0px))`;
                    } else {
                      container.style.top = `max(${offset}px, env(safe-area-inset-top, 0px))`;
                    }
                    if (desiredHeight !== null) {
                      const maxHeight = Math.max(0, viewportHeight - offset - mobileMargin);
                      container.style.maxHeight = `${maxHeight}px`;
                    }
                  } else {
                    // Launcher button on small screens: use plain px offset so safe-area doesn't push it away from corner
                    if (data.position.includes('bottom')) {
                      container.style.bottom = `${offset}px`;
                    } else {
                      container.style.top = `${offset}px`;
                    }
                    if (data.position.includes('left')) {
                      container.style.left = `${offset}px`;
                    } else if (data.position.includes('right')) {
                      container.style.right = `${offset}px`;
                    }
                    // Clamp only via max-width/max-height, keeping edge anchor as reference
                    if (viewportWidth && desiredWidth !== null) {
                      const maxWidth = Math.max(0, viewportWidth - offset);
                      if (maxWidth > 0) container.style.maxWidth = `${maxWidth}px`;
                    }
                    if (viewportHeight && desiredHeight !== null) {
                      const maxHeight = Math.max(0, viewportHeight - offset);
                      if (maxHeight > 0) container.style.maxHeight = `${maxHeight}px`;
                    }
                  }
                }
                break;

              case "WIDGET_HIDE":
                allowDisplay = false;
                container.style.display = "none";
                emitEvent('close', data, { rawType: type });
                _gaTrack('widget_close', { agent_id: agentId });
                break;

              case "WIDGET_MINIMIZE":
                // Widget requested minimize -> show minimized button state
                // Don't hide container; let the iframe handle its own UI state
                emitEvent('close', data, { rawType: type });
                _gaTrack('widget_close', { agent_id: agentId });
                break;

              case "WIDGET_SHOW":
                if (visibilityFallbackTimeout) {
                  clearTimeout(visibilityFallbackTimeout);
                  visibilityFallbackTimeout = null;
                }
                allowDisplay = true;
                if (data && data.source === 'embed-error') {
                  applyErrorContainerLayout(data);
                } else {
                  container.style.display = "block";
                }
                emitEvent('open', data, { rawType: type });
                _gaTrack('widget_open', { agent_id: agentId });
                break;

              case "WIDGET_RESTORE":
                // Widget requested restore/expand -> treat as open
                // Container stays visible; iframe handles its own expanded state
                emitEvent('open', data, { rawType: type });
                _gaTrack('widget_open', { agent_id: agentId });
                break;

              case "WIDGET_ERROR":
                logError("Widget reported an error", data);
                if ((data && data.source === 'embed-error') || isCompactContainer()) {
                  applyErrorContainerLayout(data);
                }
                emitEvent('error', data, { rawType: type });
                // If error indicates auth failure, call auth hook
                try {
                  const code = data && (data.code || data.error || '').toString().toLowerCase();
                  if (code && code.includes('auth')) {
                    emitEvent('authFailure', data, { rawType: type });
                  }
                } catch (e) {
                  logError('onAuthFailure hook check failed', { error: e && e.message });
                }
                _gaTrack('widget_error', { agent_id: agentId, error_type: data && data.errorType });
                break;

              case 'WIDGET_GA_INIT':
                if (data && data.gaMeasurementId) {
                  initGA(data.gaMeasurementId);
                }
                break;

              case 'WIDGET_HMR_RELOAD':
                // Dev-only: Next.js HMR fired inside the iframe. Reload just the
                // iframe so the host page doesn't have to be hard-refreshed.
                if (isDev) {
                  try { iframe.src = iframe.src; } catch (e) {}
                }
                break;

              default:
                break;
            }

            // Generic hooks: try to detect responses, auth failures, and message events
            try {
              const t = (type || '').toString().toLowerCase();

              // Response-like events
              if (t.includes('response') || t.endsWith('_response')) {
                try {
                  emitEvent('response', data, { rawType: type, debounceMs: 120 });
                  _gaTrack('widget_response_received', { agent_id: agentId });
                } catch (e) { logError('onResponse hook threw', { error: e && e.message }); }
              }

              // Auth failure events
              if (t.includes('auth') && (t.includes('fail') || t.includes('error') || t.includes('failure'))) {
                try {
                  emitEvent('authFailure', data, { rawType: type });
                } catch (e) { logError('onAuthFailure hook threw', { error: e && e.message }); }
              }

              // Message events (e.g., widget notifies about a sent message or incoming message)
              if (t.includes('message') || t.includes('msg')) {
                try {
                  // If this message matches the last host-initiated message, skip duplicate delivery
                  if (__lastHostMessage && data && data.id && __lastHostMessage.id && data.id === __lastHostMessage.id) {
                    // clear cached last message after skipping
                    __lastHostMessage = null;
                  } else {
                    __lastHostMessage = data;
                    emitEvent('message', data, { rawType: type, debounceMs: 120 });
                    const _gaMessageText = (data && (data.content || data.message || data.text)) || '';
                    _gaTrack('widget_message_sent', { agent_id: agentId, message_length: _gaMessageText.length });
                  }
                } catch (e) { logError('onMessage hook threw', { error: e && e.message }); }
              }
            } catch (e) {
              logError('Failed to process generic hooks', { error: e && e.message, type });
            }
          } catch (err) {
            logError("Error handling message from widget", {
              error: err.message,
              eventType: event?.data?.type,
            });
          }
        }

        // button logic has been removed; nothing to wire up
      } catch (err) {
        logError("Failed to initialize widget", { error: err.message, stack: err.stack });
        showErrorWidget(
          "Initialization Error",
          "Failed to initialize the chat widget. Please try refreshing the page."
        );
      }
    }

    // Initialize immediately if body is ready
    if (document.body) {
      initWidget();
    }
  } catch (err) {
    logError("Critical error in widget script", {
      error: err.message,
      stack: err.stack,
    });
  }

  // Build a "Powered by Companin" footer node. Uses textContent / createElement
  // throughout to keep dynamic strings (POWERED_BY_TEXT) out of innerHTML.
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

  // Production fail-silent: remove any mounted widget container(s) and stray
  // error card so the widget vanishes from the host page without a trace.
  function hideWidgetSilently() {
    try {
      const nodes = document.querySelectorAll('[id^="' + WIDGET_SCRIPT_ID + '-container"], #' + WIDGET_SCRIPT_ID + '-error');
      for (let i = 0; i < nodes.length; i++) {
        try { nodes[i].remove(); } catch (e) {}
      }
    } catch (e) {}
  }

  // Helper function to show error in a styled widget. Uses textContent for the
  // dynamic title/message values so callers can't introduce HTML injection if
  // they ever pass untrusted input.
  function showErrorWidget(title, message) {
    // In production, never render the error card on a customer's page — the
    // failure is already captured via logError(). Just remove the widget.
    if (!IS_DEV) {
      hideWidgetSilently();
      return;
    }
    try {
      const _errShadowHost = null;
      const errorContainer = document.createElement("div");
      errorContainer.id = WIDGET_SCRIPT_ID + '-error';
      errorContainer.style.cssText = `
        position: fixed;
        bottom: calc(20px + env(safe-area-inset-bottom, 0px));
        right: calc(20px + env(safe-area-inset-right, 0px));
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
      // SVG is a static literal — innerHTML is safe here because none of the
      // markup is interpolated from caller-provided values.
      iconWrap.innerHTML = '<svg viewBox="0 0 20 20" fill="currentColor">'
        + '<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>'
        + '</svg>';

      const body = document.createElement('div');
      body.style.cssText = 'flex: 1;';
      const h4 = document.createElement('h4');
      h4.style.cssText = 'margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #dc2626;';
      h4.textContent = String(title || '');
      const p = document.createElement('p');
      p.style.cssText = 'margin: 0; font-size: 13px; color: #6b7280; line-height: 1.5;';
      p.textContent = String(message || '');
      body.appendChild(h4);
      body.appendChild(p);

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.setAttribute('aria-label', 'Close');
      closeBtn.style.cssText = 'flex-shrink: 0; background: none; border: none; cursor: pointer; color: #9ca3af; font-size: 20px; line-height: 1; padding: 0;';
      closeBtn.textContent = '×';
      closeBtn.addEventListener('click', function () {
        // Remove the shadow host when present, otherwise the container itself.
        (_errShadowHost || errorContainer).remove();
      });

      row.appendChild(iconWrap);
      row.appendChild(body);
      row.appendChild(closeBtn);
      errorContainer.appendChild(row);
      errorContainer.appendChild(buildPoweredByFooter());

      const _errMount = _errShadowHost || errorContainer;
      if (document.body) {
        document.body.appendChild(_errMount);
      } else {
        document.addEventListener("DOMContentLoaded", () => {
          document.body.appendChild(_errMount);
        });
      }
    } catch (err) {
      console.error("Failed to show error widget:", err);
    }
  }

  // Helper to show error in existing container. Same defense as above: any
  // dynamic string goes through textContent.
  function showErrorInContainer(container, message) {
    // In production, hide the widget instead of painting a load-failure card.
    if (!IS_DEV) {
      try {
        while (container.firstChild) container.removeChild(container.firstChild);
        container.style.display = 'none';
      } catch (e) {}
      return;
    }
    try {
      while (container.firstChild) container.removeChild(container.firstChild);

      const card = document.createElement('div');
      card.style.cssText = 'background: #fef2f2; border: 1px solid #dc2626; border-radius: 8px; padding: 16px; font-family: system-ui, -apple-system, sans-serif; max-width: 320px;';

      const p = document.createElement('p');
      p.style.cssText = 'margin: 0; font-size: 14px; color: #dc2626;';
      p.textContent = String(message || '');

      const reload = document.createElement('button');
      reload.type = 'button';
      reload.style.cssText = 'margin-top: 12px; background: #dc2626; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-size: 13px; cursor: pointer;';
      reload.textContent = 'Reload Page';
      reload.addEventListener('click', function () {
        try { window.location.reload(); } catch (e) {}
      });

      card.appendChild(p);
      card.appendChild(reload);
      card.appendChild(buildPoweredByFooter());
      container.appendChild(card);
    } catch (err) {
      console.error("Failed to show error in container:", err);
    }
  }
})();
