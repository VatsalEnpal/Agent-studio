# ShipLoop — Workflow Engine Build (v3 — Final Audit Applied)

> Build the config-driven workflow engine from the spec at docs/superpowers/specs/2026-04-13-workflow-engine-design.md
> EVERY task must be tested before marking [DONE]. NO exceptions.
> NOTHING that currently works can break. Regression testing at every stage.
> Do NOT stop until ALL tasks show [DONE]. The run is NOT complete if any task is still [ ].

## Before You Start

1. Read the FULL spec: `docs/superpowers/specs/2026-04-13-workflow-engine-design.md`
2. Read the existing code: `server/workflows/*.ts`, `server/managers/sprint-manager.ts`, `server/types.ts`, `server/shared/types.ts`
3. Note: `server/types.ts` and `server/shared/types.ts` have COMPETING `WsMessage` type definitions. Reconcile these first (Task 2).
4. Note: `server/index.ts` is 3600+ lines. Add routes via modular files, don't bloat index.ts further.
5. Note: ALL agent step tests must use the mock CommandRunner (Task 3), NOT real `claude -p` calls. Do not burn API credits on tests.
6. Note: `server/workflows/workflow-registry.ts` already exports `WorkflowDefinition` and `WorkflowStepDefinition` types. Your new types in Task 1 MUST use different names (e.g., `WorkflowPipelineDef`) or replace the old ones and update all consumers. Do NOT create name collisions.
7. Note: Use `setInterval`/`setTimeout` for scheduling, NOT `node-cron`. Fewer dependencies = fewer failure modes.

## Rules

### Execution
- ONE task per cycle. Do not combine tasks.
- Commit after each task passes its tests. NEVER push.
- Must be on branch `shiploop/run3-build`.
- Use subagents (Agent tool) for heavy testing.
- If stuck for 2 cycles, mark [BLOCKED] and move on.
- If something breaks existing functionality, FIX IT immediately.
- After EVERY build task, run `npx tsc --noEmit`. If errors, fix them BEFORE proceeding. Do NOT accumulate type errors across tasks.

### Anti-Patterns — READ THIS EVERY CYCLE
- **DO NOT** declare victory early. The run is not complete until ALL tasks show [DONE].
- **DO NOT** skip tasks. Every task marked [ ] must be attempted.
- **DO NOT** batch tasks. Complete one, commit, then start the next.
- **DO NOT** self-grade without running tests. `npx vitest run` or Playwright must confirm.
- **DO NOT** continue past a TypeScript error. Fix it first.
- **DO NOT** ignore failing tests. If a test fails, the task is NOT done.

### State Tracking (MANDATORY — prevents losing progress after context compression)
- At the START of every cycle: read `.shiploop/state.json` AND this plan file.
- After completing each task: update `.shiploop/state.json`:
  ```json
  {
    "plan_file": "plan-workflow-engine.md",
    "current_task": <next task number>,
    "tasks_done": [<list of completed task numbers>],
    "tasks_blocked": [<list of blocked task numbers>],
    "last_commit": "<hash>",
    "last_updated": "<ISO timestamp>"
  }
  ```
- Also update this plan file: change `[ ]` to `[DONE]` for the completed task.
- If your context was compressed and you don't remember what happened: read `state.json` and this plan file. The `[ ]` vs `[DONE]` markers tell you exactly where to resume.

### Server Protocol (for regression checkpoints and Playwright tasks)
Every time you need the server running:
1. Kill any process on port 8080: `lsof -ti:8080 | xargs kill -9 2>/dev/null || true`
2. Start: `npm run dev &`
3. Wait: `for i in {1..30}; do curl -s http://localhost:8080/api/health > /dev/null 2>&1 && break; sleep 1; done`
4. Run your tests
5. When done with Playwright: kill server: `lsof -ti:8080 | xargs kill -9 2>/dev/null || true`

### Recovery from Crash/Compression
- If you lose context: re-read this plan AND `.shiploop/state.json`
- If the session dies and restarts: state.json has your position
- If a task was half-done when context compressed: check `git log --oneline -5` to see last commit. If the task's commit is there, it's done. If not, redo it.

---

## Part 0: Environment Setup (MUST be first)

### 0. [ ] Environment Setup

**BUILD:**
- Verify branch: `git branch --show-current` must be `shiploop/run3-build`
- Install missing dependency: `npm install node-notifier @types/node-notifier` (needed for Task 22 gate notifications)
- Kill any process on port 8080: `lsof -ti:8080 | xargs kill -9 2>/dev/null || true`
- Commit any previously uncommitted work: `git add -A && git commit -m "chore: pre-workflow-engine state"` (the working tree has ~133 dirty files from previous phases)
- Create initial `.shiploop/state.json` with: `{ "plan_file": "plan-workflow-engine.md", "current_task": 1, "tasks_done": [0], "tasks_blocked": [], "last_commit": "", "last_updated": "" }`

**TEST:**
- `npx tsc --noEmit` — must pass (zero errors)
- `npx vitest run` — must pass (all existing tests)
- `git status` — working tree clean after commit
- `node -e "require('node-notifier')"` — no error

---

## Part A: Foundation + Type Safety (Tasks 1-4)

### 1. [ ] Workflow Definition Schema + Validation

**BUILD:** Create `server/workflows/definition.ts`:
- TypeScript types: `WorkflowPipelineDef` (NOT `WorkflowDefinition` — that name is already used in `workflow-registry.ts`), `AgentStepDef`, `GateStepDef`, `LoopStepDef`, `AgentGroupStepDef`, `TriggerConfig`
- `validateWorkflow(def): { valid: boolean, errors: string[] }` covering ALL 7 config validation rules:
  1. No steps defined
  2. Loop references nonexistent steps
  3. Circular loop
  4. Gate with feedback but no previous agent step
  5. Duplicate step IDs
  6. Schedule interval < 1 minute (but allow override for testing via `_testBypassMinInterval` flag)
  7. Agent step with no goal

**TEST:** Unit tests in `server/__tests__/workflow-definition.test.ts`:
- One test per validation rule (7 tests minimum)
- Test valid configs for: simple (2 agent steps), with gate, with loop, with nested agent-group, with schedule
- Run `npx vitest run server/__tests__/workflow-definition.test.ts` — must pass

### 2. [ ] Reconcile WsMessage Types + Add Workflow Events

**BUILD:**
- `server/types.ts` and `server/shared/types.ts` have competing WsMessage definitions. Merge them into ONE canonical type in `server/shared/types.ts`. Update all imports.
- Add new event types to the unified WsMessage: `workflow-step-update`, `workflow-gate-waiting`, `workflow-run-complete`, `workflow-run-failed`
- Verify no existing WebSocket consumers break

**TEST:**
- `npx tsc --noEmit` — zero errors
- Start server, open app, verify existing WebSocket features work (sessions, rooms, sprints)
- Grep for old import paths — verify all updated

### 3. [ ] CommandRunner Interface + Mock

**BUILD:** Create `server/workflows/command-runner.ts`:
- `CommandRunner` interface:
  ```typescript
  interface CommandRunner {
    run(command: string, args: string[], options: { cwd: string; timeout?: number; signal?: AbortSignal }): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  }
  ```
- `ClaudeCommandRunner` — real implementation: spawns `claude -p` via child_process, captures stdout/stderr, returns on exit
- `MockCommandRunner` — test implementation: returns configurable responses. Can simulate: success, failure (non-zero exit), timeout, rate limit output, large output
- `CommandRunnerFactory` — returns real or mock based on environment/config

**TEST:** Unit tests in `server/__tests__/command-runner.test.ts`:
- Test MockCommandRunner returns configured responses
- Test MockCommandRunner can simulate failure, timeout
- Test ClaudeCommandRunner detects `claude` on PATH (just the detection, don't actually run it)

### 4. [ ] Run State Persistence

**BUILD:** Create `server/workflows/run-state.ts`:
- `RunState` type: runId, workflowId, status, currentStep, steps map, startedAt, completedAt, tokenUsage
- `saveRunState(state)` — atomic write (tmp + rename) to `.agent-studio/workflows/{workflowId}/runs/{runId}/state.json`
- `loadRunState(workflowId, runId)` — read + parse
- `listRuns(workflowId)` — list all runs with basic metadata
- `getActiveRuns()` — find runs with status "running" or "paused"
- `deleteRun(workflowId, runId)` — remove state file
- Create directories automatically if they don't exist

**TEST:** Unit tests in `server/__tests__/run-state.test.ts`:
- Save + load roundtrip
- List returns correct entries
- getActiveRuns filters correctly
- deleteRun removes files
- Atomic write: verify no partial files on disk

---

## Part B: Executor Core (Tasks 5-10)

### 5. [ ] Executor: Agent Step Execution

**BUILD:** Create `server/workflows/executor.ts`:
- `WorkflowExecutor` class, takes `CommandRunner` in constructor (dependency injection)
- `startRun(workflowDef): RunState` — creates run, sets status to "running"
- `executeStep(runState, stepDef)` — for agent steps:
  - Build command: `claude -p "{goal}" --agent {agentId} --model {model}` + permissions flag
  - Run via CommandRunner
  - Check exit code: 0 = success, non-zero = failure
  - If `output` specified, check file exists
  - Update step state (completed/failed, timestamps, output path)
- Save run state after each step
- Emit events: `step-started`, `step-completed`, `step-failed`

**TEST:** Using MockCommandRunner:
- Execute single-step workflow: mock returns success → verify step completed
- Execute two-step workflow: both succeed → verify both completed in order
- Mock returns non-zero exit → verify step failed, run paused
- Mock returns success but output file doesn't exist → verify failure
- Verify run state saved to disk after each step

### 6. [ ] Executor: Pre-Execution Validation

**BUILD:** Add to executor, runs BEFORE any step:
- Check `claude` is on PATH (`which claude`)
- Check each agent exists in `~/.claude/agents/` (scan for `{agentId}.md`)
- Check working directory exists
- Check input files from previous steps (where applicable)
- If any check fails: don't start run, return specific error messages array
- Also validate the workflow definition itself (call `validateWorkflow`)

**TEST:**
- Test with nonexistent agent → specific error "Agent 'xyz' not found at ~/.claude/agents/xyz.md"
- Test with nonexistent working directory → specific error
- Test with missing claude CLI → specific error
- Test all checks pass → run starts normally

### 7. [ ] Executor: Gate Steps

**BUILD:** Extend executor:
- When step type is "gate": set run status to "waiting_approval", set step status to "waiting"
- Emit `gate-waiting` event with: stepId, artifactPath (if any), workflowId, runId
- If artifact specified, verify file exists (warn if not, don't block)
- `approveGate(runId, stepId)` → resume execution from next step
- `rejectGate(runId, stepId, feedback?)`:
  - If no feedback: set run status to "cancelled"
  - If feedback: re-run previous agent step with feedback appended to goal, then re-present gate
- Store approval/rejection in step state (who, when, feedback text)

**TEST:** Using MockCommandRunner:
- Workflow: agent → gate → agent. Run pauses at gate (status = waiting_approval)
- Call approveGate → run resumes and completes
- Call rejectGate without feedback → run cancelled
- Call rejectGate with feedback → previous step re-runs with feedback in goal → gate re-presented
- Gate with artifact path → event includes path
- Gate without artifact → event has no path, still works
- Gate with missing artifact file → warning emitted, gate still works

### 8. [ ] Executor: Loop Steps

**BUILD:** Extend executor:
- Loop step wraps a list of step IDs
- Track: iteration count, max iterations, condition
- After each iteration, check condition (default: last step in loop exited with code 0)
- If met → exit loop, continue pipeline
- If not met and iterations < max → re-run loop steps from beginning
- If max exhausted → check `onExhausted`: "pause" (default) or "fail" or "skip"
- Run state tracks per-loop: current iteration, history of each iteration's results

**TEST:** Using MockCommandRunner:
- Loop with 3 steps, condition met on 2nd iteration → verify 2 iterations, then continues
- Loop with max 3, never passes → verify 3 iterations then pause
- Loop with max 1, passes first time → verify 1 iteration, clean exit
- onExhausted = "fail" → verify run status is "failed"
- onExhausted = "skip" → verify loop skipped, next step runs

### 9. [ ] Executor: Timeout + Cancellation

**BUILD:** Extend executor:
- Each agent step has optional `timeout` (seconds). Default: 300 (5 min).
- Use `AbortController` — pass signal to CommandRunner
- When timeout fires: abort the process, set step status to "timeout", pause run
- `cancelRun(runId)` — if a step is currently executing, abort the process (SIGTERM → 5s → SIGKILL), set status "cancelled"
- On pause: save state, the process is NOT killed (just paused in the executor loop)
- On resume: continue from the paused step

**TEST:** Using MockCommandRunner:
- Mock that sleeps 10s, timeout set to 1s → verify timeout fires, step status = "timeout"
- Start a run, call cancelRun mid-execution → verify process killed, status "cancelled"
- Pause and resume → verify execution continues from correct step

### 10. [ ] Executor: Nested Agent Groups

**BUILD:** Extend executor:
- Step type "agent-group" has inline `steps[]` array or `manifest` file path
- If manifest: read JSON file, parse as sub-steps array
- Execute sub-steps sequentially within the group
- Sub-steps can be agent steps OR gates (pause the whole workflow at a sub-gate)
- Track sub-step progress in the parent step's state
- Three visibility modes in the state: "opaque" (just track parent), "transparent" (full sub-step tracking), "expandable" (same as transparent, UI decides how to render)

**TEST:**
- Agent-group with 3 agent sub-steps → all execute in order
- Agent-group with a gate sub-step → workflow pauses, approve resumes
- Agent-group with a failing sub-step → parent step fails
- Manifest loading from file → verify sub-steps parsed correctly
- Opaque mode → run state only shows parent step status

### REGRESSION CHECKPOINT (after task 10) — RUN THIS, DO NOT SKIP:
- Start server, open app via Playwright
- Verify: Sessions, Teams, Memory, Reports, Settings all work
- Verify: existing sprint features unbroken
- Check `npx tsc --noEmit` — zero errors
- If anything broken: FIX before continuing

---

## Part C: Scheduler + Registry + API (Tasks 11-15)

### 11. [ ] Workflow Scheduler

**BUILD:** Create `server/workflows/scheduler.ts`:
- Use `setInterval` / `setTimeout` (NOT node-cron — fewer dependencies, simpler)
- Parse intervals: "every 2h" → 7200000ms, "every 30m" → 1800000ms, "every 1d" → 86400000ms
- `scheduleWorkflow(workflowId, trigger)` → set up recurring timer
- `unschedule(workflowId)`, `pauseSchedule(workflowId)`, `resumeSchedule(workflowId)`
- When timer fires: check if run already active (skip if yes), create new run via executor
- Persist to `.agent-studio/schedules.json` — survives restart
- `restoreSchedules()` — read file on startup, recreate all active timers
- NO retroactive runs after server downtime — just wait for next scheduled time

**TEST:**
- Schedule with `_testBypassMinInterval` flag, use 2-second interval
- Verify: timer fires, new run created
- Verify: skip-if-already-running (start a mock run that doesn't complete, verify second timer skips)
- Pause → verify timer stops. Resume → verify timer resumes.
- Save schedules to disk, clear in-memory, restore → verify timers recreated
- Invalid interval → verify error

### 12. [ ] Workflow Registry CRUD + Disk Persistence

**BUILD:** Update `server/workflows/workflow-registry.ts`:
- `saveWorkflow(def)` — validate → save to `.agent-studio/workflows/{id}/definition.json`
- `updateWorkflow(id, patch)` — merge, re-validate, save. If active run exists: block update with error.
- `deleteWorkflow(id)` — if active run exists: block with error "Cancel active runs first". Otherwise: remove definition + all run data.
- `listWorkflows()` — return all definitions with latest run status and schedule info
- On startup: load all definitions from disk, register providers

**TEST:**
- CRUD roundtrip: create → read → update → delete
- Save invalid workflow → validation error, not saved
- Delete with active run → blocked with clear error
- Update with active run → blocked with clear error
- List after creating 3 workflows → all 3 returned with correct metadata

### 13. [ ] API Routes for Workflows

**BUILD:** Create `server/routes/workflows.ts`:
- `GET /api/workflows` — list all
- `POST /api/workflows` — create (validate, save)
- `PUT /api/workflows/:id` — update
- `DELETE /api/workflows/:id` — delete
- `POST /api/workflows/:id/run` — start new run
- `GET /api/workflows/:id/runs` — list runs
- `GET /api/workflows/:id/runs/:runId` — run details
- `POST /api/workflows/:id/runs/:runId/approve/:stepId` — approve gate
- `POST /api/workflows/:id/runs/:runId/reject/:stepId` — reject gate (body: { feedback? })
- `POST /api/workflows/:id/runs/:runId/pause` — pause run
- `POST /api/workflows/:id/runs/:runId/resume` — resume run
- `POST /api/workflows/:id/runs/:runId/cancel` — cancel run
- `POST /api/workflows/:id/runs/:runId/retry/:stepId` — retry failed step
- `POST /api/workflows/:id/schedule` — set/update schedule
- `DELETE /api/workflows/:id/schedule` — remove schedule
- Register routes in `server/index.ts`
- Wire WebSocket events from executor to broadcast

**TEST:**
- Hit every endpoint with valid data → verify 200/201 responses
- Create → start run → approve gate → verify completion via GET run details
- 404 for nonexistent workflow/run
- 400 for invalid body
- 409 for delete-while-running, update-while-running
- Verify WebSocket events emitted (connect a test WS client)

### 14. [ ] Server Restart Recovery

**BUILD:** On server startup (in `server/index.ts` initialization):
- Call `getActiveRuns()` to find any runs that were interrupted
- For each active run: check what step was executing
- If step was an agent step: mark it as "interrupted", set run status to "paused"
- Emit notification: "Workflow '{name}' was interrupted by server restart. Resume from step '{step}'."
- User can then resume via API/UI
- Don't auto-resume (could cause duplicate work)

**TEST:**
- Create a run, update state to "running" with currentStep mid-pipeline
- Kill and restart server
- Verify: run detected as interrupted, status set to paused
- Resume → verify execution continues from the interrupted step

### 15. [ ] Rate Limit Detection + Auto-Retry

**BUILD:** In executor, after each `claude -p` call:
- Scan stdout/stderr for rate limit indicators: "429", "529", "rate limit", "overloaded"
- If detected: wait 60 seconds (or `_testRetryDelayMs` if set), auto-retry once
- If retry also fails: pause run with error "Rate limited after retry"
- Log rate limit events for debugging
- Support `_testRetryDelayMs` override (default 60000ms, tests use 100ms)

**TEST:** Using MockCommandRunner with `_testRetryDelayMs: 100`:
- Mock returns stdout containing "429 Too Many Requests" → verify wait + retry
- Mock: first call rate limited, retry succeeds → verify step completed
- Mock: both calls rate limited → verify run pauses with error

### REGRESSION CHECKPOINT (after task 15) — RUN THIS, DO NOT SKIP:
- Full app smoke test via Playwright
- Verify ALL existing features work
- `npx tsc --noEmit` — zero errors
- Create a workflow via API, start run, verify it executes

---

## Part D: Frontend (Tasks 16-22)

### 16. [ ] Zustand Store for Workflows

**BUILD:** Create `src/stores/workflows-v2.ts`:
- State: `workflows[]`, `selectedWorkflowId`, `runs[]`, `activeRunId`
- Actions: `fetchWorkflows`, `createWorkflow`, `deleteWorkflow`, `startRun`, `approveGate`, `rejectGate`, `pauseRun`, `resumeRun`, `cancelRun`, `retryStep`
- WebSocket listener for: `workflow-step-update`, `workflow-gate-waiting`, `workflow-run-complete`, `workflow-run-failed`
- Do NOT modify existing `workflows.ts` — keep it for backward compat

**TEST:**
- Import store, call fetchWorkflows → verify returns data from API
- Start app → verify no errors from new store
- Verify old sprint/workflow UI still works

### 17. [ ] Workflow List in Sidebar

**BUILD:** Create `src/components/workflows/workflow-list.tsx`:
- Group by: Active (running/paused) → Scheduled (with next-run time) → Completed
- Each entry: name, status badge (running=green, paused=amber, waiting=amber-pulse, completed=grey, failed=red), current step name, progress fraction
- Amber pulse dot on workflows waiting for gate approval
- Schedule badge: "Next: in 45m" or "Paused"
- "+ New Workflow" button at bottom
- If no workflows exist but sprint data exists → show link to existing sprints (backward compat)

**TEST:**
- Open app, navigate to Workflows section → verify renders (empty state or list)
- Create workflow via API → verify appears in list with correct status
- Start run → verify status updates in real-time

### 18. [ ] Create Workflow Dialog — Step 1+2 (Define + Pipeline)

**BUILD:** Create `src/components/workflows/create-workflow-dialog.tsx`:
- Step 1: Name, description, working directory (auto-fill from config)
- Step 2: Pipeline builder
  - Agent picker (fetch from /api/agents)
  - For each agent step: goal textarea, optional input/output file paths
  - "Add approval gate" button between any two steps → inserts gate step with: review artifact checkbox + path input, allow feedback checkbox, notification channel checkboxes
  - "Wrap in loop" button → select range of steps, set max iterations, set onExhausted
  - Reorder via drag or up/down arrows (reuse existing pattern)
  - Each gate shows a small gate badge icon in the pipeline
  - Each loop shows an iteration badge

**TEST:**
- Open dialog, add 3 agent steps + 1 gate + 1 loop → verify all render
- Save → verify POST to API with correct structure
- Reorder steps → verify order changes
- Remove a step → verify removal
- Validation: save with no steps → error shown

### 19. [ ] Create Workflow Dialog — Step 3+4 (Trigger + Preview)

**BUILD:** Continue the dialog:
- Step 3: Trigger configuration
  - Radio: Manual / Scheduled / Watch Mode
  - Scheduled: interval picker (dropdown: every 30m, 1h, 2h, 4h, 8h, 12h, 24h, custom)
  - Watch mode: state file path input
  - Manual: no extra config
- Step 4: Preview
  - Full pipeline visualization with step types, agent names, gate badges, loop indicators
  - Trigger summary: "Runs manually" / "Every 2 hours" / "Watches: /path/to/state.json"
  - "Create Workflow" button

**TEST:**
- Select each trigger type → verify correct config saved
- Preview shows all configured steps, gates, loops, trigger
- Create with scheduled trigger → verify schedule created via API

### 20. [ ] Workflow Detail — Timeline with Gates and Loops

**BUILD:** Create `src/components/workflows/workflow-detail.tsx`:
- Vertical timeline (same pattern as sprint-detail)
- Agent steps: agent name badge, status dot, duration, goal text preview
- Gate steps: artifact preview (first 30 lines via API), Approve / Reject buttons
  - Reject shows textarea for feedback if `allowFeedback` is true
  - "Send Back" label instead of "Reject" when feedback is enabled
- Loop indicator: wraps contained steps visually, shows "Round N/M" badge
- Failed steps: red dot, error message inline, "Retry" button, "Skip" button
- Paused state: prominent "Resume" banner at top
- Cancelled state: grey overlay with "Cancelled" label
- Activity log tab (reuse existing pattern)

**TEST:**
- Create + start workflow with all step types → verify renders correctly
- Gate reached → verify buttons appear, artifact preview shows file content
- Approve → verify run continues
- Reject with feedback → verify re-run
- Failed step → verify error + retry button
- Loop → verify iteration badge updates

### 21. [ ] Workflow Detail — Nested Agent Groups (Expandable)

**BUILD:** In workflow-detail:
- Agent-group steps show as one row by default with: group name, sub-step count, overall status
- Chevron to expand → shows sub-steps indented with the same timeline UI
- Sub-step gates work (approve/reject buttons when expanded)
- Collapse hides sub-steps, shows summary ("3/5 sub-steps complete")

**TEST:**
- Create workflow with agent-group → verify collapsed rendering
- Click expand → verify sub-steps visible
- Sub-step at gate → verify approve button works when expanded
- Collapse → verify summary shows

### 22. [ ] Gate Notifications

**BUILD:**
- When executor emits `gate-waiting`, trigger notifications:
  - **In-app**: Amber badge on workflow in sidebar + toast notification
  - **Mac**: Use `node-notifier` (already available) for the dev server, Electron `Notification` for the Electron app
  - **Telegram**: If telegram plugin is configured, send message via plugin
- Notification content: "Workflow '{name}' needs approval at '{gateName}'"
- Gate config specifies which channels: `notify: ["mac", "telegram"]`
- If no channels specified: in-app only (default)

**TEST:**
- Run workflow with gate + `notify: ["mac"]` → verify Mac notification fires
- Verify in-app badge appears on workflow in sidebar
- Verify toast notification shows

### REGRESSION CHECKPOINT (after task 22) — RUN THIS, DO NOT SKIP:
- Full app smoke test: Sessions, Teams, Memory, Reports, Settings, Dev Servers
- Verify existing sprint UI still works
- Verify command palette, keyboard shortcuts, session launcher
- `npx tsc --noEmit` — zero errors

---

## Part E: Watch Mode + Migration + Templates (Tasks 23-26)

### 23. [ ] Watch Mode Workflows

**BUILD:** In executor, support `"mode": "watch"`:
- Don't spawn agents. Watch a `stateFile` path with chokidar.
- Parse state file changes → map to step status updates
- Gates still work: user clicks approve in UI → write approval to state file → external orchestrator reads it
- Define a standard watch state file format (or accept the existing sprints/state.json format)

**TEST:**
- Create watch-mode workflow pointing at a test state file
- Write changes to the file → verify UI updates
- Approve a gate → verify state file updated
- Verify no agents spawned (watch-only)

### 24. [ ] Import Existing Sprint as Watch-Mode Workflow

**BUILD:**
- "Import existing sprint" button in workflow list
- Reads current SprintManager state → maps 8 hardcoded steps to a workflow definition
- Creates a watch-mode workflow that mirrors the sprint file structure
- Existing SprintManager continues to work independently

**TEST:**
- Click import → verify workflow created with correct steps
- Verify SprintManager still works alongside the new workflow
- Verify imported workflow reflects current sprint state

### 25. [ ] Settings > Automations Tab

**BUILD:** Create or update `src/components/settings/settings-automations.tsx`:
- List all scheduled workflows with: name, interval, next run time, pause/resume toggle, last run status
- "Run Now" button per workflow
- Run history per workflow (last 5 runs with status and duration)

**TEST:**
- Schedule a workflow → verify it appears in Automations
- Pause toggle → verify schedule pauses
- Run Now → verify new run starts
- Check last run history shows completed runs

### 26. [ ] Workflow Templates

**BUILD:** 4 built-in templates in the create dialog (Step 1):
- **Code Sprint**: PMO scan → approval → orchestrator → backend → frontend → QA loop → review → deploy
- **Research Report**: research → review gate → writer → approval gate → publish
- **Data Pipeline**: collector → validator → review gate → uploader
- **Custom**: empty pipeline

**TEST:**
- Select each template → verify pipeline pre-filled with correct steps
- Modify a template's pre-filled pipeline → verify changes stick
- Custom → verify empty pipeline
- Create from template → verify workflow saves correctly

---

## Part F: Error Handling Deep Dive (Tasks 27-29)

### 27. [ ] Execution Errors — Crash, Timeout, Missing Output

**TEST-FOCUSED:** Using MockCommandRunner:
- Agent crash: mock exits with code 1, stderr has error → verify step failed, error in state includes last 10 lines
- Agent timeout: mock takes 10s, timeout set to 1s → verify killed, step status "timeout"
- Missing output: mock exits 0 but output file doesn't exist → verify step failed with "didn't produce expected output"
- Large output (100KB stdout): mock returns 100KB → verify no crash, output truncated in state

### 28. [ ] Execution Errors — Rate Limit, Server Restart, Agent Conflict

**TEST-FOCUSED:** Using MockCommandRunner:
- Rate limit: mock stdout contains "429" → verify 60s wait + retry
- Server restart: save run state as "running", restart executor → verify state becomes "paused"
- Agent conflict: start two runs using same agent → verify second queues with message "Agent 'X' is busy"
- Verify queue resolves: first run completes → second run starts

### 29. [ ] Execution Errors — Graceful Degradation + Edge Cases

**TEST-FOCUSED:**
- Working directory deleted mid-run: verify graceful failure with clear error, not crash
- Workflow with 0 steps passed to executor (bypassing UI validation): verify clear error
- Agent stdout contains unexpected binary/garbage: verify no crash, step fails cleanly
- Two consecutive gates with no agent step between them: verify both pause correctly
- Step with empty goal string: verify validation catches or executor handles gracefully

---

## Part G: Boundary + Edge Case Tests (Tasks 30-32)

### 30. [ ] Boundary Tests — Small Workflows

**TEST-FOCUSED:**
- Single-step workflow (just one agent) → verify works end to end
- Workflow with only gates (no agents) → verify error "At least one agent step required"
- Workflow with only loops (no content) → verify error
- Gate as first step → verify it pauses immediately
- Gate as last step → verify it pauses before "completed"

### 31. [ ] Boundary Tests — Large + Unusual Workflows

**TEST-FOCUSED:**
- Workflow with 30 steps → verify creates, executes, timeline renders without overflow
- Goal text with 5000 characters → verify saves, displays (truncated in timeline, full in detail)
- Unicode in names/goals (emoji, Chinese, Arabic) → verify no crashes
- Step IDs with special characters → verify validation catches or handles
- Workflow name with very long text (200 chars) → verify truncation in sidebar

### 32. [ ] Backward Compatibility Deep Test

**TEST-FOCUSED:** Via Playwright MCP — test EVERY existing feature:
- Session launcher: open, create session, verify terminal grid
- Session kill: verify cleanup (no garbled output)
- Create Room: verify agents from /api/agents (not hardcoded), no orchestrator lock
- Sprint creation (old dialog): verify still works if accessed
- Memory: create, edit, delete, search, filter
- Reports: verify list/detail
- Settings: all 7 tabs, defaults correct
- Git: branch list, create, switch
- Dev Servers: list, add server dialog
- Command palette: all nav items present
- Keyboard shortcuts: Cmd+Shift+N, Cmd+Shift+K, Escape
- History tab: no 404 errors

---

## Part H: Final Verification (Tasks 33-40)

### 33. [ ] TypeScript Clean
Run `npx tsc --noEmit`. ZERO errors. Fix any that exist.

### 34. [ ] Build Clean
Run `npm run build` and `npm run build:server`. Both must succeed with zero errors.

### 35. [ ] All Unit Tests Pass
Run `npx vitest run`. ALL tests pass — old and new.

### 36. [ ] End-to-End Workflow Test (Execute Mode)
Via Playwright + API:
- Create a workflow with: 2 agent steps → gate → loop(2 steps, max 2) → final agent step
- Start the run
- Watch timeline update in real-time
- Approve the gate
- Verify loop executes
- Verify final completion
- Verify run state on disk matches UI

### 37. [ ] End-to-End Workflow Test (Watch Mode)
- Create watch-mode workflow pointing at a test state file
- Write state changes to the file
- Verify UI updates in real-time
- Approve gate via UI → verify state file updated

### 38. [ ] End-to-End Scheduled Workflow Test
- Create workflow with 5-second schedule (test bypass)
- Verify: first run fires automatically
- Verify: skip-if-running (run takes longer than interval)
- Pause schedule → verify stops firing
- Resume → verify fires again

### 39. [ ] Full App Smoke Test (Playwright)
Complete pass through ENTIRE app:
- Every tab, every dialog, every feature
- Create a workflow, run it, approve gate, verify completion
- Zero console errors on clean page load
- Take screenshots of every key workflow screen → `.shiploop/screenshots/workflow-engine/`

### 40. [ ] Write Final Report
`.shiploop/reports/final-report-workflow-engine.md`:
- Every task: pass/fail/blocked
- Test results summary
- Regression results
- Known limitations
- Commits made
- Architecture decisions made during build
- Recommended next steps (hybrid mode, event triggers, parallel execution)
