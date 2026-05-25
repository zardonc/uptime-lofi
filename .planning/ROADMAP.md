# Roadmap: uptime-lofi

## Milestones

- [shipped] **v1.1** - Earlier hardening phases archived in `.planning/milestones/v1.1-phases/`.
- [shipped] **v1.2 MVP** - Phases 09-10, shipped 2026-05-16. Archive: `.planning/milestones/v1.2-ROADMAP.md`.
- [planned] **Phase 11** - Page-level and whole-product functional refactor.

## Phases

<details>
<summary>[shipped] v1.2 MVP (Phases 09-10) - SHIPPED 2026-05-16</summary>

- [x] Phase 09: Deployment and Production Validation (8/8 plans complete)
- [x] Phase 10: Next Development (9/9 plans complete)

</details>

### Planned Next

### Phase 11: Page and Functionality Refactor

**Goal:** Rebuild uptime-lofi as a v2 product architecture after the deployed MVP: Cloudflare Pages Functions becomes the browser-facing BFF/security boundary, Monitors replace the old Nodes/Agentless split, Public Status becomes a first-class read-only surface, and Alerts, Notifications, Statistics, and Settings are completed against a clean v2 data model.

**Requirements:** REQ-11-01, REQ-11-02, REQ-11-03, REQ-11-04, REQ-11-05, REQ-11-06, REQ-11-07, REQ-11-08, REQ-11-09, REQ-11-10

**Mode:** rebuild

**Canonical refs:**

- `.planning/3rd-references/refactor.md`
- `.planning/3rd-references/wireframe.html`
- `.planning/PROJECT.md`
- `.planning/codebase/ARCHITECTURE.md`
- `.planning/codebase/INTEGRATIONS.md`
- `.planning/codebase/STRUCTURE.md`
- `.planning/codebase/CONVENTIONS.md`
- `.planning/codebase/TESTING.md`
- `.planning/milestones/v1.2-phases/10-next-development/10-CONTEXT.md`
- `.planning/milestones/v1.2-phases/10-next-development/10-UI-SPEC.md`

**Plans:** 9/9 plans executed; deployed human verification pending

Plans:
**Wave 1**

- [x] 11-01: V2 architecture contract and repo scaffolding

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 11-02: Pages Functions BFF, admin session, and internal Worker trust boundary

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 11-03: V2 D1/KV schema and Monitor backend APIs

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 11-04: Worker cron, probe ingestion compatibility, and latest-state snapshots

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 11-05: Public Status API, Settings visibility controls, and public page
- [x] 11-06: Alerts rules, state machine, and history

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 11-07: Webhook and Telegram notifications with Email reservation
- [x] 11-08: Statistics rollups, KV leaderboards, and Statistics UI

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 11-09: Final frontend shell, deployment wiring, docs, and end-to-end verification

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
| --- | --- | ---: | --- | --- |
| 09. Deployment and Production Validation | v1.2 MVP | 8/8 | Complete | 2026-04-30 |
| 10. Next Development | v1.2 MVP | 9/9 | Complete | 2026-05-06 |
| 11. Page and Functionality Refactor | Next | 9/9 | Human Verification Required |  |

## Notes

This roadmap was reconstructed during v1.2 close because the standard root GSD planning files were absent from the workspace.
