# 03 — Storage

## On-disk layout

All persistent state lives under a single **data directory**. Resolution order:

1. `LLAMA_RUNNER_DATA_DIR` environment variable (absolute path).
2. Default: `~/.llama-runner/` (expanded at runtime; created if missing).

```
<data-dir>/
├── settings.json                       Global app settings (see schema below)
└── profiles/
    └── <profile-id>/                   profile-id = crypto.randomUUID()
        ├── profile.json
        └── sessions/
            └── <session-id>/           session-id = ISO-8601 UTC timestamp, e.g. 2026-04-21T18-57-00Z
                ├── summary.json
                ├── raw.log             verbatim stdout + stderr (line-preserving)
                └── metrics.json        parsed structured data
```

Predefined templates are **not** stored in the data directory — they ship with the app:

```
server/data/predefined-profiles.json    Read-only seed file; edit in repo to add templates
```

## Session ID format

- UTC ISO-8601 with seconds precision.
- Colons (`:`) replaced with hyphens for cross-platform filesystem safety.
- `Z` suffix preserved.
- Example: `2026-04-21T18-57-00Z`.
- Sortable lexicographically — matches chronological order.

If two sessions would collide (same second), append `-<n>` starting from `-1`.

## Atomic-write strategy

Any write to a JSON file we care about (settings, profile, summary, metrics) follows this sequence:

1. Serialize to string, 2-space indent, trailing newline.
2. Write to `<path>.tmp` in the same directory.
3. `fsync` the temp file.
4. `rename(<path>.tmp, <path>)` — atomic on POSIX within a filesystem.
5. Best-effort `fsync` on the containing directory.

Wrapped in a per-file write queue (Promise chain keyed by path) so two concurrent callers serialize, never interleave. Implemented once in `config/atomic.ts` and reused.

`raw.log` is **appended**, not atomically rewritten — it's an append-only stream opened once per session. It does not need atomic semantics because only one writer exists per session (the process pipeline).

## Retention / pruning algorithm

Runs on every session end (normal or crash). Pseudocode:

```
prune(profileId, limit):
  sessions = list <data-dir>/profiles/<profileId>/sessions/ directories, sorted ascending by name
  while len(sessions) > limit:
    oldest = sessions.shift()
    rmdir -r <oldest>
```

- `limit` comes from `settings.json → sessionsPerProfileLimit` (default 20).
- Because session IDs are sortable timestamps, directory name sort == chronological.
- If a directory fails to delete (permissions, file in use on Windows), the prune is logged as a warning and skipped; the server continues.
- An in-progress session is never considered for pruning because it hasn't appeared in the listing yet (the dir is created at start, but the prune step runs *after* the current session is fully written and the list is re-read at that moment).

## Schemas

All schemas below are **JSON Schema Draft 2020-12**. They are both the spec and the source for Fastify route validation (see `docs/04-api.md`).

### `settings.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Settings",
  "type": "object",
  "required": [
    "llamaServerBinaryPath",
    "modelsDir",
    "llamaServerPort",
    "sessionsPerProfileLimit"
  ],
  "additionalProperties": false,
  "properties": {
    "llamaServerBinaryPath": {
      "type": "string",
      "minLength": 1,
      "description": "Absolute path to the llama-server binary."
    },
    "modelsDir": {
      "type": "string",
      "minLength": 1,
      "description": "Absolute path to the directory containing GGUF model files. Profiles reference models by filename relative to this directory."
    },
    "llamaServerHost": {
      "type": "string",
      "default": "127.0.0.1",
      "description": "Host/interface the spawned llama-server should bind to. Default is loopback-only."
    },
    "llamaServerPort": {
      "type": "integer",
      "minimum": 1,
      "maximum": 65535,
      "default": 11434,
      "description": "TCP port the spawned llama-server binds to. Only one server runs at a time, so this is shared across profiles."
    },
    "sessionsPerProfileLimit": {
      "type": "integer",
      "minimum": 1,
      "maximum": 1000,
      "default": 20,
      "description": "Max session directories retained per profile. Oldest are pruned on session end."
    },
    "uiNoiseFilterEnabledByDefault": {
      "type": "boolean",
      "default": true
    }
  }
}
```

Missing file on first run → the backend creates it from defaults and the UI redirects to the settings screen to fill in required fields (`llamaServerBinaryPath`, `modelsDir`).

### `profile.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Profile",
  "type": "object",
  "required": ["id", "name", "modelFile", "args", "createdAt", "updatedAt"],
  "additionalProperties": false,
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "description": "crypto.randomUUID(). Matches the directory name."
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 120,
      "description": "Human-readable label, shown in the sidebar."
    },
    "description": {
      "type": "string",
      "maxLength": 2000,
      "description": "Free-form notes about this profile."
    },
    "modelFile": {
      "type": "string",
      "minLength": 1,
      "description": "Filename (no path separators) of a GGUF file under settings.modelsDir. Validated to not contain '..' or path separators."
    },
    "args": {
      "type": "array",
      "description": "Additional llama-server CLI flags as an array of strings. The app injects --model, --host, --port from settings; the user must not repeat them.",
      "items": { "type": "string" }
    },
    "clonedFromTemplateId": {
      "type": "string",
      "description": "Optional. The predefined template ID this profile was cloned from. Informational only."
    },
    "createdAt": { "type": "string", "format": "date-time" },
    "updatedAt": { "type": "string", "format": "date-time" }
  }
}
```

Validation beyond the schema (enforced in the route handler):

- `modelFile` must not contain `/`, `\`, or `..` (path traversal guard).
- After resolving `<modelsDir>/<modelFile>`, the resolved absolute path must still be inside `modelsDir` (belt-and-braces).
- `args` must not include any of: `--model`, `-m`, `--host`, `--port` — these are injected. Attempting to save such a profile returns a 400 with the offending flags listed.

### `predefined-profiles.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "PredefinedProfiles",
  "type": "object",
  "required": ["version", "templates"],
  "additionalProperties": false,
  "properties": {
    "version": { "type": "integer", "minimum": 1 },
    "templates": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "name", "modelFile", "args"],
        "additionalProperties": false,
        "properties": {
          "id": { "type": "string", "pattern": "^[a-z0-9][a-z0-9-]{0,63}$" },
          "name": { "type": "string", "minLength": 1 },
          "description": { "type": "string" },
          "modelFile": { "type": "string" },
          "args": { "type": "array", "items": { "type": "string" } },
          "tags": { "type": "array", "items": { "type": "string" } }
        }
      }
    }
  }
}
```

Seed content at launch (expand as needed):

```json
{
  "version": 1,
  "templates": [
    {
      "id": "gemma-4-e4b-q8-unsloth",
      "name": "Gemma 4 E4B Q8_0 (Unsloth)",
      "description": "Unsloth's Q8_0 quantization of Gemma 4 E4B-it. Assumes the file gemma-4-E4B-it-Q8_0.gguf is present under modelsDir.",
      "modelFile": "gemma-4-E4B-it-Q8_0.gguf",
      "args": ["--ctx-size", "65536", "--n-gpu-layers", "999", "--flash-attn", "auto"],
      "tags": ["gemma", "unsloth", "q8"]
    }
  ]
}
```

### `session/summary.json`

Written twice: once at session start (without end fields), once at session end.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "SessionSummary",
  "type": "object",
  "required": ["sessionId", "profileId", "profileSnapshot", "startedAt"],
  "additionalProperties": false,
  "properties": {
    "sessionId": { "type": "string" },
    "profileId": { "type": "string", "format": "uuid" },
    "profileSnapshot": {
      "description": "Deep copy of the profile at session start. Preserved so the session remains interpretable if the profile is edited or deleted later.",
      "type": "object"
    },
    "settingsSnapshot": {
      "description": "Subset of settings that affected this run: binary path, host, port, modelsDir.",
      "type": "object"
    },
    "startedAt": { "type": "string", "format": "date-time" },
    "endedAt": { "type": "string", "format": "date-time" },
    "exitCode": {
      "type": "integer",
      "description": "Child process exit code. Negative indicates a signal."
    },
    "exitSignal": { "type": "string", "description": "e.g. 'SIGTERM', if the child was signalled." },
    "crashed": {
      "type": "boolean",
      "description": "True if the child exited without a user stop request."
    }
  }
}
```

### `session/metrics.json`

The structured form of everything parsed out of `raw.log`. See `docs/05-metrics.md` for the field-by-field source.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "SessionMetrics",
  "type": "object",
  "required": ["schemaVersion", "startup", "requests", "cache", "totals"],
  "additionalProperties": false,
  "properties": {
    "schemaVersion": { "type": "integer", "minimum": 1 },

    "startup": {
      "type": "object",
      "description": "One-time data observed during server startup.",
      "additionalProperties": false,
      "properties": {
        "buildInfo": { "type": "string" },
        "systemInfo": { "type": "string" },
        "backend": { "type": "string", "enum": ["metal", "cuda", "cpu", "rocm", "vulkan", "unknown"] },
        "deviceName": { "type": "string" },
        "deviceFreeMiB": { "type": "number" },
        "threads": { "type": "integer" },
        "simdFeatures": {
          "type": "array",
          "items": { "type": "string" }
        },
        "model": {
          "type": "object",
          "properties": {
            "path": { "type": "string" },
            "filename": { "type": "string" },
            "fileFormat": { "type": "string" },
            "fileType": { "type": "string" },
            "fileSizeGiB": { "type": "number" },
            "bpw": { "type": "number" },
            "architecture": { "type": "string" },
            "sizeLabel": { "type": "string" },
            "quantizedBy": { "type": "string" },
            "contextLengthTrained": { "type": "integer" }
          }
        },
        "context": {
          "type": "object",
          "properties": {
            "nCtx": { "type": "integer" },
            "nCtxSeq": { "type": "integer" },
            "nBatch": { "type": "integer" },
            "nUbatch": { "type": "integer" },
            "flashAttn": { "type": "string" }
          }
        },
        "kvCache": {
          "type": "object",
          "properties": {
            "primaryMiB": { "type": "number" },
            "swaMiB": { "type": "number" },
            "totalMiB": { "type": "number" },
            "computeBufferMiB": { "type": "number" }
          }
        },
        "promptCacheLimitMiB": { "type": "number" },
        "promptCacheLimitTokens": { "type": "integer" },
        "listeningUrl": { "type": "string", "description": "e.g. http://0.0.0.0:11434" }
      }
    },

    "requests": {
      "type": "array",
      "description": "Ring buffer of the last N completed requests. N defaults to 100.",
      "items": {
        "type": "object",
        "required": ["taskId", "slotId", "endpoint", "httpStatus", "completedAt"],
        "properties": {
          "taskId": { "type": "integer" },
          "slotId": { "type": "integer" },
          "endpoint": { "type": "string" },
          "clientIp": { "type": "string" },
          "httpStatus": { "type": "integer" },
          "startedAt": { "type": "string", "format": "date-time" },
          "completedAt": { "type": "string", "format": "date-time" },
          "promptTokens": { "type": "integer" },
          "generatedTokens": { "type": "integer" },
          "promptTokensPerSecond": { "type": "number" },
          "generationTokensPerSecond": { "type": "number" },
          "totalMs": { "type": "number" },
          "promptEvalMs": { "type": "number" },
          "evalMs": { "type": "number" },
          "cacheSimilarity": {
            "type": "number",
            "description": "LCP similarity score used to pick the slot. >0.1 means cache reuse."
          }
        }
      }
    },

    "cache": {
      "type": "object",
      "description": "Most-recent prompt-cache state snapshot. Updated on every cache update log event.",
      "properties": {
        "promptsStored": { "type": "integer" },
        "usedMiB": { "type": "number" },
        "limitMiB": { "type": "number" },
        "limitTokens": { "type": "integer" },
        "prompts": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "addr": { "type": "string" },
              "tokens": { "type": "integer" },
              "checkpoints": { "type": "integer" },
              "sizeMiB": { "type": "number" }
            }
          }
        },
        "updatedAt": { "type": "string", "format": "date-time" }
      }
    },

    "totals": {
      "type": "object",
      "description": "Cumulative counters since session start.",
      "properties": {
        "requests": { "type": "integer" },
        "promptTokens": { "type": "integer" },
        "generatedTokens": { "type": "integer" },
        "cacheHits": { "type": "integer", "description": "Requests with cacheSimilarity > 0.1" },
        "errors": { "type": "integer" }
      }
    },

    "errors": {
      "type": "array",
      "description": "Separately-buffered error/warning lines with timestamps.",
      "items": {
        "type": "object",
        "required": ["at", "line"],
        "properties": {
          "at": { "type": "string", "format": "date-time" },
          "severity": { "type": "string", "enum": ["warn", "error"] },
          "line": { "type": "string" }
        }
      }
    }
  }
}
```

`metrics.json` is **not** rewritten from scratch on every update. It's re-serialized and atomically replaced periodically — once per second while running, and once final on session end. The in-memory structure is the source of truth during a live session; the file is a snapshot for durability.

## Schema versioning

- `metrics.json` carries `schemaVersion`. If the parser is improved, bump the version in code. Readers compare and warn (but still try to render) if `schemaVersion` is ahead of what they know about.
- `settings.json` and `profile.json` do **not** carry a version field for v1. Per `CLAUDE.md` §10, we do not add migration shims without an agreed upgrade path. Future schema changes are deliberate breaking changes.

## Invariants (for reviewers to verify)

- Every in-flight session has exactly one writable `raw.log` stream and one in-memory metrics object.
- `metrics.json` is never partially written — replacements go through atomic rename.
- A profile's session directory is only deleted as part of the profile's own deletion (cascading), or via the retention pruner on session end.
- `settings.json` always exists; missing → defaults are written before the first route handler runs.
- No profile may have `id` clashing with an existing profile dir name.
