# Agent Studio

A command center for developers who run AI coding agents. Two things in one app: a dashboard that shows all your Claude Code sessions at a glance, and an operations layer that turns Claude Code into a team of specialized agents working on your project.

## The Problem

If you use Claude Code, you know the pattern: open a terminal, start a session, open another, start another. Before long you have six tabs, no idea which agent is doing what, no visibility into token spend, and no way to manage it all without juggling windows.

And if you want agents that actually collaborate -- a frontend specialist, a QA tester, a security reviewer -- you are left building that structure from scratch every time.

## What Agent Studio Does

### 1. Session Dashboard

This is what you see when you open Agent Studio: all your Claude Code sessions, side by side, with everything you need to manage them.

The terminal grid displays up to six sessions in a tiled layout. Each tile is a real Claude Code process with full tool access and MCP support. Focus on one, fullscreen it, or watch them all work in parallel. Every session shows live metrics -- tokens used, dollar cost, and context window percentage -- so you always know what a session is costing and how much room it has left.

Session history lets you browse and resume previous Claude Code conversations from a searchable list. No more hunting through terminal scrollback or remembering session IDs.

The git dashboard polls your projects and shows branch status, uncommitted changes, and ahead/behind counts across multiple repos. Stage, commit, push, and create pull requests without leaving the app. If you manage several repositories, this replaces the constant context-switching between terminal windows.

Keyboard shortcuts keep everything fast. `Cmd+N` launches a new session. `Cmd+1` through `Cmd+6` jump between grid positions. `Cmd+K` opens the command palette for any action. `Cmd+Enter` toggles fullscreen.

### 2. Agent Operations

This is how you set up a team of AI agents for your project and keep them running -- even when you are not watching.

**Scaffolding.** Agent Studio generates a set of instruction files that tell Claude Code how to behave as different specialists. A frontend agent that knows your React patterns. A QA agent that tests your app. A backend agent that writes your database migrations. An orchestrator that delegates work across the team. The scaffolding wizard creates these definitions (`.claude/agents/*.md` files), a shared memory index, and sprint infrastructure, all tailored to the agents you choose and the workflow template you pick.

**Automations.** Set up a scan that runs every few hours. It launches Claude Code in the background, checks your code for problems, and writes a report. You review the report in the dashboard and approve or dismiss the suggested fixes. Nothing happens to your codebase without your sign-off. This is headless Claude Code on a schedule, with you as the gatekeeper.

**Shared memory.** Agents write what they learn -- patterns, corrections, decisions -- to a shared memory system. When one agent discovers that a particular API returns dates in an unexpected format, that knowledge is available to every other agent in the next session. The memory browser in the dashboard lets you search, filter, and review everything your agents have recorded.

**Workflow templates.** Pre-built configurations for common patterns: sprint planning, CI/CD pipelines, security audits. Pick a template during setup or create your own. Each template defines which agents participate, what automations run, and how work flows between them.

### Built and Working

**Session Dashboard**
- Terminal grid with up to 6 concurrent sessions
- Real-time token usage, cost, and context window tracking per session
- Session history with search and one-click resume
- Session presets (Quick Chat, Sprint, Security Audit, and custom)
- Multi-repo git dashboard with branch status, staging, commit, push, and PR creation
- Dev server management (start, stop, monitor)
- Command palette and full keyboard shortcut system

**Agent Operations**
- Setup wizard with project detection, agent selection, and workflow templates
- Agent scaffolding (generates `.claude/agents/`, `ai-agents/` directory structure, memory index)
- Agent team configuration (orchestrator, frontend, backend, QA, security, PMO, documentation, clearing)
- AI agent generation -- describe your project, Claude analyzes your codebase and generates tailored agent definitions (uses Haiku for analysis, Sonnet for generation, costs ~$0.02 per setup)
- Automation engine with scheduled headless Claude Code runs
- Reports dashboard for reviewing and approving automated actions
- Shared memory browser with search and filtering
- Workflow template library

### In Development

- **Approval-gated automations** -- scheduled headless scans produce reports; nothing happens until you approve. The engine exists, the approval flow is next. *Why: automated agents should never change your code without your say-so.*
- **Cost budgets and alerts** -- set a dollar limit per session or per day, get warned before you burn through it. *Why: a single runaway session can cost real money, and there is no built-in kill switch.*
- **Session recordings** -- replay what an agent did step by step, see the full conversation after it finishes. *Why: when something goes wrong, you need to trace what the agent actually did, not guess from the diff.*
- **Webhook triggers** -- connect to GitHub push events to auto-trigger agent scans when code lands on main. *Why: the best time to catch a problem is right after the code that caused it was merged.*
- **Context-aware presets** -- Agent Studio learns your patterns and suggests the right model + agent combo for common tasks. *Why: picking the right model and agent for every task is tedious, and most tasks are repetitive.*
- **Plugin system** -- add custom automation templates, report formats, and integrations without forking. *Why: every team has unique workflows, and hardcoding them all is not sustainable.*

## Quick Start

```bash
git clone https://github.com/VatsalEnpal/Agent-studio.git
cd Agent-studio
npm install
npm run dev
```

Open [http://localhost:8080](http://localhost:8080).

## First Run

On first launch, Agent Studio runs a setup wizard that detects your projects and git repos, configures default models and permissions, and offers to scaffold an agent system.

You can use Agent Studio in two ways. If you just want the session dashboard -- the terminal grid, cost tracking, git management -- skip the agent setup and start launching sessions immediately. If you want the full agent operations layer, the wizard walks you through choosing agents, picking a workflow template, and generating the scaffolding files for your project.

Everything is configurable after setup through the Settings UI.

## Why Not Just Terminal Tabs?

| | Terminal Tabs | Agent Studio |
|---|---|---|
| See all sessions at once | No (one tab at a time) | Yes (up to 6 in a grid) |
| Token usage and cost tracking | No | Yes, per session, real-time |
| Context window visibility | No | Yes (% used, total capacity) |
| Resume previous sessions | Manual (`claude --resume`) | One-click with search |
| Git status across repos | Switch between terminals | Single dashboard |
| Create PRs | CLI commands | Built-in modal |
| Scaffold agent systems | Manual file creation | Guided wizard with templates |
| Scheduled automations | Cron + scripts | Built-in with approval gates |
| Kill runaway agents | Find PID, kill manually | One click |

## How It Works

Agent Studio does not call the Anthropic API directly. It spawns real Claude Code CLI processes and pipes I/O through a WebSocket to the browser. You get the exact same behavior as your local terminal -- permissions, tools, MCP servers -- with a management layer on top.

```
Browser (xterm.js)  <-->  WebSocket  <-->  Express Server  <-->  node-pty  <-->  Claude Code CLI
```

Everything runs on a single port. One command to start, one URL to open. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full technical reference.

## Configuration

Agent Studio stores config in `.agent-studio.json` in your working directory. It generates automatically on first run. Edit it directly or use the Settings UI.

Key options: projects (paths, prod flags, tracked branches), default model, permissions mode, dev server commands, automation schedules, and workflow definitions. See [HOWTO.md](HOWTO.md) for the full configuration guide.

## Docker

Agent Studio's Docker image includes the Claude Code CLI. You just need to mount your existing credentials so the container can authenticate.

**Prerequisites:** Claude Code must be authenticated on your host machine first. Run `claude` in your terminal and complete the auth flow if you haven't already.

### Method 1: Docker Compose (recommended)

```bash
git clone https://github.com/VatsalEnpal/Agent-studio.git
cd Agent-studio
docker compose up
```

Open [http://localhost:8080](http://localhost:8080).

### Method 2: Docker run (manual mounts)

```bash
docker build -t agent-studio .
docker run -it \
  -p 8080:8080 \
  -v ~/.claude:/root/.claude:ro \
  -v ~/Code:/root/Code \
  agent-studio
```

### Volume mounts explained

- `~/.claude` is mounted read-only (`:ro`) -- the container reads your auth credentials but cannot modify them.
- `~/Code` is where your projects live -- change this path to match your setup. Inside the container, projects appear under `/root/Code/`.
- `.agent-studio.json` is persisted so your configuration survives container restarts.

On first run inside Docker, the setup wizard will ask you to point to projects under `/root/Code/...` (the mounted path).

## Requirements

- **Node.js 22+**
- **[Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)** installed and authenticated
- **Git**
- macOS or Linux (Windows is untested)

## Contributing

```bash
git clone https://github.com/VatsalEnpal/Agent-studio.git
cd Agent-studio
npm install
npm run dev        # Express + Next.js on port 8080
npm run type-check # Verify TypeScript compiles
```

Fork the repo, create a branch, make your changes, and open a PR.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, xterm.js v6, Zustand, Tailwind CSS, Radix UI |
| Server | Express 5, node-pty, ws, chokidar |
| Language | TypeScript (strict) |
| Testing | Vitest + Playwright |

## License

MIT
