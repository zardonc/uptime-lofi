# Architecture

**Analysis Date:** 2026-04-02

## Pattern Overview

**Overall:** Monorepo with three independently deployable services — a React SPA frontend, a Cloudflare Workers TypeScript backend (Hono), and a Go-based telemetry probe agent. Communication is primarily push-based for agent probes, with backend scheduled Agentless checks as the explicit polling exception.

**Key Characteristics:**
- **Push-based telemetry** — Agent probes collect and push metrics; backend scheduled execution polls only Agentless HTTP/TCP checks
- **Edge-first backend** — Runs on Cloudflare Workers with D1 (SQLite) for persistence
- **HMAC-authenticated probe API** — Probes sign requests with derived PSKs; dashboard uses JWT
- **Dual auth model** — Dashboard (15-minute JWT + 60-minute refresh cookie rotation) and Probe (HMAC-SHA256 with salt-derived PSKs)
- **SPA with polling** — Frontend polls API every 30s for live data

## Phase 11 V2 Architecture

Phase 11 adds a browser-facing Cloudflare Pages layer while preserving the Worker as the monitoring engine.

- **Pages Functions BFF** lives in `functions/`. Browser admin traffic uses same-origin `/api/auth/*` and `/api/v1/*` routes, receives HttpOnly session cookies, and never receives Worker internal secrets.
- **Worker internal backend** lives under `/api/internal/v1/*`. Pages Functions forwards authenticated admin requests with `x-uptime-lofi-internal-key`; direct browser access is blocked by `backend/src/middleware/internalAuth.ts`.
- **Unified Monitors model** replaces the old top-level Nodes/Agentless split. Agent Probe, HTTP Check, and TCP Check are creation modes under `frontend/src/components/MonitorsPage.tsx`.
- **Public Status** is a standalone `/status` Pages route backed by redacted public APIs and `kv_settings` exposure controls.
- **Alerts and Notifications** use server-side rules, state/history, and redacted Webhook/Telegram channel DTOs. Email is reserved/disabled.
- **Statistics** uses D1 rollups plus rebuildable `STATISTICS_CACHE` KV snapshots for summary, leaderboard, and trend reads.

## Layers

### Frontend (React SPA + Pages Functions)
- Purpose: Dashboard UI for monitor status, public status, alerts, notifications, statistics, and settings
- Location: `frontend/src/`
- Contains: React components, custom hooks, API client layer, type definitions
- Depends on: Vite (build), Recharts (visualization), Lucide React (icons)
- Used by: End users via browser
- Browser API boundary: same-origin Pages Functions routes in `functions/api/`

### Backend (Cloudflare Workers API)
- Purpose: Internal REST API handling monitor persistence, scheduled checks, alert evaluation, notification dispatch, rollups, and probe ingestion
- Location: `backend/src/`
- Contains: Hono routes, internal auth middleware, D1 database queries, scheduled runners, notification services
- Depends on: Hono framework, Zod validation, Cloudflare D1, Workers KV for statistics cache
- Used by: Pages Functions, Go probe agents, and Worker cron

### Probe Agent (Go CLI)
- Purpose: Lightweight system telemetry collector running on monitored servers
- Location: `server-probe/`
- Contains: System metric collection (CPU, memory, Docker), HMAC signing, batch pusher with exponential backoff
- Depends on: gopsutil (system metrics), Docker SDK, Cobra CLI, Viper config
- Used by: System administrators deployed as a daemon on target servers

## Data Flow

### Telemetry Collection Flow (Probe → Backend)

1. Go probe runs as a long-lived process via `server-probe/cmd/probe/main.go`
2. Every 60s, `internal/collector/collector.go` collects CPU, memory, and ping metrics
3. Optional Docker container state collected via `internal/collector/docker.go`
4. Metrics buffered in `internal/pusher/pusher.go` (up to 60 readings)
5. Every 5 minutes, `FlushToEdge()` batches and POSTs to backend `/api/push`
6. Request signed with HMAC-SHA256: `HMAC(PSK, "{timestamp}.{body}")` using `internal/pusher/crypto.go`
7. Backend verifies via `backend/src/middleware/auth.ts` (probeAuthMiddleware)
8. Metrics written to D1 `raw_metrics` table; `nodes` table updated with latest status
9. Response includes OTA trigger flag for future config push capability

### Dashboard Data Flow (Frontend → Pages Functions → Worker)

1. User opens Cloudflare Pages; `frontend/src/main.tsx` mounts `<AuthProvider>` wrapping `<App>`.
2. `/login` and `/status` render without the admin sidebar. The admin shell navigation is Dashboard, Monitors, Statistics, Alerts, Settings, and Logout.
3. `LoginGate` checks `/api/auth/status` and posts credentials to Pages Functions `/api/auth/login`.
4. Pages Functions sign HttpOnly session cookies using `PAGES_SESSION_SECRET` and verify future admin requests server-side.
5. Frontend v2 API calls such as `/api/v1/monitors`, `/api/v1/statistics/*`, `/api/v1/alerts/*`, and `/api/v1/notifications/*` hit Pages Functions first.
6. Pages Functions forward authenticated admin requests to Worker `/api/internal/v1/*` with `x-uptime-lofi-internal-key`.
7. Worker routes validate DTOs, query D1, update `monitor_latest`, evaluate alerts, and return redacted v2 DTOs.

### Nodes Lifecycle And Detail Flow

1. `Nodes` is the unified lifecycle surface for agent probes and Agentless checks.
2. Users click `Add Node` to choose `Agent Probe` or `Agentless Check`; Settings may still expose probe setup as a secondary path.
3. Agent probe setup calls `/api/nodes/probe-config`, which creates a node-specific credential and returns a one-command installer plus manual fallback config.
4. Safe node management uses authenticated node lifecycle endpoints for name edits, pause/resume, and archive delete. Probe secrets are not accepted in generic edit payloads.
5. Delete/archive sets `nodes.archived_at` and hides the node from active lists while preserving historical `raw_metrics` rows.
6. `NodeList` renders responsive cards, opens a detail drawer without React routing, and loads `/api/nodes/:id/metrics` on demand for current metrics and Docker data.

### Agentless Scheduled Check Flow (Backend → External Target)

1. Dashboard users create HTTP or TCP synthetic checks through `/api/agentless` routes.
2. Checks are stored as `nodes` rows with type `agentless_http` or `agentless_tcp` and non-secret `config_json`.
3. `backend/src/index.ts` scheduled execution runs every 5 minutes and invokes `runDueAgentlessChecks` after cleanup.
4. The scheduler selects non-archived, non-paused Agentless nodes and runs only checks due by their configured interval.
5. Results are inserted into `raw_metrics` with reachability, latency, and `error_text`, then the node status/heartbeat is updated.
6. This scheduled path is the only backend polling path; normal agent probe telemetry remains push-only.

### V2 Monitor Runtime Flow

1. Users create Agent Probe, HTTP Check, or TCP Check monitors through `MonitorsPage`.
2. Monitor records are stored in `monitors`; HTTP/TCP results go to `check_results`; agent probe updates also populate `agent_metrics`.
3. `monitor_latest` is the current-state read model for Dashboard and Public Status.
4. Worker cron runs due monitor checks and refreshes statistics rollups without requiring an open browser tab.
5. Alert evaluation runs after latest-state writes, updating alert state/history and dispatching Webhook or Telegram notifications when rules require delivery.

### Docker Container Data Flow

1. The Go probe collects Docker container `id`, `name`, `image`, `state`, and `status` through `server-probe/internal/collector/docker.go` when Docker collection is enabled.
2. `server-probe/internal/pusher/pusher.go` sends the `containers_json` payload with the normal signed probe batch.
3. `backend/src/routes/push.ts` validates, compresses, and stores `containers_json` in `raw_metrics`.
4. `backend/src/routes/nodes.ts` decompresses and parses metric container data for `/api/nodes/:id/metrics`.
5. `frontend/src/components/NodeList.tsx` displays Docker container rows only in the detail drawer when metric data contains containers; otherwise it shows the honest no-data state.

### Authentication Flow

**Dashboard (JWT + Refresh Token Rotation):**
1. User POSTs `/api/auth/login` with password
2. Backend verifies against `API_SECRET_KEY` or stored UI lock hash in `kv_settings`
3. Creates session with `refresh_tokens` table entry (hashed token, session_id, status)
4. Returns short-lived JWT (15 min) as JSON; sets HttpOnly refresh cookie (60-minute refresh window)
5. Frontend stores JWT in memory only; refresh token in HttpOnly cookie
6. On 401, `api/client.ts` coalesces refresh via `/api/auth/refresh` (single in-flight promise)
7. Refresh rotates token: inserts new token, marks old as `rotated`, detects reuse → revokes session

**Probe (HMAC-SHA256 with Derived PSK):**
1. Each node has a `salt` column in `nodes` table (set during registration)
2. Probe PSK derived as: `HMAC-SHA256(API_SECRET_KEY, "{nodeId}:{salt}")`
3. Every request includes: `Authorization: Bearer {signature}`, `X-Timestamp`, `X-Node-Id`
4. Backend re-derives PSK, verifies HMAC against request body, checks 3-minute timestamp window

## Key Abstractions

### Hono App Composition
- Location: `backend/src/index.ts`
- Pattern: Modular route mounting with middleware layering
- `app` (root) → global middleware (security headers, CORS, payload size) → `api` router at `/api`
- `api` router → rate limiting → three sub-routers: `auth` (unprotected), `dashboard` (JWT auth), `probe` (HMAC auth)

### API Client Pattern
- Location: `frontend/src/api/client.ts`
- Pattern: Centralized fetch wrapper with automatic JWT refresh
- Memory-only token store (never persisted to localStorage/sessionStorage)
- Coalesced refresh: concurrent 401s share a single refresh promise
- Custom `ApiClientError` class with HTTP status

### Custom Hook Pattern
- Location: `frontend/src/hooks/`
- Pattern: Each hook manages its own polling interval, loading state, error state, and mounted-ref cleanup
- All hooks accept `isAuthenticated` guard parameter to skip fetches when logged out
- Poll interval constant: `POLL_INTERVAL_MS = 30_000` across all data hooks

### Metric Payload Schema
- Location: `server-probe/internal/collector/collector.go` (Go) ↔ `backend/src/routes/push.ts` (Zod)
- Pattern: Strict schema validation on both sides
- Go struct fields map to Zod schema with regex validation on `node_id`, range checks on metrics
- Timestamp validation: must be within 24 hours and not in the future

### Agentless Check Runner Pattern
- Location: `backend/src/agentless/checks.ts`
- Pattern: Worker-safe HTTP/TCP check runners with injectable `fetch` and `connect()` test seams
- TCP checks reject unsupported Cloudflare Worker targets before creation or outbound sockets: private/loopback hosts, localhost-style names, invalid ports, and port 25
- Scheduled runner batches due checks to keep cron execution bounded

### Node Archive Pattern
- Location: `backend/src/routes/nodes.ts`, `backend/migrations/0003_nodes_lifecycle.sql`
- Pattern: `DELETE /api/nodes/:id` archives with `archived_at` and `status='paused'` instead of hard-deleting
- Active node list queries filter `archived_at IS NULL`
- Historical `raw_metrics` remains queryable for future history/detail features

## Entry Points

**`backend/src/index.ts`:**
- Triggers: HTTP requests to Cloudflare Worker
- Responsibilities: Global middleware pipeline, route mounting, error handling, CORS
- Exports: Default Hono app instance

**`frontend/src/main.tsx`:**
- Triggers: Browser page load
- Responsibilities: React root creation, AuthProvider wrapping, StrictMode
- Mounts: `<App>` component

**`server-probe/cmd/probe/main.go`:**
- Triggers: CLI execution (`probe` command via Cobra)
- Responsibilities: Config loading, probe initialization, ticker management, graceful shutdown
- Runs: Background goroutines for collection (60s) and push (5m)

## Error Handling

**Strategy:** Layered error handling with standardized JSON responses

**Patterns:**
- **Backend global handler:** `app.onError()` in `backend/src/index.ts` catches all unhandled errors, returns `{ error: string }` with appropriate status codes
- **HTTPException:** Used throughout middleware for auth failures (401), rate limits (429), server errors (500)
- **Zod validation errors:** Intercepted by `@hono/zod-validator`, returns `{ error: "Malformed payload format" }` (400)
- **Frontend:** `ApiClientError` class wraps HTTP errors; hooks catch and surface as `error` string state
- **Probe:** Exponential backoff with 2-minute max elapsed time; logs and drops batch on permanent failure
- **Graceful shutdown:** Probe listens for SIGINT/SIGTERM, performs final flush before exit

## Cross-Cutting Concerns

**Logging:**
- Backend: `console.error()` for errors, minimal structured logging
- Frontend: No logging framework; errors surfaced via UI state
- Probe: Standard `log.Printf()` with prefixed tags (`[Pusher]`, `[Hardware Warn]`)

**Validation:**
- Backend: Zod schemas on all POST endpoints via `@hono/zod-validator`
- Probe: Config validation on startup (required fields: `api_url`, `node_id`, `psk`)
- Frontend: Type-safe API responses via TypeScript interfaces

**Authentication:**
- Dual model: JWT for dashboard (Hono JWT middleware), HMAC for probes (custom middleware)
- Rate limiting: Three tiers — strict (5/min for login), standard (60/min), permissive (300/min)
- Security headers: X-Content-Type-Options, X-Frame-Options, HSTS, CSP, Permissions-Policy

**Rate Limiting:**
- In-memory Map-based sliding window (no external dependency)
- Lazy cleanup of expired entries (Cloudflare Workers doesn't support setInterval)
- Client identification: `CF-Connecting-IP` → `X-Forwarded-For` → `"unknown"`

---

*Architecture analysis: 2026-04-02*
