# 04 — API

The backend exposes a small HTTP surface plus a single SSE endpoint. All routes are prefixed `/api`. The web client is served from the same origin in production (via `@fastify/static`) and from the Vite dev server in development (with `@fastify/cors` allowing the Vite origin).

## Conventions

- **Content-Type** is `application/json` on all non-SSE routes. The SSE endpoint uses `text/event-stream`.
- **Request bodies** are validated by Fastify using the JSON Schemas in `docs/03-storage.md`. Validation failures return `400` with a `ValidationError` body.
- **Error shape** is consistent across the whole API:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "body must have required property 'modelFile'",
    "details": {
      "field": "modelFile"
    }
  }
}
```

  `code` is an upper-snake-case machine-readable token from a small, documented set:

  | Code | HTTP | Meaning |
  |---|---|---|
  | `VALIDATION_ERROR` | 400 | Request body or params failed schema validation. |
  | `NOT_FOUND` | 404 | Profile / session / template does not exist. |
  | `CONFLICT` | 409 | Server is running and the action would conflict (e.g. start while already running, delete active profile). |
  | `PRECONDITION_FAILED` | 412 | Settings incomplete (binary path or models dir missing) before a start. |
  | `RESERVED_FLAG` | 422 | `args` includes a flag the app injects (`--model`, `--port`, etc). |
  | `NOT_CONFIGURED` | 503 | App can't locate its data dir or the binary path is invalid. |
  | `INTERNAL_ERROR` | 500 | Anything unexpected. |

- **IDs**: profile IDs are UUIDs, session IDs are timestamps, template IDs are slugs.
- **Payloads are snake-less** — field names are `camelCase` to match the schemas.
- **No pagination** in v1 (list endpoints return everything; retention caps list sizes).

## Route table

### Settings

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| `GET` | `/api/settings` | — | `Settings` | Creates `settings.json` from defaults on first call if missing. |
| `PUT` | `/api/settings` | `Settings` | `Settings` | Full replace. Validates binary path exists + `modelsDir` is readable. |

### Profiles

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| `GET` | `/api/profiles` | — | `{ profiles: Profile[] }` | Sorted by `updatedAt` desc. |
| `GET` | `/api/profiles/:id` | — | `Profile` | 404 if missing. |
| `POST` | `/api/profiles` | `NewProfile` | `Profile` | `id`, `createdAt`, `updatedAt` are server-assigned. |
| `PUT` | `/api/profiles/:id` | `Profile` | `Profile` | Full replace; `id` and `createdAt` are preserved server-side. `updatedAt` bumped. 409 if it's the active profile and flags changed while running. |
| `DELETE` | `/api/profiles/:id` | — | `204` | Cascading: deletes the entire `profiles/<id>/` directory, including sessions. 409 if the profile is currently running. |
| `GET` | `/api/profiles/:id/sessions` | — | `{ sessions: SessionSummary[] }` | Lists all sessions for the profile, sorted newest first. |

`NewProfile` is `Profile` minus the server-assigned fields:

```json
{
  "name": "My Gemma setup",
  "description": "",
  "modelFile": "gemma-4-E4B-it-Q8_0.gguf",
  "args": ["--ctx-size", "65536", "--flash-attn", "auto"],
  "clonedFromTemplateId": "gemma-4-e4b-q8-unsloth"
}
```

### Predefined templates

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| `GET` | `/api/profiles/predefined` | — | `{ version: number, templates: PredefinedTemplate[] }` | Read from `server/data/predefined-profiles.json`. Cached in memory; reloaded on SIGHUP or on process restart. |
| `POST` | `/api/profiles/clone/:templateId` | `{ name?: string }` | `Profile` | Creates a new user profile from the template. `name` defaults to the template name; `args` and `modelFile` are copied; `clonedFromTemplateId` is set. |

### Model files

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| `GET` | `/api/models` | — | `{ files: string[] }` | Non-recursive listing of GGUF filenames under `settings.modelsDir`. Filters to `*.gguf`. Used by the profile form to offer a dropdown. 503 (`NOT_CONFIGURED`) if `modelsDir` is unset or unreadable. |

### Server lifecycle

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| `GET` | `/api/server/status` | — | `ServerStatus` | One-shot snapshot. Prefer subscribing via SSE for ongoing updates. |
| `POST` | `/api/server/start` | `{ profileId: string }` | `ServerStatus` | Spawns llama-server. 409 if already running. 412 if settings incomplete. 422 if profile has reserved flags. Returns immediately once the child is spawned — `status` begins as `starting` and advances to `running` once the listening log line is seen. |
| `POST` | `/api/server/stop` | — | `ServerStatus` | SIGTERM the child; 5s grace then SIGKILL. Idempotent — 200 even if already stopped. |

`ServerStatus` shape:

```json
{
  "state": "idle",
  "profileId": null,
  "sessionId": null,
  "startedAt": null,
  "pid": null,
  "listeningUrl": null
}
```

`state` ∈ `idle | starting | running | stopping | stopped | crashed`.

### Sessions

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| `GET` | `/api/sessions/:id` | — | `{ summary: SessionSummary, metrics: SessionMetrics }` | 404 if unknown. |
| `GET` | `/api/sessions/:id/log` | — | `text/plain` body | Full raw log. Supports `Range: bytes=...` for large logs. |
| `GET` | `/api/sessions/:id/log/stream` | — | `text/event-stream` | Only valid for the currently-running session. Emits historical lines then stays open for new ones. Used by the live log panel for robust first-connect (mixes catch-up with live). |

Session IDs collide across profiles conceptually (they're timestamps), but each session is stored under its profile. The server resolves `sessions/:id` by searching profiles in `updatedAt` order; if needed for performance later we'll index at boot. For v1 this scan is fine.

### Events (SSE)

| Method | Path | Response | Notes |
|---|---|---|---|
| `GET` | `/api/events` | `text/event-stream` | Single multiplexed channel. Sends all event types listed below. |

Clients subscribe once and route by event type. The server includes `retry: 1000` and supports `Last-Event-ID` for reconnection continuity on `log.line` events (each log line carries an increasing integer ID within a session; on reconnect the client can request to resume from there via a query param `?since=<id>`).

## SSE event taxonomy

Each event is a standard SSE frame: `event: <type>\ndata: <json>\n\n`.

### `server.status`

Emitted whenever `ServerStatus.state` changes.

```json
{
  "state": "running",
  "profileId": "8a3c...",
  "sessionId": "2026-04-21T18-57-00Z",
  "startedAt": "2026-04-21T18:57:00.123Z",
  "pid": 45213,
  "listeningUrl": "http://127.0.0.1:11434"
}
```

### `log.line`

Emitted once per stdout/stderr line from the child process.

```json
{
  "sessionId": "2026-04-21T18-57-00Z",
  "at": "2026-04-21T18:57:01.044Z",
  "lineId": 1284,
  "stream": "stdout",
  "noise": false,
  "text": "prompt eval time =   10062.18 ms /  2301 tokens ..."
}
```

- `lineId` monotonically increases within a session, starts at 1.
- `noise=true` when the line matches one of the known-noisy prefix patterns (see `docs/05-metrics.md`). The UI hides these by default when the noise filter is on; all lines still go to `raw.log`.

### `metrics.startup`

Emitted once per session, when the startup section has been fully parsed (i.e. on `main: server is listening`).

```json
{
  "sessionId": "2026-04-21T18-57-00Z",
  "startup": { "...": "matches SessionMetrics.startup schema" }
}
```

### `metrics.request`

Emitted once per completed request (on `slot release`).

```json
{
  "sessionId": "2026-04-21T18-57-00Z",
  "request": {
    "taskId": 57753,
    "slotId": 0,
    "endpoint": "/v1/chat/completions",
    "clientIp": "192.168.1.93",
    "httpStatus": 200,
    "startedAt": "2026-04-21T18:57:22.001Z",
    "completedAt": "2026-04-21T18:58:05.133Z",
    "promptTokens": 2301,
    "generatedTokens": 515,
    "promptTokensPerSecond": 228.68,
    "generationTokensPerSecond": 15.57,
    "promptEvalMs": 10062.18,
    "evalMs": 33069.89,
    "totalMs": 43132.07,
    "cacheSimilarity": 0.991
  },
  "totals": {
    "requests": 142,
    "promptTokens": 312456,
    "generatedTokens": 47123,
    "cacheHits": 98,
    "errors": 0
  }
}
```

### `metrics.cache`

Emitted when the prompt cache state changes (parsed from `srv update: - cache state:` + following `prompt` lines).

```json
{
  "sessionId": "2026-04-21T18-57-00Z",
  "cache": {
    "promptsStored": 6,
    "usedMiB": 4820.112,
    "limitMiB": 8192.0,
    "limitTokens": 65536,
    "prompts": [
      { "addr": "0xc071cc310", "tokens": 22037, "checkpoints": 9, "sizeMiB": 736.536 }
    ],
    "updatedAt": "2026-04-21T18:58:05.250Z"
  }
}
```

### `metrics.error`

Emitted when the parser classifies a line as a warning or error.

```json
{
  "sessionId": "2026-04-21T18-57-00Z",
  "at": "2026-04-21T18:58:05.250Z",
  "severity": "warn",
  "line": "warn: something suboptimal"
}
```

### `session.ended`

Emitted when a session finalizes (normal stop or crash).

```json
{
  "sessionId": "2026-04-21T18-57-00Z",
  "profileId": "8a3c...",
  "endedAt": "2026-04-21T19:10:22.000Z",
  "exitCode": 0,
  "exitSignal": null,
  "crashed": false
}
```

## UI-to-endpoint trace

Each UI interaction in `docs/06-ui.md` traces to one of the endpoints or events above:

| UI action | Endpoint / event |
|---|---|
| Open app, show sidebar | `GET /api/profiles` + `GET /api/profiles/predefined` + subscribe `/api/events` |
| Click a profile | `GET /api/profiles/:id` + `GET /api/profiles/:id/sessions` |
| Create profile from template | `POST /api/profiles/clone/:templateId` |
| Create blank profile | `POST /api/profiles` |
| Edit + save profile | `PUT /api/profiles/:id` |
| Delete profile | `DELETE /api/profiles/:id` |
| Click Start | `POST /api/server/start { profileId }` (UI then listens to `server.status`, `log.line`, `metrics.*` via SSE) |
| Click Stop | `POST /api/server/stop` |
| Live log panel | SSE `log.line` events (filtered client-side by `sessionId` + noise flag) |
| Live stats panel | SSE `metrics.startup`, `metrics.request`, `metrics.cache`, `metrics.error` |
| Historical session picker | `GET /api/profiles/:id/sessions` |
| View past session stats | `GET /api/sessions/:id` |
| View past session raw log | `GET /api/sessions/:id/log` (with Range) |
| Settings screen | `GET /api/settings`, `PUT /api/settings` |
