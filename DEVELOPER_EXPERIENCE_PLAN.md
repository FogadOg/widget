# Developer Experience Plan — widget-app

Date: 2026-04-02

This document captures a comprehensive, ordered, file-level implementation plan to improve the developer experience for the `widget-app` project. Follow the steps in sequence; each step lists estimated effort, target files, and expected outcomes.

---

## Goals

- Provide environment-aware, color-coded logging with a single `Logger` API

- Export first-class TypeScript types for public APIs

- Add runtime debug toggles and a small dev overlay for host integration testing

- Provide a robust `ErrorBoundary` with contextual reporting and monitoring hooks

- Validate runtime configuration with actionable error messages and doc links

- Ship and enforce test coverage and CI checks (lint, type-check, tests, build, audit)

- Document developer workflows, debug toggles, and type exports

---

## Task Breakdown (ordered)

1) Public TypeScript types & package exports — Effort: S (1–3h)

- Add `widget-app/types/index.d.ts` (or `src/types.ts`) with exported types:

  - `WidgetConfig`, `MessageEvent`, `WidgetAPI`, `LogLevel`, `ErrorReport`

- Update `src/index.ts` to re-export types and set `package.json` `types` field.

- Verify with `npx tsc --noEmit`.

Files to touch: `types/index.d.ts`, `src/index.ts`, `package.json`, `tsconfig.json`

2) Environment-aware color logger — Effort: M (2–5h)

- Add `src/lib/logger.ts`.

- Features:

  - Auto-detect dev vs prod (NODE_ENV, host `data-dev`, runtime toggle)

  - `createLogger(context?)` + `logger.debug/info/warn/error` + `withContext()`

  - Colorized output: debug=gray, info=blue, warn=yellow, error=red

  - Dev: verbose snapshots, timings; Prod: minimal, PII-sanitized

  - Optional JSON output and `logLevel` control

  - Use `colorette` or `chalk` for colors.

Files to add: `src/lib/logger.ts` — integrate imports across bootstrap and key modules.

3) Runtime Debug Mode toggles & dev overlay — Effort: M (3–6h)

- Sources for enabling debug: `data-dev` script attribute, `?widget_debug=1`, `localStorage.widget_debug`, runtime API.

- Implement detection in `src/bootstrap.ts` / `src/index.ts` and wire to logger.

- Add a lightweight `src/components/DevOverlay.tsx` visible only in dev/debug mode:

  - Recent API requests/responses, event stream, last error, render timings, clear/persist toggles.

- Expose `CompaninWidget.enableDebug()` / `disableDebug()` on the host API.

Files: `src/bootstrap.ts`, `src/components/DevOverlay.tsx`, update host integration where needed.

4) React `ErrorBoundary` with contextual reporting — Effort: M (3–6h)

- Add `src/components/ErrorBoundary.tsx` that:

  - In dev: shows stack, props/state snapshot, suggestions for fixes

  - In prod: shows a friendly fallback UI with `Retry` and optional `Report` link

  - Always logs via `logger.error()` and calls `monitoring.reportError()` if configured

- Wrap top-level widget root with `ErrorBoundary`.

Files: `src/components/ErrorBoundary.tsx`, update `src/index.ts` / root component.

5) Runtime config validation & helpful errors — Effort: S→M (1–4h)

- Add `src/lib/validateConfig.ts` with typed errors: `MissingFieldError`, `InvalidValueError`.

- Examples of messages:

  - `Missing required field: apiKey. Add apiKey: "your-key" to widget config. See: /docs/configuration#apiKey`

  - `Invalid position: "top-center". Valid options: "bottom-right", "bottom-left", "top-right", "top-left".`

- Call validation early in bootstrap and show actionable guidance in console/logs.

Files: `src/lib/validateConfig.ts`, call-sites in `src/bootstrap.ts`.

6) Monitoring & reporting hooks — Effort: M (2–6h)

- Add `src/lib/monitoring.ts` abstraction with `initMonitoring(opts)`, `reportError(err, meta)`, `reportEvent(name,payload)`.

- Provide adapters for Sentry (optional) and a simple HTTP `POST` endpoint.

- Respect `config.sendReports` and `NODE_ENV` when sending real reports.

Files: `src/lib/monitoring.ts`, wire into `ErrorBoundary`, `logger.error`, and critical flows.

7) Tests: unit, integration, and e2e — Effort: L (days)

- Unit tests for `logger`, `validateConfig`, `monitoring` mocks, `ErrorBoundary`.

- Integration tests that simulate host bootstrap (jsdom) and the `agent/app/[locale]/page.tsx` host hooks.

- Optional e2e tests (Cypress / Playwright) for full flows (open, send, response).

- Add/extend tests under `__tests__/` and make sure existing tests still pass.

Commands to run locally:

```bash

cd widget-app

npm ci

npm test -- --coverage

```

8) Enforce coverage thresholds & test improvements — Effort: S (1–2h)

- Update `jest.config.mjs` to set `coverageThreshold` global to 80% for statements, branches, functions, lines.

- Add `test:ci` script: `jest --coverage --runInBand`.

Files: `jest.config.mjs`, `package.json` scripts.

9) GitHub Actions CI — Effort: M (2–4h)

- Add `.github/workflows/ci.yml` with jobs to run on `push`/`pull_request`:

  - `npm ci`

  - `npm run lint`

  - `npm run type-check` (`tsc --noEmit`)

  - `npm test -- --coverage`

  - `npm run build`

  - `npm audit --audit-level=high` (optional)

- Cache npm and Jest caches for speed.

10) Docs & developer guide — Effort: S (1–3h)

- Update `README-WIDGET.md` and add `DEVELOPER.md` with:

  - How to enable debug (script `data-dev` attribute, `?widget_debug`, `localStorage` toggle)

  - Examples of importing types: `import type { WidgetConfig, MessageEvent } from '@yourcompany/widget';`

  - How to run tests, type-check, lint, and build locally and in CI

Files: `README-WIDGET.md`, new `DEVELOPER.md`.

11) Ergonomics & scripts — Effort: S (1h)

- Add scripts to `package.json`:

  - `type-check`: `tsc --noEmit`

  - `lint`: `eslint . --ext .ts,.tsx`

  - `test:ci`: `jest --coverage --runInBand`

  - `dev:widget`: optional local dev harness that mounts the widget with `data-dev`

12) Incremental rollout & validation — Effort: S→M

- Roll out changes behind a debug flag; open small PRs:

  - logger + types

  - ErrorBoundary + monitoring

  - dev overlay + debug toggle

  - CI + coverage enforcement

- Validate integration using the host script at `agent/app/[locale]/page.tsx` to ensure `data-dev` is passed through.

---

## Quick Implementation Checklist (copyable)

1. Create `src/lib/logger.ts` implementing `createLogger` and export a default logger.

2. Add `types/index.d.ts` and re-export from `src/index.ts`.

3. Add `src/lib/validateConfig.ts` and call at bootstrap.

4. Add `src/components/ErrorBoundary.tsx` and wrap root.

5. Add `src/lib/monitoring.ts` and wire reports.

6. Add `src/components/DevOverlay.tsx` and wire runtime toggles.

7. Update `jest.config.mjs` for coverageThresholds and add `test:ci` script.

8. Add `.github/workflows/ci.yml` with lint/type-check/test/build/audit steps.

9. Update `README-WIDGET.md` / add `DEVELOPER.md` with debug & test instructions.

---

## Next immediate step (recommended)

Implement and commit `src/lib/logger.ts` and `types/index.d.ts`, add `type-check` and `test` scripts, then run `npx tsc --noEmit` and `npm test -- --coverage` locally.

If you'd like, I can implement the logger + types now and run local checks; tell me to proceed and I'll apply the changes.

---

End of plan.

