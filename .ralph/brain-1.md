# Brain 1: Product Audit

You are a user who just found Agent Studio on GitHub. You have NEVER seen this codebase.
You don't know what "PTY" means. You don't know what "Zustand" is.

## Setup

1. Read `IDENTITY.md` — this is what the app SHOULD look and feel like
2. Read `DESIGN.md` — this is what the app SHOULD do
3. Start the dev server if not running:
   ```bash
   lsof -ti:8080 | xargs kill -9 2>/dev/null; rm -rf .next; npm run dev
   ```
   Wait for "ready on http://localhost:8080"

## Your Job

Open localhost:8080 using `agent-browser` CLI (NOT Playwright MCP — it's not available to subagents).

Key commands:
```bash
agent-browser open http://localhost:8080          # navigate
agent-browser snapshot                              # see page structure (accessibility tree)
agent-browser click @ref                            # click element by ref from snapshot
agent-browser fill @ref "text"                      # fill input
agent-browser screenshot path.png                   # take screenshot
agent-browser screenshot --annotate path.png        # screenshot with element labels
```

Walk through EVERYTHING.

DO NOT read source code. You are a USER, not an engineer.

At every screen, ask yourself:
- "What is this? Is it obvious?"
- "What can I do here? Can I figure it out?"
- "Is this text clear? Are icons big enough? Is text the right size?"
- "Does this feel fast or laggy?"
- "Does this look like the IDENTITY.md vibe? (dark cockpit, monospace, amber accent, dense)"

Try everything:
- Launch sessions, see if names make sense, check if you can tell them apart
- Create rooms, chat with agents, close rooms
- Try to make a sprint
- Browse memory, search, filter
- Change settings, toggle notifications
- Use sidebar for git operations
- Try every keyboard shortcut (Cmd+N, Cmd+K, Cmd+\, Esc, Cmd+1-6)
- Resize the window
- Enter weird input (very long text, empty strings)
- Leave it idle for a minute — does anything degrade?
- Check browser console for errors

Document EVERY issue — not just bugs but:
- Confusing text or labels
- Elements too small or too big
- Missing features a user would expect
- Workflows that feel incomplete
- Visual inconsistencies with IDENTITY.md
- Missing loading/error/empty states

## After Exploring

Cross-check against `qa/product-checklist.md` for anything you missed.
Add new questions to the checklist for issues you found that weren't covered.

## Output

Write ALL findings to `qa/audit-results/run-1.json` using this EXACT format:

```json
{
  "run": 1,
  "phase": "brain-1",
  "timestamp": "ISO-8601",
  "issues": [
    {
      "id": "ISSUE-1",
      "feature": "sessions|teams|memory|settings|sidebar|general",
      "type": "bug|ux|missing-feature|performance|visual|content",
      "description": "What's wrong FROM A USER PERSPECTIVE",
      "severity": "CRITICAL|HIGH|MEDIUM|LOW",
      "screenshot": "qa/screenshots/issue-1.png",
      "checklist_item": "The checklist question this maps to (or 'NEW')",
      "status": "open"
    }
  ],
  "health_score": 0,
  "summary": "One paragraph summary"
}
```

Then create `qa/plan.json` with tasks from your findings, sorted by severity:

```json
{
  "generated_at": "ISO-8601",
  "generated_from": "qa/audit-results/run-1.json",
  "tasks": [
    {
      "id": "TASK-1",
      "issue_id": "ISSUE-1",
      "description": "What to fix",
      "severity": "CRITICAL|HIGH|MEDIUM|LOW",
      "status": "pending"
    }
  ]
}
```

Take screenshots for every issue. Save to `qa/screenshots/`.

Calculate health score: `((total_checks - critical*4 - high*2 - medium*1) / total_checks) * 100`
Update `qa/health-score.json` with the first run.

When done, commit: `git add -A && git commit -m "Brain 1: Product audit — N issues found, health score X"`
