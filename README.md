# Agent Studio

Web-based command center for AI coding agents.

Manage Claude Code sessions, define custom agents, run automated workflows, and monitor everything from one dashboard.

## Features

- **Terminal Grid** -- Run multiple Claude Code sessions side by side with real-time output
- **Custom Agents** -- Define agents tailored to your project (orchestrator, frontend, backend, QA, etc.)
- **Agent System Scaffolding** -- One-click setup generates agent definitions, memory index, and sprint structure
- **Automations** -- Headless loops that scan, report, and wait for your approval before acting
- **Memory Browser** -- Search and filter your agent's shared knowledge base
- **Git Dashboard** -- Track repos, branches, diffs, create PRs from the UI
- **Real Metrics** -- Token usage, costs, context window percentage per session (from real Claude data)
- **Session History** -- Resume previous Claude Code sessions with one click
- **Dev Server Management** -- Start/stop project dev servers from the dashboard
- **Open Source** -- MIT licensed, works with any project

## Quick Start

```bash
git clone https://github.com/VatsalEnpal/Agent-studio.git
cd agent-studio
npm install
npm run dev
# Open http://localhost:8080
```

## How It Works

Agent Studio wraps Claude Code CLI sessions in browser terminals using `node-pty` + `xterm.js`. It does not replace Claude Code -- it gives you visibility and control over multiple sessions.

```
Browser (Next.js)  <-->  WebSocket  <-->  Express Server
                                              |
                                         node-pty (spawns claude CLI)
                                              |
                                         Claude Code sessions
```

Each session runs as a real PTY process. The server tracks session lifecycle, usage metrics, and git status across your repos.

## First Run

The setup wizard guides you through:

1. **Add projects** -- Point to your git repositories
2. **Agent system** -- Create or connect an existing agent system (memory, sprints, handoffs)
3. **Agent team** -- Choose which agents to scaffold (orchestrator, frontend, backend, QA, security, PMO, docs)
4. **Workflow** -- Pick a workflow template (sprint planning, simple pipeline, or custom)
5. **Preferences** -- Default model, permissions mode

## Configuration

All settings live in `.agent-studio.json` (auto-generated, gitignored):

```json
{
  "projects": [
    { "name": "my-app", "path": "/home/user/my-app", "isProd": false }
  ],
  "agentSystem": {
    "path": "/home/user/my-app/ai-agents",
    "memoryIndex": "tools/memory_index.json",
    "sprintDir": "sprints/",
    "scanLog": "sprints/scan_log.md"
  },
  "devServers": [
    { "name": "my-app", "path": "/home/user/my-app", "command": "npm run dev" }
  ],
  "defaults": {
    "model": "sonnet",
    "permissions": "bypass",
    "workingDirectory": "~/my-app"
  },
  "setupComplete": true,
  "version": "1.0.0"
}
```

## Agent System

When you scaffold an agent system, Agent Studio creates:

```
your-project/
  ai-agents/
    agents/           # Agent definitions (one folder per agent)
    memory/           # Shared memory (learnings, corrections, decisions)
    sprints/          # Sprint specs, handoffs, scan logs
    tools/            # Memory index, notification scripts
    context/          # Shared context files
  .claude/
    agents/           # Claude Code agent entry points
```

Agents communicate through structured handoff files and share knowledge via a JSON memory index.

## Custom Workflows

Define team workflows in the config:

```json
{
  "workflows": [
    {
      "id": "deploy",
      "name": "Deployment Pipeline",
      "icon": "Rocket",
      "steps": [
        { "id": "test", "name": "Run Tests", "agents": ["qa"] },
        { "id": "review", "name": "Code Review", "agents": ["security"] },
        { "id": "deploy", "name": "Deploy", "agents": ["orchestrator"] }
      ]
    }
  ]
}
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd+N | New session |
| Cmd+K | Command palette |
| Cmd+\ | Toggle sidebar |
| Cmd+1-6 | Focus session |
| Esc | Close dialogs |
| F11 | Fullscreen |

## Requirements

- Node.js 20+
- Claude Code CLI (`npm install -g @anthropic-ai/claude-code`)
- Git

## Docker

```bash
docker build -t agent-studio .
docker run -p 8080:8080 agent-studio
```

## Tech Stack

- **Next.js 16** + React 19 (App Router)
- **xterm.js** + node-pty (terminal emulation)
- **Express 5** (API server, runs alongside Next.js)
- **WebSocket** (real-time terminal output + status updates)
- **Tailwind CSS** + Radix UI (styling + primitives)
- **Zustand** (client state management)
- **TypeScript** (strict mode)

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sessions` | GET/POST | List or create terminal sessions |
| `/api/sessions/:id` | DELETE | Kill a session |
| `/api/sessions/:id/usage` | GET | Token usage for a session |
| `/api/processes` | GET | Discover running Claude processes |
| `/api/git/status` | GET | Git status for all tracked repos |
| `/api/git/pr` | POST | Create a pull request |
| `/api/memory/entries` | GET | Browse agent memory index |
| `/api/config` | GET/POST | Read/write configuration |
| `/api/scaffold` | POST | Scaffold a new agent system |
| `/api/workflows` | GET | List automation workflows |

WebSocket on `/ws` streams terminal output, git updates, and usage metrics in real time.

## Development

```bash
npm run dev          # Start dev server on :8080
npm run build        # Production build
npm run type-check   # TypeScript validation
```

## License

MIT
