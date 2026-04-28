#!/usr/bin/env bash
set -euo pipefail

PASS=0
FAIL=0
BASE_URL="${BASE_URL:-http://localhost:8787}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_section() {
  local title="$1"
  echo ""
  echo "━━━ ${title} ━━━"
}

assert_status() {
  local description="$1"
  local expected="$2"
  local actual="$3"

  if [ "$actual" = "$expected" ]; then
    echo -e "${GREEN}✓${NC} ${description} (status ${actual})"
    PASS=$((PASS + 1))
  else
    echo -e "${RED}✗${NC} ${description} (expected ${expected}, got ${actual})"
    FAIL=$((FAIL + 1))
  fi
}

assert_non_empty() {
  local description="$1"
  local actual="$2"

  if [ -n "$actual" ] && [ "$actual" != "null" ]; then
    echo -e "${GREEN}✓${NC} ${description}"
    PASS=$((PASS + 1))
  else
    echo -e "${RED}✗${NC} ${description} (value is empty)"
    FAIL=$((FAIL + 1))
  fi
}

assert_json_field() {
  local description="$1"
  local body="$2"
  local field="$3"
  local expected="$4"
  local actual

  actual=$(printf '%s' "$body" | jq -r "$field")
  if [ "$actual" = "$expected" ]; then
    echo -e "${GREEN}✓${NC} ${description} (${field} = ${actual})"
    PASS=$((PASS + 1))
  else
    echo -e "${RED}✗${NC} ${description} (${field} expected '${expected}', got '${actual}')"
    FAIL=$((FAIL + 1))
  fi
}

hmac_sign() {
  local key="$1"
  local timestamp="$2"
  local message="$3"
  printf '%s.%s' "$timestamp" "$message" | openssl dgst -sha256 -hmac "$key" -binary | xxd -p -c 256
}

wait_for_http_ok() {
  local description="$1"
  local url="$2"
  local timeout_seconds="${3:-30}"
  local attempt

  for ((attempt = 1; attempt <= timeout_seconds; attempt++)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo -e "${GREEN}✓${NC} ${description} ready after ${attempt}s"
      return 0
    fi
    sleep 1
  done

  echo -e "${RED}✗${NC} ${description} not ready after ${timeout_seconds}s"
  return 1
}

report() {
  echo ""
  echo "═══════════════════════════════════"
  echo "Results: ${PASS} passed, ${FAIL} failed"
  echo "═══════════════════════════════════"

  if [ "$FAIL" -gt 0 ]; then
    exit 1
  fi
}
