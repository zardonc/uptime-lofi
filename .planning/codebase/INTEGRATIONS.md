# External Integrations

**Analysis Date:** 2026-04-02

## APIs & External Services

**Monitoring Targets:**
- **Arbitrary HTTP endpoints** - Probe agent measures latency via HTTP HEAD requests (`server-probe/internal/collector/collector.go` - `PingTarget()`)
- **Agentless HTTP endpoints** - Backend scheduled Worker checks configured URLs from `nodes.config_json` and records latency/error results in `raw_metrics`
- **Agentless TCP endpoints** - Backend scheduled Worker uses Cloudflare Workers outbound TCP `connect()` where supported
- **V2 Monitor HTTP/TCP endpoints** - Backend scheduled Worker checks due `monitors` rows and records `check_results` plus `monitor_latest`
- **Docker Engine API** - Probe agent collects container states (`server-probe/internal/collector/docker.go`)

**No third-party SaaS APIs detected** - The system is fully self-contained with no external API dependencies (no Stripe, SendGrid, Twilio, etc.).

## Data Storage

**Databases:**
- **Cloudflare D1** (SQLite at the edge)
  - Connection: `c.env.DB` binding via Wrangler (`backend/wrangler.toml`)
  - Database name: `uptime-lofi-db`
  - Client: Direct `c.env.DB.prepare()` / `c.env.DB.batch()` API (no ORM)
  - Migrations: `backend/migrations/0000_schema.sql` through `0006_v2_core.sql`

**Tables:**
- `nodes` - Monitored server nodes and Agentless checks (id, name, type, status, last_heartbeat, config_json, salt, archived_at, updated_at)
- `raw_metrics` - High-frequency telemetry and Agentless results (node_id, timestamp, ping_ms, cpu_usage, mem_usage, is_up, containers_json, error_text)
- `daily_stats` - Aggregated daily rollups (node_id, date, uptime_ratio, avg_ping_ms, down_events)
- `refresh_tokens` - JWT refresh token rotation chain (token_hash, session_id, status, expires_at)
- `kv_settings` - Key-value settings store (key, value) for UI lock configuration
- `monitors` - V2 unified monitor records for agent, HTTP, and TCP checks
- `check_results` - V2 synthetic check history for HTTP/TCP monitors
- `agent_metrics` - V2 agent probe metric history
- `monitor_latest` - V2 latest-state read model for Dashboard/Public Status reads

**File Storage:**
- Local filesystem only - No cloud storage integration

**Caching:**
- None - No Redis, Memcached, or edge caching layer

## Authentication & Identity

**Auth Provider:** Custom/self-hosted

**Dashboard Auth (Frontend → Backend):**
- Implementation: JWT access tokens (15-minute expiry) + HttpOnly refresh cookies (60-minute expiry)
- Password-based login with SHA-256 hashing stored in D1 (`backend/src/routes/auth.ts`)
- Refresh token rotation with reuse detection (token chaining for session revocation)
- In-memory failed login attempt tracker (5 attempts per 15-minute window per IP)
- Break-glass: `API_SECRET_KEY` can always authenticate even with UI lock enabled
- JWT signed with `hono/jwt` using `API_SECRET_KEY` as secret

**Probe Auth (Agent → Backend):**
- Implementation: HMAC-SHA256 request signing with per-node PSK derivation
- Probe derives PSK: `HMAC-SHA256(API_SECRET_KEY, "{nodeId}:{salt}")` (`backend/src/middleware/auth.ts`)
- Probe signs payload: `HMAC-SHA256(PSK, "{timestamp}.{rawBody}")` (`server-probe/internal/pusher/crypto.go`)
- 3-minute sliding window timestamp validation (180 seconds)
- Headers required: `Authorization: Bearer {signature}`, `X-Timestamp`, `X-Node-Id`

**Rate Limiting:**
- Custom in-memory rate limiter middleware (`backend/src/middleware/rateLimiter.ts`)
- Tiers: `strictRateLimit` (login), `standardRateLimit` (general API), `permissiveRateLimit` (push endpoint)

## Monitoring & Observability

**Error Tracking:**
- None - No Sentry, Datadog, or external error tracking

**Logs:**
- `console.error()` for server-side errors (`backend/src/index.ts` line 80)
- `log.Printf()` for probe agent logging (`server-probe/internal/pusher/pusher.go`)
- Cloudflare Workers native logging in production

**Health Check:**
- `GET /` returns `{ status: 'ok', service: 'uptime-lofi-gateway', timestamp }` (`backend/src/index.ts` line 89)

## CI/CD & Deployment

**Hosting:**
- **Backend:** Cloudflare Workers (edge deployment via `wrangler deploy`)
- **Frontend:** Static build (`vite build` → `dist/`), deployed to Cloudflare Pages by the self-host workflow
- **Probe:** Standalone Go binary published to the fork's `probe-latest` GitHub Release and installed with a dashboard-generated one-command installer

**CI Pipeline:**
- `.github/workflows/deploy-production.yml` provides the `Deploy Self-Hosted` workflow.
- The self-host workflow preflights `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `API_SECRET_KEY`, Cloudflare account access, and advanced resource naming before provisioning.
- Workflow summaries print Dashboard URL, API URL, Probe URL, and fix instructions for missing secrets, Cloudflare permission/account errors, invalid resource prefixes, and smoke-test failures.

**Deployment Commands:**
- `pnpm dev` - Run both frontend and backend in parallel dev mode
- `pnpm build` - Build both packages
- `pnpm --filter backend deploy` - Deploy backend to Cloudflare Workers
- `pnpm --filter frontend build` - Build frontend static assets
- GitHub Actions `Deploy Self-Hosted` - Provisions/reuses D1, KV, Workers, Pages, publishes probe assets, runs migrations, deploys, and smoke-tests self-host output

### Cloudflare Workers TCP Support

- Agentless TCP checks use outbound TCP sockets from Cloudflare Workers via `connect()`.
- TCP sockets must be opened inside request/scheduled handlers, not global scope.
- The implementation rejects unsupported targets before storage or socket creation: localhost/loopback, private network addresses, `.local` names, invalid ports, and port `25`.
- Cloudflare disallows connections to Cloudflare IPs and other restricted targets; users should expect clear validation/errors rather than silent check creation.
- Advanced TCP options such as TLS/SNI/send-expect payloads are deferred.

## Environment Configuration

**Required env vars (Backend - Cloudflare Workers):**
- `DB` - D1 database binding (configured in `wrangler.toml`)
- `API_SECRET_KEY` - Master secret for JWT signing and probe PSK derivation
- `JWT_AUDIENCE` - JWT audience claim (optional)
- `JWT_ISSUER` - JWT issuer claim (optional)
- `CORS_ORIGINS` - Comma-separated allowed origins for production CORS

**Required env vars (Probe Agent):**
- `UPTIME_API_URL` - Backend API endpoint URL (required)
- `UPTIME_NODE_ID` - Unique node identifier (required)
- `UPTIME_PSK` - Pre-shared key for HMAC authentication (required)
- `UPTIME_ENABLE_DOCKER` - Enable Docker container monitoring (optional, boolean)
- One-command installer env names: `UPTIME_PROBE_PUSH_URL`, `UPTIME_NODE_ID`, `UPTIME_NODE_SECRET`, `UPTIME_PLATFORM`, with optional release/install-dir overrides

**Config file (Probe Agent):**
- `config.yaml` in working directory (via Viper) or env vars override

**Secrets location:**
- Backend: Cloudflare Workers secrets (deployed via Wrangler)
- Probe: Local config file or environment variables on the host machine
- `.env.example` template at `backend/.env.example`
- `.dev.vars` for local development at `backend/.dev.vars`

## Webhooks & Callbacks

**Incoming:**
- `POST /api/push` - Probe agents push metrics batches (HMAC-authenticated, max 100 metrics per batch)
  - Payload: Array of `{ node_id, timestamp, cpu, mem, is_up, ping?, containers_json? }`
  - Validated via Zod schema (`backend/src/routes/push.ts`)
  - Existing payloads still write `raw_metrics`/`nodes`; matching v2 agent monitors also receive `agent_metrics` and `monitor_latest`
  - Returns OTA trigger response: `{ status, received, ota_trigger, new_config }`

**Outgoing:**
- Backend scheduled Agentless HTTP checks call user-configured URLs.
- Backend scheduled Agentless TCP checks attempt Worker outbound TCP `connect()` to allowed user-configured hosts/ports.
- Backend scheduled v2 Monitor checks call due HTTP targets or attempt allowed TCP connections, then update `check_results` and `monitor_latest`.

## Communication Patterns

**Frontend → Backend:**
- REST API via `fetch()` with JWT Bearer token (`frontend/src/api/client.ts`)
- Auto-refresh on 401: coalesced refresh token rotation
- Dev proxy: `/api` → `http://localhost:8787` (`frontend/vite.config.ts`)
- Agentless frontend calls `/api/agentless`, `/api/agentless/http`, and `/api/agentless/tcp`; TCP creation may be disabled in UI when deployment capability is unavailable.

**Probe → Backend:**
- HTTP POST with exponential backoff retry (max 2 minutes) (`server-probe/internal/pusher/pusher.go`)
- HMAC-SHA256 signed requests with 3-minute timestamp window
- Handles 410 Gone as fatal (node identity suspended → process exits)
- Handles 500/429 with retry, other 4xx as permanent drop

**Dashboard → Probe Host Setup:**
- Dashboard calls `/api/nodes/probe-config` to generate node-specific credentials and an `install_command`.
- Users copy the command under `Run this on your server`; the command downloads `scripts/install-probe.sh`, writes `config.yaml`, downloads the release asset, and prints start guidance.
- The command and manual fallback never include `API_SECRET_KEY`.

---

*Integration audit: 2026-04-02*
