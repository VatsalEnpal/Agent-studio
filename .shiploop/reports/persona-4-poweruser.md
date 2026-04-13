# Persona 4: Returning Power User — QA Test Report

**Date:** 2026-04-13
**Config:** `.shiploop/persona-configs/persona-4.json` (2 projects incl PROD, agent system, dev servers, full defaults)
**Screenshots:** 23 in `.shiploop/screenshots/persona-4/`
**Interactions:** ~55

## Screenshots Taken (23 total)

| #   | File                         | Description                                        |
| --- | ---------------------------- | -------------------------------------------------- |
| 01  | `01-app-load.png`            | App load — straight to Sessions, no wizard         |
| 02  | `02-settings-general.png`    | Settings > General — model shows opus not sonnet   |
| 03  | `03-new-session-dialog.png`  | New Session dialog with defaults applied           |
| 04  | `04-settings-projects.png`   | Settings > Projects with both repos and PROD badge |
| 05  | `05-dev-servers.png`         | Dev Servers with detected processes                |
| 06  | `06-session-launched.png`    | Session launched behind Dev Servers overlay        |
| 07  | `07-session-running.png`     | Running session in terminal                        |
| 08  | `08-history-tab.png`         | History tab with past sessions                     |
| 09  | `09-session-killed.png`      | Kill session confirmation dialog                   |
| 10  | `10-after-kill.png`          | After session kill — terminal frozen, no garble    |
| 11  | `11-settings-agents.png`     | Settings > Agents showing discovered agents        |
| 12  | `12-system-monitor.png`      | System Monitor — CPU, Memory, Disk                 |
| 13  | `13-automations.png`         | Automations with PMO Scheduler running             |
| 14  | `14-shortcuts.png`           | Keyboard shortcuts reference                       |
| 15  | `15-about.png`               | About page with version and system info            |
| 16  | `16-command-palette.png`     | Command palette                                    |
| 17  | `17-memory-tab.png`          | Memory tab empty state                             |
| 18  | `18-create-memory.png`       | Create memory dialog                               |
| 19  | `19-memory-created.png`      | Memory created successfully                        |
| 20  | `20-reports-tab.png`         | Reports tab empty state                            |
| 21  | `21-sprint-create-step1.png` | Sprint creation wizard step 1                      |
| 22  | `22-teams-tab.png`           | Teams tab empty state                              |
| 23  | `23-final-sessions-view.png` | Final sessions view                                |

## Findings

### CRITICAL

**F1. History tab 404 storm (CROSS-PERSONA: 4th confirmation)**

- Category: Bug
- Screenshot: #08
- 40+ 404 errors immediately on History tab click, 150+ total during session. `/api/sessions/{id}/usage` for every historical session.

### HIGH

**F2. Settings General shows wrong default model**

- Category: Bug
- Screenshot: #02, #03
- Settings > General shows "opus" but config specifies "sonnet". New Session dialog correctly reads sonnet from config. Bug is in Settings page display reading from wrong source.

**F3. Settings General shows wrong default working directory**

- Category: Bug
- Screenshot: #02
- Shows `~/Code/InPipeline` instead of config's `/tmp/shiploop-test-project`. Settings page reads from `.settings.json` instead of `.agent-studio.json`.

**F4. Git integration unreachable from UI — dead code**

- Category: Missing Feature / Bug
- Git API endpoints (`/api/git/status`, `/api/git/branches`) work correctly and return data for both projects, but the sidebar never renders the git repos section. Fully built backend with no frontend access.

**F5. PR creation modal unreachable**

- Category: Missing Feature
- PR modal component (`pr-modal.tsx`) and git store are fully implemented but can never be opened.

**F6. Sprint dialog no Escape (CROSS-PERSONA: 3rd confirmation)**

- Category: Bug
- Screenshot: #21

### MEDIUM

**F7. Project names not displayed in Settings**

- Category: UX
- Screenshot: #04
- Only paths shown, not configured names ("staging-frontend", "production-app").

**F8. Session launch doesn't auto-switch sidebar tab**

- Category: UX
- Screenshot: #06
- Session launches behind Dev Servers overlay when Servers tab is active.

**F9. Dead terminal persists after session kill**

- Category: Bug
- Screenshot: #10
- Main area continues showing dead session's terminal output and stats bar.

**F10. Command palette missing 3 of 6 navigation options**

- Category: UX
- Screenshot: #16
- Missing: Go to Sprints, Go to Reports, Go to Settings.

**F11. Sprint working directory not pre-filled from defaults**

- Category: Bug
- Screenshot: #21
- Shows placeholder `/path/to/project` instead of config default.

**F12. No multi-project context switching**

- Category: UX / Missing Feature
- Two projects are only visible in Settings > Projects. No project switcher anywhere.

### LOW

**F13. Notification badge persists in title (CROSS-PERSONA: 3rd confirmation)**

- Category: Bug

**F14. Dev server name not shown — displays command instead**

- Category: UX
- Screenshot: #05

**F15. PROD badge uses red instead of amber accent**

- Category: Design
- Screenshot: #04

**F16. Missing ARIA descriptions on all dialogs (16+ warnings)**

- Category: Accessibility

## Cross-Persona Confirmations

| Known Issue                   | Status Under P4                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| History tab 404 storm         | **CONFIRMED (4th time)** — 150+ errors                                                  |
| Killed session garbled output | **NOT REPRODUCED** — terminal froze cleanly                                             |
| Sprint dialog no Escape       | **CONFIRMED (3rd time)**                                                                |
| Default model not respected   | **PARTIALLY CONFIRMED** — Settings shows wrong model but session dialog reads correctly |
| Notification badge persists   | **CONFIRMED (3rd time)**                                                                |

## What Worked Well

- App load speed — instant, no wizard for configured user
- Session creation flow — excellent with Quick Start shortcuts, Resume Previous, defaults pre-filled
- History tab UI — rich session history with date grouping, cost display, one-click Resume
- Kill session confirmation — proper dialog prevents accidental kills
- Memory system — full CRUD with structured fields, categories, tags, pin/edit/delete
- Settings organization — 7 well-organized tabs, System Monitor with real-time data
- Automations — PMO Scheduler running with manual scan option
- Keyboard shortcuts — all work except sprint dialog Escape
- Design consistency — dark theme, Geist Mono, amber accent, no emoji/gradients/shadows
- Config persistence — projects, agent system, dev servers all detected

## Console Errors

| Error Type                        | Count    |
| --------------------------------- | -------- |
| 404 `/api/sessions/{id}/usage`    | ~150+    |
| WebSocket connection failures     | ~15      |
| Missing DialogContent description | ~16      |
| **Total**                         | **~181** |
