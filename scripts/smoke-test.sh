#!/usr/bin/env bash
# Smoke test: starts the server, verifies key endpoints, checks WebSocket, then exits.
set -euo pipefail

PORT=9876
BASE="http://127.0.0.1:${PORT}"
SERVER_PID=""

cleanup() {
  if [ -n "${SERVER_PID}" ] && kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "=== Smoke Test ==="
echo "Starting server on port ${PORT}..."

PORT=${PORT} npx tsx server/index.ts &
SERVER_PID=$!

# Wait for server to be ready (up to 30 seconds)
MAX_WAIT=30
WAITED=0
until curl -sf "${BASE}/api/config" > /dev/null 2>&1; do
  if ! kill -0 "${SERVER_PID}" 2>/dev/null; then
    echo "FAIL: server process died"
    exit 1
  fi
  if [ "${WAITED}" -ge "${MAX_WAIT}" ]; then
    echo "FAIL: server did not start within ${MAX_WAIT}s"
    exit 1
  fi
  sleep 1
  WAITED=$((WAITED + 1))
done
echo "Server ready after ~${WAITED}s"

PASS=0
FAIL=0

check() {
  local label="$1"
  local url="$2"
  local status
  status=$(curl -sf -o /dev/null -w "%{http_code}" "${url}" 2>/dev/null || echo "000")
  if [ "${status}" = "200" ]; then
    echo "  PASS  ${label} (${status})"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  ${label} (${status})"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "--- HTTP endpoints ---"
check "GET /api/config"          "${BASE}/api/config"
check "GET /api/agents"          "${BASE}/api/agents"
check "GET /api/sessions"        "${BASE}/api/sessions"
check "GET /api/memory/entries"  "${BASE}/api/memory/entries"
check "GET /api/system/stats"    "${BASE}/api/system/stats"

echo ""
echo "--- WebSocket ---"
WS_OK=$(node -e "
const { WebSocket } = require('ws');
const ws = new WebSocket('ws://127.0.0.1:${PORT}/ws');
let done = false;
const timer = setTimeout(() => { process.stdout.write('timeout'); process.exit(1); }, 5000);
ws.on('open', () => {
  ws.on('message', () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    ws.close();
    process.stdout.write('ok');
  });
});
ws.on('error', (e) => {
  if (done) return;
  done = true;
  clearTimeout(timer);
  process.stdout.write('error:' + e.message);
  process.exit(1);
});
" 2>/dev/null || echo "error")

if [ "${WS_OK}" = "ok" ]; then
  echo "  PASS  WebSocket /ws connect + message"
  PASS=$((PASS + 1))
else
  echo "  FAIL  WebSocket /ws (${WS_OK})"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== Results: ${PASS} passed, ${FAIL} failed ==="

if [ "${FAIL}" -gt 0 ]; then
  exit 1
fi
echo "All smoke tests passed."
