---
phase: 11-page-and-functionality-refactor
plan: 05
subsystem: public-status
tags: [public-status, settings, redaction, pages-functions, react]

requires:
  - phase: 11-02
    provides: Pages Functions session-gated admin proxy and internal Worker trust boundary
  - phase: 11-03
    provides: v2 Monitor domain model and management UI
  - phase: 11-04
    provides: monitor_latest runtime snapshots
provides:
  - Safe unauthenticated Public Status backend service and routes
  - Pages Functions public status and monitor routes
  - Public Status React page without admin shell
  - Settings controls for public status enablement, slug, fields, and monitor visibility
affects: [phase-11-public-status, settings, monitors, pages-functions]

tech-stack:
  added: []
  patterns: [kv_settings-backed public configuration, server-side public DTO redaction]

key-files:
  created:
    - backend/src/services/publicStatusService.ts
    - backend/src/routes/publicStatus.ts
    - backend/tests/routes/public-status.test.ts
    - functions/api/public/status.ts
    - functions/api/public/monitors.ts
    - frontend/src/components/PublicStatus.tsx
    - frontend/tests/components/PublicStatus.test.tsx
  modified:
    - backend/src/routes/api.ts
    - backend/src/routes/settings.ts
    - backend/src/schemas/v2.ts
    - frontend/src/App.tsx
    - frontend/src/api/client.ts
    - frontend/src/api/types.ts
    - frontend/src/components/Settings.tsx
    - frontend/src/index.css
    - frontend/tests/components/Settings.test.tsx
    - frontend/tests/mocks/handlers.ts

key-decisions:
  - "Public Status uses kv_settings for exposure policy and existing monitors.public_visible for per-monitor visibility."
  - "Private slugs are enforced server-side but treated as discovery reduction, not authorization."
  - "Public DTOs are built from monitor_latest and monitors through a redaction service instead of forwarding admin DTOs."

patterns-established:
  - "Pages Functions public routes forward only fixed read-only paths."
  - "Settings saves public exposure policy separately from dashboard password settings."

requirements-completed: [REQ-11-03, REQ-11-04, REQ-11-08, REQ-11-10]

duration: 58 min
completed: 2026-05-22
---

# Phase 11 Plan 05: Public Status and Settings Visibility Summary

**Safe Public Status sharing with server-side redaction, fixed public Pages routes, and admin-controlled exposure settings**

## Performance

- **Duration:** 58 min
- **Started:** 2026-05-22T15:18:00-07:00
- **Completed:** 2026-05-22T16:16:12-07:00
- **Tasks:** 3
- **Files modified:** 17

## Accomplishments

- Added a `publicStatusService` that reads public exposure settings, filters hidden monitors, shapes public DTOs from `monitor_latest`, and omits secrets/internal operational fields.
- Added Worker `/api/public/status` and `/api/public/monitors` routes plus Pages Functions `/api/public/*` routes that are unauthenticated but fixed-path and read-only.
- Added a standalone `/status` React page without the admin sidebar and expanded Settings with Public Status enablement, private slug, visible fields, and per-monitor visibility controls.
- Added backend redaction tests and frontend Public Status/Settings coverage.

## Task Commits

1. **Task 1: Add public status settings and redaction service** - `b2d3a1b` (feat)
2. **Task 2: Expose Pages Functions public routes** - `b2d3a1b` (feat)
3. **Task 3: Build Public Status page and Settings controls** - `b2d3a1b` (feat)

**Plan metadata:** pending docs commit

## Files Created/Modified

- `backend/src/services/publicStatusService.ts` - Public settings persistence, monitor visibility updates, and redacted Public Status DTO construction.
- `backend/src/routes/publicStatus.ts` - Worker public read routes for status and monitors.
- `backend/src/routes/settings.ts` - Settings read endpoint and Public Status settings update endpoint.
- `functions/api/public/status.ts` - Pages public status route that forwards only the fixed public status path.
- `functions/api/public/monitors.ts` - Pages public monitors route that forwards only the fixed public monitors path.
- `frontend/src/components/PublicStatus.tsx` - Standalone unauthenticated Public Status page.
- `frontend/src/components/Settings.tsx` - Public Status controls added beside dashboard security and probe setup.
- `frontend/src/api/client.ts` and `frontend/src/api/types.ts` - Public Status and Settings client contracts.
- `frontend/src/index.css` - Public Status and Settings layout styles.
- `backend/tests/routes/public-status.test.ts` - Disabled, hidden-monitor, redaction, private slug, field visibility, and write-method coverage.
- `frontend/tests/components/PublicStatus.test.tsx` - Public page shell and hidden-field coverage.
- `frontend/tests/components/Settings.test.tsx` and `frontend/tests/mocks/handlers.ts` - Settings visibility controls and mock API updates.

## Decisions Made

- Public status settings are stored in `kv_settings` under `public_status_config` to avoid a new migration for this plan.
- Per-monitor public visibility continues to use the `monitors.public_visible` column created earlier in Phase 11.
- When a private slug is configured, missing or incorrect slug requests receive the same unavailable response as disabled Public Status.

## Deviations from Plan

None - plan executed exactly as written.

---

**Total deviations:** 0 auto-fixed.
**Impact on plan:** No scope changes.

## Issues Encountered

- Backend full `typecheck` still fails in the existing `tests/functions/pages-auth.test.ts` setup because function files are outside the backend `rootDir`; backend app typecheck passes.
- Browser visual smoke test could not run because the local Chrome executable was not available to the in-app browser tool.

## User Setup Required

None - no external service configuration required.

## Verification

- `pnpm --filter backend test -- tests/routes/public-status.test.ts` - passed; Vitest ran 20 backend files / 118 tests.
- `pnpm --filter frontend test -- tests/components/PublicStatus.test.tsx tests/components/Settings.test.tsx` - passed; Vitest ran 15 frontend files / 61 tests.
- `pnpm --filter backend typecheck:app` - passed.
- `pnpm --filter frontend typecheck` - passed.
- `git diff --check` - passed, with line-ending warnings only.

## Next Phase Readiness

Plan 11-05 is complete. Public Status now depends on subsequent phase work only for richer incident data; Phase 11 can proceed to alert rules and notification-related plans.

---
*Phase: 11-page-and-functionality-refactor*
*Completed: 2026-05-22*
