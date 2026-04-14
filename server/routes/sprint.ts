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
import { getAgentSystemPath } from "../config.js";
import type { WorkflowManager } from "../workflows/index.js";
import type { WorkflowExecutor } from "../workflows/executor.js";
import type { PipelineRegistry } from "../workflows/workflow-registry.js";
import type { WsMessage } from "../shared/types.js";
import { broadcast } from "../ws/broadcast.js";

/** Map raw WorkflowFlow[] into Sprint[] for the frontend. */
export function flowsToSprints(
  flows: Awaited<ReturnType<WorkflowManager["getFlows"]>>,
): Array<Record<string, unknown>> {
  const sprints: Array<Record<string, unknown>> = [];

  for (const flow of flows) {
    for (const run of (flow as any).runs ?? []) {
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
                  ? "in_progress"
                  : "not_started",
        requirements: ((step as any).agents ?? []).map((a: string) => ({
          label: `${a} complete`,
          met: step.status === "completed",
        })),
        action: (step as any).action ?? null,
        details: (step as any).details ?? null,
        richContent: (step as any).richContent ?? null,
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
        pipeline?: Array<{ id: string; agent: string; name: string; description: string }>;
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
        status: i === 0 ? ("in_progress" as const) : ("not_started" as const),
        requirements: [] as Array<{ label: string; met: boolean }>,
        details: step.description ?? null,
        action: null,
        richContent: null,
      }));

      // Create the sprint as a workflow flow
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
      };

      // Persist sprint to disk
      const sprintsDir = path.join(process.cwd(), ".agent-studio", "sprints");
      if (!fs.existsSync(sprintsDir)) {
        fs.mkdirSync(sprintsDir, { recursive: true });
      }
      fs.writeFileSync(
        path.join(sprintsDir, `${sprintId}.json`),
        JSON.stringify(flow, null, 2),
        "utf-8",
      );

      // Reload registry so it picks up the persisted sprint file
      workflowManager.reload();
      const flows = await workflowManager.getFlows();

      // Broadcast initial planned state
      broadcast(wss, {
        type: "workflow-update",
        payload: flowsToSprints(flows),
      } satisfies WsMessage);

      // Build a WorkflowPipelineDef and start execution
      const pipelineSteps: import("../workflows/definition.js").PipelineStepDef[] = (
        pipeline ??
        agents.map((a, i) => ({
          id: `step-${i}`,
          agent: a,
          name: `${a.charAt(0).toUpperCase() + a.slice(1)} Phase`,
          description: `Agent ${a} works on the sprint goal`,
        }))
      ).map((step) => {
        // Check if it's a gate step (name contains "gate" or "approval")
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
        return {
          id: step.id,
          name: step.name,
          type: "agent" as const,
          agent: step.agent,
          goal: step.description || goal || `Work on ${name}`,
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

      // Start execution asynchronously (don't block the response)
      try {
        const runState = workflowExecutor.startRun(workflowDef);
        // Update the flow status to "running"
        flow.status = "running" as any;
        if (flow.runs[0]) {
          flow.runs[0].status = "running" as any;
        }
        // Broadcast the running state
        broadcast(wss, {
          type: "workflow-update",
          payload: flowsToSprints(await workflowManager.getFlows()),
        } satisfies WsMessage);
        // Execute in background
        workflowExecutor.executeRun(workflowDef, runState).catch((err) => {
          console.error(`Sprint ${sprintId} execution failed:`, err);
        });
      } catch (execErr) {
        console.error(`Failed to start sprint execution:`, execErr);
        // Sprint still created, just not started -- that's OK
      }

      res.status(201).json({
        ok: true,
        sprintId,
        name,
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
      const { sprintId, gateId } = req.params as { sprintId: string; gateId: string };
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
      const { sprintId } = req.params as { sprintId: string };
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

  // Resume sprint
  router.post("/:sprintId/resume", async (req, res) => {
    try {
      const { sprintId } = req.params as { sprintId: string };
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

  // Cancel sprint
  router.post("/:sprintId/cancel", async (req, res) => {
    try {
      const { sprintId } = req.params as { sprintId: string };
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

  return router;
}
