---
phase: 05-system-hardening
plan: 02
subsystem: auth
tags: [jwt, tokens, ttl, cloudflare-workers, hono]

# Dependency graph
requires:
  - phase: 04-security-hardening
    provides: Rate limiting middleware, JWT aud/iss validation, dashboard auth middleware
provides:
  - Extended access token TTL from 15min to 60min
  - Extended refresh token TTL from 7 days to 30 days
  - Named constants replacing hardcoded TTL magic numbers
  - Opportunistic expired token cleanup during login
affects: [frontend-session-handling, cron-cleanup]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Named constants for all TTL values (no magic numbers)
    - Opportunistic cleanup pattern (runs during login, not cron)

key-files:
  created: []
  modified:
    - backend/src/routes/auth.ts

key-decisions:
  - "Access token TTL extended to 60 minutes (3600s) — balances UX with security for monitoring dashboard"
  - "Refresh token TTL extended to 30 days (2,592,000s) — reduces forced re-logins while maintaining stateful rotation"
  - "cleanupExpiredTokens called opportunistically during login rather than via cron — lightweight, no additional infrastructure needed"

patterns-established:
  - "Named constants: ACCESS_TOKEN_TTL_SECONDS and REFRESH_TOKEN_TTL_SECONDS replace all hardcoded TTL math"
  - "Cookie Max-Age always matches REFRESH_TOKEN_TTL_SECONDS via constant reference"

requirements-completed: [REQ-005]

# Metrics
duration: 3min
completed: 2026-04-03
---

# Phase 05 Plan 02: Token TTL Extension Summary

**Extended JWT access tokens to 60 minutes and refresh tokens to 30 days with named constants and opportunistic expired token cleanup**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-03T18:40:00Z
- **Completed:** 2026-04-03T18:43:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- All hardcoded TTL magic numbers replaced with named constants (`ACCESS_TOKEN_TTL_SECONDS = 3600`, `REFRESH_TOKEN_TTL_SECONDS = 2592000`)
- Both `/login` and `/refresh` endpoints updated consistently
- Opportunistic `cleanupExpiredTokens` function added to prevent `refresh_tokens` table bloat without requiring a cron trigger

## Task Commits

Each task was committed atomically:

1. **Task 1: Update all TTL constants in auth.ts** - `b2c4208` (feat)
2. **Task 2: Add cleanupExpiredTokens helper and call in /login** - `76c2ff5` (feat)

## Files Created/Modified

- `backend/src/routes/auth.ts` - Updated TTL constants (60min access, 30d refresh), added cleanupExpiredTokens helper

## Decisions Made

None - followed plan as specified.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Pre-existing LSP errors (missing env var types in Bindings) were not caused by these changes and are tracked separately.

## User Setup Required

None - no external service configuration required. Token TTL changes take effect on next deployment. Existing sessions will retain their original expiration times; new logins will use the updated TTLs.

## Next Phase Readiness

- Token TTL extension complete, ready for 05-03 (rate limiting on /setup and /unlock)
- Expired token cleanup is opportunistic only; 05-06 should still implement cron-based cleanup for comprehensive table maintenance
- No blockers for subsequent plans

---
*Phase: 05-system-hardening*
*Completed: 2026-04-03*
