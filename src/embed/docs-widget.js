(function () {
  // Local constants to mirror centralized app constants
  const STORAGE_PREFIX = 'companin-';
  const WIDGET_SCRIPT_ID = 'companin-widget';
  const DOCS_WIDGET_SCRIPT_ID = 'companin-docs-widget';
  const COMPANY_NAME = 'Companin';
  let POWERED_BY_TEXT = (typeof window !== 'undefined' && window[`__${COMPANY_NAME.toUpperCase()}_WIDGET_LOCALES__`] && window[`__${COMPANY_NAME.toUpperCase()}_WIDGET_LOCALES__`].poweredBy) || 'Powered by ';
  const BASE_WIDGET_HOST = 'https://widget.companin.tech';
  const DOCS_REGISTRY_KEY = `__${COMPANY_NAME.toUpperCase()}_DOCS_WIDGET_INSTANCES__`;
  const sanitizeInstanceId = (value) => String(value || 'default').replace(/[^a-zA-Z0-9_-]/g, '-');
  const getOrCreateRegistry = () => {
    if (!window[DOCS_REGISTRY_KEY] || typeof window[DOCS_REGISTRY_KEY] !== 'object') {
      window[DOCS_REGISTRY_KEY] = {};
    }
    return window[DOCS_REGISTRY_KEY];
  };

    try {

    // Error tracking
  const errors = [];
  const logError = (message, context) => {
    const error = {
      timestamp: new Date().toISOString(),
      message,
      context,
    };
    errors.push(error);
    console.error(COMPANY_NAME + ' Docs Widget Error:', message, context);
  };

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
            !!s.getAttribute('data-assistant-id') ||
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
    const assistantId = script.getAttribute("data-assistant-id");
    const configId = script.getAttribute("data-config-id");
    const detectLocale = () => {
      const explicitLocale = script.getAttribute("data-locale");
      if (explicitLocale) return explicitLocale;
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
    const suggestions = script.getAttribute("data-suggestions");

    // Validate required attributes
    if (!clientId || !assistantId || !configId) {
      const missing = [];
      if (!clientId) missing.push("data-client-id");
      if (!assistantId) missing.push("data-assistant-id");
      if (!configId) missing.push("data-config-id");

      logError("Missing required attributes", { missing });

      // Show user-friendly error
      showErrorWidget(
        "Configuration Error",
        `Missing required attributes: ${missing.join(", ")}. Please check your docs widget installation.`
      );
      return;
    }

    // Determine the base URL with fallback
    const isDev = script.getAttribute("data-dev") === "true";
    const baseUrl = isDev
      ? "http://localhost:3001"
      : BASE_WIDGET_HOST;

    // Allow the host page to explicitly set the postMessage target origin.
    // Useful when the widget is hosted on a different / custom domain.
    const explicitTargetOrigin = script.getAttribute("data-target-origin") || script.getAttribute("data-parent-origin");
    const targetOrigin = (explicitTargetOrigin && explicitTargetOrigin.trim()) || baseUrl;

    // Locale fetch disabled in the embed script to avoid cross-origin issues.
    // The embed should receive localized strings via either:
    // 1) `data-powered-by` attribute on the script tag, or
    // 2) a host-provided global `window.__COMPANIN_WIDGET_LOCALES__` object.

    const requestedInstanceId = explicitInstanceId || `${clientId}::${assistantId}::${configId}::${locale}`;
    const registry = getOrCreateRegistry();
    let instanceId = sanitizeInstanceId(requestedInstanceId);
    if (registry[instanceId]) {
      let copyIndex = 2;
      while (registry[`${instanceId}-${copyIndex}`]) {
        copyIndex += 1;
      }
      instanceId = `${instanceId}-${copyIndex}`;
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
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 0;
      height: 0;
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

    function initWidget() {
      try {
        // Create iframe with error handling
        const iframe = document.createElement("iframe");
        const params = new URLSearchParams({
          clientId,
          assistantId,
          configId,
          locale,
          startOpen: startOpen.toString(),
          pagePath: window.location.pathname,
        });

        if (suggestions) {
          params.set("suggestions", suggestions);
        }

        iframe.src = `${baseUrl}/embed/docs?${params.toString()}`;
        iframe.style.cssText = `
          width: 100%;
          height: 100%;
          border: 0;
          background-color: transparent;
        `;
        iframe.setAttribute("allow", "clipboard-write");
        iframe.setAttribute("title", COMPANY_NAME + ' Docs Widget');

        // Handle iframe load errors
        let iframeLoaded = false;
        const loadTimeout = setTimeout(() => {
          if (!iframeLoaded) {
            logError("Docs widget iframe failed to load (timeout)", { src: iframe.src });
            showErrorInContainer(
              container,
              "Failed to load docs widget. Please refresh the page."
            );
          }
        }, 15000); // 15 second timeout

        iframe.onload = () => {
          iframeLoaded = true;
          clearTimeout(loadTimeout);
        };

        iframe.onerror = (error) => {
          clearTimeout(loadTimeout);
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

        const eventNames = ["open", "close", "message", "response", "authFailure", "error"];
        const callbackRegistry = eventNames.reduce((acc, name) => {
          acc[name] = new Set();
          return acc;
        }, {});
        const lastEventEnvelope = {};
        const debounceState = {};

        function normalizeEventName(name) {
          if (!name) return null;
          const normalized = String(name).toLowerCase();
          if (normalized === "auth_failure" || normalized === "authfailure") return "authFailure";
          if (
            normalized === "open" ||
            normalized === "close" ||
            normalized === "message" ||
            normalized === "response" ||
            normalized === "error" ||
            normalized === "authfailure"
          ) {
            return normalized === "authfailure" ? "authFailure" : normalized;
          }
          return null;
        }

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
              assistantId,
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
            callbackRegistry[normalized].add(handler);

            if (lastEventEnvelope[normalized]) {
              invokeCallbackSafely(handler, lastEventEnvelope[normalized], normalized);
            }

            return () => {
              try {
                callbackRegistry[normalized].delete(handler);
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

        // Expose API for programmatic control
        const docsWidgetApi = {
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
              if (!iframe.contentWindow) {
                throw new Error("iframe not ready");
              }
              iframe.contentWindow.postMessage(
                { type: "OPEN_DOCS_DIALOG" },
                targetOrigin
              );
              emitEvent("open", { source: "host-api" }, { rawType: "HOST_OPEN_DOCS_DIALOG" });
            } catch (err) {
              logError("Failed to open docs widget", { error: err.message });
              emitEvent("error", { message: err.message, code: "OPEN_FAILED" }, { rawType: "HOST_OPEN_DOCS_DIALOG_ERROR" });
            }
          },
          close: () => {
            try {
              if (!iframe.contentWindow) {
                throw new Error("iframe not ready");
              }
              iframe.contentWindow.postMessage(
                { type: "CLOSE_DOCS_DIALOG" },
                targetOrigin
              );
              emitEvent("close", { source: "host-api" }, { rawType: "HOST_CLOSE_DOCS_DIALOG" });
            } catch (err) {
              logError("Failed to close docs widget", { error: err.message });
              emitEvent("error", { message: err.message, code: "CLOSE_FAILED" }, { rawType: "HOST_CLOSE_DOCS_DIALOG_ERROR" });
            }
          },
          show: () => {
            try {
              container.style.display = "block";
              emitEvent("open", { source: "host-api" }, { rawType: "HOST_SHOW" });
            } catch (err) {
              logError("Failed to show docs widget", { error: err.message });
              emitEvent("error", { message: err.message, code: "SHOW_FAILED" }, { rawType: "HOST_SHOW_ERROR" });
            }
          },
          hide: () => {
            try {
              container.style.display = "none";
              emitEvent("close", { source: "host-api" }, { rawType: "HOST_HIDE" });
            } catch (err) {
              logError("Failed to hide docs widget", { error: err.message });
              emitEvent("error", { message: err.message, code: "HIDE_FAILED" }, { rawType: "HOST_HIDE_ERROR" });
            }
          },
          sendMessage: (message) => {
            try {
              emitEvent("message", message, { rawType: "HOST_MESSAGE_SENT", debounceMs: 120 });
              if (!iframe.contentWindow) {
                throw new Error("iframe not ready");
              }
              iframe.contentWindow.postMessage(
                { type: "HOST_MESSAGE", data: message },
                targetOrigin
              );
            } catch (err) {
              logError("Failed to send message to docs widget", {
                error: err.message,
                message,
              });
              emitEvent("error", { message: err.message, code: "SEND_MESSAGE_FAILED", payload: message }, { rawType: "HOST_MESSAGE_ERROR" });
            }
          },
          getErrors: () => errors,
          destroy: () => {
            try {
              window.removeEventListener("message", handleMessage);
              Object.keys(debounceState).forEach((eventName) => {
                const state = debounceState[eventName];
                if (state && state.timer) clearTimeout(state.timer);
              });
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

        function handleMessage(event) {
          try {
            if (event.source !== iframe.contentWindow) return;

            // Verify origin - always validate, even in dev mode.
            // Allow explicit host-target origin to support custom widget domains.
            const validOrigins = new Set([baseUrl, targetOrigin]);
            const isDevOrigin = event.origin.includes('localhost') || event.origin.includes('127.0.0.1');
            if (isDev) {
              if (!validOrigins.has(event.origin) && !isDevOrigin) return;
            } else if (!validOrigins.has(event.origin) && !event.origin.includes("companin.tech")) {
              return;
            }

            const { type, data } = event.data || {};
            if (!type) return;

            switch (type) {
              case "WIDGET_RESIZE":
                if (data?.hide) {
                  // Hide the container
                  container.style.display = "none";
                  container.style.width = "0";
                  container.style.height = "0";
                  container.style.padding = "0";
                } else if (data?.height) {
                  const parsedWidth = parsePixelValue(data?.width);
                  const parsedHeight = parsePixelValue(data?.height);
                  const containerPadding = getContainerPadding(parsedWidth, parsedHeight);
                  container.style.padding = `${containerPadding}px`;
                  if (data.height === "100vh") {
                    // Full screen mode
                    container.style.display = "block";
                    container.style.height = "100vh";
                    container.style.width = "100vw";
                    container.style.top = "0";
                    container.style.left = "0";
                  } else {
                    const effectiveHeight = parsedHeight !== null ? parsedHeight + (containerPadding * 2) : data.height;
                    container.style.height = `${effectiveHeight}px`;
                  }
                }
                if (data?.width && data.width !== "100vw") {
                  const parsedWidth = parsePixelValue(data.width);
                  const parsedHeight = parsePixelValue(data?.height);
                  const containerPadding = getContainerPadding(parsedWidth, parsedHeight);
                  const effectiveWidth = parsedWidth !== null ? parsedWidth + (containerPadding * 2) : data.width;
                  container.style.width = `${effectiveWidth}px`;
                }
                break;

              case "WIDGET_HIDE":
                container.style.display = "none";
                emitEvent("close", data || { source: "widget" }, { rawType: type });
                _gaTrack('widget_close', { assistant_id: assistantId });
                break;

              case "WIDGET_SHOW":
                container.style.display = "block";
                emitEvent("open", data || { source: "widget" }, { rawType: type });
                _gaTrack('widget_open', { assistant_id: assistantId });
                break;

              case "WIDGET_RESPONSE":
                emitEvent("response", data, { rawType: type, debounceMs: 120 });
                _gaTrack('widget_response_received', { assistant_id: assistantId });
                break;

              case "WIDGET_AUTH_FAILURE":
                emitEvent("authFailure", data, { rawType: type });
                break;

              case 'WIDGET_GA_INIT':
                if (data && data.gaMeasurementId) {
                  initGA(data.gaMeasurementId);
                }
                break;

              case "WIDGET_ERROR":
                logError("Docs widget reported an error", data);
                emitEvent("error", data, { rawType: type });
                _gaTrack('widget_error', { assistant_id: assistantId, error_type: data && data.errorType });
                break;

              default:
                break;
            }

            // Track message sent events
            try {
              const t = (type || '').toString().toLowerCase();
              if (t.includes('message') || t.includes('msg')) {
                const _gaMessageText = (data && (data.content || data.message || data.text)) || '';
                _gaTrack('widget_message_sent', { assistant_id: assistantId, message_length: _gaMessageText.length });
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

  // Helper function to show error in a styled widget
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

      errorContainer.innerHTML = `
        <div style="display: flex; align-items: start; gap: 12px;">
          <div style="flex-shrink: 0; width: 20px; height: 20px; color: #dc2626;">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
            </svg>
          </div>
          <div style="flex: 1;">
            <h4 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #dc2626;">${title}</h4>
            <p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.5;">${message}</p>
          </div>
          <button onclick="this.parentElement.parentElement.remove()" style="flex-shrink: 0; background: none; border: none; cursor: pointer; color: #9ca3af; font-size: 20px; line-height: 1; padding: 0;">×</button>
        </div>
        <div style="margin-top:8px; font-size:12px; color:#6b7280;">
          ${POWERED_BY_TEXT} <a href="https://${COMPANY_NAME.toLowerCase()}.tech" target="_blank" rel="noopener noreferrer" style="color:#2563eb; text-decoration:none; margin-left:6px;">${COMPANY_NAME}</a>
        </div>
      `;

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

  // Helper to show error in existing container
  function showErrorInContainer(container, message) {
    try {
      container.innerHTML = `
        <div style="
          background: #fef2f2;
          border: 1px solid #dc2626;
          border-radius: 8px;
          padding: 16px;
          font-family: system-ui, -apple-system, sans-serif;
          max-width: 320px;
        ">
          <p style="margin: 0; font-size: 14px; color: #dc2626;">${message}</p>
          <button onclick="window.location.reload()" style="
            margin-top: 12px;
            background: #dc2626;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 13px;
            cursor: pointer;
          ">Reload Page</button>
          <div style="margin-top:8px; font-size:12px; color:#6b7280;">
            ${POWERED_BY_TEXT} <a href="https://companin.tech" target="_blank" rel="noopener noreferrer" style="color:#2563eb; text-decoration:none; margin-left:6px;">${COMPANY_NAME}</a>
          </div>
        </div>
      `;
    } catch (err) {
      console.error("Failed to show error in container:", err);
    }
  }
})();
