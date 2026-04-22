# Tech Stack

This is the single source of truth for all technology choices in the project. No other spec file should name specific libraries or frameworks.

## Backend

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Runtime | Node.js | 24+ LTS | Server runtime. `--watch` for dev mode. |
| Framework | Fastify | ^5.8 | HTTP server with built-in JSON schema validation, low overhead, plugin system. |
| CORS | @fastify/cors | ^11.2 | Cross-origin support for development mode only. |
| Static files | @fastify/static | ^9.0 | Serves built frontend files in production mode. |
| Cookie parsing | @fastify/cookie | ^11.0 | Parse and set HTTP cookies for session auth. |
| Observability (optional) | `@langfuse/tracing`, `@langfuse/otel`, `@opentelemetry/sdk-node` | ^5.1 / ^0.214 | Optional LLM traces to Langfuse: `optionalDependencies` in `backend/package.json`. `NodeSDK` + `LangfuseSpanProcessor` (`@langfuse/otel`) and `startObservation` from `@langfuse/tracing` ([SDK overview](https://langfuse.com/docs/observability/sdk/overview)). Disabled when `LANGFUSE_SECRET_KEY` and `LANGFUSE_PUBLIC_KEY` are unset (env or `settings.json`). |
| YAML | yaml (eemeli) | ^2.8 | Frontmatter and structured fields in agent definitions and notes (see `lib/frontmatter.js`). |
| HTML parsing | node-html-parser | ^7.x | DOM-style parsing for web search HTML extraction (`services/webSearch.js`). |

Structured session metadata uses JSON (`session.json`); message transcripts use markdown (`CHAT.md`). Both are parsed with `JSON.parse` and the dedicated role-marker logic in `conversation.js` (see [GENERAL-CODING-RULES.md](GENERAL-CODING-RULES.md) section 4).

### Backend dependencies NOT used

- **No legacy Langfuse `langfuse` npm package** — that standalone client is deprecated for observability; use `@langfuse/tracing` + `@langfuse/otel` with OpenTelemetry as in the [Langfuse JS/TS docs](https://langfuse.com/docs/observability/sdk/overview).
- **No Express** — Fastify chosen for performance and built-in validation.
- **No JWT library** — session tokens with Node.js `crypto` built-ins.
- **No UUID library** — `crypto.randomBytes()` for token and ID generation.
- **No date library** — built-in `Date` and `Intl` APIs.
- **No bcrypt** — `crypto.scrypt` for password hashing.
- **No database** — conversations stored as markdown files, config as JSON.
- **No ORM** — no database means no ORM.

## Frontend

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| UI library | React | ^19.0 | Component-based UI. |
| Build tool | Vite | ^8.0 | Dev server with HMR, Rolldown-based production bundler. |
| Vite plugin | @vitejs/plugin-react | ^6.0 | React Refresh via Oxc. Babel no longer built-in; use `@rolldown/plugin-babel` only if React Compiler or custom Babel transforms are needed. |
| Styling | Tailwind CSS | ^4.2 | Utility-first CSS framework. CSS-first configuration (`@import "tailwindcss"` in CSS entry file). No `tailwind.config.js`. |
| Tailwind integration | @tailwindcss/vite | ^4.2 | Vite plugin for Tailwind. Replaces the PostCSS pipeline; vendor prefixing is built-in. |
| State management | Zustand | ^5.0 | Minimal global state with no boilerplate. |
| Routing | react-router | ^7.13 | Client-side routing (login page vs. app shell). Package renamed from `react-router-dom` in v7; the old name is a re-export wrapper. |
| Icons | lucide-react | ^1.7 | Tree-shakeable icon library. No CDN. |
| HTTP client | Native `fetch` | — | No Axios or similar; plain browser fetch API. |
| Markdown rendering | react-markdown + remark-gfm | ^10.1 / ^4.0 | Render LLM responses as rich markdown with GFM support (tables, strikethrough, task lists). Substantial functionality that would take significant effort to replicate. |
| Syntax highlighting | rehype-highlight + highlight.js | ^7.0 / ^11.11 | Syntax-highlighted code blocks in LLM responses. Used as a rehype plugin within react-markdown. |
| YAML | yaml (eemeli) | ^2.8 | Parse note frontmatter in the notebook UI (same package as backend; no regex-based YAML field extraction). |

### Frontend dependencies NOT used

- **No component library** (Material UI, Chakra, etc.) — all components built from scratch with Tailwind.
- **No CSS-in-JS** — Tailwind utility classes only.
- **No Axios** — native `fetch`.
- **No form library** — plain React state for forms.
- **No CDN assets** — no external font loading, no script tags from CDNs.
- **No SSE library** — manual `fetch` + `ReadableStream` parsing for SSE consumption.
- **No PostCSS / Autoprefixer** — Tailwind v4's Vite plugin handles CSS processing and vendor prefixing automatically.

## Dependency Philosophy

Use the platform where possible. Only add an npm package if it provides substantial functionality that would take significant effort to replicate correctly (e.g.`fastify` for HTTP server, `zustand` for state). Do not add packages for things like date formatting, simple HTTP requests, UUID generation, or JWT handling — use Node.js built-ins or small inline implementations instead.

## Fonts

System fonts only. No font downloads, no CDN font loading. Body UI uses the sans stack below; Tailwind `font-mono` (or equivalent) is allowed for code paths, XML, and technical strings using the **system monospace** stack only (no webfonts).

```
font-family: system-ui, -apple-system, sans-serif
```
