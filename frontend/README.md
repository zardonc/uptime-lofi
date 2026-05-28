# uptime-lofi Frontend

React 19 + TypeScript + Vite dashboard for uptime-lofi.

The frontend contains the admin dashboard and the standalone public status page. In production it is deployed to Cloudflare Pages with Pages Functions from `../functions` handling auth, sessions, and same-origin API routing.

## Pages

| Route / surface | Purpose |
| --- | --- |
| `/` | Dashboard summary, active issues, recent activity, and monitor status. |
| `/monitors` | Unified Agent Probe, HTTP Check, and TCP Check management. |
| `/statistics` | D1-derived summaries, trends, leaderboards, and empty states. |
| `/alerts` | Alert rules and alert history. |
| `/settings` | Public Status settings and notification channels. |
| `/status` | Public read-only status page rendered outside the admin shell. |

## Local Development

From the repository root:

```bash
pnpm install
pnpm --dir backend exec wrangler dev src/index.ts --port 8787 --local
pnpm --filter frontend dev -- --host 127.0.0.1 --port 5173
```

Vite proxies `/api/*` to `http://127.0.0.1:8787`. The app expects the backend Worker to provide auth, v2 monitor APIs, settings, alerts, statistics, and public status responses.

## Production Build

```bash
pnpm --filter frontend build
```

The self-host workflow builds with `VITE_API_URL=''`, so browser API calls stay same-origin and go through Pages Functions.

Full deployment guide: [Self-Hosted Deployment](../DEPLOYMENT.md).

## Verification

```bash
pnpm --filter frontend test
pnpm --filter frontend typecheck
pnpm --filter frontend lint
```

The component tests use Vitest, Testing Library, jsdom, and MSW mocks.
