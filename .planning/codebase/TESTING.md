# Testing Patterns

**Analysis Date:** 2026-05-06

## Test Framework

**Frontend (React/TypeScript):**
- Runner: **Vitest** through `pnpm --filter frontend test`
- Environment/config: `frontend/vitest.config.ts` with jsdom and Vite/React integration
- Component tests use **React Testing Library** and `@testing-library/jest-dom`
- API/network tests use **MSW** handlers in `frontend/tests/mocks/handlers.ts`
- Common commands:
  ```bash
  pnpm --filter frontend test
  pnpm --filter frontend test -- tests/components/App.test.tsx tests/components/MonitorsPage.test.tsx tests/components/PublicStatus.test.tsx tests/components/Alerts.test.tsx tests/components/Settings.test.tsx tests/components/Statistics.test.tsx
  pnpm --filter frontend typecheck
  pnpm --filter frontend lint
  ```

**Backend (Cloudflare Workers/TypeScript):**
- Runner: **Vitest** through `pnpm --filter backend test`
- Worker environment: **@cloudflare/vitest-pool-workers**
- Tests exercise Hono routes, D1 migrations/queries, scheduled handlers, and pure Agentless check helpers.
- Backend application `tsc --noEmit` remains sensitive because of Hono + pnpm type-resolution issues. Focused backend Vitest suites are the primary validation gate; do not make backend app typecheck a required deploy gate unless that caveat is resolved.
- Common commands:
  ```bash
  pnpm --filter backend test
  pnpm --filter backend test -- tests/contracts/v2-contracts.test.ts tests/functions/pages-auth.test.ts tests/routes/monitors.test.ts tests/routes/public-status.test.ts
  pnpm --filter backend test -- tests/alerts/alert-engine.test.ts tests/routes/alerts.test.ts tests/notifications/dispatcher.test.ts tests/routes/notifications.test.ts
  pnpm --filter backend test -- tests/routes/monitor-latest.test.ts tests/routes/scheduled.test.ts tests/stats/statistics-rollup.test.ts tests/routes/statistics.test.ts
  pnpm --filter backend test -- tests/agentless/checks.test.ts
  ```

**Go Probe:**
- Runner: Go's built-in `testing` package.
- Tests live under `server-probe/tests/` and import internal packages from the module.
- Common commands:
  ```bash
  cd server-probe && go test ./...
  cd server-probe && go test -v ./...
  cd server-probe && go test -cover ./...
  ```

**Deployment Shell:**
- Runner: Bash scripts under `scripts/tests/`.
- Current focused command:
  ```bash
  bash scripts/tests/self-host-cloudflare.test.sh
  ```

## Test File Organization

**Frontend:**
- `frontend/tests/components/*.test.tsx` for component and page behavior.
- `frontend/tests/hooks/*.test.tsx` for hook behavior such as session restore.
- `frontend/tests/mocks/handlers.ts` for MSW API fixtures.
- Tests assert accessible copy, roles, labels, buttons, dialogs, loading/error states, and no-data states rather than implementation details.

**Backend:**
- `backend/tests/routes/*.test.ts` for authenticated Hono route behavior and D1-backed integration tests.
- `backend/tests/agentless/*.test.ts` for pure Agentless HTTP/TCP check logic with injected `fetch`/`connect` fakes.
- `backend/tests/routes/scheduled.test.ts` for Worker cron behavior.
- Backend route suites apply local migrations through the Workers test pool rather than relying on external Cloudflare credentials.

**Go Probe:**
- `server-probe/tests/*_test.go` uses standard `testing` with explicit environment setup and fake seams where needed.
- Docker collector tests use an injectable list function so CI does not need a local Docker daemon.

**Shell:**
- `scripts/tests/self-host-cloudflare.test.sh` isolates CI helper behavior with temp `GITHUB_STEP_SUMMARY` files and fake Cloudflare API responses.

## Phase 11 Focused Test Coverage

| Area | Primary tests | Purpose |
|------|---------------|---------|
| Pages Functions auth and proxy | `backend/tests/functions/pages-auth.test.ts`, `frontend/tests/components/LoginGate.test.tsx` | HttpOnly session cookies, Pages auth status, refresh/logout behavior, and Worker internal key forwarding. |
| V2 contracts and Monitors | `backend/tests/contracts/v2-contracts.test.ts`, `backend/tests/routes/monitors.test.ts`, `frontend/tests/components/MonitorsPage.test.tsx` | Backend source metadata, monitor CRUD, type-specific config validation, and unified Agent Probe/HTTP/TCP creation. |
| Runtime latest state | `backend/tests/routes/monitor-latest.test.ts`, `backend/tests/routes/scheduled.test.ts`, `server-probe/tests/v2_push_test.go` | Worker cron writes `check_results`, probe pushes update v2 agent state, and `monitor_latest` stays current without an open dashboard. |
| Public Status and Settings | `backend/tests/routes/public-status.test.ts`, `frontend/tests/components/PublicStatus.test.tsx`, `frontend/tests/components/Settings.test.tsx` | Redacted public DTOs, visibility controls, private slug behavior, and no admin sidebar on `/status`. |
| Alerts and Notifications | `backend/tests/alerts/alert-engine.test.ts`, `backend/tests/routes/alerts.test.ts`, `backend/tests/notifications/dispatcher.test.ts`, `backend/tests/routes/notifications.test.ts`, `frontend/tests/components/Alerts.test.tsx`, `frontend/tests/components/Settings.test.tsx` | Rule validation, alert state/history, Webhook/Telegram dispatch, redacted channel config, and Email reserved/disabled state. |
| Statistics | `backend/tests/stats/statistics-rollup.test.ts`, `backend/tests/routes/statistics.test.ts`, `frontend/tests/components/Statistics.test.tsx` | D1-derived rollups, `STATISTICS_CACHE` snapshots, leaderboards, trends, and no-data states. |
| Final app shell and deployment | `frontend/tests/components/App.test.tsx`, `scripts/tests/self-host-cloudflare.test.sh` | Dashboard/Monitors/Statistics/Alerts/Settings navigation, legacy Agentless removal, Pages `/status`, v2 resource provisioning, Public Status summary output, and secret non-disclosure. |

## Phase 10 Historical Coverage

| Area | Primary tests | Purpose |
|------|---------------|---------|
| Self-host deployment preflight | `scripts/tests/self-host-cloudflare.test.sh` | Missing secrets, invalid `resource_prefix`, Cloudflare permission/account summaries, and secret non-disclosure. |
| Session continuity | `backend/tests/routes/auth.test.ts`, `frontend/tests/hooks/useAuth.test.tsx`, `frontend/tests/components/LoginGate.test.tsx` | 15-minute access JWT, 60-minute refresh cookie, refresh rotation, restore/expired copy, and no local/session storage. |
| Nodes lifecycle backend | `backend/tests/routes/nodes.test.ts` | Agentless node creation, safe edit fields, pause/resume, archive deletion, active filtering, raw metrics preservation, and probe-secret rejection. |
| One-command probe install | `backend/tests/routes/nodes.test.ts`, `frontend/tests/components/ProbeSetup.test.tsx`, `frontend/tests/components/Settings.test.tsx`, `bash scripts/install-probe.sh --help` | `install_command`, `install_script_url`, master-secret exclusion, command-first UI, and manual fallback. |
| Docker data path | `server-probe/tests/docker_test.go`, `backend/tests/routes/docker-data-path.test.ts` | Docker collector JSON, unavailable Docker handling, signed push storage, compressed `containers_json`, and metrics API container output. |
| Nodes management frontend | `frontend/tests/components/NodeList.test.tsx`, `frontend/tests/components/App.test.tsx` | Responsive card/list contract, metric icons/no-data labels, lifecycle actions, drawer, Docker rows, delete dialog, and Add Node chooser. |
| Agentless backend | `backend/tests/agentless/checks.test.ts`, `backend/tests/routes/agentless.test.ts`, `backend/tests/routes/scheduled.test.ts` | HTTP/TCP runners, unsupported TCP target rejection, create/list/pause/resume/archive routes, and scheduled result production. |
| Agentless frontend | `frontend/tests/components/AgentlessPage.test.tsx`, `frontend/tests/components/App.test.tsx` | HTTP form, TCP fallback, backend scheduler copy, tabs, minimum fields, recent results, and navigation. |

## Mocking And Test Seams

- Frontend uses MSW for API responses and Testing Library user events for interactions.
- Backend Agentless runners accept injected `fetchImpl` and `connectImpl` so tests never perform real network or TCP operations.
- Go Docker collection exposes a deterministic test seam while preserving `CollectDockerMetrics()` for production callers.
- Deployment shell tests use fake commands and temp summaries rather than real Cloudflare credentials.

## Coverage And Gates

- No global coverage threshold is currently enforced.
- Preferred Phase 11 verification bundle:
  ```bash
  pnpm build
  bash scripts/tests/self-host-cloudflare.test.sh
  pnpm --filter backend test
  pnpm --filter frontend test
  pnpm --filter frontend lint
  cd server-probe && go test ./...
  ```
- `bash scripts/smoke-test.sh --env self-host` validates a deployed self-host environment when `API_BASE_URL`, `PROBE_BASE_URL`, and `PAGES_URL` are supplied. It is not a local no-credential docs gate.

## Known Caveats

- Backend Workers pool tests may print Cloudflare runtime diagnostics even when Vitest exits 0; trust the process exit code and test summary.
- Backend app typecheck is not yet a required deployment gate per Phase 10 decision D-33.
- Visual regression testing is intentionally deferred.

---

*Testing analysis updated: 2026-05-06*
