# Agent Studio

Web-based command center for AI coding agents.

Run multiple Claude Code sessions side by side, track token usage and costs in real time, manage git across repos, and scaffold custom agent systems -- all from one dashboard. Built for developers who run AI agents as part of their daily workflow and need visibility into what those agents are doing.

## What You Get

### Available Now

- **Terminal Grid** -- run up to 6 Claude Code sessions side by side with independent zoom, fullscreen, and tab cycling
- **Real-Time Metrics** -- token usage, costs, context window percentage, and model info per session (polled every 30s)
- **Session Management** -- launch, kill, resume, and continue previous sessions with preset configs
- **Git Dashboard** -- multi-repo status with branch tracking, diffs, commits, push, and PR creation
- **Memory Browser** -- search and filter your agent knowledge base (memory index, sprints, handoffs)
- **Agent Scaffolding** -- generate a complete `ai-agents/` directory with agent definitions, memory system, and sprint infrastructure
- **Setup Wizard** -- guided first-run configuration that auto-detects your projects and git repos
- **Keyboard Shortcuts** -- Cmd+K command palette, Cmd+N new session, Cmd+1-6 focus, and more
- **Docker Support** -- single Dockerfile, runs anywhere
- **Dev Server Management** -- start, stop, and monitor dev servers from the dashboard
- **Workflow Engine** -- define multi-step agent workflows with step-by-step execution
- **PMO Scheduler** -- automated periodic scans via launchd (macOS)

### Coming Soon

- **AI Agent Generation** -- describe your project in plain English, get custom agents tailored to your codebase
- **Automation Engine** -- scheduled headless agent loops with approval gates before applying changes
- **Reports Dashboard** -- review, approve, or reject automated agent actions before they land
- **Webhook Triggers** -- GitHub/GitLab push events auto-trigger agent scans and responses
- **Team Multiplayer** -- shared dashboard for teams running agents on the same codebase

## Quick Start

**Prerequisites:**
- Node.js 22+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- Git

```bash
git clone https://github.com/VatsalEnpal/Agent-studio.git
cd Agent-studio
npm install
npm run dev
```

Open [http://localhost:8080](http://localhost:8080). On first run, the setup wizard will guide you through configuration.

## How It Works

```
Browser (xterm.js)  <-->  WebSocket  <-->  Express Server  <-->  node-pty  <-->  Claude Code CLI
       |                     |                  |                    |                  |
   Renders terminal      Bidirectional      Routes + API       Spawns real PTY     Actual CLI
   with full ANSI        I/O streaming      + Next.js SSR      processes           process
   color support
```

The key insight: Agent Studio does not run Claude in the browser or call the Anthropic API directly. It spawns real Claude Code CLI processes using `node-pty` (the same library VS Code uses for its terminal) and pipes their I/O through a WebSocket to xterm.js in the browser. This means you get the exact same behavior as your local terminal -- permissions, file access, tools, MCP servers -- but with a visual grid, metrics, and management layer on top.

The Express server wraps Next.js so everything runs on a single port. The WebSocket handles terminal I/O, session updates, git status, usage metrics, and file change notifications -- all multiplexed over one connection.

## Why Not Just Terminal Tabs?

| Feature | Terminal Tabs | Agent Studio |
|---------|--------------|--------------|
| See all sessions at once | No (one tab at a time) | Yes (up to 6 in a grid) |
| Token usage and cost tracking | No | Yes, per session, real-time |
| Context window visibility | No | Yes (% used, total capacity) |
| Resume previous sessions | Manual (`claude --resume`) | One-click dropdown with search |
| Git status across repos | Switch between terminals | Single dashboard view |
| Create PRs | CLI commands | Built-in modal with branch picker |
| Scaffold agent systems | Manual file creation | Guided wizard with templates |
| Keyboard-driven workflow | Varies by terminal | Consistent shortcuts (Cmd+K, Cmd+N, etc.) |
| Session presets | Aliases/scripts | Built-in (Quick Chat, Start Sprint, Security Audit, PMO Scan) |
| Kill runaway agents | Find PID, kill manually | One click per session |

## Configuration

Agent Studio stores its config in `.agent-studio.json` in the working directory. It auto-generates on first run by scanning your filesystem.

```jsonc
{
  "projects": [
    {
      "name": "my-project",
      "path": "/Users/you/Code/my-project",
      "isProd": false,                          // prod repos get push protection
      "trackedBranches": ["main", "develop"]
    }
  ],
  "agentSystem": {
    "path": "/Users/you/Code/my-project/ai-agents",
    "memoryIndex": "tools/memory_index.json",
    "sprintDir": "sprints/",
    "scanLog": "sprints/scan_log.md"
  },
  "devServers": [
    {
      "name": "my-project",
      "path": "/Users/you/Code/my-project",
      "command": "npm run dev"
    }
  ],
  "defaults": {
    "model": "sonnet",                          // opus | sonnet | haiku
    "permissions": "bypass",                    // bypass | default | plan | auto
    "workingDirectory": "~/Code/my-project"
  },
  "workflows": [],
  "setupComplete": true,
  "version": "1.0.0"
}
```

Edit this file directly or use the Settings view in the UI.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Open command palette |
| `Cmd+N` | Open session launcher |
| `Cmd+\` | Toggle sidebar |
| `Cmd+Enter` | Toggle fullscreen on focused session |
| `Cmd+1` through `Cmd+6` | Focus session by grid position |
| `Tab` | Cycle focus between sessions |
| `Escape` | Exit fullscreen / close palette / close launcher |

## API Reference

All endpoints are served from the same port as the UI (default: 8080).

### Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/sessions` | List all active sessions |
| `POST` | `/api/sessions` | Create a new session |
| `DELETE` | `/api/sessions/:id` | Kill a session |
| `GET` | `/api/sessions/:id/usage` | Get token usage for a session |
| `GET` | `/api/sessions/history` | List previous sessions from `~/.claude/projects/` |

### Git

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/git/status` | Get status of all tracked repos |
| `GET` | `/api/git/branches?repo=PATH` | List branches for a repo |
| `GET` | `/api/git/changes?repo=PATH` | Get `git status --porcelain` output |
| `GET` | `/api/git/diff?repo=PATH` | Get staged and unstaged diff stats |
| `POST` | `/api/git/commit` | Stage all and commit (blocked for prod repos) |
| `POST` | `/api/git/push` | Push (prod repos require `confirmed: true`) |
| `POST` | `/api/git/pr` | Create a pull request |
| `POST` | `/api/git/open` | Open repo directory in Finder or a specific app |

### Usage and Processes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/usage` | Get usage data for all Claude processes |
| `GET` | `/api/usage/:pid` | Get usage data for a specific PID |
| `GET` | `/api/processes` | Discover running Claude Code processes |
| `POST` | `/api/processes/:pid/kill` | Kill a process by PID |

### Config and Scaffolding

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/config` | Get current config, home dir, and cwd |
| `POST` | `/api/config` | Save updated config |
| `POST` | `/api/scaffold/preview` | Preview files that would be created |
| `POST` | `/api/scaffold` | Generate the agent system directory |

### Sprint and Memory

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/sprint/current` | Read current sprint spec |
| `GET` | `/api/sprint/queue` | Read the ready queue |
| `GET` | `/api/sprint/scans` | Read scan log entries |
| `GET` | `/api/sprint/history` | Read sprint archive |
| `GET` | `/api/sprint/handoffs` | Read handoff files |
| `GET` | `/api/memory/stats` | Get memory index statistics |

### Workflows and Dev Servers

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/workflows` | List all configured workflows |
| `GET` | `/api/workflows/:flowId/runs/:runId` | Get a specific workflow run |
| `GET` | `/api/servers` | List all dev servers and their status |
| `POST` | `/api/servers/start` | Start a dev server |
| `POST` | `/api/servers/:pid/stop` | Stop a dev server |
| `POST` | `/api/servers/custom` | Add a custom dev server definition |
| `DELETE` | `/api/servers/custom/:name` | Remove a custom dev server |

### PMO Scheduler

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/pmo/status` | Get scheduler status (sync) |
| `GET` | `/api/pmo/status-full` | Get scheduler status with scan history |
| `POST` | `/api/pmo/start` | Start the PMO scan scheduler |
| `POST` | `/api/pmo/stop` | Stop the PMO scan scheduler |
| `POST` | `/api/pmo/scan` | Trigger an immediate PMO scan |

### WebSocket

Connect to `ws://localhost:8080/ws` for real-time updates.

| Message Type | Direction | Description |
|-------------|-----------|-------------|
| `terminal-data` | Server to Client | Terminal output from a session |
| `terminal-input` | Client to Server | Keyboard input to a session |
| `terminal-resize` | Client to Server | Terminal resize event |
| `sessions-update` | Server to Client | Session list changed |
| `git-update` | Server to Client | Git status changed |
| `usage-update` | Server to Client | Token usage data (every 30s) |
| `file-update` | Server to Client | Sprint/memory file changed on disk |
| `workflow-update` | Server to Client | Workflow state changed |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend framework | Next.js 16 (App Router) |
| UI rendering | React 19 |
| Terminal emulator | xterm.js v6 with WebGL renderer |
| State management | Zustand 5 |
| Styling | Tailwind CSS 3 |
| UI primitives | Radix UI (Dialog, Dropdown Menu, Tooltip) |
| Icons | Lucide React |
| Server | Express 5 |
| PTY management | node-pty |
| WebSocket | ws |
| File watching | chokidar |
| Panel layout | react-resizable-panels |
| Language | TypeScript (strict) |
| Testing | Vitest + Playwright |

## Docker

```bash
# Build
docker build -t agent-studio .

# Run (mount your home directory so Claude Code can access your projects and config)
docker run -it -p 8080:8080 -v $HOME:$HOME agent-studio

# Run with a specific working directory
docker run -it -p 8080:8080 -v $HOME:$HOME -w /path/to/your/project agent-studio
```

**Note:** The Claude Code CLI must be available inside the container. Mount your `~/.claude` directory or install it in the image.

## Contributing

```bash
# Clone and install
git clone https://github.com/VatsalEnpal/Agent-studio.git
cd Agent-studio
npm install

# Start dev server (Express + Next.js on port 8080)
npm run dev

# Type check
npm run type-check

# Build for production
npm run build
```

### Project Structure

```
agent-studio/
├── server/                  # Express server + backend logic
│   ├── index.ts             # Main server: Express + WebSocket + all API routes
│   ├── terminal-manager.ts  # PTY lifecycle (create, write, resize, kill)
│   ├── config.ts            # .agent-studio.json read/write/generate
│   ├── scaffold.ts          # Agent system directory generator
│   ├── git-status.ts        # Git repo polling and status
│   ├── pr-creator.ts        # PR creation via gh CLI
│   ├── session-usage.ts     # Token/cost tracking from Claude status files
│   ├── process-discovery.ts # Find running Claude processes
│   ├── file-watcher.ts      # Watch sprint/memory files for changes
│   ├── dev-servers.ts       # Dev server start/stop management
│   ├── types.ts             # Shared server types
│   └── workflows/           # Workflow engine
├── src/
│   ├── app/                 # Next.js App Router pages
│   ├── components/          # React components
│   │   ├── terminal/        # Terminal grid, pane, fullscreen
│   │   ├── sessions/        # Session launcher, session items
│   │   ├── layout/          # Sidebar, bottom bar, toggle bar, command palette
│   │   ├── git/             # PR modal
│   │   ├── memory/          # Memory browser
│   │   ├── teams/           # Teams/workflow view
│   │   ├── settings/        # Settings tabs, scaffold dialog
│   │   ├── setup/           # First-run setup wizard
│   │   └── ui/              # Shared UI (toast, error boundary)
│   ├── stores/              # Zustand stores (sessions, git, ui, memory, etc.)
│   ├── hooks/               # Custom hooks (keyboard, usage, notifications)
│   └── lib/                 # Utilities (WebSocket client, types)
├── Dockerfile
├── package.json
└── .agent-studio.json       # Auto-generated config
```

### How to Contribute

1. Fork the repo
2. Create a feature branch from `main`
3. Make your changes
4. Run `npm run type-check` to verify TypeScript compiles
5. Open a PR with a clear description of what changed and why

## Roadmap

- [ ] AI-powered agent generation (describe project, get tailored agents)
- [ ] Headless automation mode with scheduled runs
- [ ] Approval gates for automated changes
- [ ] GitHub/GitLab webhook triggers
- [ ] Team multiplayer with shared dashboard
- [ ] Cost budgets and alerts per session
- [ ] Plugin system for custom integrations
- [ ] Session recordings and replay

## License

MIT -- Vatsal Bhatt
