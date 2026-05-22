---
phase: 11-page-and-functionality-refactor
plan: 03
subsystem: api-ui-database
tags: [cloudflare-d1, hono, react, monitors, vitest]

requires:
  - phase: 11-01
    provides: V2 DTO and source metadata contracts
  - phase: 11-02
    provides: Pages Functions admin proxy and Worker internal API boundary
provides:
  - V2 Monitor D1 tables and latest read model
  - Internal Monitor CRUD API for agent, HTTP, and TCP monitor types
  - Monitors frontend page with create, edit-safe-fields, pause/resume, details placeholder, filtering, search, and archive confirmation
affects: [phase-11, monitors, frontend-shell, cron, public-status, statistics]

tech-stack:
  added: []
  patterns: [repository-backed-internal-routes, pages-v1-admin-client, honest-no-data-monitor-cards]

key-files:
  created:
    - backend/migrations/0006_v2_core.sql
    - backend/src/routes/monitors.ts
    - backend/src/services/monitorRepository.ts
    - backend/tests/routes/monitors.test.ts
    - frontend/src/components/MonitorsPage.tsx
    - frontend/src/hooks/useMonitors.ts
    - frontend/tests/components/MonitorsPage.test.tsx
  modified:
    - backend/src/routes/internal.ts
    - backend/src/schemas/v2.ts
    - frontend/src/App.tsx
    - frontend/src/api/client.ts
    - frontend/src/api/types.ts
    - frontend/src/components/Sidebar.tsx
    - frontend/src/index.css
    - frontend/tests/mocks/handlers.ts
    - .planning/ROADMAP.md
    - .planning/STATE.md

key-decisions:
  - "Monitor CRUD lives behind /api/internal/v1/monitors and is reached by the existing Pages /api/v1 proxy, keeping browser requests session-gated and Worker writes internal-key-gated."
  - "Agent monitor creation stores a safe placeholder record only; probe credential generation remains out of this route to avoid exposing master secrets."
  - "The Monitors UI renders unknown/no-result monitors with explicit empty metric values instead of synthetic latency, uptime, CPU, or memory data."

patterns-established:
  - "Monitor repository converts D1 rows to strict v2 DTOs and centralizes archived filtering."
  - "Type-specific monitor configs are validated with Zod before storage."
  - "Frontend v2 API methods use /api/v1/monitors so Pages Functions remains the browser-facing boundary."

requirements-completed: [REQ-11-02, REQ-11-08, REQ-11-10]

duration: 30 min
completed: 2026-05-22
---

# Phase 11 Plan 03: Unified Monitor Domain Summary

**V2 Monitor D1 schema, internal CRUD API, and unified React Monitors management page**

## Performance

- **Duration:** 30 min
- **Started:** 2026-05-22T14:50:00-07:00
- **Completed:** 2026-05-22T15:20:00-07:00
- **Tasks:** 3
- **Files modified:** 17

## Accomplishments

- Added the `monitors`, `check_results`, `agent_metrics`, and `monitor_latest` v2 tables with indexes for active monitor and time-series reads.
- Added a Monitor repository and internal Hono route mounted at `/api/internal/v1/monitors` for list/get/create/update/pause/resume/archive.
- Added frontend v2 monitor types, client methods, `useMonitors`, sidebar navigation, and a unified `MonitorsPage`.
- Added backend and frontend tests covering monitor type creation, validation, no-data rendering, and archive confirmation.

## Task Commits

1. **Task 1: Add v2 monitor schema and repository** - `beab233` (feat)
2. **Task 2: Implement internal Monitor CRUD routes** - `beab233` (feat)
3. **Task 3: Build Monitors frontend surface** - `beab233` (feat)

**Plan metadata:** pending docs commit

## Files Created/Modified

- `backend/migrations/0006_v2_core.sql` - V2 Monitor source tables and latest read model.
- `backend/src/services/monitorRepository.ts` - D1 repository with type-specific validation and DTO normalization.
- `backend/src/routes/monitors.ts` - Internal Monitor CRUD API.
- `backend/src/routes/internal.ts` - Mounts Monitor routes under the internal trust boundary.
- `backend/src/schemas/v2.ts` - Adds monitor create/update schemas and operational DTO fields.
- `backend/tests/routes/monitors.test.ts` - Internal Monitor route coverage.
- `frontend/src/api/client.ts` and `frontend/src/api/types.ts` - V2 Monitors client methods and request/response types.
- `frontend/src/hooks/useMonitors.ts` - Monitor data-loading hook.
- `frontend/src/components/MonitorsPage.tsx` - Unified monitor management page.
- `frontend/src/components/Sidebar.tsx` and `frontend/src/App.tsx` - Monitors navigation wiring.
- `frontend/src/index.css` - Monitors page layout, cards, toolbar, and responsive form styles.
- `frontend/tests/components/MonitorsPage.test.tsx` and `frontend/tests/mocks/handlers.ts` - Frontend monitor page coverage and MSW fixtures.

## Decisions Made

- Internal API only: Monitor writes are exposed through the Worker internal v1 API and the existing Pages Functions proxy, not directly to browsers.
- Safe agent placeholder: Agent monitor creation does not return probe secrets; credential generation remains in the existing probe setup path until a later compatibility plan.
- Honest data display: Unknown monitors show no-result copy and `--` metric placeholders, avoiding fake operational data.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** No scope creep.

## Issues Encountered

- Wrangler/Vitest emitted Windows sandbox warnings while trying to write logs outside the workspace, but backend tests completed and passed.
- Frontend chart tests still emit existing Recharts zero-size warnings in jsdom; the monitor test suite passes.

## Verification

- `pnpm --filter backend test -- tests/routes/monitors.test.ts` - passed (18 backend test files, 111 tests)
- `pnpm --filter frontend test -- tests/components/MonitorsPage.test.tsx` - passed (14 frontend test files, 58 tests)
- `pnpm --filter frontend typecheck` - passed
- Acceptance spot-checks:
  - `backend/migrations/0006_v2_core.sql` contains `CREATE TABLE IF NOT EXISTS monitors` and `monitor_latest`.
  - `monitorRepository.ts` filters active lists with `archived_at IS NULL`.
  - HTTP and TCP config validation is covered by route tests.
  - Monitors UI tests cover `Add Monitor`, `Agent Probe`, `HTTP Check`, `TCP Check`, no fake metric values, and delete confirmation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 11-04 can build Worker cron, probe ingestion compatibility, and latest-state snapshots on top of `monitors`, `check_results`, `agent_metrics`, and `monitor_latest`.

---
*Phase: 11-page-and-functionality-refactor*
*Completed: 2026-05-22*
