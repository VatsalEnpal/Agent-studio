# Build Context — Level 1

> ShipLoop Run 3, Phase 1: Build missing features and fix UX gaps.
> This phase runs BEFORE persona testing. Fix everything here first, then move to context.md for testing.
> The owner is asleep. Make decisions yourself. Build MORE than listed, not less.

## Project

**Name:** Agent Studio
**GitHub:** https://github.com/VatsalEnpal/Agent-studio.git
**Local:** ~/Code/AgentStudio/
**Tech:** Next.js 16, React 19, Electron 41, Express 5, xterm.js, zustand 5, node-pty, WebSocket, Radix UI, TailwindCSS 3.4, Geist Mono
**Design bible:** IDENTITY.md (dark theme, Geist Mono, amber #f59e0b accent, 4px max radius, no emoji, Bloomberg density)

## Do Not Modify

- `server/terminal-manager.ts` PTY spawn logic (security-sensitive allowlist)
- WebSocket message protocol (would break all clients)
- IDENTITY.md design system
- Zustand store structure (add to it, don't restructure)
- Electron main process lifecycle
- Never push directly to main — feature branch + PR only

## Things Working Well (don't break these)

- Terminal grid with up to 6 sessions, auto-layout
- Session launcher with presets that auto-launch
- Sprint workflow player with expandable steps and rich content
- Sidebar with git status, running processes, past sessions, PROD badge
- Keyboard shortcuts (Cmd+N, Cmd+K, Cmd+\, Cmd+Shift+1-6, Cmd+Shift+F, Esc)
- Command palette (Cmd+K)
- Settings with model defaults and system monitor
- WebSocket reconnect with exponential backoff
- Help panel with getting started guide
- Context window indicator with color coding (green/yellow at 60%/red at 80%)
- Dark/light mode toggle in top bar
- Memory tab with category filtering and CRUD

---

## FEATURE 1: Agent Creation Flow (NEW — HIGH PRIORITY)

### What exists now
A scaffold wizard (`src/components/settings/scaffold-dialog.tsx`, `server/scaffold.ts`) that bulk-generates a whole agent team at once. Or manual file editing of `.claude/agents/*.md` files. Neither is good for creating a single agent.

### What to build
A dedicated section in the app where users can create a **single** agent through a guided flow.

**Key principles:**
- Do NOT prescribe agent types — the user can ask for ANY kind of agent, not just orchestrator/frontend/backend/QA/security. Someone might want a "documentation agent" or a "database migration agent" or a "customer support agent."
- The flow should research and surface best practices for effective agent definitions: role clarity, tool access scoping, communication patterns, rules, boundaries.
- Guide users toward writing effective agents WITHOUT hardcoding one approach — different users have different projects.
- Once a user has enough agents, the app should suggest sprint configurations: "You have a frontend, backend, and QA agent — you could create a sprint pipeline like this."

**Technical context:**
- Agents are markdown files in `.claude/agents/`. Each has: role description, tools, rules, reasoning protocol.
- Server auto-discovers agents from this directory (see `server/routes/system.ts`).
- The existing scaffold wizard generates files via POST to `/api/scaffold`.

**What the UI should look like:**
- A "Create Agent" button accessible from the sidebar or a dedicated Agents section
- Step 1: What kind of agent? (free text — "I need an agent that..." NOT a dropdown of types)
- Step 2: AI-assisted agent definition — generate the .md file content based on the user's description, showing best practices for that kind of agent
- Step 3: Preview the generated agent definition, let user edit
- Step 4: Save to `.claude/agents/` — agent appears in launcher/sprint/room pickers immediately
- After creation: if user has 3+ agents, suggest sprint configurations

---

## FEATURE 2: Sprint Creation & Configuration (NEW — HIGH PRIORITY)

### What exists now
"Start Sprint" just launches an orchestrator session. The Teams tab shows sprint workflow steps but there's no UI to create/configure/edit sprints. Sprint engine (`server/workflows/sprint-planning.ts`) is hardcoded to one 8-step template. Sprints are auto-created by the PMO agent — users cannot manually create them.

### What a sprint actually is
A sprint is NOT just a session with a label. It's an automated multi-agent pipeline:
1. PMO agent runs headlessly (e.g., every 2 hours), checking for tickets
2. If enough tickets → notifies user via Telegram + Mac notification
3. User approves the sprint document
4. Orchestrator distributes work to backend, frontend, QA, security — whichever agents are needed
5. Agents build → QA tests → finds bugs → agents fix → QA retests → repeat loop
6. When passing, commits locally and leaves for user to review
7. This is recurring, automated, multi-agent — fundamentally different from a session

### Sessions vs Sprints distinction
- **Session** = Interactive. User opens Claude Code and works with it directly — chatting, coding, debugging. Like a normal CLI session.
- **Sprint** = Automated multi-agent pipeline with scheduling, approval gates, notifications, and looping QA. Runs without user interaction until an approval gate or completion.

### What to build
- A separate Sprint Configuration section where users:
  - Combine existing agents in a specific order/pipeline
  - Configure which agents run headlessly vs need approval gates
  - Configure notification channels (Telegram, Mac notifications)
  - Configure scheduling (e.g., PMO every 2 hours, or on-demand)
  - Preview what the sprint pipeline will look like before starting
  - Manually trigger a sprint (not just wait for PMO)
- Sprint should feel visually and functionally different from a session
- The existing sprint timeline/workflow player is good — keep it, but add the creation/configuration layer on top

### Current sprint-related code
- `src/components/sprints/sprints-view.tsx` — sprint list and detail
- `src/components/sprints/sprint-detail.tsx` — timeline view
- `src/components/sprints/sprint-list.tsx` — sprint listing
- `src/components/sprints/activity-log.tsx` — event log
- `src/components/sprints/agent-list.tsx` — agent status in sprint
- `server/workflows/sprint-planning.ts` — hardcoded 8-step template
- `server/routes/sprint.ts` — sprint API routes
- `server/managers/sprint-manager.ts` — sprint execution

---

## FEATURE 3: Add Dev Server from UI (MISSING)

### What exists now
`src/components/dev-servers/dev-servers-view.tsx` auto-detects running dev servers by scanning ports. Shows PID, port, command, working directory. Has refresh, search, stop, and open-in-browser buttons. But NO way to manually add a server.

### What to build
- An "Add Server" button that opens a dialog
- Fields: name, port, command to start, working directory
- Save to `.agent-studio.json` under `devServers` array (this field already exists in the config schema)
- Option to auto-start the server when Agent Studio launches
- The manually added servers appear alongside auto-detected ones

---

## FEATURE 4: In-App Guidance & Discoverability (UX GAP)

### The problem
Users don't know what features exist or how to use them. Specific gaps:
- What does the Agents section do in rooms? Unclear.
- How do I create a sprint? No UI for it.
- What are Reports? How are they generated? No explanation visible.
- How do I add a project? Have to find it in settings.
- How do I know what keyboard shortcuts exist? Help panel has them, but it's not discoverable.
- The Memory tab — what is it for? No explanation.
- Dev Servers vs System Monitor — these are different things but both in sidebar/settings, confusing.

### What to build
- **Contextual tooltips/hints** on first visit to each section — short, one-line explanation of what this section does
- **Empty states with guidance** — when a section is empty (no sprints, no rooms, no reports), show a helpful message explaining what this is and how to get started, not just "No items"
- **Feature discovery cards** — on first launch or after setup, show a brief tour of key features
- **Section headers** — each major section (Sessions, Teams, Sprints, Memory, Reports, Dev Servers) should have a one-liner subtitle explaining what it is

### Reports specifically
Reports are automation-generated summaries (see `server/index.ts` → `automationEngine.getReports()`). Each report has a summary, suggested actions, and approve/dismiss workflow. The UI exists (`src/components/reports/reports-view.tsx`) but there's no explanation of what reports are or how they get generated. Add guidance text.

---

## FEATURE 5: Git Integration in Sessions (ENHANCEMENT)

### What exists now
- Git view (`src/components/sessions/git-view.tsx`) shows branches, commits, changed files
- PR modal (`src/components/git/pr-modal.tsx`) for creating PRs
- Sidebar repos section with branch/dirty status
- Azure DevOps integration for PR API

### What's missing
- **Branch list/switcher** — users can't see all branches or switch between them from the UI
- **Branch creation** — can't create a new branch from the UI
- **PR workflow** — the PR modal exists but is it accessible from the right places? Users should be able to: see branches → create branch → make changes → push → create PR, all from within Agent Studio
- **Merge from UI** — no merge capability

### What to build
- A branches panel in the Git section showing all local and remote branches
- Branch creation button (name input → `git checkout -b`)
- Branch switching (with dirty state warning)
- The PR creation flow should be accessible from the git sidebar section, not hidden
- If possible, a simple merge UI (merge branch X into Y with confirmation)

---

## FEATURE 6: Context Window Indicator Enhancement

### What exists now
`src/components/terminal/session-stats-bar.tsx` already shows context usage as a percentage with color coding:
- Green: < 60%
- Yellow: 60-79%
- Red: ≥ 80%

### What to improve
The thresholds might need adjustment based on the owner's feedback. He mentioned:
- Yellow above 30%
- Red above 60%

Check the current thresholds in `contextColor()` in `src/lib/design-tokens.ts` and adjust if they don't match these preferences. The indicator should be visible and prominent — users need to know when they're running low on context.

---

## FEATURE 7: Demo Mode (NEW — MEDIUM PRIORITY)

### What it is
A mode that sanitizes ALL personal data for recording promo videos. When enabled:
- Replace real paths (`/Users/vatsalbhatt230813/...`) with realistic fake paths (`/Users/demo/projects/...`)
- Replace real usernames, repo names, API keys visible in terminal output
- Replace real project names with generic but realistic ones
- Should work on terminal output, sidebar labels, settings values, git info

### How to implement
- A toggle in Settings (or via keyboard shortcut)
- When active, a filter layer intercepts all displayed text and replaces patterns
- Store replacement mappings in config
- Terminal output filtering is the hardest part — need to intercept xterm output

### Not started — no code exists yet.

---

## FEATURE 8: Settings/Monitor Label Fix

### The problem
The Dev Servers view in the sidebar shows running dev servers (ports, processes). The Monitor tab in Settings shows system resources (CPU, Memory, Disk). These are different things but the owner found them confusing.

### What to fix
- Make sure the labels are crystal clear
- Dev Servers section: subtitle "Running processes and ports"
- Settings → Monitor tab: subtitle "System resources and health"
- If there's any overlap or confusion in the UI, separate them clearly

---

## Known Fragile Areas (FIX THESE)

These are documented bugs from CLAUDE.md that should be fixed:

1. **Close Room: Zombie PTY processes** — SIGTERM is sent but no wait/SIGKILL fallback. Closing a room can leave orphan processes. Fix: add timeout + SIGKILL fallback after 5s.

2. **Terminal broadcast storm** — Every terminal byte fans out to ALL WebSocket clients, not just the session owner. Fix: add session-scoped filtering so clients only receive output from their subscribed sessions.

3. **Aggressive polling** — 3s room scan + 30s usage + 10s git ≈ 100 FS reads/min. Fix: convert to event-driven where possible (file watchers for git, WebSocket events for room state). At minimum, reduce polling frequency for idle states.

4. **Room messages memory** — No client-side cap in Zustand store (server caps at 200). Fix: add a rolling window or pagination on the client side.

5. **Agent Tasks click handler** — Fires fetch but no loading/error/empty states shown. Fix: add proper loading spinner, error display, and empty state.

6. **Sprint resume UX** — Unclear how to resume a paused sprint. Fix: make resume button prominent and add confirmation.

---

## Build Prioritization

The loop should tackle these in this order:

### Must Build (blocks shipping)
1. In-app guidance & discoverability (Feature 4) — users literally can't figure out the app
2. Agent Creation Flow (Feature 1) — core value prop
3. Sprint Creation from UI (Feature 2) — core value prop
4. Git branch management (Feature 5) — essential workflow
5. Add Dev Server button (Feature 3) — simple but expected

### Should Fix (quality)
6. Known fragile areas (zombie PTYs, broadcast storm, polling, memory cap, loading states)
7. Context indicator thresholds (Feature 6) — quick fix
8. Settings/Monitor labels (Feature 8) — quick fix

### Nice to Have (if time permits)
9. Demo Mode (Feature 7) — only needed for promo video

### Do More, Not Less
If you finish the listed features and have capacity, look at the app with fresh eyes and build whatever else makes it feel complete. Common things that apps like this need:
- Onboarding tour for new users
- Contextual help (? icon on sections that explains what they do)
- Keyboard shortcut overlay (show all shortcuts when holding Cmd)
- Session templates / favorites
- Quick actions from empty states
- Better error messages (not just "something went wrong")

**The bar is: a stranger downloads this app and can figure out every feature without reading docs.** If something isn't self-explanatory, fix it.

---

## How This Loop Works

### Phase 1: Build (this file)
1. Read this context file
2. Create feature branch: `git checkout -b shiploop/run3-build`
3. Start the server in background: `npm run dev &`
4. Build features in priority order
5. After each feature: test it via Playwright MCP, verify it works, commit
6. When all features are done, write a build report to `.shiploop/reports/build-report.md`

### Phase 2: Test (context.md)
7. Read `.shiploop/context.md`
8. Run all 4 persona tests against the NOW-IMPROVED app
9. Fix any issues found during testing
10. Write evaluation and final report

### Branch Strategy
- All work on `shiploop/run3-build` branch
- Commit each feature/fix individually with descriptive messages
- **NEVER push to GitHub. NEVER run `git push`. All commits stay local.**
- Vatsal reviews the branch and pushes manually after approval

### Server & Testing
- Dev server: `npm run dev &` on port 8080
- Kill old server: `lsof -ti:8080 | xargs kill -9 2>/dev/null; sleep 1`
- Wait for ready: `for i in {1..30}; do curl -s http://localhost:8080/api/health > /dev/null 2>&1 && break; sleep 1; done`
- Test via Playwright MCP (browser_navigate, browser_click, browser_snapshot, browser_take_screenshot)
- After editing source files, the server auto-reloads (tsx watch mode)

### Quality Gates (automatic — hooks handle these)
- TypeScript type-check runs after every edit
- Prettier formats after every edit
- Related tests run after every edit
- Full tsc + build + test runs on session stop
- If any gate fails, fix the error before moving on

### THIS IS A /loop — YOU MUST KEEP IT RUNNING

You are running inside Claude Code's `/loop` mechanism. Each cycle, you do a chunk of work, then **you MUST schedule the next cycle** or the loop dies and the human is asleep.

**How to end each cycle:**
1. Commit your work
2. Update `state.json`
3. The cycle ends naturally when you finish responding — the `/loop` harness fires the next cycle automatically with the same prompt

**DO NOT just stop after finishing one feature.** The loop prompt will fire again, you'll re-read state.json, and pick up the next feature. This should run for HOURS doing one feature per cycle.

**Use subagents (the Agent tool) for heavy work.** Each subagent gets fresh context and returns a summary. This keeps your main context light so you can sustain more cycles. Examples:
- Spawn a subagent to read 10 files and report back what patterns to follow
- Spawn a subagent to build a component and return the code
- Spawn a subagent to run Playwright tests and report findings
- The main loop stays light: read state → delegate to subagent → commit result → update state → next cycle

### Cycle Discipline (IMPORTANT for sustained overnight runs)

Each `/loop` cycle has limited context. Context WILL compress between cycles. To maximize output:

1. **One feature per cycle.** Don't start two features in one cycle. Pick the next feature from `state.json`, build it fully, test it, commit it, update state.json.
2. **Commit before the cycle ends.** If context is getting heavy (lots of tool calls), commit what you have even if the feature isn't fully polished. A committed partial feature is better than an uncommitted perfect one that gets lost to compression.
3. **Write findings to disk immediately.** Don't accumulate findings in memory — write them to `.shiploop/reports/` as you go. After compression, your memory is gone but the files survive.
4. **Re-read the context file at the start of each cycle.** After compression, you may not remember the feature details. Read `context-build.md` again if you're unsure what to build next.
5. **For large features (Agent Creation, Sprint Config):** Break them into sub-steps. Cycle 1: create the component files and basic structure. Cycle 2: add the server routes. Cycle 3: wire them together. Cycle 4: test and polish. Commit after each sub-step so progress isn't lost.
6. **Use subagents for heavy work.** Spawn Agent tool calls for research, building, and testing. This is the #1 way to sustain long runs — keep the parent context light.

### State Tracking
Update `.shiploop/state.json` after every feature completion:
```json
{
  "current_phase": "building",
  "current_feature": "feature-1-agent-creation",
  "features_completed": [],
  "features_remaining": ["agent-creation", "sprint-config", "add-server", "guidance", "git-branches", "context-thresholds", "monitor-labels", "fragile-fixes"],
  "commits_made": 0,
  "on_feature_branch": true,
  "server_running": true,
  "last_updated": "ISO-8601",
  "cycle_count": 0
}
```

### Git Hook Warning
The project has `protect-files.sh` that **BLOCKS all edits on `main` branch**. You MUST be on the feature branch before editing any file. If you see "BLOCKED: Cannot edit files on main branch", run `git checkout -b shiploop/run3-build`.

### Circuit Breaker
If **3 consecutive cycles** make no meaningful progress (no new commits, no new features completed, stuck in a TypeScript error loop), write a stuck-report to `.shiploop/reports/stuck.md` explaining what you're blocked on, and stop. Do not burn API credits spinning.

### Crash Recovery on Startup
On every cycle start:
1. Read `state.json`
2. Check git branch — if on `main`, switch to `shiploop/run3-build` (create if needed)
3. Kill port 8080 if occupied: `lsof -ti:8080 | xargs kill -9 2>/dev/null`
4. Start server if not running: `npm run dev &` + wait for health
5. Continue from where state.json says you left off

### TypeScript Error Strategy
The `pre-bash-safety.sh` hook blocks `git commit` if `tsc --noEmit` fails. When building multiple features:
- Complete one feature fully (all files, all types, all imports) before committing
- If tsc fails on commit, read the errors and fix them before retrying
- Do NOT skip to the next feature while the current one has TS errors
- If stuck in a tsc error loop for more than 2 attempts, revert the problematic changes and move on

---

## Design Rules (follow IDENTITY.md)

- Background: #0a0a0a, Surfaces: #111111, Borders: #1a1a1a
- Font: Geist Mono everywhere
- Accent: Amber #f59e0b — the ONLY accent color
- Border radius: 4px maximum on EVERYTHING
- No emoji in UI text. No gradients. No shadows. No glassmorphism.
- Voice: Short, direct, terminal-native
- Density: Bloomberg Terminal — lots of info visible, no wasted space
- All new components must match existing components in visual style
- Check `src/lib/design-tokens.ts` for token values

---

## Existing Code to Reference

| Area | Files |
|------|-------|
| Session launcher | `src/components/sessions/session-launcher.tsx` |
| Scaffold wizard (pattern for multi-step) | `src/components/settings/scaffold-dialog.tsx` |
| Sprint views | `src/components/sprints/*.tsx` |
| Sprint engine | `server/workflows/sprint-planning.ts` |
| Room/team views | `src/components/teams/*.tsx` |
| Dev servers | `src/components/dev-servers/dev-servers-view.tsx` |
| Git views | `src/components/sessions/git-view.tsx`, `src/components/git/pr-modal.tsx` |
| Memory (pattern for CRUD) | `src/components/memory/*.tsx` |
| Reports | `src/components/reports/*.tsx` |
| Settings | `src/components/settings/*.tsx` |
| Help panel | `src/components/layout/help-panel.tsx` |
| Design tokens | `src/lib/design-tokens.ts` |
| Server routes | `server/routes/*.ts` |
| Config schema | `server/config-schema.ts`, `server/config.ts` |
| Stores | `src/stores/*.ts` |
| Types | `src/lib/types.ts`, `server/types.ts` |
