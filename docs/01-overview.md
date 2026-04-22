# 01 — Overview

## Problem

Running [`llama-server`](https://github.com/ggml-org/llama.cpp/tree/master/tools/server) (llama.cpp's OpenAI-compatible HTTP server) is powerful but flag-heavy. Switching between models or tuning contexts, batch sizes, flash-attention, sampling defaults, cache settings etc. means hunting through shell history, maintaining private shell scripts, or manually re-reading `--help`. Operators also lack an at-a-glance view of how the server is actually performing: tokens/sec, context usage, prompt-cache efficiency, and memory live only in a 3000+ line log file.

`llama-runner` is a local webapp that wraps `llama-server` with:

- **Named profiles** — persistent, editable sets of command-line flags + model references.
- **One-click start/stop** — spawn the binary for the selected profile, stop it cleanly.
- **Live log panel** — stream stdout/stderr into the UI with a noise filter.
- **Stats panel** — parse the log stream into structured performance data (tokens/sec, context usage, cache hit rate, KV/VRAM footprint, per-request timings).
- **Session history** — every run is archived on disk with both raw log and parsed metrics, so you can compare runs later.

The whole thing runs locally. No external services, no telemetry, no account. All data lives in a single data directory on disk as plain JSON / text files.

## User stories

1. **As an operator**, I want to define a profile "Gemma 4 E4B Q8_0" once, with all my preferred flags, and start the server with a click.
2. **As an operator**, I want to clone a predefined template (like "Gemma 4 E4B Q8_0 — Unsloth") into my own editable profile instead of typing flags from scratch.
3. **As an operator**, I want to see tokens-per-second split by prompt-eval and generation phases, so I can tell if context ingestion or generation is the bottleneck.
4. **As an operator**, I want to see context usage (used / configured) trending over time so I can tell when I'm about to exhaust the window.
5. **As an operator**, I want to see how much the prompt cache is helping (hit rate, MiB used of MiB limit).
6. **As an operator**, I want every run captured as a session I can come back to later — raw log for forensics, parsed metrics for comparison.
7. **As an operator**, I want to edit a profile's flags without losing past session history for that profile.
8. **As an operator**, I want to start a run with one model, stop it, switch profiles, and start again without manually managing ports or PIDs.

## Non-goals

Out of scope for v1, in rough order of "we might revisit":

- **Chat / completion UI.** The server is OpenAI-compatible; users interact with it from their own clients (curl, Continue, open-webui, custom apps). Building a chat surface is a separate product.
- **Running multiple `llama-server` instances in parallel.** One server at a time, always on the configured port. Side-by-side model comparison is not supported.
- **Benchmark runner.** No built-in "fire N prompts and plot tok/s across context sizes" tool. Stats come from whatever real traffic hits the server.
- **Model download/management.** We don't fetch models from HuggingFace, manage quantizations, or verify checksums. Users put GGUF files under `modelsDir` themselves.
- **Multi-user / auth.** The app is assumed to run on `localhost` or inside a trusted LAN. No login screen, no sessions, no RBAC.
- **Remote control.** No mobile app, no cloud. Purely a local tool.
- **Observability export.** No Prometheus, no OpenTelemetry. Metrics live in per-session JSON.
- **Quantization / model conversion.** Don't wrap `llama-quantize` or similar.
- **Prompt templating, agent harnesses, tools.** This is an infrastructure UI, not an app builder.

## Glossary

| Term | Meaning |
|---|---|
| **`llama-server`** | The binary from llama.cpp (`tools/server/`) that hosts an OpenAI-compatible HTTP API over a GGUF model. This app wraps exactly this binary. |
| **Profile** | A user-created, editable named configuration for running `llama-server`. Holds the model filename, raw CLI flags, and display metadata. Persisted as `profile.json` on disk. |
| **Predefined template** | A read-only, repo-bundled profile spec shipped in `server/data/predefined-profiles.json`. Templates can be **cloned** into editable profiles; the templates themselves are never run directly. |
| **Session** | One run of `llama-server` under a specific profile — from spawn to exit. Stored as a directory under that profile, containing the raw log, the parsed metrics, and a summary with start/end/exit-code. |
| **Session ID** | The directory name for a session. Chosen to be filesystem-safe and sortable: ISO-8601 UTC timestamp with `:` replaced by `-`, e.g. `2026-04-21T18-57-00Z`. |
| **Settings** | Global, app-wide configuration stored in `settings.json` at the root of the data directory. Holds the llama-server binary path, models directory, port, retention limit. Not profile-specific. |
| **Data directory** | The single filesystem root for all persistent state. Default `~/.llama-runner/`, overridable via `LLAMA_RUNNER_DATA_DIR`. Contains `settings.json` and `profiles/`. |
| **Metrics** | Structured data extracted by parsing `llama-server` log lines: startup info (model, context, backend), per-request timings, KV / prompt cache state. |
| **Noise filter** | A UI toggle that hides known-verbose log line prefixes (e.g. checkpoint-comparison chatter) from the live log panel. Does not affect the raw log on disk or the metrics parser. |

## Success criteria for v1

The app is "done enough" when an operator can:

1. Launch it, be guided through picking a llama-server binary and models directory on first run.
2. Browse ~3+ predefined templates, clone one, tweak flags, save as a profile.
3. Start that profile, see the server come up on the configured port, send traffic to it from an external client, and see both the raw log and the live stats panel update.
4. Stop the server, see the session appear in the session history dropdown, reopen that session later with identical metrics.
5. Start a different profile without manual cleanup of the previous one.
6. Delete a profile and see its sessions cleaned up from disk.

Everything beyond this is polish or non-goal.
