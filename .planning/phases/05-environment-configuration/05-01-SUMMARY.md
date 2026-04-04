---
phase: 05
plan: 01
subsystem: backend-auth
tags: [security, password-hashing, pbkdf2, tdd]
requires: []
provides:
  - SEC-001: PBKDF2 password hashing with 10,000 iterations
affects:
  - backend/src/utils/crypto.ts
  - backend/src/routes/auth.ts
  - backend/src/routes/settings.ts
tech-stack:
  added: [vitest, Web-Crypto-API-PBKDF2]
  patterns: [constant-time-comparison, salt-generation, migration-guard]
key-files:
  created:
    - backend/src/utils/crypto.test.ts
    - backend/vitest.config.ts
  modified:
    - backend/src/utils/crypto.ts
    - backend/src/routes/auth.ts
    - backend/src/routes/settings.ts
decisions:
  - Used Web Crypto API PBKDF2 instead of bcrypt (native to Cloudflare Workers)
  - Created separate hashToken function for non-password hashing (refresh tokens)
  - Migration guard rejects legacy SHA-256 hashes with clear re-setup message
metrics:
  duration: ~5min
  completed-date: "2026-04-03"
  tests: 6 passed
---

# Phase 05 Plan 01: PBKDF2 Password Hashing Migration Summary

**One-liner:** Migrated password hashing from single-iteration SHA-256 to PBKDF2-SHA256 with 10,000 iterations (~10ms CPU budget), including salt storage, constant-time verification, and migration guard for legacy hashes.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write PBKDF2 tests and implement crypto utilities | `0c03ea1` | crypto.ts, crypto.test.ts, vitest.config.ts |
| 2 | Migrate auth.ts and settings.ts to use new PBKDF2 functions | `afbc09d` | auth.ts, settings.ts |

## Implementation Details

### Crypto Utilities (`crypto.ts`)
- **hashPassword**: PBKDF2-SHA256 with 10,000 iterations, 32-byte output
- **verifyPassword**: Constant-time comparison to prevent timing attacks
- **hashToken**: Single-iteration SHA-256 for non-password use (refresh tokens)
- **generateSalt**: Unchanged - cryptographically secure random bytes
- **calculateHash**: Removed entirely

### Auth Routes (`auth.ts`)
- `/setup`: Generates salt, stores both `ui_lock_salt` and `ui_lock_hash`
- `/login`: Uses `verifyPassword` with salt; detects missing salt (legacy SHA-256) and returns clear error
- `/refresh`: Uses `hashToken` for refresh token hashing (SHA-256, not PBKDF2)

### Settings Routes (`settings.ts`)
- `/security`: Generates salt, stores both `ui_lock_salt` and `ui_lock_hash`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing test infrastructure**
- **Found during:** Task 1 start
- **Issue:** No vitest installed, no vitest.config.ts, no test runner configured
- **Fix:** Installed vitest as devDependency, created vitest.config.ts with node environment
- **Files modified:** backend/package.json, backend/vitest.config.ts
- **Commit:** `0c03ea1`

## Known Stubs

None. All functionality is fully wired and tested.

## Verification Results

```
✓ hashPassword returns consistent output for same inputs
✓ hashPassword produces different hashes for different salts  
✓ hashPassword completes in under 50ms (10,000 iterations budget)
✓ verifyPassword returns true for correct password
✓ verifyPassword returns false for wrong password
✓ generateSalt returns 32-char hex string with length=16

Test Files  1 passed (1)
Tests       6 passed (6)
```

## Self-Check: PASSED