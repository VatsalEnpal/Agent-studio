<p align="center">
  <h1 align="center">Agent Studio</h1>
</p>

<p align="center">
  The command center for Claude Code.<br />
  Run agents, coordinate teams, ship code — one window.
</p>

<p align="center">
  <a href="https://github.com/VatsalEnpal/Agent-studio/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-black" /></a>
  <a href="https://github.com/VatsalEnpal/Agent-studio"><img alt="Version" src="https://img.shields.io/badge/version-0.3.1-black" /></a>
</p>

<br />

<p align="center">
  <img src="docs/screenshots/sessions.png" alt="Agent Studio" width="800" />
</p>

<br />

## The problem

You open Claude Code. It's amazing for one task.

Then you need a frontend agent, a backend agent, a QA agent, and security review — all at once. Now you're juggling 6 terminals, copy-pasting context between them, and nothing carries over to the next session.

Agent Studio fixes that.

<br />

## What's inside

- **Multi-terminal grid** — Up to 6 Claude Code sessions side by side with live stats
- **Agent chat rooms** — Agents @mention each other, collaborate on tasks, with human approval gates
- **Sprint pipelines** — Multi-step workflows (scan → build → test → review → ship) with pass/fail gates
- **Shared memory** — Agents remember what they learn across sessions
- **Agent wizard** — Scans your project, generates agents tailored to your exact stack
- **Git integration** — Branch status, commit, push, and PR creation from the sidebar
- **Dev server monitor** — Auto-discovers your running servers
- **Automations** — Scheduled headless agent runs with reports
- **Command palette** — `Cmd+K` to jump anywhere
- **Desktop app** — Electron shell with system tray and native notifications

<br />

<p align="center">
  <img src="docs/screenshots/teams.png" alt="Agent Teams" width="400" />
  &nbsp;&nbsp;
  <img src="docs/screenshots/memory.png" alt="Memory" width="400" />
</p>

<p align="center">
  <sub>Agent chat rooms &nbsp;·&nbsp; Shared knowledge base</sub>
</p>

<br />

## Get started

> **Prerequisites:** Node.js 22+ and [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed.

```bash
git clone https://github.com/VatsalEnpal/Agent-studio.git
cd Agent-studio
npm install
npm run dev
```

Open [localhost:8080](http://localhost:8080). A setup wizard generates agents for your project.

```bash
npm run electron:dev     # desktop app (dev)
npm run build:mac        # build macOS .dmg
```

<br />

<p align="center">
  <img src="docs/screenshots/settings.png" alt="Settings" width="400" />
  &nbsp;&nbsp;
  <img src="docs/screenshots/sprints.png" alt="Sprints" width="400" />
</p>

<p align="center">
  <sub>Settings &nbsp;·&nbsp; Sprint pipelines</sub>
</p>

<br />

## Tech stack

|               |                                           |
| ------------- | ----------------------------------------- |
| **Framework** | Next.js 16, React 19, TypeScript (strict) |
| **Styling**   | Tailwind CSS                              |
| **State**     | Zustand                                   |
| **Server**    | Express 5, WebSocket                      |
| **Terminals** | node-pty, xterm.js                        |
| **Agents**    | Claude Agent SDK                          |
| **Desktop**   | Electron                                  |

<br />

## Docs

|                                        |                                                                |
| -------------------------------------- | -------------------------------------------------------------- |
| **[HOWTO.md](HOWTO.md)**               | Full user guide — features, shortcuts, agents, troubleshooting |
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | Technical deep-dive for contributors                           |
| **[CLAUDE.md](CLAUDE.md)**             | Agent and contributor instructions                             |

<br />

## Acknowledgements

Agent chat was inspired by [TalkTo](https://github.com/hyperslack/talkto) by [@hyperslack](https://github.com/hyperslack) — same idea (agents shouldn't work alone), different approach.

<br />

## License

[MIT](LICENSE)
