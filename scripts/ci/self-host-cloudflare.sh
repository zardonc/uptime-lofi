#!/usr/bin/env bash
set -euo pipefail

D1_DATABASE_NAME="uptime-lofi-db"
KV_NAMESPACE_NAME="SESSION_BLACKLIST"
DASHBOARD_WORKER_NAME="uptime-lofi-backend"
PROBE_WORKER_NAME="uptime-lofi-probe"
PAGES_PROJECT_NAME="uptime-lofi"
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

wrangler_json() {
  pnpm --dir backend exec wrangler "$@" --json
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

json_deep_any() {
  local fields="$1"
  python -c "import json,sys; targets='$fields'.split(','); raw=sys.stdin.read().strip()
if not raw:
    print('')
    raise SystemExit(0)
try:
    data=json.loads(raw)
except json.JSONDecodeError:
    print('')
    raise SystemExit(0)
def walk(value):
    if isinstance(value, dict):
        for target in targets:
            if target in value and value[target]:
                return value[target]
        for item in value.values():
            found = walk(item)
            if found:
                return found
    if isinstance(value, list):
        for item in value:
            found = walk(item)
            if found:
                return found
    return ''
print(walk(data))"
}

wrangler_capture() {
  local output
  if ! output=$(pnpm --dir backend exec wrangler "$@" 2>&1); then
    printf '%s\n' "$output" >&2
    return 1
  fi
  printf '%s' "$output"
}

extract_d1_id_from_list() {
  local name="$1"
  json_deep_any uuid,database_id,id <<EOF
$(printf '%s' "$2" | python -c "import json,sys; raw=sys.stdin.read().strip()
try:
    data=json.loads(raw)
except json.JSONDecodeError:
    print('[]')
    raise SystemExit(0)
items=data if isinstance(data, list) else data.get('result', data.get('databases', [])) if isinstance(data, dict) else []
print(json.dumps([item for item in items if isinstance(item, dict) and item.get('name') == '$name']))")
EOF
}

extract_kv_id_from_list() {
  local name="$1"
  json_deep_any id <<EOF
$(printf '%s' "$2" | python -c "import json,sys; raw=sys.stdin.read().strip()
try:
    data=json.loads(raw)
except json.JSONDecodeError:
    print('[]')
    raise SystemExit(0)
items=data if isinstance(data, list) else data.get('result', []) if isinstance(data, dict) else []
print(json.dumps([item for item in items if isinstance(item, dict) and (item.get('title') == '$name' or item.get('name') == '$name')]))")
EOF
}

extract_id_from_text() {
  printf '%s' "$1" | sed -nE 's/.*\b(id|uuid|database_id)[[:space:]]*=[[:space:]]*"?([a-fA-F0-9-]{32,36})"?.*/\2/p' | head -1
}

get_workers_subdomain() {
  local response
  response=$(curl --fail --silent --show-error \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/subdomain")
  printf '%s' "$response" | python -c "import json,sys; data=json.load(sys.stdin); print((data.get('result') or {}).get('subdomain') or '')"
}

find_or_create_d1() {
  local name="${1:-$D1_DATABASE_NAME}"
  local list_output existing create_output created
  list_output=$(wrangler_capture d1 list --json || true)
  existing=$(extract_d1_id_from_list "$name" "$list_output")
  if [ -n "$existing" ]; then
    log "Reusing D1 database ${name}"
    printf '%s' "$existing"
    return 0
  fi

  log "Creating D1 database ${name}"
  create_output=$(wrangler_capture d1 create "$name")
  created=$(printf '%s' "$create_output" | json_deep_any uuid,database_id,id)
  if [ -z "$created" ]; then
    created=$(extract_id_from_text "$create_output")
  fi
  if [ -z "$created" ]; then
    printf '%s\n' "$create_output" >&2
    fail "Could not parse D1 database id for ${name} from Wrangler output"
  fi
  printf '%s' "$created"
}

find_or_create_kv() {
  local name="${1:-$KV_NAMESPACE_NAME}"
  local list_output existing create_output created
  list_output=$(wrangler_capture kv namespace list --json || true)
  existing=$(extract_kv_id_from_list "$name" "$list_output")
  if [ -n "$existing" ]; then
    log "Reusing KV namespace ${name}"
    printf '%s' "$existing"
    return 0
  fi

  log "Creating KV namespace ${name}"
  create_output=$(wrangler_capture kv namespace create "$name")
  created=$(printf '%s' "$create_output" | json_deep_any id)
  if [ -z "$created" ]; then
    created=$(extract_id_from_text "$create_output")
  fi
  if [ -z "$created" ]; then
    printf '%s\n' "$create_output" >&2
    fail "Could not parse KV namespace id for ${name} from Wrangler output"
  fi
  printf '%s' "$created"
}

ensure_pages_project() {
  local name="${1:-$PAGES_PROJECT_NAME}"
  if pnpm --dir backend exec wrangler pages project list 2>/dev/null | grep -q "$name"; then
    log "Reusing Pages project ${name}"
    return 0
  fi

  log "Creating Pages project ${name}"
  pnpm --dir backend exec wrangler pages project create "$name" --production-branch=main >/dev/null
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

  export D1_DATABASE_NAME KV_NAMESPACE_NAME DASHBOARD_WORKER_NAME PROBE_WORKER_NAME PAGES_PROJECT_NAME GITHUB_REPO_SLUG

  D1_DATABASE_ID="$(find_or_create_d1 "$D1_DATABASE_NAME")"
  KV_NAMESPACE_ID="$(find_or_create_kv "$KV_NAMESPACE_NAME")"
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
  append_summary "| Dashboard URL | ${PAGES_URL} |"
  append_summary "| API URL | ${DASHBOARD_WORKER_URL} |"
  append_summary "| Probe URL | ${PROBE_WORKER_URL} |"
  append_summary ""
  append_summary "Next: open the Dashboard URL, complete login, then use Settings -> Probe Installation to generate probe config."
}
