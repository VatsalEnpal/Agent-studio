#!/bin/bash
# SessionStart hook: Re-inject critical context after compaction or session start
# Based on: Anthropic official hooks guide (compaction re-injection),
# 0xhagen's CURRENT_STATE.md pattern, Boris Cherny's team workflow
#
# This fires on: startup, clear, compact
# It reads CURRENT_STATE.md (if exists) to restore working context

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

echo "=== Agent Studio Development Session ==="
echo "Port: 8080 | Stack: Next.js 16 + Express + xterm.js + Zustand"
echo ""

# Re-inject current state if it exists (survives compaction)
if [ -f "$PROJECT_DIR/CURRENT_STATE.md" ]; then
  echo "=== CURRENT STATE (from previous work) ==="
  cat "$PROJECT_DIR/CURRENT_STATE.md"
  echo ""
fi

# Show if dev server is running
if lsof -ti:8080 >/dev/null 2>&1; then
  echo "Dev server: RUNNING on port 8080"
else
  echo "Dev server: NOT running (start with: npm run dev)"
fi

# Show recent git changes
echo ""
echo "=== Recent changes ==="
cd "$PROJECT_DIR" 2>/dev/null
git diff --stat HEAD 2>/dev/null | tail -5
echo ""
echo "Reminders: Use Playwright MCP for visual verification. Run type-check after changes."
