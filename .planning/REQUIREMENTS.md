# Requirements: uptime-lofi

## Phase 11: Page and Functionality Refactor

- [x] REQ-11-01: The product is rebuilt around a v2 architecture where the browser talks only to Cloudflare Pages Functions, and Pages Functions proxy authenticated/internal requests to the Worker backend.
- [x] REQ-11-02: The v2 data model uses Monitors as the unified abstraction for agent probes, HTTP checks, and TCP checks, with no requirement to migrate existing MVP test data.
- [x] REQ-11-03: The admin panel requires password-authenticated session access, while Public Status is available without login through a deliberately limited read-only API.
- [x] REQ-11-04: Settings allows administrators to configure what Public Status may expose, including monitor visibility and incident/statistics visibility.
- [x] REQ-11-05: Alerts supports configurable alert rules, alert history, deduplication/recovery behavior, and monitor-type-aware conditions.
- [x] REQ-11-06: Notifications supports Webhook and Telegram channels in this phase, with Email represented as a disabled reserved interface for a later implementation.
- [x] REQ-11-07: Statistics is backed by D1-derived rollups and KV-cached read models for simple leaderboards and summary snapshots.
- [x] REQ-11-08: The frontend information architecture is rebuilt as Dashboard, Monitors, Statistics, Alerts, Settings, and Public Status, replacing the previous Nodes/Agentless split.
- [x] REQ-11-09: The existing fork-based Cloudflare self-host deployment path remains usable and provisions any new Pages Functions, Worker bindings, D1 schema, KV namespaces, and secrets required by v2.
- [x] REQ-11-10: The v2 implementation is covered by backend route/cron tests, frontend component/API tests, probe compatibility tests where touched, deployment script tests, and manual deployed checks for Pages/Worker cookie behavior.
