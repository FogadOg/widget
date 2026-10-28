// =============================================================================
// AUTO-GENERATED FILE — DO NOT EDIT DIRECTLY
// Source: src/embed/widget.js
// Version: 0.1.8
// Regenerate: npm run build:embed
// =============================================================================
// Stable-channel loader: pins to the versioned release built alongside this file.
// Customers on this URL stay on v0.1.8 until this stub is redeployed.
// To advance the stable channel, bump the version in package.json and redeploy.
(function () {
  'use strict';
  var cur = document.currentScript;
  var host = 'https://widget.companin.tech';
  // Carry this tag's own query string over to the versioned bundle. Host
  // platforms that inject the loader as a bare URL cannot set attributes on it
  // — Google Tag Manager's sandboxed injectScript() takes a URL and nothing
  // else, and Webflow's registered hosted scripts take a URL plus an integrity
  // hash — so ?key=/?theme=/?locale= is the only config channel they have.
  // Dropping the query here would hand the versioned loader a tag with nothing
  // on it to read, and the widget would report a missing install key.
  var query = '';
  if (cur && cur.src) {
    try {
      var parsed = new URL(cur.src, window.location.href);
      host = parsed.origin;
      query = parsed.search || '';
    } catch (e) {}
  }
  var s = document.createElement('script');
  // Copy all data-* attributes (client-id, agent-id, etc.) to the versioned tag
  // so the widget loader can read them from document.currentScript as normal.
  // Not `id`: a host that gave the stub one (WordPress always does) would end
  // up with two elements sharing it.
  if (cur) {
    var a = cur.attributes;
    for (var i = 0; i < a.length; i++) {
      if (a[i].name !== 'src' && a[i].name !== 'integrity' && a[i].name !== 'id') {
        try { s.setAttribute(a[i].name, a[i].value); } catch (e) {}
      }
    }
  }
  s.src = host + "/widget-0.1.8.js" + query;
  s.async = true;
  s.crossOrigin = 'anonymous';
  (document.head || document.documentElement).appendChild(s);
})();
