# 05 — Metrics

This is the load-bearing document for the parser. Every metric has:

- **Source pattern** — the exact log line shape, with a real example from the committed fixture `llama-server.log`.
- **Parser rule** — how to extract it. Deterministic, single-pass, line-by-line.
- **Emitted event** — which SSE event type carries it (defined in `docs/04-api.md`).
- **Target field** — where it lands in `SessionMetrics` (see `docs/03-storage.md`).
- **UI surface** — where the user sees it (components defined in `docs/06-ui.md`).

## Parser design

The parser is a pure function:

```
parseLine(line: string, state: ParserState) → { events: ParserEvent[], nextState }
```

`ParserState` tracks:

- `phase`: `startup` | `runtime` (transitions to `runtime` on `main: server is listening`).
- `currentTask`: task-id-keyed map of in-flight request state (started-at, prompt tokens so far).
- `pendingRequest`: the "under construction" request being assembled from a print_timing block.
- `lineCount`: monotonically increasing per session, for `lineId` on `log.line` events.

Unknown lines become `log.line` events with no metric extraction; they are never treated as errors. Known-noisy prefix lines are still emitted as `log.line` but with `noise: true`.

## Noise filter prefixes

Lines whose text matches any of these substring patterns get `noise: true`:

- `Checking checkpoint with `
- `erased invalidated context checkpoint`
- `created context checkpoint `
- `restored context checkpoint `
- `tokens since last checkpoint at `
- `prompt processing progress, n_tokens = `
- `n_tokens = ` followed by ` memory_seq_rm `
- `srv        update:    - prompt 0x` (individual prompt cache entries — still parsed, but the line itself is noisy)

These are hidden from the live log view by default. The raw log on disk keeps them. Every noisy line is still offered to the relevant metric parsers (several of them live inside these lines).

## Startup-section metrics

All emitted as a single `metrics.startup` event once the listening line appears.

### Build info

- **Source**: `build_info: b8680-15f786e65` (fixture line 22)
- **Rule**: match `^build_info: (.+)$` → `startup.buildInfo = capture`.

### System info / threads / SIMD

- **Source**: `system_info: n_threads = 4 (n_threads_batch = 4) / 10 | MTL : EMBED_LIBRARY = 1 | CPU : NEON = 1 | ARM_FMA = 1 | FP16_VA = 1 | ...` (fixture line 23)
- **Rule**: match `^system_info: (.*)$` → `startup.systemInfo = full line after prefix`. Additionally:
  - Extract `n_threads = (\d+)` → `startup.threads`.
  - Extract the pipe-delimited flags (e.g. `NEON = 1`, `ACCELERATE = 1`) → `startup.simdFeatures` as `["NEON", "ARM_FMA", "FP16_VA", ...]` (any key with `= 1`).

### Backend / device / free VRAM

- **Source A** (Metal): `llama_model_load_from_file_impl: using device MTL0 (Apple M4) (unknown id) - 12123 MiB free` (fixture line 34)
- **Source B** (CUDA, expected): `llama_model_load_from_file_impl: using device CUDA0 (NVIDIA GeForce RTX 4090) - NNNNN MiB free`
- **Rule**: match `using device (\S+) \(([^)]+)\).*?(\d+) MiB free`.
  - Device token prefix → `startup.backend`:
    - `MTL*` → `metal`
    - `CUDA*` → `cuda`
    - `ROCM*` → `rocm`
    - `Vulkan*` → `vulkan`
    - else → `unknown` (and also `cpu` if no such line is ever emitted this session)
  - 2nd capture → `startup.deviceName`.
  - 3rd capture → `startup.deviceFreeMiB` (integer).
- **CPU-only case**: if no `using device` line appears before the listening line, set `backend = "cpu"` and leave device fields undefined.

### Model metadata

- **Source — path**: `srv    load_model: loading model '/Users/acdtrx/.cache/.../gemma-4-E4B-it-Q8_0.gguf'` (fixture line 28)
  - Rule: match `load_model: loading model '([^']+)'` → `startup.model.path`; `startup.model.filename = basename(path)`.
- **Source — file format**: `print_info: file format = GGUF V3 (latest)` (fixture line 96)
  - Rule: `^print_info: file format\s*=\s*(.+)$` → `startup.model.fileFormat`.
- **Source — file type / quantization**: `print_info: file type   = Q8_0` (fixture line 97)
  - Rule: `^print_info: file type\s*=\s*(\S+)$` → `startup.model.fileType`.
- **Source — file size + BPW**: `print_info: file size   = 7.62 GiB (8.70 BPW)` (fixture line 98)
  - Rule: `^print_info: file size\s*=\s*([\d.]+)\s*GiB\s*\(([\d.]+)\s*BPW\)` → `startup.model.fileSizeGiB`, `startup.model.bpw`.
- **Source — architecture**: `print_info: arch                  = gemma4` (fixture line 108)
  - Rule: `^print_info: arch\s*=\s*(\S+)$` → `startup.model.architecture`.
- **Source — trained context length**: `print_info: n_ctx_train           = 131072` (fixture line 111)
  - Rule: `^print_info: n_ctx_train\s*=\s*(\d+)` → `startup.model.contextLengthTrained`.
- **Source — size label / quantized_by** (from GGUF KV block):
  - `general.size_label str = 7.5B` (fixture line 45) → `startup.model.sizeLabel`.
  - `general.quantized_by str = Unsloth` (fixture line 44) → `startup.model.quantizedBy`.
  - Rule: these appear in the `llama_model_loader: - kv N: <key> <type> = <value>` block. Match `-\s+kv\s+\d+:\s+(\S+)\s+\S+\s+=\s+(.+?)\s*$` and pick out known keys.

### Context configuration

- **Source**: lines 180–185 of fixture:
  ```
  llama_context: n_ctx         = 65536
  llama_context: n_ctx_seq     = 65536
  llama_context: n_batch       = 2048
  llama_context: n_ubatch      = 512
  llama_context: flash_attn    = auto
  ```
- **Rule**: for each `^llama_context:\s+(\S+)\s+=\s+(\S+)$` where key ∈ {`n_ctx`, `n_ctx_seq`, `n_batch`, `n_ubatch`, `flash_attn`}, assign to `startup.context.<camelCase>`.

### KV cache

- **Source**:
  - `llama_kv_cache:       MTL0 KV buffer size =  1024.00 MiB` (fixture line 198) → primary cache on device.
  - `llama_kv_cache:       MTL0 KV buffer size =    40.00 MiB` (fixture line 203) → SWA cache.
- **Rule**: match `^llama_kv_cache:\s+\S+\s+KV buffer size\s*=\s*([\d.]+)\s*MiB`. The first such line is the primary KV cache (`startup.kvCache.primaryMiB`). The second (preceded by `llama_kv_cache_iswa: creating     SWA KV cache`) is SWA (`startup.kvCache.swaMiB`). Compute `totalMiB = primaryMiB + swaMiB`.

### Compute buffer

- **Source**: `sched_reserve:       MTL0 compute buffer size =   517.50 MiB` (fixture line 212)
- **Rule**: sum all `compute buffer size = X MiB` values across the startup section → `startup.kvCache.computeBufferMiB`.

### Prompt cache limits

- **Source**: `srv    load_model: prompt cache is enabled, size limit: 8192 MiB` (fixture line 264) and from the first `srv update: - cache state:` line (fixture line 288):
  `srv        update:  - cache state: 0 prompts, 0.000 MiB (limits: 8192.000 MiB, 65536 tokens, 8589934592 est)`
- **Rule**: capture `limits: ([\d.]+) MiB,\s*(\d+)\s*tokens` → `startup.promptCacheLimitMiB`, `startup.promptCacheLimitTokens`.

### Listening URL

- **Source**: `main: server is listening on http://0.0.0.0:11434` (fixture line 281)
- **Rule**: match `^main: server is listening on (\S+)$` → `startup.listeningUrl`. **This is also the transition signal**: parser state advances from `startup` → `runtime`, and `metrics.startup` is emitted, and `server.status` transitions `starting → running`.

## Per-request metrics

Each completed request emits one `metrics.request` event and appends one entry to `SessionMetrics.requests` (ring buffer, cap N = 100 configurable).

The per-request state machine:

1. **Launch** — `slot launch_slot_: id  0 | task 58271 | processing task, is_child = 0` (fixture line 1623)
   - Rule: `^slot launch_slot_:\s+id\s+(\d+)\s+\|\s+task\s+(\d+)\s+\|\s+processing task` → start tracking request `(slotId, taskId)` with `startedAt = now()`.
   - The `task -1` variant is the sampler-chain debug print and is ignored for this purpose.

2. **LCP similarity (optional)** — `slot get_availabl: id  0 | task -1 | selected slot by LCP similarity, sim_best = 0.991 (> 0.100 thold), f_keep = 0.999` (fixture line 1701)
   - Rule: match `selected slot by LCP similarity, sim_best = ([\d.]+)` → attach to the **next** launched task on the same slot as `cacheSimilarity`.
   - The alternative `selected slot by LRU, t_last = ...` variant → `cacheSimilarity = 0` (no similarity-based reuse).

3. **Prompt tokens (hint)** — `slot update_slots: id  0 | task 58271 | new prompt, n_ctx_slot = 65536, n_keep = 0, task.n_tokens = 23087` (fixture line 1624)
   - Rule: `task\.n_tokens\s*=\s*(\d+)` → tentative prompt token estimate (overwritten by the authoritative print_timing value later).

4. **HTTP response** — `srv  log_server_r: done request: POST /v1/chat/completions 192.168.1.93 200` (fixture line 1693)
   - Rule: `^srv\s+log_server_r: done request:\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+)$` → `endpoint, clientIp, clientIp-or-path, httpStatus`. (Note: the penultimate field is the client IP and the format may include an unused token; handle gracefully.)
   - Attach to the most-recent in-flight task on the matching slot.

5. **Print timings** — the authoritative numbers. Appear as a 4-line block after `slot print_timing`:

   ```
   slot print_timing: id  0 | task 58271 |
   prompt eval time =   75511.03 ms / 21765 tokens (    3.47 ms per token,   288.24 tokens per second)
          eval time =   12450.28 ms /   206 tokens (   60.44 ms per token,    16.55 tokens per second)
         total time =   87961.31 ms / 21971 tokens
   ```

   (fixture lines 1694–1697)

   - Rule — line 2: `^prompt eval time\s*=\s*([\d.]+)\s*ms\s*/\s*(\d+)\s+tokens\s*\(\s*[\d.]+ ms per token,\s*([\d.]+)\s*tokens per second\)` → `promptEvalMs`, `promptTokens`, `promptTokensPerSecond`.
   - Rule — line 3: `^\s*eval time\s*=\s*([\d.]+)\s*ms\s*/\s*(\d+)\s+tokens\s*\(\s*[\d.]+ ms per token,\s*([\d.]+)\s*tokens per second\)` → `evalMs`, `generatedTokens`, `generationTokensPerSecond`.
   - Rule — line 4: `^\s*total time\s*=\s*([\d.]+)\s*ms` → `totalMs`.
   - The `slot print_timing` header line itself is ignored (just a marker).

6. **Release** — `slot      release: id  0 | task 58271 | stop processing: n_tokens = 23292, truncated = 0` (fixture line 1698)
   - Rule: `^slot\s+release:\s+id\s+(\d+)\s+\|\s+task\s+(\d+).*?n_tokens\s*=\s*(\d+).*?truncated\s*=\s*(\d+)` → finalize request with `completedAt = now()`, add to ring buffer, emit `metrics.request`, update `totals`.
   - `n_tokens` at release is the final total context occupancy after this request (used for context-usage timeline).

## Prompt cache metrics

Emitted as a single `metrics.cache` event per cache-update cycle.

- **Trigger line**: `srv  get_availabl: updating prompt cache` (fixture line 1611) — starts buffering a cache update.
- **Summary line**: `srv        update:  - cache state: 6 prompts, 4820.112 MiB (limits: 8192.000 MiB, 65536 tokens, 216744 est)` (fixture line 1614)
  - Rule: `cache state:\s*(\d+)\s*prompts,\s*([\d.]+)\s*MiB\s*\(limits:\s*([\d.]+)\s*MiB,\s*(\d+)\s*tokens` → `promptsStored`, `usedMiB`, `limitMiB`, `limitTokens`.
- **Per-prompt lines**: `srv        update:    - prompt 0xc071cc310:   22037 tokens, checkpoints:  9,   736.536 MiB` (fixture line 1615)
  - Rule: `-\s+prompt\s+(0x[0-9a-f]+):\s+(\d+)\s+tokens,\s+checkpoints:\s+(\d+),\s+([\d.]+)\s+MiB` → append `{ addr, tokens, checkpoints, sizeMiB }` to `cache.prompts` for this update.
- **End-of-update line**: `srv  get_availabl: prompt cache update took 448.43 ms` (fixture line 1621) → emit the collected `metrics.cache` event, set `cache.updatedAt = now()`.

## Errors and warnings

- **Rule**: any line matching `/(^|\s)(error|warn|warning|panic|abort)[\s:]/i` (case-insensitive) is emitted as a `metrics.error` event AND appended to `SessionMetrics.errors`.
  - `severity = "error"` for `error | panic | abort`.
  - `severity = "warn"` otherwise.
- The committed fixture happens to contain zero matches — this is a real-world case, not a bug. The parser still ships with the rule.
- **Exclusions**: lines that match this pattern but are part of the startup metadata dump (e.g. a literal `token_type` value containing the word "error") must be excluded. Practical filter: only apply this classifier when `ParserState.phase === 'runtime'` OR when the line starts with `error:` / `warn:`.

## Derived views (UI only — not in metrics.json)

These are computed on-the-fly by the UI from the raw `requests` ring buffer + streamed `metrics.request` events. They are **not** materialized on disk; re-deriving from `requests` is cheap.

| View | Derivation |
|---|---|
| Throughput timeline | Plot `generationTokensPerSecond` and `promptTokensPerSecond` against `completedAt` for the last N requests. |
| Context-usage timeline | Plot `release: n_tokens` against `completedAt` relative to `startup.context.nCtx`. (Captured into request ring buffer as `finalNTokens`.) |
| Cache hit rate | `totals.cacheHits / totals.requests` as a percentage. |
| Generation tok/s histogram | Bin `generationTokensPerSecond` across the last N requests. |
| Cache memory usage | Gauge: `cache.usedMiB` / `cache.limitMiB`. |
| VRAM headroom | Gauge: `startup.deviceFreeMiB` at session start vs model + KV cache + compute buffer sums. |

## UI surface — metric to component map

| Metric bucket | Component | Presentation |
|---|---|---|
| `startup.model.*` | `StartupInfoCard` | Key-value grid: filename, quantization, file size, architecture, trained context. |
| `startup.backend` / `deviceName` / `deviceFreeMiB` / `threads` | `StartupInfoCard` | Same card, device group. |
| `startup.context.*` | `StartupInfoCard` | Same card, context group. |
| `startup.kvCache.*` + `startup.promptCacheLimit*` | `MemoryBudgetCard` | Stacked bar of (model file · primary KV · SWA KV · compute buf · prompt cache limit). |
| `totals.*` | `TotalsCard` | Big-number tiles: requests served, prompt tokens, generated tokens, cache hits %, errors. |
| `requests[]` | `ThroughputChart` + `RecentRequestsTable` | Line chart (tok/s, two series). Paginated table beneath it with last 100 requests. |
| `cache.*` | `PromptCacheCard` | Gauge + per-prompt breakdown. |
| `errors[]` | `ErrorsPanel` | Timestamped list with severity color. |

All dashboards render identically in live mode (current session) and historical mode (viewing a past `metrics.json`) — the components don't care whether data arrives via SSE or fetch.

## Test fixture

`llama-server.log` (3339 lines, committed at repo root) is the canonical parser test fixture. The parser test suite must:

1. Consume the file line by line.
2. Produce exactly one `metrics.startup` event (at the listening line).
3. Produce `metrics.request` events for every complete `print_timing` block followed by a `release` line.
4. Produce `metrics.cache` events for every `prompt cache update took` line.
5. Produce zero `metrics.error` events (fixture is clean).
6. Classify the expected fraction of lines as `noise: true`. Target: ≥ 60% noise on this fixture.

Any future change to the parser must leave the number of emitted events stable on this fixture (regression guard).
