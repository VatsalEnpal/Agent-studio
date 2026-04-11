# Agent Studio

Your command center for AI coding agents. Manage Claude Code sessions, monitor agent workflows, track memory, and control dev servers — all in one browser tab.

## Quick Start

```bash
git clone <repo-url>
cd agent-studio
npm install
npm run dev
```

Open http://localhost:8080

On first run, Agent Studio auto-detects your projects and Claude Code setup. You can configure everything in Settings.

## Features

### Sessions
Launch and manage Claude Code terminals in your browser.
- Multiple sessions with grid/single view
- Session launcher with presets (Quick Chat, Start Sprint)
- Resume old conversations
- Model, context, and token tracking from Claude session files

### Teams
Monitor agent team workflows with a visual step timeline.
- Built-in Sprint Planning flow (PMO > Spec > Approve > Build > Test > Ship)
- Custom workflows via config
- Expandable steps with real data

### Memory
Browse your agent system's persistent memory.
- Search across all memory entries
- Filter by category (learnings, corrections, decisions)
- View full memory details

### Settings
- System monitor (CPU, RAM, Disk)
- Default model and permissions
- PMO scheduler control
- Workspace configuration

### Dev Servers
Start, stop, and monitor your project's dev servers from the sidebar.

### Git Integration
- Branch status for all repos
- Commit and push from the UI
- Create PRs with production safety gates

### Keyboard Shortcuts
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

## Configuration

On first run, Agent Studio creates `.agent-studio.json` with auto-detected settings. You can edit this in Settings or directly:

```json
{
  "projects": [
    { "name": "my-project", "path": "/path/to/project", "isProd": false }
  ],
  "agentSystem": {
    "path": "/path/to/ai-agents",
    "memoryIndex": "tools/memory_index.json",
    "sprintDir": "sprints/",
    "scanLog": "sprints/scan_log.md"
  },
  "devServers": [
    { "name": "frontend", "path": "/path/to/frontend", "command": "npm run dev" }
  ],
  "defaults": {
    "model": "sonnet",
    "permissions": "default",
    "workingDirectory": "~/Code"
  }
}
```

## Custom Workflows

Define your own team workflows in the config:

```json
{
  "workflows": [
    {
      "id": "deploy",
      "name": "Deployment Pipeline",
      "description": "Ship code safely",
      "icon": "Rocket",
      "steps": [
        { "id": "test", "name": "Run Tests", "agents": ["qa"] },
        { "id": "review", "name": "Code Review", "agents": ["reviewer"] },
        { "id": "deploy", "name": "Deploy", "agents": ["deployer"] }
      ]
    }
  ]
}
```

When an agent system with a `sprints/` directory is detected, the built-in Sprint Planning workflow is registered automatically. Custom workflows are registered alongside it.

If no agent system is configured and no custom workflows are defined, the Teams tab shows an empty state with setup instructions.

## Tech Stack

- Next.js 16 + React 19
- xterm.js (terminal emulation)
- node-pty (PTY management)
- WebSocket (real-time streaming)
- Tailwind CSS + Radix UI
- Zustand (state management)

## License

MIT
