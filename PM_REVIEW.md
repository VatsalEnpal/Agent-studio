# Agent Studio -- PM Review (Brutal Honesty Edition)

**Reviewer:** QA Agent acting as PM Critic
**Date:** 2026-03-29
**App version:** 0.1.0 (dev)
**Review method:** Full source code audit + live API probing (server running on :8080)

---

## Executive Summary

This is genuinely impressive for what appears to be a developer tool built rapidly. The architecture is sound (Express + Next.js + xterm.js + WebSocket), the design system is consistent, and the feature set is ambitious. But it has the tell-tale signs of a "built by engineers for engineers" tool: dense, under-explained, and assumes you already know what everything means. Several features are stubs ("coming soon"), and the Teams view -- while visually polished -- is closer to a read-only dashboard than an actionable control panel.

**Overall Score: 3.4/5** -- Good bones, needs UX love and feature completion.

---

## 1. Sessions Mode (Default View -- Empty State) -- Rating: 4/5

**What works:**
- Clean empty state with clear call-to-action ("Launch a Claude Code session to get started").
- Keyboard shortcut hints (Cmd+N, Cmd+K) are visible and helpful.
- Three quick-start buttons (Quick Chat, Start Sprint, Continue Last) give clear entry points.
- "Start Sprint" is visually distinguished with an accent border, correctly signaling it as the primary action.
- Bottom bar keyboard hints are a nice touch for power users.

**What's broken:**
- All three quick-start buttons in the empty state call `onCreateSession` which just opens the generic launcher -- they do NOT actually launch with the preset config. "Quick Chat" and "Continue Last" should do what they say directly, not open a modal. This is misleading.
- The "Start Sprint" button in the empty state opens the same generic launcher as "Quick Chat" -- it does not apply the orchestrator preset. The user clicks expecting to start a sprint and gets a generic form.

**What's confusing:**
- Toggle bar shows "Memory" and "Settings" tabs that are grayed out with "Coming soon" on hover. These take up space and set expectations that will not be met. Either hide them or show a clear "v0.2" badge.

**What's missing:**
- No onboarding explanation of what "Sessions" even are. A new user does not know that sessions = Claude Code terminal instances.
- No indication of system requirements or whether the backend server is healthy.
- No session count limit warning -- what happens when you hit MAX_VISIBLE (6)?

**Specific improvements:**
1. Make empty-state buttons actually execute their actions (Quick Chat = instant Sonnet session, Start Sprint = instant Opus + orchestrator, Continue Last = resume most recent).
2. Add a one-line subtitle below "Agent Studio" explaining what this tool does.
3. Show a small health indicator (server connected, WebSocket status) somewhere visible.

---

## 2. Session Launcher Modal -- Rating: 4.5/5

**What works:**
- This is the best-designed component in the app. Clean layout, logical grouping, good information density.
- Resume Previous Session dropdown with search is genuinely useful and well-built (search, relative timestamps, session ID preview).
- Quick Start presets (Continue, Quick Chat, Start Sprint, Security Audit, PMO Scan) are well-chosen and well-labeled.
- Model/Agent/Permissions/Channel grid is compact and scannable.
- Footer shows a real-time summary of what will be launched ("sonnet + orchestrator (default)").
- Error state is handled with a red banner.
- "Enter" hint on the Launch button is a nice power-user touch.

**What's broken:**
- Hardcoded home directory path: `~/Code/InPipeline` is hardcoded in presets AND in the `handleCreateSession` function (line 120: `resolvedCwd = resolvedCwd.replace("~", "/Users/vatsalbhatt230813")`). This will break for any other user. This is a development shortcut that became a bug.
- The `--print` flag logic on line 189 seems wrong: when an agent is selected, it adds `--print` and the agent command as a positional arg, but then on line 201-202 the actual `args` array sent to the API ignores all of this and just sends `["--dangerously-skip-permissions", "--model", config.model]`. The agent selection appears to be partially broken.

**What's confusing:**
- "Permissions: bypass" is the default for presets but "default" is the default for manual config. Which should users choose? No tooltip explaining what bypass/default/plan/auto mean.
- "Channel: telegram" -- no explanation of what this does. Users will toggle this and wonder why nothing changed.
- The relationship between "Resume Previous Session" and the "Continue" quick-start button is unclear. One resumes a specific session, the other continues the most recent. The difference matters but is not explained.

**What's missing:**
- No validation on the Working Directory field. User can type anything and it will fail silently.
- No "favorite" or "pin" for frequently-used configurations.
- No confirmation dialog before launching an Opus session (which costs real money).
- Permissions descriptions: "bypass" sounds dangerous, "plan" and "auto" are opaque.

**Specific improvements:**
1. Add tooltips or a small description for each permission mode.
2. Validate the working directory exists before enabling Launch.
3. Detect and use actual home directory instead of hardcoding.
4. Fix the agent argument passing (lines 188-213 have conflicting logic).
5. Add a cost estimate next to model selection (e.g., "opus -- ~$0.50/task").

---

## 3. Active Sessions (Terminal Grid) -- Rating: 3.5/5

**What works:**
- xterm.js integration is properly done: real terminal emulation, scrollback, resize handling via ResizeObserver.
- Grid layout is smart: adapts from 1 to 6 panes with sensible spanning (3 sessions = 2 on top, 1 spanning bottom).
- Focused session gets a green border + ring -- clear visual indicator.
- Header bar per pane shows model badge (purple for Opus, teal for Haiku), cost, token count, and zoom controls.
- Fullscreen mode with Esc to exit is well-implemented.
- Double-click to fullscreen is discoverable.
- WebSocket reconnection banner (yellow "Reconnecting...") is a good resilience pattern.
- Real usage data from Claude session files (not mocked) adds genuine value.

**What's broken:**
- The zoom control is too small and fiddly. The font size number display (`min-w-[20px]`) is 8px text -- nearly unreadable.
- Kill button has no confirmation. One click and the session is dead. The sidebar has a two-step confirm ("Kill?"), but the terminal pane header does not. Inconsistent.
- The `handleFit` callback is listed in the `useEffect` dependency array (line 176) but does not actually need to be -- this could cause unnecessary terminal re-initialization if the function reference changes.

**What's confusing:**
- The difference between "focused" and "visible" is not explained anywhere. The sidebar shows opacity differences but the user does not know why some sessions are dimmer.
- Cost display shows "$0.00" and "0 tokens" for sessions that have not started yet -- misleading. Should show "---" or nothing.

**What's missing:**
- No session naming/renaming. All sessions are named by their agent type, leading to duplicates ("backend-worker", "backend-worker").
- No way to rearrange the grid order. The position is determined by creation order.
- No split-pane or tabbed view option. After 4 sessions, the panes become too small to read.
- No copy/paste indicator or selection feedback in terminal panes.
- No session logs/history export.

**Specific improvements:**
1. Add confirmation to kill button in terminal header (match sidebar behavior).
2. Show "---" instead of "$0.00" / "0 tokens" for sessions that have not started.
3. Allow drag-to-reorder of visible sessions.
4. Add a tab bar mode for >4 sessions instead of trying to fit everything in a grid.
5. Make zoom controls bigger or move them to a right-click context menu.

---

## 4. Sidebar -- Rating: 3.5/5

**What works:**
- Collapsible with a thin rail showing an expand icon -- good space management.
- Session group with count badges provides quick overview.
- "Running on Machine" section (process discovery) is genuinely useful -- shows Claude processes you did not start from the console.
- Git section showing branch + dirty status + changed file count is well-designed.
- Kill confirmation on running processes (two-step: X -> "Kill?") is the right pattern.
- Recent Sessions with Resume button is a power feature.
- The "Running on Machine" section shows model badge, uptime, cost, and tokens per process -- real operational data.

**What's broken:**
- Hardcoded home directory in `shortenCwd` (line 141: `/Users/vatsalbhatt230813`). Same issue as launcher.
- Hardcoded resume cwd (line 404: `/Users/vatsalbhatt230813/Code/InPipeline`). The resume feature sends a fixed working directory regardless of the original session's cwd.
- The "Folders" and "Git" sections show the same repos with different renderings. This is redundant. Folders shows "click to open in Finder, middle-click for Cursor" -- this is hidden functionality. Nobody middle-clicks.

**What's confusing:**
- Five collapsible sections (Sessions, Running on Machine, Recent Sessions, Folders, Git) is too many for a 224px sidebar. Information overload.
- The distinction between "Sessions" (managed by console) and "Running on Machine" (discovered processes) is not labeled clearly enough.
- Git "ok" badge vs file count badge -- "ok" could mean "no changes" or "everything is fine." Ambiguous.

**What's missing:**
- No search/filter for sessions when you have many.
- No session grouping by sprint vs standalone.
- No quick-action on session items (e.g., right-click menu for kill, focus, fullscreen, duplicate).
- No git diff preview on hover of dirty repos.
- Middle-click to open in Cursor is completely undiscoverable.

**Specific improvements:**
1. Merge "Folders" and "Git" into a single "Repos" section with both open-folder and branch info.
2. Add section collapsing memory (persist which sections are open).
3. Make the Cursor open action a visible icon, not a middle-click.
4. Add search bar at the top of sidebar for filtering sessions/repos.
5. Remove hardcoded paths.

---

## 5. Teams Mode (Sprint Dashboard) -- Rating: 3/5

**What works:**
- The vertical timeline design is visually clean and informative. Status dots with colored connecting lines are immediately readable.
- Step cards with status-specific styling (amber glow for waiting, blue pulse for active, green check for completed) are well done.
- Agent badges per step (color-coded: purple for orchestrator, orange for frontend, cyan for QA) add context.
- Rich content rendering (PMO scan entries, sprint specs, gate checks, handoffs, QA health scores) is genuinely impressive data density.
- The run header with progress bar, step count, agent count, and file count is a compact status summary.
- "View full spec" / "View full report" toggles prevent information overload.
- The lightweight markdown renderer handles headers, lists, and bold text for spec content.
- PMO Scheduler controls (Start/Pause/Scan Now) in the System Panel are actionable -- not just decorative.

**What's broken:**
- The action buttons in step cards (e.g., "Go", "Approve") do not appear to have click handlers that actually do anything. The button renders but `step.action` only defines `{ label, type }` -- no callback. This is a nonfunctional UI element pretending to be interactive.
- Flow sidebar hardcodes only `Rocket` as an icon (line 14: `FLOW_ICONS`). All flows will show a rocket icon regardless of the `flow.icon` value.
- The FlowSidebar `FLOW_ICONS` map only contains one entry. If the workflow data specifies any other icon string, it falls back to Rocket silently.

**What's confusing:**
- "Teams" mode does not actually show teams. It shows workflow runs. The name is misleading. "Sprints" or "Workflows" would be more accurate.
- The relationship between runs and steps is not explained. A new user clicking into Teams sees data but does not understand the sprint lifecycle.
- Step cards with "pending" status are grayed out at 50% opacity and cannot be expanded. But there is no visual indicator that they will become interactive later.
- System Panel (cost, tokens, memory, sessions, PMO scheduler) is crammed into the bottom of the flow sidebar. It is useful data but feels shoved in.

**What's missing:**
- No way to create a new workflow run from the UI.
- No way to trigger step actions (the buttons exist but do nothing).
- No real-time updates for individual steps (the WebSocket sends full workflow data, not granular step updates).
- No filtering or search across runs.
- No way to mark a failed step as retried or resolved.
- No timeline visualization (when did each step start/end relative to others?).
- No cost rollup per run (only per-session costs exist).

**Specific improvements:**
1. Rename "Teams" to "Sprints" -- it matches the actual content.
2. Wire up action buttons to actually trigger agent spawning or approvals.
3. Add a "New Sprint" button that creates a run from a template.
4. Move System Panel to its own tab or a bottom drawer, not the flow sidebar.
5. Add a Gantt-chart-style view showing step timing overlaps.
6. Show total cost per sprint run.

---

## 6. System Panel -- Rating: 3.5/5

**What works:**
- Cost Today with color-coding (green < $5, yellow < $10, red > $10) is immediately actionable.
- Token count rollup across all sessions is useful.
- Memory entry count with category breakdown on hover (corrections: 23, learnings: 50, etc.) adds depth.
- PMO Scheduler controls (Start/Pause, Scan Now) with status indicator are genuinely actionable.
- Next scan countdown timer is a nice operational detail.
- Last scan status with color-coded result (READY = green, NOT READY = red) is clear.
- Uses real data from session files, not mocked.

**What's broken:**
- The hover tooltip for memory categories uses `onMouseEnter/onMouseLeave` state management, which is fragile on touch devices and when the mouse path crosses between the trigger and the tooltip.
- PMO "Start" button calls `/api/pmo/start` but there is no feedback confirming the scheduler actually started (no toast, no status update until the next 30s poll).
- "Scan Now" button waits 5 seconds (hardcoded `setTimeout`) before refreshing status. If the scan takes longer, you see stale data.

**What's confusing:**
- "Sessions: X active" counts API sessions, but this number might not match what the sidebar shows (sidebar also counts discovered processes). Confusing if the numbers differ.
- "Cost Today" -- today relative to what timezone? The session usage files use local machine time, but this is not stated.
- PMO Scheduler "Running (every 2h)" vs "Paused" -- how does this relate to the weekend/off-hours logic in the code? The code determines schedule but the UI only shows PMO loader status.

**What's missing:**
- No cost breakdown per model (Opus vs Sonnet vs Haiku).
- No cost trend (today vs yesterday vs this week).
- No alert thresholds (e.g., "warn me when daily cost exceeds $20").
- No CPU/memory usage of the console server itself.
- No Supabase connection status (relevant for portal work).

**Specific improvements:**
1. Add a toast notification when PMO actions complete.
2. Show cost breakdown per model tier.
3. Add a "Cost this week" row.
4. Replace hover tooltip with click-to-expand for mobile compatibility.
5. Show timezone for "Cost Today".

---

## 7. Help Panel -- Rating: 2/5

**What works:**
- Clean, minimal design.
- Shows the three most important shortcuts (Cmd+N, Cmd+K, Cmd+\).
- The three-section layout (Sessions, Teams, Keyboard) is logically organized.

**What's broken:**
- Nothing is technically broken, but it is woefully thin.
- The Keyboard shortcuts section has a layout bug: the keyboard shortcuts appear inline with the Keyboard icon instead of below it (the `div` uses `flex items-center gap-3` which forces horizontal layout, making the shortcuts cramped).

**What's confusing:**
- "Click steps to expand" (in the Teams description) assumes you know what steps are.
- No explanation of what "Sessions" or "Teams" actually do conceptually.

**What's missing:**
- No link to documentation or README.
- No explanation of the agent system (what agents exist, what they do).
- No FAQ (how to kill all sessions, how to resume, how to create a PR).
- No version number.
- No "What's New" section for changes.
- This is a "quick guide" with almost no guidance.

**Specific improvements:**
1. Add a "Getting Started" section with 3-step tutorial (launch session, view output, kill session).
2. List all keyboard shortcuts in a proper table.
3. Add links to agent documentation.
4. Show current version and changelog link.
5. Add a "Report Bug" link.

---

## 8. Command Palette -- Rating: 4/5

**What works:**
- Cmd+K opens it instantly -- standard pattern, no learning curve.
- Fuzzy search across action labels and keywords works well.
- Arrow key navigation with visual selection highlight.
- "Enter" badge on selected item is helpful.
- Dynamic: includes session-specific actions (focus a particular session by name).
- Footer shows navigation hints (Up/Down, Enter, Esc).
- Memory stats are fetched and shown ("X entries in memory index").
- PMO Scan trigger is available from the palette -- good for power users.
- Clear button (X) on the search input.

**What's broken:**
- "Kill Focused Session" shows "No session focused" as description when nothing is focused, but the action is still selectable and does nothing. It should be grayed out or hidden.
- "Trigger PMO Scan" fires and forgets -- no feedback that the scan started.

**What's confusing:**
- "Memory Stats" switches to the Memory tab which shows "Coming soon." The command palette promises something the app cannot deliver.

**What's missing:**
- No recent commands history.
- No "Kill All Sessions" action.
- No "Toggle Fullscreen" action for the focused session.
- No "Open in Terminal" action to open the console's cwd in a real terminal.
- No git actions (commit, push, pull) despite git being deeply integrated in the sidebar.

**Specific improvements:**
1. Disable or hide "Kill Focused Session" when nothing is focused.
2. Remove "Memory Stats" or make it show a toast with the stats instead of switching to a dead tab.
3. Add git actions to the palette (create PR, pull, push).
4. Add "Kill All Sessions" with confirmation.
5. Add toast feedback for fire-and-forget actions like PMO Scan.

---

## 9. PR Modal -- Rating: 4/5

**What works:**
- Auto-fills source branch and title from the selected repo.
- Fetches actual branches from the repo for the target dropdown.
- Success state shows PR number and link to Azure DevOps.
- Error state with red banner.
- Disables form during creation.
- Clean layout matching the rest of the design system.
- Backdrop blur is a nice touch (only modal with it).

**What's broken:**
- Nothing appears actively broken.

**What's confusing:**
- "Create Pull Request" -- to where? Azure DevOps? GitHub? The success message says "Open in Azure DevOps" which answers it, but this should be clear upfront.
- Source branch is editable as a free text field instead of a dropdown. User could type a nonexistent branch.

**What's missing:**
- No diff preview before creating.
- No draft PR option.
- No labels or reviewers selection.
- No template for description.

**Specific improvements:**
1. Make source branch a dropdown (same as target).
2. Add "View Diff" button before creating.
3. Show repo provider (Azure DevOps) in the header.
4. Add description template with ## Summary / ## Changes sections.

---

## 10. Design System & Visual Cohesion -- Rating: 4/5

**What works:**
- Consistent dark theme with well-chosen color palette (dark grays with amber accent, green success, red error).
- The `console-*` color tokens create a professional "terminal IDE" feel.
- Font sizes are deliberately small (9-12px range) which works for a dense developer tool.
- Animations are tasteful: pulse for active states, fade for modals, spin for loading.
- Custom scrollbar styling matches the dark theme.
- Radix Dialog animations (scale + fade) are smooth.
- Toast notifications slide in from the right.

**What's broken:**
- The 8px and 9px text sizes are at the absolute minimum for readability. On non-Retina displays, this will be blurry.
- No responsive design whatsoever. At viewport widths below ~1200px, the sidebar + grid will be cramped.

**What's confusing:**
- The amber accent color is used for: the primary accent, the peak hours indicator, AND warning states (waiting steps). Three different semantic meanings for one color.

**What's missing:**
- No light theme option (not everyone works in the dark).
- No font size/density preference.
- No responsive breakpoints -- this is desktop-only by design, but at least the sidebar should collapse on smaller screens.

**Specific improvements:**
1. Distinguish warning amber from accent amber (use orange-500 for accent, amber-400 for warnings).
2. Add a minimum viewport warning.
3. Consider bumping minimum text to 10px for accessibility.

---

## Top 10 Improvements (Priority Order)

1. **Fix the empty-state quick-start buttons.** They all open the generic launcher instead of doing what they say. "Quick Chat" should launch instantly. "Start Sprint" should launch instantly. "Continue Last" should resume. This is the first thing a new user interacts with, and it is misleading.

2. **Wire up action buttons in Teams/Sprint steps.** The "Go" and "Approve" buttons render but do nothing. This makes the entire Teams view feel like a read-only dashboard when it should be a control panel. If the feature is not ready, do not show the buttons.

3. **Remove hardcoded paths.** `/Users/vatsalbhatt230813` appears in at least 4 places (session-launcher.tsx, sidebar.tsx, session-item.tsx, page.tsx). Use `os.homedir()` on the server and pass it down, or detect it at runtime. This will break for any other developer.

4. **Fix the agent argument passing.** The session launcher builds an `args` array with agent commands (lines 188-190) but then ignores it and sends a hardcoded array (lines 200-202). Agent selection via the launcher likely does not work correctly.

5. **Rename "Teams" to "Sprints" or "Workflows."** The tab says "Teams" but shows workflow runs with steps and agents. The name sets wrong expectations. Nobody looking at this thinks "teams."

6. **Expand the Help panel into a real guide.** Currently three sentences. Should have: what this tool does, how sessions work, all keyboard shortcuts, what agents are, how sprints work, link to docs.

7. **Add confirmation before killing sessions in the terminal header.** The sidebar has two-step kill confirmation, but the terminal pane header kills on single click. Given that killing a session destroys active Claude work (and costs money), this should always require confirmation.

8. **Deduplicate sidebar sections.** "Folders" and "Git" show the same repos. Merge them. Five sections in a 224px sidebar is too many. Aim for three: Sessions, Machine Processes, Repos.

9. **Add feedback for fire-and-forget actions.** "Scan Now", "Start PMO", "Trigger PMO Scan" (command palette) all fire HTTP requests with no visible confirmation. Add toast notifications.

10. **Add cost tracking per model tier and per sprint.** The System Panel shows total cost but does not break down Opus vs Sonnet spend. Since Opus costs roughly 10x Sonnet, this is critical for cost management. Also show cost per sprint run, not just per day.

---

## Bonus: Things That Are Actually Great

- **Process discovery** that finds Claude instances running outside the console -- genuinely useful operational feature.
- **Real usage data** from Claude session files (not mocked) -- model, cost, tokens per session.
- **WebSocket architecture** for real-time terminal streaming and session updates.
- **Peak hours indicator** with PT timezone and throttling explanation tooltip.
- **Rich step content** in the sprint timeline (PMO scan history, gate checks, handoffs, QA health).
- **First-visit hint** pointing at the New Session button with an arrow callout.
- **Error boundaries** wrapping every major component section.
- **PR creation flow** auto-filling from the current repo state.
- **The design system** -- consistent, professional, and appropriate for the domain.

This is a strong foundation. The core architecture decisions are right. What it needs is polish, completion of stub features, and a UX pass that considers users who did not build the tool.
