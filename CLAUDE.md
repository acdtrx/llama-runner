# General Coding Rules

Technology-agnostic principles for writing code. These rules apply to any contributor or coding agent working on a codebase.

---

## 1. Naming and Semantics

- Functions, files, and modules are named for their purpose and domain, not for the underlying mechanism or API they call.
- No generic action dispatchers (e.g. `performAction(name, action)`). Each operation gets its own purpose-named function.
- Avoid vague names like `doAction`, `update`, `handle`. Be specific: `executeDiskOperation`, `updateField`, `validateInput`.

## 2. No Code Duplication

- If a UI element appears in more than one place, extract it into a shared component.
- If backend logic is used in more than one place, extract it into a library/utility module.
- Shared utilities live in dedicated modules; never copy-paste the same helper into multiple files.
- When two views share structure, parameterise a single component (e.g. via a mode/flag prop) instead of building two separate ones.

## 3. Minimal External Dependencies

- Do not add a library for functionality that can be implemented as a small function or that the platform already provides.
- Prefer platform built-ins over third-party equivalents.
- Use maintained, non-deprecated packages. When a package is deprecated, migrate to its successor.
- Only add dependencies that are **actively maintained** (recent releases within roughly 12 months, responsive to security issues). Do not add abandoned or unmaintained packages.
- No CDN-loaded assets. All JavaScript, CSS, and fonts must be bundled or use system defaults.
- **Code-splitting:** Keep the initial bundle small by splitting large features or rarely used surfaces (for example lazy-loaded routes or screens, or modules loaded only when a feature is opened). Use whatever mechanism your stack supports (dynamic `import()`, lazy route components, async component boundaries). Choose split points that measurably reduce what a typical session loads up front.

## 4. Structured Data Parsing

- Never parse structured formats (XML, JSON, YAML, HTML, etc.) with regular expressions. Use a dedicated parser.
- When modifying a parsed document, extract the existing element and mutate it rather than constructing a replacement from scratch.

## 5. Error Handling

- Every async function returns a Promise. Errors are thrown as structured objects with at minimum a code and a human-readable message.
- API responses on failure use a consistent shape across the entire application (both HTTP and streaming channels).
- Prefer inspecting state up front and choosing the right path once, rather than try/catch/retry as control flow.
- Every silent `catch {}` block must have a comment explaining why the error is intentionally swallowed.
- At HTTP and route boundaries, prefer centralized error utilities and documented response shapes over ad hoc error objects.

## 6. Async Patterns and Timing

- Never use `sleep` or timer delays to work around race conditions. Use event signals, or retry with exponential backoff.
- Timers used for **scheduling** (periodic SSE pushes, reconnect backoff, TTL cleanup, cron-like checks) are allowed; they must not substitute for waiting on the correct readiness signal.
- **SSE / WebSocket clients** that must stay connected should automatically reconnect with exponential backoff when the connection drops unexpectedly (not when the client intentionally aborts).
- Read–modify–write sequences on shared files or durable state must be **serialized** (queue, lock, or atomic write) so concurrent requests cannot interleave and lose updates.
- Use `AbortController` for cancellable operations instead of boolean flags.
- Prefer streaming over buffering: pipe data through transform streams instead of reading an entire payload into memory and then writing it out.

## 7. Architecture Boundaries

- External system integrations (databases, APIs, system daemons) are accessed through a single dedicated module. No other module imports the client library directly.
- Prefer native/API access over shelling out to CLI tools. Only exec a binary when there is no practical programmatic alternative, and confirm with the team first.
- The server is the source of truth for persistent data. Do not store authoritative state in the client (e.g. browser localStorage).
- **Live data via server-push:** Use Server-Sent Events, WebSockets, or an equivalent push channel for data that updates over time in a way the user should see without refreshing. Do not meet that need with repeated polling GET requests. One-time GET is appropriate for static snapshots, configuration, or other on-demand reads.

## 8. Frontend Patterns

- Wrap the application (or major regions) in at least one **React error boundary** so a single component failure does not blank the entire UI. Sections with independent failure modes should have their own boundaries where practical.
- Initialise form/component state with meaningful defaults derived from the data model. Never initialise with an empty object and hope for the best.
- Effect dependencies must be stable: depend on primitive values or serialised representations, not on object references that change identity every render.
- Memoise callbacks that are passed to effects or child components to prevent unnecessary re-executions.
- Do not reimplement functionality that the framework already provides. If something seems missing, investigate the framework first.
- **Lists and tables:** Persist per row (one mutation per save/delete/action where the model is row-shaped). Row actions are **icon-only** with `title`/`aria-label`.
- Avoid replacing entire collections from the client when the user works row-by-row, unless the API is explicitly a single replace endpoint and that contract is documented; prefer splitting the API into purpose-named per-row (or per-entity) operations.

## 9. Security

- Pass secrets to subprocesses via stdin or environment variables, never as command-line arguments (visible in process lists).
- Sanitise subprocess error output before exposing it to clients (e.g. mask credentials).
- Validate and sanitise all user input at the API boundary. Internal library functions may assume valid input.
- Rate-limit authentication and other sensitive endpoints.
- Block requests to private/loopback addresses when the URL originates from user input (SSRF protection).

## 10. Code Quality

- Do not add debug code to the application: no ad-hoc `console.`* traces, `debugger` statements, commented “turn this on to debug” blocks, or environment-gated diagnostic logging in app source. Investigate behavior with tests, the framework’s normal logging where already wired, or external tools—not permanent debug prints in the repo.
- Remove all debug logging before committing.
- Fix root causes, not symptoms. Do not add workaround scripts to patch over underlying bugs.
- Do not suppress linter or typechecker warnings without a **short comment** explaining why the warning is a false positive or why the exception is intentional.
- Do not add data migration code, backward-compatibility shims, or legacy format fallbacks unless explicitly agreed for a supported upgrade path. Prefer updating readers/writers to the current format only.
- When a module grows large, split it by domain of functionality, not arbitrarily.
- If a helper is small and used in only one file, keep it inline. Do not create a module for every three-line function.
- No commented-out code in the repository. Use version control history to recover old code.
- When adding a new subsystem that **coexists** with an existing one (for example a second integration surface, billing path, or deployment target), mirror established patterns: facade module, split by domain, dedicated store or state layer, dedicated routes or entry points. Do not fold parallel subsystems into one monolithic module.

## 11. Code Style

- Prefer early returns. Use guard clauses at the top of functions to handle error/edge cases and return early, reducing nesting depth.
- Consistent import ordering: (1) platform/standard library, (2) third-party packages, (3) project modules. Separate groups with a blank line.
- One UI component per file. Small local sub-components may stay in the same file only if they are not exported.
- Colocate related files. Keep components, styles, and tests for a feature in the same directory.
- Prefer `const` over `let`. Default to `const`. Use `let` only when reassignment is genuinely needed. Never use `var`.