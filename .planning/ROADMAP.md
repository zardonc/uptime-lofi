# Uptime-LoFi Project Roadmap

## Project Overview
Cloud-native uptime monitoring system with zero infrastructure requirements. Built on Cloudflare Workers + D1 + React frontend + Go probe agent.

---

## Requirements

### Core Functionality
- **REQ-001**: Node registration and management
- **REQ-002**: System metrics collection (CPU, Memory, Docker)
- **REQ-003**: Metrics storage and retrieval (D1 SQLite)
- **REQ-004**: Dashboard visualization (React + Recharts)
- **REQ-005**: Authentication (JWT for dashboard, HMAC-PSK for probes)
- **REQ-006**: Agentless HTTP monitoring (cloud-based TTFB measurement)
- **REQ-007**: Node status detection and timeout handling
- **REQ-008**: Daily statistics aggregation and archival
- **REQ-009**: Webhook alerting on status changes
- **REQ-010**: OTA probe updates via R2

---

## Milestones

### v1.0 MVP - Core Monitoring
**Status:** In Progress

**Description:** Working probe �?API �?database �?dashboard pipeline with basic monitoring capabilities.

---

## Phase Overview

### Phase 1: Infrastructure �?**Goal:** Backend skeleton, database schema, deployment workflow

**Requirements:** [REQ-001, REQ-005]

**Plans:** 4 plans
- �?01-01: Initialize Cloudflare Pages + Hono Worker
- �?01-02: D1 Schema (nodes, raw_metrics, daily_stats)
- �?01-03: Wrangler deployment scripts
- �?01-04: HMAC-SHA256 auth middleware + PSK validation

---

### Phase 2: Core Probe �?**Goal:** Cross-platform Go probe with metrics collection and push

**Requirements:** [REQ-002, REQ-003]

**Plans:** 5 plans
- �?02-01: Go CLI framework (Cobra + Viper)
- �?02-02: System metrics collector (gopsutil)
- �?02-03: HMAC signing + batching + exponential backoff
- �?02-04: Worker POST /api/push endpoint (Zod + batch insert)
- �?02-05: Local E2E validation

---

### Phase 3: Frontend Dashboard 🔄
**Goal:** React SPA with API binding and visual monitoring

**Requirements:** [REQ-004, REQ-005]

**Plans:** 7 plans (completed)
- �?03-01: React + Vite initialization (vanilla CSS)
- �?03-02: Morandi Green design system + sidebar
- �?03-03: Core components (MetricCard, TrendChart, UptimeRing, NodeList)
- �?03-04: V2 Auth schema (refresh_tokens, salt)
- �?03-05: JWT/PSK middleware split
- �?03-06: Backend read APIs (GET /api/nodes, /metrics, /stats)
- �?03-07: Frontend API integration + login security

---

## Milestone: v1.1 - Codebase Health & Security Hardening
**Status:** Planned

**Description:** Address critical security vulnerabilities, data integrity issues, and complete lack of test coverage identified in March 2025 audit.

---

### Phase 4: Security & Payload Hardening �?**Goal:** Protect the API from abuse and harden sensitive operations. Address all security concerns from CONCERNS.md audit.

**Acceptance Criteria:** Security scan passes with zero high/critical vulnerabilities; rate limiting verified via load testing; all CONCERNS.md security items resolved.

**Requirements:** Security (REQ-001 - REQ-005)

**Plans:** 8/8 plans complete
- �?04-01: Rate limiting middleware (permissive/standard/strict presets)
- �?04-02: Payload hardening (size limits, strict Zod validation)
- �?04-03: CORS and security headers configuration
- �?04-04: JWT hardening (aud/iss validation, login rate limiting)
- �?04-05: Security vulnerabilities (break-glass key, password generator, X-Node-Id, login tracker, JWT types)
- �?04-06: Missing features (logout endpoint, health check, node API stubs)
- �?04-07: Tech debt (duplicated functions, TrendPoint type, CORS, Settings navigation)
- �?04-08: Dependency updates (wrangler date, Zod v4, gopsutil)

---

### Phase 04.2: Backend refactor and bug fix �?(INSERTED)

**Goal:** Clean up duplicate .js files, fix TypeScript compilation errors, and verify API connectivity.
**Requirements**: TBD
**Depends on:** Phase 4
**Plans:** 6/8 plans executed

Plans:
- �?04.2-01: Remove duplicate .js files, configure TypeScript output directory, add .gitignore rules
- �?04.2-02: Fix TypeScript import resolution, add explicit type annotations, verify API endpoints

**Notes:**
- 11 duplicate .js files removed from backend/src/
- tsconfig.json updated with modern compiler options (NodeNext, esModuleInterop, etc.)
- backend/.gitignore created
- wrangler deploy --dry-run succeeds (639.42 KiB)
- Pre-existing Hono + pnpm type resolution issue documented (honojs/hono#3284)

### Phase 5: System Hardening & Quota Optimization ⏳
**Goal:** Address all unhandled P0 and P1 items from Cloudflare Free Tier technical audit. Ensure production-ready security under Free Tier constraints.

**Acceptance Criteria:** PBKDF2 hashing at 10k iterations; Access Token 60min TTL; rate limiting on all auth endpoints; emergency unlock revokes sessions; login query chain optimized; cron cleanup active; IP addresses hashed; KV instant revocation.

**Requirements:** Security Hardening (SEC-001 - SEC-006)

**Plans:** 5/7 plans executed
- ✅ 05-01: PBKDF2 password hashing migration (10k iterations, P0-1)
- ✅ 05-02: Token TTL extension (60min access, 30d refresh, P0-2)
- ✅ 05-03: Rate limiting for /setup and /unlock (P0-4)
- ⬜ 05-04: Emergency Unlock session revocation + audit_log + IP hashing (P0-5, P1-4)
- ✅ 05-05: Login query chain optimization (P1-1)
- ⬜ 05-06: Cron Trigger cleanup + KV session blacklist (P1-2, P1-5)

---

### Phase 6: Performance & Scaling Optimization �?**Goal:** Ensure the system remains responsive as data volume grows.

**Acceptance Criteria:** Load test with 1000+ nodes shows <200ms p95 response time.

**Requirements:** Performance (REQ-001 - REQ-005)

**Plans:** TBD

---

### Phase 7: Frontend UX & Accessibility �?**Goal:** Improve the reliability and usability of the dashboard.

**Acceptance Criteria:** No console errors; consistent loading states; WCAG 2.1 AA compliant forms.

**Requirements:** UX (REQ-004, REQ-005)

**Plans:** TBD

---

### Phase 8: Quality Assurance & Testing 🔄
**Goal:** Comprehensive testing coverage including infrastructure, unit, integration, and end-to-end validation.

**Acceptance Criteria:**
- All critical paths have >80% coverage
- Test suite runs in CI
- E2E probe validation passes for basic and Docker scenarios
- Security scan passes with zero high/critical vulnerabilities

**Requirements:** Testing, Security (REQ-001 - REQ-010)

**Plans:** TBD

**Includes (moved from other phases):**
- Test infrastructure setup (Vitest for backend + frontend)
- Unit tests for HMAC signature verification
- Unit tests for JWT authentication and refresh rotation
- Integration tests for metric push flow
- Integration test for batch failure rollback scenario
- �?**03-08 (MOVED):** E2E basic probe validation
- �?**03-09 (MOVED):** E2E Docker probe validation

---

## Original Milestones

### v1.0 MVP - Core Monitoring

---

**External Plan Reference:** See `.adocs/plan/PLN-002.md` for detailed breakdown of Phases 4-8 (Security Hardening, Data Integrity, Performance, Frontend UX, and Quality Assurance improvements).

---

## State Tracking

- **Current Phase:** Phase 04.2 �?Complete
- **Next Phase:** Phase 4 (Security & Payload Hardening) �?4 plans ready
- **Milestone v1.1:** Codebase Health & Security Hardening (PLN-002)
- **Active Blockers:** Pre-existing Hono + pnpm type resolution issue (non-blocking for runtime)

---

*Last updated: 2026-04-03*
*Phase 04.2 complete: backend cleanup, tsconfig modernization, .gitignore created*
