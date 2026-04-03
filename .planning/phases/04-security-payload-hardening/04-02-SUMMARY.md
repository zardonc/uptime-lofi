# Plan 04-02: Payload Hardening

## Status
✓ COMPLETE

## Objective
Harden the /api/push endpoint against oversized and malformed payloads.

## Tasks Completed

### Task 1: Add payload size limit middleware ✓
- **File:** `backend/src/index.ts`
- **Implementation:**
  - `MAX_BODY_SIZE = 1024 * 1024` (1MB) constant defined
  - Size check middleware before route mounting (lines 66-76)
  - Returns 413 "Payload Too Large" for oversized requests
  - Checks Content-Length header before processing

### Task 2: Strengthen Zod validation and add batch size limit ✓
- **File:** `backend/src/routes/push.ts`
- **Implementation:**
  - Enhanced `metricSchema` with strict validators:
    - `node_id`: regex `/^[a-zA-Z0-9_-]+$/` (injection-safe, URL-safe)
    - `timestamp`: validated for 24h window, no future timestamps
    - `ping`: max 60000ms (60 second cap)
    - `cpu`/`mem`: min 0, max 100 (percentage bounds)
    - `containers_json`: max 10000 chars (10KB limit)
  - `MAX_BATCH_SIZE = 100` prevents memory exhaustion
  - Batch size validation in schema (line 27)
  - Timestamp validation via `superRefine` (lines 19-25)

### Task 3: Document wrangler.toml body limit ✓
- **File:** `backend/wrangler.toml`
- **Implementation:**
  - `limits = { body_size = "1mb" }` (line 4)
  - Matches application-level MAX_BODY_SIZE
  - Cloudflare Worker-level enforcement

## Key Files Modified
- `backend/src/index.ts` - Size limit middleware
- `backend/src/routes/push.ts` - Strict Zod validation, batch limits
- `backend/wrangler.toml` - Worker-level body size limit

## Verification
- TypeScript compiles without errors
- All validation schemas properly typed with Zod
- Batch size limit (100) matches typical probe behavior (10-50 metrics)
- 1MB limit accommodates ~1000 metrics (10x typical batch)
- Timestamp validation prevents stale/future data injection

## Decisions
1. **Batch limit 100**: Typical probe sends 10-50 metrics; 100 provides headroom without memory pressure
2. **Timestamp 24h window**: Prevents stale data injection while allowing clock skew
3. **containers_json 10KB**: Reasonable for ~50 containers with metadata
4. **node_id regex**: Prevents injection, ensures URL-safe IDs for all use cases

## Security Impact
- DoS prevention: 1MB + 100 item limits prevent memory exhaustion
- Injection prevention: Strict node_id regex, parameterized queries
- Data integrity: Timestamp validation, field bounds
- Clear error messages: 400/413 responses with actionable feedback

## Self-Check
✓ All tasks executed
✓ TypeScript compiles without errors
✓ Payload size limits enforced at two layers (app + Worker)
✓ Batch size limit prevents memory exhaustion
✓ Strict Zod validation with detailed error messages
