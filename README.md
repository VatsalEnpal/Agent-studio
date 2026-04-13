<div align="center">

# Agent Studio

**Terminal-first command center for AI coding agents.**

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org)
[![Node 22+](https://img.shields.io/badge/node-22%2B-green.svg)](https://nodejs.org)

<!-- TODO: Replace with actual demo video once recorded -->
<!-- ![Agent Studio Demo](demo-videos/final_demo.mp4) -->

</div>

---

Multiple Claude Code terminals side by side. Agent-to-agent chat rooms. Multi-step pipelines with approval gates. A knowledge base that persists across sessions. One app, one window.

---

## Features

### Sessions

Launch up to 6 Claude Code terminals in a grid. Each one is a full interactive PTY with live stats: tokens, cost, context window %, model. Use presets (Quick Chat, Security Audit) or configure model, agent, working directory, and permissions yourself. Resume any past session. Fullscreen any pane. Zoom per-pane.

### Agent Teams (Rooms)

Create a chat room, assign agents, give them a task. They collaborate through @mentions — one finds the bug, tags another to fix it, a third writes the test. Turn-based protocol: one agent at a time, depth limits, no loops. Clean text output, no terminal noise. Human approval gates for anything risky.

### Sprint Pipelines

Define a multi-step workflow: scan, design, build, test, security review, ship. Each step passes, fails, or waits for approval. Gate toggles (skip/require) per step. QA loops. Scheduling. Progress tracking with time estimates. Nothing ships without your say-so.

### Memory

Agents write learnings to a shared knowledge base — deploy flags, flaky tests, API quirks. Every session starts with context. Search, filter by category, pin entries, add your own notes. Agents improve on your codebase over time.

### Agent Creation

First-run wizard scans your project with Claude Code CLI, detects your stack, and generates project-specific agents (not generic "frontend" / "backend" — actual agents that know your frameworks, patterns, and conventions). Edit, refine, or create agents manually from Settings.

### Git Integration

Auto-detects repos in your workspace. Shows branch, dirty state, changed files. Commit, push, and create PRs from the sidebar. Branch management with tracked branches. Production repo safeguards (PROD badge, push confirmation).

### Dev Server Monitor

Auto-discovers local dev servers running on your machine (Next.js, Vite, Express, etc.). Shows port, PID, uptime. Add custom servers.

### Automations

Scheduled headless Claude Code runs that produce reviewable reports. Configure schedule, model, and prompts. Results appear in the Reports tab.

### Settings

Default model (Opus / Sonnet / Haiku), permission level, working directory. Notifications for gate approvals, dangerous commands, task completion, session exits, context warnings. Multi-project workspace. Agent management. System monitor (CPU, memory, disk, active sessions).

---

## Quick Start

**Requirements:** Node.js 22+ and [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated.

```bash
git clone https://github.com/VatsalEnpal/Agent-studio.git
cd Agent-studio
npm install
npm run dev
```

Open [localhost:8080](http://localhost:8080). The setup wizard walks you through project configuration and agent generation.

**Mac desktop app:**

```bash
npm run electron:dev     # dev mode
npm run build:mac        # build .dmg
npm run install:mac      # install to /Applications
```

**Docker:**

```bash
docker build -t agent-studio .
docker run -p 8080:8080 -v $HOME/.claude:$HOME/.claude agent-studio
```

| Command                | What it does                 |
| ---------------------- | ---------------------------- |
| `npm run dev`          | Dev server on localhost:8080 |
| `npm run electron:dev` | Dev + Electron together      |
| `npm start`            | Production build + start     |
| `npm run build:mac`    | macOS `.dmg`                 |
| `npm run type-check`   | TypeScript strict check      |
| `npm run test`         | Vitest tests                 |

---

## Architecture

```
+-----------------------------------------------------+
|  Electron (optional) -- mac shell, tray, recovery    |
+-----------------------------------------------------+
|  Next.js 16 + React 19 -- UI, state, terminals       |
+-----------------------------------------------------+
|  Express 5 -- API, WebSocket, file watchers           |
+------------------------+----------------------------+
|  node-pty              |  Claude Agent SDK           |
|  (terminal sessions)   |  (agent chat rooms)         |
+------------------------+----------------------------+
```

Terminal sessions spawn Claude Code as a real PTY process. Agent chat uses the [Claude Agent SDK](https://docs.anthropic.com/en/docs/claude-code/sdk) for structured conversations. Both stream to the UI over WebSocket.

**Stack:** Next.js 16 / React 19 / TypeScript (strict) / Tailwind CSS / Zustand / Express 5 / node-pty / xterm.js / Claude Agent SDK / Electron / esbuild / Vitest

---

## Keyboard Shortcuts

| Shortcut        | Action                         |
| --------------- | ------------------------------ |
| `Cmd+Shift+N`   | Open session launcher          |
| `Cmd+Shift+K`   | Command palette                |
| `Cmd+Shift+\`   | Toggle sidebar                 |
| `Cmd+Shift+F`   | Toggle fullscreen mode         |
| `Cmd+Enter`     | Fullscreen focused pane        |
| `Cmd+Shift+1-6` | Focus session by position      |
| `Tab`           | Cycle focus between sessions   |
| `Escape`        | Exit fullscreen / close modals |

---

## Configuration

**`.agent-studio.json`** in your home directory stores workspace config: projects, defaults, notification preferences.

**`.claude/agents/`** in your project stores agent definitions. Each `.md` file is an agent with a YAML frontmatter (name, description, tools) and a system prompt body.

**Environment variables:**
| Variable | Purpose |
|----------|---------|
| `PORT` | Server port (default: 8080) |
| `DEMO_MODE` | When `true`, sanitizes terminal output (hides usernames, API keys) for recordings |

---

## Design

Dark theme. Geist Mono. Amber accent (`#f59e0b`). Minimal chrome, maximum terminal. Designed to look like a tool engineers actually want open all day.

---

## Docs

- **[HOWTO.md](HOWTO.md)** -- full user guide
- **[CLAUDE.md](CLAUDE.md)** -- contributor and agent instructions

---

## Acknowledgements

The agent chat feature was inspired by **[TalkTo](https://github.com/hyperslack/talkto)** by [@hyperslack](https://github.com/hyperslack) -- a local-first messaging server that lets AI agents from different tools talk to each other via MCP. Same core idea -- agents shouldn't work in isolation. Two different approaches.

---

## License

[MIT](LICENSE)
