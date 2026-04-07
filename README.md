<div align="center">

<img src="public/icon.png" width="80" />

# Agent Studio

A desktop app for running Claude Code sessions, agent teams, and automated workflows — all in one window.

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org)

</div>

---

## What You Get

When you open Agent Studio, you land on **Sessions** — a terminal grid where you run Claude Code.

![Sessions](public/screenshot-sessions.png)

Launch a session and you get a real interactive terminal (`node-pty` + xterm.js) with live stats: token count, cost, context %, model name. Run up to 6 sessions side by side. Use presets like Quick Chat, Start Sprint, or Security Audit — or configure everything yourself. Resume any past session with one click.

---

From Sessions, switch to **Teams** — chat rooms where your agents work together.

![Teams](public/screenshot-teams.png)

Each room runs agents through the [Claude Agent SDK](https://docs.anthropic.com/en/docs/claude-code/sdk). You @mention an agent, it responds with clean text (no terminal noise). Agents take turns — one at a time, with depth limits so they don't loop. You see streaming responses and typing indicators. Think of it as Slack for your AI team.

---

For bigger tasks, there's **Sprints** — multi-step pipelines with gates.

![Sprints](public/screenshot-sprints.png)

Define a pipeline: PMO Scan → Readiness → Design → Build → Test → Security → Ship. Each gate shows pass, fail, or in-progress. Some gates need your approval before proceeding. The system estimates ETA from how fast previous gates completed. You can pause, resume, or cancel at any point.

---

Everything agents learn goes into **Knowledge** — a shared memory across all sessions.

![Knowledge](public/screenshot-knowledge.png)

When one agent figures out your API needs pagination headers, it writes that to memory. Next session, every agent knows it. You can search, filter by category (Learnings, Corrections, Decisions), pin important entries, or add your own. It's the institutional knowledge your agent team builds over time.

---

Configure everything in **Settings**.

![Settings](public/screenshot-settings.png)

Default model (Opus / Sonnet / Haiku), permissions, working directory. Per-event notifications — gate approvals, dangerous actions, task completion, session exit, context warnings. Multi-project workspace tracking with production repo safeguards. Keyboard shortcuts for everything.

---

## Other Things It Does

- **Git** — auto-detects repos, shows branch + dirty state + ahead/behind, create PRs via GitHub CLI
- **Dev Servers** — finds local servers running on your machine
- **Automations** — scheduled headless Claude runs that produce reviewable reports
- **Command Palette** — `Cmd+K` to navigate anywhere fast
- **Onboarding** — first-run wizard analyzes your project and generates agents for it
- **Mac App** — native Electron shell with system tray, notifications, and crash recovery
- **Docker** — `docker build -t agent-studio . && docker run -p 8080:8080 -v $HOME/.claude:$HOME/.claude agent-studio`

---

## How It Works

```
┌────────────────────────────────────────────────────┐
│  Electron (optional)  — mac shell, tray, recovery  │
├────────────────────────────────────────────────────┤
│  Next.js 16 + React 19  — UI, state, terminals     │
├────────────────────────────────────────────────────┤
│  Express 5  — API, WebSocket, file watchers         │
├───────────────────────┬────────────────────────────┤
│  node-pty              │  Claude Agent SDK           │
│  (terminal sessions)   │  (room agents)              │
└───────────────────────┴────────────────────────────┘
```

Terminal sessions spawn Claude Code as a PTY process — you get a real terminal. Room agents use the SDK for structured chat — clean text, no ANSI. Both stream to the UI over WebSocket.

**Tech:** Next.js 16, React 19, TypeScript (strict), Tailwind CSS, Zustand, Express 5, node-pty, xterm.js, Claude Agent SDK, Electron, chokidar, esbuild, Vitest.

---

## Getting Started

**Requirements:** Node.js 22+ and [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) authenticated.

```bash
git clone https://github.com/VatsalEnpal/Agent-studio.git
cd Agent-studio
npm install
npm run dev
```

Open [localhost:8080](http://localhost:8080). A setup wizard walks you through first-time config.

**Mac desktop app:**
```bash
npm run electron:dev
```

**Production build:**
```bash
npm start
```

**All commands:**

| Command | What it does |
|---------|-------------|
| `npm run dev` | Dev server with hot reload → localhost:8080 |
| `npm run electron:dev` | Dev server + Electron window together |
| `npm start` | Build and start production server |
| `npm run build:mac` | Build macOS `.dmg` |
| `npm run type-check` | TypeScript strict mode check |
| `npm run test` | Run Vitest tests |

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| New session | `Cmd+Shift+N` |
| Command palette | `Cmd+K` |
| Toggle sidebar | `Cmd+Shift+\` |
| Focus session 1–6 | `Cmd+Shift+1–6` |
| Fullscreen pane | `Cmd+Enter` |
| Navigate sections | `Cmd+1–4` |
| Settings | `Cmd+,` |

---

## Docs

- **[HOWTO.md](HOWTO.md)** — full user guide: features, shortcuts, agents, automations, troubleshooting
- **[CLAUDE.md](CLAUDE.md)** — contributor and agent instructions

---

## License

[MIT](LICENSE)
