<div align="center">

<img src="public/icon.png" width="80" />

# Agent Studio

A desktop app and web dashboard for running Claude Code.

Manage multiple terminal sessions, coordinate agents in chat rooms, run gate-based workflows, and track shared knowledge — in one window.

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org)

[Quick Start](#quick-start) &middot; [Features](#features) &middot; [How It Works](#how-it-works) &middot; [Development](#development)

</div>

---

![Sessions](public/screenshot-sessions.png)

## Quick Start

```bash
git clone https://github.com/VatsalEnpal/Agent-studio.git
cd Agent-studio
npm install
npm run dev
```

Open [localhost:8080](http://localhost:8080). A setup wizard walks you through first-time configuration.

**Requirements:**
- Node.js 22+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated (`claude --version` should work)

**Mac desktop app** (Electron):
```bash
npm run electron:dev
```

**Production build:**
```bash
npm start              # builds + starts server
```

**Docker:**
```bash
docker build -t agent-studio .
docker run -p 8080:8080 -v $HOME/.claude:$HOME/.claude agent-studio
```

---

## Features

### Terminal Sessions

![Sessions](public/screenshot-sessions.png)

Run up to 6 Claude Code sessions side by side with full color terminal via `node-pty` + xterm.js. Each session shows live token count, cost, context window %, and model. Launch with presets (Quick Chat, Start Sprint, Security Audit) or configure model, agent, and permissions. Resume any past session. `Cmd+Shift+N` to launch, `Cmd+K` command palette to navigate.

### Team Rooms

![Teams](public/screenshot-teams.png)

Chat rooms where agents collaborate via the [Claude Agent SDK](https://docs.anthropic.com/en/docs/claude-code/sdk). @mention agents to route messages. Turn-based protocol — one agent at a time, depth limits, no loops. Streaming responses with typing indicators. Clean text output, no ANSI terminal noise.

### Sprint Automation

![Sprints](public/screenshot-sprints.png)

Multi-gate pipelines: PMO Scan → Readiness → Design → Build → Test → Security → Ship. Visual gate stepper with pass/fail/in-progress states. Human approval gates. ETA estimates from gate completion history. Pause, resume, cancel at any point. Sprint history with agents and activity logs.

### Knowledge Base

![Knowledge](public/screenshot-knowledge.png)

Persistent memory shared across agents and sessions. When one agent discovers something, every agent knows it next session. Filter by category (Learnings, Corrections, Decisions, Human Inputs, Knowledge). Pin, search, create, and edit entries from the UI.

### Settings & Shortcuts

![Settings](public/screenshot-settings.png)

Default model, permissions, working directory. Per-event notifications (gate approvals, dangerous actions, task completion, session exit, context warnings). Multi-project workspace with production repo safeguards. Full keyboard shortcut reference.

### Also

- **Git** — auto-detected repos with branch, dirty state, ahead/behind. PR creation via GitHub CLI.
- **Dev Servers** — auto-detect local servers running on your machine.
- **Automations** — scheduled headless Claude Code runs that produce reviewable reports.
- **Command Palette** — `Cmd+K` for fast navigation.
- **Onboarding** — setup wizard generates agents tailored to your project.
- **Mac App** — Electron shell with system tray, native notifications, crash recovery.

---

## How It Works

```
┌─────────────────────────────────────────────────────────┐
│  Electron (optional) — mac app shell, tray, recovery    │
├─────────────────────────────────────────────────────────┤
│  Next.js 16 + React 19 — UI, Zustand state, xterm.js   │
├─────────────────────────────────────────────────────────┤
│  Express 5 — API, WebSocket, file watchers              │
├──────────────────────┬──────────────────────────────────┤
│  node-pty             │  Claude Agent SDK                │
│  (terminal sessions)  │  (room agents)                   │
└──────────────────────┴──────────────────────────────────┘
```

**Terminal sessions** spawn Claude Code as a PTY process. You get a real interactive terminal.

**Room agents** use `@anthropic-ai/claude-agent-sdk` to run Claude as a structured chat agent. Clean text responses, no terminal rendering.

Both connect to the UI over WebSocket for real-time updates.

---

## Project Structure

```
server/              Express backend
  index.ts           API routes, WebSocket, session lifecycle
  terminal-manager   PTY spawn/kill/resize
  sdk-session        Agent SDK session manager (rooms)
  rooms              Room state + persistence
  routes/            API modules (sessions, rooms, memory, sprint, git, settings)
  managers/          Process tracker, sprint manager
  workflows/         Sprint planning engine

src/                 Next.js frontend
  app/               Pages
  components/        Sessions, Teams, Sprints, Memory, Settings, Terminal, Layout
  stores/            Zustand (sessions, rooms, sprints, memory, git, ui)
  hooks/             Keyboard shortcuts, notifications, usage polling
  lib/               WebSocket client, types, utilities

electron/            Desktop shell
  main.js            Server lifecycle, crash recovery, tray
  preload.js         IPC for native notifications
```

---

## Development

```bash
npm run dev              # dev server → localhost:8080
npm run electron:dev     # dev + electron together
npm run type-check       # typescript strict mode
npm run test             # vitest
npm run test:smoke       # endpoint + websocket smoke
npm run build:mac        # macOS .dmg
```

See [HOWTO.md](HOWTO.md) for the full user guide — features, shortcuts, agents, automations, troubleshooting.

See [CLAUDE.md](CLAUDE.md) for contributor/agent instructions.

---

## Tech Stack

Next.js 16, React 19, TypeScript (strict), Tailwind CSS, Zustand, Express 5, node-pty, xterm.js, Claude Agent SDK, Electron, WebSocket, chokidar, esbuild, Vitest.

---

## License

[MIT](LICENSE)
