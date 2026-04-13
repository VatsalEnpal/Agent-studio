# Cross-Persona Evaluation — ShipLoop Run 3

**Date:** 2026-04-13
**Personas tested:** 4/4
**Total screenshots:** 112
**Total raw findings:** 55 (many duplicated across personas)

## Deduplicated Issue List (Top 20)

After deduplication, there are **20 unique issues** across all 4 personas. Issues confirmed by multiple personas get higher confidence ratings.

### CRITICAL (3 unique issues)

**1. History tab fires 404 storm on `/api/sessions/{id}/usage`**

- Confirmed: P1, P2, P3, P4 (ALL personas)
- Impact: 40-150+ 404 errors per History tab click. Pollutes console, degrades performance, wastes network requests.
- Root cause: Frontend fetches usage data for sessions discovered from Claude CLI filesystem that the server doesn't track in memory. The `/api/sessions/{id}/usage` endpoint doesn't exist or isn't implemented.
- Fix effort: LOW — either implement the endpoint to return empty data gracefully, or stop calling it for filesystem-discovered sessions.
- Blocks shipping: YES — every user sees this the moment they click History.

**2. `/api/analyze-project` endpoint returns 400**

- Confirmed: P1, P2
- Impact: Setup wizard's core feature is broken. Newcomers' first experience is a failed wizard that generates no agents.
- Root cause: The endpoint likely expects a request body format that the frontend doesn't send correctly, or a required dependency (like an LLM API key) is missing.
- Fix effort: MEDIUM — need to debug the endpoint's validation logic.
- Blocks shipping: YES — first-time users can't complete setup.

**3. Killed session shows garbled terminal output**

- Confirmed: P2, P3 (NOT reproduced in P4)
- Impact: After killing a session, raw escape codes visible. Dead session stays displayed instead of navigating away.
- Root cause: Terminal isn't properly disposed after session kill. The intermittent nature (not in P4) suggests a race condition.
- Fix effort: MEDIUM — need to clean up terminal on kill and auto-navigate to empty state or next session.
- Blocks shipping: NO (intermittent) but severely degrades trust.

### HIGH (7 unique issues)

**4. Sprint Create dialog doesn't close on Escape**

- Confirmed: P2, P3, P4 (3x)
- Impact: Breaks standard modal behavior. User must find X button.
- Fix effort: LOW — add onEscapeKeyDown handler or fix Radix Dialog configuration.
- Blocks shipping: NO but annoying for every sprint creation.

**5. Settings General displays wrong default model**

- Confirmed: P1, P2, P4
- Impact: Settings page shows "opus" when config says "sonnet" (or vice versa). Settings appears to read from a separate `.settings.json` instead of `.agent-studio.json`.
- Fix effort: LOW — ensure Settings reads from the canonical config source.
- Blocks shipping: NO but erodes trust in settings.

**6. Git integration unreachable from UI**

- Confirmed: P4 (tested most thoroughly)
- Impact: Git API endpoints work, git store exists, PR modal exists, but the sidebar never renders the git repos section. Fully built backend with no frontend entry point. The feature spec mentions repos in sidebar but it's not rendered.
- Fix effort: MEDIUM — need to render the git repos section in the sidebar.
- Blocks shipping: YES for any user who expects git integration (it's a marketed feature).

**7. No back button in setup wizard step 2**

- Confirmed: P1
- Impact: User can't go back to change their project description after advancing.
- Fix effort: LOW — add a Back button to step 2.
- Blocks shipping: NO but frustrating for newcomers.

**8. Small viewport layout broken (no responsive design)**

- Confirmed: P1
- Impact: At <800px width, sidebar and content overlap. No responsive collapse.
- Fix effort: MEDIUM — add responsive breakpoints and sidebar collapse.
- Blocks shipping: NO (app is designed for wide screens) but should handle gracefully.

**9. Nav rail tooltips overlap sidebar content**

- Confirmed: P1
- Impact: Tooltips cover sidebar content, visually distracting.
- Fix effort: LOW — adjust tooltip positioning or add delay.
- Blocks shipping: NO but polish issue.

**10. Default working directory not applied to New Session**

- Confirmed: P3, P4
- Impact: Session dialog shows "~" instead of configured default working directory.
- Fix effort: LOW — read default from config and pre-fill.
- Blocks shipping: NO but wastes time for power users.

### MEDIUM (7 unique issues)

**11. Command palette missing navigation options**

- Confirmed: P2, P4
- Missing: Go to Sprints, Go to Reports, Go to Settings. Only 5 of 8+ possible actions.
- Fix effort: LOW

**12. Shortcut references wrong in empty states**

- Confirmed: P1
- Empty state says "Cmd+N" but actual shortcut is "Cmd+Shift+N".
- Fix effort: LOW

**13. Room dialog uses hardcoded agents, not discovered agents**

- Confirmed: P2, P3
- Shows Orchestrator/Frontend/Backend/QA/Security/PMO even when user has different agents.
- Fix effort: MEDIUM — need to wire agent discovery into room dialog.

**14. Dead terminal persists after session kill**

- Confirmed: P2, P3, P4
- Main area continues showing dead session. Should auto-navigate to next session or empty state.
- Fix effort: MEDIUM

**15. Session sidebar truncates names aggressively**

- Confirmed: P1, P2
- "Test Sess...", "InPipel..." when space is available.
- Fix effort: LOW

**16. "Looks good — let's go" button enabled when no agents generated**

- Confirmed: P1
- Wizard step 2 allows proceeding despite failure.
- Fix effort: LOW

**17. Sprint working directory not pre-filled from defaults**

- Confirmed: P4
- Shows placeholder instead of configured default.
- Fix effort: LOW

### LOW (3 unique issues)

**18. Notification badge persists in page title**

- Confirmed: P2, P3, P4
- "(N) Agent Studio" never clears.
- Fix effort: LOW

**19. PROD badge uses red instead of amber accent**

- Confirmed: P4
- Introduces second accent color.
- Fix effort: LOW

**20. Missing ARIA descriptions on all dialogs**

- Confirmed: P3, P4
- 10-16 React accessibility warnings per session.
- Fix effort: LOW

## What's Actually Working Well

These are not just "things that don't crash" — these are genuinely well-built features:

1. **Terminal rendering and interaction** — xterm.js renders Claude Code output flawlessly. ASCII art, colors, interactive prompts all work. This is the core feature and it's solid.
2. **Session creation flow** — The New Session dialog is comprehensive and well-designed with Quick Start, Resume Previous, model/agent/permissions selectors.
3. **Agent creation 3-step wizard** — Clean Describe/Configure/Preview flow with proper validation, tool toggling, markdown preview.
4. **Sprint creation 3-step wizard** — Define/Agents/Pipeline flow with agent selection and reorderable pipeline preview.
5. **Memory CRUD** — Full create/read/detail/edit/delete cycle with structured fields, categories, tags.
6. **Design consistency** — Dark theme (#0a0a0a), Geist Mono font, amber accent, no emoji/gradients/shadows throughout.
7. **Settings organization** — 7 well-organized tabs covering all aspects.
8. **Dev Servers detection** — Correctly finds running processes with port, PID, "self" label.
9. **Empty states** — Every tab has informative empty states with clear CTAs.
10. **Agent auto-detection** — `.claude/agents/` scanning works correctly across session, sprint, and agent dialogs.

## Cross-Persona Patterns

| Pattern                        | Personas   | Significance                                      |
| ------------------------------ | ---------- | ------------------------------------------------- |
| History 404 storm              | ALL 4      | Universal. Every user hits this. #1 priority fix. |
| Sprint Escape key              | P2, P3, P4 | Universal for sprint users. Easy fix.             |
| Settings displays wrong values | P1, P2, P4 | Settings page reads from wrong source. Confusing. |
| Notification badge stuck       | P2, P3, P4 | Minor but persistent annoyance.                   |
| Dead terminal after kill       | P2, P3, P4 | Session cleanup is incomplete.                    |
| Git features unreachable       | P4         | Major feature gap — built but not wired up.       |

## Honest Health Score

Using the formula: `score = ((total_checks - critical*4 - high*2 - medium*1) / total_checks) * 100`

- Total unique checks: 20
- Critical: 3 (x4 = 12)
- High: 7 (x2 = 14)
- Medium: 7 (x1 = 7)
- Low: 3 (x0 = 0)
- Score: ((20 - 12 - 14 - 7) / 20) \* 100 = **max(0, -65)% = 0%**

The raw formula goes negative because the severity-weighted issues exceed total checks. Practical interpretation: **the app has fundamental issues that must be fixed before shipping**.

However, context matters: most of the "critical" and "high" issues are fixable bugs, not architectural problems. The core features (terminal, sessions, wizards, memory) work well. After fixes, health could reach 80-90%.

## What Would Make a Real User Give Up

1. **Setup wizard failing** (critical #2) — newcomer's first 30 seconds, wizard breaks, they close the app.
2. **History 404 spam** (critical #1) — power user opens History, sees errors, loses trust.
3. **Git features missing** (high #6) — marketed feature doesn't exist in UI.
4. **Garbled terminal after kill** (critical #3) — user kills a session, sees garbage, questions reliability.

## Recommendations

**Fix immediately (before shipping):**

- Issues 1-6 (all critical and the top high issues)

**Fix soon (before v1.1):**

- Issues 7-14 (remaining high and top medium)

**Fix eventually:**

- Issues 15-20 (medium/low polish)

**Skip:**

- Responsive design below 800px (app is for wide monitors)
- PROD badge color (reasonable design choice for danger signaling)
