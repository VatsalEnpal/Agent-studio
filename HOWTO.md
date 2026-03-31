# Agent Studio — How To Guide

Quick reference for everything you can do. App runs at [http://localhost:8080](http://localhost:8080).

---

## Getting Started

### First Launch

On first run, Agent Studio checks for Claude Code CLI (`claude`), Node.js, and git. If all pass, the **onboarding wizard** appears. Describe what you're working on, optionally point to a project folder, and Agent Studio generates a tailored agent setup. Click **"Set me up"** to proceed, or **"Skip setup"** to go straight to the dashboard.

### The Dashboard

You land on the **Sessions** view. Three areas:

- **Sidebar** (left) — active sessions, git repos, discovered processes, past sessions
- **Terminal grid** (center) — your Claude Code sessions, auto-arranged
- **Toggle bar** (top) — tabs for Sessions, Teams, Memory, Reports, Settings. Plus theme toggle, system stats, peak hours indicator, Limits link, and help

---

## Sessions

### Launch a Session

Press **`Cmd+Shift+N`** or click **+ New Session** in the sidebar. The launcher modal opens with:

1. **Resume Previous Session** — dropdown of recent sessions (searchable)
2. **Quick Start presets** — Continue (last session), Quick Chat (Sonnet, no agent), Start Sprint (Opus + orchestrator), Security Audit (Opus + security), PMO Scan (Sonnet + PMO)
3. **Custom configuration** — model, agent, permissions, channel, working directory, session name

Click a preset to fill the form, then click **Launch**. Or customize everything below the divider.

### Name Your Sessions

Type a name in the **Session Name** field of the launcher before launching. After launch, hover over a session in the sidebar to reveal the **pencil icon** — click it to rename.

### Switch Between Sessions

- **Click** a session in the sidebar to focus it
- **`Cmd+Shift+1`** through **`Cmd+Shift+6`** to jump by grid position
- **`Tab`** to cycle focus between visible sessions (when not typing)

### Resume a Previous Session

Open the launcher (`Cmd+Shift+N`). At the top, click **Resume Previous Session** dropdown. Search by project name or session ID, then select and click **Resume**. Or click the **Continue** preset to resume your most recent session instantly.

### Multiple Sessions Side by Side

The grid auto-arranges: 1 session = full width, 2 = side by side, 3+ = grid layout. Up to **6 sessions visible** at once. Additional sessions live in the sidebar and can be focused to swap in. Double-click a terminal header to fullscreen it, or press `Cmd+Enter`.

### Kill a Session

Click the **X** on the terminal header or the session's sidebar entry. Exited sessions auto-remove after 10 seconds.

### Zoom In/Out

Each terminal pane has **zoom controls** (+ / -) in its header bar. Zoom level is per-session and persists.

---

## Agents

### AI-Generated Agents (Recommended)

During onboarding, describe your project and workflow in natural language. Agent Studio analyzes your codebase and generates agents tailored to your stack — each with a name, description, model preference, and full `.md` rules file. You can refine the results ("remove the inventory one, add a social media agent") before confirming.

### Scaffold Agent System

Go to **Settings > Workspace > Create Agent System**. Choose agents from the list (orchestrator, frontend, backend, QA, security, PMO, documentation, domain). Pick a workflow template (sprint, simple, or custom). Click **Create** — this generates `ai-agents/` and `.claude/agents/` in your project.

### Manual Agent Setup

Create `.claude/agents/my-agent.md` in your project. It appears automatically in the launcher's **Agent** dropdown. Reference a full identity file if needed:

```markdown
---
name: my-agent
description: Does specific things
model: sonnet
---

# My Agent

You are... [identity and rules here]
```

### What Agents Are Available

The launcher dropdown shows all agents detected from `.claude/agents/` in your project. Defaults: No Agent, orchestrator, frontend, backend, qa, security, pmo, documentation. Custom agents appear automatically when you add `.md` files.

---

## Automations

### What Are Automations?

Scheduled headless Claude Code runs that produce reports. They run on a timer, execute a prompt, and save the output as a report you can review before taking action.

### Set Up an Automation

Go to **Settings > Automations**. Three ways to add:

1. **Click "Add"** — pick a template, configure name/schedule/model/prompt, click Create
2. **Click "Suggestions"** — Agent Studio scans your project and recommends relevant automations. Click **+ Add** on any suggestion
3. **Type a description** — describe what you want in natural language (e.g., "Review code for security issues daily") and click **Generate**

### Available Templates

| Template | What it does | Default schedule |
|----------|-------------|-----------------|
| Code Health | tsc, tests, npm audit | Every 2h |
| PR Reviewer | Reviews open PRs | Every 6h |
| Security Scanner | Deps + code secrets scan | Daily |
| Dependency Updater | Checks outdated packages | Weekly |
| Test Coverage | Finds untested code | Daily |
| Documentation | Checks README + inline docs | Weekly |

### Manage Automations

Each automation shows a **toggle** (on/off), **Run Now** button (play icon), and **Delete** button (trash icon). Last run time and schedule are visible inline.

### Review Reports

Switch to the **Reports** tab in the toggle bar. Click a report to see its summary and suggested actions. Reports arrive in real-time via WebSocket when automations complete.

---

## Theme

### Switch Between Dark and Light Mode

Click the **sun/moon icon** in the top-right of the toggle bar. Terminal panes stay dark in both modes. Your preference is saved automatically.

---

## Memory

### Browse Agent Memories

Switch to the **Memory** tab. Use the **search bar** to find memories by title, content, or tags. Filter by category pills: All, Learnings, Corrections, Decisions, Human Inputs, Knowledge. Toggle **Pinned** to see only pinned memories.

Click any memory to see its full detail in the right panel.

### Create, Edit, Pin, Delete

- **Create** — click the **+ New** button in the Memory tab header
- **Pin** — hover over a memory in the list, click the pin icon. Pinned memories sort to the top
- **Edit** — hover, click the pencil icon. Modify title, content, tags
- **Delete** — hover, click the trash icon. Confirm in the dialog

### What Creates Memories?

Agents create memories automatically after significant work (patterns learned, bugs fixed, decisions made). You can also create them manually via the **+ New** button.

### Requires ai-agents/ Folder

Teams, Memory, and Workflows need the `ai-agents/` folder in your project. Create it via onboarding, the Settings > Workspace button, or manually (see [Set Up the Agent System](#set-up-the-agent-system) below).

---

## Teams & Workflows

### View Sprint Progress

Switch to the **Teams** tab. The left sidebar shows all workflow flows and their runs. Select a run to see its **step timeline** — each step shows status, assigned agent, and handoff details.

### Create a Custom Workflow

In the Teams tab, click **Create Workflow**. Name your workflow, define steps (with agent assignments and dependencies), then save. Runs track progress automatically and update in real-time via WebSocket.

---

## Git

### Track Repos

The sidebar's **REPOS** section auto-detects git repos from your configured projects. Each repo shows:

- Current **branch** name
- **Dirty/clean** status indicator
- **Ahead/behind** counts

Click a repo to open it in Finder. Middle-click to open in Cursor. Status polls every 10 seconds.

### Create a PR

Open the command palette (`Cmd+Shift+K`), type **"PR"**, and select a repo. Or click the PR icon next to a repo in the sidebar. Fill in source branch, target branch, title, and description. Production repos require a **two-step confirmation** before creating.

Requires [GitHub CLI](https://cli.github.com/) installed and authenticated.

---

## Settings

### Workspace

Manage tracked **projects** (add/remove paths, mark as prod). View or create the **agent system**. Configure **dev servers**. The "Create Agent System" and "Regenerate Agents" buttons are here.

### General

Set defaults for new sessions: **model** (opus/sonnet/haiku), **permissions** (bypass/default/plan/auto), **working directory**.

### Automations

List of configured automations. Toggle on/off, run now, add new, view suggestions. See [Automations](#automations) section above.

### Shortcuts

Reference table of all keyboard shortcuts with their key combinations.

### System Monitor

Live **CPU** and **RAM** usage displayed in the toggle bar's system widget. Click it to jump to Settings for more detail.

### About

Version info and links.

---

## Keyboard Shortcuts

| Action | Mac | Windows/Linux |
|--------|-----|---------------|
| New session | `Cmd+Shift+N` | `Ctrl+Shift+N` |
| Command palette | `Cmd+Shift+K` | `Ctrl+Shift+K` |
| Toggle sidebar | `Cmd+Shift+\` | `Ctrl+Shift+\` |
| Focus session 1-6 | `Cmd+Shift+1` - `6` | `Ctrl+Shift+1` - `6` |
| Browser fullscreen | `Cmd+Shift+F` | `Ctrl+Shift+F` |
| Fullscreen focused pane | `Cmd+Enter` | `Ctrl+Enter` |
| Cycle session focus | `Tab` | `Tab` |
| Close modal / exit fullscreen | `Esc` | `Esc` |

---

## Usage & Limits

### Token Tracking

Each session shows **cost** ($), **token count**, and **context window %** in its terminal header and sidebar entry. Data updates via WebSocket.

### Check Your Claude Limits

Click **"Limits"** in the top-right of the toggle bar. Opens [claude.ai/settings/usage](https://claude.ai/settings/usage) in a new tab.

### Peak Hours Indicator

The toggle bar shows a **peak/off-peak** badge. Peak hours are **14:00-20:00 Berlin time** (5am-11am PT). Expect slower responses during peak. Hover for details.

---

## Set Up the Agent System

Agent Studio's Teams, Memory, and Workflows features all require an `ai-agents/` folder in your project.

### What it creates

```
ai-agents/
  memory/          # learnings, corrections, decisions, human-inputs, knowledge
  sprints/         # sprint plans, handoffs
  tools/           # memory_index.json
  context/         # project-specific context
.claude/
  agents/          # agent entry points (.md files)
```

### Three ways to create it

1. **Onboarding** — first-run wizard offers to scaffold it. Click "Set me up"
2. **Settings** — Settings > Workspace > "Create Agent System" button
3. **Manual** — create the directories and a `memory_index.json` yourself:

```bash
mkdir -p ai-agents/memory/{learnings,corrections,decisions,human-inputs,knowledge}
mkdir -p ai-agents/{sprints/handoffs,tools,context}
mkdir -p .claude/agents
echo '{"version":"1.0","rebuilt_at":"2024-01-01T00:00:00Z","entries":[]}' > ai-agents/tools/memory_index.json
```

### What it unlocks

- **Teams tab** — workflow runs, multi-agent pipelines
- **Memory tab** — search, filter, pin, edit agent memories
- **Cross-session knowledge sharing** via the memory index
- **Automations** can read/write to the sprint and memory system

Sessions, Reports, Git, and Automations work without it.

---

## Configuration File

Agent Studio reads `.agent-studio.json` from its working directory:

```json
{
  "projects": [
    { "name": "my-app", "path": "/Users/you/Code/my-app", "isProd": false },
    { "name": "prod", "path": "/Users/you/Code/prod", "isProd": true }
  ],
  "defaults": {
    "model": "sonnet",
    "permissions": "default",
    "workingDirectory": "~/Code/my-app"
  },
  "devServers": [
    { "name": "frontend", "path": "~/Code/frontend", "command": "npm run dev" }
  ]
}
```

Setting `isProd: true` blocks direct commits and requires confirmation for pushes. Edit via Settings UI or directly in the file (restart to reload).

---

## Docker

```bash
# Build
docker build -t agent-studio .

# Run (mount home directory for Claude Code config + project access)
docker run -it -p 8080:8080 -v $HOME:$HOME agent-studio

# Custom working directory
docker run -it -p 8080:8080 -v $HOME:$HOME -w /path/to/project agent-studio
```

Ensure Claude Code CLI is available inside the container. Mount `~/.claude` for config access.

---

## Troubleshooting

### Server won't start

- **Port in use** — `lsof -i :8080` to find the process, `kill -9 <PID>` to free it. Or run on another port: `PORT=9090 npm run dev`
- **node-pty build failure** — install build tools: `xcode-select --install` (macOS) or `apt install python3 make g++` (Linux)
- **Stale cache** — delete `node_modules` and `.next`, then `npm install && npm run dev`

### Terminal goes blank

Refresh the page. WebSocket reconnects automatically and replays the terminal buffer. If persistent, restart: kill the server, `rm -rf .next`, then `npm run dev`.

### Session stuck in "starting"

Check if Claude Code CLI works in a regular terminal: `claude --version`. Look at the session's exit code by hovering over the status badge in the sidebar.

### Usage data not showing

Usage polling runs every 30 seconds after session launch. If Claude Code is installed in a non-standard location, usage files may not be found.

### Git status not updating

Git polls every 10 seconds. Verify project paths in `.agent-studio.json` point to valid git repos.

### Port already in use

```bash
lsof -i :8080          # Find the process
kill -9 <PID>          # Kill it
PORT=3000 npm run dev  # Or use a different port
```
