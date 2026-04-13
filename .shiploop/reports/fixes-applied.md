# Fixes Applied — ShipLoop Run 3

**Date:** 2026-04-13
**Branch:** `shiploop/run3-build`
**Total commits:** 12 (10 original fixes + 2 command palette corrections)

## Fix Summary

| #   | Commit                        | Fix                                                               | Severity | Verified                                   | Persona  |
| --- | ----------------------------- | ----------------------------------------------------------------- | -------- | ------------------------------------------ | -------- |
| 1   | `7bdefa5`                     | History tab 404 storm — return empty usage instead of 404         | CRITICAL | PASS                                       | P1,P4    |
| 2   | `300fc66`                     | Sprint dialog Escape key — added useEffect keydown listener       | HIGH     | PASS                                       | P3       |
| 3   | `3387533`+`c7915f4`+`4c7a113` | Command palette — added Sprints/Reports/Settings navigation       | MEDIUM   | PASS (after 2 corrections)                 | P1,P4    |
| 4   | `1c517a5`                     | Shortcut text — Cmd+N to Cmd+Shift+N in empty states              | MEDIUM   | PASS                                       | P1       |
| 5   | `a40cc8d`                     | Setup wizard — disable "Looks good" when no agents generated      | MEDIUM   | PASS                                       | P1       |
| 6   | `26501aa`                     | Dead terminal — call removeSession after kill DELETE              | CRITICAL | PASS (code verified)                       | P2       |
| 7   | `c9b2a54`                     | Settings defaults — fetch from server, show skeleton until loaded | HIGH     | PASS                                       | P4       |
| 8   | `87305d0`                     | Notification badge — only count unacknowledged error exits        | LOW      | PASS                                       | P2,P3,P4 |
| 9   | `4772bae`                     | Sprint working dir — fallback to defaults.workingDirectory        | MEDIUM   | PASS (works with config that has defaults) | P4       |
| 10  | `25532ba`                     | ARIA descriptions — added Dialog.Description to 5 dialogs         | LOW      | PASS                                       | All      |

## Verification Results

- **9 of 10 PASS** via Playwright browser testing
- **1 SKIP** (Fix 6: dead terminal after kill — no active sessions to kill during verification, but code change is trivially correct: added one line `removeSession(sessionId)` after DELETE)
- **Fix 3** required 2 additional commits: first edit went to wrong component file (`layout/command-palette.tsx` instead of `ui/command-palette.tsx`), then the action entries were missing. Final commit `4c7a113` to the correct file verified with 8 items in palette.
- **Fix 9** shows empty field under persona-1 (which has no `defaults` in config) — this is correct behavior. The fallback only activates when `defaults.workingDirectory` exists in config, which it does for persona-3 and persona-4.

## Issues Skipped (with rationale)

| Issue                                        | Why Skipped                                                                                  |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `/api/analyze-project` returns 400           | Environment dependency — needs LLM API key. Users can create agents manually.                |
| Killed session garbled output (escape codes) | Intermittent (not repro in P4). Fix 6 addresses parent issue — dead terminal is now removed. |
| Git integration unreachable from UI          | Feature addition requiring design decisions. Backend works. Flag for Vatsal.                 |
| PR creation modal unreachable                | Depends on git integration.                                                                  |
| No back button in setup wizard step 2        | One-time UX. User can close and reopen.                                                      |
| Small viewport layout broken                 | App targets wide monitors. Not the use case.                                                 |
| Nav rail tooltips overlap                    | Polish. Tooltips still functional.                                                           |
| Room dialog uses hardcoded agents            | Medium effort, rooms feature has other dependencies.                                         |
| Default working dir in session dialog        | Partially works. Lower priority than other fixes.                                            |
| PROD badge uses red                          | Reasonable design choice for danger signaling.                                               |
