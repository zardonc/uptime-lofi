# uptime-lofi

Self-hosted uptime dashboard for Cloudflare Workers, Cloudflare Pages, D1, KV, and lightweight server probes.

## Self-Hosted Deployment

The intended deployment path is GitHub Actions from your fork. You do not need to run `wrangler` locally for the happy path.

### 1. Fork The Repository

Open the upstream repository on GitHub and click `Fork`. All setup below happens in your forked repository.

### 2. Create A Cloudflare API Token

In Cloudflare:

1. Open `My Profile -> API Tokens`.
2. Click `Create Token`.
3. Choose `Create Custom Token`.
4. Add these account permissions:

| Scope | Permission |
|-------|------------|
| Account | `Cloudflare Workers Scripts:Edit` |
| Account | `Workers KV Storage:Edit` |
| Account | `D1:Edit` |
| Account | `Cloudflare Pages:Edit` |
| Account | `Account Settings:Read` |

5. Set the account resource to the Cloudflare account where you want to deploy uptime-lofi.
6. Create the token and copy it once. Cloudflare will not show it again.

Zone permissions are not required for the default `*.pages.dev` and `*.workers.dev` deployment.

You also need your Cloudflare Account ID. In the Cloudflare dashboard, select your account and copy the `Account ID` from the account overview/sidebar.

### 3. Add GitHub Repository Secrets

In your forked repo, open:

`Settings -> Secrets and variables -> Actions -> New repository secret`

Add these secrets:

| Secret | Required | Value |
|--------|----------|-------|
| `CLOUDFLARE_API_TOKEN` | Yes | The Cloudflare API token from step 2 |
| `CLOUDFLARE_ACCOUNT_ID` | Yes | Your Cloudflare Account ID |
| `API_SECRET_KEY` | Yes | A long random master secret for backend/probe auth |
| `INTERNAL_API_KEY` | Yes | A separate long random secret used only between Pages Functions and the Worker internal API |
| `PAGES_SESSION_SECRET` | Yes | A long random secret used to sign admin session cookies in Pages Functions |
| `INITIAL_UI_PASSWORD` | Optional | Initial dashboard password |

Generate `API_SECRET_KEY`, `INTERNAL_API_KEY`, and `PAGES_SESSION_SECRET` with a password manager or another cryptographically random source. Treat all three as production secrets. The deployment summary names these secrets when they are missing, but never prints their values.

### 4. Run Deploy Self-Hosted

In your forked repo:

1. Open `Actions`.
2. Select `Deploy Self-Hosted`.
3. Click `Run workflow`.
4. Leave the optional inputs blank.
5. Wait for the workflow to finish.

The workflow creates or reuses Cloudflare resources, runs D1 v2 migrations, deploys the Worker internal backend, deploys the probe Worker, configures Pages Functions secrets, builds the frontend for same-origin Pages APIs, deploys Cloudflare Pages with the `functions/` directory, publishes probe binaries to the current fork's `probe-latest` GitHub Release, then runs smoke validation.

The workflow chooses safe default resource names for you. It creates separate KV namespaces for session revocation and rebuildable statistics snapshots.

When it completes, open the workflow run summary. It shows:

| Output | Purpose |
|--------|---------|
| Dashboard URL | The Cloudflare Pages URL you open in the browser |
| Public Status URL | The shareable public `/status` page, controlled by Settings |
| Worker API URL | Worker internal API endpoint used by Pages Functions |
| Probe URL | Probe Worker push endpoint |

### 5. Open The Dashboard URL

Open the Dashboard URL from the workflow summary. Complete the initial setup/login flow and confirm the panel loads normally.

### 6. Add Your First Node

From the dashboard:

1. Open `Monitors`.
2. Click `Add Monitor`.
3. Choose `Agent Probe`.
4. Click `Generate Install Command`.
5. Copy the command under `Run this on your server`.
6. Run that command on the server you want to monitor.

The dashboard provides:

| Item | Purpose |
|------|---------|
| Install command | Downloads the right probe binary, writes `config.yaml`, and prints start guidance |
| Probe push URL | Points the probe at your deployed Probe Worker |
| Node ID | Identifies the server in the dashboard |
| Node-specific credential | Authenticates the probe without exposing `API_SECRET_KEY` |

Probe binary links point to your fork's `probe-latest` release. The deployment workflow publishes or refreshes those assets automatically.

Once the probe pushes metrics successfully, the monitor appears online in `Monitors`. HTTP Check and TCP Check monitors are created from the same page.

### Optional Public Status And Alerts

Open `Settings` after deployment to enable Public Status, choose which monitors are visible, and configure Webhook or Telegram notification channels. The Public Status URL in the deployment summary stays safe to share only after you enable it and select public fields.

### Advanced troubleshooting options

Use these Advanced troubleshooting options only when the default deployment path does not fit your Cloudflare account.

Normal users should leave these `Deploy Self-Hosted` inputs blank:

| Input | When to use it |
|-------|----------------|
| `resource_prefix` | Only when the default Cloudflare resource names conflict with another uptime-lofi copy in the same account. Use lowercase letters, numbers, and hyphens only. |
| `pages_url` | Only when Cloudflare Pages reports a production URL that differs from the workflow's automatic `*.pages.dev` default. |

## Troubleshooting

### Deploy Self-Hosted stops during preflight

Open the workflow run summary. The preflight section names the missing or invalid setting and gives the exact fix. Common fixes are adding `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `API_SECRET_KEY`, `INTERNAL_API_KEY`, and `PAGES_SESSION_SECRET` under `Settings -> Secrets and variables -> Actions -> New repository secret`, or correcting an advanced `resource_prefix` value.

### Cloudflare token permission errors

Check that the token includes Workers Scripts Edit, Workers KV Storage Edit, D1 Edit, Cloudflare Pages Edit, and Account Settings Read on the correct account. Also confirm `CLOUDFLARE_ACCOUNT_ID` belongs to that same account. The happy path does not need zone permissions.

### GitHub Actions cannot find a secret

Confirm the secret is added to the forked repository, not the upstream repository. The path is `Settings -> Secrets and variables -> Actions`.

### Resource already exists

The deployment workflow is idempotent and reuses existing resources where possible. If D1, Worker, Pages, or KV names conflict with another project, rerun `Deploy Self-Hosted` with a different `resource_prefix`.

### Dashboard cannot reach the API

Confirm the workflow deployed Pages Functions and configured `BACKEND_URL`, `INTERNAL_API_KEY`, `API_SECRET_KEY`, and `PAGES_SESSION_SECRET` as Pages secrets. Browser admin APIs should go through the Dashboard URL under `/api/v1/*`; they should not call the Worker internal API directly.

### Probe does not appear online

Confirm the probe is using the generated Probe Worker URL, node ID, and node-specific credential from the dashboard. Do not use `API_SECRET_KEY` directly in client-side/browser-visible config.

### Docker data is empty

If the node is online but Docker shows no data, make sure Docker collection is enabled for the probe and that the user running the probe can read the Docker socket. After changing probe settings, wait for the next push and reopen the node detail drawer.
