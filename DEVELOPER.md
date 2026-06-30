# widget-app — Developer Guide

This guide covers the developer workflow for `widget-app`: enabling debug mode, running tests, type-checking, linting, and building locally and in CI.

---

## Quick start

```bash

cd widget-app

npm ci          # install exact locked dependencies

npm run dev     # start Next.js dev server on :3001

```

---

## Debug mode

The widget ships a dev overlay (`src/components/DevOverlay.tsx`) that is **only visible when debug mode is active**.  Debug mode also enables verbose console logging. It works in **all environments including production** — integrators can debug a live embed without redeploying. It can be enabled via any of the following sources (checked in priority order):

### 0. Build-time env variable in the host app (recommended for staging deploys)

Set in the **host app** (e.g. `agent`) before building it:

```env

# agent/.env.local

NEXT_PUBLIC_WIDGET_DEV=true   # passes data-dev="true" on the <script> tag

```

The widget-app itself does **not** need this variable — `NODE_ENV` controls its own logging.

For local development of the widget-app, just run `next dev` (NODE_ENV=development) and all logs will be active automatically.

### 1. Script `data-dev` attribute (runtime, per-embed)

```html

<script

  src="https://your-cdn.com/widget.js"

  data-widget-key="YOUR_WIDGET_ID"

  data-dev="true"

></script>

```

In the host Next.js page (`agent/app/[locale]/page.tsx`) set the env variable:

```env

# agent/.env.local

NEXT_PUBLIC_WIDGET_DEV=true

```

### 2. URL query parameter

Append `?widget_debug=1` to any page URL:

```

https://example.com/en?widget_debug=1

```

### 3. `localStorage` toggle

Open the browser console and run:

```js

localStorage.setItem('widget_debug', '1');

location.reload();

```

To disable:

```js

localStorage.removeItem('widget_debug');

location.reload();

```

### 4. Runtime API (host page)

Call from the **host page** via the public embed API (both `chat` and docs widgets):

```js

// Chat widget
const chat = window.CompaninWidget;
chat.enableDebug();   // activate overlay — works in production
chat.disableDebug();  // deactivate

// Docs widget
const chat = window.CompaninDocsWidget;
chat.enableDebug();
chat.disableDebug();

```

Both methods are chainable: `chat.enableDebug().open()`.

Or from the **browser console** (inner iframe globals — useful when debugging without host-page access):

```js

window.CompaninWidget?.enableDebug();
window.CompaninWidget?.disableDebug();

```

**Security model**: the host-API path is postMessage-based and origin-validated — only the legitimate embedding page can trigger it. The overlay only ever shows the current visitor their own session data. No cross-user exposure.

### Summary: which variable controls what?

| Variable | Where to set it | What it does |

|---|---|---|

| `NEXT_PUBLIC_WIDGET_DEV=true` | `agent/.env.local` | Passes `data-dev="true"` on the `<script>` tag → activates DevOverlay + verbose logging in the *embedded* widget |

| `?widget_debug=1` | Browser URL | Activates debug mode at runtime without rebuilding |

| `localStorage.widget_debug = '1'` | Browser console | Persists debug mode across page loads |

| `data-dev="true"` on `<script>` | Host embed snippet | Same as above but set statically in markup |

---

## TypeScript types

All public types are exported from `types/index.d.ts`.  To use them in host code:

```ts

import type { WidgetConfig, MessageEvent, WidgetAPI, LogLevel, ErrorReport } from './types';

```

or if the package is published and mapped:

```ts

import type { WidgetConfig, MessageEvent, WidgetAPI } from '@yourco/widget';

```

Key types:

| Type | Description |

|---|---|

| `WidgetConfig` | Full widget configuration object |

| `MessageEvent` | Event emitted by the widget (open/close/message/response) |

| `WidgetAPI` | Shape of `window.CompaninWidget` |

| `LogLevel` | `'debug' \| 'info' \| 'warn' \| 'error'` |

| `ErrorReport` | Structure of payloads sent to the monitoring backend |

---

## Logging

The logger lives at `lib/logger.ts`.  Import the singleton or named helpers:

```ts

import { logger, logError, logWarn, logInfo, logDebug } from 'lib/logger';

logger.info('Widget initialised', { locale: 'en' });

logError('Config missing', { field: 'apiKey' });

```

In development (`NODE_ENV !== 'production'`) all levels are printed to the browser console.  In production, `error` calls are forwarded to the endpoint configured by `NEXT_PUBLIC_LOG_ENDPOINT` (defaults to `/api/client-errors`).

---

## Monitoring

The monitoring module (`lib/monitoring.ts`) provides a thin abstraction over error/event reporting:

```ts

import { initMonitoring, reportError, reportEvent } from 'lib/monitoring';

// Call once at bootstrap:

initMonitoring({

  sendReports: process.env.NODE_ENV === 'production',

  endpoint: process.env.NEXT_PUBLIC_LOG_ENDPOINT,

  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,  // optional

});

// Report an error (e.g. inside ErrorBoundary):

reportError(new Error('Something went wrong'), { userId: '123' });

// Report an event:

reportEvent('widget.open', { locale: 'en' });

```

Reports are **silently no-ops** when `sendReports` is `false` (default in `NODE_ENV=test`).

---

## Running tests

```bash

# All tests (interactive)

npm test

# With coverage report

npm run test:coverage

# CI mode (serial, with coverage — matches GitHub Actions)

npm run test:ci

# Watch mode

npm run test:watch

```

Coverage thresholds are enforced in `jest.config.mjs`:

- **Statements/Lines** ≥ 90% for `app/`, `hooks/`, `lib/`

- **Branches/Functions** ≥ 80%

- **Components** ≥ 85% statements/lines, 70% branches/functions

---

## Type-checking

```bash

npm run type-check   # alias: npm run typecheck

```

This runs `tsc --noEmit` against the workspace using `tsconfig.json`.

---

## Linting

```bash

npm run lint

```

ESLint is configured via `eslint.config.mjs`.

---

## Building

```bash

npm run build

```

This runs locale checks, then `next build`, then the full test suite (defined in `package.json` `build` script).

---

## CI (GitHub Actions)

The workflow at `.github/workflows/ci.yml` runs on every push/PR to `main` and `develop`:

1. `npm ci`

2. Locale checks (warnings only)

3. `npm run lint`

4. `npm run typecheck`

5. `npm run build`

6. `npm test -- --coverage`

7. `npm audit --audit-level=high` (non-blocking)

8. Upload coverage to Codecov

---

## Project structure (developer-relevant)

```

lib/

  logger.ts          # Singleton logger (dev/prod aware)

  monitoring.ts      # Error/event reporting abstraction

  validateConfig.ts  # Runtime config validation with friendly errors

components/

  ErrorBoundary.tsx  # React error boundary with retry + dev stack trace

src/

  components/

    DevOverlay.tsx   # Debug panel (only rendered when debug mode active)

types/

  widget.ts          # Core domain types

  index.d.ts         # Public re-exports + WidgetAPI, MessageEvent, etc.

__tests__/           # Jest test files (co-located with features they test)

```

