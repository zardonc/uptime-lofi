---
phase: 11-page-and-functionality-refactor
plan: 06
subsystem: alerts
tags: [alerts, state-machine, d1, react, monitor-latest]

requires:
  - phase: 11-03
    provides: v2 Monitor domain model and internal Worker APIs
  - phase: 11-04
    provides: monitor_latest runtime snapshots and probe/check result ingestion
provides:
  - Durable alert rules, rule state, and alert history tables
  - Monitor-type-aware alert rule CRUD API
  - Alert evaluation state machine with pending, firing, suppressed, and recovered events
  - Alerts admin page with Rules and History tabs
affects: [phase-11-alerts, notifications, monitors, probe-ingestion, scheduled-checks]

tech-stack:
  added: []
  patterns: [D1-backed alert state machine, internal v1 alert routes, monitor-type condition validation]

key-files:
  created:
    - backend/migrations/0007_v2_alerts.sql
    - backend/src/routes/alerts.ts
    - backend/src/services/alertEngine.ts
    - backend/tests/alerts/alert-engine.test.ts
    - backend/tests/routes/alerts.test.ts
    - frontend/src/components/AlertsPage.tsx
    - frontend/tests/components/Alerts.test.tsx
  modified:
    - backend/src/routes/internal.ts
    - backend/src/routes/push.ts
    - backend/src/schemas/v2.ts
    - backend/src/services/checkRunner.ts
    - frontend/src/App.tsx
    - frontend/src/api/client.ts
    - frontend/src/api/types.ts
    - frontend/src/index.css
    - frontend/tests/mocks/handlers.ts

key-decisions:
  - "Alert rules are scoped to a concrete monitor for this plan so condition validation can use the monitor type before storage."
  - "Notification delivery is represented as durable alert event intent/status rows; actual Webhook and Telegram dispatch remains for Plan 11-07."
  - "Silent hours use stored HH:mm windows and IANA timezone names, defaulting to UTC."

patterns-established:
  - "Alert evaluation runs immediately after v2 scheduled check writes and probe latest updates."
  - "Alert history uses append-only events while current incident state lives in alert_rule_state."

requirements-completed: [REQ-11-05, REQ-11-08, REQ-11-10]

duration: 74 min
completed: 2026-05-22
---

# Phase 11 Plan 06: Alerts Rules, State Machine, and History Summary

**Durable monitor-scoped alert rules with validation, incident state transitions, history events, and a real Alerts admin page**

## Performance

- **Duration:** 74 min
- **Started:** 2026-05-22T15:22:00-07:00
- **Completed:** 2026-05-22T16:35:36-07:00
- **Tasks:** 3
- **Files modified:** 16

## Accomplishments

- Added D1 tables for `alert_rules`, `alert_rule_state`, and `alert_events`.
- Added internal `/api/internal/v1/alerts` rules/history routes with monitor-type-aware validation for offline, latency, HTTP status, CPU, and memory conditions.
- Added `evaluateAlerts` with confirmation delay, dedupe/no duplicate firing, repeat interval, silent-hours suppression, and recovery events.
- Wired alert evaluation after v2 scheduled monitor checks and probe/latest updates.
- Replaced the Alerts placeholder with Rules and History tabs, rule creation, monitor-aware condition options, channel placeholder, and collapsed advanced controls.

## Task Commits

1. **Task 1: Add alert schema and monitor-type-aware rule validation** - `648b67e` (feat)
2. **Task 2: Implement alert state machine and history** - `648b67e` (feat)
3. **Task 3: Build Alerts Rules and History UI** - `648b67e` (feat)

**Plan metadata:** pending docs commit

## Files Created/Modified

- `backend/migrations/0007_v2_alerts.sql` - Alert rules, state, and history schema.
- `backend/src/routes/alerts.ts` - Internal v1 alert rule CRUD, enable/disable/delete, history, and condition validation.
- `backend/src/services/alertEngine.ts` - Alert state machine and event writer.
- `backend/src/services/checkRunner.ts` and `backend/src/routes/push.ts` - Alert evaluation hooks after latest-state writes.
- `backend/src/schemas/v2.ts` - Alert DTO, event DTO, create/update schemas, and condition types.
- `frontend/src/components/AlertsPage.tsx` - Alerts Rules and History UI.
- `frontend/src/api/client.ts` and `frontend/src/api/types.ts` - Alert API client contracts.
- `frontend/src/index.css` - Alerts page, form, cards, tabs, and history table styles.
- `backend/tests/routes/alerts.test.ts` and `backend/tests/alerts/alert-engine.test.ts` - Route validation/CRUD and state machine coverage.
- `frontend/tests/components/Alerts.test.tsx` and `frontend/tests/mocks/handlers.ts` - Alerts UI and mock API coverage.

## Decisions Made

- Rules require `monitor_id` for now; global/all-monitor rules can be layered later without weakening monitor-type validation.
- `ssl_expiry` remains unimplemented/disabled in this plan because no certificate expiry collector exists yet.
- Notification channels are represented by a placeholder channel id in the UI and durable pending/suppressed/not-required history status for Plan 11-07 to consume.

## Deviations from Plan

None - plan executed exactly as written.

---

**Total deviations:** 0 auto-fixed.
**Impact on plan:** No scope changes.

## Issues Encountered

- The first backend test run was blocked by sandboxed Wrangler/Miniflare log writes under AppData; rerunning with approved escalation completed successfully.
- Backend full `typecheck:test` still fails in the existing `tests/functions/pages-auth.test.ts` setup because function files are outside the backend `rootDir`; backend app typecheck passes.
- Browser visual smoke test could not run because the Browser plugin could not find a local Google Chrome executable.

## User Setup Required

None - no external service configuration required.

## Verification

- `pnpm --filter backend test -- tests/routes/alerts.test.ts tests/alerts/alert-engine.test.ts` - passed; Vitest ran 22 backend files / 124 tests.
- `pnpm --filter frontend test -- tests/components/Alerts.test.tsx` - passed; Vitest ran 16 frontend files / 64 tests.
- `pnpm --filter backend run typecheck:app` - passed.
- `pnpm --filter frontend typecheck` - passed.
- `git diff --check` - passed, with line-ending warnings only.

## Next Phase Readiness

Plan 11-06 is complete. Alert events now provide durable delivery intents and suppression/recovery history for Plan 11-07 notification dispatch.

---
*Phase: 11-page-and-functionality-refactor*
*Completed: 2026-05-22*
