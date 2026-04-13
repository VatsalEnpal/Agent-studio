#!/bin/bash
# Stop hook: Multi-gate quality verification before Claude can finish
# Only runs gates if source files were actually modified in this session.
# Skips if stop_hook_active is true (prevents infinite loops).

INPUT=$(cat)

STOP_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null)
if [ "$STOP_ACTIVE" = "true" ]; then
  exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" 2>/dev/null || exit 0

# Only run gates if source files were modified
CHANGED=$(git diff --name-only HEAD 2>/dev/null | grep -E '\.(ts|tsx|js|jsx)$' | head -1)
UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null | grep -E '\.(ts|tsx|js|jsx)$' | head -1)

if [ -z "$CHANGED" ] && [ -z "$UNTRACKED" ]; then
  # No source files changed — skip all gates
  exit 0
fi

ERRORS=""

# --- Gate 1: TypeScript ---
TSC_OUTPUT=$(npx tsc --noEmit 2>&1)
if [ $? -ne 0 ]; then
  ERROR_COUNT=$(echo "$TSC_OUTPUT" | grep -c "error TS")
  ERRORS="${ERRORS}[TYPECHECK] ${ERROR_COUNT} type errors:\n"
  ERRORS="${ERRORS}$(echo "$TSC_OUTPUT" | grep 'error TS' | head -5)\n\n"
fi

# --- Gate 2: Build ---
BUILD_OUTPUT=$(npm run build 2>&1)
if [ $? -ne 0 ]; then
  ERRORS="${ERRORS}[BUILD] Build failed:\n"
  ERRORS="${ERRORS}$(echo "$BUILD_OUTPUT" | grep -E 'Error|error|Failed' | head -5)\n\n"
fi

# --- Gate 3: Unit tests (if vitest is available) ---
if [ -f "node_modules/.bin/vitest" ]; then
  TEST_OUTPUT=$(npx vitest run --reporter=verbose 2>&1)
  if [ $? -ne 0 ]; then
    FAILED=$(echo "$TEST_OUTPUT" | grep -c "FAIL")
    ERRORS="${ERRORS}[TESTS] ${FAILED} test(s) failed:\n"
    ERRORS="${ERRORS}$(echo "$TEST_OUTPUT" | grep -A 2 "FAIL" | head -10)\n\n"
  fi
fi

# --- Decision ---
if [ -n "$ERRORS" ]; then
  echo "{\"decision\": \"block\", \"reason\": \"Quality gates failed. Fix before completing:\\n\\n${ERRORS}\"}"
  exit 0
fi

exit 0
