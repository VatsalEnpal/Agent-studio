/**
 * API routes for the workflow engine.
 *
 * Provides CRUD for workflow definitions, run management,
 * gate approval/rejection, scheduling, and status queries.
 *
 * @module server/routes/workflows
 */

import { Router } from "express";
import type { WebSocketServer } from "ws";
import { PipelineRegistry } from "../workflows/workflow-registry.js";
import { WorkflowExecutor } from "../workflows/executor.js";
import { WorkflowScheduler } from "../workflows/scheduler.js";
import { MockCommandRunner, ClaudeCommandRunner } from "../workflows/command-runner.js";
import { loadRunState, listRuns, getActiveRuns, deleteRun } from "../workflows/run-state.js";
import type { WorkflowPipelineDef } from "../workflows/definition.js";
import type { WsMessage } from "../shared/types.js";

interface WorkflowRouteDeps {
  registry: PipelineRegistry;
  executor: WorkflowExecutor;
  scheduler: WorkflowScheduler;
  wss: WebSocketServer;
}

function broadcast(wss: WebSocketServer, msg: WsMessage): void {
  const data = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(data);
    }
  }
}

export function workflowRoutes(deps: WorkflowRouteDeps): Router {
  const router = Router();
  const { registry, executor, scheduler, wss } = deps;

  // Wire executor events to WebSocket broadcast
  executor.onEvent((event) => {
    const typeMap: Record<string, WsMessage["type"]> = {
      "step-started": "workflow-step-update",
      "step-completed": "workflow-step-update",
      "step-failed": "workflow-step-update",
      "gate-waiting": "workflow-gate-waiting",
      "run-completed": "workflow-run-complete",
      "run-failed": "workflow-run-failed",
      "run-paused": "workflow-step-update",
    };
    const wsType = typeMap[event.type];
    if (wsType) {
      broadcast(wss, { type: wsType, payload: event } satisfies WsMessage);
    }
  });

  // ---------- Workflow CRUD ----------

  /** GET /api/workflows — list all workflow definitions */
  router.get("/", (_req, res) => {
    const workflows = registry.listWorkflows();
    const withSchedules = workflows.map((wf) => ({
      ...wf,
      schedule: scheduler.getSchedule(wf.id),
      activeRuns: getActiveRuns().filter((r) => r.workflowId === wf.id).length,
    }));
    res.json(withSchedules);
  });

  /** POST /api/workflows — create a new workflow */
  router.post("/", (req, res) => {
    const def = req.body as WorkflowPipelineDef;
    if (!def || !def.id) {
      res.status(400).json({ error: "Missing workflow definition with id" });
      return;
    }

    const result = registry.saveWorkflow(def);
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json({ id: def.id, status: "created" });
  });

  /** GET /api/workflows/:id — get a single workflow */
  router.get("/:id", (req, res) => {
    const wf = registry.getWorkflow(req.params.id);
    if (!wf) {
      res.status(404).json({ error: "Workflow not found" });
      return;
    }
    res.json(wf);
  });

  /** PUT /api/workflows/:id — update a workflow */
  router.put("/:id", (req, res) => {
    const result = registry.updateWorkflow(req.params.id, req.body);
    if (result.error) {
      const status = result.error.includes("not found")
        ? 404
        : result.error.includes("active")
          ? 409
          : 400;
      res.status(status).json({ error: result.error });
      return;
    }
    res.json({ id: req.params.id, status: "updated" });
  });

  /** DELETE /api/workflows/:id — delete a workflow */
  router.delete("/:id", (req, res) => {
    const result = registry.deleteWorkflow(req.params.id);
    if (result.error) {
      const status = result.error.includes("not found")
        ? 404
        : result.error.includes("active")
          ? 409
          : 400;
      res.status(status).json({ error: result.error });
      return;
    }
    res.json({ id: req.params.id, status: "deleted" });
  });

  // ---------- Run Management ----------

  /** POST /api/workflows/:id/run — start a new run */
  router.post("/:id/run", async (req, res) => {
    const wf = registry.getWorkflow(req.params.id);
    if (!wf) {
      res.status(404).json({ error: "Workflow not found" });
      return;
    }

    const runState = executor.startRun(wf);
    res.status(201).json({ runId: runState.runId, status: "started" });

    // Execute asynchronously (don't block the response)
    executor.executeRun(wf, runState).catch(() => {
      // errors are tracked in run state
    });
  });

  /** GET /api/workflows/:id/runs — list runs for a workflow */
  router.get("/:id/runs", (req, res) => {
    const runs = listRuns(req.params.id);
    res.json(runs);
  });

  /** GET /api/workflows/:id/runs/:runId — get run details */
  router.get("/:id/runs/:runId", (req, res) => {
    const state = loadRunState(req.params.id, req.params.runId);
    if (!state) {
      res.status(404).json({ error: "Run not found" });
      return;
    }
    res.json(state);
  });

  // ---------- Gate Actions ----------

  /** POST /api/workflows/:id/runs/:runId/approve/:stepId */
  router.post("/:id/runs/:runId/approve/:stepId", async (req, res) => {
    const state = loadRunState(req.params.id, req.params.runId);
    if (!state) {
      res.status(404).json({ error: "Run not found" });
      return;
    }

    const wf = registry.getWorkflow(req.params.id);
    if (!wf) {
      res.status(404).json({ error: "Workflow not found" });
      return;
    }

    const result = await executor.approveGate(state, req.params.stepId, wf);
    res.json({ status: result.status, stepId: req.params.stepId });
  });

  /** POST /api/workflows/:id/runs/:runId/reject/:stepId */
  router.post("/:id/runs/:runId/reject/:stepId", async (req, res) => {
    const state = loadRunState(req.params.id, req.params.runId);
    if (!state) {
      res.status(404).json({ error: "Run not found" });
      return;
    }

    const wf = registry.getWorkflow(req.params.id);
    if (!wf) {
      res.status(404).json({ error: "Workflow not found" });
      return;
    }

    const { feedback } = req.body ?? {};
    const result = await executor.rejectGate(state, req.params.stepId, wf, feedback);
    res.json({ status: result.status, stepId: req.params.stepId });
  });

  // ---------- Run Control ----------

  /** POST /api/workflows/:id/runs/:runId/pause */
  router.post("/:id/runs/:runId/pause", (req, res) => {
    executor.pauseRun(req.params.runId);
    res.json({ status: "pausing", runId: req.params.runId });
  });

  /** POST /api/workflows/:id/runs/:runId/resume */
  router.post("/:id/runs/:runId/resume", async (req, res) => {
    const state = loadRunState(req.params.id, req.params.runId);
    if (!state) {
      res.status(404).json({ error: "Run not found" });
      return;
    }

    const wf = registry.getWorkflow(req.params.id);
    if (!wf) {
      res.status(404).json({ error: "Workflow not found" });
      return;
    }

    state.status = "running";
    res.json({ status: "resuming", runId: req.params.runId });

    executor.executeRun(wf, state).catch(() => {});
  });

  /** POST /api/workflows/:id/runs/:runId/cancel */
  router.post("/:id/runs/:runId/cancel", (req, res) => {
    executor.cancelRun(req.params.runId);
    res.json({ status: "cancelling", runId: req.params.runId });
  });

  /** POST /api/workflows/:id/runs/:runId/retry/:stepId */
  router.post("/:id/runs/:runId/retry/:stepId", async (req, res) => {
    const state = loadRunState(req.params.id, req.params.runId);
    if (!state) {
      res.status(404).json({ error: "Run not found" });
      return;
    }

    const wf = registry.getWorkflow(req.params.id);
    if (!wf) {
      res.status(404).json({ error: "Workflow not found" });
      return;
    }

    // Reset the failed step and resume
    const stepState = state.steps[req.params.stepId];
    if (stepState) {
      stepState.status = "pending";
      stepState.error = undefined;
    }
    state.status = "running";

    res.json({ status: "retrying", stepId: req.params.stepId });
    executor.executeRun(wf, state).catch(() => {});
  });

  // ---------- Schedule Management ----------

  /** POST /api/workflows/:id/schedule */
  router.post("/:id/schedule", (req, res) => {
    const wf = registry.getWorkflow(req.params.id);
    if (!wf) {
      res.status(404).json({ error: "Workflow not found" });
      return;
    }

    const trigger = req.body;
    if (!trigger || trigger.type !== "scheduled" || !trigger.interval) {
      res
        .status(400)
        .json({ error: "Invalid schedule trigger. Need { type: 'scheduled', interval: '...' }" });
      return;
    }

    const result = scheduler.schedule(req.params.id, trigger);
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({ status: "scheduled", workflowId: req.params.id });
  });

  /** DELETE /api/workflows/:id/schedule */
  router.delete("/:id/schedule", (req, res) => {
    scheduler.unschedule(req.params.id);
    res.json({ status: "unscheduled", workflowId: req.params.id });
  });

  return router;
}
