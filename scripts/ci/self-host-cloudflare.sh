#!/usr/bin/env bash
set -euo pipefail

RESOURCE_PREFIX="${RESOURCE_PREFIX:-uptime-lofi}"
KV_NAMESPACE_NAME="SESSION_BLACKLIST"
GITHUB_REPO_SLUG="${GITHUB_REPOSITORY:-example/uptime-lofi}"

log() {
  printf '[self-host] %s\n' "$1" >&2
}

fail() {
  printf '[self-host] ERROR: %s\n' "$1" >&2
  exit 1
}

require_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    fail "${name} is required"
  fi
}

append_summary() {
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    printf '%s\n' "$1" >> "$GITHUB_STEP_SUMMARY"
  fi
}

write_output() {
  local key="$1"
  local value="$2"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    printf '%s=%s\n' "$key" "$value" >> "$GITHUB_OUTPUT"
  fi
}

json_payload() {
  python - "$@" <<'PY'
import json
import sys

values = {}
for pair in sys.argv[1:]:
    key, value = pair.split('=', 1)
    values[key] = value
print(json.dumps(values))
PY
}

json_result_match() {
  local match_key="$1"
  local match_value="$2"
  local fields="$3"
  python -c "import json,sys
match_key, match_value, fields = sys.argv[1], sys.argv[2], sys.argv[3].split(',')
raw = sys.stdin.read().strip()
if not raw:
    print('')
    raise SystemExit(0)
try:
    data = json.loads(raw)
except json.JSONDecodeError:
    print('')
    raise SystemExit(0)
items = []
if isinstance(data, list):
    items = data
elif isinstance(data, dict):
    result = data.get('result')
    if isinstance(result, list):
        items = result
    elif isinstance(result, dict):
        for value in result.values():
            if isinstance(value, list):
                items = value
                break
for item in items:
    if isinstance(item, dict) and item.get(match_key) == match_value:
        for field in fields:
            if item.get(field):
                print(item[field])
                raise SystemExit(0)
print('')" "$match_key" "$match_value" "$fields"
}

json_result_deep_any() {
  local fields="$1"
  python -c "import json,sys
fields = sys.argv[1].split(',')
raw = sys.stdin.read().strip()
if not raw:
    print('')
    raise SystemExit(0)
try:
    data = json.loads(raw)
except json.JSONDecodeError:
    print('')
    raise SystemExit(0)
def walk(value):
    if isinstance(value, dict):
        for field in fields:
            if value.get(field):
                return value[field]
        for child in value.values():
            found = walk(child)
            if found:
                return found
    elif isinstance(value, list):
        for child in value:
            found = walk(child)
            if found:
                return found
    return ''
print(walk(data))" "$fields"
}

cf_api() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local url="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}${path}"

  if [ -n "$body" ]; then
    curl --silent --show-error -X "$method" \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data "$body" \
      "$url"
  else
    curl --silent --show-error -X "$method" \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      -H "Content-Type: application/json" \
      "$url"
  fi
}

validate_resource_prefix() {
  if ! [[ "$RESOURCE_PREFIX" =~ ^[a-z0-9][a-z0-9-]{0,62}$ ]]; then
    fail "resource_prefix must use lowercase letters, numbers, and hyphens, and start with a letter or number. Current value: ${RESOURCE_PREFIX}"
  fi

  D1_DATABASE_NAME="${RESOURCE_PREFIX}-db"
  DASHBOARD_WORKER_NAME="${RESOURCE_PREFIX}-backend"
  PROBE_WORKER_NAME="${RESOURCE_PREFIX}-probe"
  PAGES_PROJECT_NAME="${RESOURCE_PREFIX}"

  export RESOURCE_PREFIX D1_DATABASE_NAME KV_NAMESPACE_NAME DASHBOARD_WORKER_NAME PROBE_WORKER_NAME PAGES_PROJECT_NAME GITHUB_REPO_SLUG
}

get_workers_subdomain() {
  local response
  response=$(cf_api GET "/workers/subdomain")
  printf '%s' "$response" | python -c "import json,sys; data=json.load(sys.stdin); print((data.get('result') or {}).get('subdomain') or '')"
}

find_or_create_d1() {
  local name="${1:-$D1_DATABASE_NAME}"
  local list_response existing create_response created

  list_response=$(cf_api GET "/d1/database")
  existing=$(printf '%s' "$list_response" | json_result_match name "$name" uuid,database_id,id)
  if [ -n "$existing" ]; then
    log "Reusing D1 database ${name}"
    printf '%s' "$existing"
    return 0
  fi

  log "Creating D1 database ${name}"
  create_response=$(cf_api POST "/d1/database" "$(json_payload name="$name")")
  created=$(printf '%s' "$create_response" | json_result_deep_any uuid,database_id,id)
  if [ -n "$created" ]; then
    printf '%s' "$created"
    return 0
  fi

  list_response=$(cf_api GET "/d1/database")
  existing=$(printf '%s' "$list_response" | json_result_match name "$name" uuid,database_id,id)
  if [ -n "$existing" ]; then
    log "Reusing D1 database ${name} after create conflict"
    printf '%s' "$existing"
    return 0
  fi

  printf '%s\n' "$create_response" >&2
  fail "Could not create or find D1 database ${name}"
}

find_or_create_kv() {
  local name="$KV_NAMESPACE_NAME"
  local list_response existing create_response created

  list_response=$(cf_api GET "/storage/kv/namespaces")
  existing=$(printf '%s' "$list_response" | json_result_match title "$name" id)
  if [ -n "$existing" ]; then
    log "Reusing fixed KV namespace ${name}"
    printf '%s' "$existing"
    return 0
  fi

  log "Creating fixed KV namespace ${name}"
  create_response=$(cf_api POST "/storage/kv/namespaces" "$(json_payload title="$name")")
  created=$(printf '%s' "$create_response" | json_result_deep_any id)
  if [ -n "$created" ]; then
    printf '%s' "$created"
    return 0
  fi

  list_response=$(cf_api GET "/storage/kv/namespaces")
  existing=$(printf '%s' "$list_response" | json_result_match title "$name" id)
  if [ -n "$existing" ]; then
    log "Reusing fixed KV namespace ${name} after create conflict"
    printf '%s' "$existing"
    return 0
  fi

  printf '%s\n' "$create_response" >&2
  fail "Could not create or find fixed KV namespace ${name}"
}

ensure_pages_project() {
  local name="${1:-$PAGES_PROJECT_NAME}"
  local list_response existing create_response

  list_response=$(cf_api GET "/pages/projects")
  existing=$(printf '%s' "$list_response" | json_result_match name "$name" name)
  if [ -n "$existing" ]; then
    log "Reusing Pages project ${name}"
    return 0
  fi

  log "Creating Pages project ${name}"
  create_response=$(cf_api POST "/pages/projects" "$(json_payload name="$name" production_branch="main")")
  existing=$(printf '%s' "$create_response" | json_result_deep_any name)
  if [ "$existing" = "$name" ]; then
    return 0
  fi

  list_response=$(cf_api GET "/pages/projects")
  existing=$(printf '%s' "$list_response" | json_result_match name "$name" name)
  if [ -n "$existing" ]; then
    log "Reusing Pages project ${name} after create conflict"
    return 0
  fi

  printf '%s\n' "$create_response" >&2
  fail "Could not create or find Pages project ${name}"
}

render_template() {
  local template="$1"
  local output="$2"
  cp "$template" "$output"
  python - "$output" <<'PY'
import os
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
values = {
    "__DASHBOARD_WORKER_NAME__": os.environ["DASHBOARD_WORKER_NAME"],
    "__PROBE_WORKER_NAME__": os.environ["PROBE_WORKER_NAME"],
    "__D1_DATABASE_NAME__": os.environ["D1_DATABASE_NAME"],
    "__D1_DATABASE_ID__": os.environ["D1_DATABASE_ID"],
    "__KV_NAMESPACE_ID__": os.environ["KV_NAMESPACE_ID"],
    "__KV_PREVIEW_ID__": os.environ["KV_PREVIEW_ID"],
    "__PAGES_URL__": os.environ["PAGES_URL"],
    "__PROBE_WORKER_URL__": os.environ["PROBE_WORKER_URL"],
}
for token, value in values.items():
    text = text.replace(token, value)
path.write_text(text, encoding="utf-8")
PY
}

ensure_self_host_resources() {
  require_env CLOUDFLARE_API_TOKEN
  require_env CLOUDFLARE_ACCOUNT_ID
  require_env API_SECRET_KEY
  validate_resource_prefix

  D1_DATABASE_ID="$(find_or_create_d1 "$D1_DATABASE_NAME")"
  KV_NAMESPACE_ID="$(find_or_create_kv)"
  KV_PREVIEW_ID="$KV_NAMESPACE_ID"
  ACCOUNT_SUBDOMAIN="${CLOUDFLARE_ACCOUNT_SUBDOMAIN:-$(get_workers_subdomain)}"
  if [ -z "$ACCOUNT_SUBDOMAIN" ]; then
    fail "Could not determine Workers subdomain. Set CLOUDFLARE_ACCOUNT_SUBDOMAIN as a repository variable or enable workers.dev for the account."
  fi
  DASHBOARD_WORKER_URL="https://${DASHBOARD_WORKER_NAME}.${ACCOUNT_SUBDOMAIN}.workers.dev"
  PROBE_WORKER_URL="https://${PROBE_WORKER_NAME}.${ACCOUNT_SUBDOMAIN}.workers.dev"
  PAGES_URL="${SELF_HOST_PAGES_URL:-https://${PAGES_PROJECT_NAME}.pages.dev}"

  export D1_DATABASE_ID KV_NAMESPACE_ID KV_PREVIEW_ID DASHBOARD_WORKER_URL PROBE_WORKER_URL PAGES_URL

  ensure_pages_project "$PAGES_PROJECT_NAME"
  render_template backend/wrangler.self-host.template.toml backend/wrangler.self-host.generated.toml
  render_template backend/probe-wrangler.self-host.template.toml backend/probe-wrangler.self-host.generated.toml

  write_output d1_database_name "$D1_DATABASE_NAME"
  write_output d1_database_id "$D1_DATABASE_ID"
  write_output kv_namespace_id "$KV_NAMESPACE_ID"
  write_output dashboard_worker_url "$DASHBOARD_WORKER_URL"
  write_output probe_worker_url "$PROBE_WORKER_URL"
  write_output pages_url "$PAGES_URL"
  write_output pages_project_name "$PAGES_PROJECT_NAME"

  append_summary "## Uptime-LoFi Self-Hosted Deployment"
  append_summary ""
  append_summary "| Output | Value |"
  append_summary "|--------|-------|"
  append_summary "| Resource prefix | ${RESOURCE_PREFIX} |"
  append_summary "| Dashboard URL | ${PAGES_URL} |"
  append_summary "| API URL | ${DASHBOARD_WORKER_URL} |"
  append_summary "| Probe URL | ${PROBE_WORKER_URL} |"
  append_summary "| Fixed KV namespace | ${KV_NAMESPACE_NAME} |"
  append_summary ""
  append_summary "Next: open the Dashboard URL, complete login, then use Settings -> Probe Installation to generate probe config."
}
