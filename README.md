# Agent Studio

A command center for developers who run AI coding agents.

## The Problem

If you use Claude Code, you already know the pattern: open a terminal, start a session, open another terminal, start another session. Before long you have six tabs, no idea which agent is doing what, no visibility into token spend, and no way to manage it all without juggling windows.

Terminal tabs were not designed for this.

## The Solution

Agent Studio gives you a single dashboard to run, monitor, and manage multiple Claude Code sessions. It spawns real CLI processes -- not API wrappers -- so you get the exact same behavior as your terminal, with a management layer on top: a visual grid, real-time cost tracking, git operations, session history, and an agent scaffolding system.

<!-- Screenshots coming soon -->

## What You Can Do

**Run multiple AI sessions at once.**
Launch up to six Claude Code sessions in a tiled grid. Focus, fullscreen, zoom, or cycle between them. Each session is a real PTY process with full tool access and MCP support.

**See what your agents are costing you.**
Every session displays token usage, dollar cost, and context window percentage in real time. No more guessing whether that Opus session has burned through your budget.

**Never lose a session again.**
Browse and resume previous Claude Code sessions from a searchable dropdown. One click to pick up where you left off.

**Set up agents for your project in minutes.**
The scaffolding wizard generates a complete agent system -- agent definitions, memory index, sprint infrastructure, and Claude Code entry points -- tailored to your project. Choose which agents you need, pick a workflow template, and go.

**Automate the boring stuff.**
Define multi-step workflows with step-by-step execution. Schedule periodic scans. Set up automation templates that run headless agent loops on a cadence you control.

**Keep your git in check.**
A multi-repo dashboard polls your projects and shows branch status, dirty state, and ahead/behind counts. Stage, commit, push, and create pull requests without leaving the app.

**Remember what your agents learn.**
Browse your agent memory index with search and filters. See what patterns your agents have discovered, what corrections they have made, and what decisions they have recorded.

## Who Is This For

Developers and teams using Claude Code who run multiple agents as part of their daily workflow and want visibility and control over what those agents are doing.

## Requirements

- **Node.js 22+**
- **[Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)** installed and authenticated
- **Git**
- macOS or Linux (Windows is untested)

## Quick Start

```bash
git clone https://github.com/VatsalEnpal/Agent-studio.git
cd Agent-studio
npm install
npm run dev
```

Open [http://localhost:8080](http://localhost:8080).

## First Run

On first launch, Agent Studio runs a **setup wizard** that auto-detects your projects and git repos, configures default models and permissions, and optionally scaffolds an agent system. You can skip steps and change everything later in Settings.

After setup, press `Cmd+N` to launch your first session. The grid handles layout automatically.

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
| Session presets | Aliases/scripts | Built-in (Quick Chat, Sprint, Security Audit, etc.) |
| Kill runaway agents | Find PID, kill manually | One click |

## How It Works

Agent Studio does not call the Anthropic API. It spawns real Claude Code CLI processes using `node-pty` (the same library VS Code uses for its terminal) and pipes I/O through a WebSocket to the browser. You get the exact same behavior as your local terminal -- permissions, tools, MCP servers -- with a visual layer on top.

```
Browser (xterm.js)  <-->  WebSocket  <-->  Express Server  <-->  node-pty  <-->  Claude Code CLI
```

Everything runs on a single port. One command to start, one URL to open. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full technical reference.

## Configuration

Agent Studio stores config in `.agent-studio.json` in your working directory. It generates automatically on first run. Edit it directly or use the Settings UI.

Key options: projects (paths, prod flags, tracked branches), default model (opus/sonnet/haiku), permissions mode, dev server commands, and workflow definitions. See [HOWTO.md](HOWTO.md) for the full configuration guide.

## Keyboard Shortcuts

`Cmd+K` opens the command palette -- from there you can find any action. `Cmd+N` launches a new session, `Cmd+1` through `Cmd+6` jump to sessions by grid position, and `Cmd+Enter` toggles fullscreen. Full shortcut reference is in [HOWTO.md](HOWTO.md).

## Docker

```bash
docker build -t agent-studio .
docker run -it -p 8080:8080 -v $HOME:$HOME agent-studio
```

Mount your home directory so Claude Code can access your projects and config. The CLI must be available inside the container.

## Roadmap

- AI-powered agent generation: describe your project, get tailored agents
- Headless automation with approval gates
- GitHub/GitLab webhook triggers for automatic agent responses
- Team multiplayer with shared dashboards
- Cost budgets and alerts
- Session recordings and replay

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
