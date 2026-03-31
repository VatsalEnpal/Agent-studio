# How To Use Agent Studio

Practical step-by-step guide for common tasks. Each section assumes you have the app running at [http://localhost:8080](http://localhost:8080).

---

## 1. Launch Your First Session

1. Open Agent Studio in your browser.
2. If this is your first run, the setup wizard appears. Follow the prompts to add your project and configure defaults.
3. Once on the main screen, click **+ New Session** in the sidebar (or press `Cmd+N`).
4. The session launcher modal opens with **Quick Start** presets at the top.
5. Click **Quick Chat** to launch a Sonnet session with no agent, or **Start Sprint** for Opus with the orchestrator agent.
6. The terminal appears in the grid. You can start typing immediately -- it is a real Claude Code session.

## 2. Run Multiple Sessions Side by Side

1. Launch your first session (see above).
2. Press `Cmd+N` again to open the launcher and start a second session.
3. The grid automatically arranges sessions: 1 session = full width, 2 = side by side, 3+ = grid layout.
4. Up to 6 sessions are visible at once. Additional sessions appear in the sidebar and can be swapped in.
5. Click any terminal to focus it. Use `Cmd+1` through `Cmd+6` to jump to a session by grid position.
6. Press `Cmd+Enter` to fullscreen the focused session. Press `Escape` to return to the grid.

## 3. Set Up Custom Agents

**Using the scaffold wizard (recommended):**

1. Go to **Settings** (gear icon in the toggle bar).
2. Open the **Workspace** tab and click **Scaffold Agent System**.
3. Choose which agents you want (orchestrator, frontend, backend, QA, security, PMO, docs, domain).
4. Select a workflow template (sprint, simple, or custom).
5. Click **Create**. Agent Studio generates `ai-agents/` and `.claude/agents/` in your project.

**Manual setup:**

1. Create `ai-agents/agents/my-agent/agent.md` in your project with the agent's rules and identity.
2. Create `.claude/agents/my-agent.md` as the Claude Code entry point that references the full agent file.
3. When launching a session, select your agent name from the **Agent** dropdown in the launcher.

## 4. Monitor Token Usage and Costs

1. Each active session shows a bottom bar with cost (`$0.42`), token count (`12.3k`), and context window usage (`34%`).
2. This data updates every 30 seconds automatically via WebSocket.
3. For detailed usage, use the **Usage** API: `GET /api/sessions/:id/usage` returns input tokens, output tokens, cache tokens, message count, and context breakdown.
4. The bottom bar of the main window shows aggregate stats across all sessions.

## 5. Resume a Previous Session

1. Open the session launcher (`Cmd+N`).
2. At the top, you will see **Resume Previous Session** with a dropdown of your recent Claude Code sessions (read from `~/.claude/projects/`).
3. Click the dropdown, search by project name or session ID, and select one.
4. Click **Resume**. The session picks up where it left off.
5. Alternatively, click the **Continue** button (leftmost Quick Start button) to resume your most recent session without choosing.

## 6. Track Git Across Repos

1. Agent Studio auto-detects git repos from your configured projects and polls status every 10 seconds.
2. The sidebar shows each repo with its current branch, dirty/clean status, and ahead/behind counts.
3. Click a repo in the sidebar to see more detail.
4. Use the API for programmatic access: `GET /api/git/status` returns all repos, `GET /api/git/changes?repo=PATH` returns porcelain output, `GET /api/git/diff?repo=PATH` returns staged and unstaged diffs.

## 7. Create a PR from the Dashboard

1. In the sidebar, find the repo you want to create a PR for.
2. Click the PR icon (or use the command palette: `Cmd+K`, type "PR").
3. The PR modal opens. Select:
   - **Source branch** (your feature branch)
   - **Target branch** (e.g., main)
   - **Title** and **Description**
4. Click **Create PR**. Agent Studio uses `gh` CLI under the hood.
5. Requires the [GitHub CLI](https://cli.github.com/) installed and authenticated.

## 8. Use Keyboard Shortcuts

The most useful shortcuts for daily use:

| What you want to do | Press |
|---------------------|-------|
| Launch a new session | `Cmd+N` |
| Find any action quickly | `Cmd+K` (command palette) |
| Jump to session 1, 2, 3... | `Cmd+1`, `Cmd+2`, `Cmd+3` |
| Fullscreen the current session | `Cmd+Enter` |
| Toggle the sidebar | `Cmd+\` |
| Cycle between sessions | `Tab` |
| Close any modal or exit fullscreen | `Escape` |

All shortcuts use `Ctrl` instead of `Cmd` on Windows/Linux.

## 9. Configure for Your Workflow

Edit `.agent-studio.json` in the directory where you run the server:

**Add a project:**
```json
{
  "projects": [
    { "name": "api", "path": "/Users/you/Code/api", "isProd": false },
    { "name": "prod-api", "path": "/Users/you/Code/prod-api", "isProd": true }
  ]
}
```
Setting `isProd: true` blocks direct commits and requires confirmation for pushes.

**Change default model:**
```json
{
  "defaults": {
    "model": "opus",
    "permissions": "default",
    "workingDirectory": "~/Code/my-project"
  }
}
```

**Add a dev server:**
```json
{
  "devServers": [
    { "name": "frontend", "path": "~/Code/frontend", "command": "npm run dev" },
    { "name": "backend", "path": "~/Code/backend", "command": "cargo watch -x run" }
  ]
}
```

After editing, restart Agent Studio or save via the Settings UI to reload.

## 10. Run in Docker

```bash
# Build the image
docker build -t agent-studio .

# Run with access to your home directory (needed for Claude Code config and projects)
docker run -it -p 8080:8080 -v $HOME:$HOME agent-studio

# Run with a custom working directory
docker run -it -p 8080:8080 -v $HOME:$HOME -w /path/to/project agent-studio
```

Make sure Claude Code CLI is available inside the container. The easiest way is to mount your `~/.claude` directory.

## 11. Set Up the Agent System

Agent Studio's Teams, Memory, and Workflows features all rely on an `ai-agents/` folder in your project. This folder is a shared knowledge base where your AI agents store memories, track sprints, and coordinate work.

### What it contains

```
ai-agents/
├── memory/           # Agent learnings, corrections, decisions
│   ├── learnings/
│   ├── corrections/
│   ├── decisions/
│   ├── human-inputs/
│   └── knowledge/
├── sprints/          # Sprint plans, handoffs, scan logs
│   └── handoffs/
├── tools/            # memory_index.json and utility scripts
└── context/          # Project-specific context files
.claude/
└── agents/           # Claude Code agent entry points (.md files)
```

### Three ways to create it

**1. Onboarding flow (recommended)**

When you first run Agent Studio, the setup wizard offers to scaffold an agent system for your project. Click "Set me up" and follow the prompts. The wizard analyzes your codebase and generates agents tailored to your stack.

**2. Settings button**

Go to **Settings** > **Workspace**. If no agent system is detected, you will see a "Create Agent System" button. Click it to open the scaffold wizard, choose which agents you want, and create the folder structure.

**3. Manually**

Create the directories yourself:

```bash
mkdir -p ai-agents/memory/{learnings,corrections,decisions,human-inputs,knowledge}
mkdir -p ai-agents/sprints/handoffs
mkdir -p ai-agents/tools
mkdir -p ai-agents/context
mkdir -p .claude/agents
```

Then create a `ai-agents/tools/memory_index.json` file:

```json
{
  "version": "1.0",
  "rebuilt_at": "2024-01-01T00:00:00Z",
  "entries": []
}
```

And add agent definition files (`.md`) in `.claude/agents/` for each agent you want to use.

### What unlocks

Once the `ai-agents/` folder exists and is detected by Agent Studio:

- **Teams tab** shows workflow runs and lets you create multi-agent pipelines
- **Memory tab** displays all agent memories with search, filter, pin, and edit
- **Agents can share knowledge** across sessions via the memory index
- **Automations** can read and write to the sprint and memory system

Sessions, Reports, Git, and Automations all work without it -- the agent system is only required for the collaborative features.

## 12. Troubleshoot Common Issues

**Server won't start:**
- Check that port 8080 is free: `lsof -i :8080`. Kill any process using it.
- If `node-pty` fails to install, you need build tools: `xcode-select --install` (macOS) or `apt install python3 make g++` (Linux).
- Try deleting `node_modules` and running `npm install` again.

**Blank terminal (session launches but nothing appears):**
- Verify Claude Code CLI is installed: run `which claude` in your terminal.
- Check the browser console for WebSocket connection errors.
- Try refreshing the page -- the WebSocket reconnects automatically.

**Session stuck in "starting" status:**
- The Claude Code process may have exited immediately. Check if `claude --dangerously-skip-permissions` works in your regular terminal.
- Look at the session's exit code in the sidebar (hover over the status badge).

**Port already in use:**
```bash
# Find what's using port 8080
lsof -i :8080

# Kill it
kill -9 <PID>

# Or use a different port
PORT=3000 npm run dev
```

**Usage data not showing:**
- Usage polling runs every 30 seconds. Wait a moment after launching a session.
- Usage is read from Claude Code's status files. If Claude Code was installed in a non-standard location, the data may not be found.

**Git status not updating:**
- Git status polls every 10 seconds. Changes may take a moment to appear.
- Verify the project paths in `.agent-studio.json` point to valid git repositories.
