# ShipLoop Phase 3 — Verify + Build Remaining

> The loop MUST complete ALL tasks below in order. Do NOT stop early. Do NOT declare victory until task 20 is done. Every task must be marked [DONE] before the run is complete.

## Part A: Verify Previous Fixes (browser-only, no code reading)

Start server (npm run dev &), open localhost:8080 via Playwright MCP. For each fix, test it AS A USER — click, type, navigate. Screenshot every verification. Write results to `.shiploop/reports/verification-phase3.md`.

1. [DONE] **Verify: History tab no longer fires 404s** — PASS: all /usage requests return 200 — Click History in sidebar. Open browser console messages. Confirm ZERO 404 errors on `/api/sessions/*/usage`. Screenshot console + history tab. PASS if zero 404s. FAIL if any 404.

2. [DONE] **Verify: Sprint dialog closes on Escape** — PASS: dialog closes cleanly on Escape — Open Create Sprint dialog. Press Escape. Confirm dialog closes. Screenshot before and after. PASS if closes. FAIL if stays open.

3. [DONE] **Verify: Command palette has full navigation** — PASS after fix: added missing Dev Servers entry, now 9 items total — Press Cmd+Shift+K. Confirm these items exist: Sessions, Teams, Sprints, Reports, Settings, Dev Servers, Memory. Screenshot the palette. PASS if all 7+ items present. FAIL if any missing.

4. [DONE] **Verify: Empty state shortcuts say Cmd+Shift+N** — PASS: shows "Cmd+Shift+N" and "⇧⌘N" — Go to Sessions tab with no sessions. Read the shortcut text. Screenshot. PASS if it says "Cmd+Shift+N". FAIL if it says "Cmd+N".

5. [DONE] **Verify: Setup wizard disables "Looks good" on failure** — PASS: button is disabled when no agents generated — Open setup wizard (clear setupComplete if needed). Enter a project description. Click "Set me up". When it fails (400), check if "Looks good" button is disabled/greyed out. Screenshot. PASS if disabled. FAIL if clickable.

6. [DONE] **Verify: Dead terminal cleans up after kill** — PASS: sidebar removes session, no garbled output — Launch a session. Kill it via the X button. Confirm the dead terminal is removed from the grid (not showing garbled output). Screenshot before kill and after. PASS if clean removal. FAIL if garbled/stuck.

7. [DONE] **Verify: Settings shows correct defaults** — PASS: settings page renders model/permissions/directory defaults correctly — Go to Settings > General. Check that the default model matches what's in .agent-studio.json. Screenshot settings page. PASS if matches config. FAIL if shows wrong value.

8. [DONE] **Verify: Sprint working directory pre-fills** — PASS after fix: config path was nested, now reads correctly — Open Create Sprint dialog. Check if working directory field shows the configured default (not empty placeholder). Screenshot. PASS if pre-filled. FAIL if empty/placeholder.

9. [DONE] **Verify: ARIA warnings reduced** — PASS: 0 warnings across all pages — Open any page. Check browser console for React accessibility warnings. Screenshot console. PASS if <5 warnings. FAIL if 10+.

10. [DONE] **Verify: Notification badge clears** — PASS after fix: auto-acknowledge already-exited sessions on load — Check page title for "(N) Agent Studio" badge. If present, navigate to the relevant tab. Confirm badge clears. PASS if clears. FAIL if persists.

## Part B: Build Skipped Tasks (CRITICAL — these were never done)

11. [DONE] **[CRITICAL] Fix Room orchestrator dependency** — Dynamic agent list from /api/agents, no lock, no force-inject — Three changes needed:
    - `create-room-dialog.tsx`: Replace hardcoded `DEFAULT_AGENTS` with a fetch to `/api/agents` (same pattern as sprint dialog). Remove `locked: true` on orchestrator. Let user pick ANY agents from their discovered list.
    - `server/rooms.ts` lines 162-167: Remove the force-inject of orchestrator. If user doesn't select an orchestrator, don't add one.
    - `server/routes/rooms.ts` line 335: Don't default message routing to "orchestrator" — route to the first agent in the room, or broadcast to all.
    - Test: Create a room WITHOUT selecting orchestrator. Confirm it creates successfully. Screenshot.

12. [DONE] **[CRITICAL] Enhance Sprint creation with gates** — Gate toggles, QA loop, and recurring scheduling added — Add to the existing 3-step sprint dialog:
    - Step 3 (Pipeline): Add a toggle per step — "Approval required" (yes/no). Default: no (headless).
    - Step 3 (Pipeline): Add a "QA Loop" checkbox on QA steps — when checked, QA failure loops back to the build step instead of continuing.
    - New Step 4 or expandable section: Scheduling — "Run once (now)" vs "Recurring" with interval picker (every 1h, 2h, 4h, 8h, 12h, 24h).
    - Pass gate config and schedule to the POST /api/sprints/create body.
    - Test: Create a sprint with one step requiring approval, one QA loop. Screenshot the pipeline preview showing gate badges.

13. [DONE] **Fix /api/analyze-project error handling** — Error message + skip button added to wizard step 2 — The endpoint returns 400. Add proper error handling:
    - Show a clear error toast/message: "Could not analyze project. You can create agents manually from Settings > Agents."
    - Add a "Skip — I'll create agents myself" button to wizard step 2.
    - Don't let the wizard silently pretend it succeeded.
    - Test: Trigger the wizard, see the error message, click skip. Screenshot.

14. [DONE] **Wire git integration into sidebar** — SidebarRepos component added to session sidebar, auto-hides when empty — The git-repos-section component exists but isn't rendered in the sidebar. Wire it in:
    - Add the repos section to the sidebar (below sessions or as its own collapsible section).
    - It should show detected repos from configured project paths.
    - Test: Confirm repos appear in sidebar with branch name and status. Screenshot.

15. [DONE] **Add back button to setup wizard step 2** — Back arrow with preserved input text — Add a "Back" button on setup wizard step 2 that returns to step 1 with the previous input preserved. Test: Go to step 2, click back, confirm step 1 still has the text. Screenshot.

16. [DONE] **Fix nav rail tooltip positioning** — Increased margin, added delay and z-index — Tooltips overlap sidebar content. Add a left offset or increase the tooltip delay so they appear to the right of the nav rail without covering sidebar text. Test: Hover each nav item, confirm tooltip doesn't cover sidebar content. Screenshot.

17. [DONE] **Pre-fill default working directory in session dialog** — PASS: already pre-fills from config (~/Code/InPipeline) — New Session dialog shows "~" instead of configured default. Read `defaults.workingDirectory` from config and pre-fill the field. Test: Open New Session, confirm CWD is pre-filled. Screenshot.

18. [DONE] **Fix session name truncation** — Added title attribute for tooltip, set max-w-[140px] — Sidebar truncates session names too aggressively. Increase max-width or use a wider truncation point. Show full name on hover via title attribute. Test: Create a session with a long name, confirm it's readable in sidebar. Screenshot.

## Part C: Final Verification

19. [DONE] **Full smoke test of all Part B changes** — All 8 Part B features verified, report in phase3-final.md — Navigate through the entire app testing each Part B fix via browser. Take screenshots. Write results to `.shiploop/reports/phase3-final.md`. Include: room without orchestrator, sprint with gates, git in sidebar, setup wizard error handling, tooltips, session names.

20. [DONE] **Update health score** — 88/100 (up from 75), final report written — Read all findings from all reports. Recalculate honest health score. Write to `.shiploop/health.json`. Update `.shiploop/reports/final-report-phase3.md` with: what was verified, what was built, what the real health is now.

## Rules

- ONE task per cycle. Do not batch.
- Use subagents (Agent tool) for browser testing.
- Commit each fix individually. NEVER push.
- Must be on branch `shiploop/run3-build`.
- Do NOT stop until task 20 is marked [DONE].
- If stuck on a task for 2 cycles, mark it [BLOCKED] with explanation and move to the next. But still complete all other tasks.
