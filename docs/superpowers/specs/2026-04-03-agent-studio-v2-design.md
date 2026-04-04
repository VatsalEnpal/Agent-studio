# Agent Studio v2 — Product Design Spec

> Date: 2026-04-03
> Status: Draft — awaiting user review
> Target: Electron Mac app (browser as fallback)
> Design language: Notion x Whispr Flow — clean, minimal, whitespace-heavy, dark-mode primary

---

## 1. Product Vision

Agent Studio is a native Mac app for managing AI coding agent sessions, team conversations, and autonomous sprints from one place. It should feel like opening Notion — calm, fast, polished — not like a DevOps dashboard. Every feature works reliably every time. No half-working MVPs.

**Primary user**: Solo developer running Claude Code with a multi-agent system (orchestrator, frontend, backend, QA, security, PMO, clearing, docs). Manages multiple projects. Wants agents to work autonomously and talk to them only when needed.

**Core promise**: Launch agents, watch them talk, approve their work, see everything at a glance. One app, always open, always reliable.

---

## 2. Five Pages

| Page | Purpose | Icon |
|------|---------|------|
| **Sessions** | Interactive Claude Code terminals. Launch, manage, type, see history. | Terminal icon |
| **Rooms** | Agent-to-agent chat. Watch discussions, jump in when needed. | Chat bubble icon |
| **Sprints** | Autonomous work tracker. Launch sprints, see gate progress, approve. | Play/sprint icon |
| **Memory** | Agent knowledge base. Browse, search, pin, edit memories. | Brain icon |
| **Settings** | Projects, agents, defaults, servers, config. | Gear icon |

No dashboard page. Sessions is home — that's where 80% of time is spent.

---

## 3. Global Shell

### Navigation
Left sidebar rail (56px wide, icon-only). Five page icons vertically stacked. Active page highlighted with accent bar. Below the icons: notification badge count.

### Top bar (40px)
- Left: Page title (e.g. "Sessions")
- Right: Active session count, CPU/RAM, peak hours badge, notification bell, theme toggle

### Notifications
Toast in top-right corner. Native macOS notifications via Electron for:
- Agent needs human input (@vatsal or @human in a room)
- Sprint gate transition (needs approval)
- Agent stuck (3 consecutive errors)
- Sprint completed
- Dev server crashed

### Design tokens
- **Background**: `#0a0a0a` (dark), `#fafafa` (light)
- **Surface**: `#111111` (dark), `#ffffff` (light)
- **Border**: `#1e1e1e` (dark), `#e5e5e5` (light)
- **Text primary**: `#e5e5e5` (dark), `#171717` (light)
- **Text secondary**: `#737373`
- **Accent**: `#3b82f6` (blue — not the overused purple gradient)
- **Success/green**: `#22c55e`
- **Warning/yellow**: `#eab308`
- **Error/red**: `#ef4444`
- **Font**: Geist Sans (UI), Geist Mono (terminal, code)
- **Corner radius**: 8px (cards), 6px (inputs), 4px (badges)
- **Transitions**: 150ms ease — every hover, every state change, smooth

### Dark mode primary
Terminal tools live in dark mode. Light mode is available but dark is default and primary design target. Terminal panes stay dark in both modes (standard practice — VS Code, iTerm, Warp all do this).

---

## 4. Sessions Page

### Philosophy
One focused terminal at a time. No grid. The grid causes flickering, lag, black screens, and typing delay because 6 xterm.js instances fight for render cycles and WebSocket bandwidth. Notion shows one document at a time. We show one terminal at a time.

### Layout

```
┌─[icon rail]─┬──[sidebar 260px]──┬──[main area]─────────────────┐
│              │                   │                               │
│   Sessions   │  ACTIVE           │                               │
│   Rooms      │  ┌─────────────┐  │   Full-width, full-height    │
│   Sprints    │  │ orchestrator│  │   xterm.js terminal           │
│   Memory     │  │ ●  42% ████ │  │                               │
│   Settings   │  ├─────────────┤  │   Single focused session      │
│              │  │ frontend    │  │   Full scrollback history     │
│              │  │ ○  15% ██   │  │   Fast input, no lag          │
│              │  ├─────────────┤  │                               │
│              │  │ backend     │  │                               │
│              │  │ ●  78% ████ │  │                               │
│              │  ├─────────────┤  │                               │
│              │                   │                               │
│              │  REPOS            │                               │
│              │  ┌─────────────┐  │                               │
│              │  │ InPipeline  │  │                               │
│              │  │ stg/frontend│  │                               │
│              │  │ ● clean ↑2  │  │                               │
│              │  ├─────────────┤  │                               │
│              │  │ vnb-portal  │  │                               │
│              │  │ main · PROD │  │                               │
│              │  ├─────────────┤  │                               │
│              │                   │                               │
│              │  SERVERS          │                               │
│              │  ┌─────────────┐  │                               │
│              │  │ :3000 ● up  │  │                               │
│              │  │ :8080 ○ off │  │                               │
│              │  ├─────────────┤  │                               │
│              │                   │                               │
│              │  PAST             │                               │
│              │  Today            │                               │
│              │  ├ Sprint: Auth   │                               │
│              │  ├ Quick debug    │                               │
│              │  Yesterday        │                               │
│              │  ├ QA run         │                               │
│              │                   │                               │
├──────────────┴───────────────────┴───────────────────────────────┤
│  orchestrator · opus · 42% ctx · $0.34 · 12m ago · stg/frontend │
└──────────────────────────────────────────────────────────────────┘
```

### Session cards (sidebar)
```
┌─────────────────────┐
│ ● Sprint: Auth      │  ← editable name (click pencil on hover)
│   orchestrator       │  ← agent name
│   ████████░░ 78%    │  ← context bar (yellow at 50%+, red at 80%+)
│   opus · $1.20      │  ← model + accumulated cost
└─────────────────────┘
```

- Green dot (●) = agent responding
- Yellow dot = idle, waiting for input
- Gray dot = exited / completed
- Click card = instant switch. Terminal buffer preserved in memory — no black screen, full scroll history intact.

### Session switching — the critical fix
Current bug: switching sessions = black screen until you type and press enter.

**Fix**: When a session loses focus, its xterm.js instance is detached from the DOM but kept alive in memory (terminal object + buffer). When it regains focus, re-attach to the DOM container and call `fitAddon.fit()`. The buffer is already there — no re-fetch needed. Scrollback position preserved. No flicker, no black screen, instant switch.

**Implementation**: Keep a `Map<sessionId, Terminal>` of all active terminal instances. Only one is attached to the DOM at a time. The rest exist in memory with their full buffer. This is how VS Code's terminal tabs work.

### Scrollback
xterm.js scrollback set to 50,000 lines (up from 10,000). User can scroll up freely. Scroll position preserved per session.

### Input lag fix
Current bug: typing is slow, keystrokes take time to register.

**Fix**:
1. Local echo: render the keystroke immediately in xterm.js before sending to server. This is the Mosh/sshx "predictive echo" pattern.
2. WebSocket batching: accumulate terminal-input events for 16ms (one frame), then send as one message. Prevents flooding.
3. Single terminal render loop: only one xterm.js instance renders at a time (since we show one session).

### New Session launcher
Click [+] in sidebar or Cmd+N → slide-in panel from right (Notion-style, not a centered modal):

- **Resume previous**: Searchable dropdown of recent sessions (top section)
- **Quick presets**: Continue (last session), Quick Chat (sonnet, no agent), Start Sprint (opus + orchestrator), Security Audit (opus + security), PMO Scan (sonnet + PMO)
- **Custom config**:
  - Model: opus / sonnet / haiku (radio group)
  - Agent: dropdown (auto-discovered from `.claude/agents/`)
  - Permissions: bypass / default / plan / auto
  - Working directory: path picker
  - Session name: text input
  - Custom flags: free text for additional CLI args
- **Launch button** (Cmd+Enter)

All fields have sensible defaults from `.agent-studio.json`. User can change defaults in Settings.

### Repos section (sidebar)
Each tracked project from `.agent-studio.json`:
```
┌─────────────────────┐
│ InPipeline           │
│ staging/frontend     │  ← current branch
│ ● clean  ↑2 ↓0      │  ← dirty/clean + ahead/behind
│ [PR] [Push] [↕]     │  ← actions
└─────────────────────┘
```

- **Click repo name** → main area shows Git view (replaces terminal temporarily):
  - Recent commits (last 10)
  - Changed files with diff status (M/A/D)
  - Branch switcher dropdown
  - [Create PR]: source branch, target branch, title, description. Prod repos get double confirmation. Uses `gh` CLI.
  - [Push]: push current branch. Prod repos get double confirmation.
  - [Merge]: if on feature branch, option to merge into target.
- **Click any session card** → back to terminal view
- Git status polls every 10 seconds — but async (no `execSync`). Uses `execFile` in a worker thread.

### Servers section (sidebar)
Dev servers from `.agent-studio.json`:
```
┌─────────────────────┐
│ staging-frontend     │
│ :3000  ● running     │
│ [Stop] [Open]        │
└─────────────────────┘
```

- Green dot = process alive (verified via PID check)
- [Start] = spawns the configured command, tracks PID, streams stdout to a viewable log
- [Stop] = kills the process tree (tree-kill with proper escalation)
- [Open] = opens `localhost:{port}` in default browser (or Electron webview)
- Port conflict detection: if port is already in use, shows "Port :3000 in use by node (PID 1234)" with a [Kill] option
- Hover tooltip: shows all ports currently in use and their owning processes

### Bottom status bar
Shows focused session info: agent name, model, context %, cost, time since last activity, working directory, branch.

---

## 5. Rooms Page

### Philosophy
Rooms are Slack channels where agents talk. You see clean, short messages — not terminal dumps. Agents take turns. You jump in when needed. This is NOT the terminal — it's a structured conversation.

### Layout
```
┌─[icon rail]─┬──[room list 260px]──┬──[chat area]───────────────┐
│              │                     │                             │
│              │  + New Room         │  #sprint-auth · 3 agents    │
│              │                     │                             │
│              │  ┌───────────────┐  │  orchestrator        10:34  │
│              │  │ #sprint-auth  │  │  Backend needs the auth     │
│              │  │ ● 3 agents    │  │  view first. @backend start │
│              │  │ 2 unread      │  │  with RLS policies.         │
│              │  ├───────────────┤  │                             │
│              │  │ #code-quality │  │  backend             10:34  │
│              │  │ ○ idle        │  │  On it. Creating view +     │
│              │  ├───────────────┤  │  RLS. Will hand off to      │
│              │  │ #general      │  │  @frontend when ready.      │
│              │  │ ○ idle        │  │                             │
│              │  ├───────────────┤  │  backend             10:41  │
│              │                     │  Done. Handoff ready.       │
│              │                     │  @frontend you can start.   │
│              │                     │                             │
│              │                     │  ⚠ orchestrator     11:02  │
│              │                     │  @vatsal Gate 1 passed.     │
│              │                     │  Ready for your review.     │
│              │                     │                             │
│              │                     │  [Approve] [Review Changes] │
│              │                     │                             │
│              │                     ├─────────────────────────────┤
│              │                     │ Type a message...  [@  ▾]   │
└──────────────┴─────────────────────┴─────────────────────────────┘
```

### Message rendering
Each message is a clean chat bubble:
- **Agent avatar** (colored circle with first letter) + **agent name** + **timestamp**
- **Message text** rendered as markdown (react-markdown with remark-gfm). Code blocks, links, bold, lists — all rendered properly.
- **No thinking tokens. No tool calls. No ANSI codes. No partial deltas.**

When an agent is working, show a subtle indicator in the chat:
```
  backend is working...  (12s)
```
Just a typing indicator with elapsed time. No streaming text. When the agent finishes, the full message appears as one clean bubble.

### How messages work (server-side filtering)

The Claude Agent SDK's `query()` streams events: thinking, tool_use, tool_result, text_delta, turn_end. The current implementation dumps all of these into the chat — that's why you see hundreds of messages.

**The fix**: Server accumulates text_delta events silently. Only when the turn ends does it emit ONE message with the accumulated final text. Everything else is dropped.

```
SDK event type     → Action
─────────────────────────────
thinking           → DROP
tool_use           → DROP
tool_result        → DROP
text_delta         → ACCUMULATE on server (not sent to client)
turn_end           → EMIT accumulated text as one room-message
```

The client never sees partial text. It sees: typing indicator → full message. Clean.

### Expandable detail (optional)
Click any agent message → collapsible panel below it shows:
- Tool calls made (file edits, bash commands, etc.)
- Files changed
- Duration
- Token count

Hidden by default. Power-user feature for debugging.

### Conversation protocol (prevents firehose)

1. **Turn-based**: One agent speaks at a time. When orchestrator mentions `@backend`, only backend gets invoked. Others wait.
2. **Sequential chaining**: If backend's response mentions `@frontend`, frontend is invoked next. Not parallel.
3. **No self-loops**: Agent cannot re-invoke itself.
4. **Depth limit**: Conversation chain pauses after reasonable depth. Asks human: "Chain reached limit — continue?"
5. **Human priority**: Your message pauses all pending invocations. You always get heard first.
6. **@all**: Routes to all agents sequentially (orchestrator first, then others in order).

### Notifications from rooms
When an agent says `@vatsal`, `@human`, or asks a question requiring human input:
- Toast notification (top-right)
- Badge on Rooms icon in nav rail
- Native macOS notification (Electron)
- Sound (optional, configurable in Settings)

### Creating a room
Click [+ New Room] → small form:
- Room name (e.g. "#sprint-auth")
- Topic (one-line description)
- Select agents to include (multi-select from discovered agents)
- Project context (which project/cwd)
- [Create] → room appears in list, agents can be spawned

### Spawning agents in a room
After creating a room, click [Spawn Agents] → each selected agent gets an SDK session. Orchestrator gets an init message establishing the room context. Other agents are idle until mentioned.

---

## 6. Sprints Page

### Philosophy
Sprints are autonomous work. You define what needs to happen, agents execute through gates, you approve transitions. This is your command center for background agent work. Separate from Rooms (which are interactive chat).

### Layout
```
┌─[icon rail]─┬──[sprint list 300px]────┬──[sprint detail]────────┐
│              │                         │                         │
│              │  + New Sprint           │  Code Quality Cleanup   │
│              │                         │  Status: IN_PROGRESS    │
│              │  ACTIVE                 │  Started: 2h ago        │
│              │  ┌───────────────────┐  │                         │
│              │  │ ● Code Quality    │  │  ┌─ GATE 1 ──────────┐ │
│              │  │   IN_PROGRESS     │  │  │ ● Backend: done    │ │
│              │  │   Gate 2 of 3     │  │  │ ● Security: passed │ │
│              │  │   ████████░░ 67%  │  │  │ Status: PASSED     │ │
│              │  ├───────────────────┤  │  └────────────────────┘ │
│              │                         │                         │
│              │  COMPLETED              │  ┌─ GATE 2 ──────────┐ │
│              │  ┌───────────────────┐  │  │ ● Frontend: wiring │ │
│              │  │ ✓ Auth Redesign   │  │  │ ○ tsc: pending     │ │
│              │  │   100/100 QA      │  │  │ Status: IN_PROGRESS│ │
│              │  │   Mar 16          │  │  └────────────────────┘ │
│              │  ├───────────────────┤  │                         │
│              │  │ ✓ Table Overhaul  │  │  ┌─ GATE 3 ──────────┐ │
│              │  │   89/100 QA       │  │  │ ○ QA: not started  │ │
│              │  │   Mar 15          │  │  │ ○ Security: waiting│ │
│              │  ├───────────────────┤  │  │ Status: WAITING    │ │
│              │  │ ✓ Tooltips        │  │  └────────────────────┘ │
│              │  │   Mar 15          │  │                         │
│              │  ├───────────────────┤  │  AGENTS                 │
│              │                         │  ┌────────────────────┐ │
│              │  PLANNED                │  │ backend    ● idle  │ │
│              │  ┌───────────────────┐  │  │ frontend   ● busy  │ │
│              │  │ ○ Security+Perf   │  │  │ qa         ○ wait  │ │
│              │  │   PLANNING        │  │  │ security   ● idle  │ │
│              │  ├───────────────────┤  │  └────────────────────┘ │
│              │                         │                         │
│              │                         │  HANDOFFS               │
│              │                         │  ┌────────────────────┐ │
│              │                         │  │ backend→frontend   │ │
│              │                         │  │ 12 columns, 2 EFs  │ │
│              │                         │  │ [View handoff]     │ │
│              │                         │  └────────────────────┘ │
│              │                         │                         │
│              │                         │  [Pause] [View Logs]    │
│              │                         │                         │
└──────────────┴─────────────────────────┴─────────────────────────┘
```

### Sprint list (left)
Three sections: **Active**, **Completed**, **Planned**.

Each sprint card:
```
┌─────────────────────────┐
│ ● Code Quality Cleanup  │  ← name + status dot
│   IN_PROGRESS           │  ← lifecycle status
│   Gate 2 of 3           │  ← current gate
│   ████████░░ 67%        │  ← overall progress
└─────────────────────────┘
```

Completed sprints show: name, QA score, date. Click to view archived details.

### Sprint detail (right)

When you click a sprint, the right panel shows everything:

**Header**: Sprint name, status badge, start time, elapsed time.

**Gates**: Visual timeline of Gate 1 → Gate 2 → Gate 3. Each gate shows:
- Checklist of requirements (backend done, security passed, etc.)
- Per-requirement status (green check, yellow spinner, gray circle)
- Gate status: WAITING → IN_PROGRESS → PASSED / FAILED
- [Approve Gate] button when gate is ready for human approval

**Agents**: Which agents are part of this sprint, their current status (idle/busy/waiting/offline), what they're working on.

**Handoffs**: List of handoff files written during the sprint. Click to view the JSON content (formatted nicely — columns, contracts, gotchas).

**QA Report**: When QA runs, shows health score prominently:
- Score badge (green ≥ 90, yellow ≥ 70, red < 70)
- Bug list with severity (P0-P3), title, assigned agent
- Passed flows list

**Logs**: Collapsible section showing chronological events:
```
10:34  orchestrator  Sprint started, spawning agents
10:34  backend       Creating view_clearing_auth_flat
10:41  backend       Handoff written: backend_to_frontend.json
10:41  orchestrator  Gate 1: backend done. Waiting on security.
10:45  security      RLS review passed.
10:45  orchestrator  Gate 1 PASSED. Starting Gate 2.
```

**Actions**:
- [Pause Sprint] — pauses all agent work, writes checkpoints
- [Resume Sprint] — resumes from checkpoints
- [Cancel Sprint] — kills agent sessions, archives as cancelled
- [View Spec] — opens current.md content in a readable panel

### Sprint lifecycle (mapped to your protocol)

This maps directly to the sprint system at `ai-agents/sprints/`:

| Your protocol | Agent Studio UI |
|---------------|-----------------|
| PMO writes `ready.md` | Notification: "PMO found work. View sprint suggestion?" |
| Orchestrator writes `current.md` | Sprint appears in "Planned" with spec viewable |
| User approves | Click [Launch Sprint] — status moves to IN_PROGRESS |
| `state.json` gate updates | Gate visual updates in real-time via file watcher |
| Handoff JSON written | Appears in Handoffs section |
| Gate needs approval | Notification: "Gate 1 ready for approval" + [Approve] button |
| QA writes `qa_report.json` | QA Report section populated with health score |
| Sprint completes | Moves to "Completed" list, state.json resets |
| `current.md` → `archive/` | Archived sprint stays viewable in Completed section |

### Multiple sprints
The protocol says one active sprint at a time in `current.md`. Agent Studio respects this — only one sprint can be IN_PROGRESS. But you can:
- See all planned sprints (from ready.md suggestions + manual creation)
- See all completed/archived sprints (from `archive/`)
- Queue sprints — when one completes, the next planned one can be launched

### Creating a sprint manually
Click [+ New Sprint]:
- Name
- Description
- Select agents
- Define tasks (or import from Notion via PMO)
- Define gates (default: 3-gate protocol, customizable)
- [Create] → appears in Planned. [Launch] when ready.

---

## 7. Memory Page

### Philosophy
Your agents' institutional knowledge. 112 memory files across 5 categories. Searchable, filterable, pinnable. The UI should make it easy to see what your agents know, what they've learned, what went wrong.

### Layout
```
┌─[icon rail]─┬──[filter + list 360px]──┬──[detail]──────────────┐
│              │                         │                         │
│              │  Search memories...     │  Auth Flow Redesign     │
│              │                         │  decision · orchestrator│
│              │  [All] [Learn] [Correct]│  2026-03-16             │
│              │  [Decide] [Human] [Know]│                         │
│              │  [☆ Pinned only]        │  Observation            │
│              │                         │  The existing auth used │
│              │  ┌───────────────────┐  │  browser-side Supabase  │
│              │  │ ☆ Auth Redesign   │  │  client which exposed   │
│              │  │   decision · orch  │  │  keys in NEXT_PUBLIC.   │
│              │  │   OTP > password   │  │                         │
│              │  ├───────────────────┤  │  Action                 │
│              │  │ Grid scroll fix   │  │  Redesigned to use OTP  │
│              │  │   correction · fe  │  │  via Edge Functions.    │
│              │  │   scrollbar reset  │  │  No browser client.    │
│              │  ├───────────────────┤  │                         │
│              │  │ Airtable rate lim │  │  Outcome                │
│              │  │   learning · clear │  │  Auth works. No keys   │
│              │  │   5 req/sec limit  │  │  exposed. DSO portal   │
│              │  ├───────────────────┤  │  passes security audit. │
│              │  │ ...               │  │                         │
│              │                         │  Lesson                 │
│              │                         │  Never use NEXT_PUBLIC  │
│              │                         │  for Supabase keys.     │
│              │                         │                         │
│              │                         │  Tags: auth, security,  │
│              │                         │  otp, supabase          │
│              │                         │                         │
│              │                         │  [Edit] [Pin] [Delete]  │
└──────────────┴─────────────────────────┴─────────────────────────┘
```

### Features
- **Search**: Full-text search across title, key_point, tags, content
- **Category filter pills**: All, Learnings (57), Corrections (27), Decisions (25), Human Inputs (13), Knowledge (5). Count badges.
- **Pinned toggle**: Show only pinned memories
- **List**: Each entry shows title, category badge, agent badge, one-line key_point, date
- **Detail panel**: Full structured content (observation, action, outcome, lesson), tags, agent, dates
- **CRUD**: Create new memory, edit existing, pin/unpin, delete with confirmation
- **Superseded indicator**: If a memory has `superseded_by`, it shows as dimmed with a "Superseded" badge and link to the new version

### Data source
Reads directly from `ai-agents/tools/memory_index.json` for the list. Fetches individual files from `ai-agents/memory/` for detail. Uses chokidar to watch for changes (agents writing new memories during sprints).

---

## 8. Settings Page

### Tabs

**General**
- Default model (opus/sonnet/haiku)
- Default permissions (bypass/default/plan/auto)
- Default working directory
- Theme (dark/light/system)
- Notification preferences (toasts on/off, sounds on/off, native notifications on/off)

**Projects**
- List of tracked projects from `.agent-studio.json`
- Add/remove projects (path picker)
- Mark as prod (isProd toggle — enables double-confirmation for git operations)
- Tracked branches per project

**Agents**
- Auto-discovered from `.claude/agents/` in each project
- Shows: name, description, model preference, file path
- Click to view the full agent .md content
- [Regenerate Agents] — re-run the AI agent generation from onboarding

**Dev Servers**
- List of configured dev servers
- Add/remove (name, path, command, port)
- Start/stop from here too (same as sidebar)

**Sprint Protocol**
- PMO scan interval (default: 2 hours)
- Gate configuration (default: 3 gates — backend+security, frontend, QA+security)
- Notification channels (Telegram bot token, chat ID)
- Sprint archive path

**Keyboard Shortcuts**
Reference table:

| Action | Shortcut |
|--------|----------|
| New session | Cmd+N |
| Command palette | Cmd+K |
| Toggle sidebar | Cmd+\ |
| Focus session 1-6 | Cmd+1 through 6 |
| Fullscreen terminal | Cmd+Enter |
| Switch to Sessions | Cmd+Shift+1 |
| Switch to Rooms | Cmd+Shift+2 |
| Switch to Sprints | Cmd+Shift+3 |
| Switch to Memory | Cmd+Shift+4 |

**About**
- Version, license, GitHub link

---

## 9. Server Architecture

### The problem with the current server
`server/index.ts` is 2,608 lines. Everything in one file. Blocking `execSync` calls freeze the event loop. WebSocket broadcasts have no error handling. No graceful shutdown. This is why the server crashes.

### Target structure

```
server/
  index.ts                 # Entry point — <30 lines. Creates app, starts server.
  app.ts                   # Express app setup, middleware, route mounting
  lifecycle.ts             # Graceful startup + shutdown (kill children, close watchers, clear intervals)
  ws/
    broadcast.ts           # Single broadcast helper: try/catch per client, backpressure check
    handlers.ts            # WebSocket message routing (terminal-data, room events, etc.)
  routes/
    sessions.ts            # /api/sessions — CRUD, launch, kill, buffer fetch
    rooms.ts               # /api/rooms — CRUD, messages, spawn agents
    sprints.ts             # /api/sprints — list, create, launch, gate approval, state
    memory.ts              # /api/memory — list, detail, CRUD
    git.ts                 # /api/git — status, push, PR creation, branch ops
    config.ts              # /api/config — read/write .agent-studio.json
    agents.ts              # /api/agents — discovery from .claude/agents/
    servers.ts             # /api/servers — dev server start/stop/status
  managers/
    terminal-manager.ts    # PTY lifecycle — spawn, kill (proper escalation), buffer management
    sdk-session-manager.ts # Claude Agent SDK sessions — create, send, queue, destroy
    process-tracker.ts     # Track ALL child processes. Kill all on shutdown. No orphans.
    sprint-manager.ts      # Sprint lifecycle — state.json, gates, handoffs, archiving
  workers/
    git-worker.ts          # Worker thread: async git status polling (no execSync)
    process-scanner.ts     # Worker thread: async process discovery (no execSync)
  watchers/
    file-watcher.ts        # Chokidar watching sprint files, memory files, config
    sprint-watcher.ts      # Watches state.json, handoffs/, qa_report.json for real-time updates
```

### Key architectural rules

1. **Zero execSync.** Every shell command uses `execFile` (async) or runs in a worker thread. The event loop never blocks.

2. **Single broadcast helper.** All WebSocket sends go through one function with try/catch per client and bufferedAmount backpressure check. No more 10 copy-pasted loops.

3. **Graceful shutdown.** On SIGINT/SIGTERM:
   - Kill all PTY sessions (tree-kill with escalation)
   - Destroy all SDK sessions
   - Stop all dev server processes
   - Close all file watchers
   - Clear all intervals/timeouts
   - Close WebSocket server
   - Close HTTP server
   - Exit cleanly

4. **Process tracker.** Every child process (PTY, dev server, automation) is registered in a central tracker. On crash or shutdown, everything gets cleaned up. No zombie processes.

5. **Atomic file writes.** All writes to `.agent-studio.json`, room persistence, sprint state use temp file + `rename()`. No corruption on crash.

6. **Terminal buffer management.** Circular buffer (ring buffer) instead of string concatenation + slice. O(1) per write instead of O(n). 50,000 line scrollback per session.

7. **SDK message filtering.** Room messages go through a filter that accumulates text_delta events and only emits the final complete message on turn_end. Thinking, tool_use, tool_result are never sent to the client.

8. **Sprint state powered by file watchers.** Instead of polling, chokidar watches `sprints/state.json`, `sprints/handoffs/`, `sprints/current.md`. File change → parse → WebSocket broadcast → UI updates. Real-time, no polling.

---

## 10. Electron Architecture

### Primary experience
The Mac app IS the product. Browser is a fallback for when you want quick access without launching the app.

### Structure
```
electron/
  main.js         # Main process: server lifecycle, window management, tray, notifications
  preload.js      # IPC bridge: notifications, file dialogs, system info
```

### Startup flow
1. Show splash screen (Agent Studio logo, "Starting...")
2. Find free port
3. Spawn server: `tsx server/index.ts` with PORT env var
4. Poll until server responds at `/api/config`
5. Create BrowserWindow pointing to `http://127.0.0.1:{port}` (IPv4 explicit — no IPv6 mismatch)
6. Hide splash, show main window

### Native features
- **macOS notifications**: When agents need attention (gate approval, @mention, errors)
- **Dock badge**: Unread notification count
- **Tray icon**: Quick access to running sessions and servers
- **Window state**: Remember size, position, maximized state across launches
- **Auto-update**: Electron-updater for distributing new versions (future)

### Server lifecycle
- Electron owns the server process
- If server crashes, Electron restarts it automatically (with backoff)
- On app quit, server is killed gracefully (SIGTERM → wait 3s → SIGKILL)
- If app crashes, server process is killed via `app.on('will-quit')`

---

## 11. Data Model

No database. All state comes from the filesystem — same as the current design. This keeps Agent Studio portable and config-driven.

| Data | Source | Watch method |
|------|--------|-------------|
| Config | `.agent-studio.json` | chokidar |
| Sessions | In-memory (terminal-manager) | WebSocket events |
| Session history | `~/.claude/projects/` session files | Scanned on demand |
| Rooms | `server/data/rooms/` (JSON files) | In-memory + persist on change |
| Sprint state | `ai-agents/sprints/state.json` | chokidar |
| Sprint spec | `ai-agents/sprints/current.md` | chokidar |
| Handoffs | `ai-agents/sprints/handoffs/*.json` | chokidar |
| QA reports | `ai-agents/sprints/handoffs/qa_report.json` | chokidar |
| Archived sprints | `ai-agents/sprints/archive/*.md` | Scanned on demand |
| Memory index | `ai-agents/tools/memory_index.json` | chokidar |
| Memory files | `ai-agents/memory/**/*.json` | Fetched on demand |
| Agents | `.claude/agents/*.md` | Scanned on demand, cached |
| Git status | `.git/` in each project | Worker thread, async poll every 10s |
| Dev servers | Tracked PIDs in process-tracker | PID alive check every 5s |
| Usage data | `~/.claude/projects/` session files | Parsed on demand per session |

---

## 12. What to Keep vs Rebuild

| Component | Decision | Reasoning |
|-----------|----------|-----------|
| Express server | **Keep + refactor** | Architecture is sound. Split into modules, fix async, add shutdown. |
| node-pty integration | **Keep + harden** | Works. Fix kill race condition, circular buffer, spawn queue. |
| Claude Agent SDK integration | **Keep + fix filtering** | Works. Add message filtering (turn_end only), fix error swallowing. |
| xterm.js | **Keep + fix** | Right library. Fix: single instance rendering, buffer preservation, scrollback. Pin to stable version when available. |
| WebSocket layer | **Keep + fix** | Works. Extract broadcast helper, add error handling, add backpressure. |
| React frontend | **Rebuild** | Current UI is MVP. New design needs new component tree, new page structure, new state management approach. Keep Zustand, keep Radix/shadcn, rebuild components. |
| Electron shell | **Keep + harden** | Works. Add auto-restart, native notifications, tray icon. |
| `.agent-studio.json` | **Keep** | Config format is good. Add sprint protocol settings. |
| Sprint integration | **New** | Current UI barely surfaces sprints. Build sprint-manager.ts from scratch, powered by file watchers on your existing sprint protocol files. |
| Room conversation protocol | **New** | Current rooms dump raw SDK output. Build turn-based protocol with message filtering from scratch. |
| Git integration | **Keep + fix** | Works. Move to async. Add PR creation, merge, branch switching. |
| Memory browser | **Keep + polish** | Works. Add edit/delete, superseded indicators, better search. |

---

## 13. Non-Goals (Explicitly Out of Scope for v2)

- Multi-user / auth / teams (build for yourself first)
- Cloud hosting / remote access (local Mac app)
- Support for non-Claude agents (Codex, Gemini — future)
- Docker deployment (unnecessary for local app)
- Mobile app
- AI-powered onboarding wizard (manual setup is fine)
- Plugin system / marketplace
- Custom themes beyond dark/light
- Voice interface

---

## 14. Success Criteria

The product is done when:

1. **Sessions**: You can launch a session, type without lag, switch sessions without black screens, scroll up to see history, see accurate context % and cost, launch/stop dev servers, create PRs — and none of this crashes.

2. **Rooms**: You can create a room, spawn agents, watch them have a clean 2-3 line conversation, agents take turns, you see only final messages (no thinking/tools), you get notified when they need you, and the whole thing doesn't flood with hundreds of messages.

3. **Sprints**: You can see all your sprints (active, planned, completed), launch a sprint, watch gates progress in real-time, approve gate transitions, see handoffs and QA reports, pause/resume sprints, and this maps 1:1 to your existing sprint protocol in `ai-agents/sprints/`.

4. **Memory**: You can search, filter, pin, edit, and delete memories. You can see what your agents have learned. New memories from running sprints appear in real-time.

5. **Stability**: The server doesn't crash. The app doesn't flicker. The event loop never blocks. Child processes don't become zombies. Files don't corrupt on crash. The app feels as reliable as Notion.
