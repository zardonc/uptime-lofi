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
| `INITIAL_UI_PASSWORD` | Optional | Initial dashboard password |

Generate `API_SECRET_KEY` with a password manager or another cryptographically random source. Treat it as a production secret.

### 4. Run Deploy Self-Hosted

In your forked repo:

1. Open `Actions`.
2. Select `Deploy Self-Hosted`.
3. Click `Run workflow`.
4. Leave `pages_url` empty/default unless you already know your deployed Pages URL should be different. The default is `https://uptime-lofi.pages.dev`.
5. Wait for the workflow to finish.

The workflow creates or reuses Cloudflare resources, runs D1 migrations, deploys the dashboard Worker, deploys the probe Worker, builds the frontend with the deployed API URL, deploys Cloudflare Pages, then runs smoke validation.

When it completes, open the workflow run summary. It shows:

| Output | Purpose |
|--------|---------|
| Dashboard URL | The Cloudflare Pages URL you open in the browser |
| API URL | Dashboard Worker API endpoint |
| Probe URL | Probe Worker push endpoint |

### 5. Open The Dashboard

Open the Dashboard URL from the workflow summary. Complete the initial setup/login flow and confirm the panel loads normally.

### 6. Generate Probe Config

From the dashboard, open `Settings -> Probe Installation` and click `Generate Probe Config`.

The dashboard provides:

| Item | Purpose |
|------|---------|
| Probe binary download link | Download the probe for your server platform |
| Probe push URL | Points the probe at your deployed Probe Worker |
| Node ID | Identifies the server in the dashboard |
| Node credential/config | Authenticates the probe without exposing the master secret |
| Copyable or downloadable config | Use this on the server running the probe |

Start the probe on your server. Once it pushes metrics successfully, the node appears online in the dashboard.

## Troubleshooting

### Cloudflare token permission errors

Check that the token includes Workers Scripts Edit, Workers KV Storage Edit, D1 Edit, Cloudflare Pages Edit, and Account Settings Read on the correct account.

### GitHub Actions cannot find a secret

Confirm the secret is added to the forked repository, not the upstream repository. The path is `Settings -> Secrets and variables -> Actions`.

### Resource already exists

The deployment workflow is idempotent and reuses existing resources where possible. If a resource-name conflict belongs to another project in the same Cloudflare account, rename or remove that resource before re-running the workflow.

### Dashboard cannot reach the API

Confirm the workflow built the frontend with the deployed Dashboard Worker URL and that CORS allows the deployed Pages URL.

### Probe does not appear online

Confirm the probe is using the generated Probe Worker URL, node ID, and node-specific credential from the dashboard. Do not use `API_SECRET_KEY` directly in client-side/browser-visible config.
