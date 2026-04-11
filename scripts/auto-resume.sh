#!/bin/bash
# Auto-resume Agent Studio development
# Runs at 4am when tokens reset
# Reads checkpoint, continues building, updates checkpoint

CHECKPOINT="/Users/vatsalbhatt230813/Code/InPipeline/agent-console/.checkpoint.md"
LOGDIR="/Users/vatsalbhatt230813/Code/InPipeline/agent-console/logs"
mkdir -p "$LOGDIR"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Auto-resume starting" >> "$LOGDIR/auto-resume.log"

if [ ! -f "$CHECKPOINT" ]; then
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] No checkpoint found, skipping" >> "$LOGDIR/auto-resume.log"
    exit 0
fi

# Check if there's actually work to do
NEEDS_WORK=$(grep -c "Priority\|NEEDS IMPROVEMENT\|TODO\|still needs" "$CHECKPOINT")
if [ "$NEEDS_WORK" -eq 0 ]; then
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Checkpoint shows no pending work, skipping" >> "$LOGDIR/auto-resume.log"
    exit 0
fi

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Found pending work, launching Claude Code" >> "$LOGDIR/auto-resume.log"

cd /Users/vatsalbhatt230813/Code/InPipeline/agent-console

/Users/vatsalbhatt230813/.local/bin/claude \
  --dangerously-skip-permissions \
  --name "agent-studio-auto-resume" \
  -p "You are auto-resuming Agent Studio development.

Read .checkpoint.md for what's done and what needs work.
Read DESIGN.md and TEAMS-SPEC.md for the full spec.

Continue improving: fix bugs, enrich content, test with Playwright.
When done, update .checkpoint.md and commit.

Work autonomously. The user is sleeping." \
  >> "$LOGDIR/auto-resume-stdout.log" 2>> "$LOGDIR/auto-resume-stderr.log"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Auto-resume completed" >> "$LOGDIR/auto-resume.log"
