<div align="center">

# Agent Studio

**The command center for Claude Code.**

Stop juggling terminal tabs. See every AI session, its cost, and its context window — in one dashboard.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node 22+](https://img.shields.io/badge/node-22%2B-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org)

[Get Started](#quick-start) · [Features](#features) · [How It Works](#how-it-works) · [Docs](HOWTO.md)

</div>

---

![Agent Studio — Sessions](public/screenshot-sessions.png)
*Manage multiple Claude Code sessions from one dashboard*

> **New to AI agents?** Agent Studio scans your projects, generates custom agents for your codebase using Claude, and runs them on a schedule — no configuration needed. [Set up in 2 minutes.](#first-run)

---

## The Problem

You're running Claude Code. You open a terminal, start a session. Then another. Then another. Now you have six tabs, no idea what's happening in each, no clue what it's costing you, and you just lost that session from yesterday because you forgot the ID.

And if you want agents that actually collaborate — a frontend specialist, a QA tester, a security reviewer — you're building that from scratch every time.

## The Solution

Agent Studio gives you **one dashboard** to:

| | |
|---|---|
| **Run sessions side by side** | Up to 6 Claude Code sessions in a grid. Real terminals, not API wrappers. |
| **Track costs in real time** | Token count, dollar cost, and context window % for every session. |
| **Generate agents with AI** | Point at your codebase. Claude analyzes it and writes custom agent definitions in 30 seconds. |
| **Automate the boring stuff** | Schedule background scans. Get reports. Approve before anything changes. |
| **Build agent memory** | Agents learn from mistakes. Create, pin, and search shared knowledge. |
| **Manage git everywhere** | Multi-repo status, branches, diffs, and PRs from one place. |
| **Never lose a session** | Browse and resume any previous session with one click. |

## Quick Start

```bash
git clone https://github.com/VatsalEnpal/Agent-studio.git
cd Agent-studio && npm install && npm run dev
```

Open **http://localhost:8080**. That's it.

## Desktop App (Electron)

Run Agent Studio as a native desktop app with macOS notifications:

```bash
# Development — starts server + Electron together
npm run electron:dev

# Build .dmg
npm run build:mac
```

The desktop app includes:
- Native macOS notifications for approvals, completions, and alerts
- Menu bar tray icon for quick access
- No browser tab needed — Cmd+Tab to Agent Studio
- All keyboard shortcuts work natively (no browser conflicts)
- IPv4/IPv6 compatibility, `allowedDevOrigins` for secure dev mode, configurable `EXTERNAL_SERVER_PORT`

> **Requires:** [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated. Node.js 22+. Agent Studio checks on startup and tells you exactly what's missing.
>
> **Key dependency:** `@anthropic-ai/claude-agent-sdk` — used for room agent communication. Installed automatically via `npm install`.
>
> **Platforms:** macOS, Linux, and Windows (requires Claude Code CLI installed on all platforms).

## First Run

Agent Studio scans your machine automatically:

1. **Finds your projects** — checks common directories for git repos
2. **Detects your tech stack** — reads package.json, requirements.txt, go.mod, etc.
3. **Generates custom agents** — Claude analyzes your codebase and creates agents tailored to your project
4. **You're done** — launch your first session

No config files. No YAML. No manual setup. Everything is reconfigurable later through Settings.

## How It Works

```
Your browser  <-->  Agent Studio  <-->  Claude Code CLI (on your machine)
```

Agent Studio has two communication modes:

- **Individual sessions** — Spawn real Claude Code processes in PTY terminals. Full color, scroll, and interactive control — the same experience as running Claude in your own terminal.
- **Room agents** — Use `@anthropic-ai/claude-agent-sdk` for structured, streaming communication. Room agents return clean text replies (no terminal escape codes), support TalkTo-style messaging between agents, and stream responses with typing indicators.

Your permissions, tools, MCP servers, and file access all work exactly as they do in the CLI. Agent Studio doesn't call the Anthropic API directly.

Full technical details in [ARCHITECTURE.md](ARCHITECTURE.md).

## Features

### 🖥️ Session Management

- **Terminal Grid** — Run 1 to 6 Claude Code sessions side by side. Each is a real terminal with full color, scroll, and zoom.
- **Live Metrics** — See token count, dollar cost, context window %, and model name on every session. Updated every 30 seconds.
- **Session Presets** — One-click launchers: Quick Chat (Sonnet, no agent), Start Sprint (Opus + orchestrator), Security Audit, PMO Scan. Create your own.
- **Resume Any Session** — Every past session is saved. Search by name, project, or agent. Click to resume exactly where you left off.
- **Terminal Reliability** — Tree-kill escalation ensures zombie processes are cleaned up. Spawn semaphore prevents overloading. Shell readiness detection before sending input.
- **Keyboard First** — Cmd+Shift+K opens a command palette. Cmd+Shift+N launches a session. Cmd+Shift+1-6 jumps between sessions. Tab cycles focus. (Use Ctrl+Shift on Windows/Linux.)

### 🤖 Agent System

- **AI Agent Generation** — Tell Agent Studio about your project. It runs Claude to analyze your codebase — package.json, file structure, README — and generates custom agent definitions tailored to your stack. A React + FastAPI project gets a frontend agent that knows React patterns, a backend agent that knows FastAPI, and a QA agent that knows both.
- **Scaffolding** — Creates the full agent directory structure: `.claude/agents/` for Claude Code entry points, `ai-agents/` for deep agent rules, memory system, sprint infrastructure. One click.
- **Battle-Tested Templates** — Every generated agent includes reasoning protocols ("How You Think"), confidence signals, environment boundaries, memory read/write, handoff patterns, and self-verification. Patterns learned from running 200+ real agent sessions.
- **Works Without AI Too** — No Claude CLI? The wizard falls back to a template picker where you select agents manually. The scaffolding still works.

### 💬 Room Chat

- **Streaming Replies** — Room agents respond with real-time streaming, showing typing indicators while generating. TalkTo-style messaging between agents and humans.
- **Markdown Rendering** — Agent replies render full Markdown (code blocks, lists, links) directly in the chat interface.
- **Claude Agent SDK** — Room communication uses `@anthropic-ai/claude-agent-sdk` instead of PTY parsing, producing clean structured text with no terminal artifacts.

### 🔄 Automations & Reports

- **Scheduled Scans** — Set up automations like "check for TypeScript errors every 2 hours" or "review security vulnerabilities daily." Agent Studio runs Claude in the background and produces a report.
- **Approval Gates** — Nothing touches your code without your sign-off. Every automation produces a report with suggested actions. You approve, dismiss, or cherry-pick individual actions.
- **Templates** — Start from built-in templates (Code Health, Security Scanner, PR Reviewer, Dependency Updater) or write your own prompt.
- **Reports Dashboard** — A dedicated tab to view all reports, filter by status (pending / approved / dismissed), and take action.

### 🧠 Memory & Knowledge

- **Shared Memory** — Agents write learnings, corrections, and decisions to a shared knowledge base. When one agent discovers a pattern, every other agent knows it next session.
- **Memory Browser** — Search and filter memories by title, content, tags, or category. Pin important memories so agents always load them first.
- **Create & Edit** — Add memories from the dashboard. Tag them, categorize them, update them as your project evolves.

### 🔀 Workflows

![Agent Studio — Teams & Workflows](public/screenshot-teams.png)
*Track workflows and coordinate agent teams*

- **Custom Workflows** — Build multi-step agent pipelines. Example: "Backend builds → Frontend wires → QA tests → Security reviews." Each step has an assigned agent and runs in sequence.
- **Templates** — Start from built-in workflows (Sprint Planning, Code Review, Bug Fix, Feature Build) or create your own from scratch.
- **Visual Timeline** — See each step's status, which agent is assigned, and what's completed — all in a timeline view.

> **Note:** Teams, Memory, and Workflows features require an `ai-agents/` folder in your project. This is created automatically when you:
> - Go through the onboarding flow ("Set me up")
> - Click "Create Agent System" in Settings
> - Or create it manually ([see guide](HOWTO.md#set-up-the-agent-system))
>
> Without it, these tabs show helpful empty states. Everything else (sessions, reports, git, automations) works without it.

### 🛠️ Developer Tools

![Agent Studio — Settings](public/screenshot-settings.png)
*Configure your workspace, automations, and preferences*

- **Git Dashboard** — See status of all your repos at a glance. Branches, dirty state, ahead/behind counts. Stage, commit, push, and create PRs without leaving the app.
- **Dev Server Management** — Start and stop your project's dev servers from the sidebar.
- **System Monitor** — CPU, RAM, disk usage, active sessions, WebSocket connections — all in the Settings tab.
- **Docker Support** — `docker compose up` mounts your Claude credentials and gets you running. Claude CLI pre-installed in the image.

## Why Not Just Terminal Tabs?

| | Terminal | Agent Studio |
|---|---|---|
| See all sessions | One tab at a time | Up to 6 in a grid |
| Token costs | Hidden | Real-time per session |
| Resume sessions | Remember the ID | One-click dropdown |
| Set up agents | Write .md files manually | AI generates them |
| Background scans | Cron + scripts | Built-in with approval gates |
| Git across repos | cd between directories | Single dashboard |

## Docker

```bash
docker compose up
```

Mounts your Claude credentials automatically. See [Docker docs](HOWTO.md#run-in-docker) for details.

## Contributing

```bash
git clone https://github.com/VatsalEnpal/Agent-studio.git
cd Agent-studio && npm install && npm run dev
```

[Architecture guide](ARCHITECTURE.md) · [How-to guide](HOWTO.md)

## License

MIT
