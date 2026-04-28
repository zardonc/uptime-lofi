---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: MVP - Core Monitoring
status: Phase 08 conditionally closed with deferred Windows E2E follow-up
last_updated: "2026-04-28T16:30:00.000Z"
progress:
  total_phases: 6
  completed_phases: 5
  total_plans: 37
  completed_plans: 37
---

# Project State: Uptime-LoFi

## Current Status

| Phase | Status | Progress |
|-------|--------|----------|
| 1 - Infrastructure | ✅ Complete | 100% |
| 2 - Core Probe | ✅ Complete | 100% |
| 3 - Frontend Dashboard | 🔄 In Progress | 78% (7/9 tasks) |
| 04.2 - Backend Refactor & Bug Fix | ✅ Complete | 100% |
| 4 - Security & Payload Hardening | ✅ Complete | 100% (8/8 plans) |
| 5 - System Hardening & Quota Optimization | ✅ Complete | 100% (6/6 plans) |
| 6 - Performance & Scaling Optimization | ✅ Complete | 100% (8/8 plans) |
| 7 - Frontend UX & Accessibility | ✅ Complete | 100% |
| 8 - Quality Assurance & Testing | ✅ Conditionally Complete | 100% (Windows canonical E2E deferred) |

## Decisions

### Technical Stack (Locked)

- **Frontend:** React 19 + Vite 8 + TypeScript 5.9 + Vanilla CSS (no Tailwind)
- **Backend:** Hono 4 + Cloudflare Workers + D1 SQLite
- **Probe:** Go with Cobra + Viper + gopsutil
- **Auth:** JWT for dashboard, HMAC-SHA256 + PSK for probes
- [Phase 04]: JWT authentication hardened with audience/issuer validation, type-safe payload access, and comprehensive input sanitization
- [Phase 04]: Session-wide logout revokes all tokens for security
- [Phase 04]: Health endpoints: /health with DB latency, /ready for K8s
- [Phase 04-07]: Tech debt cleanup — shared crypto utils, consolidated TrendPoint type, hono/cors middleware, Settings logout fix, activity timestamps
- [Phase 04-08]: Dependency updates — Wrangler compatibility date to 2026-04-01, Zod v4 verified, gopsutil v3 assessed, full security audit completed
- [Phase 05-02]: Token TTL extension — Access tokens 60min (was 15min), refresh tokens 15 days (was 7 days), named constants replace magic numbers, opportunistic expired token cleanup during login
- [Phase 05]: Used Web Crypto API PBKDF2 instead of bcrypt (native to Cloudflare Workers)
- [Phase 05-03]: Rate limiting on /setup and /unlock — strictRateLimit (5 req/60s per IP) applied before /auth/* wildcard; retry_after header added to 401 responses
- [Phase 05-05]: Login query chain optimization — merged 3 kv_settings queries into single IN clause; batched 3 write operations (DELETE + INSERT audit_log + INSERT refresh_tokens) into db.batch(); total query count reduced from 6+ to 3-4
- [Phase 05-06]: Cron Trigger + KV session blacklist — cron runs every 6 hours for cleanup of expired tokens/attempts/audit entries; KV SESSION_BLACKLIST provides instant logout revocation across all edge instances; KV check placed before D1 check with fallback on failure
- [Phase 06]: D1 index optimization — only 2 new indexes needed (daily_stats + refresh_tokens); 3 others already covered; all 5 hot queries verified via EXPLAIN QUERY PLAN (SEARCH, not SCAN)
- [Phase 06]: containers_json compression — server-side gzip via native CompressionStream; gz: prefix for backward compatibility; no probe agent changes required
- [Phase 06]: Probe/Worker separation — dedicated probe Worker (602 KiB) handles /api/push only; dashboard Worker (644 KiB) handles all other routes; independent deployment via deploy:probe/deploy:dashboard

### Design System (Locked)

- **Color:** Morandi Green (#8FA895 primary)
- **Layout:** Collapsible sidebar navigation
- **Charts:** Recharts for trend visualization

### Architecture (Locked)

- Monorepo with pnpm workspaces
- Zero-infrastructure (Cloudflare native)
- Batch metrics push from probe
- Cron-based timeout detection

## Blockers

- **Pre-existing Hono + pnpm type resolution issue**: `tsc --noEmit` fails with "Module 'hono' has no exported member 'Hono'" due to pnpm's symlinked node_modules conflicting with Hono's package.json exports field. Code works at runtime via wrangler/esbuild. Tracked: [honojs/hono#3284](https://github.com/honojs/hono/issues/3284).
- **Windows canonical E2E deferred**: `cd backend && pnpm test:e2e` is intentionally skipped on Windows by the Node wrapper while `pnpm test:e2e:powershell` remains available for targeted debugging. Deferred issues include refresh/logout 401 responses and probe-worker node salt/auth mismatch under the PowerShell path.

## Known Issues

- **PowerShell `export` error**: The bash tool injects `export CI=true DEBIAN_FRONTEND=noninteractive...` prefix before git commands. This Unix syntax fails in Windows PowerShell with "export: The term 'export' is not recognized". **Impact:** Low - commands still execute successfully despite the error message. **Workaround:** Use Git Bash terminal, or ignore the cosmetic error. Tracked: `.planning/debug/export-not-recognized.md`

## Notes

- Phase 04.2 complete: 11 .js files removed, tsconfig modernized, .gitignore created
- Phase 05-02 complete: Token TTL extended (60min access, 30d refresh), cleanupExpiredTokens added
- Phase 3 has 2 remaining E2E validation tasks before Phase 4
- Phase 4 (Security & Payload Hardening) has 8 plans ready for execution
- Phase 4 expanded: Added 4 new plans (04-05 to 04-08) to address all 24 unsolved concerns from CONCERNS.md
- Phase 7 complete: summary artifacts exist for 07-01 through 07-07
- Phase 8 conditionally closed: summaries exist for 08-01 through 08-06, but Windows canonical E2E is recorded as skipped/deferred rather than fully green

### Roadmap Evolution

- Phase 04.2 inserted after Phase 4: Backend refactor and bug fix (URGENT)
- Phase 04.2 COMPLETE: 2/2 plans executed, 18 commits total

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260403-kh7 | 修订 architect.md 对齐 Phase 4 安全加固变更，添加 Mermaid 凭证流转图 | 2026-04-03 | c54eda4 | [260403-kh7-adocs-research-architect-md-phase-4-dash](./quick/260403-kh7-adocs-research-architect-md-phase-4-dash/) |
| 260403-ktu | 审阅并修订 architect.md Dashboard 凭证体系章节，对齐代码实现 | 2026-04-03 | 3d5a71e | [260403-ktu-architect-md-dashboard](./quick/260403-ktu-architect-md-dashboard/) |
| 260403-l3l | 补充 architect.md 面板首次登录绑定后端流程描述 | 2026-04-03 | 1a6a0d5 | [260403-l3l-architect-md-dashboard](./quick/260403-l3l-architect-md-dashboard/) |
| 260403-lbf | 更新 architect.md Mermaid 流程图对齐凭证体系文字描述 | 2026-04-03 | 2f01893 | [260403-lbf-architect-md-mermaid-dashboard](./quick/260403-lbf-architect-md-mermaid-dashboard/) |
| 260403-lmc | 合并 architect.md 面板鉴权与凭证体系内容，降低冗余 | 2026-04-03 | - | [260403-lmc-architect-md-merge-auth](./quick/260403-lmc-architect-md-merge-auth/) |

---

*Last updated: 2026-04-28 - Phase 8 conditionally closed with deferred Windows canonical E2E follow-up*
