// =============================================================================
// AUTO-GENERATED FILE — DO NOT EDIT DIRECTLY
// Source: src/embed/docs-widget.js
// Version: 0.1.0
// Regenerate: npm run build:embed
// =============================================================================
// Stable-channel loader: pins to the versioned release built alongside this file.
// Customers on this URL stay on v0.1.0 until this stub is redeployed.
// To advance the stable channel, bump the version in package.json and redeploy.
(function () {
  'use strict';
  var cur = document.currentScript;
  var host = 'https://widget.companin.tech';
  if (cur && cur.src) {
    try { host = new URL(cur.src, window.location.href).origin; } catch (e) {}
  }
  var s = document.createElement('script');
  // Copy all data-* attributes (client-id, agent-id, etc.) to the versioned tag
  // so the widget loader can read them from document.currentScript as normal.
  if (cur) {
    var a = cur.attributes;
    for (var i = 0; i < a.length; i++) {
      if (a[i].name !== 'src' && a[i].name !== 'integrity') {
        try { s.setAttribute(a[i].name, a[i].value); } catch (e) {}
      }
    }
  }
  s.src = host + "/docs-widget-0.1.0.js";
  s.async = true;
  s.crossOrigin = 'anonymous';
  (document.head || document.documentElement).appendChild(s);
})();
