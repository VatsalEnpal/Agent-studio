# Project Context

> ShipLoop Run 3 — persona-based user journey testing.
> The app ships to real users soon. This run must find everything that code-level reviews missed.
> Previous runs lied about health. This run tells the truth and fixes the real problems.

## Project

**Name:** Agent Studio
**Description:** Electron desktop app — a terminal-first cockpit for running AI agent teams in parallel, with sprint workflows, team rooms, and git integration. Think "Bloomberg Terminal for AI agents."
**Who it's for:** Developers who use Claude Code CLI and want to manage multiple agent sessions, coordinate sprints across agent teams, and see everything happening at once.
**GitHub:** https://github.com/VatsalEnpal/Agent-studio.git

## Tech Stack

Next.js 16, React 19, Electron 41, Express 5, xterm.js 6.1 (WebGL + fit addons), zustand 5, node-pty, WebSocket (ws 8.18, multiplexed single connection), Radix UI (dialog, dropdown, tooltip), TailwindCSS 3.4, Geist Mono font, Playwright (already installed as dev dep).

**Key architecture details:**
- Server: Express backend at `server/index.ts` (~3K lines), routes in `server/routes/`
- Server port configurable via `PORT` env var (default 8080)
- Config file: `.agent-studio.json` in the server's working directory
- User agents: `~/.claude/agents/*.md` files (auto-discovered by server)
- Config stores: `setupComplete` boolean, projects list, defaults (model, permissions), agent system path
- WebSocket: Multiplexed single connection streams terminal I/O, git status, room messages, workflow updates
- State: zustand stores — sessions, rooms, workflows, git, settings, ui, toast, memory, reports, sprints
- API routes: `/api/sessions`, `/api/rooms`, `/api/sprint`, `/api/git`, `/api/settings`, `/api/memory`, `/api/reports`, `/api/health`, `/api/system`
- Server managers: `process-tracker.ts`, `sprint-manager.ts`, `conversation-protocol.ts`, `message-filter.ts`
- Server services: `dev-servers.ts` (port scanning), `process-discovery.ts` (external Claude process detection), `session-usage.ts` (cost tracking), `git-status.ts`

## Complete Feature Inventory (everything that MUST be tested)

### 1. Sessions (core feature)
- **Session launcher** (Cmd+N): Modal with presets (Quick Chat, Start Sprint, Security Audit, PMO Scan) and manual config (model selector, agent picker, permissions dropdown, working directory, resume previous session toggle, custom flags text input)
- **Preset buttons**: Quick Chat, Start Sprint, Security Audit, PMO Scan — each should auto-fill different configs and launch immediately
- **Terminal grid**: 1-6 sessions visible simultaneously in auto-layout (1=full, 2=side-by-side, 3=L-shape, 4=2x2, 5-6=2x3). Each pane shows: colored status dot, session name, model badge, cost badge, context usage %, zoom controls (+/-), fullscreen button, kill (x) button
- **Terminal interaction**: Type into terminal, see output, scroll history, copy text, paste text
- **Session sidebar**: Grouped into SPRINT TEAM vs STANDALONE, each entry shows status/cost/model, resume and kill buttons
- **Background sessions**: When >6 sessions exist, extras run in background with indicators in sidebar
- **Running on Machine section**: Auto-discovers Claude processes running outside Agent Studio (via ps aux polling), shows uptime/model/cost, can kill or resume them

### 2. Teams & Rooms
- **Create Room dialog**: Room name text input, topic/goal textarea, agent picker (checkboxes with per-agent model dropdown), orchestrator always locked on (checkbox disabled)
- **Room list**: All created rooms with status, agent count, last message preview
- **Room Chat**: Message list showing sender agent name + avatar, message content, timestamps, @mentions highlighted. Approval request cards with Approve/Reject buttons. Agent status indicators (offline/idle/working/waiting approval)
- **Room controls**: Start room, stop room, clear chat
- **Agent click → session**: Clicking an agent's name in chat should navigate to that agent's terminal session
- **Typing indicators**: Shows when an agent is generating a response
- **Flow sidebar**: Shows the workflow/chain of steps in the room
- **Step timeline**: Vertical timeline of workflow steps with status badges
- **Step cards**: Expandable cards with details and action buttons ("Go", "Approve")
- **System panel**: System-level information about the room

### 3. Sprints
- **Create Sprint dialog**: Goal text input, model picker dropdown, agent multi-select (orchestrator always locked on)
- **Sprint list**: All sprints with status, agent badges, progress indicator
- **Sprint detail/timeline**: Vertical timeline of workflow steps — each step shows status (pending/active/completed/failed), agent badges, PMO scan results, gate checks, handoff cards
- **Step cards in sprint**: Expandable with details, action buttons ("Go", "Approve")
- **Sprint controls**: Pause button, resume button, cancel button
- **Activity log**: Timestamped log of sprint events
- **Agent list in sprint**: Shows participating agents with their current status

### 4. Dev Servers (sidebar tab)
- **Port scanning**: Auto-detects dev servers running on common ports (3000, 8080, 5173, etc.)
- **Server list**: Shows PID, port, command, working directory, name, running status
- **Self-detection**: Marks Agent Studio's own server with "isSelf" flag
- **Stop server**: Kill button per server
- **Open in browser**: External link button to open `localhost:{port}`
- **Refresh**: Manual refresh button
- **Search**: Filter servers by name/port

### 5. Memory (full tab)
- **Memory list**: All stored memories with category badges (learnings, corrections, decisions, human-inputs, knowledge)
- **Category filter**: Filter bar with All / Learnings / Corrections / Decisions / Human Inputs / Knowledge tabs
- **Search**: Text search across memory entries
- **Memory detail**: Click a memory to see full content (observation, action, outcome, lesson, tags, timestamps)
- **Create memory**: Plus button → form dialog (title, category, content fields)
- **Edit memory**: Edit button on detail view → pre-filled form dialog
- **Delete memory**: Trash button → confirmation dialog
- **Date extraction**: Shows dates parsed from memory filenames

### 6. Reports (full tab)
- **Report list**: All generated reports with metadata cards
- **Report detail**: Click to see full report content
- **Refresh**: Manual refresh
- **Empty state**: What appears when no reports exist
- **Agent system dependency**: Some features require an agent system to be configured

### 7. Settings (full section with tabs)
- **General tab**: Default model dropdown (opus/sonnet/haiku), default permissions dropdown (bypass/default/plan/auto)
- **Workspace tab**: Project paths list (add/remove), agent system config path, "Create Agent System" button → scaffold dialog
- **Shortcuts tab**: Keyboard shortcut reference table
- **Monitor tab**: System resources display, PMO scheduler controls
- **Automations tab**: Automation configuration
- **PMO tab**: PMO-specific settings
- **Notifications tab**: Notification preferences
- **About tab**: Version info, credits

### 8. Scaffold Dialog (Agent System Creation)
- **Multi-step wizard flow**: Select agents → workflow type (sprint/simple/custom) → automation options (telegram, scheduler) → review → create
- **Agent selection**: Checkboxes for each agent type (orchestrator, frontend, backend, QA, etc.)
- **Creates files**: `.claude/agents/` structure with generated agent definition `.md` files
- **Server call**: POST to scaffold API which generates the files on disk

### 9. Git Integration
- **Repos section in sidebar**: Auto-detected git repos from configured project paths
- **Repo display**: Branch name, dirty/clean status, changed file count, last commit
- **Git status modals**: Detailed status view per repo
- **PR creation modal**: Source branch dropdown, target branch dropdown, title (auto-filled from last commit), description textarea, prod safety confirmation checkbox
- **Azure DevOps integration**: PR creation via Azure DevOps API

### 10. Setup Wizard (First Run)
- **Multi-step onboarding**: Welcome → Projects (add project paths) → Agent System (configure or skip) → Agent Team (select agents) → Workflow (sprint/simple/custom) → Automation (telegram, scheduler) → Preferences (model, permissions) → Review → Done
- **Can be skipped**: Skip button available on each step
- **Saves config**: Writes `.agent-studio.json` on completion
- **Re-runnable**: Should be accessible from settings even after initial setup

### 11. Command Palette (Cmd+K)
- **Search**: Type to search sessions and actions
- **Actions**: Quick access to common operations
- **Navigation**: Jump to sessions, rooms, settings

### 12. Keyboard Shortcuts (ALL must be tested)
- Cmd+N: New session launcher
- Cmd+K: Command palette
- Cmd+\: Toggle sidebar
- Cmd+1 through Cmd+6: Focus session by grid position
- Cmd+Enter: Fullscreen focused session
- Esc: Exit fullscreen / close modals
- Tab: Cycle between panes

### 13. Layout & Navigation
- **Nav rail**: Left icon rail (Sessions, Teams, Sprints, Dev Servers, Memory, Reports, Git)
- **Sidebar**: Collapsible, shows context for current tab
- **Toggle bar**: Switch between main content areas
- **Top bar**: App title, global actions
- **Bottom bar**: Status information, connection status
- **Connection banner**: Shows WebSocket connection state, reconnection attempts

### 14. UI Infrastructure
- **Toast notifications**: Success/error/info toasts
- **Error boundary**: Catches React crashes, shows fallback UI
- **Empty states**: What appears when lists are empty (sessions, rooms, sprints, memory, reports)
- **Loading states**: Skeletons/spinners during data fetches
- **Confirm dialogs**: Destructive actions require confirmation
- **Error banners**: Server errors, connection failures

## The 4 User Personas

Each persona represents a real type of person who would download this app. They have different starting points, different goals, and different expectations. Each persona tests in **complete isolation** — separate config, separate state, as if on a different machine.

### Persona 1: The Curious Newcomer
**Who:** A developer who saw Agent Studio on GitHub/Twitter. They use VS Code and terminal daily but have never used Claude Code CLI. They don't know what "agents" are in this context. They might not even have Claude Code installed.
**Starting point:** Empty machine config. No `.claude/`, no `.agent-studio.json`, no relevant projects.
**What they want to do:** Figure out what this app is, whether it's useful for them, and get SOMETHING working. They'll judge the app in the first 2 minutes.
**What good looks like:** The app explains itself. The setup wizard guides them. They can launch a session and see something happen even without agents. They understand the value proposition.
**What bad looks like:** Blank screen with no guidance. Buttons that don't work. Jargon they don't understand. Having to read docs to figure out basic navigation.

**Must test these specific flows (minimum):**
1. Cold open — what's on screen? Is there guidance?
2. Setup wizard — every step, skip button, back button, invalid inputs, empty inputs
3. Navigate to EVERY tab — what does each show when empty?
4. Try to create a session without any agents configured
5. Try to create a room without agents
6. Try to create a sprint without agents
7. Open every settings tab — are defaults sensible?
8. Try keyboard shortcuts — do they all work?
9. Command palette — what's available?
10. Help panel — is it useful?
11. Resize window to very small (800x400) and very large (2560x1440)
12. Rapid-click navigation between tabs
13. Open and close every modal rapidly
14. Type very long text in every text input (500+ chars)
15. Try empty submissions on every form
16. Check every tooltip and hover state
17. Try to use the scaffold dialog to create an agent system from scratch
18. Check what "Running on Machine" shows when nothing is running
19. Look at git section with no repos configured
20. Check error states — disconnect from server, API failures

### Persona 2: The Project Developer
**Who:** A developer with an active project. They've installed Claude Code and used it a few times from the terminal. They want to try Agent Studio because managing Claude Code sessions in separate terminal tabs is getting messy.
**Starting point:** Has a project directory with git, package.json, source files. Has Claude Code installed. No `.claude/agents/` — they've been using Claude Code without agents. No Agent Studio config.
**What they want to do:** Point Agent Studio at their project. Launch a Claude session against it. Maybe create their first agent. See if the multi-session view is actually useful.
**What good looks like:** The app detects their project. They can launch a session pointed at their codebase. The scaffold dialog helps them understand and create their first agents. The terminal grid shows them something they couldn't get from plain terminal tabs.
**What bad looks like:** The app doesn't know about their project. Agent creation is confusing. They can't figure out how to point a session at their working directory. The value over terminal tabs isn't clear.

**Must test these specific flows (minimum):**
1. Setup with a real project path — does the app detect it?
2. Launch a session pointing at their project directory
3. Interact with the terminal — type commands, see output, scroll
4. Launch a SECOND session — does the grid layout work?
5. Launch 3, 4, 5, 6 sessions — do layouts adapt correctly?
6. Launch a 7th session — does it go to background correctly?
7. Focus/unfocus sessions by clicking, by Cmd+number
8. Fullscreen a session, exit fullscreen
9. Kill a session — does the grid reflow?
10. Use the scaffold dialog to create their first agent system
11. After scaffolding, check if agents appear in the session launcher
12. Create a room with their new agents
13. Try the git integration — does it show their repo's status?
14. Try PR creation flow (even if it won't actually create the PR)
15. Check dev servers — are any detected?
16. Open/close sidebar while sessions are running
17. Check session cost and context tracking
18. Resume a killed/ended session
19. Try zoom controls (+/-) on terminal panes
20. Copy text from terminal output

### Persona 3: The Agent Builder
**Who:** A developer who's already set up Claude Code agents. They have an orchestrator, frontend agent, QA agent — 3-5 agents. They've been running sprints from the CLI and want a visual interface.
**Starting point:** Has `.claude/agents/` with real agent .md files. Has projects configured. Has used Claude Code enough to understand agents, sessions, and the CLI.
**What they want to do:** See their agents in a visual cockpit. Launch a sprint and watch agents work in parallel. Use Teams/Rooms to coordinate agent work. Create a new agent through the UI. See cost and status across all sessions.
**What good looks like:** Their agents are auto-detected and appear in the launcher. Sprint creation is smooth. The grid shows all agent sessions simultaneously. Room chat lets them see agent-to-agent communication.
**What bad looks like:** Agents aren't detected. Sprint creation is just "launch one session." Sprint timeline doesn't show real progress. Room chat is broken. Action buttons don't work.

**Must test these specific flows (minimum):**
1. Verify agents are auto-detected from `.claude/agents/`
2. Launch a session with a specific agent selected
3. Launch multiple sessions with different agents — see them in the grid
4. Create a sprint — set goal, pick agents, launch
5. Watch sprint timeline update as work progresses
6. Test sprint pause, resume, cancel buttons
7. Check sprint step cards — do "Go" and "Approve" buttons ACTUALLY work? (they were broken before)
8. Create a room — set topic, pick agents, start
9. Send a message in room chat
10. Watch for agent responses in room (wait for actual responses, don't just check render)
11. Click an agent name in chat — does it navigate to their terminal?
12. Check agent status indicators — do they change between offline/idle/working/waiting?
13. Test the typing indicator — does it appear during generation?
14. Create a second room while the first is active
15. Switch between rooms
16. Test flow sidebar and step timeline in rooms
17. Launch 6 concurrent sessions and monitor all of them
18. Check total cost aggregation across all sessions
19. Check context usage warnings — do they fire before hitting limits?
20. Test the activity log in sprints — is it accurate?
21. Run a sprint and a standalone session simultaneously
22. Check memory tab — create, edit, delete memories during a sprint
23. Check reports tab after a sprint completes

### Persona 4: The Returning Power User
**Who:** Someone who's been using Agent Studio for a week. They have it configured, they have preferences, they have history. They're opening it for their daily work session.
**Starting point:** Full `.agent-studio.json` config (setupComplete: true, projects, defaults set). Has `.claude/agents/` with 5+ agents. Has session history. Has used rooms and sprints before.
**What they want to do:** Get to work fast. Resume where they left off. Launch their usual sprint configuration. Check on running processes. Create a PR for work done yesterday. Manage multiple concurrent tasks.
**What good looks like:** The app remembers their setup. They can resume sessions. Launching common configs is fast. The sidebar gives quick overview. PR creation is smooth.
**What bad looks like:** Settings reset. History is empty. Has to reconfigure everything. App feels like first install every time.

**Must test these specific flows (minimum):**
1. Open app — are settings and config preserved?
2. Check if default model and permissions are remembered
3. Check "Recent" section in sidebar — does it show history?
4. Resume a previous session
5. Check "Running on Machine" — are external Claude processes detected?
6. Launch their daily sprint with preferred agents
7. While sprint is running, launch a standalone session for a side task
8. Switch between sprint view and standalone session rapidly
9. Create a PR from the git section — full flow through the modal
10. Change a setting, restart the app, verify it persisted
11. Test dev servers section — verify port detection works
12. Open agent Studio, resize to different sizes, check responsiveness
13. Test all keyboard shortcuts while sessions are running
14. Open command palette while in different views
15. Check memory view — search, filter by category, create new entry
16. Check reports view — are past reports accessible?
17. Test notification system — do toasts appear for events?
18. Test error recovery — what happens after server disconnect + reconnect?
19. Kill all sessions at once — does the UI reset cleanly?
20. Re-run setup wizard from settings — does it preserve existing config?
21. Delete a project path from settings, re-add it
22. Test monitor tab — system resources display

## Interaction Depth Per Persona

Each persona must register at minimum **750 interactions** (clicks, keypresses, form fills, navigations, scrolls, hovers) and capture at minimum **150 screenshots** documenting what they see at every meaningful state change.

If you finish the obvious flows and haven't hit 750 interactions, go deeper:
- Try double-clicking everything
- Try right-clicking (context menus?)
- Try dragging things (can panes be reordered?)
- Try browser back/forward
- Try rapid tab switching (20+ switches in 5 seconds)
- Try submitting forms with only whitespace
- Try extremely long text in every input (1000+ chars)
- Try special characters in names (emoji, unicode, quotes, slashes, dots)
- Try opening the same modal twice rapidly
- Try actions in unexpected order (kill session before it starts, approve step that's already done)
- Try to break the WebSocket — what happens when connection drops?
- Check every empty state — does each view have a helpful empty state?
- Check every loading state — are there proper loading indicators?
- Check every error state — what does the user see when things go wrong?
- Resize the window to extreme dimensions during operations
- Try to use the app while a large number of sessions are running

A real user will do things you didn't expect. Think about what a bored tester with nothing to lose would try.

## What "Evaluating Findings" Means

After running all 4 personas, you'll have a mountain of data — screenshots, console errors, broken flows, confusing UI, things that worked well. You need to THINK about this, not just list bugs.

Figure out what expertise and perspectives you need to evaluate properly. Maybe you need product management thinking (what would make a user give up?). Maybe you need Mac app design conventions (does this feel native?). Maybe you need UX research methodology (how do you categorize usability issues?). Maybe you need senior frontend engineering judgment (is this a real bug or a cosmetic thing?). Research and apply whatever is needed — don't just use a generic checklist.

The evaluation must answer:
- What are the **top 20 issues** that would make a real user give up, get confused, or lose trust?
- What's actually working well? Acknowledge the good stuff explicitly.
- Which findings are real problems vs. polish vs. not worth fixing?
- Are there cross-persona patterns? (e.g., "all creation flows missing validation", "empty states are consistently unhelpful", "keyboard shortcuts don't work in modals")
- What surprised you? Things you didn't expect to find?
- What's the honest health score? Not what you want it to be — what it IS.
- For each issue: severity (critical/high/medium/low), category (UX/bug/design/missing feature), effort to fix, and whether it blocks shipping

## Autonomous Operation — No Human in the Loop

This loop runs overnight with no human present. You must make all decisions yourself.

After testing all 4 personas and writing the evaluation:
1. Write per-persona reports to `.shiploop/reports/`
2. Write the cross-persona evaluation with honest health score
3. Decide YOURSELF what to fix and what to skip. Use these criteria:
   - **Fix:** Anything that blocks a persona from completing a core task, causes visible broken UI, or makes the app feel unfinished
   - **Fix:** Anything flagged by previous runs that is STILL broken (these are embarrassing — fix them)
   - **Skip:** Pure polish that doesn't affect understanding or usability
   - **Skip:** Features that would require significant new architecture (flag for Vatsal but don't build)
   - **Skip:** Things that only matter in Electron packaging (we're testing the web app)
4. Write `proposed-fixes.md` explaining what you chose and WHY
5. Proceed immediately to fixing — do not wait for approval
6. After fixing, verify each fix by re-testing the relevant persona flow
7. Write `final-report.md` with health before/after, what was fixed, what was skipped and why

**Your judgment call replaces human approval.** Be conservative with scope (fix real problems, don't redesign the app) but aggressive with quality (if it's broken, fix it properly, don't patch it).

## What Previous Runs Got Wrong

Previous ShipLoop runs claimed health 100, but they were grading their own work. Specific things they missed or lied about:

- **Border radius:** Claimed 4px max compliance but rounded-full, rounded-lg, rounded-xl are all over the codebase (73+ instances). Toggles, pills, spinners, filter chips all violate.
- **Sprint action buttons:** "Go" and "Approve" buttons in sprint step cards render but don't actually do anything when clicked. Were flagged but never fixed.
- **Preset buttons:** The 4 preset buttons in the session launcher (Quick Chat, Start Sprint, etc.) all just open the generic launcher instead of auto-launching their preset configuration.
- **Hardcoded paths:** `/Users/vatsalbhatt230813` is hardcoded in sidebar.tsx and session-launcher.tsx. Would break for any other user.
- **Help panel:** Contains 3 sentences. Essentially useless.
- **Cycle count inflation:** Claimed "16 cycles" when health.json only had 8 recorded runs. Counted individual brain dispatches as cycles.
- **Self-grading bias:** The builder rated its own work as "fixed." Separated evaluation is mandatory — the entity that evaluates cannot be the entity that coded the fix.

These are exactly the kinds of things code-level reviews miss but real user testing catches. This run must not repeat these mistakes. **If something is broken, say it's broken. If something renders but doesn't work, that's WORSE than not rendering at all.**

## How to Handle Code Changes

**CRITICAL: You must be on a feature branch before editing ANY source file.** The project has a git hook (`protect-files.sh`) that BLOCKS all edits on the `main` branch. If you try to edit a file on main, the hook will reject it.

**Before any code changes:**
```
git checkout -b shiploop/run3-fixes
```

- Work directly in ~/Code/AgentStudio/ on the feature branch. All source code changes happen here.
- Commit every fix individually with descriptive messages.
- **NEVER push to GitHub. NEVER run `git push`. All commits stay local.** Vatsal will review the branch and push manually after he approves. This is a hard rule — no exceptions, no "just this once."
- After fixing, re-run the relevant persona test(s) to verify the fix actually works for real users.
- Track which persona test(s) verified each fix.
- The project has quality hooks that run after edits (TypeScript type-check, formatting, related tests). These are helpful — if they flag errors, fix them before moving on.

## Design Identity (evaluate against this)

- Background: #0a0a0a, Surfaces: #111111, Borders: #1a1a1a
- Font: Geist Mono everywhere, no other fonts
- Accent: Amber #f59e0b — the ONLY accent color
- Border radius: 4px maximum on EVERYTHING (this was violated last run — check every component)
- No emoji in UI text. No gradients. No shadows. No glassmorphism.
- Voice: Short, direct, terminal-native. Not chatty, not corporate.
- Density: Bloomberg Terminal level — lots of info visible, not wasted space
- Every interactive element must have visible hover/focus states
- Loading states must be visible (no blank screens during fetches)

## Health Score Rules

`score = ((total_checks - critical*4 - high*2 - medium*1) / total_checks) * 100`

- **Target: 100.** Not 98, not 99. The loop runs until every real issue is resolved.
- The score must be HONEST. If you find 5 critical issues, the score is low. Period.
- Critical = blocks a persona from completing their core task
- High = causes confusion, data loss, or significant UX friction
- Medium = cosmetic issues, minor inconsistencies, polish
- Low = nitpicks (don't count against score)
- Issues flagged by previous runs that are STILL present count double severity

## Deliverables

When done, these MUST exist in ~/Code/AgentStudio/.shiploop/reports/:
- `persona-1-newcomer.md` — Full journey report with screenshots and findings
- `persona-2-developer.md` — Full journey report with screenshots and findings
- `persona-3-builder.md` — Full journey report with screenshots and findings
- `persona-4-poweruser.md` — Full journey report with screenshots and findings
- `evaluation.md` — Cross-persona analysis, patterns, honest health score, prioritized issue list
- `proposed-fixes.md` — What to fix, what to skip, why, estimated effort per fix
- `fixes-applied.md` — What was fixed, how each fix was verified, which persona test confirmed it
- `final-report.md` — Summary: health before/after, what shipped, what's left, where the code is

## Run History

**Run 1:** Health 78 → 100 (self-graded). 54 code-level issues found and fixed. But health score was self-graded — real health was lower.
**Run 2:** Polish pass. Some fixes applied. Partial results. Never completed full persona testing.
**This run (Run 3):** First time testing as real users in isolated environments. The goal: find everything that self-grading missed, fix it autonomously, and verify through real user journeys. No lies, no inflated scores, no marking broken things as fixed.

---

## Loop Infrastructure (READ THIS — it prevents the loop from breaking)

### Starting the App Server

The dev server command is `npm run dev` which runs `tsx server/index.ts` on port 8080. This is a **blocking** command — it will occupy the shell forever. You MUST run it in the background:

```bash
npm run dev &
```

Then wait for port 8080 to be ready before navigating to the app:
```bash
# Wait for server to be ready
for i in {1..30}; do curl -s http://localhost:8080/api/health > /dev/null 2>&1 && break; sleep 1; done
```

The app is then available at `http://localhost:8080`. Navigate there with Playwright MCP.

If port 8080 is already in use (from a previous cycle), kill the old process first:
```bash
lsof -ti:8080 | xargs kill -9 2>/dev/null; sleep 1
```

### Browser Testing via Playwright MCP

You have Playwright MCP configured (`.mcp.json`). Use these MCP tools to interact with the app:
- `mcp__playwright__browser_navigate` — go to URLs
- `mcp__playwright__browser_click` — click elements
- `mcp__playwright__browser_type` — type text into inputs
- `mcp__playwright__browser_snapshot` — get accessible page snapshot (use this to see what's on screen)
- `mcp__playwright__browser_take_screenshot` — capture screenshot to file
- `mcp__playwright__browser_press_key` — press keyboard shortcuts
- `mcp__playwright__browser_select_option` — select dropdown values
- `mcp__playwright__browser_hover` — hover over elements
- `mcp__playwright__browser_wait_for` — wait for elements to appear
- `mcp__playwright__browser_console_messages` — check for JS errors
- `mcp__playwright__browser_tabs` — manage browser tabs
- `mcp__playwright__browser_resize` — resize browser window

**Important:** After every significant action, take a `browser_snapshot` to see what changed. Don't assume clicks worked — verify.

### Screenshot Storage

Save all screenshots to `.shiploop/screenshots/` organized by persona:
```
.shiploop/screenshots/
  persona-1/001-cold-open.png
  persona-1/002-setup-wizard-step1.png
  ...
  persona-2/001-project-setup.png
  ...
```

Use sequential numbering with descriptive suffixes. Reference screenshots in reports using relative paths.

### State Tracking (Crash Recovery)

After every significant milestone, update `.shiploop/state.json`:
```json
{
  "current_phase": "testing|evaluating|fixing|verifying",
  "current_persona": 1,
  "persona_status": {
    "1": "complete|in_progress|not_started",
    "2": "not_started",
    "3": "not_started",
    "4": "not_started"
  },
  "findings_count": 0,
  "screenshots_count": 0,
  "health_score": null,
  "fixes_applied": 0,
  "on_feature_branch": false,
  "server_running": false,
  "last_updated": "ISO-8601 timestamp",
  "cycle_count": 0,
  "notes": "free-form notes about current state"
}
```

On each cycle start, read this file to figure out where you left off. If the file doesn't exist, you're starting fresh.

### Persona Isolation via Config Swapping

Each persona needs different app configuration to simulate their experience. Pre-built configs are in `.shiploop/persona-configs/`. Test fixture project directories exist at `/tmp/shiploop-test-project/` and `/tmp/shiploop-test-project-2/` (pre-created with git init, package.json, and test agent files).

**Config swap procedure — follow exactly:**

1. Back up the current config ONCE at the start (before persona 1): `cp .agent-studio.json .shiploop/config-backup.json`
2. Before each persona: `cp .shiploop/persona-configs/persona-N.json .agent-studio.json`
3. Restart the server (kill port 8080, re-launch `npm run dev &`, wait for health)
4. Test the persona
5. **After EACH persona** (not just at the end): restore the real config: `cp .shiploop/config-backup.json .agent-studio.json`

This restore-after-each pattern means that if the loop crashes mid-testing, the worst case is the real config being one of the persona configs — but `.shiploop/config-backup.json` always has the original. If you ever find `.agent-studio.json` has `/tmp/` paths in it on startup, restore from backup first.

**Do NOT touch `~/.claude/agents/`** — those are real agent files and must not be modified or deleted. All personas test with whatever agents exist there. For Persona 1 (newcomer), the config has no `agentSystem` path, so the app won't auto-discover agents — but the `~/.claude/agents/` files will still exist on disk. Note this gap in the report but don't try to delete real files.

### Git Hooks Awareness

The project has these git hooks (they fire automatically, you don't invoke them):
- **Before every Bash command:** Blocks force push, reset --hard, push to main, rm -rf, DROP/TRUNCATE
- **Before every Edit/Write:** Blocks edits on `main` branch (you MUST be on a feature branch), blocks edits to .env, .key, lock files
- **After every Edit/Write:** Auto-formats with Prettier, runs ESLint --fix, runs related tests, runs TypeScript check. These are advisory — they warn but don't block
- **On session Stop:** Runs full quality gates (tsc + build + test) if source files were changed. 180s timeout. This is good — free quality verification.

### Context Management for Long Runs

Each persona journey is heavy on tool use (screenshots, snapshots, clicks). Context WILL compress during long runs. To handle this:
- Write findings to `.shiploop/reports/persona-N-*.md` incrementally, not all at the end
- Update `state.json` after every significant milestone
- After each persona completes, write their full report to disk BEFORE starting the next persona
- If you lose track of what was tested, read the persona report files and state.json to reconstruct

### THIS IS A /loop — YOU MUST KEEP IT RUNNING

You are running inside Claude Code's `/loop` mechanism. Each cycle, you do a chunk of work, then the cycle ends naturally and the harness fires the next one with the same prompt. **DO NOT just stop after one persona.** The loop fires repeatedly — you do one chunk per cycle, the loop continues.

**Use subagents (the Agent tool) for ALL heavy work.** Each subagent gets fresh context and returns a summary. This keeps your main context light so you can sustain dozens of cycles. Examples:
- Spawn a subagent to run one persona's browser testing (100+ interactions) and write the report
- Spawn a subagent to evaluate findings across personas
- Spawn a subagent to implement a fix and test it
- The main loop stays light: read state → delegate to subagent → save result → update state → cycle ends → next cycle fires

### Cycle Discipline (IMPORTANT for sustained overnight runs)

Each `/loop` cycle has limited context. To maximize quality across 50+ cycles:

1. **One persona per cycle** (or one major chunk of a persona). Don't try to cram all 4 personas into one cycle.
2. **Delegate to subagents.** Spawn an Agent to do the actual browser testing. The Agent returns findings, you write them to the report file.
3. **Write the persona report to disk before the cycle ends.** After compression, your detailed findings are gone — the report file is the only record.
4. **For the evaluation/fixing phases:** One fix per cycle. Fix it, test it, commit it, update state.json.
5. **Re-read context.md at the start of each cycle if you're unsure what to do.** The state.json tells you WHERE you are; the context.md tells you WHAT to do.
6. **Take screenshots aggressively.** Screenshots survive compression. Your memory of what you saw does not.

### Interaction Counting

The 750 interactions per persona is a TARGET for depth, not a hard gate. Quality matters more than count. But if you finish the obvious flows in 200 interactions, you haven't gone deep enough. Keep testing until you've exercised every feature path, every edge case you can think of, and several things that might break. Track interaction count in `state.json` for honesty.

### Circuit Breaker

If **3 consecutive cycles** make no meaningful progress (no new commits, no new features completed, no new persona completed, no new findings written to reports), write a stuck-report to `.shiploop/reports/stuck.md` explaining what you're stuck on, and stop the loop. Do not burn API credits spinning on the same problem. A stuck report is a valid deliverable — it tells Vatsal what to unblock.

### Crash Recovery on Startup

On every cycle start, before doing anything else:
1. Read `state.json` — check current phase and progress
2. Check which git branch you're on (`git branch --show-current`)
3. If on `main`, switch to or create the feature branch
4. Check if `.agent-studio.json` has `/tmp/` paths (sign of crash during persona swap) — if so, restore from `.shiploop/config-backup.json`
5. Check if port 8080 is responding — if not, start the server
6. Then continue from where state.json says you left off
