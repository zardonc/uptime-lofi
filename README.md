# uptime-lofi

Self-hosted uptime monitoring for Cloudflare Workers, Cloudflare Pages, D1, KV, and lightweight server probes.

uptime-lofi is built around a Cloudflare-native v2 architecture:

- Cloudflare Pages serves the dashboard and public status page.
- Pages Functions act as the browser-facing BFF and admin session boundary.
- A Worker backend owns internal APIs, scheduled checks, alert evaluation, D1, and KV access.
- A Probe Worker receives server probe pushes without exposing the backend master secret.
- The dashboard manages Monitors, Statistics, Alerts, Notifications, Public Status, and Settings from one app shell.

## Deployment

The supported self-host path is GitHub Actions from your fork. You do not need to run `wrangler` locally for the normal deployment path.

Read the full guide: [Self-Hosted Deployment](./DEPLOYMENT.md).

## Features

| Area | Current behavior |
| --- | --- |
| Dashboard | v2 monitor health summary, active issue list, recent activity, and latest monitor states. |
| Monitors | Unified Agent Probe, HTTP Check, and TCP Check management with honest no-data states. |
| Public Status | Standalone `/status` page controlled from Settings, served without the admin shell. |
| Alerts | Monitor-aware rules, enable/disable flow, alert state, and history. |
| Notifications | Webhook and Telegram channels with secret redaction; Email is reserved/disabled. |
| Statistics | D1-derived summaries, trends, leaderboards, and empty states backed by rebuildable KV cache. |
| Probe install | Dashboard-generated install command with node-specific credentials. |

## Repository Layout

| Path | Purpose |
| --- | --- |
| `frontend/` | React 19 + TypeScript + Vite dashboard and public status UI. |
| `functions/` | Cloudflare Pages Functions BFF, auth/session handling, and Worker proxy routes. |
| `backend/` | Cloudflare Worker backend, D1 migrations, internal v2 APIs, scheduler, and probe worker config. |
| `server-probe/` | Go probe binary installed on monitored servers. |
| `scripts/` | CI helpers, smoke tests, and probe installation scripts. |
| `.github/workflows/deploy-production.yml` | `Deploy Self-Hosted` workflow for fork-based deployment. |

## Local Development

Install dependencies:

```bash
pnpm install
```

Run the backend Worker locally:

```bash
pnpm --dir backend exec wrangler dev src/index.ts --port 8787 --local
```

Run the frontend locally:

```bash
pnpm --filter frontend dev -- --host 127.0.0.1 --port 5173
```

Vite proxies `/api/*` to `http://127.0.0.1:8787`. In production, the frontend is built with `VITE_API_URL=''`, so browser calls stay same-origin through Pages Functions.

## Verification

```bash
pnpm --filter frontend test
pnpm --filter frontend typecheck
pnpm --filter frontend lint
pnpm --filter backend test
```

Known local note: Wrangler tests can emit sandbox/log/static-analysis warnings on Windows while still exiting successfully.

## More Docs

- [Frontend README](./frontend/README.md)
- [Self-Hosted Deployment](./DEPLOYMENT.md)
