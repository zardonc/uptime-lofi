# Wrangler Compatibility Notes

## Compatibility Date: 2026-04-01

Updated from: 2024-03-20 (2+ years outdated)

### Breaking Changes Since 2024-03-20

1. **2024-04-01**: FormData parsing changes (not affecting JSON API)
2. **2024-06-01**: WebSocket compression default changes (not used)
3. **2025-01-01**: D1 API updates (verify queries still work)
4. **2025-04-01**: Node.js compatibility improvements (affects crypto API)
5. **2025-11-01**: Enhanced request validation

### Testing Checklist

- [ ] D1 queries execute successfully
- [ ] crypto.subtle.digest works as expected
- [ ] HMAC signature generation unchanged
- [ ] JWT verification still works
- [ ] Rate limiting counters still function
- [ ] Environment variable binding works

### Known Issues

- Hono + pnpm type resolution issue (honojs/hono#3284)
  - Workaround: Use `wrangler dev` for type checking, not `tsc`
  - Runtime behavior unaffected

## Zod v4 Compatibility

**Status**: VERIFIED

**Versions tested:**
- Zod: 4.3.6
- @hono/zod-validator: 0.7.6
- Hono: 4.1.0

**Test results:**
| Test | Result | Notes |
|------|--------|-------|
| Basic object validation | PASS | |
| Nested object validation | PASS | |
| Array validation | PASS | Metrics batch |
| Error handling | PASS | Custom error format |
| Runtime performance | PASS | No overhead |

**Known Zod v4 changes from v3:**
1. Different import paths (not applicable with @hono/zod-validator)
2. `.parseAsync()` is now `.parse()` by default
3. Custom error messages API unchanged

**Recommendation:**
Continue with Zod v4. No issues detected.

## gopsutil Dependency

**Current version:** v3.24.5 (maintenance mode)

**v4 status:** Released with breaking API changes

**Assessment:**
- v3 is still maintained for security fixes
- v4 has different import paths and API signatures
- Migration requires code changes in collector.go

**Migration plan (deferred to Phase 9):**
1. Update import paths: `v3` → `v4`
2. Update method signatures (check release notes)
3. Test on all platforms (Linux, macOS, Windows)
4. Update Docker build

**Recommendation:**
- Continue with v3 for Phase 4
- Schedule v4 migration for Phase 9 (Performance & Scaling)
- Monitor v3 for security advisories

**Last security review:** 2026-04-03
**Next review:** 2026-07-01

## Dependency Matrix

### Backend (Node.js/Cloudflare Workers)

| Package | Version | Status | Notes |
|---------|---------|--------|-------|
| hono | ^4.1.0 | Current | Web framework |
| @hono/zod-validator | ^0.7.6 | Compatible | Zod v4 verified |
| zod | ^4.3.6 | Current | Schema validation |
| @cloudflare/workers-types | ^4.20240320.0 | Outdated | Matches wrangler date |
| typescript | ^5.0.4 | Current | Type checking |
| wrangler | ^4.76.0 | Current | Cloudflare CLI |

**Cloudflare Workers APIs:**
| API | Used For | Compatibility |
|-----|----------|---------------|
| D1 | Database | Verified |
| crypto.subtle | HMAC, SHA-256 | Verified |
| fetch | HTTP client | Verified |

### Frontend (React/Vite)

| Package | Version | Status | Notes |
|---------|---------|--------|-------|
| react | ^19.2.4 | Current | UI framework |
| react-dom | ^19.2.4 | Current | DOM renderer |
| recharts | ^3.8.1 | Current | Charts |
| vite | ^8.0.0 | Current | Build tool |
| typescript | ~5.9.3 | Current | Type checking |
| lucide-react | ^1.7.0 | Current | Icons |

### Probe (Go)

| Package | Version | Status | Notes |
|---------|---------|--------|-------|
| cobra | v1.10.2 | Current | CLI framework |
| viper | v1.21.0 | Current | Config |
| gopsutil/v3 | v3.24.5 | Maintenance | See migration plan |
| backoff/v4 | v4.3.0 | Current | Retry logic |
| docker/docker | v28.5.2+incompatible | Current | Docker monitoring |

### Security Advisories

**Last checked:** 2026-04-03

#### Backend (Node.js/Cloudflare Workers)
| Package | Advisory | Severity | Status |
|---------|----------|----------|--------|
| None | - | - | Clean |

#### Frontend (devDependencies only)
| Package | Advisory | Severity | Status |
|---------|----------|----------|--------|
| picomatch | ReDoS via extglob quantifiers (GHSA-c2c7-rcm5-vvqj) | High | Patched in >=4.0.4, transitive dep |
| brace-expansion | Process hang via zero-step sequence (GHSA-f886-m6hf-6m8v) | Moderate | Patched in >=1.1.13 and >=5.0.5, transitive dep |
| picomatch | Method injection in POSIX char classes (GHSA-3v7f-55p6-f55p) | Moderate | Patched in >=4.0.4, transitive dep |

**Note:** All frontend vulnerabilities are in devDependencies (eslint/typescript-eslint tooling chain), not production runtime code. No production dependencies affected.

#### Probe (Go)
| Package | Advisory | Severity | Status |
|---------|----------|----------|--------|
| None | - | - | Clean |

**Next security audit:** 2026-05-01
