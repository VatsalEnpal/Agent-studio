# Sprint Handoff Contract

Agent Studio's workflow engine passes state between sprint steps as JSON files on disk. This is the **actual contract that ships** — the format agents must read on input and write on output to participate in a sprint.

## Where handoffs live

```
<agentSystemBase>/sprints/handoffs/
```

`<agentSystemBase>` is the agent-system directory configured for the current project (typically `ai-agents/` at the repo root, resolved via `getAgentSystemBase()`). If no agent system is configured, the executor falls back to `<cwd>/.agent-studio/sprints/handoffs/` so runs still work out-of-the-box.

This is the single directory `SprintManager.getHandoffs()` reads at runtime, and the directory `WorkflowExecutor` writes to during a run.

## File naming

Each agent step in a workflow produces two files, keyed by the step's `id`:

| File                   | Written by      | Purpose                                  |
| ---------------------- | --------------- | ---------------------------------------- |
| `<stepId>_input.json`  | the executor    | The step's prompt/context before it runs |
| `<stepId>_output.json` | the executor    | The step's result after it completes     |
| `qa_report.json`       | a QA agent/step | Specialized QA summary (see below)       |

The `<stepId>` prefix is the workflow step's `id` (e.g. `scan`, `design`, `build`). `SprintManager.getHandoffs()` returns every `*.json` file in this directory **except** `qa_report.json`, which is served via `getQaReport()`.

## Input JSON shape

```json
{
  "stepId": "design",
  "runId": "run_01J...",
  "workflowId": "ship-feature",
  "agent": "designer",
  "goal": "Draft an architecture for the new export flow.",
  "priorStepOutput": {
    "stepId": "scan",
    "ref": "/abs/path/ai-agents/sprints/handoffs/scan_output.json"
  }
}
```

`priorStepOutput` is present only when a previous agent step wrote an output file. `ref` is the absolute path the current agent should read to get the previous step's result.

## Output JSON shape

```json
{
  "stepId": "design",
  "runId": "run_01J...",
  "workflowId": "ship-feature",
  "agent": "designer",
  "status": "completed",
  "completedAt": "2026-04-18T14:22:05.110Z",
  "output": "...free-form string or structured object...",
  "tokenUsage": { "input": 1234, "output": 567 }
}
```

`output` is the payload the next step's agent will receive via `priorStepOutput.ref`. Keep it self-contained — the next agent resolves context purely from this file.

## `qa_report.json`

A QA step writes a structured summary that the Sprints UI renders natively:

```json
{
  "timestamp": "2026-04-18T14:45:00.000Z",
  "health_score": 8.5,
  "bugs": [{ "severity": "high", "title": "Router crashes on empty state" }],
  "passed_flows": ["login", "create-room"]
}
```

## Example — 2-step sprint walkthrough

Workflow: `scan` → `design`. After a successful run, the handoffs directory contains:

```
ai-agents/sprints/handoffs/
├── scan_input.json       # written before scan runs
├── scan_output.json      # written when scan completes
├── design_input.json     # written before design runs (priorStepOutput → scan_output.json)
└── design_output.json    # written when design completes
```

`design_input.json` carries a `priorStepOutput.ref` pointing at `scan_output.json`, so the `designer` agent knows exactly where to read the scan's findings without scanning the filesystem.

## How a power-user agent uses this

An agent participating in a sprint step should:

1. **Read its input file.** Locate `<stepId>_input.json` in the handoffs directory. Parse the `goal` and, if present, read the file at `priorStepOutput.ref` to pick up the previous step's work.
2. **Do the work.** Use the `goal` as the prompt and `priorStepOutput` as context.
3. **Write its output file.** Emit `<stepId>_output.json` with at minimum `stepId`, `status`, `completedAt`, and `output`. The next step's input will reference this file.

The executor handles creating both files for managed runs, but agents that run externally (e.g. via `claude -p` or a CI job) must honor the same names and shape so the Sprints UI and subsequent steps can consume them.
