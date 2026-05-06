#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_PATH="$ROOT_DIR/scripts/ci/self-host-cloudflare.sh"
TMP_ROOT="${TMPDIR:-/tmp}/uptime-lofi-self-host-tests"

mkdir -p "$TMP_ROOT"

assert_contains() {
  local file="$1"
  local expected="$2"

  grep -F "$expected" "$file" >/dev/null
}

assert_not_contains() {
  local file="$1"
  local unexpected="$2"

  if grep -F "$unexpected" "$file" >/dev/null; then
    printf 'Did not expect summary to contain: %s\n' "$unexpected" >&2
    return 1
  fi
}

assert_count() {
  local file="$1"
  local expected="$2"
  local count="$3"
  local actual
  actual=$(grep -F "$expected" "$file" | wc -l | tr -d ' ')

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

test_missing_required_secrets
test_invalid_resource_prefix
test_summary_does_not_leak_cloudflare_token
test_cloudflare_api_failure_summary

printf 'self-host-cloudflare preflight tests passed\n'
