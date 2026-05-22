# Codebase Structure

**Analysis Date:** 2026-04-02

## Directory Layout

```
uptime-lofi-monorepo/
├── package.json              # Root monorepo manifest (pnpm workspace)
├── pnpm-workspace.yaml       # Workspace definition (frontend, backend)
├── pnpm-lock.yaml            # Lockfile for entire monorepo
│
├── frontend/                 # React SPA dashboard
│   ├── package.json          # Frontend dependencies
│   ├── vite.config.ts        # Vite build config + API proxy
│   ├── tsconfig.json         # Root TypeScript config
│   ├── tsconfig.app.json     # App-specific TypeScript config
│   ├── tsconfig.node.json    # Node/TypeScript config
│   ├── eslint.config.js      # ESLint flat config
│   ├── index.html            # HTML entry point
│   ├── public/               # Static assets (served as-is)
│   ├── dist/                 # Build output (generated)
│   └── src/
│       ├── main.tsx          # React entry point
│       ├── App.tsx           # Root component (dashboard layout)
│       ├── index.css         # Global styles
│       ├── api/              # API client layer
│       ├── components/       # React UI components
│       ├── hooks/            # Custom React hooks (data fetching)
│       ├── data/             # Mock/test data
│       └── assets/           # Imported assets (images, etc.)
│
├── backend/                  # Cloudflare Workers API (Hono)
│   ├── package.json          # Backend dependencies
│   ├── wrangler.toml         # Cloudflare Workers config
│   ├── tsconfig.json         # TypeScript config
│   ├── .dev.vars             # Local dev environment variables
│   ├── .env.example          # Example environment variables
│   ├── .wrangler/            # Wrangler local state (generated)
│   ├── migrations/           # D1 database migrations
│   ├── seed.sql              # Development seed data
│   └── src/
│       ├── index.ts          # Hono app entry point
│       ├── index.js          # (Legacy/compiled — should be removed)
│       ├── routes/           # API route handlers
│       ├── middleware/       # Hono middleware
│       ├── services/         # D1-backed domain/runtime services
│       └── types/            # TypeScript type augmentations
│
├── server-probe/             # Go telemetry probe agent
│   ├── go.mod                # Go module definition
│   ├── go.sum                # Go dependency checksums
│   ├── cmd/
│   │   └── probe/
│   │       └── main.go       # CLI entry point (Cobra)
│   ├── internal/
│   │   ├── config/           # Configuration loading (Viper)
│   │   ├── collector/        # System metric collection
│   │   └── pusher/           # Batch push to edge API
│   └── tests/
│       ├── config_test.go    # Config unit tests
│       └── crypto_test.go    # Crypto/HMAC unit tests
│
├── .planning/                # GSD planning artifacts
├── .opencode/                # OpenCode configuration
├── .claude/                  # Claude configuration
├── .gemini/                  # Gemini configuration
├── .sisyphus/                # Sisyphus work session data
├── .agent/                   # Agent configuration
├── .adocs/                   # Documentation artifacts
└── .history/                 # Command history
```

## Directory Purposes

**`frontend/src/api/`:**
- Purpose: API communication layer — types and fetch client
- Contains: `client.ts` (JWT-aware fetch wrapper), `types.ts` (API response interfaces)
- Key files: `frontend/src/api/client.ts` (core fetch with auto-refresh), `frontend/src/api/types.ts` (shared types)

**`frontend/src/components/`:**
- Purpose: Reusable React UI components for the dashboard
- Contains: Presentational and container components
- Key files:
  - `frontend/src/components/Sidebar.tsx` — Navigation sidebar
  - `frontend/src/components/MetricCard.tsx` — Stat display cards
  - `frontend/src/components/TrendChart.tsx` — Recharts time-series chart
  - `frontend/src/components/UptimeRing.tsx` — Circular uptime visualization
  - `frontend/src/components/NodeList.tsx` — Monitored nodes table
  - `frontend/src/components/ActivityFeed.tsx` — Event timeline
  - `frontend/src/components/LoginGate.tsx` — Auth guard wrapper
  - `frontend/src/components/Settings.tsx` — Settings panel
  - `frontend/src/components/ErrorBanner.tsx` — Error notification
  - `frontend/src/components/Skeleton.tsx` — Loading placeholders
  - `frontend/src/components/StatusBadge.tsx` — Status indicator

**`frontend/src/hooks/`:**
- Purpose: Custom React hooks for data fetching with polling
- Contains: One hook per API endpoint, plus auth context
- Key files:
  - `frontend/src/hooks/useAuth.tsx` — Auth context provider (JWT + session)
  - `frontend/src/hooks/useNodes.ts` — Node list polling (30s interval)
  - `frontend/src/hooks/useOverview.ts` — Dashboard stats polling (30s interval)
  - `frontend/src/hooks/useMetrics.ts` — Per-node metrics polling (30s interval)

**`frontend/src/data/`:**
- Purpose: Mock data for development/fallback
- Contains: `frontend/src/data/mockData.ts` — Synthetic data generators

**`backend/src/routes/`:**
- Purpose: Modular API route handlers mounted under `/api`
- Contains: One file per API domain
- Key files:
  - `backend/src/routes/api.ts` — Root router, mounts sub-routers with middleware
  - `backend/src/routes/auth.ts` — Authentication endpoints (login, refresh, setup, unlock)
  - `backend/src/routes/nodes.ts` — Node listing and metrics retrieval
  - `backend/src/routes/stats.ts` — Dashboard overview statistics
  - `backend/src/routes/settings.ts` — UI lock/security settings
  - `backend/src/routes/push.ts` — Probe telemetry ingestion (batch POST)

**`backend/src/services/`:**
- Purpose: D1-backed domain and runtime services used by route handlers and scheduled jobs
- Key files:
  - `backend/src/services/monitorRepository.ts` — V2 Monitor CRUD/DTO repository
  - `backend/src/services/monitorLatest.ts` — Latest-state read model updater and public-safe projection helper
  - `backend/src/services/checkRunner.ts` — Bounded Worker cron runner for v2 HTTP/TCP monitors

**`backend/src/middleware/`:**
- Purpose: Hono middleware functions for cross-cutting concerns
- Contains: Auth, rate limiting, security headers
- Key files:
  - `backend/src/middleware/auth.ts` — Probe HMAC authentication (89 lines)
  - `backend/src/middleware/dashboardAuth.ts` — Dashboard JWT authentication (70 lines)
  - `backend/src/middleware/rateLimiter.ts` — Three-tier sliding window rate limiter (75 lines)
  - `backend/src/middleware/securityHeaders.ts` — Security response headers (26 lines)

**`backend/src/types/`:**
- Purpose: TypeScript type augmentations
- Contains: `backend/src/types/hono-payload.d.ts` — Module augmentation for Hono Context

**`backend/migrations/`:**
- Purpose: Cloudflare D1 database schema migrations
- Contains: Sequential SQL migration files
- Key files:
  - `backend/migrations/0000_schema.sql` — Initial schema (nodes, raw_metrics, daily_stats)
  - `backend/migrations/0001_v2_auth_schema.sql` — Auth schema (salt, refresh_tokens)
  - `backend/migrations/0002_settings_schema.sql` — Settings KV table

**`server-probe/internal/`:**
- Purpose: Private Go packages (not importable externally)
- Contains: Core probe logic
- Key files:
  - `server-probe/internal/config/config.go` — Viper-based config loading
  - `server-probe/internal/collector/collector.go` — CPU, memory, ping collection
  - `server-probe/internal/collector/docker.go` — Docker container state collection
  - `server-probe/internal/pusher/pusher.go` — Batch pusher with exponential backoff
  - `server-probe/internal/pusher/crypto.go` — HMAC-SHA256 signature generation

**`server-probe/tests/`:**
- Purpose: Go unit tests
- Contains: `server-probe/tests/config_test.go`, `server-probe/tests/crypto_test.go`

## Key File Locations

**Entry Points:**
- `backend/src/index.ts`: Cloudflare Worker entry (Hono app)
- `frontend/src/main.tsx`: React SPA entry point
- `frontend/src/App.tsx`: Root React component
- `server-probe/cmd/probe/main.go`: Go CLI entry point

**Configuration:**
- `pnpm-workspace.yaml`: Monorepo workspace definition
- `backend/wrangler.toml`: Cloudflare Workers deployment config
- `backend/tsconfig.json`: Backend TypeScript config
- `frontend/vite.config.ts`: Frontend build + dev proxy config
- `frontend/tsconfig.app.json`: Frontend app TypeScript config
- `server-probe/go.mod`: Go module and dependencies

**Core Logic:**
- `backend/src/routes/api.ts`: API route composition and middleware layering
- `backend/src/middleware/auth.ts`: Probe HMAC verification
- `backend/src/middleware/dashboardAuth.ts`: Dashboard JWT verification
- `backend/src/routes/push.ts`: Telemetry ingestion and D1 batch writes
- `backend/src/services/monitorLatest.ts`: V2 current-state updates for monitor_latest
- `backend/src/services/checkRunner.ts`: V2 scheduled HTTP/TCP monitor execution
- `server-probe/internal/pusher/pusher.go`: Telemetry batch transport
- `server-probe/internal/collector/collector.go`: System metric collection

**Database:**
- `backend/migrations/0000_schema.sql`: Core tables (nodes, raw_metrics, daily_stats)
- `backend/migrations/0001_v2_auth_schema.sql`: Auth tables (refresh_tokens, node salt)
- `backend/migrations/0002_settings_schema.sql`: KV settings table
- `backend/seed.sql`: Development seed data

**Testing:**
- `server-probe/tests/config_test.go`: Config loading tests
- `server-probe/tests/crypto_test.go`: HMAC signature tests

## Naming Conventions

**Files:**
- TypeScript: `camelCase.ts` for source files (e.g., `client.ts`, `useNodes.ts`)
- React components: `PascalCase.tsx` (e.g., `MetricCard.tsx`, `LoginGate.tsx`)
- Custom hooks: `usePascalCase.ts` or `usePascalCase.tsx` (e.g., `useAuth.tsx`, `useMetrics.ts`)
- Go: `snake_case.go` (e.g., `config.go`, `collector.go`, `crypto.go`)
- SQL migrations: `NNNN_description.sql` (e.g., `0000_schema.sql`)

**Directories:**
- All lowercase, singular or plural based on convention:
  - `routes/`, `middleware/`, `types/` (backend) — plural
  - `components/`, `hooks/`, `api/` (frontend) — plural
  - `collector/`, `config/`, `pusher/` (probe) — singular (domain concepts)

**Go packages:**
- Package names match directory names: `config`, `collector`, `pusher`
- Entry point in `cmd/probe/` uses `package main`

**API endpoints:**
- RESTful: `/api/nodes`, `/api/stats/overview`, `/api/push`, `/api/auth/login`
- Query params for filtering: `/api/nodes/:id/metrics?hours=24`

## Where to Add New Code

**New API Endpoint:**
- Route handler: `backend/src/routes/<domain>.ts`
- If new domain: create file, then mount in `backend/src/routes/api.ts`
- Middleware: `backend/src/middleware/<name>.ts`
- Zod validation: inline in route handler via `@hono/zod-validator`

**New Database Table:**
- Migration: `backend/migrations/NNNN_description.sql` (next sequential number)
- Apply via Wrangler: `wrangler d1 execute uptime-lofi-db --local --file=migrations/NNNN_description.sql`

**New Frontend Component:**
- Component: `frontend/src/components/<Name>.tsx`
- If used across multiple places: keep in `components/`
- If page-specific: consider co-locating near the page

**New Frontend Hook:**
- Hook: `frontend/src/hooks/use<Name>.ts`
- Follow pattern: `useState` + `useEffect` + `useCallback` + `useRef` for mounted check
- Accept `isAuthenticated` guard parameter if API call required

**New API Client Method:**
- Add to `frontend/src/api/client.ts` under the `api` const object
- Add response type to `frontend/src/api/types.ts`

**New Probe Feature:**
- Config: add field to `server-probe/internal/config/config.go` Config struct
- Collector: add function to `server-probe/internal/collector/`
- Pusher: modify payload in `server-probe/internal/pusher/pusher.go`
- Crypto: signature logic in `server-probe/internal/pusher/crypto.go`

**New Probe Test:**
- Test file: `server-probe/tests/<feature>_test.go`

**Utilities:**
- Shared helpers: `frontend/src/api/client.ts` (frontend), `server-probe/internal/` packages (probe)
- Type definitions: `frontend/src/api/types.ts` (frontend), `backend/src/types/` (backend)

## Special Directories

**`.wrangler/`:**
- Purpose: Wrangler local development state (D1 local database, etc.)
- Generated: Yes
- Committed: No (in .gitignore)

**`frontend/dist/`:**
- Purpose: Production build output
- Generated: Yes (`vite build`)
- Committed: No (in .gitignore)

**`node_modules/`:**
- Purpose: Installed dependencies (pnpm)
- Generated: Yes (`pnpm install`)
- Committed: No

**`.planning/`:**
- Purpose: GSD workflow artifacts (phase plans, codebase analysis)
- Generated: Yes (GSD commands)
- Committed: Yes (project workflow)

**`.history/`:**
- Purpose: Shell command history
- Generated: Yes
- Committed: No

---

*Structure analysis: 2026-04-02*
