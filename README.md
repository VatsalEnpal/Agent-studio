<p align="center">
  <h1 align="center">Agent Studio</h1>
</p>

<p align="center">
  An IDE for AI agent teams.<br />
  Design agents. Orchestrate workflows. Ship code.
</p>

<p align="center">
  <a href="https://github.com/VatsalEnpal/Agent-studio/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-black" /></a>
  <a href="https://github.com/VatsalEnpal/Agent-studio"><img alt="Version" src="https://img.shields.io/badge/version-0.5.0-black" /></a>
</p>

<br />

## Why

IDEs changed how we write code. Agent Studio does the same for how we **work with AI agents**.

Today, running agents means opening terminals, copy-pasting context, losing everything between sessions, and having no way to make agents actually collaborate. It's like writing code without an IDE — possible, but painful.

Agent Studio is the missing environment. You design agents that understand your specific codebase, orchestrate them into automated pipelines, give them shared memory so they learn over time, and let them talk to each other in real-time chat rooms. All from one interface.

<br />

## What you can build

**Custom agent teams for any project.** A setup wizard analyzes your codebase — frameworks, patterns, conventions — and generates specialized agents. Not generic "frontend" or "backend" bots. Agents that know _your_ stack, _your_ patterns, _your_ architecture. Edit them, version them, share them with your team.

**Automated engineering pipelines.** Define multi-step workflows: scan the codebase, check readiness, design the solution, build it, run tests, security review, ship. Each step can pass, fail, or pause for your approval. Configure which gates are mandatory and which can auto-advance. Set budget caps per sprint with real-time cost tracking.

**Agent-to-agent collaboration rooms.** Create a chat room, assign agents, give them a problem. They @mention each other — one finds the bug, tags another to fix it, a third writes the test. You watch in real-time, approve when needed. A turn-based protocol prevents chaos.

**Persistent knowledge across everything.** When an agent discovers that your deploy needs a specific flag, or a test is flaky on CI, or the API requires pagination — that goes into a shared knowledge base. Memories are auto-extracted when sessions end and injected into future sessions via BM25 relevance scoring. Your agents compound their understanding of your codebase over time.

**A full control panel for everything running.** Live terminals with stats (tokens, cost, context window), git integration (branches, commits, PRs from the sidebar), dev server monitoring, system resources, process discovery. Everything an engineering team needs, in one window.

<br />

## Who this is for

Agent Studio is built for **developers** who already run Claude Code on the terminal and want a better cockpit. If you're comfortable with `git`, `node`, and your own shell environment, you're the target audience. There is no hosted SaaS — you clone, install, and run it locally (or wrap it in Electron).

<br />

## Get started

> **Prerequisites:** Node.js 22+ and [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed.

```bash
git clone https://github.com/VatsalEnpal/Agent-studio.git
cd Agent-studio
./install.sh
```

`install.sh` is the supported first-run bootstrap: it verifies Node 22+, npm, git and the `claude` CLI, runs `npm ci`, rebuilds `node-pty` for your platform, exports `AGENT_STUDIO_DIR` to your shell profile, and warns if port 8080 is already in use. It is idempotent — safe to re-run any time the environment shifts.

Then pick one of the three runtime shapes:

| Command                | What it does                                                               | Use when                                        |
| ---------------------- | -------------------------------------------------------------------------- | ----------------------------------------------- |
| `npm run dev`          | Starts Express + Next.js on :8080. Browser at `http://localhost:8080`.     | Day-to-day hacking, fast reload.                |
| `npm run electron:dev` | Spawns the dev server and opens the Electron window pointed at it.         | Testing the desktop shell, tray, notifications. |
| `npm run install:mac`  | Builds and installs `Agent Studio.app` to `/Applications`. Takes 5-10 min. | Smoke-testing a real packaged build.            |

An onboarding tour guides you through the four main sections the first time you land on the dashboard.

### Unsigned DMG — first launch

Packaged Mac builds are **unsigned and unnotarized**. This is intentional for the current developer-focused distribution. On first launch:

> Right-click `Agent Studio.app` in `/Applications` and choose **Open**. Gatekeeper prompts once; subsequent launches open normally. Or run `xattr -dr com.apple.quarantine '/Applications/Agent Studio.app'` once.

Notarization is a v1.0 item. If you are not comfortable running unnotarized software, run `npm run dev` in the browser instead.

### Permission modes for autonomous runs

When driving Claude Code against this repo (or any repo) autonomously:

- **Preferred:** `--permission-mode auto` — same as `npm run claude:auto`. A classifier blocks destructive / scope-creep actions without prompting you.
- **Avoid:** `--dangerously-skip-permissions` — skips _all_ safety checks. Only use for throwaway, tightly-scoped experiments.

<br />

## How it works

Two execution modes under one roof:

**Terminal sessions** — Real PTY processes via `node-pty`. Same as running Claude Code in your terminal, but with a grid layout, live stats, zoom, fullscreen, and session management. Up to 6 running simultaneously.

**Agent SDK rooms** — Structured conversations via the Claude Agent SDK. Clean markdown output, streaming responses, typing indicators, approval gates. No terminal noise — just the conversation.

Both stream over a single WebSocket. The server (Express 5) wraps Next.js, manages PTY lifecycles, watches files, polls git, and coordinates everything on one port.

### Agent discovery — user > project > builtin

Agents are resolved from three sources, highest precedence first:

1. **User-scoped** (`~/.claude/agents/*.md`) — your personal global agents, available in every project.
2. **Project-scoped** (`<projectPath>/.claude/agents/*.md`) — agents that only apply when that project is active.
3. **Builtin templates** — the defaults that ship in `.claude/agents/` of this repo, used as a fallback seed.

On name collision, the more specific source wins: a project-scoped `frontend` overrides a global `frontend`, which in turn overrides the builtin `frontend`. `GET /api/agents?projectPath=<path>` returns the merged, de-duplicated list for a given project.

<br />

## Tech stack

|               |                                           |
| ------------- | ----------------------------------------- |
| **Framework** | Next.js 16, React 19, TypeScript (strict) |
| **Styling**   | Tailwind CSS, Geist Mono                  |
| **State**     | Zustand                                   |
| **Server**    | Express 5, WebSocket                      |
| **Terminals** | node-pty, xterm.js                        |
| **Agents**    | Claude Agent SDK                          |
| **Desktop**   | Electron                                  |

<br />

## Docs

|                                                      |                                                 |
| ---------------------------------------------------- | ----------------------------------------------- |
| **[HOWTO.md](HOWTO.md)**                             | User guide — features, shortcuts, configuration |
| **[ARCHITECTURE.md](ARCHITECTURE.md)**               | Technical deep-dive for contributors            |
| **[docs/sprint-handoff.md](docs/sprint-handoff.md)** | Handoff JSON contract between sprint steps      |
| **[CLAUDE.md](CLAUDE.md)**                           | Agent and contributor instructions              |

<br />

## Acknowledgements

Agent chat was inspired by [TalkTo](https://github.com/hyperslack/talkto) by [@hyperslack](https://github.com/hyperslack) — same idea (agents shouldn't work alone), different approach.

## License

[MIT](LICENSE)
