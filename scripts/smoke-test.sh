#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/test-helpers.sh"

# ─── Parse Arguments ───
ENV="staging"
while [[ $# -gt 0 ]]; do
  case $1 in
    --env) ENV="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ─── Validate Environment ───
if [[ "$ENV" != "staging" && "$ENV" != "production" && "$ENV" != "self-host" ]]; then
  echo "Error: --env must be 'staging', 'production', or 'self-host'"
  exit 1
fi

API_BASE_URL="${API_BASE_URL:?API_BASE_URL is required}"
PAGES_URL="${PAGES_URL:?PAGES_URL is required}"
if [ "$ENV" = "self-host" ]; then
  PROBE_BASE_URL="${PROBE_BASE_URL:?PROBE_BASE_URL is required for self-host validation}"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Uptime-LoFi — Post-Deploy Validation"
echo " Environment: ${ENV}"
echo " API: ${API_BASE_URL}"
echo " Pages: ${PAGES_URL}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ═══════════════════════════════════════════
# SHARED TESTS (both staging and production)
# ═══════════════════════════════════════════

test_health_check() {
  section "Health Check"

  local resp
  resp=$(http_get "/health")
  local status
  status=$(get_status "$resp")
  local body
  body=$(get_body "$resp")

  if [ "$status" = "200" ]; then
    pass "GET /health → 200"
  else
    fail "GET /health → ${status} (expected 200)" "$body"
  fi

  resp=$(http_get "/ready")
  status=$(get_status "$resp")
  if [ "$status" = "200" ]; then
    pass "GET /ready → 200"
  else
    fail "GET /ready → ${status} (expected 200)"
  fi
}

test_frontend_accessibility() {
  section "Frontend Accessibility"

  local resp
  resp=$(curl -s -w "\n%{http_code}" "${PAGES_URL}")
  local status
  status=$(get_status "$resp")
  local body
  body=$(get_body "$resp")

  if [ "$status" = "200" ]; then
    pass "Pages URL → 200"
  else
    fail "Pages URL → ${status} (expected 200)"
  fi

  if echo "$body" | grep -q "</html>"; then
    pass "Response contains HTML"
  else
    fail "Response does not contain </html>"
  fi
}

test_cors_headers() {
  section "CORS Headers"

  local resp
  resp=$(curl -s -D - -o /dev/null -H "Origin: ${PAGES_URL}" "${API_BASE_URL}/health")

  if echo "$resp" | grep -qi "access-control-allow-origin"; then
    pass "CORS Access-Control-Allow-Origin present"
  else
    fail "CORS Access-Control-Allow-Origin missing"
  fi
}

test_security_headers() {
  section "Security Headers"

  local resp
  resp=$(curl -s -D - -o /dev/null "${API_BASE_URL}/health")

  local headers_to_check=("x-content-type-options" "x-frame-options")
  for header in "${headers_to_check[@]}"; do
    if echo "$resp" | grep -qi "$header"; then
      pass "Security header: ${header}"
    else
      fail "Security header missing: ${header}"
    fi
  done
}

test_probe_worker_health() {
  section "Probe Worker Health"

  local resp
  resp=$(http_get_base "$PROBE_BASE_URL" "/health")
  local status
  status=$(get_status "$resp")
  local body
  body=$(get_body "$resp")

  if [ "$status" = "200" ]; then
    pass "Probe Worker GET /health → 200"
  else
    fail "Probe Worker GET /health → ${status} (expected 200)" "$body"
  fi
}

test_node_listing() {
  section "Node Listing"

  local resp
  resp=$(http_get "/api/nodes" -H "Authorization: Bearer ${JWT_TOKEN:-}")
  local status
  status=$(get_status "$resp")

  if [ "$status" = "200" ] || [ "$status" = "401" ]; then
    pass "GET /api/nodes → ${status} (endpoint reachable)"
  else
    fail "GET /api/nodes → ${status} (expected 200 or 401)"
  fi
}

test_auth_login() {
  section "Auth Login"

  if [ -z "${TEST_PASSWORD:-}" ]; then
    skip "Auth login — TEST_PASSWORD not set"
    return 0
  fi

  local resp
  resp=$(http_post "/api/auth/login" "{\"password\":\"${TEST_PASSWORD}\"}" -c cookies.txt)
  local status
  status=$(get_status "$resp")

  if [ "$status" = "200" ]; then
    pass "POST /api/auth/login → 200"
    JWT_TOKEN=$(get_body "$resp" | grep -o '"access_token":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
    if [ -n "$JWT_TOKEN" ]; then
      pass "JWT token received"
    else
      fail "JWT token not in response"
    fi
  else
    fail "POST /api/auth/login → ${status} (expected 200)"
  fi
}

# ═══════════════════════════════════════════
# STAGING-ONLY TESTS (write operations)
# ═══════════════════════════════════════════

test_auth_setup() {
  section "Auth Setup (Staging)"

  if [ -z "${TEST_ADMIN_KEY:-${API_SECRET_KEY:-}}" ]; then
    skip "Auth setup — TEST_ADMIN_KEY/API_SECRET_KEY not set"
    return 0
  fi

  local test_password="smoke-test-$(date +%s)"
  local admin_key="${TEST_ADMIN_KEY:-$API_SECRET_KEY}"
  local resp
  resp=$(http_post "/api/auth/setup" "{\"admin_key\":\"${admin_key}\",\"new_ui_password\":\"${test_password}\"}")
  local status
  status=$(get_status "$resp")

  if [ "$status" = "200" ]; then
    pass "POST /api/auth/setup → 200"
    TEST_PASSWORD="$test_password"
  elif [ "$status" = "409" ]; then
    pass "POST /api/auth/setup → 409 (already configured)"
    if [ -z "${TEST_PASSWORD:-}" ]; then
      skip "Auth setup already configured — provide TEST_PASSWORD to continue login-dependent checks"
    fi
  else
    fail "POST /api/auth/setup → ${status} (expected 200 or 409)"
  fi
}

test_auth_refresh() {
  section "Auth Refresh (Staging)"

  if [ -z "${JWT_TOKEN:-}" ]; then
    skip "Auth refresh — no JWT token"
    return 0
  fi

  local resp
  resp=$(http_post "/api/auth/refresh" "{}" -H "Authorization: Bearer ${JWT_TOKEN}" -b cookies.txt -c cookies.txt)
  local status
  status=$(get_status "$resp")

  if [ "$status" = "200" ]; then
    pass "POST /api/auth/refresh → 200"
  else
    fail "POST /api/auth/refresh → ${status} (expected 200)"
  fi
}

test_auth_logout() {
  section "Auth Logout (Staging)"

  if [ -z "${JWT_TOKEN:-}" ]; then
    skip "Auth logout — no JWT token"
    return 0
  fi

  local resp
  resp=$(http_post "/api/auth/logout" "{}" -H "Authorization: Bearer ${JWT_TOKEN}" -b cookies.txt)
  local status
  status=$(get_status "$resp")

  if [ "$status" = "200" ]; then
    pass "POST /api/auth/logout → 200"
  else
    fail "POST /api/auth/logout → ${status} (expected 200)"
  fi
}

test_probe_push() {
  section "Probe HMAC Push (Staging)"

  if [ -z "${API_SECRET_KEY:-}" ]; then
    skip "Probe push — API_SECRET_KEY not set"
    return 0
  fi

  local node_id="smoke-test-node"
  local salt="smoke-test-salt"
  local timestamp
  timestamp=$(date +%s)
  local body="[{\"node_id\":\"${node_id}\",\"timestamp\":${timestamp},\"cpu\":25.5,\"mem\":60.2,\"is_up\":true}]"

  local psk
  psk=$(derive_psk "$API_SECRET_KEY" "$node_id" "$salt")
  local signature
  signature=$(hmac_sign "$psk" "$timestamp" "$body")

  local resp
  resp=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${signature}" \
    -H "X-Timestamp: ${timestamp}" \
    -H "X-Node-Id: ${node_id}" \
    -d "$body" \
    "${API_BASE_URL}/api/push")

  local status
  status=$(get_status "$resp")

  if [ "$status" = "200" ] || [ "$status" = "401" ] || [ "$status" = "403" ] || [ "$status" = "404" ]; then
    pass "POST /api/push → ${status} (probe route/auth path reachable or isolated worker expected)"
  else
    fail "POST /api/push → ${status} (expected 200/401/403/404)"
  fi
}

test_stats_overview() {
  section "Stats Overview (Staging)"

  if [ -z "${JWT_TOKEN:-}" ]; then
    skip "Stats overview — no JWT token"
    return 0
  fi

  local resp
  resp=$(http_get "/api/stats/overview" -H "Authorization: Bearer ${JWT_TOKEN}")
  local status
  status=$(get_status "$resp")

  if [ "$status" = "200" ]; then
    pass "GET /api/stats/overview → 200"
  else
    fail "GET /api/stats/overview → ${status} (expected 200)"
  fi
}

test_settings() {
  section "Settings CRUD (Staging)"

  if [ -z "${JWT_TOKEN:-}" ]; then
    skip "Settings — no JWT token"
    return 0
  fi

  local resp
  local password="${TEST_PASSWORD:-smoke-test-password}"
  resp=$(http_post "/api/settings/security" "{\"enabled\":true,\"password\":\"${password}\"}" -H "Authorization: Bearer ${JWT_TOKEN}")
  local status
  status=$(get_status "$resp")

  if [ "$status" = "200" ]; then
    pass "POST /api/settings/security → 200"
  else
    fail "POST /api/settings/security → ${status} (expected 200)"
  fi
}

test_rate_limiting() {
  section "Rate Limiting (Staging)"

  local got_429=false
  for i in $(seq 1 20); do
    local resp
    resp=$(http_post "/api/auth/login" '{"password":"wrong"}')
    local status
    status=$(get_status "$resp")
    if [ "$status" = "429" ]; then
      got_429=true
      break
    fi
  done

  if [ "$got_429" = true ]; then
    pass "Rate limiting active (429 received after rapid requests)"
  else
    fail "Rate limiting not triggered after 20 rapid requests"
  fi
}

test_node_metrics() {
  section "Node Metrics (Staging)"

  if [ -z "${JWT_TOKEN:-}" ]; then
    skip "Node metrics — no JWT token"
    return 0
  fi

  local resp
  resp=$(http_get "/api/nodes" -H "Authorization: Bearer ${JWT_TOKEN}")
  local body
  body=$(get_body "$resp")

  local first_node
  first_node=$(echo "$body" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4 || true)

  if [ -n "$first_node" ]; then
    resp=$(http_get "/api/nodes/${first_node}/metrics?hours=1" -H "Authorization: Bearer ${JWT_TOKEN}")
    local status
    status=$(get_status "$resp")
    if [ "$status" = "200" ]; then
      pass "GET /api/nodes/${first_node}/metrics → 200"
    else
      fail "GET /api/nodes/${first_node}/metrics → ${status}"
    fi
  else
    skip "Node metrics — no nodes found in listing"
  fi
}

# ─── Cleanup (Staging Only) ───
cleanup_staging() {
  section "Cleanup"
  rm -f cookies.txt
  pass "Temporary files cleaned up"
}

# ═══════════════════════════════════════════
# MAIN EXECUTION
# ═══════════════════════════════════════════

JWT_TOKEN=""
TEST_PASSWORD="${TEST_PASSWORD:-}"

if [ "$ENV" = "staging" ]; then
  test_health_check
  test_frontend_accessibility
  test_cors_headers
  test_security_headers
  test_auth_setup
  test_auth_login
  test_auth_refresh
  test_probe_push
  test_node_listing
  test_node_metrics
  test_stats_overview
  test_settings
  test_rate_limiting
  test_auth_logout
  cleanup_staging

elif [ "$ENV" = "production" ]; then
  test_health_check
  test_frontend_accessibility
  test_cors_headers
  test_security_headers
  test_auth_login
  test_node_listing

elif [ "$ENV" = "self-host" ]; then
  test_health_check
  test_probe_worker_health
  test_frontend_accessibility
  test_cors_headers
  test_security_headers
  test_auth_login
  if [ -n "${JWT_TOKEN:-}" ]; then
    test_node_listing
  else
    skip "Node listing — login skipped or failed"
  fi
fi

summary
