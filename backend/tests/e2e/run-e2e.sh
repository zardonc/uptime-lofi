#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
PROBE_DIR="$ROOT_DIR/server-probe"

source "$SCRIPT_DIR/helpers.sh"

MASTER_SECRET="test-e2e-secret-key-12345"
EMERGENCY_KEY="test-emergency-key-99999"
BASE_URL="${BASE_URL:-http://127.0.0.1:8787}"
PROBE_URL="${PROBE_URL:-http://127.0.0.1:8788}"

PERSIST_DIR="$BACKEND_DIR/.wrangler/e2e"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/uptime-lofi-e2e.XXXXXX")"
COOKIE_JAR="$TMP_DIR/cookies.txt"
PROBE_CONFIG="$TMP_DIR/probe.e2e.yaml"
PROBE_BINARY="$PROBE_DIR/probe-test"
WRANGLER_LOG="$TMP_DIR/dashboard-worker.log"
PROBE_WORKER_LOG="$TMP_DIR/probe-worker.log"
PROBE_BINARY_LOG="$TMP_DIR/probe-binary.log"

NODE_ID="e2e-test-node-001"
NODE_SALT="e2e-salt-001"
UI_PASSWORD="e2e-test-password"
AUTH_IP="198.51.100.10"
RATE_LIMIT_IP="198.51.100.20"

WRANGLER_PID=""
PROBE_WORKER_PID=""
PROBE_BINARY_PID=""
DEV_VARS_BACKUP=""

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

request() {
  local output_file="$1"
  shift
  curl -sS -o "$output_file" -w "%{http_code}" "$@"
}

show_logs_on_failure() {
  local status="$1"
  if [ "$status" -eq 0 ]; then
    return
  fi

  echo ""
  echo "Failure detected. Captured logs:"
  for file in "$WRANGLER_LOG" "$PROBE_WORKER_LOG" "$PROBE_BINARY_LOG"; do
    if [ -f "$file" ]; then
      echo "----- $(basename "$file") -----"
      cat "$file"
    fi
  done
}

cleanup() {
  local status=$?

  echo ""
  echo "► Cleaning up..."

  if [ -n "$PROBE_BINARY_PID" ] && kill -0 "$PROBE_BINARY_PID" 2>/dev/null; then
    kill -INT "$PROBE_BINARY_PID" 2>/dev/null || true
    wait "$PROBE_BINARY_PID" 2>/dev/null || true
  fi

  if [ -n "$PROBE_WORKER_PID" ] && kill -0 "$PROBE_WORKER_PID" 2>/dev/null; then
    kill "$PROBE_WORKER_PID" 2>/dev/null || true
    wait "$PROBE_WORKER_PID" 2>/dev/null || true
  fi

  if [ -n "$WRANGLER_PID" ] && kill -0 "$WRANGLER_PID" 2>/dev/null; then
    kill "$WRANGLER_PID" 2>/dev/null || true
    wait "$WRANGLER_PID" 2>/dev/null || true
  fi

  if [ -n "$DEV_VARS_BACKUP" ] && [ -f "$DEV_VARS_BACKUP" ]; then
    cp "$DEV_VARS_BACKUP" "$BACKEND_DIR/.dev.vars"
  else
    rm -f "$BACKEND_DIR/.dev.vars"
  fi

  rm -f "$PROBE_BINARY"
  rm -f "$COOKIE_JAR"
  rm -rf "$PERSIST_DIR"

  show_logs_on_failure "$status"
  rm -rf "$TMP_DIR"

  exit "$status"
}
trap cleanup EXIT INT TERM

require_cmd curl
require_cmd jq
require_cmd openssl
require_cmd go
require_cmd pnpm

echo "╔═══════════════════════════════════════╗"
echo "║   uptime-lofi E2E Test Suite         ║"
echo "╚═══════════════════════════════════════╝"

print_section "Step 1: Build Go probe"
cd "$PROBE_DIR"
go build -o "$PROBE_BINARY" ./cmd/probe/
echo "Built: $PROBE_BINARY"

print_section "Step 2: Prepare local D1 state"
mkdir -p "$PERSIST_DIR"

if [ -f "$BACKEND_DIR/.dev.vars" ]; then
  DEV_VARS_BACKUP="$TMP_DIR/original.dev.vars"
  cp "$BACKEND_DIR/.dev.vars" "$DEV_VARS_BACKUP"
fi
cp "$SCRIPT_DIR/.dev.vars.test" "$BACKEND_DIR/.dev.vars"

CI=1 pnpm exec wrangler d1 migrations apply DB --local --persist-to "$PERSIST_DIR"

SEED_SQL=$(cat <<SQL
DELETE FROM raw_metrics;
DELETE FROM refresh_tokens;
DELETE FROM login_attempts;
DELETE FROM audit_log;
DELETE FROM kv_settings;
DELETE FROM nodes;
INSERT INTO nodes (id, name, type, status, last_heartbeat, config_json, salt)
VALUES ('${NODE_ID}', 'E2E Probe Node', 'agent_push', 'offline', strftime('%s', 'now'), '{}', '${NODE_SALT}');
SQL
)

pnpm exec wrangler d1 execute DB --local --persist-to "$PERSIST_DIR" --yes --command "$SEED_SQL"

print_section "Step 3: Start Wrangler dev workers"
cd "$BACKEND_DIR"
pnpm exec wrangler dev src/index.ts --port 8787 --local --persist-to "$PERSIST_DIR" >"$WRANGLER_LOG" 2>&1 &
WRANGLER_PID=$!
echo "Dashboard worker PID: $WRANGLER_PID"

pnpm exec wrangler dev -c probe-wrangler.toml --port 8788 --local --persist-to "$PERSIST_DIR" >"$PROBE_WORKER_LOG" 2>&1 &
PROBE_WORKER_PID=$!
echo "Probe worker PID: $PROBE_WORKER_PID"

wait_for_http_ok "Dashboard worker" "$BASE_URL/health" 30
wait_for_http_ok "Probe worker" "$PROBE_URL/health" 30

print_section "Test Suite 1: Health Check"
STATUS=$(request "$TMP_DIR/health.json" "$BASE_URL/health")
BODY="$(<"$TMP_DIR/health.json")"
assert_status "GET /health returns 200" "200" "$STATUS"
assert_json_field "Health check is healthy" "$BODY" ".status" "healthy"

print_section "Test Suite 2: Auth Lifecycle"
STATUS=$(request "$TMP_DIR/setup.json" -X POST "$BASE_URL/api/auth/setup" \
  -H "CF-Connecting-IP: $AUTH_IP" \
  -H "Content-Type: application/json" \
  -d "{\"admin_key\":\"$MASTER_SECRET\",\"new_ui_password\":\"$UI_PASSWORD\"}")
SETUP_BODY="$(<"$TMP_DIR/setup.json")"
assert_status "POST /api/auth/setup succeeds" "200" "$STATUS"
assert_json_field "Setup enables UI lock" "$SETUP_BODY" ".success" "true"

STATUS=$(request "$TMP_DIR/login.json" -X POST "$BASE_URL/api/auth/login" \
  -H "CF-Connecting-IP: $AUTH_IP" \
  -H "Content-Type: application/json" \
  -c "$COOKIE_JAR" \
  -b "$COOKIE_JAR" \
  -d "{\"password\":\"$UI_PASSWORD\"}")
LOGIN_BODY="$(<"$TMP_DIR/login.json")"
TOKEN=$(printf '%s' "$LOGIN_BODY" | jq -r '.access_token // empty')
assert_status "POST /api/auth/login succeeds" "200" "$STATUS"
assert_non_empty "Login returns access token" "$TOKEN"

STATUS=$(request "$TMP_DIR/nodes-auth.json" "$BASE_URL/api/nodes" -H "Authorization: Bearer $TOKEN")
assert_status "GET /api/nodes with token succeeds" "200" "$STATUS"

STATUS=$(request "$TMP_DIR/nodes-no-auth.json" "$BASE_URL/api/nodes")
assert_status "GET /api/nodes without token returns 401" "401" "$STATUS"

STATUS=$(request "$TMP_DIR/refresh.json" -X POST "$BASE_URL/api/auth/refresh" -c "$COOKIE_JAR" -b "$COOKIE_JAR")
REFRESH_BODY="$(<"$TMP_DIR/refresh.json")"
NEW_TOKEN=$(printf '%s' "$REFRESH_BODY" | jq -r '.access_token // empty')
assert_status "POST /api/auth/refresh succeeds" "200" "$STATUS"
assert_non_empty "Refresh returns new access token" "$NEW_TOKEN"

STATUS=$(request "$TMP_DIR/logout.json" -X POST "$BASE_URL/api/auth/logout" -H "Authorization: Bearer $NEW_TOKEN" -c "$COOKIE_JAR" -b "$COOKIE_JAR")
assert_status "POST /api/auth/logout succeeds" "200" "$STATUS"

print_section "Test Suite 3: Probe Push → Query"
DERIVED_PSK=$(printf '%s' "${NODE_ID}:${NODE_SALT}" | openssl dgst -sha256 -hmac "$MASTER_SECRET" -binary | xxd -p -c 256)
cat >"$PROBE_CONFIG" <<EOF
api_url: ${PROBE_URL}/api/push
node_id: ${NODE_ID}
psk: ${DERIVED_PSK}
enable_docker: false
EOF

"$PROBE_BINARY" --config "$PROBE_CONFIG" >"$PROBE_BINARY_LOG" 2>&1 &
PROBE_BINARY_PID=$!
echo "Probe binary PID: $PROBE_BINARY_PID"

sleep 65
kill -INT "$PROBE_BINARY_PID" 2>/dev/null || true
wait "$PROBE_BINARY_PID" 2>/dev/null || true
PROBE_BINARY_PID=""

STATUS=$(request "$TMP_DIR/relogin.json" -X POST "$BASE_URL/api/auth/login" \
  -H "CF-Connecting-IP: $AUTH_IP" \
  -H "Content-Type: application/json" \
  -c "$COOKIE_JAR" \
  -b "$COOKIE_JAR" \
  -d "{\"password\":\"$UI_PASSWORD\"}")
REL_LOGIN_BODY="$(<"$TMP_DIR/relogin.json")"
TOKEN=$(printf '%s' "$REL_LOGIN_BODY" | jq -r '.access_token // empty')
assert_status "Re-login after logout succeeds" "200" "$STATUS"
assert_non_empty "Re-login returns access token" "$TOKEN"

STATUS=$(request "$TMP_DIR/nodes-after-push.json" "$BASE_URL/api/nodes" -H "Authorization: Bearer $TOKEN")
NODES_BODY="$(<"$TMP_DIR/nodes-after-push.json")"
assert_status "GET /api/nodes after probe push succeeds" "200" "$STATUS"
assert_json_field "Pushed node appears in listing" "$NODES_BODY" ".data[] | select(.id == \"$NODE_ID\") | .id" "$NODE_ID"
assert_json_field "Pushed node is marked online" "$NODES_BODY" ".data[] | select(.id == \"$NODE_ID\") | .status" "online"

STATUS=$(request "$TMP_DIR/metrics-after-push.json" "$BASE_URL/api/nodes/${NODE_ID}/metrics?hours=1" -H "Authorization: Bearer $TOKEN")
METRICS_BODY="$(<"$TMP_DIR/metrics-after-push.json")"
assert_status "GET /api/nodes/:id/metrics after probe push succeeds" "200" "$STATUS"
assert_json_field "Probe metric stored for node" "$METRICS_BODY" ".data[0].node_id" "$NODE_ID"

print_section "Test Suite 4: Rate Limiting"
RATE_LIMIT_STATUS=""
for _ in {1..8}; do
  STATUS=$(request "$TMP_DIR/rate-limit.json" -X POST "$BASE_URL/api/auth/login" \
    -H "CF-Connecting-IP: $RATE_LIMIT_IP" \
    -H "Content-Type: application/json" \
    -d '{"password":"wrong-password"}')
  if [ "$STATUS" = "429" ]; then
    RATE_LIMIT_STATUS="$STATUS"
    break
  fi
done
assert_status "Rate limit triggers on rapid failed logins" "429" "${RATE_LIMIT_STATUS:-000}"

report
