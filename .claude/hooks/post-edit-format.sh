#!/bin/bash
# PostToolUse hook: Auto-format + lint + run related tests after every Edit/Write
# Based on: Plankton pattern (format → lint → test), ChrisWiles/claude-code-showcase,
# ryanlewis/claude-format-hook, mohitkhare.me auto-format guide
#
# Phase 1: Auto-format (Prettier/Biome)
# Phase 2: Lint (ESLint/Biome for JS/TS)
# Phase 3: Run related test if one exists

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

[ -z "$FILE_PATH" ] && exit 0
[ ! -f "$FILE_PATH" ] && exit 0

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" 2>/dev/null || exit 0

# --- Phase 1: Auto-format ---
case "$FILE_PATH" in
  *.js|*.jsx|*.ts|*.tsx|*.css|*.json|*.md)
    # Try Biome first (faster), fall back to Prettier
    if command -v npx &>/dev/null; then
      if [ -f "biome.json" ] || [ -f "biome.jsonc" ]; then
        npx @biomejs/biome format --write "$FILE_PATH" 2>/dev/null
      else
        npx prettier --write "$FILE_PATH" 2>/dev/null
      fi
    fi
    ;;
esac

# --- Phase 2: Lint ---
case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx)
    if [ -f ".eslintrc.json" ] || [ -f ".eslintrc.js" ] || [ -f "eslint.config.js" ] || [ -f "eslint.config.mjs" ]; then
      LINT_OUTPUT=$(npx eslint --fix "$FILE_PATH" 2>&1)
      if [ $? -ne 0 ]; then
        echo "$LINT_OUTPUT" | grep -E "error|warning" | head -5 >&2
      fi
    elif [ -f "biome.json" ] || [ -f "biome.jsonc" ]; then
      npx @biomejs/biome lint --fix "$FILE_PATH" 2>/dev/null
    fi
    ;;
esac

# --- Phase 3: Run related test ---
# If editing src/components/foo.tsx, look for foo.test.tsx or foo.spec.tsx
BASENAME=$(basename "$FILE_PATH" | sed 's/\.[^.]*$//')
DIRNAME=$(dirname "$FILE_PATH")

# Don't run tests for test files themselves (avoid loops)
case "$FILE_PATH" in
  *.test.*|*.spec.*) exit 0 ;;
esac

# Search for related test file
RELATED_TEST=""
for ext in "test.ts" "test.tsx" "spec.ts" "spec.tsx" "test.js" "spec.js"; do
  FOUND=$(find "$PROJECT_DIR/src" "$PROJECT_DIR/server" "$PROJECT_DIR/tests" -name "${BASENAME}.${ext}" 2>/dev/null | head -1)
  if [ -n "$FOUND" ]; then
    RELATED_TEST="$FOUND"
    break
  fi
done

if [ -n "$RELATED_TEST" ]; then
  echo "Running related test: $RELATED_TEST" >&2
  TEST_OUTPUT=$(npx vitest run "$RELATED_TEST" --reporter=verbose 2>&1 | tail -15)
  if echo "$TEST_OUTPUT" | grep -qE "FAIL|Error"; then
    echo "⚠ Related test failed:" >&2
    echo "$TEST_OUTPUT" >&2
  fi
fi

exit 0
