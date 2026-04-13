#!/bin/bash
# PreToolUse hook: Prevent editing critical files + detect risky patterns
# Based on: Claudekit file-guard, ChrisWiles showcase, main-branch protection
#
# Exit code 2 = BLOCK action

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

[ -z "$FILE_PATH" ] && exit 0

# --- Block secrets/environment files ---
case "$FILE_PATH" in
  *.env|*.env.local|*.env.production|*.env.*.local)
    echo '{"block": true, "message": "BLOCKED: Cannot edit environment files. These may contain secrets."}' >&2
    exit 2
    ;;
  *.key|*.pem|*.p12|*credentials*)
    echo '{"block": true, "message": "BLOCKED: Cannot edit credential/key files."}' >&2
    exit 2
    ;;
esac

# --- Block lock files ---
case "$FILE_PATH" in
  *package-lock.json|*pnpm-lock.yaml|*yarn.lock)
    echo '{"block": true, "message": "BLOCKED: Lock files should not be edited manually. Run npm install instead."}' >&2
    exit 2
    ;;
esac

# --- Block git internals ---
case "$FILE_PATH" in
  *.git/*)
    echo '{"block": true, "message": "BLOCKED: Cannot edit git internals."}' >&2
    exit 2
    ;;
esac

# --- Protect security-sensitive files (warn, don't block) ---
case "$FILE_PATH" in
  *terminal-manager.ts)
    echo "WARNING: terminal-manager.ts contains the PTY security allowlist. Review changes carefully." >&2
    ;;
esac

# --- Block edits on main branch ---
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null
BRANCH=$(git branch --show-current 2>/dev/null)
if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
  echo '{"block": true, "message": "BLOCKED: Cannot edit files on main branch. Create a feature branch first: git checkout -b feature/your-change"}' >&2
  exit 2
fi

exit 0
