#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_PATH="$ROOT_DIR/scripts/ci/self-host-cloudflare.sh"
TMP_ROOT="${TMPDIR:-/tmp}/uptime-lofi-self-host-tests"

mkdir -p "$TMP_ROOT"

assert_contains() {
  local file="$1"
  local expected="$2"

  grep -F -- "$expected" "$file" >/dev/null
}

assert_not_contains() {
  local file="$1"
  local unexpected="$2"

  if grep -F -- "$unexpected" "$file" >/dev/null; then
    printf 'Did not expect summary to contain: %s\n' "$unexpected" >&2
    return 1
  fi
}

assert_count() {
  local file="$1"
  local expected="$2"
  local count="$3"
  local actual
  actual=$(grep -F -- "$expected" "$file" | wc -l | tr -d ' ')

  if [ "$actual" != "$count" ]; then
    printf 'Expected %s occurrences of %s, found %s\n' "$count" "$expected" "$actual" >&2
    return 1
  fi
}

run_preflight() {
  local summary_file="$1"
  shift

  env -i \
    PATH="$PATH" \
    GITHUB_STEP_SUMMARY="$summary_file" \
    BASH_ENV= \
    "$@" \
    bash -c "source '$SCRIPT_PATH'; preflight_self_host_deploy"
}

test_missing_required_secrets() {
  local summary_file="$TMP_ROOT/missing-secrets-summary.md"
  rm -f "$summary_file"

  if run_preflight "$summary_file"; then
    printf 'Expected missing required secrets preflight to fail\n' >&2
    return 1
  fi

  assert_contains "$summary_file" "CLOUDFLARE_API_TOKEN"
  assert_contains "$summary_file" "CLOUDFLARE_ACCOUNT_ID"
  assert_contains "$summary_file" "API_SECRET_KEY"
  assert_contains "$summary_file" "INTERNAL_API_KEY"
  assert_contains "$summary_file" "PAGES_SESSION_SECRET"
  assert_contains "$summary_file" "Settings -> Secrets and variables -> Actions"
  assert_contains "$summary_file" "Settings -> Secrets and variables -> Actions -> New repository secret"
  assert_count "$summary_file" "## Preflight failed" 1
}

test_invalid_resource_prefix() {
  local summary_file="$TMP_ROOT/invalid-prefix-summary.md"
  rm -f "$summary_file"

  if run_preflight "$summary_file" \
    CLOUDFLARE_API_TOKEN=token \
    CLOUDFLARE_ACCOUNT_ID=account \
    API_SECRET_KEY=secret \
    INTERNAL_API_KEY=internal-secret \
    PAGES_SESSION_SECRET=pages-session-secret \
    CLOUDFLARE_ACCOUNT_SUBDOMAIN=demo \
    RESOURCE_PREFIX='Bad Prefix!'; then
    printf 'Expected invalid resource prefix preflight to fail\n' >&2
    return 1
  fi

  assert_contains "$summary_file" "resource_prefix must use lowercase letters, numbers, and hyphens"
  assert_contains "$summary_file" "Example: uptime-lofi-demo"
}

test_summary_does_not_leak_cloudflare_token() {
  local summary_file="$TMP_ROOT/no-token-leak-summary.md"
  local token_value="super-secret-cloudflare-token"
  rm -f "$summary_file"

  if run_preflight "$summary_file" \
    CLOUDFLARE_API_TOKEN="$token_value" \
    CLOUDFLARE_ACCOUNT_ID=account \
    API_SECRET_KEY=secret \
    INTERNAL_API_KEY=internal-secret \
    PAGES_SESSION_SECRET=pages-session-secret \
    CLOUDFLARE_ACCOUNT_SUBDOMAIN=demo \
    RESOURCE_PREFIX='Bad Prefix!'; then
    printf 'Expected invalid resource prefix preflight to fail\n' >&2
    return 1
  fi

  assert_not_contains "$summary_file" "$token_value"
}

test_cloudflare_api_failure_summary() {
  local summary_file="$TMP_ROOT/cloudflare-api-summary.md"
  local fake_bin="$TMP_ROOT/fake-bin"
  local token_value="cloudflare-token-value"
  rm -f "$summary_file"
  mkdir -p "$fake_bin"
  cat > "$fake_bin/curl" <<'SH'
#!/usr/bin/env bash
printf '{"success":false,"errors":[{"message":"authentication error"}]}'
SH
  chmod +x "$fake_bin/curl"

  if PATH="$fake_bin:$PATH" run_preflight "$summary_file" \
    CLOUDFLARE_API_TOKEN="$token_value" \
    CLOUDFLARE_ACCOUNT_ID=account \
    INTERNAL_API_KEY=internal-secret \
    PAGES_SESSION_SECRET=pages-session-secret \
    API_SECRET_KEY=secret; then
    printf 'Expected Cloudflare API preflight to fail\n' >&2
    return 1
  fi

  assert_contains "$summary_file" "Workers Scripts Edit"
  assert_contains "$summary_file" "Workers KV Storage Edit"
  assert_contains "$summary_file" "D1 Edit"
  assert_contains "$summary_file" "Cloudflare Pages Edit"
  assert_contains "$summary_file" "Account Settings Read"
  assert_not_contains "$summary_file" "$token_value"
}

test_v2_resource_summary_and_template_rendering() {
  local summary_file="$TMP_ROOT/v2-summary.md"
  local output_file="$TMP_ROOT/v2-output.txt"
  local internal_key_value="internal-key-should-not-print"
  rm -f "$summary_file" "$output_file" "$ROOT_DIR/backend/wrangler.self-host.generated.toml" "$ROOT_DIR/backend/probe-wrangler.self-host.generated.toml"

  (
    source "$SCRIPT_PATH"

    preflight_self_host_deploy() {
      ACCOUNT_SUBDOMAIN=demo
      validate_resource_prefix
      export ACCOUNT_SUBDOMAIN PREFLIGHT_SELF_HOST_DONE=1
    }

    find_or_create_d1() {
      printf 'd1-generated-id'
    }

    find_or_create_kv() {
      case "$1" in
        *-sessions) printf 'session-kv-id' ;;
        *-statistics) printf 'statistics-kv-id' ;;
        *) return 1 ;;
      esac
    }

    ensure_pages_project() {
      return 0
    }

    GITHUB_STEP_SUMMARY="$summary_file" \
    GITHUB_OUTPUT="$output_file" \
    CLOUDFLARE_API_TOKEN=token \
    CLOUDFLARE_ACCOUNT_ID=account \
    API_SECRET_KEY=api-secret \
    INTERNAL_API_KEY="$internal_key_value" \
    PAGES_SESSION_SECRET=pages-session-secret \
    CLOUDFLARE_ACCOUNT_SUBDOMAIN=demo \
    RESOURCE_PREFIX=uptime-lofi-demo \
    ensure_self_host_resources
  )

  assert_contains "$summary_file" "Public Status URL"
  assert_contains "$summary_file" "Worker API URL"
  assert_contains "$summary_file" "Session KV namespace"
  assert_contains "$summary_file" "Statistics KV namespace"
  assert_contains "$summary_file" "Pages Functions must be deployed with BACKEND_URL, INTERNAL_API_KEY, API_SECRET_KEY, PAGES_SESSION_SECRET, and PAGES_ADMIN_PASSWORD"
  assert_not_contains "$summary_file" "$internal_key_value"
  assert_contains "$output_file" "public_status_url=https://uptime-lofi-demo.pages.dev/status"
  assert_contains "$ROOT_DIR/backend/wrangler.self-host.generated.toml" 'binding = "STATISTICS_CACHE"'
  assert_contains "$ROOT_DIR/backend/wrangler.self-host.generated.toml" 'id = "statistics-kv-id"'
  assert_contains "$ROOT_DIR/backend/wrangler.self-host.generated.toml" 'binding = "SESSION_BLACKLIST"'
  assert_contains "$ROOT_DIR/backend/wrangler.self-host.generated.toml" 'id = "session-kv-id"'
  assert_not_contains "$ROOT_DIR/backend/wrangler.self-host.generated.toml" "__STATISTICS_KV_NAMESPACE_ID__"
  rm -f "$ROOT_DIR/backend/wrangler.self-host.generated.toml" "$ROOT_DIR/backend/probe-wrangler.self-host.generated.toml"
}

test_pages_functions_deploy_command() {
  local workflow_file="$ROOT_DIR/.github/workflows/deploy-production.yml"

  assert_contains "$workflow_file" "wrangler --cwd .. pages functions build functions --outdir frontend/dist/_worker.js"
  assert_contains "$workflow_file" "wrangler --cwd .. pages deploy frontend/dist --project-name="
  assert_contains "$workflow_file" "wrangler --cwd .. pages secret put BACKEND_URL"
  assert_contains "$workflow_file" "pages secret put PAGES_ADMIN_PASSWORD"
  assert_contains "$workflow_file" '${INITIAL_UI_PASSWORD:-$API_SECRET_KEY}'
  assert_not_contains "$workflow_file" "wrangler pages deploy ../frontend/dist"
  assert_not_contains "$workflow_file" "wrangler pages secret put"
  assert_not_contains "$workflow_file" "--outfile ../frontend/dist/_worker.js"
  assert_not_contains "$workflow_file" "--functions="
}

test_missing_required_secrets
test_invalid_resource_prefix
test_summary_does_not_leak_cloudflare_token
test_cloudflare_api_failure_summary
test_v2_resource_summary_and_template_rendering
test_pages_functions_deploy_command

printf 'self-host-cloudflare preflight tests passed\n'
