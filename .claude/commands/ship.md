You are making Agent Studio release-ready. Read `.ralph/PROMPT.md` for the full plan.

NOTE: You are running with `--dangerously-skip-permissions`. All tool calls are auto-approved.
This means you can work fully autonomously without waiting for approval. USE THIS RESPONSIBLY:
- Still commit one change at a time (so you can revert)
- Still don't delete files without understanding why they exist
- Still don't force-push or modify git history

## What You're Doing

Taking this app from broken MVP to a polished product a stranger can clone and use.
4 phases: Rewrite bad code → Explore as a user → Fix product gaps → Test as a user → loop until done.

## Before You Start

0. Install the frontend-design plugin (prevents AI slop in UI code):
   ```
   /plugin install frontend-design@claude-plugins-official
   ```
   If this fails, continue anyway — the web-design-guidelines skill is already installed
   and covers the most critical UI rules.

1. Read these files IN ORDER:
   - `CLAUDE.md` — architecture rules, critical patterns, what NOT to touch
   - `CURRENT_STATE.md` — what works, what's broken right now
   - `DESIGN.md` — what the product SHOULD be (this is the spec)
   - `IDENTITY.md` — the design identity and taste (THIS IS CRITICAL — it's what makes the app look like Agent Studio, not generic AI slop)
   - `.ralph/PROMPT.md` — the full autonomous loop plan (4 Brains)
   - `qa/product-checklist.md` — the empathy checklist (safety net for testing)

2. Verify your tools work:
   - Run `npm run type-check` — does it pass?
   - Run `npm run build` — does it pass?
   - Test Playwright: use the Playwright MCP to navigate to any URL — does it connect?
   - If any tool fails: fix it before proceeding. Don't start the loop with broken tools.

## Frontend Code Quality Rules

This is a Next.js 16 + React 19 + Tailwind + Radix UI + Zustand app. When writing frontend code:

- **Components**: Small, focused, one file per component. Max 200 lines. If longer, split.
- **State**: Zustand stores only. No Context API, no prop drilling for shared state.
- **Styling**: Tailwind classes. No inline styles. No CSS modules. Use `cn()` from `clsx/tailwind-merge`.
- **UI primitives**: Radix UI for dialogs, dropdowns, tooltips. Don't reinvent these.
- **Icons**: Lucide React only. Consistent size (16px default, 20px for primary actions).
- **Loading states**: Every async operation needs a loading skeleton or spinner.
- **Error states**: Every fetch/async needs an error boundary or inline error message.
- **Empty states**: Every list/grid needs an empty state with a CTA.
- **No AI slop**: Read `IDENTITY.md` before writing ANY frontend code. This app has a specific identity — dark cockpit, monospace DNA, amber accent, dense information, terminal-first. If your code produces something that looks like "any Tailwind app," you're doing it wrong.
- **Accessibility**: All interactive elements need keyboard focus states. All images need alt text. All icons need aria-labels if no visible text label.
- **Voice**: Short, direct, no filler. "No sessions running. Start one." NOT "Oops! Nothing here yet!" See IDENTITY.md voice & tone section.

3. Start the dev server:
   ```bash
   lsof -ti:8080 | xargs kill -9 2>/dev/null; rm -rf .next; npm run dev
   ```
   Wait for "ready on http://localhost:8080" before any browser testing.

## How to Work

Follow `.ralph/PROMPT.md` exactly. Start with Brain 0 (code rewrite).

Work autonomously. Don't ask questions — make decisions and document them.

If something isn't clear, check DESIGN.md first (that's the spec).
If DESIGN.md doesn't answer it, use your best judgment and document the decision.

## If Something Goes Wrong

- **Build fails after a code change:** `git diff HEAD~1` to see what you changed, revert with `git revert HEAD`, try a different approach.
- **Dev server won't start:** Check for port conflicts (`lsof -ti:8080`), syntax errors in changed files (`npm run type-check`).
- **Playwright can't connect:** Make sure dev server is running first. Try `browser_navigate` to `http://localhost:8080`.
- **You're stuck on the same bug for 3+ attempts:** Mark it as `wont-fix` in the plan, move to the next issue, come back later with fresh context.
- **Health score isn't improving:** Stop fixing more things. Re-read the audit results. You might be fixing symptoms not causes.
- **You hit the circuit breaker (3 no-progress runs):** Write a summary of what you tried to `qa/circuit-breaker-report.md` and stop. The user will review.

## When You're Done

1. All CRITICAL and HIGH issues resolved
2. Health score >= 95
3. `npm run type-check && npm run build` both pass
4. The app looks like Agent Studio (dark cockpit, monospace, amber accent — see IDENTITY.md)
5. A clean clone works: `git clone && npm install && npm start` → app runs
6. First-time user experience works: no agents, no repos, no sprints → setup wizard or helpful empty states
7. Write a final summary to `qa/final-report.md`:
   - What was rewritten (Brain 0)
   - What product gaps were found and fixed (Brain 1+2)
   - Final health score and convergence trend
   - Any issues left as `wont-fix` and why
   - How many checklist items were auto-added
   - Whether the app passes the IDENTITY.md vibe check
