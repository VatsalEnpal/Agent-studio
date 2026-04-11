#!/bin/bash
# ============================================================
# Agent Studio — Overnight Ship Script
#
# HOW TO RUN:
#   tmux new -s ship
#   caffeinate -i &
#   cd ~/Code/AgentStudio
#   bash .ralph/run.sh
#
#   Then detach: Ctrl+B, D
#   Go to sleep.
#   Check in the morning: tmux attach -t ship
#
# WHAT IT DOES:
#   Brain 0: Already done (you committed it)
#   Brain 1: Opens the app as a user, finds all issues → plan.json
#   Brain 2: Fixes top-priority issues (max 5 per run)
#   Brain 3: Tests everything as a user → health score
#   Loops Brain 2→3 until health score >= 95
#
# EACH BRAIN IS A FRESH CLAUDE SESSION:
#   No context bloat. No compaction. No losing focus.
#   Handoff is through files on disk (plan.json, health-score.json)
#
# STOPS WHEN:
#   - Health score >= 95 with zero critical/high bugs
#   - OR max 10 fix/test cycles (circuit breaker)
# ============================================================

set -e
cd "$(dirname "$0")/.."

LOG_FILE="qa/overnight-log.txt"
mkdir -p qa/audit-results qa/screenshots

echo "================================================" | tee -a "$LOG_FILE"
echo "SHIP SCRIPT STARTED: $(date)" | tee -a "$LOG_FILE"
echo "================================================" | tee -a "$LOG_FILE"

# --- Ensure dev server is running ---
ensure_server() {
  if ! lsof -ti:8080 > /dev/null 2>&1; then
    echo "[$(date +%H:%M)] Starting dev server..." | tee -a "$LOG_FILE"
    lsof -ti:8080 | xargs kill -9 2>/dev/null || true
    rm -rf .next
    npm run dev > qa/server.log 2>&1 &
    SERVER_PID=$!
    echo "[$(date +%H:%M)] Dev server PID: $SERVER_PID" | tee -a "$LOG_FILE"
    # Wait for server to be ready
    for i in $(seq 1 30); do
      if curl -s http://localhost:8080 > /dev/null 2>&1; then
        echo "[$(date +%H:%M)] Dev server ready" | tee -a "$LOG_FILE"
        break
      fi
      sleep 2
    done
  fi
}

# --- Brain 1: Product Audit ---
echo "" | tee -a "$LOG_FILE"
echo "[$(date +%H:%M)] === BRAIN 1: PRODUCT AUDIT ===" | tee -a "$LOG_FILE"
ensure_server
claude -p "$(cat .ralph/brain-1.md)" \
  --dangerously-skip-permissions \
  --max-turns 250 \
  2>&1 | tee -a "$LOG_FILE"
echo "[$(date +%H:%M)] Brain 1 complete" | tee -a "$LOG_FILE"

# --- Brain 2-3 Loop ---
MAX_CYCLES=10
for cycle in $(seq 1 $MAX_CYCLES); do
  echo "" | tee -a "$LOG_FILE"
  echo "[$(date +%H:%M)] === CYCLE $cycle/$MAX_CYCLES ===" | tee -a "$LOG_FILE"

  # Brain 2: Fix
  echo "[$(date +%H:%M)] Brain 2: Fixing issues..." | tee -a "$LOG_FILE"
  ensure_server
  claude -p "$(cat .ralph/brain-2.md)" \
    --dangerously-skip-permissions \
    --max-turns 150 \
    2>&1 | tee -a "$LOG_FILE"
  echo "[$(date +%H:%M)] Brain 2 complete" | tee -a "$LOG_FILE"

  # Restart server after code changes
  echo "[$(date +%H:%M)] Restarting dev server..." | tee -a "$LOG_FILE"
  lsof -ti:8080 | xargs kill -9 2>/dev/null || true
  rm -rf .next
  npm run dev > qa/server.log 2>&1 &
  sleep 10  # Give server time to rebuild

  # Brain 3: QA
  echo "[$(date +%H:%M)] Brain 3: QA testing..." | tee -a "$LOG_FILE"
  ensure_server
  claude -p "$(cat .ralph/brain-3.md)" \
    --dangerously-skip-permissions \
    --max-turns 250 \
    2>&1 | tee -a "$LOG_FILE"
  echo "[$(date +%H:%M)] Brain 3 complete" | tee -a "$LOG_FILE"

  # Check health score
  if [ -f qa/health-score.json ]; then
    SCORE=$(python3 -c "
import json
with open('qa/health-score.json') as f:
    data = json.load(f)
runs = data.get('runs', [])
if runs:
    last = runs[-1]
    print(f\"{last.get('health_score', 0)}|{last.get('critical', 99)}|{last.get('high', 99)}\")
else:
    print('0|99|99')
" 2>/dev/null || echo "0|99|99")

    HEALTH=$(echo "$SCORE" | cut -d'|' -f1)
    CRITICAL=$(echo "$SCORE" | cut -d'|' -f2)
    HIGH=$(echo "$SCORE" | cut -d'|' -f3)

    echo "[$(date +%H:%M)] Health: $HEALTH | Critical: $CRITICAL | High: $HIGH" | tee -a "$LOG_FILE"

    # Check if done
    if python3 -c "exit(0 if float('$HEALTH') >= 95 and int('$CRITICAL') == 0 and int('$HIGH') == 0 else 1)" 2>/dev/null; then
      echo "" | tee -a "$LOG_FILE"
      echo "================================================" | tee -a "$LOG_FILE"
      echo "DONE! Health score: $HEALTH" | tee -a "$LOG_FILE"
      echo "Zero critical/high bugs." | tee -a "$LOG_FILE"
      echo "Completed at: $(date)" | tee -a "$LOG_FILE"
      echo "Total cycles: $cycle" | tee -a "$LOG_FILE"
      echo "================================================" | tee -a "$LOG_FILE"

      # Final notification
      osascript -e 'display notification "Agent Studio is ship-ready! Health score: '"$HEALTH"'" with title "Ship Script Complete"' 2>/dev/null || true
      exit 0
    fi
  else
    echo "[$(date +%H:%M)] WARNING: health-score.json not found" | tee -a "$LOG_FILE"
  fi
done

echo "" | tee -a "$LOG_FILE"
echo "================================================" | tee -a "$LOG_FILE"
echo "CIRCUIT BREAKER: Max $MAX_CYCLES cycles reached" | tee -a "$LOG_FILE"
echo "Check qa/overnight-log.txt for details" | tee -a "$LOG_FILE"
echo "================================================" | tee -a "$LOG_FILE"
osascript -e 'display notification "Ship script hit circuit breaker after '"$MAX_CYCLES"' cycles" with title "Ship Script Stopped"' 2>/dev/null || true
