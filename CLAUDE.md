# agent-studio — Claude Code Instructions

## Project Overview

Web-based command center for AI coding agents. Manage Claude Code sessions, team rooms, and automated workflows from one dashboard. Also available as a native Mac app via Electron.

- **Languages**: TypeScript
- **Frameworks**: Next.js 16, React 19, Express 5, Tailwind CSS
- **Package Manager**: npm
- **Key Dependencies**: `@anthropic-ai/claude-agent-sdk`, `node-pty`, `tree-kill`, `react-markdown`, `ws`
- **Docker**: Yes
- **Electron**: Yes (desktop app)

## Dual Execution Modes

Agent Studio runs agents in two modes:

| Mode | How it works | Use case |
|------|-------------|----------|
| **Terminal sessions** | PTY via `node-pty`, rendered in xterm.js | Interactive CLI sessions (Sessions tab) |
| **Room agents** | Claude Agent SDK `query()`, structured events | Team chat rooms (Teams tab) |

Terminal sessions give you a full interactive terminal. Room agents give you clean chat — only text replies, no ANSI or tool call noise.

## Agent System

Agents are defined in `.claude/agents/`. They are generic templates — users customize them for their own projects.

### Available Agents

| Agent | Role |
|-------|------|
| **orchestrator** | Coordinates teams, delegates work, reviews before pushing |
| **frontend** | Builds and maintains frontend code |
| **backend** | APIs, database schemas, server logic |
| **qa** | Testing, quality assurance |
| **security** | Security review, vulnerability scanning |
| **pmo** | Project management, task tracking |
| **documentation** | Docs, knowledge base |
| **domain** | Domain-specific logic |

## Core Rules

- Follow the reasoning protocol in each agent's .md file
- Never commit secrets, API keys, or credentials
- Run the type checker before committing (`npx tsc --noEmit`)
- All agents report completion to the orchestrator
- Test changes before marking tasks complete

## Memory Protocol

After completing significant tasks, agents write memory files:

| What happened | Folder |
|---------------|--------|
| Discovered a pattern | `ai-agents/memory/learnings/` |
| Fixed a bug | `ai-agents/memory/corrections/` |
| Made a decision | `ai-agents/memory/decisions/` |

File format: `YYYYMMDD_HHMMSS_{agent}_{type}.json`

## Project Structure

```
server/              # Express backend
  index.ts           # Main server, WebSocket, API routes
  sdk-session.ts     # Claude Agent SDK session manager (rooms)
  terminal-manager.ts # PTY lifecycle, kill escalation, readiness
  rooms.ts           # Room state, persistence, context files
  routes/            # API route modules
src/                 # Next.js frontend
  app/               # Pages
  components/        # React components (terminal, teams, settings)
  stores/            # Zustand state management
  lib/               # WebSocket client, utilities
electron/            # Electron desktop shell
  main.js            # Main process, server lifecycle, tray
  preload.js         # IPC bridge (notifications)
public/              # Static assets
docs/                # Specs and plans
```

## Code Style

- TypeScript strict mode (`tsconfig.json`)
- Express 5 route syntax (`/{*path}` not `*`)
- Zustand for state, no Redux
- Tailwind CSS utility classes
- `node-pty` for terminal, `@anthropic-ai/claude-agent-sdk` for rooms
