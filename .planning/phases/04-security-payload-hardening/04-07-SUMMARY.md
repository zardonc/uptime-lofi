---
phase: 04-security-payload-hardening
plan: 07
subsystem: tech-debt
tags: [typescript, hono, cors, crypto, refactoring, DRY]

# Dependency graph
requires:
  - phase: 04-05
    provides: JWT auth hardening, input sanitization
  - phase: 04-06
    provides: Security headers, rate limiting
provides:
  - Shared crypto utility (calculateHash, generateSalt)
  - Consolidated TrendPoint type definition
  - Hono CORS middleware replacing custom implementation
  - Settings page proper auth-aware navigation
  - Activity feed with real timestamps
affects: [future backend routes, frontend type consistency, activity feed]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Shared utility modules over duplicated functions
    - Centralized type definitions in api/types.ts
    - Hono built-in middleware over custom implementations

key-files:
  created:
    - backend/src/utils/crypto.ts
  modified:
    - backend/src/routes/auth.ts
    - backend/src/routes/settings.ts
    - frontend/src/api/types.ts
    - frontend/src/data/mockData.ts
    - frontend/src/hooks/useMetrics.ts
    - backend/src/index.ts
    - frontend/src/components/Settings.tsx
    - frontend/src/App.tsx

key-decisions:
  - "TrendPoint shape preserved as {time, cpu, mem, ping} — plan's proposed {timestamp, value} didn't match actual usage"
  - "Settings uses logout() + LoginGate state transition instead of navigation (no /login route exists)"
  - "deriveActivity uses last_heartbeat with formatRelativeTime helper instead of hardcoded 'now'"

patterns-established:
  - "Utility extraction: shared functions live in backend/src/utils/ rather than per-route duplication"
  - "Type centralization: frontend/src/api/types.ts is the single source of truth for shared types"
  - "Middleware preference: use framework built-ins (hono/cors) over custom reimplementations"

requirements-completed:
  - REQ-001
  - REQ-003

# Metrics
duration: ~5min
completed: 2026-04-03
---

# Phase 04 Plan 07: Tech Debt Cleanup Summary

**Eliminated duplicated code, consolidated types, replaced custom CORS, and fixed stale timestamps across backend and frontend.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-03T18:13:28Z
- **Completed:** 2026-04-03T18:18:00Z
- **Tasks:** 5
- **Files modified:** 8

## Accomplishments

- Extracted shared `calculateHash` and `generateSalt` to `backend/src/utils/crypto.ts`, removing duplicates from auth.ts and settings.ts
- Consolidated `TrendPoint` type definition to `frontend/src/api/types.ts`, removing duplicates from mockData.ts and useMetrics.ts
- Replaced 48-line custom CORS implementation with Hono's built-in `hono/cors` middleware, added Vary: Origin header
- Fixed Settings page `window.location.replace('/login')` to use `logout()` from auth context — LoginGate handles state transition
- Replaced hardcoded `timestamp: 'now'` in deriveActivity with actual `last_heartbeat` using relative time formatting

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract shared crypto utility** - `c6b675f` (feat)
2. **Task 2: Consolidate TrendPoint type** - `b521939` (feat)
3. **Task 3: Replace custom CORS with hono/cors** - `7853378` (feat)
4. **Task 4: Fix Settings page hard-reload** - `4e19d80` (fix)
5. **Task 5: Fix deriveActivity stale timestamps** - `a7145c9` (fix)

## Files Created/Modified

- `backend/src/utils/crypto.ts` — NEW: Shared crypto utilities (calculateHash, generateSalt)
- `backend/src/routes/auth.ts` — Removed local calculateHash, imports from utils/crypto
- `backend/src/routes/settings.ts` — Removed local calculateHash, imports from utils/crypto
- `frontend/src/api/types.ts` — Added TrendPoint type definition
- `frontend/src/data/mockData.ts` — Removed local TrendPoint, imports from api/types
- `frontend/src/hooks/useMetrics.ts` — Removed local TrendPoint, imports from api/types
- `backend/src/index.ts` — Replaced custom CORS with hono/cors middleware + Vary: Origin
- `frontend/src/components/Settings.tsx` — Replaced window.location.replace with auth logout()
- `frontend/src/App.tsx` — deriveActivity now uses last_heartbeat with formatRelativeTime

## Decisions Made

- **TrendPoint shape:** Plan proposed `{timestamp: number, value: number}` but actual code uses `{time: string, cpu: number, mem: number, ping: number}`. Kept actual shape to avoid breaking all consumers.
- **Settings navigation:** No `/login` route exists — LoginGate handles auth state. Using `logout()` clears the access token, causing LoginGate to show the login form automatically.
- **Activity timestamps:** Used `last_heartbeat` (Unix timestamp) from ApiNode type with a `formatRelativeTime` helper for human-readable output like "5 minutes ago".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TrendPoint type shape mismatch**
- **Found during:** Task 2 (Consolidate TrendPoint type)
- **Issue:** Plan specified `TrendPoint` as `{timestamp: number, value: number}` but actual code uses `{time: string, cpu: number, mem: number, ping: number}` in both mockData.ts and useMetrics.ts
- **Fix:** Consolidated using the actual shape from the codebase instead of the plan's proposed shape
- **Files modified:** frontend/src/api/types.ts, frontend/src/data/mockData.ts, frontend/src/hooks/useMetrics.ts
- **Verification:** TypeScript compilation passes, type imports resolve correctly
- **Committed in:** b521939 (Task 2 commit)

**2. [Rule 1 - Bug] verbatimModuleSyntax re-export error**
- **Found during:** Task 2 (Consolidate TrendPoint type)
- **Issue:** `export { TrendPoint }` fails with verbatimModuleSyntax enabled — requires `export type`
- **Fix:** Changed to `export type { TrendPoint }` in both mockData.ts and useMetrics.ts
- **Files modified:** frontend/src/data/mockData.ts, frontend/src/hooks/useMetrics.ts
- **Verification:** LSP diagnostics clean for re-export errors
- **Committed in:** b521939 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bug fixes)
**Impact on plan:** Both fixes necessary for correctness. Plan's TrendPoint shape was a template example that didn't match the actual codebase.

## Issues Encountered

- Pre-existing LSP errors in backend (missing binding types for EMERGENCY_UNLOCK_KEY, JWT_AUDIENCE, JWT_ISSUER) — unrelated to this plan's changes, not fixed
- Pre-existing LSP errors in backend/src/index.ts (health check type mismatch) — unrelated to CORS changes, not fixed

## Known Stubs

None — all changes wire real data and functionality.

## Next Phase Readiness

- CONCERNS.md items addressed: duplicated calculateHash, duplicated TrendPoint, custom CORS, Settings hard-reload, deriveActivity timestamps
- Backend utility pattern established for future extractions
- Frontend type centralization pattern established for future type consolidations

---
*Phase: 04-security-payload-hardening*
*Completed: 2026-04-03*
