# agent-studio — Claude Code Instructions

## Project Overview

Web-based command center for AI coding agents. Manage Claude Code sessions, team rooms, and automated workflows from one dashboard. Also ships as a native Mac app via Electron.

- **Languages**: TypeScript (strict)
- **Frameworks**: Next.js 16, React 19, Express 5, Tailwind CSS
- **Package Manager**: npm
- **Key Dependencies**: `@anthropic-ai/claude-agent-sdk`, `node-pty`, `tree-kill`, `ws`, `xterm.js`, `zustand`
- **Electron**: Yes (desktop app)

## First Contact — Run install.sh

Every new contributor (and every new machine) starts with:

```bash
./install.sh
```

This validates node 22+, npm, claude CLI, git; runs `npm ci`; rebuilds `node-pty` for the platform; writes `AGENT_STUDIO_DIR` to the shell profile; warns on port-8080 conflicts. Idempotent — safe to re-run.

## Working Autonomously — Permission Modes

Use `--permission-mode auto` (NOT `--dangerously-skip-permissions`) for autonomous runs. Auto has a classifier that blocks destructive/scope-creep actions without prompting you; bypass skips all checks.

```bash
npm run claude:auto    # claude --permission-mode auto
npm run claude:plan    # claude --permission-mode plan
npm run shiploop       # /shiploop in auto mode
```

## Dual Execution Modes (inside the app)

| Mode                  | How                          | Use case                       |
| --------------------- | ---------------------------- | ------------------------------ |
| **Terminal sessions** | PTY via `node-pty`, xterm.js | Interactive CLI (Sessions tab) |
| **Room agents**       | Claude Agent SDK `query()`   | Team chat (Teams tab)          |

## Skills Available — Prefer Skills Over Custom Agents

Building Agent Studio uses **skills + hooks + fresh sessions**, not dedicated build-agents.

| Skill cluster                                           | Use for                                                                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `/shiploop` (your own — at `~/Code/personal/ShipLoop/`) | Autonomous listen→explore→plan→work→verify→deliver loop. Generates `.shiploop/health-curve.html`. |
| `superpowers:brainstorming`                             | Before any new feature                                                                            |
| `superpowers:systematic-debugging`                      | Root-cause any bug before fixing                                                                  |
| `superpowers:test-driven-development`                   | New features + flaky tests                                                                        |
| `superpowers:verification-before-completion`            | Before claiming anything is done                                                                  |
| `superpowers:finishing-a-development-branch`            | Merge / PR / cleanup decisions                                                                    |
| `frontend-design:frontend-design`                       | Production-grade UI polish                                                                        |

## Agent discovery — Scoped sources

Agents are discovered by walking `config.agentSources: Array<{path, scope, label?}>`. Each `scope` is either `"global"` (applies to every project, seeded from `~/.claude/agents`) or `{project: string}` (only applies when that project path is active, seeded from `<projectPath>/.claude/agents`). `GET /api/agents?projectPath=<path>` returns all global agents plus the agents scoped to that project. On name-collision (same agent `id` in both a global and a matching project source), the project-scoped agent wins.

## Single-Server Discipline — Important

Past PC crashes were caused by multiple agents each spinning up their own `npm run dev` on port 8080. Rules:

- **Only one dev server at a time.** The pre-bash-safety hook blocks duplicate `npm run dev` / `tsx server` / `electron` spawns when :8080 is in use.
- **Subagents must not spawn servers.** If a subagent needs to verify the app, it uses the existing server on :8080. If it MUST isolate, spawn on :8081 and kill on exit.
- **Orchestration happens in ONE Claude Code session.** Use subagents inside that session (Agent tool), not parallel `claude` processes.

## Hooks Already Wired

`.claude/settings.json` → `.claude/hooks/`:

- `SessionStart` → `session-start.sh` — re-injects CURRENT_STATE.md + ShipLoop state, validates tools, reports server status
- `PreToolUse (Bash)` → `pre-bash-safety.sh` — blocks force-push, reset --hard, DROP TABLE, rm -rf /, AND duplicate dev-server spawns
- `PreToolUse (Edit/Write)` → `protect-files.sh` — blocks edits to .env, .git, lockfiles
- `PostToolUse (Edit/Write)` → `post-edit-format.sh` + `post-edit-typecheck.sh`
- `Stop` → `stop-verify.sh` — multi-gate (typecheck + build + vitest) before claiming done

## Core Rules

- Never commit secrets, API keys, or credentials
- Run `npx tsc --noEmit` before committing (stop-verify hook enforces this)
- Test changes before marking tasks complete (stop-verify hook enforces this)
- Use Playwright MCP / `/shiploop` verify brain for visual verification

## Memory Protocol

After completing significant work, write memory files:

| What happened        | Folder                          |
| -------------------- | ------------------------------- |
| Discovered a pattern | `ai-agents/memory/learnings/`   |
| Fixed a bug          | `ai-agents/memory/corrections/` |
| Made a decision      | `ai-agents/memory/decisions/`   |

File format: `YYYYMMDD_HHMMSS_{agent_or_type}_{category}.json`

## Project Structure

```
server/                 # Express backend
  index.ts              # Main server, WebSocket, API routes
  sdk-session.ts        # Claude Agent SDK manager (rooms)
  terminal-manager.ts   # PTY lifecycle, tree-kill, readiness
  rooms.ts              # Room state, persistence
  routes/               # API route modules
src/                    # Next.js frontend
  app/                  # Pages
  components/           # React components
  stores/               # Zustand state
  lib/                  # WebSocket client, utilities
electron/               # Electron shell
public/                 # Static assets
docs/                   # Specs and plans
.claude/                # Agents, hooks, commands, settings
.shiploop/              # ShipLoop state (after first run)
```

## Agents in `.claude/agents/`

These are **templates that ship with Agent Studio for end users to customize** — not build-agents for developing Agent Studio itself. When working on Agent Studio, rely on skills and subagents spawned inline, not on these files.

## Code Style

- TypeScript strict mode (`tsconfig.json`)
- Express 5 route syntax (`/{*path}` not `*`)
- Zustand for state, no Redux
- Tailwind utility classes
- `node-pty` for terminal, `@anthropic-ai/claude-agent-sdk` for rooms
