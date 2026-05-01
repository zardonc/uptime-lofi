#!/usr/bin/env bash
set -euo pipefail

# ─── Uptime-LoFi Cloudflare Resource Initialization ───
# Optional local fallback for provisioning Cloudflare resources.
# Preferred path: run GitHub Actions -> Deploy Self-Hosted from your fork.
#
# Prerequisites:
#   - wrangler CLI installed and authenticated
#   - CLOUDFLARE_ACCOUNT_ID set as environment variable
#   - CLOUDFLARE_API_TOKEN set as environment variable
#     Required token permissions:
#       • Workers Scripts: Edit
#       • D1: Edit
#       • Workers KV Storage: Edit
#       • Cloudflare Pages: Edit
#       • Account Settings: Read
#
# Usage:
#   export CLOUDFLARE_ACCOUNT_ID="your-account-id"
#   export CLOUDFLARE_API_TOKEN="your-api-token"
#   bash scripts/init-cloudflare.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ─── Color output ───
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

# ─── Validate Prerequisites ───
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Uptime-LoFi — Optional local fallback"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if ! command -v wrangler &> /dev/null; then
  error "wrangler CLI not found. Install: npm install -g wrangler"
  exit 1
fi

if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  error "CLOUDFLARE_ACCOUNT_ID is not set."
  echo "  export CLOUDFLARE_ACCOUNT_ID=\"your-account-id\""
  exit 1
fi

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  error "CLOUDFLARE_API_TOKEN is not set."
  echo "  Required permissions: Workers Scripts Edit, D1 Edit, KV Storage Edit, Pages Edit, Account Read"
  exit 1
fi

ok "Prerequisites validated"

# ─── Prompt for secrets ───
read -sp "Enter API_SECRET_KEY for self-host fallback: " API_SECRET_KEY_PROD
echo ""
read -sp "Optional maintainer staging API_SECRET_KEY: " API_SECRET_KEY_STAGING
echo ""
read -p "Enter JWT_AUDIENCE (e.g., uptime-lofi): " JWT_AUDIENCE
read -p "Enter JWT_ISSUER (e.g., uptime-lofi-api): " JWT_ISSUER

# ─── Resource Creation ───
RESULTS_FILE=$(mktemp)

create_d1() {
  local name="$1"
  local label="$2"
  info "Creating D1 database: ${name}..."
  local output
  output=$(wrangler d1 create "$name" 2>&1) || {
    if echo "$output" | grep -q "already exists"; then
      warn "D1 database '${name}' already exists — skipping"
      return 0
    fi
    error "Failed to create D1 database: ${name}"
    echo "$output"
    return 1
  }
  local db_id
  db_id=$(echo "$output" | grep "database_id" | sed 's/.*= "\(.*\)"/\1/' | tr -d ' "')
  echo "${label}_DB_ID=${db_id}" >> "$RESULTS_FILE"
  ok "D1 database created: ${name} (ID: ${db_id})"
}

create_kv() {
  local name="$1"
  local label="$2"
  info "Creating KV namespace: ${name}..."
  local output
  output=$(wrangler kv namespace create "$name" 2>&1) || {
    if echo "$output" | grep -q "already exists"; then
      warn "KV namespace '${name}' already exists — skipping"
      return 0
    fi
    error "Failed to create KV namespace: ${name}"
    echo "$output"
    return 1
  }
  local kv_id
  kv_id=$(echo "$output" | grep '"id"' | head -1 | sed 's/.*"\(.*\)".*/\1/' | tr -d ' ')
  echo "${label}_KV_ID=${kv_id}" >> "$RESULTS_FILE"
  ok "KV namespace created: ${name} (ID: ${kv_id})"
}

create_pages_project() {
  local name="$1"
  local label="$2"
  info "Creating Pages project: ${name}..."
  local output
  output=$(wrangler pages project create "$name" --production-branch=main 2>&1) || {
    if echo "$output" | grep -q "already exists"; then
      warn "Pages project '${name}' already exists — skipping"
      return 0
    fi
    error "Failed to create Pages project: ${name}"
    echo "$output"
    return 1
  }
  ok "Pages project created: ${name} (${label})"
}

echo ""
info "═══ Creating Production Resources ═══"
create_d1 "uptime-lofi-db" "PROD"
create_kv "SESSION_BLACKLIST" "PROD"
create_pages_project "uptime-lofi" "PROD"

echo ""
info "═══ Creating Optional Maintainer Staging Resources ═══"
create_d1 "uptime-lofi-db-staging" "STAGING"
create_kv "SESSION_BLACKLIST_STAGING" "STAGING"
create_pages_project "uptime-lofi-staging" "STAGING"

# ─── Run D1 Migrations ───
echo ""
info "═══ Running D1 Migrations ═══"

MIGRATION_DIR="${PROJECT_ROOT}/backend/migrations"

if [ -d "$MIGRATION_DIR" ]; then
  for sql_file in "$MIGRATION_DIR"/*.sql; do
    filename=$(basename "$sql_file")
    info "Running migration: ${filename} on PRODUCTION..."
    wrangler d1 execute uptime-lofi-db --file="$sql_file" --remote || warn "Migration ${filename} may have already been applied (production)"

    info "Running migration: ${filename} on optional maintainer staging..."
    wrangler d1 execute uptime-lofi-db-staging --file="$sql_file" --remote || warn "Migration ${filename} may have already been applied (staging)"
  done
  ok "D1 migrations complete"
else
  warn "No migrations directory found at ${MIGRATION_DIR}"
fi

# ─── Set Worker Secrets ───
echo ""
info "═══ Setting Worker Secrets ═══"

set_secret() {
  local worker_name="$1"
  local key="$2"
  local value="$3"
  local env_flag="${4:-}"
  info "Setting ${key} on ${worker_name}${env_flag}..."
  echo "$value" | wrangler secret put "$key" --name "$worker_name" $env_flag 2>&1 || warn "Failed to set ${key} on ${worker_name}"
}

# Production secrets
set_secret "uptime-lofi-backend" "API_SECRET_KEY" "$API_SECRET_KEY_PROD"
set_secret "uptime-lofi-backend" "JWT_AUDIENCE" "$JWT_AUDIENCE"
set_secret "uptime-lofi-backend" "JWT_ISSUER" "$JWT_ISSUER"
set_secret "uptime-lofi-probe" "API_SECRET_KEY" "$API_SECRET_KEY_PROD"

# Optional maintainer staging secrets
set_secret "uptime-lofi-backend-staging" "API_SECRET_KEY" "$API_SECRET_KEY_STAGING"
set_secret "uptime-lofi-backend-staging" "JWT_AUDIENCE" "$JWT_AUDIENCE"
set_secret "uptime-lofi-backend-staging" "JWT_ISSUER" "$JWT_ISSUER"
set_secret "uptime-lofi-probe-staging" "API_SECRET_KEY" "$API_SECRET_KEY_STAGING"

# CORS origins (using default Cloudflare domains)
CORS_PROD="https://uptime-lofi.pages.dev"
CORS_STAGING="https://uptime-lofi-staging.pages.dev"
set_secret "uptime-lofi-backend" "CORS_ORIGINS" "$CORS_PROD"
set_secret "uptime-lofi-backend-staging" "CORS_ORIGINS" "$CORS_STAGING"

ok "Worker secrets configured"

# ─── Summary ───
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Initialization Complete"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Resource IDs (fallback only; do not commit generated IDs for the self-host happy path):"
echo ""
cat "$RESULTS_FILE" 2>/dev/null || echo "(No new resources created — may already exist)"
echo ""
echo "Next steps:"
echo "  Preferred: run GitHub Actions -> Deploy Self-Hosted from your fork"
echo "  Fallback only: use the printed IDs to render local Wrangler config manually"
echo "  GitHub Secrets for self-host: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, API_SECRET_KEY"
echo ""

rm -f "$RESULTS_FILE"
