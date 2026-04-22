# llama-runner

Local webapp that wraps [llama.cpp's](https://github.com/ggml-org/llama.cpp) `llama-server` with named profiles, live stats, and session history.

Create a profile for a specific model + flag set, start/stop the server with one click, watch its logs and parsed performance metrics live, and keep every run archived on disk for later inspection.

## Requirements

- **Node.js 24+** (see `.nvmrc`)
- A `llama-server` binary built from llama.cpp — set its path in the app settings on first run
- A directory of GGUF model files — referenced by profiles

## Quick start

```
git clone <this repo>
cd llama-runner
npm install
npm run dev
```

- API: <http://localhost:3030>
- Web:  <http://localhost:5173> (Vite proxies `/api/*` to the API)

Open the web URL. On first run you'll be guided to set the binary path and models directory. After that you can either clone a predefined template (e.g. *Gemma 4 E4B Q8_0 (Unsloth)*) or create a blank profile from scratch.

## Production build

```
npm run build
npm start
```

This builds both workspaces, sets `NODE_ENV=production`, and starts the API **on a single port** (default 3030) serving the built frontend from `web/dist/`. Open <http://localhost:3030>.

Env overrides:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3030` | Port the HTTP server binds to |
| `HOST` | `127.0.0.1` | Interface the HTTP server binds to |
| `LLAMA_RUNNER_DATA_DIR` | `~/.llama-runner` | Root directory for all persistent state |
| `WEB_DIST` | auto-detected | Override the path to the built frontend |
| `WEB_ORIGIN` | dev-only | CORS origin allowed during dev; unset in production |
| `LOG_LEVEL` | `info` | Fastify logger level |

## Data on disk

```
~/.llama-runner/
├── settings.json                     global config
└── profiles/
    └── <profile-id>/
        ├── profile.json
        └── sessions/
            └── <iso-timestamp>/      session directory
                ├── summary.json      start/end/exit status + profile snapshot
                ├── raw.log           verbatim stdout + stderr
                └── metrics.json      parsed metrics (schema v1)
```

Retention is per-profile (default 20 most recent sessions). Deleting a profile cascades to its sessions.

## Keyboard shortcuts

- `Esc` — cancel the current form
- `⌘/Ctrl + Enter` — save the current form
- `.` — toggle the log noise filter

## Testing

```
npm test --workspace server
```

Runs the parser unit tests against the committed `llama-server.log` fixture.

## Docs

The spec lives under [`docs/`](./docs):

- [`01-overview.md`](./docs/01-overview.md) — problem statement, user stories, non-goals
- [`02-architecture.md`](./docs/02-architecture.md) — module layout and data flow
- [`03-storage.md`](./docs/03-storage.md) — on-disk layout + JSON schemas
- [`04-api.md`](./docs/04-api.md) — HTTP + SSE contract
- [`05-metrics.md`](./docs/05-metrics.md) — log-parser rules per metric
- [`06-ui.md`](./docs/06-ui.md) — UI layout
- [`07-build-plan.md`](./docs/07-build-plan.md) — phased implementation plan

Coding rules: [`CLAUDE.md`](./CLAUDE.md). Tech stack: [`TECHSTACK.md`](./TECHSTACK.md).
