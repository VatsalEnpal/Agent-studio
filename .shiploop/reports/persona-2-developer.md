# Persona 2: Project Developer — QA Test Report

**Date:** 2026-04-13
**Config:** `.shiploop/persona-configs/persona-2.json` (one project, no agents, setupComplete)
**Screenshots:** 28 in `.shiploop/screenshots/persona-2/`
**Interactions:** ~65

## Screenshots Taken (28 total)

| #   | File                                   | Description                                |
| --- | -------------------------------------- | ------------------------------------------ |
| 01  | `01-app-load-dashboard.png`            | Initial dashboard load, empty state        |
| 02  | `02-new-session-dialog.png`            | New Session dialog with all options        |
| 03  | `03-session-dialog-filled.png`         | Dialog filled with test project path       |
| 04  | `04-session-launched-trust-prompt.png` | Claude Code trust prompt in terminal       |
| 05  | `05-terminal-active-session.png`       | Active terminal with Claude Code welcome   |
| 06  | `06-terminal-interaction-response.png` | Claude response to typed query             |
| 07  | `07-two-sessions-grid.png`             | Second session showing trust prompt        |
| 08  | `08-three-sessions-sidebar.png`        | Three sessions in sidebar                  |
| 09  | `09-switch-to-session1.png`            | Switched back to session 1                 |
| 10  | `10-kill-session-dialog.png`           | Kill Session confirmation dialog           |
| 11  | `11-killed-session-garbled-output.png` | Garbled escape codes after kill            |
| 12  | `12-settings-general.png`              | Settings General page                      |
| 13  | `13-settings-agents.png`               | Settings Agents page                       |
| 14  | `14-create-agent-wizard-step1.png`     | Create Agent wizard step 1                 |
| 15  | `15-create-agent-wizard-step2.png`     | Create Agent wizard step 2                 |
| 16  | `16-dev-servers.png`                   | Dev Servers panel with detected servers    |
| 17  | `17-add-server-dialog.png`             | Add Server dialog                          |
| 18  | `18-history-tab.png`                   | History tab with past sessions             |
| 19  | `19-memory-empty.png`                  | Memory tab empty state                     |
| 20  | `20-create-memory-dialog.png`          | Create Memory dialog                       |
| 21  | `21-reports-empty.png`                 | Reports tab empty state                    |
| 22  | `22-teams-empty.png`                   | Teams tab empty state                      |
| 23  | `23-create-room-dialog.png`            | Create Team Room dialog                    |
| 24  | `24-sprints-empty.png`                 | Sprints tab empty state                    |
| 25  | `25-create-sprint-dialog.png`          | Create Sprint wizard                       |
| 26  | `26-command-palette.png`               | Command palette                            |
| 27  | `27-settings-general-values.png`       | Settings showing model/permission defaults |
| 28  | `28-settings-general-final.png`        | Final settings state                       |

## Findings

### CRITICAL

**F1. History tab generates 120+ console errors (404s on /api/sessions/{id}/usage)**

- Category: Bug
- Screenshot: #18
- Opening the History tab triggers `/api/sessions/{id}/usage` for every historical session, all returning 404. With 20 sessions visible, 40+ failed requests fire immediately, growing to 120+ errors over time. Same as Persona 1 F2 — cross-persona pattern.

**F2. Killed session stays displayed with garbled terminal output**

- Category: Bug
- Screenshot: #11
- After killing a session, the main area continues displaying the dead session with raw escape sequences (`^[[O^[P>|xterm.js(6.1.0-beta.195)^[\^[[?1;2c`). No auto-navigation to active session or empty state. User must manually click elsewhere.

### HIGH

**F3. New Session dialog does not use saved default model/permissions**

- Category: Bug
- Screenshot: #02, #27
- Settings shows Default Model = "opus" and Default Permissions = "Bypass" but New Session dialog defaults to "sonnet" and "default". Cross-persona pattern (same as Persona 1 F10).

**F4. Sprint Create dialog does not close on Escape key**

- Category: Bug
- Screenshot: #25
- Escape doesn't dismiss the Create Sprint dialog. Other dialogs properly respond to Escape. Must click the X button.

**F5. No multi-session grid/split view visible**

- Category: UX
- Screenshot: #07, #08
- With multiple sessions running, clicking a session replaces the current view entirely. No side-by-side or L-shape grid layout visible. The terminal grid feature (documented as 1=full, 2=side-by-side, 3=L-shape, 4=2x2) doesn't appear to be working or accessible.

### MEDIUM

**F6. /api/analyze-project returns 400 Bad Request**

- Category: Bug
- Cross-persona pattern (same as Persona 1 F1).

**F7. Command palette lists killed sessions alongside active ones**

- Category: UX
- Screenshot: #26
- No distinction between active and killed sessions in palette. Users may try to switch to dead sessions.

**F8. No fullscreen toggle for individual sessions**

- Category: UX
- No visible fullscreen button on terminal session header.

**F9. Teams "Create Room" dialog shows hardcoded agents without agent system**

- Category: UX
- Screenshot: #23
- Shows orchestrator, frontend, backend, QA, security, PMO agents even though user has no agent system configured. Misleading.

**F10. Quick Start shows "Continue InPipeline 0m ago" — confusing time label**

- Category: UX
- Screenshot: #02
- "0m ago" timestamp is meaningless. Should show actual last activity time or be removed.

### LOW

**F11. Kill dialog uses backdrop blur (design violation)**

- Category: Design
- Screenshot: #10
- Uses `backdrop-blur-[2px]` — "no shadows" design rule might extend to blur effects.

**F12. "opus" model button uses purple/violet instead of amber**

- Category: Design
- Screenshot: #27
- Model selection uses purple for opus, inconsistent with amber-only accent rule.

**F13. Session sidebar truncates names aggressively**

- Category: UX
- Screenshot: #08
- "Test Sess..." when there's available horizontal space.

**F14. Page title badge "(2) Agent Studio" doesn't clear**

- Category: UX
- Badge count persists after viewing affected sessions.

## Tests Not Fully Completed

- **Fullscreen**: No toggle found on session terminal UI.
- **Git integration/branch management**: No git section visible in sidebar during testing. May need project with git repo properly linked.
- **Sidebar collapse**: No explicit toggle button found.

## What Worked Well

- App loads cleanly and correctly shows dashboard (not setup wizard)
- Session creation flow is well-designed with Quick Start, model/agent/permissions selectors
- Terminal rendering (xterm.js) works flawlessly — ASCII art, colored text, interactive prompts
- Terminal interaction — typing queries and getting Claude Code responses works perfectly
- Session sidebar shows useful metadata (path, uptime, model, cost) with hover actions
- Kill session confirmation dialog prevents accidental kills
- Command palette is clean and fast
- Keyboard shortcuts work (Cmd+Shift+N, Cmd+Shift+K, Escape)
- History tab shows rich session history with date grouping and Resume button
- Dev Servers correctly detects running servers with port, process name, PID, "self" label
- Add Server dialog is well-structured
- Create Agent wizard has clean 3-step flow
- Empty states are informative with clear CTAs
- Create Memory dialog has comprehensive structured fields
- Geist Mono font consistently used throughout
- Dark theme consistent with specified color palette
- Connection indicator shows green "Connected" status
- Cost tracking shows real-time token count, cost, and context percentage

## Console Errors

| Error Type                     | Count    | Details                                              |
| ------------------------------ | -------- | ---------------------------------------------------- |
| 404 `/api/sessions/{id}/usage` | ~120     | History tab polls usage for dead sessions            |
| 400 `/api/analyze-project`     | 1        | Project analysis endpoint returns Bad Request        |
| WebSocket failures             | 4        | Intermittent HMR + app WebSocket connection failures |
| **Total**                      | **~127** |                                                      |
