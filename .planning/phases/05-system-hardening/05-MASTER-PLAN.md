# Phase 5: System Hardening & Quota Optimization - Master Plan

## Context

**User Request**: Create detailed plans for Phase 5 addressing all unhandled P0 and P1 items from Cloudflare Free Tier technical audit.

**Current System State**:
- Backend: Hono 4 + Cloudflare Workers + D1 SQLite
- Auth: JWT (HS256) for dashboard, HMAC-SHA256 for probes
- Current crypto.ts uses single SHA-256 iteration (insufficient for passwords)
- Access Token TTL: 15 min, Refresh Token TTL: 7 days
- /setup and /unlock have NO rate limiting
- Emergency Unlock only logs to console.warn (no session revocation)
- Login has 5+ serial D1 queries
- No Cron Triggers configured
- login_attempts stores plaintext IPs
- No KV namespace for session blacklist

**Discovery Level**: Level 1 - Quick Verification (known Cloudflare Workers + D1 stack, confirming syntax)

## Task Dependency Graph

| Task | Depends On | Reason |
|------|------------|--------|
| Task 1: PBKDF2 Migration | None | Foundation change, no prerequisites |
| Task 2: Token TTL Extension | None | Independent configuration change |
| Task 3: Rate Limiting /setup & /unlock | Task 1 | Needs crypto changes complete first |
| Task 4: Emergency Unlock + Audit + IP Hash | Task 1 | Uses new crypto functions, adds audit_log table |
| Task 5: Login Query Optimization | Task 1, Task 4 | Depends on merged settings query structure |
| Task 6: Cron Trigger + KV Blacklist | Task 2, Task 4 | Depends on TTL constants and audit infrastructure |

## Parallel Execution Graph

Wave 1 (Start Immediately):
├── Task 1: PBKDF2 Password Hashing Migration (P0-1)
└── Task 2: Token TTL Extension (P0-2)

Wave 2 (After Wave 1 completes):
├── Task 3: Rate Limiting /setup & /unlock (P0-4)
└── Task 4: Emergency Unlock + Audit + IP Hash (P0-5, P1-4)

Wave 3 (After Wave 2 completes):
├── Task 5: Login Query Optimization (P1-1)
└── Task 6: Cron Trigger + KV Blacklist (P1-2, P1-5)

Critical Path: Task 1 → Task 4 → Task 5
Estimated Parallel Speedup: 33% faster than sequential (4 waves → 3 waves)

## Tasks

### Task 1: PBKDF2 Password Hashing Migration (P0-1)

**Delegation Recommendation**:
- Category: `deep` - Requires cryptographic implementation with proper Web Crypto API usage and migration strategy
- Skills: [`tdd-workflow`] - Must write tests first to verify PBKDF2 behavior before implementation

**Skills Evaluation**:
- ✅ INCLUDED `tdd-workflow`: Critical for cryptographic changes - must verify hashing behavior, timing, and migration path
- ❌ OMITTED `frontend-design`: No UI changes
- ❌ OMITTED `ui-ux-pro-max`: Backend-only change

**Depends On**: None
**Acceptance Criteria**:
- crypto.ts exports `hashPassword()` and `verifyPassword()` using PBKDF2 with 10,000 iterations
- Hashing completes in 5-15ms (10ms target)
- Existing SHA-256 hashes detected and rejected with re-setup message
- All auth endpoints use new functions
- Test coverage >80% for crypto utilities

### Task 2: Token TTL Extension (P0-2)

**Delegation Recommendation**:
- Category: `quick` - Simple constant changes across known locations
- Skills: [`tdd-workflow`] - Verify token expiration behavior

**Skills Evaluation**:
- ✅ INCLUDED `tdd-workflow`: Tests verify new TTL values work correctly
- ❌ OMITTED `frontend-design`: No UI changes
- ❌ OMITTED `ui-ux-pro-max`: Backend configuration only

**Depends On**: None
**Acceptance Criteria**:
- Access Token TTL = 60 minutes (was 15)
- Refresh Token TTL = 30 days (was 7)
- Cookie Max-Age matches refresh token TTL
- Named constants replace magic numbers
- Expired token cleanup function added

### Task 3: Rate Limiting /setup & /unlock (P0-4)

**Delegation Recommendation**:
- Category: `quick` - Add existing middleware to new routes
- Skills: [`tdd-workflow`] - Verify rate limiting behavior

**Skills Evaluation**:
- ✅ INCLUDED `tdd-workflow`: Tests confirm rate limits trigger correctly
- ❌ OMITTED `frontend-design`: No UI changes
- ❌ OMITTED `ui-ux-pro-max`: Backend middleware only

**Depends On**: Task 1
**Acceptance Criteria**:
- /setup has strictRateLimit (5 req/60s)
- /unlock has strictRateLimit (5 req/60s)
- Rate limits applied before /auth/* wildcard
- 429 responses include Retry-After header

### Task 4: Emergency Unlock Session Revocation + Audit + IP Hash (P0-5, P1-4)

**Delegation Recommendation**:
- Category: `deep` - Multiple security changes: session revocation, audit logging, IP hashing
- Skills: [`tdd-workflow`] - Critical security changes require comprehensive tests

**Skills Evaluation**:
- ✅ INCLUDED `tdd-workflow`: Must verify session revocation, audit logging, and IP hashing
- ❌ OMITTED `frontend-design`: No UI changes
- ❌ OMITTED `ui-ux-pro-max`: Backend security changes

**Depends On**: Task 1
**Acceptance Criteria**:
- Emergency Unlock revokes ALL active sessions
- Emergency Unlock writes audit_log entry with timestamp and IP
- login_attempts uses HMAC-SHA256 hashed IPs (not plaintext)
- audit_log table created with proper indexes
- hashIpAddress function added to crypto.ts

### Task 5: Login Query Optimization (P1-1)

**Delegation Recommendation**:
- Category: `deep` - Complex query restructuring and batching
- Skills: [`tdd-workflow`] - Verify query optimization doesn't break functionality

**Skills Evaluation**:
- ✅ INCLUDED `tdd-workflow`: Tests ensure login flow still works after optimization
- ❌ OMITTED `frontend-design`: No UI changes
- ❌ OMITTED `ui-ux-pro-max`: Backend optimization

**Depends On**: Task 1, Task 4
**Acceptance Criteria**:
- kv_settings queries merged into single SELECT with IN clause
- Write operations batched using db.batch()
- Total query count reduced from 5+ to 3-4
- Login functionality unchanged

### Task 6: Cron Trigger + KV Session Blacklist (P1-2, P1-5)

**Delegation Recommendation**:
- Category: `deep` - New Cloudflare features (Cron, KV) integration
- Skills: [`tdd-workflow`] - Verify scheduled handler and KV integration

**Skills Evaluation**:
- ✅ INCLUDED `tdd-workflow`: Tests for scheduled handler and KV blacklist
- ❌ OMITTED `frontend-design`: No UI changes
- ❌ OMITTED `ui-ux-pro-max`: Backend infrastructure

**Depends On**: Task 2, Task 4
**Acceptance Criteria**:
- wrangler.toml has KV namespace binding and cron trigger
- scheduled handler cleans up expired tokens, login attempts, audit entries
- Logout writes to KV session blacklist
- JWT validation checks KV blacklist before D1

## Commit Strategy

1. Task 1: `feat(05-01): migrate to PBKDF2 password hashing with 10k iterations`
2. Task 2: `feat(05-02): extend token TTL to 60min access, 30 days refresh`
3. Task 3: `feat(05-03): add rate limiting to /setup and /unlock endpoints`
4. Task 4: `feat(05-04): add emergency unlock session revocation and IP hashing`
5. Task 5: `feat(05-05): optimize login query chain with merged reads and batch writes`
6. Task 6: `feat(05-06): add cron trigger and KV session blacklist`

## Success Criteria

- [ ] All 8 acceptance criteria from phase scope met
- [ ] No P0 or P1 items remaining from audit
- [ ] All tests pass with >80% coverage
- [ ] wrangler deploy --dry-run succeeds
- [ ] No plaintext passwords or IPs in database
- [ ] Rate limiting covers all sensitive endpoints
- [ ] Session revocation works instantly across edge instances
- [ ] Cron cleanup runs every 6 hours without errors

## TODO List (ADD THESE)

> CALLER: Add these TODOs using TodoWrite/TaskCreate and execute by wave.

### Wave 1 (Start Immediately - No Dependencies)

- [ ] **1. PBKDF2 Password Hashing Migration (P0-1)**
  - What: Replace SHA-256 with PBKDF2 (10k iterations) in crypto.ts, migrate auth endpoints
  - Depends: None
  - Blocks: 3, 4, 5
  - Category: `deep`
  - Skills: [`tdd-workflow`]
  - QA: Hash completes in 5-15ms, tests pass, existing hashes rejected with re-setup message

- [ ] **2. Token TTL Extension (P0-2)**
  - What: Change access token to 60min, refresh to 30 days, add cleanup function
  - Depends: None
  - Blocks: 6
  - Category: `quick`
  - Skills: [`tdd-workflow`]
  - QA: Named constants used, no magic numbers, cleanup function exists

### Wave 2 (After Wave 1 Completes)

- [ ] **3. Rate Limiting /setup & /unlock (P0-4)**
  - What: Apply strictRateLimit to /setup and /unlock before /auth/* wildcard
  - Depends: 1
  - Blocks: None
  - Category: `quick`
  - Skills: [`tdd-workflow`]
  - QA: 6 rapid requests to /setup returns 429 on 6th attempt

- [ ] **4. Emergency Unlock + Audit + IP Hash (P0-5, P1-4)**
  - What: Session revocation on emergency unlock, audit_log table, HMAC-SHA256 IP hashing
  - Depends: 1
  - Blocks: 5, 6
  - Category: `deep`
  - Skills: [`tdd-workflow`]
  - QA: Emergency unlock revokes all sessions, audit_log entry created, IPs hashed

### Wave 3 (After Wave 2 Completes)

- [ ] **5. Login Query Optimization (P1-1)**
  - What: Merge kv_settings queries, batch write operations
  - Depends: 1, 4
  - Blocks: None
  - Category: `deep`
  - Skills: [`tdd-workflow`]
  - QA: Query count reduced from 5+ to 3-4, login still works

- [ ] **6. Cron Trigger + KV Blacklist (P1-2, P1-5)**
  - What: Configure cron every 6 hours, KV session blacklist for instant logout
  - Depends: 2, 4
  - Blocks: None
  - Category: `deep`
  - Skills: [`tdd-workflow`]
  - QA: scheduled handler exports, KV binding in wrangler.toml, logout writes to KV

## Execution Instructions

1. **Wave 1**: Fire these tasks IN PARALLEL (no dependencies)
   ```
   task(category="deep", load_skills=["tdd-workflow"], run_in_background=false, prompt="Task 1: PBKDF2 migration...")
   task(category="quick", load_skills=["tdd-workflow"], run_in_background=false, prompt="Task 2: Token TTL extension...")
   ```

2. **Wave 2**: After Wave 1 completes, fire next wave IN PARALLEL
   ```
   task(category="quick", load_skills=["tdd-workflow"], run_in_background=false, prompt="Task 3: Rate limiting...")
   task(category="deep", load_skills=["tdd-workflow"], run_in_background=false, prompt="Task 4: Emergency unlock + audit...")
   ```

3. **Wave 3**: After Wave 2 completes, fire final wave IN PARALLEL
   ```
   task(category="deep", load_skills=["tdd-workflow"], run_in_background=false, prompt="Task 5: Login optimization...")
   task(category="deep", load_skills=["tdd-workflow"], run_in_background=false, prompt="Task 6: Cron + KV...")
   ```

4. Final QA: Verify all 8 acceptance criteria met, wrangler deploy --dry-run succeeds
