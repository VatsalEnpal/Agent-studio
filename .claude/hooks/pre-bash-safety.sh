#!/bin/bash
# PreToolUse hook: Block destructive commands + enforce git discipline
# Based on: Blake Crosley's 5 production hooks, ChrisWiles showcase,
# Anthropic official PreToolUse docs
#
# Exit code 2 = BLOCK action
# Exit code 0 = proceed

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

[ -z "$CMD" ] && exit 0

# --- Destructive git operations ---
if echo "$CMD" | grep -qE 'git\s+push\s+(-f|--force)'; then
  echo '{"block": true, "message": "BLOCKED: Force push not allowed. Use regular push or create a PR."}' >&2
  exit 2
fi

if echo "$CMD" | grep -qE 'git\s+reset\s+--hard'; then
  echo '{"block": true, "message": "BLOCKED: git reset --hard destroys work. Use git stash or create a backup branch."}' >&2
  exit 2
fi

if echo "$CMD" | grep -qE 'git\s+push.*main'; then
  echo '{"block": true, "message": "BLOCKED: Never push directly to main. Create a feature branch and PR."}' >&2
  exit 2
fi

# --- Destructive file operations ---
if echo "$CMD" | grep -qE 'rm\s+-rf\s+/'; then
  echo '{"block": true, "message": "BLOCKED: rm -rf / is never allowed."}' >&2
  exit 2
fi

if echo "$CMD" | grep -qE 'rm\s+-rf\s+\.\s*$'; then
  echo '{"block": true, "message": "BLOCKED: rm -rf . would delete the entire project."}' >&2
  exit 2
fi

# --- SQL destructive operations ---
if echo "$CMD" | grep -qiE 'DROP\s+(TABLE|DATABASE|SCHEMA)'; then
  echo '{"block": true, "message": "BLOCKED: DROP operations need explicit approval."}' >&2
  exit 2
fi

if echo "$CMD" | grep -qiE 'TRUNCATE\s'; then
  echo '{"block": true, "message": "BLOCKED: TRUNCATE needs explicit approval."}' >&2
  exit 2
fi

# --- Lint before commit (from Blake Crosley) ---
if echo "$CMD" | grep -qE '^\s*git\s+commit'; then
  cd "$CLAUDE_PROJECT_DIR" 2>/dev/null
  TSC_OUTPUT=$(npx tsc --noEmit 2>&1)
  if [ $? -ne 0 ]; then
    ERROR_COUNT=$(echo "$TSC_OUTPUT" | grep -c "error TS")
    echo "BLOCKED: ${ERROR_COUNT} TypeScript errors. Fix before committing." >&2
    echo "$TSC_OUTPUT" | grep "error TS" | head -5 >&2
    exit 2
  fi
fi

exit 0
