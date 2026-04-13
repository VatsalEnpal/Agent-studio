# Workflow Engine Design Spec

> Agent Studio's general-purpose workflow system. Replaces the hardcoded sprint template with a config-driven engine that anyone can use for any multi-agent workflow.

## Problem Statement

Agent Studio currently has a hardcoded 8-step sprint template that only works for Vatsal's specific agent setup. Other users cannot create their own workflows. The sprint UI is a dashboard (watches files) but doesn't execute anything. Users like Vatsal who already have agent orchestration need a way to onboard existing workflows. New users need Agent Studio to execute workflows for them.

## Design Principles

1. **Hybrid executor/dashboard** — Can execute workflows AND watch externally-driven ones
2. **Config-driven** — Workflows are data (JSON), not code
3. **Honest about failures** — Tell the user what broke, don't silently skip
4. **Prepare for everything** — Every user scenario we can think of must have a defined behavior

---

## Core Concepts

### Workflow
A reusable pipeline template. Defines: steps, their order, which agents, gates, loops, scheduling. Saved to `.agent-studio.json` under `workflows[]` or to a `workflows/` directory as individual JSON files.

### Step
One unit of work in a workflow. Has a type:
- **agent-step** — spawns a Claude Code session to do work
- **gate** — pauses for human approval (with or without artifact review)
- **loop** — repeats a range of steps until a condition is met (e.g., QA passes)

### Run
A single execution of a workflow. Has state: planned → running → paused → completed/failed/cancelled. Multiple runs can exist for the same workflow (history).

### Trigger
What starts a workflow run:
- **manual** — user clicks "Run"
- **scheduled** — cron/interval (every 2h, daily, etc.)
- **event** — file change, webhook, or another workflow completing

---

## Workflow Definition Schema

```json
{
  "id": "weekly-research-report",
  "name": "Weekly Research Report",
  "description": "Research agent gathers data, human reviews, email agent sends",
  "mode": "execute",
  "trigger": {
    "type": "scheduled",
    "interval": "every 2h",
    "paused": false
  },
  "workingDirectory": "/Users/demo/Code/my-project",
  "steps": [
    {
      "id": "research",
      "name": "Research",
      "type": "agent",
      "agent": "research-agent",
      "goal": "Search the internet for the latest AI news and write a summary to research-output.md",
      "output": "research-output.md",
      "model": "sonnet",
      "onFailure": "pause",
      "maxRetries": 0,
      "timeout": 300
    },
    {
      "id": "human-review",
      "name": "Review Research",
      "type": "gate",
      "reviewArtifact": "research-output.md",
      "notify": ["mac", "telegram"],
      "allowFeedback": true
    },
    {
      "id": "write-email",
      "name": "Draft Email",
      "type": "agent",
      "agent": "email-agent",
      "goal": "Read research-output.md and draft a newsletter email. Save to email-draft.md",
      "input": "research-output.md",
      "output": "email-draft.md",
      "model": "sonnet",
      "onFailure": "pause"
    },
    {
      "id": "approve-send",
      "name": "Approve Send",
      "type": "gate",
      "reviewArtifact": "email-draft.md",
      "notify": ["mac"],
      "allowFeedback": true
    },
    {
      "id": "send-email",
      "name": "Send Email",
      "type": "agent",
      "agent": "email-agent",
      "goal": "Read email-draft.md and send it to the distribution list",
      "input": "email-draft.md",
      "model": "haiku",
      "onFailure": "pause"
    }
  ]
}
```

### Step Types

**Agent Step:**
```json
{
  "type": "agent",
  "agent": "agent-id",
  "goal": "What the agent should do (one line)",
  "input": "file-from-previous-step.md",
  "output": "file-this-step-produces.md",
  "model": "sonnet|opus|haiku",
  "permissions": "default|bypass|plan",
  "onFailure": "pause|retry|skip",
  "maxRetries": 2,
  "timeout": 300
}
```

**Gate Step:**
```json
{
  "type": "gate",
  "reviewArtifact": "path/to/file.md",
  "notify": ["mac", "telegram"],
  "allowFeedback": true,
  "description": "Optional explanation of what to review"
}
```
- `reviewArtifact` is optional — if omitted, gate is just an approve button (no file to review)
- `allowFeedback` — if true, user can reject with notes that get sent back to the previous agent step
- `notify` — where to send the "needs your approval" notification

**Loop Step:**
```json
{
  "type": "loop",
  "steps": ["build-backend", "build-frontend", "qa-test"],
  "condition": "qa-test.passes",
  "maxIterations": 3,
  "onExhausted": "pause"
}
```
- Wraps a range of steps that repeat until condition is met
- `onExhausted` — what happens when max iterations hit without condition met

---

## Workflow Modes

### Execute Mode (`"mode": "execute"`)
Agent Studio drives the workflow. For each agent step:
1. Spawns `claude -p "{goal}. Read input from {input}. Save output to {output}."` with `--agent {agent-id}` and `--model {model}`
2. Process exits → step complete
3. Checks if output file exists → if yes, step passed; if no, step failed
4. Advances to next step (or gate, or loop)

### Watch Mode (`"mode": "watch"`)
For users like Vatsal who have their own orchestration. Agent Studio watches a directory for state changes:
1. User specifies a `stateFile` path (like `sprints/state.json`)
2. Agent Studio watches that file with chokidar
3. When state changes, UI updates to reflect current step, gate status, etc.
4. Gates still work — user clicks approve, Agent Studio writes to the state file, external orchestrator reads it

### Hybrid
A workflow can mix both. Some steps are executed by Agent Studio, some are watched. Use case: Vatsal's PMO runs externally (watch mode), but the build steps are executed by Agent Studio.

```json
{
  "steps": [
    { "type": "agent", "execution": "external", "watchFile": "sprints/state.json" },
    { "type": "gate" },
    { "type": "agent", "execution": "internal", "agent": "backend", "goal": "..." }
  ]
}
```

---

## Nested Agents (Clearing Agent Pattern)

An agent that internally manages sub-agents. Three visibility levels:

### Opaque
Workflow sees one step. Agent runs internally. No visibility into sub-steps.
```json
{ "type": "agent", "agent": "clearing-agent", "goal": "Run full clearing process" }
```

### Transparent
Agent declares its sub-steps in a manifest. Agent Studio expands them in the timeline.
```json
{
  "type": "agent-group",
  "agent": "clearing-agent",
  "manifest": ".claude/agents/clearing-manifest.json",
  "steps": [
    { "id": "fetch-notion", "name": "Fetch Notion Logic", "agent": "notion-fetcher" },
    { "id": "create-scripts", "name": "Create Scripts", "agent": "script-creator" },
    { "id": "validate", "name": "Validate Logic", "agent": "sql-validator" },
    { "id": "human-review", "type": "gate", "reviewArtifact": "validation-report.md" },
    { "id": "setup-airtable", "name": "Setup Airtable", "agent": "airtable-setup" },
    { "id": "backfill", "name": "Backfill Data", "agent": "backfill-agent" },
    { "id": "link", "name": "Link Records", "agent": "linking-agent" },
    { "id": "final-gate", "type": "gate", "reviewArtifact": "clearing-report.md" }
  ]
}
```

### Expandable (UI-only)
Same as transparent, but the UI shows it collapsed by default. Click to expand and see sub-steps. This is a frontend concern, not a backend one — the engine treats it as transparent.

### How the manifest works
The agent's .md file can reference a manifest: `manifest: .claude/agents/clearing-manifest.json`. Or the user can declare sub-steps inline in the workflow definition. Agent Studio reads the manifest at workflow creation time and expands it into the timeline.

---

## Onboarding Existing Workflows

For users like Vatsal who already have agent orchestration:

### Option 1: Import from agent files
Agent Studio scans `.claude/agents/` and detects agents that describe workflows (look for keywords: "orchestrates", "sub-agents", "pipeline", "gates", "steps"). Offer to import them as workflow definitions.

### Option 2: Import from state files
User points Agent Studio at their sprint state directory. Agent Studio reads the state file format and creates a watch-mode workflow that maps to their existing file structure.

### Option 3: Manual declaration
User creates a workflow in the UI, marks steps as "external" (watch mode), and maps them to their existing agents. Agent Studio watches the state file for progress but doesn't execute.

### Option 4: Gradual migration
Start with watch mode for the existing workflow. Over time, convert individual steps from external to internal as trust builds. Eventually the whole workflow runs in Agent Studio.

---

## Scheduling

### How it works
- Node.js `setInterval` or `node-cron` for recurring schedules
- Schedule definition in the workflow config: `"interval": "every 2h"` or `"cron": "0 */2 * * *"`
- Schedules persist to disk (survive server restart)
- The schedule starts a new workflow RUN each time it fires
- If a run is already in progress when the schedule fires, skip (don't stack runs)

### Controls
- **Pause schedule** — stop firing, keep the config (user can resume later)
- **Run now** — manually trigger one run outside the schedule
- **Edit interval** — change frequency without recreating the workflow

### Persistence
Schedules are written to `.agent-studio.json` or a `schedules.json` file. On server start, all active schedules are restored. If the server was down when a schedule should have fired, it does NOT retroactively run — it waits for the next scheduled time.

---

## Failure Modes and How Each Is Handled

### Pre-Execution Failures (catch BEFORE starting)

| Failure | Detection | User sees |
|---------|-----------|-----------|
| Agent not found in ~/.claude/agents/ | Check at workflow creation AND before each run | "Agent 'data-scraper' not found. Create it in Settings > Agents or check the file exists at ~/.claude/agents/data-scraper.md" |
| Claude Code CLI not installed | Check `which claude` at server start | "Claude Code CLI not found. Install it from https://claude.ai/code" |
| Working directory doesn't exist | Check at run start | "Working directory /path/to/project does not exist" |
| Previous step output file missing | Check before starting dependent step | "Step 'write-email' expects input from 'research-output.md' but that file doesn't exist. Previous step may have failed to produce output." |
| Model not available | Check at run start | "Model 'opus' is not available with your current plan" |
| Port/server issues | Health check before run | "Agent Studio server is not responding. Restart with npm run dev" |

### Execution Failures (during a run)

| Failure | Detection | Default behavior | User sees |
|---------|-----------|------------------|-----------|
| Agent session crashes (non-zero exit) | Process exit code ≠ 0 | Pause workflow | "Step 'research' failed. Agent exited with error: [last 10 lines of output]. Retry / Skip / Cancel" |
| Agent produces no output file | Check for output file after process exits | Pause workflow | "Step 'research' completed but didn't produce 'research-output.md'. The agent may not have understood the goal. Edit goal and retry / Skip" |
| Agent times out | Timeout timer | Kill process, pause workflow | "Step 'research' timed out after 5 minutes. The agent may be stuck. Retry with longer timeout / Skip / Cancel" |
| Claude Code rate limited | Detect 429/529 in output | Wait 60s, auto-retry once | "Step 'research' hit rate limits. Waiting 60s and retrying..." |
| Agent writes garbage output | Cannot auto-detect | Continue (next step or gate will catch it) | Gate shows the artifact — human decides if it's acceptable |
| QA loop exhausts max iterations | Iteration counter | Pause workflow | "QA loop completed 3 iterations without passing. Last health score: 72%. Review results / Force continue / Cancel" |
| Gate timeout (user doesn't respond) | Optional timeout on gates | Stay paused indefinitely | Notification badge stays, re-notify after configurable interval |
| Server restarts mid-run | State persisted to disk | Resume from last completed step | "Workflow 'Weekly Report' was interrupted. Resuming from step 3 'write-email'." |
| WebSocket disconnects | Reconnect logic (already exists) | UI reconnects, state reloads | Brief disconnection banner, then auto-recovers |
| Disk full | Write fails | Pause workflow | "Cannot write output: disk full" |
| Agent needs user input mid-step | Agent writes to stdout asking a question | Pause step (cannot auto-answer) | "Agent is asking: 'Which database should I connect to?' Provide input or skip step" |
| Two workflows try to use same agent simultaneously | Lock per agent | Queue the second run | "Agent 'backend' is busy in workflow 'Sprint 5'. Waiting..." |
| Nested agent sub-step fails | Sub-agent exit code or manifest state | Pause parent step | "Clearing agent: sub-step 'validate' failed. Details: [error]. Retry sub-step / Skip / Cancel workflow" |

### Configuration Failures (bad workflow definition)

| Failure | Detection | User sees |
|---------|-----------|-----------|
| No steps defined | Validate at save | "Workflow must have at least one step" |
| Loop references steps that don't exist | Validate at save | "Loop references step 'qa-test' which is not defined" |
| Circular loop (loop contains itself) | Validate at save | "Loop creates a circular reference" |
| Gate with feedback but no previous agent step | Validate at save | "Gate 'review' allows feedback but has no previous agent step to send feedback to" |
| Duplicate step IDs | Validate at save | "Duplicate step ID: 'build'" |
| Schedule interval too short (<1 minute) | Validate at save | "Schedule interval must be at least 1 minute" |
| Agent step with no goal | Validate at save | "Step 'research' needs a goal — what should the agent do?" |

---

## UI Changes (minimal — keep existing design)

### Workflow List (replaces Sprint List in sidebar)
- Rename "Sprints" to "Workflows" (or keep "Sprints" as a subset)
- Show all workflows: Active / Scheduled / Paused / Completed
- Each shows: name, status, current step, agent count
- Amber dot on workflows waiting for approval (gate)
- Schedule badge showing next run time

### Workflow Detail (extends current Sprint Detail)
- Same timeline view — steps with status dots (green/amber/grey/red)
- Gate steps show artifact preview + Approve / Reject / Send Back buttons
- Loop steps show iteration count and current round
- Nested agents show collapsed by default, expandable
- Error states show the error inline with Retry / Skip / Cancel buttons
- Activity log (already exists) shows all events

### Create Workflow (extends current Sprint Creation dialog)
- Step 1: Name, description, working directory (same as now)
- Step 2: Build pipeline — drag agents into order, add gates between them, configure loops
  - Each step: agent picker + goal text + optional input/output files
  - Gate: toggle "has artifact to review", toggle "allow feedback", select notification channels
  - Loop: select which steps to loop, set max iterations
- Step 3: Trigger — Manual / Scheduled (interval picker) / Watch mode (state file path)
- Step 4: Preview pipeline (same as now, with gate badges and loop indicators)

### Settings > Automations
- List of all scheduled workflows with pause/resume toggles
- Next run time for each
- Run history with pass/fail

---

## Backend Architecture

### New: WorkflowExecutor (the brain)
```
server/workflows/executor.ts
```
Drives a workflow run through its steps:
- Reads the workflow definition
- For each step: spawns agent session, waits for completion, checks output
- At gates: pauses, emits WebSocket event, waits for user action
- At loops: tracks iterations, checks conditions, repeats or exits
- Writes run state to disk after every step change
- Emits events for UI updates via WebSocket

### New: WorkflowScheduler
```
server/workflows/scheduler.ts
```
Manages cron/interval triggers:
- Reads scheduled workflows from config on server start
- Sets up timers for each active schedule
- When timer fires: creates a new run, passes to executor
- Handles skip-if-already-running logic

### Updated: WorkflowRegistry
Already exists. Add:
- Save/load workflow definitions to disk
- CRUD operations (create, update, delete, list)
- Validation (catch config errors at save time)

### Updated: SprintManager
Keep for backward compatibility (Vatsal's file-watching sprints). But make it a special case of the workflow engine — a watch-mode workflow that maps to the existing file structure.

### Run State Persistence
Each workflow run writes state to `.agent-studio/workflows/{workflow-id}/runs/{run-id}/state.json`:
```json
{
  "runId": "run-2026-04-13-001",
  "workflowId": "weekly-research-report",
  "status": "running",
  "currentStep": "write-email",
  "startedAt": "2026-04-13T10:00:00Z",
  "steps": {
    "research": { "status": "completed", "startedAt": "...", "completedAt": "...", "output": "research-output.md" },
    "human-review": { "status": "completed", "approvedAt": "...", "approvedBy": "user" },
    "write-email": { "status": "running", "startedAt": "..." }
  }
}
```

Survives server restarts. On startup, executor reads all active run states and resumes them.

---

## Token Efficiency

| Approach | Token cost | When to use |
|----------|-----------|-------------|
| `claude -p` (one-shot) | Lowest — fresh context per step, only goal + input | Default for all agent steps |
| `claude -p --agent` | Low-Medium — agent .md adds context but still one-shot | When agent needs its role definition |
| Interactive session | Highest — accumulates context across messages | Only for loop steps (QA iterations) |
| Watch mode (external) | Zero from Agent Studio | For users with their own orchestration |

Recommendation: default everything to `claude -p --agent {agent-id}` (one-shot with agent context). Only use interactive sessions for explicitly configured loop steps. This keeps token cost proportional to the number of steps, not the complexity of the conversation.

---

## Migration Path

### For Vatsal (existing sprint setup)
1. Keep current SprintManager as-is (backward compatible)
2. Offer "Import existing sprint" that creates a watch-mode workflow from the current sprints/ directory structure
3. Gradually convert steps to execute mode as desired

### For new users
1. Create workflow via UI → pipeline builder
2. Agent Studio executes everything
3. No file watching, no external orchestration needed

### For power users (clearing agent pattern)
1. Create workflow with nested agent-group steps
2. Provide manifest JSON for sub-agent structure
3. Agent Studio expands and tracks sub-steps
4. Gates work at any nesting level

---

## What Cannot Be Accommodated (tell the user)

1. **Real-time streaming between agents** — agents can pass files, not live streams. If your workflow needs agent A to stream data to agent B in real-time, this engine doesn't support it. Use a single agent instead.
2. **Non-Claude agents** — the executor spawns Claude Code sessions. It can't run Cursor, Copilot, or other AI tools. (MCP-based integration could be added later but is out of scope.)
3. **Parallel step execution** — steps run sequentially, not in parallel. If you need 3 agents working simultaneously, use a single step with a multi-agent prompt or a nested agent-group. (Parallel execution is a future enhancement.)
4. **External API triggers** — the scheduler runs on a timer, not on webhooks. "Run when a GitHub PR is opened" requires an external webhook handler that Agent Studio doesn't provide yet.
5. **Guaranteed delivery of notifications** — Mac notifications and Telegram are best-effort. If the server is down, notifications are lost.
6. **Undo/rollback** — if a step makes changes (commits code, sends email), there's no automatic undo. Gates before destructive steps are the user's safety net.
