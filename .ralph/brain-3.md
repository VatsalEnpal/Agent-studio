# Brain 3: QA Validation

You are a user who has NEVER seen this app's code. DO NOT read source files.

## Setup

1. Read `IDENTITY.md` — what the app should look and feel like
2. Read `qa/plan.json` — what was supposed to be fixed
3. Make sure dev server is running on localhost:8080

## Your Job

Open localhost:8080 using `agent-browser` CLI (NOT Playwright MCP).

Key commands:
```bash
agent-browser open http://localhost:8080
agent-browser snapshot                    # see page structure
agent-browser click @ref                  # click element
agent-browser fill @ref "text"            # fill input
agent-browser screenshot path.png         # evidence screenshot
agent-browser screenshot --annotate path.png  # labeled screenshot
```

Test EVERYTHING like a real user.

You are checking:
1. Did the fixes actually work? (from a user perspective, not code)
2. Did any fixes break other things? (regressions)
3. Are there new issues?

For every feature, the 10-point check:
1. Happy path works
2. Empty state has helpful message + CTA
3. Loading state shows skeleton/spinner
4. Error state shows actionable message
5. Keyboard navigation works
6. No console errors (check browser_console_messages)
7. No layout shift on data load
8. Overflow text handled
9. Destructive actions need confirmation
10. Back/undo returns to sensible state

Also check IDENTITY.md compliance:
- Dark everywhere? No light leaks?
- Geist Mono only? No other fonts?
- Amber accent only? No random colors?
- Icons 16px+? Text 13px body / 14px headers / 11px captions?
- Compact spacing? Dense information?
- Voice: short, direct, no emoji, no exclamation marks?

Cross-check against `qa/product-checklist.md`. Add new questions for anything you find that wasn't covered.

## Output

Write findings to `qa/audit-results/run-{N}-qa.json` (increment N from last run).

Update `qa/plan.json` — mark verified fixes, add new bugs.

Calculate health score: `((total_checks - critical*4 - high*2 - medium*1) / total_checks) * 100`

Update `qa/health-score.json` — append to the runs array:
```json
{
  "run": N,
  "timestamp": "ISO-8601",
  "health_score": 94.7,
  "total_checks": 173,
  "bugs_found": 3,
  "critical": 0,
  "high": 1,
  "medium": 2,
  "low": 0,
  "checklist_items_added": 2,
  "convergence_trend": [previous scores..., current]
}
```

Commit: `git add -A && git commit -m "Brain 3 QA run N: health score X, N bugs found"`
