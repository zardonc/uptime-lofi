---
phase: 08-quality-assurance-testing
plan: 05
subsystem: testing
tags: [go, testing, httptest, hmac, viper, docker]
requires:
  - phase: 08-01
    provides: probe test infrastructure and committed server-probe test directory
provides:
  - BatchPusher coverage for flush, retry, backoff, batch threshold, and HMAC headers
  - Collector and Docker coverage for system metrics and daemon-unavailable behavior
  - Expanded config and crypto coverage for defaults, env/YAML loading, and deterministic signatures
affects: [server-probe, phase-08, quality-assurance]
tech-stack:
  added: []
  patterns: [Go httptest-based transport verification, injectable backoff dependencies for probe tests, isolated Viper config instances]
key-files:
  created: [server-probe/tests/pusher_test.go, server-probe/tests/collector_test.go, server-probe/tests/docker_test.go]
  modified: [server-probe/internal/pusher/pusher.go, server-probe/internal/config/config.go, server-probe/tests/config_test.go, server-probe/tests/crypto_test.go]
key-decisions:
  - "Added NewBatchPusherWithDeps so retry/backoff behavior can be tested deterministically without slowing the suite."
  - "Moved probe config loading to a fresh viper instance per call to prevent cross-test state leakage while supporting defaults and overrides."
patterns-established:
  - "Use httptest servers plus signature recomputation to validate outbound probe batches."
  - "Use short-mode skips for Docker-dependent probe tests so the suite remains portable across non-Docker environments."
requirements-completed: [REQ-001, REQ-002]
duration: 1h 8m
completed: 2026-04-17
---

# Phase 08 Plan 05: Go probe coverage for pusher retries, collector metrics, and config/HMAC correctness Summary

**Go probe tests now verify HMAC-signed batch pushing with retries, real system metric collection, Docker fallback behavior, and defaults-aware config/HMAC helpers.**

## Performance

- **Duration:** 1h 8m
- **Started:** 2026-04-17T09:15:00Z
- **Completed:** 2026-04-17T16:23:34Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments
- Added `httptest`-driven coverage for `BatchPusher` success, retry, backoff, batch threshold flushing, and signature/header generation.
- Added collector and Docker tests that validate CPU/memory sampling, ping behavior, and safe Docker skipping or fallback on machines without a daemon.
- Expanded config and crypto coverage with defaults, YAML/env precedence, validation failures, and deterministic/key-sensitive HMAC assertions.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create BatchPusher tests with httptest mock server** - `c52bcda` (feat)
2. **Task 2: Create Collector and Docker tests** - `1985e0c` (test)
3. **Task 3: Expand existing config and crypto tests** - `761a88d` (test)

**Plan metadata:** pending

## Files Created/Modified
- `server-probe/tests/pusher_test.go` - Covers BatchPusher flush success, retry, backoff behavior, batch threshold flushing, and HMAC verification.
- `server-probe/internal/pusher/pusher.go` - Adds injectable HTTP/backoff dependencies, batch-threshold auto flush, and explicit signature headers required by the new tests.
- `server-probe/tests/collector_test.go` - Covers CPU, memory, repeated collection, and ping helper behavior.
- `server-probe/tests/docker_test.go` - Verifies short-mode skips and graceful Docker-unavailable handling.
- `server-probe/internal/config/config.go` - Uses isolated Viper instances and explicit defaults for testable config loading.
- `server-probe/tests/config_test.go` - Covers defaults, env override precedence, YAML parsing, and validation failures.
- `server-probe/tests/crypto_test.go` - Covers deterministic, empty-message, different-key, and different-message signature cases.

## Decisions Made
- Added `NewBatchPusherWithDeps` rather than sleeping through production backoff timing so pusher retry tests remain fast and deterministic.
- Added explicit config defaults for `api_url`, `node_id`, and `enable_docker`, while still requiring `psk`, so the config tests can meaningfully validate default loading and override precedence.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added explicit probe signature headers and batch-threshold flushing**
- **Found during:** Task 1 (Create BatchPusher tests with httptest mock server)
- **Issue:** Existing `BatchPusher` only emitted `Authorization` and `X-Timestamp`, and `AddMetric` never auto-flushed at a batch threshold, which left plan-required header and accumulation behavior untestable and incomplete.
- **Fix:** Added `X-Node-Id` and `X-Signature` headers, introduced `maxBatchSize`, and triggered `FlushToEdge` when the buffer reaches the threshold.
- **Files modified:** `server-probe/internal/pusher/pusher.go`
- **Verification:** `cd server-probe && go test ./tests/ -v -run TestPusher`
- **Committed in:** `c52bcda`

**2. [Rule 3 - Blocking] Made backoff and config state injectable for reliable tests**
- **Found during:** Task 1 and Task 3
- **Issue:** Production backoff took ~90s to fail in tests, and package-level Viper state could leak across config test cases.
- **Fix:** Added `NewBatchPusherWithDeps` for deterministic retry timing and switched config loading to a fresh `viper.New()` instance with defaults per call.
- **Files modified:** `server-probe/internal/pusher/pusher.go`, `server-probe/internal/config/config.go`
- **Verification:** `cd server-probe && go test ./tests/ -v -cover` and `cd server-probe && go test ./tests/ -v -short`
- **Committed in:** `c52bcda`, `761a88d`

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 blocking)
**Impact on plan:** Both changes were required to make the planned probe coverage practical and to align runtime behavior with the plan's required flush/header semantics.

## Issues Encountered
- `go test ./tests/ -v -cover` reports `coverage: [no statements]` because the package under test is `package tests`, so Go only reports coverage for that package boundary even though internal packages are exercised through exported APIs.
- Docker availability depends on the local Windows daemon/pipe; full Docker enumeration therefore skips cleanly on this machine while `-short` skips all Docker-specific assertions as intended.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Probe-side test coverage is in place for pusher, collector, Docker, config, and crypto behavior.
- Phase 08 can proceed to the remaining checkpointed 08-06 flow with the probe test suite now green in both normal and short modes.

## Self-Check: PASSED

- Summary file exists and all three task commits are present in git history.

---
*Phase: 08-quality-assurance-testing*
*Completed: 2026-04-17*
