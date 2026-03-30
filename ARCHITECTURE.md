# Architecture

Technical reference for contributors. Covers the system design, key decisions, and how to extend Agent Studio.

---

## 1. Overview

Agent Studio is a three-layer application:

```
┌─────────────────────────────────────────────────────────┐
│  Browser Layer                                          │
│  Next.js 16 (App Router) + React 19                     │
│  xterm.js terminals  |  Zustand stores  |  Radix UI     │
│                                                         │
│  WebSocket client ──────┐                               │
└─────────────────────────┼───────────────────────────────┘
                          │ ws://localhost:8080/ws
┌─────────────────────────┼───────────────────────────────┐
│  Server Layer           │                               │
│  Express 5 (wraps Next.js on single port)               │
│                         │                               │
│  REST API routes        │  WebSocket handler            │
│  /api/sessions          │  terminal-data (bidirectional)│
│  /api/git/*             │  sessions-update              │
│  /api/usage             │  git-update                   │
│  /api/config            │  usage-update (30s poll)      │
│  /api/scaffold          │  file-update                  │
│  /api/workflows         │  workflow-update              │
│                         │                               │
└─────────────────────────┼───────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────┐
│  Process Layer          │                               │
│                         │                               │
│  node-pty ──> claude CLI sessions (real PTY processes)   │
│  child_process ──> git commands, dev servers             │
│  chokidar ──> file system watchers                      │
│  launchd ──> PMO scheduler (macOS)                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

Everything runs on a single port (default 8080). The Express server handles API routes and WebSocket upgrades for `/ws`, then delegates all other requests to Next.js (including `/_next/webpack-hmr` for Turbopack HMR in dev mode).

## 2. Server Layer

### Express Wrapping Next.js

The entry point is `server/index.ts`. It:

1. Loads or generates `.agent-studio.json` config
2. Calls `nextApp.prepare()` to boot Next.js
3. Creates an Express app and attaches all API routes
4. Creates an HTTP server and a `WebSocketServer` with `noServer: true`
5. Routes the `upgrade` event: `/ws` goes to our WebSocket server, everything else falls through to Next.js (for Turbopack HMR)
6. Starts listening on the configured port

This pattern gives us one port for everything -- the UI, the API, and the WebSocket -- while letting Next.js handle its own concerns (SSR, static files, HMR).

### Terminal Manager

`server/terminal-manager.ts` manages the lifecycle of PTY sessions.

**Creating a session:**
1. Generate a UUID
2. Resolve the command path (e.g., `claude` to `/usr/local/bin/claude`)
3. Spawn a `node-pty` process with the command, args, cwd, and environment
4. Register `onData` handler to emit `terminal-data` events
5. Register `onExit` handler to update session status and emit `sessions-update`
6. Return the session object

**Killing a session:**
1. Call `pty.kill()` on the underlying process
2. Wait 3 seconds before removing from the map (so the frontend can show an exit toast)
3. Emit `sessions-update`

**Key design:** Sessions are stored in a `Map<string, { session, pty }>`. The session object is the serializable metadata; the pty object is the live process handle. Only the session object is sent to clients.

### WebSocket Message Types

All WebSocket communication uses JSON messages with a `type` field:

| Type | Sender | Payload | Purpose |
|------|--------|---------|---------|
| `terminal-data` | Server | `{ sessionId, data }` | Raw terminal output (ANSI) |
| `terminal-input` | Client | `{ sessionId, data }` | Keyboard input to a session |
| `terminal-resize` | Client | `{ sessionId, cols, rows }` | Terminal dimension change |
| `sessions-update` | Server | `Session[]` | Session list changed |
| `git-update` | Server | `RepoStatus[]` | Git status poll result |
| `usage-update` | Server | `{ all, managed }` | Token/cost data (every 30s) |
| `file-update` | Server | `{ file, content }` | Sprint/memory file changed on disk |
| `workflow-update` | Server | `WorkflowFlow[]` | Workflow state changed |

On connect, the server immediately sends `sessions-update` and `git-update` so the client has current state without waiting for the next poll.

### API Route Organization

Routes are grouped by domain in `server/index.ts`:

- **Config** (`/api/config`) -- read/write `.agent-studio.json`
- **Setup** (`/api/setup/*`) -- validate agent system paths
- **Scaffold** (`/api/scaffold`) -- generate agent directories
- **Sessions** (`/api/sessions`) -- CRUD for terminal sessions
- **Processes** (`/api/processes`) -- discover and kill Claude processes
- **Usage** (`/api/usage`) -- token and cost data
- **Sprint/Memory** (`/api/sprint/*`, `/api/memory/*`) -- read sprint files and memory stats
- **Git** (`/api/git/*`) -- status, branches, diff, commit, push, PR, open
- **Workflows** (`/api/workflows`) -- workflow definitions and runs
- **PMO** (`/api/pmo/*`) -- scheduler status and control
- **Dev Servers** (`/api/servers`) -- start, stop, and manage dev servers

### Supporting Server Modules

| Module | File | Responsibility |
|--------|------|----------------|
| Terminal Manager | `terminal-manager.ts` | PTY lifecycle, event emission |
| Config | `config.ts` | Read, write, generate, cache config |
| Scaffold | `scaffold.ts` | Generate `ai-agents/` directory structure |
| Git Status | `git-status.ts` | Poll git repos, detect changes |
| PR Creator | `pr-creator.ts` | Create PRs via `gh` CLI |
| Session Usage | `session-usage.ts` | Read Claude status files, compute costs |
| Process Discovery | `process-discovery.ts` | Find running Claude processes via `ps` |
| File Watcher | `file-watcher.ts` | Watch sprint/memory files with chokidar |
| Dev Servers | `dev-servers.ts` | Start/stop dev server child processes |
| Workflows | `workflows/` | Workflow engine with registry and step execution |

## 3. Frontend Layer

### Next.js 16 App Router

The frontend is a single-page app using Next.js App Router. There is one page (`src/app/page.tsx`) that renders the entire UI. The page is a client component (`"use client"`) because it manages WebSocket connections, terminal state, and keyboard shortcuts.

### Zustand Stores

State is managed by Zustand stores in `src/stores/`:

| Store | State | Key Actions |
|-------|-------|-------------|
| `sessions` | Session list, focused ID, visible IDs (max 6), zoom levels | `setSessions`, `addSession`, `removeSession`, `setFocused`, `swapIn`, `zoomIn/Out` |
| `ui` | Sidebar open, launcher open, command palette open, fullscreen ID, active mode | `toggleSidebar`, `setLauncherOpen`, `setActiveMode` |
| `git` | Repo statuses | `setRepos` |
| `memory` | Memory entries, filters | Various |
| `toast` | Toast notifications | `addToast`, `removeToast` |
| `settings` | Settings state | Various |
| `workflows` | Workflow definitions and runs | Various |

### xterm.js Terminal Rendering

Each terminal session is rendered by a `TerminalPane` component that:

1. Creates an xterm.js `Terminal` instance with the WebGL addon for GPU-accelerated rendering
2. Uses the `FitAddon` to auto-size the terminal to its container
3. Connects to the WebSocket: listens for `terminal-data` messages matching its session ID
4. Sends `terminal-input` and `terminal-resize` messages back through the WebSocket
5. Handles zoom (font size changes) via the sessions store

### CSS Hidden Pattern for Tab Switching

The main content area uses `hidden`/`block` CSS classes instead of conditional rendering to switch between views (Sessions, Teams, Memory, Settings):

```tsx
<div className={activeMode === "sessions" ? "h-full" : "hidden"}>
  <TerminalGrid ... />
</div>
<div className={activeMode === "teams" ? "h-full" : "hidden"}>
  <TeamsView />
</div>
```

This is deliberate. If we conditionally rendered (`{activeMode === "sessions" && <TerminalGrid />}`), switching tabs would unmount the terminal components, destroying the xterm.js instances and losing scroll position. With CSS `hidden`, the DOM stays alive -- you just toggle visibility. Switching back is instant and preserves state.

### Component Organization

```
src/components/
├── terminal/        # Core terminal experience
│   ├── terminal-grid.tsx       # Grid layout (1-6 sessions), empty state
│   ├── terminal-pane.tsx       # Single terminal with xterm.js
│   └── terminal-fullscreen.tsx # Fullscreen overlay
├── sessions/        # Session management
│   ├── session-launcher.tsx    # Launch modal with presets and options
│   ├── session-item.tsx        # Sidebar session entry
│   └── session-group.tsx       # Grouped sessions (sprint/standalone)
├── layout/          # App shell
│   ├── sidebar.tsx             # Left sidebar with sessions and git
│   ├── toggle-bar.tsx          # Top bar with mode tabs
│   ├── bottom-bar.tsx          # Bottom status bar
│   ├── command-palette.tsx     # Cmd+K palette
│   └── help-panel.tsx          # Help/docs panel
├── git/             # Git features
│   └── pr-modal.tsx            # PR creation modal
├── memory/          # Memory browser
│   ├── memory-view.tsx         # Main memory page
│   └── memory-detail.tsx       # Single memory entry
├── teams/           # Workflows
│   ├── teams-view.tsx          # Workflow list and runner
│   ├── step-card.tsx           # Individual step card
│   ├── step-timeline.tsx       # Step progress timeline
│   ├── flow-sidebar.tsx        # Flow navigation
│   └── system-panel.tsx        # System status panel
├── settings/        # Configuration
│   ├── settings-view.tsx       # Settings container with tabs
│   ├── settings-general.tsx    # General preferences
│   ├── settings-workspace.tsx  # Project and agent system config
│   ├── settings-shortcuts.tsx  # Keyboard shortcut reference
│   ├── settings-monitor.tsx    # Process monitor
│   ├── settings-pmo.tsx        # PMO scheduler controls
│   ├── settings-about.tsx      # About page
│   └── scaffold-dialog.tsx     # Agent system scaffolding UI
├── setup/           # First-run experience
│   └── setup-wizard.tsx        # Multi-step setup wizard
└── ui/              # Shared primitives
    ├── toast.tsx               # Toast notification system
    └── error-boundary.tsx      # React error boundary
```

## 4. Key Design Decisions

### Why node-pty instead of the Anthropic API?

Agent Studio is a terminal multiplexer, not an API wrapper. By spawning real Claude Code CLI processes:
- You get the exact same behavior as running `claude` in your terminal
- All Claude Code features work: tools, MCP servers, permissions, `--agent`, `--resume`
- No API key management in Agent Studio itself
- No need to reimplement Claude Code's tool use, file editing, or conversation state

The trade-off is that you need Claude Code CLI installed locally.

### Why a single WebSocket?

All real-time data (terminal I/O for all sessions, git updates, usage metrics, file changes) flows through one WebSocket connection. This simplifies:
- Connection management (one reconnect loop, one health check)
- Message routing (type-based dispatch)
- Resource usage (one socket vs. N sockets for N sessions)

Messages are distinguished by `type` and `sessionId` fields.

### Why CSS hidden instead of unmount?

xterm.js creates a complex DOM structure with a canvas element for WebGL rendering. Unmounting destroys this, and re-creating it is expensive (100-200ms per terminal). With CSS `hidden`, switching between Sessions/Teams/Memory/Settings tabs is instant because the DOM is preserved. The trade-off is slightly higher memory usage.

### Why Express wrapping Next.js?

Next.js App Router does not natively support WebSocket or long-running server processes. By having Express as the outer layer:
- WebSocket upgrades are handled before Next.js sees them
- PTY processes, file watchers, and git pollers run in the Express process
- API routes can access shared state (TerminalManager, GitWatcher) directly
- Everything runs on one port with one `npm run dev` command

## 5. Directory Structure

```
agent-studio/
├── server/                     # Server-side code (runs in Node.js)
│   ├── index.ts                # Entry point: Express + WS + Next.js + all routes
│   ├── terminal-manager.ts     # PTY session lifecycle
│   ├── config.ts               # Config file management
│   ├── scaffold.ts             # Agent system generator (templates + directory creation)
│   ├── git-status.ts           # Git polling (runs every 10s)
│   ├── pr-creator.ts           # PR creation via gh CLI
│   ├── session-usage.ts        # Reads Claude status files for token/cost data
│   ├── process-discovery.ts    # Discovers Claude processes via ps
│   ├── file-watcher.ts         # Watches sprint/memory files via chokidar
│   ├── dev-servers.ts          # Dev server child process management
│   ├── types.ts                # Shared types: Session, WsMessage, SessionMeta
│   └── workflows/              # Workflow engine
│       ├── index.ts            # WorkflowManager class
│       ├── types.ts            # Workflow types
│       ├── sprint-planning.ts  # Sprint planning workflow implementation
│       └── workflow-registry.ts# Registry of available workflows
├── src/                        # Frontend code (runs in browser)
│   ├── app/
│   │   ├── layout.tsx          # Root layout (HTML, fonts, global CSS)
│   │   └── page.tsx            # Single-page app entry point
│   ├── components/             # React components (see section 3 for full tree)
│   ├── stores/                 # Zustand state stores
│   │   ├── sessions.ts         # Session state (max 6 visible, zoom, focus)
│   │   ├── ui.ts               # UI state (sidebar, modals, active mode)
│   │   ├── git.ts              # Git repo state
│   │   ├── memory.ts           # Memory browser state
│   │   ├── toast.ts            # Toast notifications
│   │   ├── settings.ts         # Settings state
│   │   └── workflows.ts        # Workflow state
│   ├── hooks/
│   │   ├── use-keyboard.ts     # Global keyboard shortcuts
│   │   ├── use-usage.ts        # Usage data polling hook
│   │   ├── use-notifications.ts# Dynamic favicon + tab title + exit toasts
│   │   └── use-config.ts       # Config fetching hook
│   └── lib/
│       ├── ws-client.ts        # WebSocket client singleton with reconnect
│       ├── types.ts            # Shared frontend types
│       └── utils.ts            # Utility functions (cn, etc.)
├── public/                     # Static assets
├── Dockerfile                  # Docker build (node:22-slim + build tools)
├── package.json                # Dependencies and scripts
├── tsconfig.json               # TypeScript config (strict)
├── tailwind.config.ts          # Tailwind theme (console-* color tokens)
├── next.config.mjs             # Next.js config
└── postcss.config.mjs          # PostCSS config
```

## 6. Adding a New Feature

### Adding an API Route

1. Open `server/index.ts`.
2. Add your route in the appropriate section (or create a new section with a comment header).
3. If the route needs shared state, access it through the existing instances (`terminalManager`, `gitWatcher`, `workflowManager`) or create a new module in `server/`.
4. Follow the existing error handling pattern: `try/catch` with `res.status(N).json({ error: message })`.

### Adding a Component

1. Create the component in the appropriate `src/components/` subdirectory.
2. If it needs global state, add fields to the relevant Zustand store in `src/stores/`.
3. If it needs a new top-level view mode, add it to the `activeMode` type in `src/stores/ui.ts` and add a tab in `toggle-bar.tsx`.
4. If it needs real-time data, subscribe to a WebSocket message type via `wsClient.on("type", handler)`.

### Adding a Zustand Store

1. Create `src/stores/my-feature.ts`.
2. Define the interface and create the store with `create<State>()`.
3. Import and use in components with `const value = useMyStore((s) => s.field)`.
4. If the store needs data from the server, either fetch in a `useEffect` or subscribe to a WebSocket message type.

### Adding a WebSocket Message Type

1. Add the type to the `WsMessage.type` union in `server/types.ts`.
2. Add the same type to `src/lib/types.ts`.
3. Emit the message from the server: `for (const client of wss.clients) { client.send(...) }`.
4. Subscribe on the client: `wsClient.on("my-type", handler)`.
