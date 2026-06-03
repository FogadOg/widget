# Widget Security Guide

This document describes the security architecture for the widget embed and provides guidance for integrators.

---

## Embedding the Widget

### Sandboxed iframe (recommended)

Always embed the widget in a `sandbox="allow-scripts allow-forms"` iframe **without** `allow-same-origin`. This prevents the widget code from accessing the host page's cookies, localStorage, or DOM.

```html

<iframe

  src="https://widget.example.com/embed/widget"

  sandbox="allow-scripts allow-forms"

  referrerpolicy="no-referrer"

  width="100%"

  height="600"

  title="Agent Widget"

  style="border:none;"

></iframe>

```

React component equivalent — see [src/embed/host.tsx](../src/embed/host.tsx).

### postMessage handshake

Communication between your page and the iframe uses a typed postMessage protocol defined in [src/embed/handshake.ts](../src/embed/handshake.ts):

1. Widget sends `READY` with an ephemeral `handshakeToken`.

2. Host echoes the token back in `INIT` along with widget config.

3. Widget verifies the token matches before accepting config.

```typescript

import { createHostHandshake } from 'widget-app/src/embed/handshake';

const hs = createHostHandshake({

  iframe: document.getElementById('widget-iframe') as HTMLIFrameElement,

  widgetOrigin: 'https://widget.example.com',

});

hs.on('READY', (msg) => {

  hs.sendInit(msg.handshakeToken, { agentId: 'your-id' });

});

```

### Allowed origins

Set the environment variable `NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS` on the widget server to a comma-separated list of origins that are permitted to INIT the widget:

```

NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS=https://your-app.com,https://partner.com

```

---

## CSP recommendations for integrators

When embedding the widget, add the widget origin to your own page's CSP `frame-src` directive:

```

frame-src 'self' https://widget.example.com;

```

If you use the postMessage API from a module script, also allow `connect-src` to your API origin.

---

## Content Security Policy (widget server)

The widget server emits a per-request CSP header via `middleware.ts`. Key directives:

| Directive       | Value                                                     |

|-----------------|-----------------------------------------------------------|

| `script-src`    | `'self' 'nonce-<per-request>'`                           |

| `style-src`     | `'self' 'unsafe-inline'`                                  |

| `connect-src`   | `'self' <NEXT_PUBLIC_API_ORIGIN>`                         |

| `object-src`    | `'none'`                                                  |

| `frame-ancestors` | `'none'` (overridden to configured origins for `/embed/*`) |

| `report-uri`    | `/api/security/csp-report`                               |

Violation reports are sent to `/api/security/csp-report` and logged. Set `CSP_REPORT_SIEM_ENDPOINT` to forward them to an external SIEM.

---

## SRI (Subresource Integrity)

After each build, run `npm run build:sri` to generate `sri-manifest.json`. This file contains SHA-384 hashes for all emitted JS/CSS chunks.

The CI pipeline (`ci.yml`) fails if the manifest is missing or empty.

---

## Transport security

The server sets the following headers on every response:

- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`

- `X-Content-Type-Options: nosniff`

- `X-Frame-Options: DENY`

- `Referrer-Policy: strict-origin-when-cross-origin`

- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`

---

## Rotate embed tokens

If you suspect an embed token has been compromised:

1. Rotate `NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS` to remove the compromised origin.

2. Redeploy the widget server.

3. Notify affected integrators to re-embed with a new token.

---

## Reporting a vulnerability

Please report security vulnerabilities to **security@example.com**. Do not open public GitHub issues for security bugs.

