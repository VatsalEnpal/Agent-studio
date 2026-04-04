<div align="center">

# Agent Studio

**The command center for AI coding agents.**

Manage sessions, coordinate agent teams, run autonomous sprints with gate protocols, and build shared agent memory — from one native Mac app.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node 22+](https://img.shields.io/badge/node-22%2B-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org)
[![Electron](https://img.shields.io/badge/Electron-Mac%20App-9B59B6.svg)](https://www.electronjs.org)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-SDK-4F8FF7.svg)](https://docs.anthropic.com/en/docs/claude-code)

[Get Started](#quick-start) · [Features](#features) · [Architecture](#architecture)

</div>

---

![Agent Studio — Sessions](public/screenshot-sessions.png)

## What is this?

Agent Studio is a native Mac desktop app for managing AI coding agents. It gives you one dashboard for everything: terminal sessions with live cost tracking, team rooms where agents collaborate, sprint automation with gate protocols, and a shared knowledge base that agents learn from.

Every session is a real Claude Code process on your machine. Agent Studio doesn't call the Anthropic API directly — your permissions, MCP servers, and tools work exactly as in the terminal.

## Why this exists

Running one Claude Code session is simple. Running a team of 8 agents across frontend, backend, QA, security, and orchestration — with autonomous sprints — is not.

Agent Studio was built out of that need. It manages the full agent lifecycle: spawn, coordinate, track, learn, repeat.

## Features

### Sessions

Real terminals via `node-pty` + xterm.js. Each session runs Claude Code in a full PTY with color output, scroll, and zoom. Terminal instances are pooled and reattached on switch (VS Code pattern — no re-render flicker).

- **Live metrics** — Token count, dollar cost, context window %, model name per session
- **Resume any session** — Browse and resume past sessions with one click
- **Presets** — Quick Chat, Start Sprint, Security Audit, or create your own
- **Cmd+K palette** — Fast navigation, session switching, sprint search

![Agent Studio — Teams](public/screenshot-teams.png)

### Team Rooms

Rooms where agents collaborate via `@anthropic-ai/claude-agent-sdk`. Clean structured text — no terminal noise.

- **@mention routing** — Direct messages to specific agents or `@all` for broadcast
- **Turn-based protocol** — One agent at a time, depth limit of 10, no self-loops
- **Streaming** — Typing indicators and real-time text deltas
- **Spawn/stop** — Start and tear down agent sessions per room

![Agent Studio — Sprints](public/screenshot-sprints.png)

### Sprint Automation

Track autonomous multi-agent work through a gate-based protocol. Each sprint passes through stages (PMO scan, readiness report, approval, design, build, test, security) with visual progress.

- **Gate stepper** — Horizontal visualization with pass/fail/in-progress states
- **Sprint history** — Archived sprints with completion dates and QA scores
- **Pause/resume/cancel** — Full lifecycle control
- **File watching** — Live state from `ai-agents/sprints/state.json` via chokidar

![Agent Studio — Knowledge](public/screenshot-knowledge.png)

### Knowledge Base

Agents write learnings, corrections, and decisions to shared memory. When one agent discovers a production pattern, every other agent knows it next session.

- **Search + filter** — By title, content, tags, or category
- **Pin important memories** — Agents always load pinned entries first
- **Create/edit from UI** — Manual memory management alongside auto-generated entries

### Settings & Git

- Auto-discovered agents from `.claude/agents/`
- Multi-repo git status with branch, dirty state, PR creation
- System monitoring (CPU, RAM, disk, WebSocket connections)
- Default model, permissions, and working directory config
- Notification preferences (gate approvals, dangerous actions, task completion)

![Agent Studio — Settings](public/screenshot-settings.png)

## Requirements

- **macOS** (Electron desktop app)
- **Node.js 22+**
- **Claude Code CLI** installed and authenticated ([install guide](https://docs.anthropic.com/en/docs/claude-code))

Agent Studio checks all of this on startup and tells you exactly what's missing.

## Quick Start

```bash
git clone https://github.com/VatsalEnpal/Agent-studio.git
cd Agent-studio
npm install
```

**Browser:**
```bash
npm run dev
# Open http://localhost:8080
```

**Mac app:**
```bash
npm run electron:dev
```

**Build .dmg:**
```bash
npm run build:mac
```

## Architecture

```
Electron shell  ←→  Express 5 server  ←→  Claude Code CLI
                         ↕
                    Next.js 16 UI
```

| Layer | What it does |
|-------|-------------|
| **Frontend** | Next.js 16, React 19, Tailwind CSS, Zustand, xterm.js |
| **Server** | Express 5, WebSocket (ws), node-pty, chokidar file watching |
| **Terminal sessions** | `node-pty` spawns real Claude Code processes |
| **Room agents** | `@anthropic-ai/claude-agent-sdk` for structured chat |
| **Electron** | Thin shell — server lifecycle, crash recovery, health watchdog, native notifications, tray icon |

### Project Structure

```
server/                 Express backend
  routes/               API route modules
  managers/             Process tracker, message filter, conversation protocol, sprint manager
  workflows/            Sprint planning engine
src/                    Next.js frontend
  components/           Organized by page (sessions, teams, sprints, memory, settings)
  stores/               Zustand state stores
  lib/                  WebSocket client, design tokens, utilities
electron/               Main process, preload, IPC bridge
```

## Testing

```bash
npm run test           # Vitest unit tests (140+ tests)
npm run type-check     # TypeScript strict mode
npm run test:smoke     # 30-second endpoint + WebSocket smoke test
```

Electron QA uses Playwright with `_electron.launch()` to test the actual Mac app — window management, native features, and all 5 pages.

## Development

```bash
npm run dev            # Dev server with hot reload
npm run electron:dev   # Dev server + Electron together
npm run build:mac      # Build macOS .dmg
npm run build:server   # Pre-compile server for packaging (esbuild)
```

## License

MIT

---

<div align="center">

Built by [Vatsal](https://github.com/VatsalEnpal) — for managing AI agent teams on real production codebases.

</div>
