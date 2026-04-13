#!/bin/bash
# PostToolUse hook: TypeScript type check + lazy-code detection after editing .ts/.tsx
# Based on: Claudekit (check-comment-replacement, check-unused-parameters),
# Frank Neff's "Quality Gates Against AI Slop"
#
# 1. Run tsc --noEmit for type errors
# 2. Detect lazy AI patterns (code replaced with comments, unused _params)

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

[ -z "$FILE_PATH" ] && exit 0

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" 2>/dev/null || exit 0

case "$FILE_PATH" in
  *.ts|*.tsx)
    # --- Type check ---
    OUTPUT=$(npx tsc --noEmit 2>&1)
    if [ $? -ne 0 ]; then
      ERROR_COUNT=$(echo "$OUTPUT" | grep -c "error TS")
      echo "⚠ TypeScript: ${ERROR_COUNT} type errors after editing $FILE_PATH" >&2
      echo "$OUTPUT" | grep "error TS" | head -10 >&2
    fi

    # --- Lazy AI pattern detection (from Claudekit) ---
    # Detect code replaced with comments like "// ... rest of implementation"
    LAZY_PATTERNS=$(grep -nE '//\s*(\.{3}|rest of|remaining|TODO|FIXME|implement|add .* here|same as before)' "$FILE_PATH" 2>/dev/null)
    if [ -n "$LAZY_PATTERNS" ]; then
      echo "⚠ Lazy code pattern detected in $FILE_PATH:" >&2
      echo "$LAZY_PATTERNS" >&2
      echo "These comments suggest code was replaced with placeholders instead of actual implementation." >&2
    fi

    # Detect underscore-prefixed params used as workaround for unused vars
    UNUSED_PARAMS=$(grep -nE '\b_[a-zA-Z]+\b' "$FILE_PATH" | grep -v '^\s*//' | grep -v 'node_modules' 2>/dev/null | head -5)
    if [ -n "$UNUSED_PARAMS" ]; then
      echo "Note: Underscore-prefixed variables in $FILE_PATH — ensure these are intentionally unused, not lazy removals." >&2
    fi
    ;;
esac

# Advisory only — exit 0 so it doesn't block
exit 0
