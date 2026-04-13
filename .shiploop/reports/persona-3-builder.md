# Persona 3: Agent Builder — QA Test Report

**Date:** 2026-04-13
**Config:** `.shiploop/persona-configs/persona-3.json` (project + agent system, opus, bypass)
**Screenshots:** 29 in `.shiploop/screenshots/persona-3/`
**Interactions:** ~65

## Screenshots Taken (29 total)

| #   | File                                     | Description                                     |
| --- | ---------------------------------------- | ----------------------------------------------- |
| 01  | `01-dashboard-load.png`                  | Dashboard initial load                          |
| 02  | `02-settings-agents-tab.png`             | Settings > Agents tab with auto-detected agents |
| 03  | `03-agent-creation-step1-empty.png`      | Agent wizard Step 1 empty (Next disabled)       |
| 04  | `04-agent-creation-step1-filled.png`     | Agent wizard Step 1 filled                      |
| 05  | `05-agent-creation-step2-configure.png`  | Agent wizard Step 2 tools/rules                 |
| 06  | `06-agent-creation-step3-preview.png`    | Agent wizard Step 3 markdown preview            |
| 07  | `07-new-session-dialog-agent-picker.png` | New Session with agent picker                   |
| 08  | `08-session-launched-with-agent.png`     | Session launched with agent (trust prompt)      |
| 09  | `09-session-active-with-agent.png`       | Active session with Claude Code running         |
| 10  | `10-multiple-sessions-sidebar.png`       | Multiple sessions in sidebar                    |
| 11  | `11-sprints-empty-state.png`             | Sprints empty state                             |
| 12  | `12-sprint-wizard-step1-define.png`      | Sprint wizard Step 1 (Define)                   |
| 13  | `13-sprint-wizard-step2-agents.png`      | Sprint wizard Step 2 (Agents)                   |
| 14  | `14-sprint-wizard-step3-pipeline.png`    | Sprint wizard Step 3 (Pipeline)                 |
| 15  | `15-teams-empty-state.png`               | Teams empty state                               |
| 16  | `16-teams-create-room-dialog.png`        | Create Room dialog with agent picker            |
| 17  | `17-memory-empty-state.png`              | Memory empty state                              |
| 18  | `18-memory-create-dialog.png`            | Memory creation dialog                          |
| 19  | `19-memory-created.png`                  | Memory successfully created                     |
| 20  | `20-memory-detail-view.png`              | Memory detail view                              |
| 21  | `21-reports-empty-state.png`             | Reports empty state                             |
| 22  | `22-dev-servers.png`                     | Dev Servers with 2 listening ports              |
| 23  | `23-history-tab-404-errors.png`          | History tab                                     |
| 24  | `24-settings-general-persistence.png`    | Settings persistence verified                   |
| 25  | `25-command-palette.png`                 | Command palette                                 |
| 26  | `26-settings-projects-git.png`           | Projects with git branch management             |
| 27  | `27-git-branch-switched.png`             | Git branch switch                               |
| 28  | `28-shortcuts-reference.png`             | Keyboard shortcuts reference                    |
| 29  | `29-killed-session-garbled.png`          | Killed session garbled output                   |

## Findings

### CRITICAL

**F1. History tab fires 40+ 404 errors (CROSS-PERSONA: P1-F2, P2-F1)**

- Category: Bug
- Screenshot: #23
- Confirmed for 3rd time. `/api/sessions/{id}/usage` fires for every historical session, all returning 404.

**F2. Killed session shows garbled terminal output (CROSS-PERSONA: P2-F2)**

- Category: Bug
- Screenshot: #29
- Confirmed for 2nd time. Raw escape codes visible: `^[[O^[P>|xterm.js(6.1.0-beta.195)^[\^[[?1;2c`.

### HIGH

**F3. Sprint Create dialog does not close on Escape (CROSS-PERSONA: P2-F4)**

- Category: Bug
- Screenshot: #14
- Confirmed for 2nd time. Escape does nothing on Sprint Create dialog.

**F4. Agent Create dialog Escape behavior is intermittent**

- Category: Bug
- Screenshot: #06
- On Step 3 (Preview), Escape left a background overlay blocking navigation until second Escape.

**F5. Default Working Directory not applied to New Session**

- Category: Bug
- Screenshot: #07 vs #24
- Settings has "~/Code/InPipeline" as default working directory but New Session shows "~".

**F6. Title bar shows stale session name after kill**

- Category: Bug
- Screenshot: #29
- After killing all sessions, title bar still shows last killed session name.

### MEDIUM

**F7. Room dialog uses hardcoded agents, not discovered agents**

- Category: UX
- Screenshot: #16
- Shows Orchestrator/Frontend/Backend/QA/Security/PMO instead of user's discovered agents. Sprint and Session dialogs correctly use discovered agents.

**F8. 10 React accessibility warnings for DialogContent**

- Category: Bug (accessibility)
- `Missing Description or aria-describedby` warnings for all dialogs.

**F9. Branch management UX confusing — no dropdown, no confirmation**

- Category: UX
- Screenshot: #27
- Branch button cycles through branches on click with no dropdown or warning. Clicked "dev" and it immediately switched to "PROD".

### LOW

**F10. Notification badge "(3)" persists in page title**

- Category: UX
- Badge count doesn't clear after viewing sessions.

**F11. No context usage percentage visible in history sessions**

- Category: UX
- Screenshot: #23
- Cost data shown but no context percentage in session list.

## Cross-Persona Confirmations

| Known Issue                      | Status Under P3                                 |
| -------------------------------- | ----------------------------------------------- |
| History tab 404 errors           | **CONFIRMED** (3rd persona)                     |
| Default model not respected      | **NOT REPRODUCED** — opus correctly shown in P3 |
| /api/analyze-project returns 400 | **NOT TESTED**                                  |
| Killed session garbled output    | **CONFIRMED** (2nd persona)                     |
| Sprint Escape key                | **CONFIRMED** (2nd persona)                     |

## What Worked Well

- Agent auto-detection from `.claude/agents/` works correctly
- Agent creation 3-step wizard is intuitive with proper validation
- Sprint creation 3-step wizard is clean with agent count display
- New Session dialog is comprehensive with Quick Start options
- Memory CRUD cycle works flawlessly (create/read/detail/delete)
- Command palette works correctly with Escape to close
- Dev Servers correctly detects running processes with "self" label
- Room creation dialog has per-agent model pickers
- Settings persistence works for model/permissions/working directory
- Keyboard shortcuts Cmd+Shift+N and Cmd+Shift+K work
- Design consistency maintained (dark theme, amber accents, Geist Mono)
- Multiple simultaneous sessions work with correct sidebar metadata
- Git branch management display and switching works

## Console Errors

| Error Type                     | Count |
| ------------------------------ | ----- |
| 404 `/api/sessions/{id}/usage` | ~40   |
| React accessibility warnings   | ~10   |
| Application JS errors          | 0     |
