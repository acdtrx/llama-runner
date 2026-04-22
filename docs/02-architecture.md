# 02 — Architecture

## Repository layout

```
llama-runner/
├── server/                     Backend (Node 24+, Fastify 5)
│   ├── src/
│   │   ├── app.ts              Fastify bootstrap + plugin wiring + route registration
│   │   ├── env.ts              Read env vars, resolve data-dir, boot-time sanity checks
│   │   ├── config/             settings.json + profile I/O
│   │   │   ├── settings.ts         read/write settings.json (atomic, locked)
│   │   │   ├── profiles.ts         CRUD over profiles/<id>/profile.json
│   │   │   └── predefined.ts       load+cache server/data/predefined-profiles.json
│   │   ├── process/            SINGLE facade over llama-server
│   │   │   └── llamaServer.ts      spawn/stop/status; owns child process + stdio
│   │   ├── sessions/           Per-session dir layout + retention pruning
│   │   │   ├── writer.ts           append to raw.log; flush metrics.json; summary.json on end
│   │   │   └── retention.ts        prune oldest sessions beyond limit
│   │   ├── logs/               Plumbing from process stdio to consumers
│   │   │   └── pipeline.ts         reads stdout/stderr → fans out to writer + parser + SSE bus
│   │   ├── metrics/            Pure parser (log line → typed event)
│   │   │   ├── parser.ts           top-level dispatcher
│   │   │   ├── startup.ts          startup-section rules (model/device/context/kv)
│   │   │   ├── request.ts          per-request rules (timings, http response)
│   │   │   └── cache.ts            prompt-cache state rules
│   │   ├── sse/                Push channel
│   │   │   ├── bus.ts              in-process event bus
│   │   │   └── stream.ts           Fastify SSE handler (GET /api/events)
│   │   └── routes/             HTTP endpoints — one file per resource
│   │       ├── settings.ts
│   │       ├── profiles.ts
│   │       ├── predefined.ts
│   │       ├── server.ts
│   │       ├── sessions.ts
│   │       └── events.ts           SSE endpoint (delegates to sse/stream.ts)
│   ├── data/
│   │   └── predefined-profiles.json
│   └── package.json
├── web/                        Frontend (React 19, Vite 8, Tailwind 4)
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx                 layout shell, error boundaries, router
│   │   ├── routes/                 page-level components (one profile view, settings view)
│   │   ├── components/             reused UI (ProfileList, ProfileConfig, StatsPanel, LogPanel, ...)
│   │   ├── stores/                 Zustand slices (settings, profiles, server, metrics, logs)
│   │   ├── sse/                    EventSource client with exponential reconnect
│   │   └── api/                    typed fetch helpers, one per resource
│   ├── index.html
│   └── package.json
├── docs/                       These specification documents
├── CLAUDE.md
├── TECHSTACK.md
└── README.md                   (written last, in build phase 11)
```

## Backend module boundaries

Rules enforced across modules:

- **One facade per external system.** `server/src/process/llamaServer.ts` is the **only** module that imports `node:child_process`, spawns `llama-server`, or touches the child's stdio. Everything else talks to it via a small API (`start`, `stop`, `getStatus`, `onLogLine`, `onExit`).
- **Config is disk-backed and serialized.** `config/settings.ts` and `config/profiles.ts` are the only modules that write to their respective JSON files. All writes go through an in-process write queue per-file so concurrent HTTP requests can't interleave a read-modify-write. Writes are atomic: write to `<path>.tmp`, `fsync`, rename.
- **Pure parser.** `metrics/` is purely functional: `(line: string, parserState) => events[]`. No I/O, no side effects. This makes the parser unit-testable against the committed `llama-server.log` fixture and re-runnable over any `raw.log` to regenerate `metrics.json`.
- **One SSE bus.** `sse/bus.ts` is the single in-process event bus. `process/`, `logs/`, `metrics/`, and `sessions/` emit onto it; `sse/stream.ts` subscribes and broadcasts to connected clients. Nothing else in the app pushes SSE.
- **No polling.** Clients subscribe once to `/api/events` and receive updates via SSE. One-time `GET`s (list profiles, read a session's metrics) are acceptable for static/historical reads.

## Frontend module boundaries

- **State lives in Zustand stores, one per domain** (`useSettingsStore`, `useProfilesStore`, `useServerStore`, `useMetricsStore`, `useLogsStore`). UI components are mostly pure; they read from stores and call typed `api/` helpers.
- **A single SSE client** (`sse/client.ts`) wraps `fetch` + `ReadableStream` parsing — per the project's TECHSTACK rule of no SSE libraries. It connects once and dispatches events into the relevant stores by `event` field.
- **Exponential reconnect** is baked into the SSE client. Reconnect attempts use a bounded backoff (e.g. 1s, 2s, 4s, 8s, 16s, cap 30s). A user-triggered disconnect (navigating away) must not trigger reconnect.
- **Error boundaries** wrap each of the three main panes (profile config / stats / logs) so one pane crashing does not blank the app.
- **One component per file**, colocated styles via Tailwind utilities, no CSS-in-JS. Forms init from a model shape, not empty objects (per `CLAUDE.md` §8).

## Core data-flow sequences

### 1. Start server

```
UI Start button
  → POST /api/server/start { profileId }
  → routes/server.ts → process/llamaServer.start(profileId)
       - reads profile.json via config/profiles
       - reads settings.json via config/settings
       - creates new session dir via sessions/writer (summary.json with started_at, profile snapshot)
       - spawns child process, pipes stdout+stderr into logs/pipeline
       - emits server.status=starting then =running on sse/bus
  → logs/pipeline (per line):
       - appends to session raw.log
       - passes to metrics/parser → events
       - emits log.line event on sse/bus
       - emits metrics.* events on sse/bus (and updates in-memory session metrics buffer)
  → periodic (every ~1s while running): flush metrics buffer to session metrics.json
  → sse/stream broadcasts server.status + log.line + metrics.* to all connected clients
```

### 2. Stop server

```
UI Stop button
  → POST /api/server/stop
  → routes/server.ts → process/llamaServer.stop()
       - emits server.status=stopping
       - SIGTERM child; after grace period SIGKILL if needed
  → on child exit:
       - flush remaining metrics buffer to metrics.json
       - close raw.log stream
       - sessions/writer.finalize: update summary.json with ended_at + exit_code
       - sessions/retention.prune(profileId, limit) — deletes oldest dirs beyond limit
       - emits server.status=stopped and session.ended on sse/bus
```

### 3. Crash handling

If the child process exits without a user stop request, the flow is the same as stop from the `on child exit` step — `exit_code` captures the signal or code, `summary.json.crashed = true` is set. The UI shows "crashed, see log".

### 4. View historical session

```
UI picks a session from the dropdown
  → GET /api/sessions/:id
       - reads summary.json + metrics.json from disk
  → UI renders stats panel in read-only mode
  → UI separately fetches raw.log on demand (GET /api/sessions/:id/log, with Range support for large logs)
```

## How `CLAUDE.md` rules shape this design

Numbered by the rule section they enforce:

- **§1 Naming.** No generic `doAction`/`handle`. Module exports use purpose-named verbs: `startServer`, `stopServer`, `getServerStatus`, `createProfile`, `cloneTemplate`, `pruneOldSessions`, `parseLogLine`.
- **§2 No duplication.** The parser is one module (not duplicated per-call-site). The SSE bus is a single instance. Atomic-write logic lives once in a `config/atomic.ts` helper used by both `settings.ts` and `profiles.ts`.
- **§3 Minimal dependencies.** Backend: Fastify only (+ `@fastify/cors`, `@fastify/static`). No `pm2`, no `execa`, no process-manager library — `node:child_process` is the platform API. No log library — Fastify's built-in logger suffices. No UUID library — `crypto.randomUUID()` for profile IDs.
- **§4 Structured data parsing.** Never regex-parse JSON. All `profile.json`, `settings.json`, `predefined-profiles.json` reads go through `JSON.parse`. (Log lines ARE line-based text so regex is appropriate there — but the output is typed objects, not strings.)
- **§5 Error handling.** Errors at HTTP boundary follow a consistent shape: `{ error: { code, message, details? } }`. See `docs/04-api.md` for the exact shape. Silent `catch {}` is forbidden except with a comment explaining why (e.g. log-line parser swallowing unknown formats to `unknown` events).
- **§6 Async / timing.** Never use `sleep` to wait for `llama-server` startup — instead watch stdout for `main: server is listening on` (see `docs/05-metrics.md`) and emit `server.status=running` when that line appears. All writes to `settings.json` / `profile.json` / `metrics.json` are serialized per-file through a Promise-chain queue. SSE client reconnects with exponential backoff on unexpected disconnect, not on user-triggered close. Stdout/stderr is streamed (not buffered) from the child to disk and the parser.
- **§7 Architecture boundaries.** `process/llamaServer.ts` is the sole consumer of `child_process.spawn`. All other modules call its API. The server is the source of truth for state (never localStorage). Live data is SSE, not polling.
- **§8 Frontend.** Three React error boundaries. Forms initialise from a fully-typed profile shape with `createDefaultProfile()`. Effects depend on stable primitive IDs, not object refs. Callbacks passed to effects are `useCallback`'d.
- **§9 Security.** `llama-server` is invoked with array-form args (no shell). Inputs that feed into arg arrays (flags list, file paths) are validated server-side at the API boundary via Fastify schemas. No secrets are passed as CLI args (llama-server doesn't require any; HF token support can be deferred or passed via env).
- **§10 Code quality.** No `console.log` in app code — Fastify's logger covers backend; the web app uses store-level error state (not `console`). No commented-out code, no migration shims.
- **§11 Code style.** Early returns, import ordering (stdlib → 3p → project), one component per file, `const` by default.
