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

> **Requires:** [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated. Node.js 22+. Agent Studio checks on startup and tells you exactly what's missing.

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

Agent Studio spawns real Claude Code processes — the same ones you'd run in your terminal. It doesn't call the Anthropic API directly. Your permissions, tools, MCP servers, and file access all work exactly as they do today.

The difference: you can see everything at once, track what it costs, and manage it from one place.

Full technical details in [ARCHITECTURE.md](ARCHITECTURE.md).

## Features

**Session Dashboard** — Terminal grid (1-6 sessions), real-time token/cost/context tracking, session presets, one-click resume from history, keyboard-first navigation with Cmd+K command palette.

**Agent Operations** — AI-powered agent generation, scaffolding wizard, battle-tested templates with reasoning protocols and memory systems, approval-gated automations, custom workflow builder.

**Developer Tools** — Multi-repo git dashboard with PR creation, dev server management, system monitor, Docker support.

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
