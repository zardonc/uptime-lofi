#!/usr/bin/env bash
# Shared test utility functions for smoke-test.sh

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  echo -e "${GREEN}  ✓ PASS${NC} $1"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  echo -e "${RED}  ✗ FAIL${NC} $1"
  if [ -n "${2:-}" ]; then
    echo -e "${RED}         ${2}${NC}"
  fi
}

skip() {
  SKIP_COUNT=$((SKIP_COUNT + 1))
  echo -e "${YELLOW}  ○ SKIP${NC} $1"
}

section() {
  echo ""
  echo -e "${CYAN}━━━ $1 ━━━${NC}"
}

# HTTP GET with explicit base URL and response code extraction.
# Usage: http_get_base "https://api.example" "/api/endpoint" [extra_curl_args...]
http_get_base() {
  local base_url="$1"
  local path="$2"; shift 2
  curl -s -w "\n%{http_code}" "${base_url}${path}" "$@"
}

# HTTP POST with explicit base URL and response code extraction.
# Usage: http_post_base "https://api.example" "/api/endpoint" '{"json":"body"}' [extra_curl_args...]
http_post_base() {
  local base_url="$1"
  local path="$2"
  local body="$3"; shift 3
  curl -s -w "\n%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d "$body" \
    "${base_url}${path}" "$@"
}

# HTTP GET with response code extraction.
# Usage: http_get "/api/endpoint" [extra_curl_args...]
http_get() {
  http_get_base "$API_BASE_URL" "$@"
}

# HTTP POST with response code extraction.
# Usage: http_post "/api/endpoint" '{"json":"body"}' [extra_curl_args...]
http_post() {
  http_post_base "$API_BASE_URL" "$@"
}

# Extract HTTP status code from curl response (last line).
get_status() {
  echo "$1" | tail -1
}

# Extract body from curl response (everything except last line).
get_body() {
  echo "$1" | sed '$d'
}

# Generate HMAC-SHA256 signature for probe authentication.
# Usage: hmac_sign "$PSK" "$TIMESTAMP" "$BODY"
hmac_sign() {
  local psk="$1"
  local timestamp="$2"
  local body="$3"
  local message="${timestamp}.${body}"
  echo -n "$message" | openssl dgst -sha256 -hmac "$psk" -hex | sed 's/.*= //'
}

# Generate test node PSK from API_SECRET_KEY.
# PSK = HMAC-SHA256(API_SECRET_KEY, "{nodeId}:{salt}")
derive_psk() {
  local secret_key="$1"
  local node_id="$2"
  local salt="$3"
  local message="${node_id}:${salt}"
  echo -n "$message" | openssl dgst -sha256 -hmac "$secret_key" -hex | sed 's/.*= //'
}

summary() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo " Test Summary"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo -e " ${GREEN}Passed: ${PASS_COUNT}${NC}"
  echo -e " ${RED}Failed: ${FAIL_COUNT}${NC}"
  echo -e " ${YELLOW}Skipped: ${SKIP_COUNT}${NC}"
  echo ""

  if [ "$FAIL_COUNT" -gt 0 ]; then
    echo -e "${RED}VALIDATION FAILED${NC}"
    return 1
  fi

  echo -e "${GREEN}VALIDATION PASSED${NC}"
  return 0
}
