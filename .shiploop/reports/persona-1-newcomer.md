# Persona 1: Curious Newcomer — QA Test Report

**Date:** 2026-04-13
**Config:** `.shiploop/persona-configs/persona-1.json` (`setupComplete: false`)
**Screenshots:** 32 in `.shiploop/screenshots/persona-1/`
**Interactions:** ~60

## Screenshots Taken (32 total)

| #   | Path                                            | Description                                 |
| --- | ----------------------------------------------- | ------------------------------------------- |
| 001 | `persona-1/001-cold-open.png`                   | Setup wizard on first load                  |
| 002 | `persona-1/002-setup-step1-filled.png`          | Setup step 1 with text input                |
| 003 | `persona-1/003-setup-code-project-expanded.png` | Code project path field expanded            |
| 004 | `persona-1/004-setup-step2-no-agents.png`       | Step 2 shows "No agents generated" (broken) |
| 005 | `persona-1/005-main-dashboard-after-setup.png`  | Main dashboard after completing setup       |
| 006 | `persona-1/006-teams-empty.png`                 | Teams tab empty state                       |
| 007 | `persona-1/007-sprints-empty.png`               | Sprints tab empty state                     |
| 008 | `persona-1/008-memory-empty.png`                | Memory tab empty state                      |
| 009 | `persona-1/009-reports-empty.png`               | Reports tab empty state                     |
| 010 | `persona-1/010-settings-general.png`            | Settings > General                          |
| 011 | `persona-1/011-settings-projects.png`           | Settings > Projects                         |
| 012 | `persona-1/012-settings-agents.png`             | Settings > Agents                           |
| 013 | `persona-1/013-settings-system-monitor.png`     | Settings > System Monitor                   |
| 014 | `persona-1/014-settings-automations.png`        | Settings > Automations                      |
| 015 | `persona-1/015-settings-shortcuts.png`          | Settings > Shortcuts                        |
| 016 | `persona-1/016-settings-about.png`              | Settings > About                            |
| 017 | `persona-1/017-new-session-dialog.png`          | New Session dialog                          |
| 018 | `persona-1/018-command-palette.png`             | Command palette                             |
| 019 | `persona-1/019-sidebar-toggled.png`             | Sidebar toggle attempt                      |
| 020 | `persona-1/020-create-agent-step1.png`          | Create Agent wizard step 1                  |
| 021 | `persona-1/021-create-agent-step2.png`          | Create Agent wizard step 2                  |
| 022 | `persona-1/022-create-sprint-step1.png`         | Create Sprint wizard step 1                 |
| 023 | `persona-1/023-dev-servers.png`                 | Dev Servers view                            |
| 024 | `persona-1/024-add-server-dialog.png`           | Add Server dialog                           |
| 025 | `persona-1/025-tooltip-sessions.png`            | Tooltip on Sessions nav                     |
| 026 | `persona-1/026-tooltip-settings.png`            | Tooltip on Settings nav                     |
| 027 | `persona-1/027-history-tab.png`                 | History tab with sessions                   |
| 028 | `persona-1/028-small-viewport.png`              | 400px viewport (broken layout)              |
| 029 | `persona-1/029-large-viewport.png`              | 1920px viewport                             |
| 030 | `persona-1/030-after-rapid-nav.png`             | After rapid tab clicking                    |
| 031 | `persona-1/031-create-room-dialog.png`          | Create Team Room dialog                     |
| 032 | `persona-1/032-teams-agents-tab.png`            | Teams Agents sub-tab                        |

## Findings

### CRITICAL

**F1. Setup wizard `/api/analyze-project` endpoint returns 400**

- Category: Bug
- Screenshot: 004
- The core setup wizard feature is broken. When a user fills in their project description and clicks "Set me up", the API call to `/api/analyze-project` returns HTTP 400. Step 2 shows "No agents generated." The user can proceed with "Looks good — let's go" despite nothing being generated. A newcomer's first experience is a broken wizard.

**F2. History tab fires 40+ 404 errors for `/api/sessions/{id}/usage`**

- Category: Bug
- Screenshot: 027
- Clicking the History sidebar tab fires `/api/sessions/{id}/usage` for EVERY historical session, all returning 404. Generates 40+ console errors. The endpoint either does not exist or is misconfigured. Fires on every History tab visit with no caching/debouncing.

### HIGH

**F3. No back button in setup wizard step 2**

- Category: UX
- Screenshot: 004
- No way to go back from step 2 to step 1 to change the project description. Only the close X button is available.

**F4. Small viewport layout is broken**

- Category: UX
- Screenshot: 028
- At 400px width, sidebar and main content overlap. No responsive collapse or hamburger menu. App assumes minimum width ~1024px.

**F5. Nav rail tooltips overlap sidebar content**

- Category: UX
- Screenshots: 006, 007, 025, 026, 030
- Tooltips appear overlapping sidebar content area. Visually distracting and obscures content.

### MEDIUM

**F6. History sidebar session names aggressively truncated**

- Category: UX
- Screenshot: 027
- Names like "InPipel...", "AgentSt...", "pmo — I..." are barely readable.

**F7. Shortcut references in empty state are wrong**

- Category: UX
- Screenshot: 005
- Empty state says "Press Cmd+N" but actual shortcut is Cmd+Shift+N. Same for Cmd+K vs Cmd+Shift+K.

**F8. "Looks good — let's go" button should be disabled when no agents generated**

- Category: UX
- Screenshot: 004
- Wizard step 2 allows proceeding despite agent generation failure.

**F9. Sidebar toggle shortcut doesn't work**

- Category: Bug
- Screenshot: 019
- Cmd+Shift+\ has no visible effect.

**F10. Default model setting not respected in session dialog**

- Category: Bug
- Screenshots: 010, 017
- Settings > General shows "opus" as default but New Session dialog defaults to "sonnet".

### LOW

**F11. Teams "Agents" sub-tab is non-functional**

- Category: Bug
- Screenshot: 032
- Clicking Agents tab in Teams sidebar doesn't change content.

**F12. Command palette only has 5 items**

- Category: UX
- Screenshot: 018
- Missing: Go to Sprints, Reports, Settings, New Sprint, etc.

**F13. "A" monogram in nav rail has no tooltip**

- Category: UX
- No explanation for newcomers what it does.

**F14. Setup wizard lightning bolt icon is emoji-like**

- Category: Design
- Screenshot: 001
- Borders the "no emoji in UI text" guideline, though it's technically an SVG icon.

## What Worked Well

- Setup wizard disables "Set me up" correctly when text field is empty
- Create Agent wizard is well-designed with 3-step flow, proper Back button, state preservation
- Dark theme consistency is excellent (#0a0a0a everywhere)
- GeistMono font correctly applied globally
- No emoji in UI text (confirmed)
- No gradients or shadows
- Empty states are informative with helpful CTAs
- Setup persistence works — reload shows dashboard, not wizard
- New Session dialog is comprehensive
- System Monitor shows real-time data with live updates
- Keyboard shortcuts Cmd+Shift+N and Cmd+Shift+K work correctly
- Escape key correctly closes dialogs
- Tab navigation is fast with no crashes during rapid-click stress test
- Dev Servers correctly detects its own server
- Border radius is mostly controlled (only rounded-full on small status dots)
- About page shows useful diagnostic info
- Create Team Room dialog is well-structured

## Console Errors

| Error                                         | Count                      | Trigger                               |
| --------------------------------------------- | -------------------------- | ------------------------------------- |
| `400 Bad Request` on `/api/analyze-project`   | 1                          | Setup wizard "Set me up"              |
| `404 Not Found` on `/api/sessions/{id}/usage` | ~80                        | History tab (fires for every session) |
| **Total unique error types**: 2               | **Total occurrences**: ~81 |                                       |
