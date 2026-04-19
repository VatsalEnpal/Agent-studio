import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import type { WebSocketServer } from "ws";
import {
  readCurrentSprint,
  readReadyQueue,
  readScanLog,
  readSprintHistory,
  readHandoffs,
} from "../file-watcher.js";
import { getAgentSystemPath, getAgentSystemBase } from "../config.js";
import type { WorkflowManager } from "../workflows/index.js";
import type { WorkflowExecutor } from "../workflows/executor.js";
import type { PipelineRegistry } from "../workflows/workflow-registry.js";
import type { WorkflowPipelineDef } from "../workflows/definition.js";
import type { RunState, StepStatus } from "../workflows/run-state.js";
import { loadRunState, saveRunState } from "../workflows/run-state.js";
import type { WsMessage } from "../shared/types.js";
import { broadcast } from "../ws/broadcast.js";

/** Directory where persisted sprint JSON files live. */
function sprintsDir(): string {
  return path.join(process.cwd(), ".agent-studio", "sprints");
}

/**
 * The UI receives sprint rows with `id` formatted as `<sprintId>-run-<runId>`
 * (see `flowsToSprints`). Action routes accept either the bare sprintId or
 * the combined form; this helper strips the `-run-<runId>` suffix so the
 * lookup always resolves against the persisted sprint file.
 */
function stripRunSuffix(id: string): string {
  const idx = id.indexOf("-run-");
  return idx === -1 ? id : id.slice(0, idx);
}

/**
 * Map a workflow step-state status to the value persisted on disk in the
 * sprint flow JSON. `flowsToSprints` further remaps these to UI gate
 * status values, so we pass through the executor's `completed`/`running`/
 * `failed`/`waiting` vocabulary directly rather than pre-translating to
 * `passed`/`in_progress`/etc.
 */
function stepStatusToPersisted(
  status: StepStatus | undefined,
): "completed" | "running" | "failed" | "waiting" | "not_started" {
  if (status === "completed") return "completed";
  if (status === "running") return "running";
  if (status === "waiting") return "waiting";
  if (status === "failed" || status === "timeout") return "failed";
  return "not_started";
}

/** Map a run status → the sprint flow status used by the UI. */
function runStatusToFlow(status: RunState["status"]): string {
  if (status === "running") return "running";
  if (status === "paused") return "paused";
  if (status === "completed") return "completed";
  if (status === "failed" || status === "budget_exceeded") return "failed";
  if (status === "cancelled") return "cancelled";
  if (status === "waiting_approval") return "paused";
  return "planned";
}

/**
 * Rewrite a persisted sprint JSON file to reflect the executor's run state.
 * No-op if the sprint file does not exist.
 *
 * Returns true if the file was updated, false otherwise. Does NOT reload the
 * WorkflowManager or broadcast — the caller is responsible for those side
 * effects so they can be batched.
 */
export function syncSprintFileFromRun(sprintId: string, runState: RunState): boolean {
  const file = path.join(sprintsDir(), `${sprintId}.json`);
  if (!fs.existsSync(file)) return false;

  let data: any;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return false;
  }

  // Match the run by runId (primary) or by first run if single-run sprint.
  const run =
    data.runs?.find((r: any) => r.id === runState.runId) ??
    (data.runs?.length === 1 ? data.runs[0] : undefined);
  if (!run) return false;

  run.status = runStatusToFlow(runState.status);
  if (runState.startedAt && !run.startedAt) run.startedAt = runState.startedAt;
  if (runState.completedAt) run.completedAt = runState.completedAt;

  for (const step of run.steps ?? []) {
    const stepState = runState.steps[step.id];
    if (stepState) {
      step.status = stepStatusToPersisted(stepState.status);
      if (stepState.startedAt) step.startedAt = stepState.startedAt;
      if (stepState.completedAt) step.completedAt = stepState.completedAt;
    }
  }
  data.status = runStatusToFlow(runState.status);

  try {
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tmp, file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Post server-restart reconciliation: for any sprint flow JSON whose persisted
 * status is `running` or whose run RunState was flipped to `paused` by the
 * restart-recovery block in `server/index.ts`, rewrite the sprint file to
 * `status: "paused"` + `pauseReason: "server-restarted"`.
 *
 * Must be called AFTER the index.ts recovery loop has persisted interrupted
 * RunStates. Returns the list of sprintIds that were reconciled so the caller
 * can log.
 */
export function reconcileInterruptedSprints(): string[] {
  const dir = sprintsDir();
  if (!fs.existsSync(dir)) return [];
  const reconciled: string[] = [];
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  for (const f of files) {
    const file = path.join(dir, f);
    let data: any;
    try {
      data = JSON.parse(fs.readFileSync(file, "utf-8"));
    } catch {
      continue;
    }

    const sprintStatus = data.status as string | undefined;
    // Only consider sprints that were mid-flight. "planned" + "completed" +
    // "cancelled" + "failed" are terminal/not-started and should not be
    // touched by reconciliation.
    if (sprintStatus !== "running" && sprintStatus !== "in_progress") {
      continue;
    }

    const runId = data.runs?.[0]?.id as string | undefined;
    if (!runId) continue;

    // Cross-check run state on disk — if the executor's RunState is paused,
    // the restart-recovery block already flipped it from `running` →
    // `paused`. If it's still `running` somehow (no state file / crash
    // before save), treat it as interrupted too.
    const runState = loadRunState(data.id, runId);
    const runIsPaused = !runState || runState.status === "paused";
    if (!runIsPaused) continue;

    data.status = "paused";
    data.pauseReason = "server-restarted";
    if (data.runs?.[0]) {
      data.runs[0].status = "paused";
    }
    try {
      const tmp = file + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
      fs.renameSync(tmp, file);
      reconciled.push(data.id);
    } catch {
      /* best-effort */
    }
  }
  return reconciled;
}

/** Read the persisted pipelineDef (embedded on create) for a sprint. */
function readPersistedPipelineDef(sprintId: string): WorkflowPipelineDef | null {
  const file = path.join(sprintsDir(), `${sprintId}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf-8"));
    return (data.pipelineDef as WorkflowPipelineDef | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Read the runId of the first (and currently only) run on a sprint. */
function readSprintRunId(sprintId: string): string | null {
  const file = path.join(sprintsDir(), `${sprintId}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf-8"));
    return (data.runs?.[0]?.id as string | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Read the persisted sprint status from disk (not via WorkflowManager cache). */
function readPersistedSprintStatus(sprintId: string): string | null {
  const file = path.join(sprintsDir(), `${sprintId}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf-8"));
    return (data.status as string | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Mark a persisted sprint as `running` (after an executor start). */
function markSprintRunning(sprintId: string, runId: string): void {
  const file = path.join(sprintsDir(), `${sprintId}.json`);
  if (!fs.existsSync(file)) return;
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf-8"));
    data.status = "running";
    // Clear restart-pause marker — the sprint is live again.
    delete data.pauseReason;
    if (data.runs?.[0]) {
      data.runs[0].id = runId;
      data.runs[0].status = "running";
      data.runs[0].startedAt = data.runs[0].startedAt ?? new Date().toISOString();
    }
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tmp, file);
  } catch {
    // best-effort; don't throw from this helper
  }
}

/** Handoffs directory (same logic as executor.resolveHandoffsDir). */
function handoffsDir(): string {
  const base = getAgentSystemBase();
  return base
    ? path.join(base, "sprints", "handoffs")
    : path.join(process.cwd(), ".agent-studio", "sprints", "handoffs");
}

/**
 * Walk a paused RunState and reconcile step statuses from disk before resume:
 * (a) any step with a `<stepId>_output.json` handoff on disk is marked
 *     `completed` (and advanced past).
 * (b) any step with status `interrupted` or `running` but no output is reset
 *     to `pending` so it re-executes.
 * (c) `waiting` steps stay `waiting` — `executeAgentStep` will re-enter the
 *     gate and re-register a `pendingStepGates` resolver.
 *
 * For SDK-backed agents, the executor's SDK runtime already honors
 * `options.resume = session.sessionId` (see server/sdk-session.ts:100-101), so
 * re-dispatching the step picks up the same conversation.
 *
 * For PTY-backed agents, PTY re-attach across a process restart is IMPOSSIBLE
 * (node-pty master fds die with the spawning process; the kernel sends SIGHUP
 * to the session leader). Policy: PTY steps relaunch using the already-written
 * `<stepId>_input.json` handoff as the new prompt — the executor's
 * `writeHandoffInput` reuses existing files so input is stable across restarts.
 */
function reconcileRunStateFromHandoffs(runState: RunState): void {
  const dir = handoffsDir();
  for (const [stepId, stepState] of Object.entries(runState.steps)) {
    const outputFile = path.join(dir, `${stepId}_output.json`);
    const hasOutput = fs.existsSync(outputFile);
    if (hasOutput && stepState.status !== "completed" && stepState.status !== "skipped") {
      stepState.status = "completed";
      stepState.completedAt = stepState.completedAt ?? new Date().toISOString();
      continue;
    }
    if (stepState.status === "interrupted" || stepState.status === "running") {
      // Reset so executeAgentStep re-enters cleanly.
      stepState.status = "pending";
      delete stepState.startedAt;
      delete stepState.completedAt;
    }
    // "waiting" / "pending" / "failed" / "timeout" stay as-is — the executor
    // loop will handle them.
  }
}

/** Map raw WorkflowFlow[] into Sprint[] for the frontend. */
export function flowsToSprints(
  flows: Awaited<ReturnType<WorkflowManager["getFlows"]>>,
): Array<Record<string, unknown>> {
  const sprints: Array<Record<string, unknown>> = [];

  for (const flow of flows) {
    for (const run of (flow as any).runs ?? []) {
      const runAgent = (step: any): string | null =>
        (step as any).agent ?? (step as any).agents?.[0] ?? null;
      const gates = ((run as any).steps ?? []).map((step: any, i: number) => ({
        id: step.id ?? `gate-${i}`,
        name: step.name ?? `Step ${i + 1}`,
        status:
          step.status === "completed"
            ? "passed"
            : step.status === "running" || step.status === "active"
              ? "in_progress"
              : step.status === "failed"
                ? "failed"
                : step.status === "waiting"
                  ? "awaiting"
                  : "not_started",
        requirements: ((step as any).agents ?? []).map((a: string) => ({
          label: `${a} complete`,
          met: step.status === "completed",
        })),
        action: (step as any).action ?? null,
        details: (step as any).details ?? null,
        richContent: (step as any).richContent ?? null,
        // S3: expose per-step metadata so the UI can render step-card chrome
        // (agent name, handoff output link) without a second round trip.
        agent: runAgent(step),
        hasOutput: Boolean((step as any).output) || step.status === "completed",
      }));

      // Build activity entries from step details and richContent
      const activity: Array<Record<string, unknown>> = [];
      let actIdx = 0;
      for (const step of ((run as any).steps ?? []) as any[]) {
        if (step.details) {
          activity.push({
            id: `activity-${actIdx++}`,
            timestamp:
              step.completedAt ?? step.startedAt ?? run.startedAt ?? new Date().toISOString(),
            agent: step.agents?.[0] ?? "system",
            action: step.details,
            type: step.id?.includes("qa")
              ? "qa"
              : step.id?.includes("gate") || step.id?.includes("build")
                ? "gate"
                : "info",
          });
        }
        // Add scan entries from richContent
        const rc = step.richContent;
        if (rc?.scanEntries) {
          for (const entry of rc.scanEntries) {
            activity.push({
              id: `activity-${actIdx++}`,
              timestamp: entry.timestamp,
              agent: "pmo",
              action: `[${entry.status}] ${entry.detail}`,
              type: "info",
            });
          }
        }
        // Add handoff entries
        if (rc?.handoffs) {
          for (const h of rc.handoffs) {
            activity.push({
              id: `activity-${actIdx++}`,
              timestamp:
                step.completedAt ?? step.startedAt ?? run.startedAt ?? new Date().toISOString(),
              agent: h.from ?? "system",
              action: `Handoff to ${h.to}: ${h.detail ?? h.file}`,
              type: "handoff",
              handoffData: h.content ?? { from: h.from, to: h.to, file: h.file },
            });
          }
        }
        // Add gate check results
        if (rc?.gateResults) {
          for (const r of rc.gateResults) {
            activity.push({
              id: `activity-${actIdx++}`,
              timestamp:
                step.completedAt ?? step.startedAt ?? run.startedAt ?? new Date().toISOString(),
              agent: step.agents?.[0] ?? "system",
              action: r,
              type: step.id?.includes("qa") ? "qa" : "gate",
              ...(rc.qaHealth != null ? { qaScore: rc.qaHealth } : {}),
            });
          }
        }
      }

      const statusMap: Record<string, string> = {
        running: "in_progress",
        waiting: "paused",
        paused: "paused",
        completed: "completed",
        failed: "failed",
        cancelled: "cancelled",
      };

      sprints.push({
        id: `${(flow as any).id}-${run.id}`,
        flowId: (flow as any).id,
        runId: run.id,
        name: run.name ?? (flow as any).name,
        status: statusMap[run.status] ?? "planned",
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        gates,
        agents: (run.stats?.agentsUsed ?? []).map((a: string) => ({
          name: a,
          color: "",
          status: "idle",
        })),
        activity,
      });
    }
  }

  return sprints;
}

export function sprintRoutes(deps: {
  workflowManager: WorkflowManager;
  workflowExecutor: WorkflowExecutor;
  pipelineRegistry: PipelineRegistry;
  wss: WebSocketServer;
}): Router {
  const router = Router();
  const { workflowManager, workflowExecutor, wss } = deps;

  // --- /api/sprint/* (file-based sprint data) ---
  router.get("/current", async (_req, res) => {
    try {
      const content = await readCurrentSprint();
      res.json({ content });
    } catch {
      res.json({ content: null });
    }
  });

  router.get("/queue", async (_req, res) => {
    try {
      const content = await readReadyQueue();
      res.json({ content });
    } catch {
      res.json({ content: null });
    }
  });

  router.get("/scans", async (_req, res) => {
    try {
      const entries = await readScanLog();
      res.json(entries);
    } catch {
      res.json([]);
    }
  });

  router.get("/history", async (_req, res) => {
    try {
      const entries = await readSprintHistory();
      res.json(entries);
    } catch {
      res.json([]);
    }
  });

  router.get("/handoffs", async (_req, res) => {
    try {
      const handoffs = await readHandoffs();
      res.json(handoffs);
    } catch {
      res.json([]);
    }
  });

  return router;
}

/**
 * Routes for /api/sprints (workflow-backed sprint lifecycle).
 */
export function sprintsRoutes(deps: {
  workflowManager: WorkflowManager;
  workflowExecutor: WorkflowExecutor;
  pipelineRegistry: PipelineRegistry;
  wss: WebSocketServer;
}): Router {
  const router = Router();
  const { workflowManager, workflowExecutor, wss } = deps;

  // List sprints (maps workflow runs to Sprint objects)
  router.get("/", async (_req, res) => {
    try {
      const flows = await workflowManager.getFlows();
      res.json(flowsToSprints(flows));
    } catch {
      res.json([]);
    }
  });

  // Create sprint
  router.post("/create", async (req, res) => {
    try {
      const { name, goal, agents, cwd, pipeline, budgetCapUsd, stepBudgetCapUsd } = req.body as {
        name?: string;
        goal?: string;
        agents?: string[];
        cwd?: string;
        pipeline?: Array<{
          id: string;
          agent: string;
          name: string;
          description: string;
          /** Optional per-step runtime override (e.g. "noop" for test fixtures). */
          runtime?: "cli" | "sdk" | "pty" | "noop";
          /** Optional per-step gate mode (S2). Defaults to "auto". */
          gate?: "auto" | "approve-before-start" | "approve-before-finish";
        }>;
        budgetCapUsd?: number;
        stepBudgetCapUsd?: number;
      };
      if (!name || !agents || agents.length === 0) {
        res.status(400).json({ error: "Missing required fields: name, agents" });
        return;
      }

      const sprintId = `sprint-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const gates = (
        pipeline ??
        agents.map((a, i) => ({
          id: `gate-${i}`,
          agent: a,
          name: `${a.charAt(0).toUpperCase() + a.slice(1)} Phase`,
          description: `Agent ${a} works on the sprint goal`,
        }))
      ).map((step, i) => ({
        id: step.id ?? `gate-${i}`,
        name: step.name,
        // On CREATE the sprint is PLANNED — no step has started yet. The
        // executor advances statuses when resume/start is called.
        status: "not_started" as const,
        requirements: [] as Array<{ label: string; met: boolean }>,
        details: step.description ?? null,
        action: null,
        richContent: null,
      }));

      // Build the pipeline definition once — stored on disk so resume can
      // reconstruct the exact run without re-deriving from request body.
      const pipelineSteps: import("../workflows/definition.js").PipelineStepDef[] = (
        pipeline ??
        agents.map((a, i) => ({
          id: `step-${i}`,
          agent: a,
          name: `${a.charAt(0).toUpperCase() + a.slice(1)} Phase`,
          description: `Agent ${a} works on the sprint goal`,
        }))
      ).map((step) => {
        const isGate =
          step.name?.toLowerCase().includes("gate") ||
          step.name?.toLowerCase().includes("approval");
        if (isGate) {
          return {
            id: step.id,
            name: step.name,
            type: "gate" as const,
            allowFeedback: true,
          };
        }
        const runtime = (step as unknown as { runtime?: "cli" | "sdk" | "pty" | "noop" }).runtime;
        const gate = (
          step as unknown as {
            gate?: "auto" | "approve-before-start" | "approve-before-finish";
          }
        ).gate;
        return {
          id: step.id,
          name: step.name,
          type: "agent" as const,
          agent: step.agent,
          goal: step.description || goal || `Work on ${name}`,
          ...(runtime ? { runtime } : {}),
          ...(gate && gate !== "auto" ? { gate } : {}),
        };
      });

      const workflowDef: import("../workflows/definition.js").WorkflowPipelineDef = {
        id: sprintId,
        name,
        mode: "execute",
        trigger: { type: "manual" },
        workingDirectory: cwd || process.cwd(),
        steps: pipelineSteps,
        ...(budgetCapUsd != null && budgetCapUsd > 0 ? { budgetCapUsd } : {}),
        ...(stepBudgetCapUsd != null && stepBudgetCapUsd > 0 ? { stepBudgetCapUsd } : {}),
      };

      // Create the sprint as a workflow flow — status planned until resume.
      const flow = {
        id: sprintId,
        name,
        status: "planned" as const,
        createdAt: new Date().toISOString(),
        runs: [
          {
            id: `run-${Date.now()}`,
            flowId: sprintId,
            name: `${name} Run`,
            startedAt: new Date().toISOString(),
            status: "planned" as const,
            steps: gates.map((g) => ({
              id: g.id,
              name: g.name,
              status: g.status,
              agentId: null,
            })),
            stats: { agentsUsed: agents },
          },
        ],
        // Embed the pipeline so resume can reconstruct the executor run
        // without re-POSTing parameters. Invisible to the UI mapper.
        pipelineDef: workflowDef,
      };

      // Persist sprint to disk
      const dir = sprintsDir();
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(path.join(dir, `${sprintId}.json`), JSON.stringify(flow, null, 2), "utf-8");

      // Reload registry so it picks up the persisted sprint file
      workflowManager.reload();
      const flows = await workflowManager.getFlows();

      // Broadcast initial planned state. NO executor launch here — that
      // happens when the client POSTs /:sprintId/resume.
      broadcast(wss, {
        type: "workflow-update",
        payload: flowsToSprints(flows),
      } satisfies WsMessage);

      res.status(201).json({
        ok: true,
        sprintId,
        name,
        status: "planned",
        gates: gates.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // Gate approval
  router.post("/:sprintId/gates/:gateId/approve", async (req, res) => {
    try {
      const { sprintId: rawSprintId, gateId } = req.params as {
        sprintId: string;
        gateId: string;
      };
      const sprintId = stripRunSuffix(rawSprintId);

      // First, try to resume a per-step gate in the executor. This covers
      // agent steps configured with `gate: "approve-before-start"` or
      // `"approve-before-finish"` (S2). If no pending gate exists, fall
      // through to the legacy file-based approval below.
      const runId = readSprintRunId(sprintId);
      if (runId && workflowExecutor.approveStepGate(runId, gateId)) {
        // Broadcast a workflow update so the UI reflects the unpaused step.
        try {
          const flows = await workflowManager.getFlows();
          broadcast(wss, {
            type: "workflow-update",
            payload: flowsToSprints(flows),
          } satisfies WsMessage);
        } catch {
          /* best-effort */
        }
        res.json({ ok: true, sprintId, gateId, action: "step-gate-approved" });
        return;
      }

      const { readFile, writeFile } = await import("node:fs/promises");
      const statePath = getAgentSystemPath("sprints/state.json");
      const currentPath = getAgentSystemPath("sprints/current.md");

      // Update state.json gate status
      if (statePath) {
        try {
          const raw = await readFile(statePath, "utf-8");
          const state = JSON.parse(raw);
          if (state.gates && state.gates[gateId] !== undefined) {
            const cur = state.gates[gateId];
            state.gates[gateId] =
              cur === "not_started"
                ? "in_progress"
                : cur === "in_progress"
                  ? "passed"
                  : "in_progress";
            await writeFile(statePath, JSON.stringify(state, null, 2) + "\n", "utf-8");
          }
        } catch {
          /* state.json may not exist yet */
        }
      }

      // For user-approval gate, also update sprint status in current.md
      if (gateId === "user-approval" && currentPath) {
        try {
          let md = await readFile(currentPath, "utf-8");
          md = md.replace(/Status:\s*\*\*[^*]+\*\*/, "Status: **RUNNING**");
          await writeFile(currentPath, md, "utf-8");
        } catch {
          /* current.md may not exist */
        }
      }

      // Broadcast workflow update
      const flows = await workflowManager.getFlows();
      broadcast(wss, {
        type: "workflow-update",
        payload: flowsToSprints(flows),
      } satisfies WsMessage);

      res.json({ ok: true, gateId });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // Pause sprint
  router.post("/:sprintId/pause", async (req, res) => {
    try {
      const { sprintId: rawSprintId } = req.params as { sprintId: string };
      const sprintId = stripRunSuffix(rawSprintId);

      // H1: Halt the executor for this sprint's run BEFORE updating any
      // legacy state. `pauseRun` flips the run's `paused` flag and clears
      // any pending step-gate waiters so an awaiting step bails instead
      // of running. M2: then mirror the executor's run state into the
      // persisted sprint JSON so `GET /api/sprints` reflects `paused` on
      // page refresh.
      const runId = readSprintRunId(sprintId);
      if (runId) {
        workflowExecutor.pauseRun(runId);
        const runState = loadRunState(sprintId, runId);
        if (runState) {
          // Mark paused before sync so the persisted file is correct
          // even if the executor loop hasn't yet observed the flag.
          runState.status = "paused";
          saveRunState(runState);
          syncSprintFileFromRun(sprintId, runState);
        }
        workflowManager.reload();
      }

      const { readFile, writeFile } = await import("node:fs/promises");
      const statePath = getAgentSystemPath("sprints/state.json");
      const currentPath = getAgentSystemPath("sprints/current.md");

      if (statePath) {
        try {
          const raw = await readFile(statePath, "utf-8");
          const state = JSON.parse(raw);
          if (state.status === "running" || state.status === "RUNNING") {
            state.status = "PAUSED";
            await writeFile(statePath, JSON.stringify(state, null, 2) + "\n", "utf-8");
          }
        } catch {
          /* state.json may not exist */
        }
      }
      if (currentPath) {
        try {
          let md = await readFile(currentPath, "utf-8");
          md = md.replace(/Status:\s*\*\*[^*]+\*\*/, "Status: **PAUSED**");
          await writeFile(currentPath, md, "utf-8");
        } catch {
          /* current.md may not exist */
        }
      }

      const flows = await workflowManager.getFlows();
      broadcast(wss, {
        type: "workflow-update",
        payload: flowsToSprints(flows),
      } satisfies WsMessage);
      res.json({ ok: true, sprintId, action: "paused" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // Resume sprint.
  //
  // Two semantics sharing the same route:
  //   1. planned → in_progress:   first-run START (launches the executor
  //                               against the pipelineDef persisted on
  //                               create). This is the path the S1 verify
  //                               exercises.
  //   2. paused  → in_progress:   legacy file-based resume for the
  //                               ai-agents sprint state.json view.
  router.post("/:sprintId/resume", async (req, res) => {
    try {
      const { sprintId: rawSprintId } = req.params as { sprintId: string };
      const sprintId = stripRunSuffix(rawSprintId);

      // Path 1: START a planned workflow-backed sprint via the executor.
      const persistedStatus = readPersistedSprintStatus(sprintId);
      if (persistedStatus === "planned") {
        const def = readPersistedPipelineDef(sprintId);
        if (!def) {
          res.status(400).json({
            error: `Sprint '${sprintId}' is planned but has no pipelineDef — cannot start.`,
          });
          return;
        }

        // Launch the executor. startRun creates run-state; executeRun runs
        // in the background so the HTTP response does not block.
        try {
          const runState = workflowExecutor.startRun(def);
          markSprintRunning(sprintId, runState.runId);
          workflowManager.reload();

          // Broadcast the transition immediately so the UI reflects
          // planned → running before the first step completes.
          broadcast(wss, {
            type: "workflow-update",
            payload: flowsToSprints(await workflowManager.getFlows()),
          } satisfies WsMessage);

          workflowExecutor.executeRun(def, runState).catch((err) => {
            console.error(`Sprint ${sprintId} execution failed:`, err);
          });

          res.json({ ok: true, sprintId, action: "started", runId: runState.runId });
          return;
        } catch (execErr) {
          const message = execErr instanceof Error ? execErr.message : "Unknown error";
          res.status(500).json({ error: `Failed to start sprint: ${message}` });
          return;
        }
      }

      // Path 1b: paused → in_progress (server-restart resume). The sprint
      // flow JSON carries `pauseReason: "server-restarted"` if the current
      // process was brought up after an interrupted run (see
      // `reconcileInterruptedSprints` on boot). Re-hydrate the existing
      // RunState from disk, reconcile step statuses against the handoffs
      // folder, then call `executeRun` to resume from the first incomplete
      // step. The executor's loop already skips `completed`/`skipped`
      // steps, so the same pipelineDef drives us back to the right point.
      if (persistedStatus === "paused") {
        const def = readPersistedPipelineDef(sprintId);
        const existingRunId = readSprintRunId(sprintId);
        if (!def || !existingRunId) {
          res.status(400).json({
            error: `Sprint '${sprintId}' is paused but is missing pipelineDef or runId — cannot resume.`,
          });
          return;
        }
        const existingRun = loadRunState(sprintId, existingRunId);
        if (!existingRun) {
          res.status(400).json({
            error: `Sprint '${sprintId}' has no persisted RunState at runId=${existingRunId} — cannot resume.`,
          });
          return;
        }

        try {
          // Reconcile from handoffs: steps with output files → completed,
          // interrupted/running → pending for re-dispatch. SDK steps will
          // re-attach via options.resume (sdk-session.ts); PTY steps will
          // relaunch from their existing input handoff file.
          reconcileRunStateFromHandoffs(existingRun);
          existingRun.status = "running";
          existingRun.currentStep = null;
          saveRunState(existingRun);

          markSprintRunning(sprintId, existingRun.runId);
          workflowManager.reload();

          broadcast(wss, {
            type: "workflow-update",
            payload: flowsToSprints(await workflowManager.getFlows()),
          } satisfies WsMessage);

          workflowExecutor.executeRun(def, existingRun).catch((err) => {
            console.error(`Sprint ${sprintId} resume execution failed:`, err);
          });

          res.json({ ok: true, sprintId, action: "resumed", runId: existingRun.runId });
          return;
        } catch (execErr) {
          const message = execErr instanceof Error ? execErr.message : "Unknown error";
          res.status(500).json({ error: `Failed to resume sprint: ${message}` });
          return;
        }
      }

      // Path 2: legacy paused-sprint state.json resume.
      const { readFile, writeFile } = await import("node:fs/promises");
      const statePath = getAgentSystemPath("sprints/state.json");
      const currentPath = getAgentSystemPath("sprints/current.md");

      if (statePath) {
        try {
          const raw = await readFile(statePath, "utf-8");
          const state = JSON.parse(raw);
          if (state.status === "PAUSED" || state.status === "paused") {
            state.status = "RUNNING";
            await writeFile(statePath, JSON.stringify(state, null, 2) + "\n", "utf-8");
          }
        } catch {
          /* state.json may not exist */
        }
      }
      if (currentPath) {
        try {
          let md = await readFile(currentPath, "utf-8");
          md = md.replace(/Status:\s*\*\*[^*]+\*\*/, "Status: **RUNNING**");
          await writeFile(currentPath, md, "utf-8");
        } catch {
          /* current.md may not exist */
        }
      }

      const flows = await workflowManager.getFlows();
      broadcast(wss, {
        type: "workflow-update",
        payload: flowsToSprints(flows),
      } satisfies WsMessage);
      res.json({ ok: true, sprintId, action: "resumed" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // Return the raw persisted sprint JSON so the UI can prefill an edit
  // dialog with the full pipelineDef / agents / goal (data the
  // flowsToSprints UI shape omits).
  router.get("/:sprintId", async (req, res) => {
    try {
      const { sprintId: rawSprintId } = req.params as { sprintId: string };
      const sprintId = stripRunSuffix(rawSprintId);
      const file = path.join(sprintsDir(), `${sprintId}.json`);
      if (!fs.existsSync(file)) {
        res.status(404).json({ error: `Sprint '${sprintId}' not found` });
        return;
      }
      const raw = fs.readFileSync(file, "utf-8");
      try {
        res.json(JSON.parse(raw));
      } catch {
        res.json({ raw });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // Edit sprint metadata (title / goal / agents / pipelineDef).
  //
  // Only editable while the sprint is NOT `in_progress` / `running`. Returns
  // 409 otherwise. Fields are whitelisted — unknown fields are ignored, and
  // immutable fields (`id`, `runId`, `status`, `createdAt`) cannot be changed.
  router.put("/:sprintId", async (req, res) => {
    try {
      const { sprintId: rawSprintId } = req.params as { sprintId: string };
      const sprintId = stripRunSuffix(rawSprintId);

      const file = path.join(sprintsDir(), `${sprintId}.json`);
      if (!fs.existsSync(file)) {
        res.status(404).json({ error: `Sprint '${sprintId}' not found` });
        return;
      }

      const status = readPersistedSprintStatus(sprintId);
      // Block edits on active sprints. The UI route maps "running" →
      // "in_progress" for display; the persisted status can be either form
      // depending on when the file was last written, so guard against both.
      if (status === "in_progress" || status === "running") {
        res.status(409).json({
          error: "Cannot edit sprint while in_progress",
          status,
        });
        return;
      }

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(fs.readFileSync(file, "utf-8"));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        res.status(500).json({ error: `Failed to read sprint file: ${message}` });
        return;
      }

      const body = (req.body ?? {}) as {
        title?: unknown;
        agents?: unknown;
        pipelineDef?: unknown;
      };

      // Whitelist + type-check. Ignore everything else (including id/runId).
      // M3: `goal` was previously written into `data.goal`, but the actual
      // goal lives on each agent step (`pipelineDef.steps[i].goal`) — the
      // top-level field was never read. The edit dialog already lets users
      // change per-step goals via `body.pipelineDef`, so we drop the dead
      // branch entirely instead of fanning a sprint-level value out.
      if (typeof body.title === "string" && body.title.trim().length > 0) {
        const newName = body.title.trim();
        data.name = newName;
        const runs = Array.isArray(data.runs) ? (data.runs as Array<Record<string, unknown>>) : [];
        if (runs[0]) {
          runs[0].name = `${newName} Run`;
        }
        const pDef = data.pipelineDef as Record<string, unknown> | undefined;
        if (pDef && typeof pDef === "object") {
          pDef.name = newName;
        }
      }

      if (Array.isArray(body.agents) && body.agents.every((a) => typeof a === "string")) {
        const runs = Array.isArray(data.runs) ? (data.runs as Array<Record<string, unknown>>) : [];
        if (runs[0]) {
          const stats = (runs[0].stats as Record<string, unknown> | undefined) ?? {};
          stats.agentsUsed = body.agents;
          runs[0].stats = stats;
        }
      }

      if (body.pipelineDef && typeof body.pipelineDef === "object") {
        const incoming = body.pipelineDef as Record<string, unknown>;
        const existing = (data.pipelineDef as Record<string, unknown> | undefined) ?? {};
        // Preserve id — pipelineDef.id === sprintId and must not change.
        const merged: Record<string, unknown> = {
          ...existing,
          ...incoming,
          id: existing.id ?? sprintId,
        };
        data.pipelineDef = merged;
      }

      try {
        const tmp = file + ".tmp";
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
        fs.renameSync(tmp, file);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        res.status(500).json({ error: `Failed to write sprint file: ${message}` });
        return;
      }

      // Reload + broadcast so connected clients see the change without a
      // manual refresh.
      workflowManager.reload();
      try {
        const flows = await workflowManager.getFlows();
        broadcast(wss, {
          type: "workflow-update",
          payload: flowsToSprints(flows),
        } satisfies WsMessage);
      } catch {
        /* best-effort */
      }

      res.json({ ok: true, sprintId, updated: data });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // Cancel sprint
  router.post("/:sprintId/cancel", async (req, res) => {
    try {
      const { sprintId: rawSprintId } = req.params as { sprintId: string };
      const sprintId = stripRunSuffix(rawSprintId);

      // H1: Abort the executor for this sprint's run BEFORE writing any
      // legacy state. `cancelRun` triggers the run's AbortController and
      // clears pending step-gate waiters so the executor doesn't burn
      // tokens after the operator asked to cancel. M2: then mirror the
      // run state into the persisted sprint JSON.
      const runId = readSprintRunId(sprintId);
      if (runId) {
        workflowExecutor.cancelRun(runId);
        const runState = loadRunState(sprintId, runId);
        if (runState) {
          runState.status = "cancelled";
          runState.completedAt = runState.completedAt ?? new Date().toISOString();
          saveRunState(runState);
          syncSprintFileFromRun(sprintId, runState);
        }
        workflowManager.reload();
      }

      const { readFile, writeFile } = await import("node:fs/promises");
      const statePath = getAgentSystemPath("sprints/state.json");
      const currentPath = getAgentSystemPath("sprints/current.md");

      if (statePath) {
        try {
          const raw = await readFile(statePath, "utf-8");
          const state = JSON.parse(raw);
          state.status = "CANCELLED";
          state.cancelledAt = new Date().toISOString();
          await writeFile(statePath, JSON.stringify(state, null, 2) + "\n", "utf-8");
        } catch {
          /* state.json may not exist */
        }
      }
      if (currentPath) {
        try {
          let md = await readFile(currentPath, "utf-8");
          md = md.replace(/Status:\s*\*\*[^*]+\*\*/, "Status: **CANCELLED**");
          await writeFile(currentPath, md, "utf-8");
        } catch {
          /* current.md may not exist */
        }
      }

      const flows = await workflowManager.getFlows();
      broadcast(wss, {
        type: "workflow-update",
        payload: flowsToSprints(flows),
      } satisfies WsMessage);
      res.json({ ok: true, sprintId, action: "cancelled" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // Sprint spec
  router.get("/:sprintId/spec", async (req, res) => {
    try {
      const { sprintId } = req.params as { sprintId: string };
      const { readFile, readdir } = await import("node:fs/promises");
      const { join } = await import("node:path");

      // Try current.md first
      const currentPath = getAgentSystemPath("sprints/current.md");
      if (currentPath) {
        try {
          const content = await readFile(currentPath, "utf-8");
          res.json({ content, source: "current.md" });
          return;
        } catch {
          /* not found, try archive */
        }
      }

      // Try archive
      const archiveDir = getAgentSystemPath("sprints/archive");
      if (archiveDir) {
        try {
          const files = await readdir(archiveDir);
          const mdFiles = files
            .filter((f: string) => f.endsWith(".md"))
            .sort()
            .reverse();
          if (mdFiles.length > 0) {
            const content = await readFile(join(archiveDir, mdFiles[0]!), "utf-8");
            res.json({ content, source: mdFiles[0] });
            return;
          }
        } catch {
          /* no archive */
        }
      }

      res.json({ content: null, source: null });
    } catch {
      res.json({ content: null, source: null });
    }
  });

  // S3: read a step's handoff output JSON for inline rendering in the step card.
  // Resolves `<agent-system-base>/sprints/handoffs/<stepId>_output.json` (falls
  // back to `<cwd>/.agent-studio/sprints/handoffs/...` mirroring the executor's
  // `resolveHandoffsDir`). Returns 404 if the file is absent so the UI can hide
  // the panel without a console error.
  router.get("/:sprintId/steps/:stepId/output", async (req, res) => {
    try {
      const { stepId } = req.params as { sprintId: string; stepId: string };
      const base = getAgentSystemBase();
      const handoffsDir = base
        ? path.join(base, "sprints", "handoffs")
        : path.join(process.cwd(), ".agent-studio", "sprints", "handoffs");
      const file = path.join(handoffsDir, `${stepId}_output.json`);
      if (!fs.existsSync(file)) {
        res.status(404).json({ error: "Output not available" });
        return;
      }
      const raw = fs.readFileSync(file, "utf-8");
      try {
        res.json(JSON.parse(raw));
      } catch {
        res.json({ raw });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  return router;
}
