Phase 4 Plan: Payload size & validation hardening

- Implemented 1MB payload size limit middleware on /api gateway
- Hardened Zod validation for push payloads with detailed, co-located errors
- Updated Wrangler config to enforce body size limits in deployment
- Verified TypeScript compilation for backend components
- Committed each task atomically as requested

What was changed
- backend/src/index.ts
  - Added MAX_BODY_SIZE = 1024 * 1024
  - Global middleware to reject requests with Content-Length > 1MB (413)
- backend/src/routes/push.ts
  - Added MAX_BATCH_SIZE = 100
  - Enhanced metricSchema with strict validators and field-level error messages
  - node_id regex: /^[a-zA-Z0-9_-]+$/
  - ping: max 60000, cpu/mem: 0-100, containers_json: max 10000 chars
  - Timestamp validation: within last 24h and not in the future via superRefine
  - batchPayloadSchema enforces max batch size with clear error path
- backend/wrangler.toml
  - limits = { body_size = "1mb" }

Verification notes
- MAX_BODY_SIZE and MAX_BATCH_SIZE constants present in codebase
- TypeScript compile succeeds for backend (BUILD_OK)
- API behavior: oversized payloads result in 413; malformed payloads reported with field paths

Open questions
- If future payloads exceed batch size constraints, clients should batch requests accordingly
