# Proposed Fixes — ShipLoop Run 3

Based on the cross-persona evaluation of 20 deduplicated issues.

## Will Fix (10 issues)

These block personas from completing core tasks, cause visible broken UI, or make the app feel unfinished.

### Fix 1: History tab 404 storm

- **Issue:** `/api/sessions/{id}/usage` returns 404 for filesystem-discovered sessions
- **Why:** Every user hits this. 40-150+ errors per History visit. Universal (4/4 personas).
- **Plan:** Add the missing `/api/sessions/{id}/usage` route that returns graceful empty data for sessions not in the server's memory. Or: stop fetching usage for sessions where the server doesn't track them.
- **Effort:** LOW
- **Verify with:** P1 (newcomer), P4 (power user)

### Fix 2: Sprint dialog Escape key

- **Issue:** Sprint Create dialog ignores Escape key
- **Why:** Breaks standard modal behavior. Confirmed 3x (P2, P3, P4).
- **Plan:** The dialog likely uses a custom component instead of Radix Dialog, or is missing the `onOpenChange` handler. Add proper Escape handling.
- **Effort:** LOW
- **Verify with:** P3 (agent builder)

### Fix 3: Dead terminal persists after session kill

- **Issue:** Killed session stays displayed with stale/garbled output
- **Why:** Confirmed 3x. User sees dead terminal instead of empty state or next session.
- **Plan:** On session kill, auto-navigate to the next active session or show empty state. Clean up terminal instance.
- **Effort:** MEDIUM
- **Verify with:** P2 (developer)

### Fix 4: Settings reads wrong source for defaults

- **Issue:** Settings General shows wrong model/permissions/working directory
- **Why:** Settings page reads from a separate `.settings.json` instead of `.agent-studio.json`. Confirmed 3x.
- **Plan:** Ensure Settings General reads defaults from the canonical `.agent-studio.json` config.
- **Effort:** LOW
- **Verify with:** P4 (power user)

### Fix 5: Command palette missing navigation options

- **Issue:** Only 5 of 8+ possible actions. Missing Sprints, Reports, Settings.
- **Why:** Confirmed 2x. Power users expect full navigation from palette.
- **Plan:** Add missing navigation items to the command palette.
- **Effort:** LOW
- **Verify with:** P4 (power user)

### Fix 6: Shortcut references wrong in empty states

- **Issue:** Empty state says "Cmd+N" but actual shortcut is "Cmd+Shift+N"
- **Why:** Misleading for newcomers. Easy fix.
- **Plan:** Update empty state text to show correct shortcuts.
- **Effort:** LOW
- **Verify with:** P1 (newcomer)

### Fix 7: Notification badge persists in page title

- **Issue:** "(N) Agent Studio" never clears
- **Why:** Confirmed 3x. Minor but persistent annoyance.
- **Plan:** Clear the badge count when user views the relevant session/tab.
- **Effort:** LOW
- **Verify with:** P2 (developer)

### Fix 8: Sprint working directory not pre-filled

- **Issue:** Shows placeholder instead of config default
- **Why:** Wastes time for users who have defaults configured.
- **Plan:** Read default working directory from config and pre-fill in sprint wizard.
- **Effort:** LOW
- **Verify with:** P4 (power user)

### Fix 9: "Looks good" button enabled when no agents generated

- **Issue:** Setup wizard step 2 allows proceeding despite agent generation failure
- **Why:** Newcomer thinks setup succeeded when it didn't.
- **Plan:** Disable the button when agents array is empty.
- **Effort:** LOW
- **Verify with:** P1 (newcomer)

### Fix 10: Missing ARIA descriptions on dialogs

- **Issue:** 10-16 React accessibility warnings per session
- **Why:** Easy fix, improves accessibility compliance.
- **Plan:** Add `aria-describedby` or Radix `Description` to all DialogContent components.
- **Effort:** LOW
- **Verify with:** Any persona (check console)

## Will Skip (10 issues)

### Skip 1: `/api/analyze-project` returns 400

- **Why skip:** This endpoint likely requires an LLM API call to analyze the project and generate agent recommendations. Without a valid API key in the test environment, this will always fail. The fix would require either mocking the LLM response or adding proper error handling with a fallback. Not a code bug — it's an environment dependency.
- **Impact:** Newcomers can still proceed through setup (they just don't get auto-generated agents). They can create agents manually later via the agent creation wizard.

### Skip 2: Killed session garbled output (escape codes)

- **Why skip:** Only reproduced in P2 and P3, NOT in P4. Intermittent. Fix 3 (dead terminal persists) addresses the parent issue — auto-navigating away from killed sessions means users won't see the garbled output even if it occurs.

### Skip 3: Git integration unreachable from UI

- **Why skip:** The git repos section is a significant feature that requires proper sidebar integration. The backend works, the store works, the components exist — but wiring them into the sidebar requires design decisions about where/how to show repos alongside sessions, teams, etc. This is a feature addition, not a bug fix. Flag for Vatsal.

### Skip 4: PR creation modal unreachable

- **Why skip:** Depends on Skip 3. Can't open PR modal without git repos section in sidebar.

### Skip 5: No back button in setup wizard step 2

- **Why skip:** Minor UX issue. User can close and reopen the wizard. Setup wizard is a one-time experience.

### Skip 6: Small viewport layout broken

- **Why skip:** App is designed for wide monitors (Bloomberg Terminal density). Responsive design below 800px would require significant layout rework and is not the target use case.

### Skip 7: Nav rail tooltips overlap sidebar

- **Why skip:** Polish issue. Tooltips still show correct information. Would require custom tooltip positioning logic.

### Skip 8: Room dialog uses hardcoded agents

- **Why skip:** Requires refactoring the room creation to use the agent discovery system. Medium effort for a feature (rooms) that has other dependencies (the Claude Agent SDK).

### Skip 9: Default working directory not applied to New Session

- **Why skip:** Partially works — the session dialog does read model correctly in P3/P4. The working directory pre-fill would need investigation into which config source the dialog reads from. Lower priority than the fixes above.

### Skip 10: PROD badge uses red instead of amber

- **Why skip:** Reasonable design choice. Red for production/danger is a well-established convention. Amber-only is a guideline, not a hard requirement for semantic colors.
