# Self-Hosted Deployment

The supported deployment path is the `Deploy Self-Hosted` GitHub Actions workflow in your fork. The workflow provisions Cloudflare resources, runs migrations, deploys the Worker backend and Probe Worker, deploys Cloudflare Pages with Functions, publishes probe binaries, and runs smoke validation.

You do not need to run `wrangler` locally for the normal path.

## Architecture

| Component | Deployed as | Purpose |
| --- | --- | --- |
| Dashboard UI | Cloudflare Pages static assets from `frontend/dist` | Admin dashboard and public `/status` page. |
| Pages Functions | Cloudflare Pages Functions from `functions/` | Browser-facing BFF, admin cookies, session refresh, and internal Worker proxy. |
| Dashboard Worker | Cloudflare Worker from `backend/src/index.ts` | Internal v2 APIs, scheduler, D1/KV access, alerts, statistics, and probe config generation. |
| Probe Worker | Cloudflare Worker from `backend/probe-wrangler.self-host.template.toml` | Receives node probe pushes. |
| D1 | Cloudflare D1 database | Monitors, latest state, checks, alerts, notifications, settings, and statistics rollups. |
| KV | Cloudflare KV namespaces | Session revocation and rebuildable statistics cache. |
| Probe binaries | GitHub Release `probe-latest` in your fork | Installable Go probe assets used by generated install commands. |

## 1. Fork The Repository

Open the upstream repository on GitHub and click `Fork`. All setup below happens in your forked repository.

## 2. Create A Cloudflare Account API Token

In Cloudflare:

You need Super Administrator permission on the target account to create an Account API token.

1. Open `Manage Account -> Account API Tokens`.
2. Click `Create Token`.
3. Choose `Create Custom Token`.
4. Add these account permissions:

| Scope | Permission |
| --- | --- |
| Account | `Cloudflare Workers Scripts:Edit` |
| Account | `Workers KV Storage:Edit` |
| Account | `D1:Edit` |
| Account | `Cloudflare Pages:Edit` |
| Account | `Account Settings:Read` |

5. Set the account resource to the Cloudflare account where you want to deploy uptime-lofi.
6. Create the token and copy it once. Cloudflare will not show it again.

Use an Account API token for GitHub Actions. Cloudflare issues new account tokens with the `cfat_` prefix.

Zone permissions are not required for the default `*.pages.dev` and `*.workers.dev` deployment.

You also need your Cloudflare Account ID. In the Cloudflare dashboard, select your account and copy the `Account ID` from the account overview/sidebar.

## 3. Add GitHub Repository Secrets

In your forked repo, open:

`Settings -> Secrets and variables -> Actions -> New repository secret`

Add these secrets:

| Secret | Required | Purpose | Recommended format |
| --- | --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Yes | Deploys Cloudflare resources. | Account API token from step 2, usually `cfat_...`. |
| `CLOUDFLARE_ACCOUNT_ID` | Yes | Selects the target Cloudflare account. | 32-character Cloudflare account ID. |
| `API_SECRET_KEY` | Yes | Backend master secret for setup and probe credentials. | Random 32+ bytes, for example 43+ base64url chars or 64 hex chars. |
| `INTERNAL_API_KEY` | Yes | Authenticates Pages Functions to the Worker internal API. | Different random 32+ bytes; do not reuse `API_SECRET_KEY`. |
| `PAGES_SESSION_SECRET` | Yes | Signs admin session cookies. | Different random 32+ bytes; rotating it logs users out. |
| `INITIAL_UI_PASSWORD` | Optional | Sets the dashboard password after deploy. *If omitted, use the admin setup/login flow after opening the Dashboard URL.*| Password-manager value, 16+ chars minimum, 20+ preferred. |

Generate the three key secrets independently with a password manager or another cryptographically random source. Treat all secrets as production credentials. The workflow summary names missing secrets but never prints their values.

## 4. Run Deploy Self-Hosted

In your forked repo:

1. Open `Actions`.
2. Select `Deploy Self-Hosted`.
3. Click `Run workflow`.
4. Leave the optional inputs blank unless you are troubleshooting a resource-name conflict.
5. Wait for the workflow to finish.

The workflow performs these steps:

1. Installs workspace dependencies.
2. Validates required secrets and Cloudflare account access.
3. Creates or reuses D1, KV namespaces, Workers, and the Pages project.
4. Renders generated Wrangler configs from the self-host templates.
5. Applies D1 migrations.
6. Deploys the Dashboard Worker and sets `API_SECRET_KEY` and `INTERNAL_API_KEY`.
7. Deploys the Probe Worker and sets `API_SECRET_KEY`.
8. Builds the frontend with same-origin API calls.
9. Configures Pages Functions secrets: `BACKEND_URL`, `INTERNAL_API_KEY`, `API_SECRET_KEY`, `PAGES_SESSION_SECRET`, and `BACKEND_LABEL`.
10. Deploys Cloudflare Pages with the `functions/` directory.
11. Builds and uploads probe binaries plus `install-probe.sh` to the `probe-latest` release in your fork.
12. Optionally configures `INITIAL_UI_PASSWORD`.
13. Runs self-host smoke validation.

When the workflow completes, open the run summary.

| Output | Purpose |
| --- | --- |
| Dashboard URL | The Cloudflare Pages URL you open in the browser. |
| Public Status URL | The shareable `/status` page, controlled by Settings. |
| Worker API URL | Worker internal API endpoint used by Pages Functions. |
| Probe URL | Probe Worker push endpoint used by server probes. |
| Session KV namespace | KV namespace for revoked session IDs. |
| Statistics KV namespace | KV namespace for rebuildable statistics snapshots. |

## 5. Open The Dashboard

Open the Dashboard URL from the workflow summary. Complete the setup/login flow and confirm the dashboard loads.

The dashboard uses signed HttpOnly session cookies through Pages Functions. Browser admin APIs should be same-origin `/api/*` calls from the Dashboard URL; they should not call the Worker internal API directly.

## 6. Add Your First Monitor

From the dashboard:

1. Open `Monitors`.
2. Click `Add Monitor`.
3. Choose one monitor type:
   - `Agent Probe` for a server probe.
   - `HTTP Check` for an HTTP endpoint.
   - `TCP Check` for a TCP host and port.

For an Agent Probe:

1. Click `Generate Install Command`.
2. Copy the command under `Run this on your server`.
3. Run that command on the server you want to monitor.

The generated install details include:

| Item | Purpose |
| --- | --- |
| Install command | Downloads the right probe binary, writes `config.yaml`, and prints start guidance. |
| Probe push URL | Points the probe at your deployed Probe Worker. |
| Node ID | Identifies the server in the dashboard. |
| Node-specific credential | Authenticates the probe without exposing `API_SECRET_KEY`. |

Probe binary links point to your fork's `probe-latest` release. The deployment workflow publishes or refreshes those assets automatically.

## Public Status, Alerts, And Notifications

Open `Settings` after deployment to:

- Enable Public Status and choose which monitors and fields are visible.
- Configure Webhook or Telegram notification channels.
- Keep Email disabled/reserved until a provider integration is added.

The Public Status URL in the workflow summary is safe to share only after you enable it and choose public fields.

Open `Alerts` to create monitor-aware rules and review alert history. Delivery is only attempted for configured notification channels.

## Advanced Workflow Inputs

Normal users should leave these `Deploy Self-Hosted` inputs blank:

| Input | When to use it |
| --- | --- |
| `resource_prefix` | Only when the default Cloudflare resource names conflict with another uptime-lofi copy in the same account. Use lowercase letters, numbers, and hyphens only. |
| `pages_url` | Only when Cloudflare Pages reports a production URL that differs from the workflow's automatic `*.pages.dev` default. |

The default `resource_prefix` is derived from the account Workers subdomain as `uptime-lofi-<subdomain>`.

## Troubleshooting

### Deploy Self-Hosted stops during preflight

Open the workflow run summary. The preflight section names the missing or invalid setting and gives the exact fix. Common fixes are adding `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `API_SECRET_KEY`, `INTERNAL_API_KEY`, and `PAGES_SESSION_SECRET`, or correcting an advanced `resource_prefix` value.

### Cloudflare token permission errors

Check that the token includes Workers Scripts Edit, Workers KV Storage Edit, D1 Edit, Cloudflare Pages Edit, and Account Settings Read on the correct account. Also confirm `CLOUDFLARE_ACCOUNT_ID` belongs to that same account. The normal path does not need zone permissions.

### GitHub Actions cannot find a secret

Confirm the secret is added to the forked repository, not the upstream repository. The path is `Settings -> Secrets and variables -> Actions`.

### Resource already exists

The deployment workflow is idempotent and reuses existing resources where possible. If D1, Worker, Pages, or KV names conflict with another project, rerun `Deploy Self-Hosted` with a different `resource_prefix`.

### Dashboard cannot reach the API

Confirm the workflow deployed Pages Functions and configured `BACKEND_URL`, `INTERNAL_API_KEY`, `API_SECRET_KEY`, and `PAGES_SESSION_SECRET` as Pages secrets. Browser admin APIs should go through the Dashboard URL under `/api/*`; they should not call the Worker internal API directly.

### Public Status is unavailable

Open `Settings`, enable Public Status, choose visible monitors and fields, and save. `/status` is intentionally public and read-only, but hidden fields and monitors remain omitted from the public DTO.

### Probe does not appear online

Confirm the probe is using the generated Probe Worker URL, node ID, and node-specific credential from the dashboard. Do not use `API_SECRET_KEY` directly in client-side or browser-visible config.

### Docker data is empty

If the node is online but Docker/runtime data is empty, make sure Docker collection is enabled for the probe and that the user running the probe can read the Docker socket. After changing probe settings, wait for the next push and reopen the monitor detail view.

### Statistics are empty

Statistics appear after checks or probe pushes have produced data and rollups have run. Empty states are expected for a fresh deployment.
