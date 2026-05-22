---
phase: 11-page-and-functionality-refactor
plan: 04
subsystem: runtime-data
tags: [cloudflare-workers, d1, monitors, cron, probe, vitest, go]

requires:
  - phase: 11-03
    provides: V2 Monitor D1 tables, internal Monitor CRUD routes, and monitor_latest read model
provides:
  - Latest-state updater for v2 monitor check results and agent metrics
  - Worker cron runner for due v2 HTTP and TCP monitors
  - Probe ingestion bridge from existing signed node pushes to v2 agent_metrics and monitor_latest
affects: [phase-11, public-status, dashboard, statistics, alerts, probe-ingestion]

tech-stack:
  added: []
  patterns: [latest-read-model-upsert, bounded-worker-cron-runner, backward-compatible-probe-bridge]

key-files:
  created:
    - backend/src/services/monitorLatest.ts
    - backend/src/services/checkRunner.ts
    - backend/tests/routes/monitor-latest.test.ts
    - server-probe/tests/v2_push_test.go
  modified:
    - backend/src/index.ts
    - backend/src/routes/push.ts
    - backend/tests/routes/scheduled.test.ts
    - backend/tests/routes/push.test.ts

key-decisions:
  - "monitor_latest stores online/degraded/offline/unknown snapshots while paused remains derived from monitors.paused, preserving the existing table constraint."
  - "V2 cron checks reuse the proven HTTP/TCP target validation and Cloudflare socket logic from the Agentless runner, but write check_results and monitor_latest."
  - "Probe payloads remain unchanged; v2 agent metrics are written only when an agent monitor can be matched by monitor id, config node_id, or config legacy_node_id."

patterns-established:
  - "Runtime write paths update history tables first, then refresh monitor_latest for cheap Dashboard/Public Status reads."
  - "Probe ingestion keeps legacy raw_metrics/nodes writes authoritative and treats v2 agent metric bridging as additive."

requirements-completed: [REQ-11-02, REQ-11-09, REQ-11-10]

duration: 1h 20m
completed: 2026-05-22
---

# Phase 11 Plan 04: Runtime Data Summary

**V2 monitors now receive current status from Worker cron checks and existing probe pushes through monitor_latest snapshots**

## Performance

- **Duration:** 1h 20m
- **Started:** 2026-05-22T15:32:00-07:00
- **Completed:** 2026-05-22T16:52:00-07:00
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Added `monitorLatest` service helpers to upsert latest snapshots from synthetic check results and agent metrics.
- Added a bounded v2 `runDueMonitorChecks` cron runner for active HTTP/TCP monitors, including private/loopback target rejection via existing Cloudflare-safe validation.
- Wired the Worker scheduled handler to run both legacy Agentless checks and v2 Monitor checks.
- Bridged existing HMAC-authenticated probe pushes into v2 `agent_metrics` and `monitor_latest` without changing the Go probe payload or requiring master-secret knowledge.

## Task Commits

1. **Task 1: Implement monitor_latest update service** - `9675eef` (feat)
2. **Task 2: Run v2 HTTP/TCP monitors from Worker cron** - `09153ce` (feat)
3. **Task 3: Preserve probe ingestion while writing v2 agent metrics** - `36d1563` (feat)

## Files Created/Modified

- `backend/src/services/monitorLatest.ts` - Latest-state service for check results, agent metrics, paused/no-data snapshots, and public-safe projection.
- `backend/src/services/checkRunner.ts` - V2 Worker cron runner for due HTTP/TCP monitors.
- `backend/src/index.ts` - Scheduled handler now invokes the v2 monitor runner.
- `backend/src/routes/push.ts` - Existing probe pushes now optionally populate v2 agent metrics/latest state.
- `backend/tests/routes/monitor-latest.test.ts` - Latest-state status transition, paused/no-data, and public-safe projection tests.
- `backend/tests/routes/scheduled.test.ts` - Cron test now proves v2 checks write `check_results` and `monitor_latest`.
- `backend/tests/routes/push.test.ts` - Probe push test now proves v2 `agent_metrics` and latest state writes.
- `server-probe/tests/v2_push_test.go` - Go compatibility test documents unchanged probe payload shape.

## Decisions Made

- Paused state stays derived from `monitors.paused` instead of being inserted into `monitor_latest`, because the v2 schema intentionally limits latest rows to online/degraded/offline/unknown.
- V2 monitor checks reuse the existing Agentless validation/run functions so HTTP/TCP safety behavior stays consistent across old and new runtime paths.
- Probe v2 bridging is additive and non-breaking: if no v2 agent monitor matches a legacy node id, the legacy raw metrics path still succeeds.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** No scope creep.

## Issues Encountered

- Wrangler/Vitest emitted Windows sandbox warnings while trying to write debug logs outside the workspace, but the backend test run completed successfully.
- `pnpm --filter backend run typecheck:test` still fails on pre-existing Pages Functions `rootDir` issues from `backend/tests/functions/pages-auth.test.ts`; app typecheck passes and the runtime tests for this plan pass.
- `go test ./...` needed permission to use the normal Go build cache outside the workspace; after approval, it passed.

## Verification

- `pnpm --filter backend test -- tests/routes/monitor-latest.test.ts tests/routes/scheduled.test.ts` - passed (19 backend test files, 114 tests)
- `pnpm --filter backend test -- tests/routes/monitor-latest.test.ts tests/routes/scheduled.test.ts tests/routes/push.test.ts` - passed (19 backend test files, 114 tests)
- `pnpm --filter backend run typecheck:app` - passed
- `cd server-probe && go test ./...` - passed
- `pnpm --filter backend run typecheck:test` - failed on pre-existing Pages Functions `rootDir` configuration issues unrelated to this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 11-05 can build Public Status and status visibility controls on top of `monitor_latest` instead of scanning raw check history or agent payload history.

---
*Phase: 11-page-and-functionality-refactor*
*Completed: 2026-05-22*
