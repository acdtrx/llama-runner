# 07 — Build Plan

Ordered so each milestone is independently runnable and user-testable. Each phase states an **acceptance criterion** — the observable behavior that proves the phase is done.

Every phase implies: TypeScript types synced with the JSON Schemas in `docs/03-storage.md`; new routes get Fastify schema validation; new parser rules get unit tests against `llama-server.log`.

---

## Phase 1 — Specs

**Scope**: These `docs/*.md` files.

**Acceptance**: `ls docs/` shows `01-overview.md`, `02-architecture.md`, `03-storage.md`, `04-api.md`, `05-metrics.md`, `06-ui.md`, `07-build-plan.md`. User review pass.

---

## Phase 2 — Repo bootstrap

**Scope**:

- Workspace layout: root `package.json` with two workspaces (`server/`, `web/`). `pnpm` preferred (lighter install); fall back to npm workspaces if preferred.
- `server/`: TypeScript + Fastify 5 + `tsx` for dev watch. Scripts: `dev` (tsx watch), `build` (tsc), `start` (node dist).
- `web/`: Vite 8 + React 19 + Tailwind 4 (CSS-first, no `tailwind.config.js`) + Zustand + react-router v7 + `lucide-react`. Scripts: `dev`, `build`, `preview`.
- Root scripts: `dev` runs both in parallel; `build` builds both.
- `.gitignore`, `.editorconfig`, `.nvmrc` (node 24).
- Minimal `README.md` pointing to `docs/`.
- `tsconfig.json` shared via `tsconfig.base.json` at root.

**Acceptance**: `pnpm dev` starts the Fastify server at a known port and Vite at 5173; Vite proxy forwards `/api/*` to Fastify. A placeholder React page says "Hello llama-runner" and a `GET /api/health` returns `{ ok: true }`.

---

## Phase 3 — Settings module + screen

**Scope**:

- `server/src/config/atomic.ts` — atomic write helper with per-file Promise-chain queue.
- `server/src/config/settings.ts` — read/write `settings.json` with defaults-on-missing.
- `server/src/routes/settings.ts` — `GET` + `PUT /api/settings`, validated against the schema.
- `server/src/env.ts` — resolve data-dir, ensure directory tree exists at boot.
- `web/src/routes/SettingsScreen.tsx` — form for binary path, models dir, host, port, retention limit.
- `web/src/api/settings.ts` — typed fetch wrappers.
- `web/src/stores/settings.ts` — Zustand store.

**Acceptance**: Open app, navigate to `/settings`, save values, reload app — values persist. `~/.llama-runner/settings.json` exists and is valid JSON per schema. Invalid binary path is surfaced via a validation error banner.

---

## Phase 4 — Profiles CRUD + sidebar

**Scope**:

- `server/src/config/profiles.ts` — CRUD over `profiles/<id>/profile.json`.
- `server/src/routes/profiles.ts` — list / get / create / update / delete.
- `server/src/routes/models.ts` — `GET /api/models` (listing GGUFs under `modelsDir`).
- Path-traversal validation on `modelFile`; reserved-flag validation on `args`.
- `web/src/routes/ProfileRoute.tsx` — page for `/profiles/:id` (sidebar + detail).
- `web/src/components/ProfileSidebar.tsx`, `ProfileConfigCard.tsx`, `ProfileConfigForm.tsx`.
- `web/src/stores/profiles.ts`.

**Acceptance**: Create a blank profile, save, it appears in the sidebar after reload. Edit the name, save, the sidebar label updates. Delete it — disappears. Reserved flags rejected with an inline error on the args row. Path-traversal modelFile values rejected.

---

## Phase 5 — Predefined templates + clone flow

**Scope**:

- `server/data/predefined-profiles.json` with the Gemma 4 E4B Q8_0 (Unsloth) seed template.
- `server/src/config/predefined.ts` — load + schema-validate the seed file at boot; keep in memory.
- `server/src/routes/predefined.ts` — `GET /api/profiles/predefined` + `POST /api/profiles/clone/:templateId`.
- `web/src/components/TemplateListItem.tsx` with an icon-only "Clone" button.
- Clone flow: clicks → POST → new profile → navigate to `/profiles/:newId`.

**Acceptance**: Templates section renders the Gemma template. Clicking Clone produces a new user profile with the template's args and `clonedFromTemplateId` set. Editing the cloned profile does not mutate the template.

---

## Phase 6 — Process facade (start / stop / status)

**Scope**:

- `server/src/process/llamaServer.ts` — the sole owner of `node:child_process`. Exposes `start(profile)`, `stop()`, `getStatus()`, and two events: `lineOut(stream, text)`, `exit(code, signal)`.
- Start sequence:
  1. Validate settings (binary exists, models dir readable, modelFile resolves inside models dir).
  2. Build argv: `[binary, '--model', <absolute path>, '--host', host, '--port', port, ...profile.args]`.
  3. Spawn with `{ stdio: ['ignore', 'pipe', 'pipe'] }`, no shell.
  4. Wire stdout/stderr into a line splitter (Transform stream), emit `lineOut`.
  5. Watch for `main: server is listening` line → transition status `starting → running`.
- Stop sequence: SIGTERM; after 5s grace, SIGKILL. Emit `exit`.
- `server/src/routes/server.ts` — `GET /api/server/status`, `POST /api/server/start`, `POST /api/server/stop`.
- `web/src/components/TopBar.tsx` + `StatusIndicator.tsx` + Start/Stop buttons with proper disabled states.
- `web/src/stores/server.ts`.

**Acceptance**: Starting a profile spawns `llama-server`; `ps` shows the process; `curl localhost:<port>/health` returns llama-server's health. Stopping terminates the process; `ps` no longer shows it. Starting a second profile first stops the current one.

---

## Phase 7 — SSE bus + live log streaming

**Scope**:

- `server/src/sse/bus.ts` — typed in-process event emitter.
- `server/src/sse/stream.ts` — Fastify route for `GET /api/events` that streams bus events to the client with `retry: 1000` and per-line `id:`.
- `server/src/logs/pipeline.ts` — subscribes to `llamaServer.lineOut`, emits `log.line` events on the bus AND appends to `raw.log` via the session writer.
- `server/src/sessions/writer.ts` — opens/closes `raw.log`, writes `summary.json` at start, updates at end.
- `server/src/routes/events.ts` — delegates to `sse/stream`.
- `web/src/sse/client.ts` — native `fetch` + `ReadableStream` SSE parser with exponential reconnect (1s → 30s cap). No library.
- `web/src/components/LogPanel.tsx` with virtualized render, noise toggle (default on), sticky auto-scroll.
- `web/src/stores/logs.ts`.

**Acceptance**: Start a profile, send a curl request to the server, see log lines appear in the UI within ~100ms. Toggling noise filter hides checkpoint-comparison lines. `raw.log` on disk is byte-for-byte what stdout/stderr produced (modulo stream interleaving).

---

## Phase 8 — Metrics parser

**Scope**:

- `server/src/metrics/parser.ts` — dispatcher. Pure function.
- `server/src/metrics/startup.ts`, `request.ts`, `cache.ts` — rule modules per `docs/05-metrics.md`.
- `server/src/metrics/index.test.ts` — unit tests that run the entire `llama-server.log` fixture through the parser and assert event counts + a handful of specific extracted values.
- `server/src/logs/pipeline.ts` — also feeds lines to the parser; emits `metrics.*` events on the bus; updates in-memory `SessionMetrics`.

**Acceptance**: Parser unit tests pass. Running a live session, the UI receives `metrics.startup` on listening, `metrics.request` on each completed request, `metrics.cache` on each cache update. `schemaVersion = 1` set on metrics output.

---

## Phase 9 — Stats panel

**Scope**:

- `web/src/stores/metrics.ts` — holds `SessionMetrics` for the live session; subscribes to SSE `metrics.*`.
- All cards from `docs/06-ui.md` → `StartupInfoCard`, `MemoryBudgetCard`, `TotalsCard`, `ThroughputChart`, `RecentRequestsTable`, `PromptCacheCard`, `ErrorsPanel`.
- `ThroughputChart` implemented with plain SVG or a canvas — no chart library for v1. Two-series line chart with a fixed window of last 50 points.
- `StatsPanel.tsx` composes the grid.

**Acceptance**: Start a session, fire a few requests. All cards populate. Numbers match what you'd compute manually from the raw log's timing lines. Chart updates on every new `metrics.request`.

---

## Phase 10 — Session persistence + retention

**Scope**:

- Periodic flush (every 1s while running) of in-memory `SessionMetrics` to `metrics.json` via atomic write.
- On `llamaServer.exit`: finalize `summary.json` (ended_at, exit_code, exit_signal, crashed), flush metrics, close log stream, emit `session.ended` on the bus.
- `server/src/sessions/retention.ts` — prune oldest beyond `sessionsPerProfileLimit`.
- Cascading deletion: `DELETE /api/profiles/:id` recursively removes the profile dir.

**Acceptance**: Run 25 sessions with retention = 20; only the 20 newest remain after the 25th finishes. A crashed llama-server (kill -9 the child) produces a `summary.json` with `crashed: true` and a non-null `exitSignal`. Deleting a profile removes its session directory.

---

## Phase 11 — Session history browser

**Scope**:

- `GET /api/profiles/:id/sessions` → summary list.
- `GET /api/sessions/:id` → summary + metrics.
- `GET /api/sessions/:id/log` with Range support.
- `web/src/components/SessionPicker.tsx` — dropdown above the stats panel, default "Live".
- Route `/profiles/:id/sessions/:sessionId` → stats panel renders historical metrics, log panel renders historical `raw.log`.

**Acceptance**: After running and stopping a session, it appears in the picker. Picking it renders identical stats to what was live. Range requests on `raw.log` work (used for efficient scroll-back through a large log).

---

## Phase 12 — Polish

**Scope**:

- React error boundaries around each of the three panes.
- Toast component + global error handler wired into SSE client and API helpers.
- Empty / loading / error states from `docs/06-ui.md`.
- Keyboard shortcuts from `docs/06-ui.md`.
- Accessibility pass: `aria-label` + `title` audit, focus outline styling, keyboard nav verified.
- Production build wiring: `server/` serves `web/dist/` via `@fastify/static` when `NODE_ENV=production`.
- Updated `README.md` with install + run instructions.

**Acceptance**: All Phase 12 items visibly present. `pnpm build && node server/dist/app.js` starts a single-port production server that serves the app and API. No `console.*` in app source. Manual accessibility keyboard test: can create a profile, start, stop, view a past session, all without a mouse.

---

## Cross-phase guardrails (enforced in each PR)

- New or changed JSON shapes must update `docs/03-storage.md`.
- New routes must update `docs/04-api.md` and the UI trace table.
- New parser rules must update `docs/05-metrics.md` and come with a fixture assertion.
- `CLAUDE.md` rules apply everywhere; reviewers should check especially:
  - No polling introduced.
  - No `child_process` outside `server/src/process/`.
  - No commented-out code, no debug `console.*`.
  - No new runtime dependencies without a note justifying them.
- Each phase keeps the app end-to-end demonstrable (no "half-merged" state).

## Out-of-scope for v1 (written down so we don't forget)

- Automated integration tests against a real `llama-server` binary (harder to CI).
- Windows support (paths + signal handling differ; revisit Phase 13).
- Authentication / multi-user.
- Remote deployment packaging.
- Metric export (Prometheus, OpenTelemetry).
