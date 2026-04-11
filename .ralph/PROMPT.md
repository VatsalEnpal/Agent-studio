# Agent Studio — Autonomous Rewrite + QA Loop
# Run with: /loop (in Claude Code, from ~/Code/AgentStudio)
# Or: claude -p "$(cat .ralph/PROMPT.md)" from the terminal

You are making Agent Studio release-ready. This is a Next.js 16 + Express + xterm.js + node-pty
app at localhost:8080. It is a command center for Claude Code agents.

## Your Mission

Take this app from broken MVP to a product that a stranger can clone from GitHub,
run `npm install && npm start`, and use every feature without confusion or errors.

## The Karpathy Rules

1. **Autoresearch pattern**: try → measure → keep/discard. Every change must improve things.
   If it doesn't, `git reset` and try differently. Failure costs nothing.
2. **Declarative over imperative**: Don't follow rigid steps. Understand the success criteria
   and figure out how to get there.
3. **The wiki pattern**: Your checklist and findings are living documents. Update them as you
   learn. They should be smarter at the end than the start.

---

## Four Brains — Run In Order

### Brain 0: Code Rewrite (Architect mode) — RUNS FIRST

The existing code is patches on patches. Before testing the product, make the code solid.

**How to assess each file:**
- Read it. Ask: "Is this a clean module with one job, or a tangled mess?"
- Check git history: `git log --oneline <file> | wc -l` — high churn = accumulated patches
- Check complexity: deep nesting, mixed concerns, functions over 100 lines = rewrite candidate
- Look for: bare `catch {}`, `execSync`, `// HACK`, `// TODO`, `as any`

**Categorize every source file:**
- GREEN: Clean, focused, works well → leave alone
- YELLOW: Structurally OK, needs cleanup → improve in-place
- ORANGE: Patches on patches, technically works → strangler fig (write clean replacement alongside, switch over, delete old)
- RED: Fundamentally broken architecture → full rewrite, but READ the old code first to capture hidden edge cases

**Known RED/ORANGE areas (from past analysis):**
- `server/index.ts` — 1,600+ line monolith. Split into focused modules.
- WebSocket broadcast — every PTY byte fans to ALL clients. Scope by session.
- `execSync` in git-status.ts, process-discovery.ts — blocks event loop. Replace with async.
- Close Room — SIGTERM without SIGKILL fallback. Zombie PTY processes.
- Polling at 3s/10s/30s — ~100 FS reads/min. Replace with event-driven (chokidar).
- Silent `catch {}` everywhere — errors swallowed, user sees nothing.

**Rules for rewriting:**
- One module at a time. Commit after each. If it breaks something, revert.
- Every rewrite must make the module SIMPLER, not more complex.
- Write a test for the new module before deleting the old one.
- After rewriting a module: `npm run type-check && npm run build` must pass.
- Update CURRENT_STATE.md after each rewrite.

**Output:** Write `qa/code-audit.json` with the categorization of every file.

**Exit criteria for Brain 0 (when to move on):**
- `npm run type-check` passes
- `npm run build` passes
- No `execSync` calls remain in source code
- No bare `catch {}` or `catch { /* ignore */ }` remain
- The 6 known RED/ORANGE areas above are addressed
- Don't aim for perfect code — aim for solid enough that Brain 1 can test the product
  without hitting crashes and infrastructure bugs. You'll come back to improve code
  during Brain 2 if the product audit reveals deeper issues.

**After Brain 0:** Restart the dev server so your changes take effect:
```bash
lsof -ti:8080 | xargs kill -9 2>/dev/null
cd ~/Code/AgentStudio && rm -rf .next && npm run dev &
```
Wait for "ready on http://localhost:8080" before proceeding to Brain 1.

---

### Brain 1: Product Audit (User mode)

**Before starting:** Make sure the dev server is running on localhost:8080.
Run `lsof -ti:8080` to check. If nothing is running, start it:
`cd ~/Code/AgentStudio && npm run dev &`
Wait for "ready on http://localhost:8080" in the output before proceeding.

You are a person who just found this app on GitHub. You have NEVER seen it before.
You don't know what "PTY" means. You don't know what "Zustand" is.
You just want to manage your AI coding agents from one place.

**Primary mode: OPEN EXPLORATION (this is the main thing)**

Open localhost:8080 in a browser. Walk through everything as a real user would.
At every moment, ask yourself:

- "What is this screen trying to tell me?"
- "What can I do here? Is it obvious?"
- "If I click this button, will I know what happens?"
- "If something goes wrong, will I know why and what to do?"
- "Is this text clear? Would my non-technical friend understand it?"
- "Is this visual element the right size? Can I see it clearly?"
- "Would I know how to get back if I navigated somewhere?"
- "Is anything missing that I'd expect to be here?"
- "Does this feel fast or does it feel sluggish?"
- "Does this look professional or does it look like a prototype?"

Try everything:
- Launch sessions with different settings
- Create rooms, add agents, chat
- Try to make a sprint from scratch
- Browse memory, search, filter
- Change settings, toggle notifications
- Use the sidebar for git operations
- Try every keyboard shortcut
- Resize the window to different sizes
- Leave the app idle for 2 minutes — does anything degrade?
- Enter weird input — very long text, special characters, empty strings
- Navigate away and come back — is state preserved?

Document EVERY issue — not just bugs, but:
- Confusing labels or text
- Elements that are too small or hard to see
- Missing features that a user would expect
- Workflows that feel incomplete
- Places where you got stuck or didn't know what to do next
- Things that work but feel slow or janky
- Missing visual feedback (no loading indicator, no confirmation, no error message)

**Secondary mode: CHECKLIST CROSS-CHECK (safety net)**

After exploring freely, cross-check against `qa/product-checklist.md` to make sure
you didn't miss anything. The checklist is a minimum — your exploration should find
things the checklist doesn't cover.

For every issue found, add it to `qa/product-checklist.md` if a similar question
doesn't already exist. The checklist grows from your discoveries.

**Output:** Write results to `qa/audit-results/run-{N}.json`. Every issue becomes
a task in `qa/plan.json` with severity.

---

### Brain 2: Build + Fix (Engineer mode)

Read `qa/plan.json`. Fix issues by priority: CRITICAL → HIGH → MEDIUM → LOW.

For each task:
1. Read the relevant source code
2. Understand the ROOT CAUSE (not the symptom)
3. Make the change — clean, minimal, focused
4. Hooks will auto-format and typecheck
5. `git commit` (one logical change per commit)
6. If the fix adds complexity, stop — you're patching, not fixing

**The complexity test:** After your fix, is the code:
- Shorter? → good
- Same length but clearer? → good
- Longer with more conditionals? → you're patching. Step back and think again.

Fix max 5 issues, then switch to Brain 3 to validate. Do NOT fix 20 things
without testing — you'll create regressions you can't trace.

---

### Brain 3: QA Validation (Tester mode — DO NOT READ SOURCE CODE)

You are a NEW user again. You forgot everything about the code.
DO NOT read any source files during this phase. Navigate ONLY through the browser.
If you catch yourself thinking "well, the code handles that..." — stop. You're
leaking engineering knowledge into the user test. A real user doesn't know the code.
Open localhost:8080 fresh.

**Explore the entire app like Brain 1, but this time you're looking for:**
1. Did the fixes actually work? (from a user's perspective, not code)
2. Did any fixes break other things? (regressions)
3. Are there new issues that weren't there before?

**For every feature, the 10-point check:**
1. Happy path works
2. Empty state has helpful message + CTA
3. Loading state shows skeleton/spinner
4. Error state shows actionable message
5. Keyboard navigation works
6. No console errors
7. No layout shift on data load
8. Overflow text handled
9. Destructive actions need confirmation
10. Back/undo returns to sensible state

**For every bug:**
```json
{
  "id": "BUG-{N}",
  "description": "What's wrong FROM A USER PERSPECTIVE",
  "severity": "CRITICAL|HIGH|MEDIUM|LOW",
  "screenshot": "qa/screenshots/bug-{N}.png",
  "miss_category": "checklist_gap|visual_blindspot|edge_case|data_dependent|interaction_sequence|timing|assumption",
  "checklist_improvement": "New question to add to product-checklist.md"
}
```

If bugs found → update plan, go back to Brain 2.
If all PASS → done.

---

## The Loop

```
Brain 0 (rewrite code) → Brain 1 (explore as user) → Brain 2 (fix) → Brain 3 (test as user)
                                                         ↑                    ↓
                                                         └── bugs found ──────┘
                                                                              ↓ all pass
                                                                           DONE
```

## Health Score

**How to calculate:** `health_score = ((total_checks - critical*4 - high*2 - medium*1) / total_checks) * 100`
Critical bugs count 4x, high count 2x, medium count 1x, low don't affect the score.
This means one CRITICAL bug drops the score more than five MEDIUM bugs.

After each Brain 3 pass, update `qa/health-score.json`:
```json
{
  "run": N,
  "timestamp": "ISO-8601",
  "health_score": 94.7,
  "total_checks": 165,
  "bugs_found": 3,
  "critical": 0,
  "high": 1,
  "medium": 2,
  "low": 0,
  "checklist_items_added": 4,
  "convergence_trend": [72.0, 81.3, 88.5, 92.1, 94.7]
}
```

## Audit Result Schema

Every `qa/audit-results/run-{N}.json` MUST follow this format:
```json
{
  "run": N,
  "phase": "brain-1|brain-3",
  "timestamp": "ISO-8601",
  "issues": [
    {
      "id": "ISSUE-{N}",
      "feature": "sessions|teams|memory|settings|sidebar|general|code",
      "type": "bug|ux|missing-feature|performance|visual|content",
      "description": "What's wrong FROM A USER PERSPECTIVE",
      "severity": "CRITICAL|HIGH|MEDIUM|LOW",
      "screenshot": "qa/screenshots/issue-{N}.png",
      "checklist_item": "The checklist question this maps to (or 'NEW' if not in checklist)",
      "status": "open|fixed|verified|wont-fix"
    }
  ],
  "health_score": 94.7,
  "summary": "One paragraph summary of this run's findings"
}
```

## When to Stop

**Done:**
- Health score >= 95
- Zero CRITICAL or HIGH bugs
- App works from a clean `git clone && npm install && npm start`

**Circuit breaker (stop and report to user):**
- 3 runs with no score improvement
- 5 runs with the same unfixed bug
- Total runs exceed 20
- A single fix causes 3+ regressions

## Self-Improvement

After EVERY Brain 3 pass:
1. For each bug the checklist DIDN'T catch: ask WHY and add a new question
2. The checklist grows from your discoveries
3. After 5+ runs: remove auto-added questions that never caught anything
4. Track whether the miss rate is decreasing — that's convergence

## What "Done" Means

A stranger can:
1. Clone, install, start — works first try
2. Understand the app within 10 seconds
3. Launch a session within 30 seconds
4. Use every tab without getting stuck
5. Manage sprints, rooms, memory
6. Push code and create PRs from the sidebar
7. Configure which notifications they get
8. Use keyboard shortcuts
9. Close and reopen without losing state
10. Feel like they're using a polished product, not a prototype

## Anti-Patterns

1. Don't add try/catch without understanding the error
2. Don't use `// @ts-ignore` or `as any`
3. Don't replace code with `// ...rest of implementation` comments
4. Don't add features — fix and polish what exists
5. Don't test by reading code — test by using the browser
6. Don't claim "done" without screenshots
7. Don't fix more than 5 things between QA runs
8. Don't patch — if you're making code more complex, you're doing it wrong
9. Don't skip Brain 0 — if you build on broken code, everything you build will break
10. Don't spend more than 40% of total time on Brain 0 — the product matters more than perfect code

## Tools You Have

- **Playwright MCP** — already configured in `.mcp.json`. Use for browser interaction.
- **gstack /qa** — systematic QA. Run with `/qa` or `/qa --exhaustive`
- **agent-browser** — CLI browser control. Faster than Playwright MCP for simple navigation.
- **web-design-guidelines** — auto-checks UI against 70+ rules
- **ux-writing-skill** — auto-checks button labels, error messages, empty states
- **Product-Manager-Skills** — frameworks for thinking about user flows and priorities
- **superpowers** — brainstorming, planning, verification, debugging workflows

## How to Start the Dev Server

```bash
cd ~/Code/AgentStudio
lsof -ti:8080 | xargs kill -9 2>/dev/null; rm -rf .next; npm run dev
```
Wait for "ready on http://localhost:8080" before starting any browser testing.

## The North Star

This is a PRODUCT, not a project.
Every screen answers: "What can I do here, and how do I do it?"
If the answer isn't obvious in 5 seconds, the screen is broken — even if the code compiles.

## Design Identity (READ IDENTITY.md)

Agent Studio has a specific look: dark cockpit, monospace everything, amber accent,
dense information, terminal-first. Read `IDENTITY.md` before touching ANY frontend code.

If your changes make the app look like "any Tailwind dashboard" — undo them.
The identity is: Bloomberg Terminal meets Linear meets Raycast. Dark, dense, alive.
One font (Geist Mono). One accent color (amber). No decoration. Just data.
