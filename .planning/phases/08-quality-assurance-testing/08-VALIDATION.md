---
phase: 8
slug: quality-assurance-testing
status: partial
nyquist_compliant: false
wave_0_complete: true
created: 2026-04-14
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x (backend + frontend), Go test (probe) |
| **Config file** | `backend/vitest.config.ts`, `frontend/vitest.config.ts` |
| **Quick run command** | `cd backend && pnpm test` / `cd frontend && pnpm test` / `cd server-probe && go test ./tests/ -v` |
| **Full suite command** | `pnpm -r test` + `cd server-probe && go test ./tests/ -v -cover` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm -r test`
- **After every plan wave:** Run full suite including Go tests
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 08-01-01 | 01 | 1 | Test infra | setup | `cd backend && pnpm test` | ✅ green |
| 08-01-02 | 01 | 1 | Test infra | setup | `cd frontend && pnpm test` | ✅ green |
| 08-02-01 | 02 | 2 | REQ-005 | unit | `cd backend && pnpm test -- --run tests/routes/auth.test.ts` | ✅ green |
| 08-02-02 | 02 | 2 | REQ-005 | unit | `cd backend && pnpm test -- --run tests/middleware/auth.test.ts` | ✅ green |
| 08-03-01 | 03 | 2 | REQ-003 | unit | `cd backend && pnpm test -- --run tests/routes/push.test.ts` | ✅ green |
| 08-04-01 | 04 | 2 | REQ-004 | unit | `cd frontend && pnpm test` | ✅ green |
| 08-05-01 | 05 | 3 | REQ-002 | unit | `cd server-probe && go test ./tests/ -v` | ✅ green |
| 08-06-01 | 06 | 4 | REQ-001-010 | e2e | `cd backend && pnpm test:e2e` | ⚠️ skipped on Windows |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ skipped/deferred*

---

## Wave 0 Requirements

- [x] `backend/vitest.config.ts` — Vitest + @cloudflare/vitest-pool-workers config
- [x] `backend/tests/apply-migrations.ts` — D1 migration setup
- [x] `frontend/vitest.config.ts` — Vitest + jsdom + React Testing Library config
- [x] `frontend/tests/setup.ts` — jest-dom matchers
- [x] Remove `/server-probe/tests/` from `.gitignore`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| E2E Docker probe | REQ-002 | Requires Docker daemon | Run on machine with Docker: `cd server-probe && go test ./tests/ -v -run TestDocker` |
| Windows canonical E2E | REQ-001, REQ-002, REQ-003, REQ-005 | Current PowerShell-specific auth/probe path is deferred | Run `cd backend && pnpm test:e2e:powershell` after the Windows bugfix task is implemented |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** conditional - Windows canonical E2E deferred, CI/security-scan follow-up still open
