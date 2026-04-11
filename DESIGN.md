# Agent Studio — Design Spec

**Open source command center for Claude Code agents. localhost only.**

One browser tab. All your Claude Code sessions. Sprint lifecycle. PMO scans. Memory. Everything.

---

## Two Modes, One App

Top toggle bar switches between major modes. Extensible — add more later.

| Mode | What it shows |
|------|-------------|
| **Sessions** | All Claude Code terminals in a grid. Launch, watch, interact, kill. |
| **Teams** | Sprint lifecycle, agent status, gates, activity log, handoffs, PMO scans. |
| **Memory** | Search and browse 102+ agent memories. (future) |
| **Settings** | Theme, defaults, keyboard shortcuts, scheduler config. (future) |

The toggle bar also always shows: total cost today, active session count, PMO scan status.

---

## Layout

```
┌────────────────────────────────────────────────────────────────┐
│  [Sessions] [Teams] [Memory] [Settings]    $5.05 │ 6 sess │ PMO: 2h │
├────────────┬───────────────────────────────────────────────────┤
│            │                                                    │
│  SIDEBAR   │  MAIN CONTENT (changes per mode)                  │
│  (200px)   │                                                    │
│            │  Sessions: terminal grid (2x2 or 2x3)             │
│  permanent │  Teams: sprint hero + agents + activity + handoffs │
│  always    │                                                    │
│  visible   │                                                    │
│            │                                                    │
└────────────┴───────────────────────────────────────────────────┘
```

### Responsive

| Screen | Behavior |
|--------|----------|
| Monitor (1920px+) | Sidebar + full grid + status panel (if Teams mode) |
| Laptop (1280-1440px) | Sidebar collapses to icons. Grid takes full width. |
| Small (<1280px) | Single terminal focused. Others in sidebar. |
| Double-click pane | Fullscreen. Esc to return. |

---

## Sessions Mode

### Sidebar

- **+ New Session** button (⌘N) → opens launcher modal
- **Session list** grouped:
  - SPRINT TEAM — auto-detected agent team sessions
  - STANDALONE — ad-hoc chats, telegram bot, etc.
- Per session: status dot (active/idle/building/error), name, cost badge
- **Folders** section: clickable, opens in Finder or Cursor
- **Git** section: current branches, worktrees, "Create PR" action

### Terminal Grid

- Full xterm.js with WebGL renderer
- Auto-layout: 1→full, 2→split, 3→L-shape, 4→2x2, 5-6→2x3
- Per pane header: status dot, name, model badge (opus/sonnet/haiku), cost ($), context (%), actions (fullscreen/kill)
- Focused pane: green border. Click sidebar or pane to focus.
- Drag borders to resize panes
- Max 6 visible. Beyond 6: background sessions in sidebar, click to swap in.

### Bottom Bar

- Session count by status (4 active, 1 idle, 1 channel)
- Keyboard shortcut hints

### Session Launcher (+ New)

Modal with:
- **Presets**: Start Sprint, Security Audit, PMO Scan, Quick Chat (one-click)
- **Model**: opus / sonnet / haiku dropdown
- **Agent**: dropdown of all `.claude/agents/*.md` files, or "none" for bare session
- **Permissions**: bypass / default / plan / auto
- **Channel**: none / telegram
- **Working directory**: path input with folder browser
- **Resume**: search recent sessions by name/ID
- **Custom flags**: free text for any CLI args
- Launch button (⌘Enter)

---

## Teams Mode

### Sidebar (Teams context)

- **Current sprint** (highlighted)
- **Sprint history** (clickable list, sorted by date)
- **PMO** section: Scan Now button, scheduler toggle (start/stop/paused), ready.md preview
- **Search**: memory browser, scan log

### Main Content

**Sprint Hero Card:**
- Sprint name, task count, duration
- Gate badges: G1 (done/active/pending), G2, G3 with tooltips showing details
- Phase progress bar: Phase 0 → Build → QA → Deploy

**Agent Roster:**
- Each agent: status dot, name, current task description
- Click agent → switches to Sessions mode focused on that agent's terminal

**Activity Log:**
- Real-time feed of agent actions (timestamped)
- Parsed from terminal output or from a shared activity.jsonl file
- Color-coded by agent

**Right Panel (on wide screens, collapsible on laptop):**
- Handoff cards: who passed what to whom
- QA report: health score, bugs found, pass/fail
- Sprint spec: expandable, shows full markdown
- PMO scan history: timestamped entries with READY/NOT READY

---

## Data Sources

All data comes from existing files. No new database.

| Data | Source | Method |
|------|--------|--------|
| Running sessions | `ps aux \| grep claude` | Poll every 5s |
| Terminal I/O | PTY subprocess via node-pty | WebSocket stream |
| Sprint status | `ai-agents/sprints/current.md` | chokidar file watch |
| Sprint readiness | `ai-agents/sprints/ready.md` | chokidar file watch |
| Sprint history | `ai-agents/sprints/archive/*.md` | Read directory |
| Handoffs | `ai-agents/sprints/handoffs/*.json` | chokidar file watch |
| Scan log | `ai-agents/sprints/scan_log.md` | chokidar file watch |
| Memory stats | `ai-agents/tools/memory_index.json` | chokidar file watch |
| Agent roster | `.claude/agents/*.md` | Read once on start |
| Git status | `git status --porcelain` per worktree | Poll every 10s |
| Cost/context | Parse from Claude Code output or `/cost` | Per-turn extraction |

---

## Empty States

| Screen | What shows |
|--------|-----------|
| No sessions | Centered "Start your first session" + preset buttons + ⌘N hint |
| No sprint | "No active sprint" + PMO scan result + "Start Sprint?" if ready.md exists |
| No history | "Your sprint history will appear after your first completed sprint" |
| Empty activity | "Waiting for agent activity..." with pulsing dot |
| No PMO scans | "PMO hasn't scanned yet" + Start Scheduler + Scan Now buttons |
| No memory | "Agents create memories as they work. Run your first sprint." |

---

## Error States

| Error | Behavior |
|-------|----------|
| Session crashes | Pane shows "Session ended (exit code X)" overlay. Restart / Resume / Remove buttons. Red dot in sidebar. |
| Session won't start | Inline error in launcher modal. Never a blank pane. |
| WebSocket disconnect | "Reconnecting..." with retry count. Auto-reconnect with backoff. Full state restored from server buffer. |
| File missing | Affected panel shows "Unable to read [file]." Other panels unaffected. |
| 6+ sessions | Grid shows max 6. Rest in sidebar as "background." Click to swap. |
| Port in use | Auto-detect next available port. Print in terminal. |
| Server restart | PTY processes survive. Auto-reattach on restart via PID file. |

---

## Performance

| Concern | Solution |
|---------|----------|
| 6 xterm.js instances | WebGL renderer (addon-webgl). Only render visible panes. Background sessions keep server buffer only. |
| Multiple WebSocket connections | Multiplex: one connection, messages tagged by session ID + type. |
| File watcher overhead | Watch directories not files. Debounce 500ms. Two watchers total. |
| First paint | Server-render shell. Terminal instances connect after first paint. Under 1s to usable. |
| Browser tab backgrounded | Server HeadlessEmulator preserves state. Reconnect restores full terminal. |

---

## Security

| Rule | Implementation |
|------|---------------|
| Localhost only | Bind to `127.0.0.1`. Never `0.0.0.0`. |
| No secrets in browser | API keys, service role keys read server-side only. |
| PTY isolation | Sessions run as local user. Same permissions as terminal. |
| No telemetry | Zero external calls from dashboard server. |
| Kill confirmation | "This will terminate the process. Are you sure?" |
| PR creation | Uses git credential helper. No tokens stored in dashboard. |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| ⌘N | New session (open launcher) |
| ⌘1-6 | Focus session by position |
| ⌘K | Command palette (search everything) |
| ⌘Enter | Fullscreen focused terminal |
| Esc | Exit fullscreen |
| ⌘F | Search in focused terminal |
| ⌘\\ | Toggle sidebar |
| Tab | Cycle through panes |

---

## Polish

- **Animations**: gate badge color transitions, activity feed slide-in, status dot pulse, toast slide-in (4s auto-dismiss)
- **Favicon**: green (good), yellow (building), red (attention). Updates real-time.
- **Tab title**: "(3) Agent Studio" where 3 = items needing attention.
- **Sounds** (optional, default off): chime on gate pass, alert on error.
- **Theme**: #0a0a0a bg, #111 panels, #1a1a1a borders, #f59e0b accent, #4ade80 success, #ef4444 error. Two fonts: system (-apple-system) + mono (Menlo).

---

## Open Source

- **Zero config**: Clone → npm install → npm start. Auto-discovers Claude Code.
- **No lock-in**: Sessions mode works for everyone. Teams mode optional (needs agent system config).
- **Plugin panels**: Custom toggle tabs via simple spec (name + file watcher + renderer).
- **License**: MIT.

---

## Tech Stack

| Component | Library |
|-----------|---------|
| Framework | Next.js 16 |
| Terminal | @xterm/xterm + addon-fit + addon-webgl |
| PTY | node-pty |
| Real-time | WebSocket (ws), multiplexed |
| File watching | chokidar |
| Layout | react-resizable-panels |
| State | zustand |
| UI | tailwindcss + radix-ui + lucide-react |
| Database | None (reads files directly) |
