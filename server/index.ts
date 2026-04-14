import express from "express";
import { createServer } from "node:http";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";
import { TerminalManager } from "./terminal-manager.js";
import {
  getAllSessionUsage,
  getSessionUsage,
  findSessionIdForPtyPid,
  getUsageBySessionId,
  formatCost,
  formatTokens,
} from "./session-usage.js";
import { FileWatcher } from "./file-watcher.js";
import { GitWatcher } from "./git-status.js";
import { getCustomServers, startDevServer } from "./dev-servers.js";
import { isAllowedPath } from "./platform.js";
import fs from "node:fs";
import path from "node:path";
import type { WsMessage } from "./shared/types.js";
import { WorkflowManager } from "./workflows/index.js";
import { RoomManager } from "./rooms.js";
import type { RoomMessage } from "./rooms.js";
import { PipelineRegistry } from "./workflows/workflow-registry.js";
import { WorkflowExecutor } from "./workflows/executor.js";
import { WorkflowScheduler } from "./workflows/scheduler.js";
import { ClaudeCommandRunner } from "./workflows/command-runner.js";
import { getActiveRuns, saveRunState, loadRunState, listRuns } from "./workflows/run-state.js";
import { SdkSessionManager } from "./sdk-session.js";
import {
  getConfig,
  loadConfig,
  saveConfig,
  generateDefaultConfig,
  reloadConfig,
  getMainProjectDir,
  type WorkflowConfig,
} from "./config.js";
import { AutomationEngine } from "./automations.js";
import type { Automation } from "./automations.js";
import { broadcast } from "./ws/broadcast.js";

// --- Route modules ---
import { roomsRoutes } from "./routes/rooms.js";
import { workflowRoutes } from "./routes/workflows.js";
import { healthRoutes } from "./routes/health.js";
import { gitRoutes } from "./routes/git.js";
import { sessionsRoutes } from "./routes/sessions.js";
import { memoryRoutes } from "./routes/memory.js";
import { sprintRoutes, sprintsRoutes, flowsToSprints } from "./routes/sprint.js";
import { settingsRoutes } from "./routes/settings.js";
import { systemRoutes } from "./routes/system.js";
import {
  agentsRoutes,
  analyzeProjectRoute,
  generateAgentsPreviewRoute,
  generateClaudeMdRoute,
} from "./routes/agents.js";
import {
  automationsRoutes,
  automationTemplatesRoutes,
  automationSuggestionsRoute,
} from "./routes/automations.js";
const port = parseInt(process.env["PORT"] ?? "8080", 10);
const dev = process.env["NODE_ENV"] !== "production";

/**
 * Security: Validate that a project path is within allowed directories.
 * Returns the resolved path if valid, or null if invalid.
 */
function validateProjectPath(inputPath: string): string | null {
  const resolved = path.resolve(inputPath);
  if (isAllowedPath(resolved)) {
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }
  return null;
}

async function main() {
  // Auto-generate config on first run if missing
  const existingConfig = loadConfig();
  if (!existingConfig) {
    const defaultConfig = generateDefaultConfig();
    saveConfig(defaultConfig);
    // eslint-disable-next-line no-console
    console.log("Generated default config at .agent-studio.json");
  }

  const app = express();
  app.use(express.json());

  const server = createServer(app);

  const wss = new WebSocketServer({ noServer: true });
  const terminalManager = new TerminalManager();
  const gitWatcher = new GitWatcher();

  // --- Room management ---
  const roomManager = new RoomManager();
  const sdkManager = new SdkSessionManager();

  // Broadcast room events via WebSocket
  roomManager.on("message", (msg: RoomMessage) => {
    broadcast(wss, { type: "room-message", payload: msg } satisfies WsMessage);
  });

  roomManager.on("agent-status", (payload: { roomId: string; agentId: string; status: string }) => {
    broadcast(wss, { type: "room-agent-status", payload } satisfies WsMessage);
  });

  roomManager.on(
    "approval",
    (payload: { roomId: string; messageId: string; approved: boolean }) => {
      broadcast(wss, { type: "room-approval", payload } satisfies WsMessage);
    },
  );

  // Route WebSocket upgrades: /ws goes to our server,
  // everything else (e.g. /_next/webpack-hmr) is forwarded to Next.js
  let nextUpgradeHandler: ((req: any, socket: any, head: any) => void) | null = null;

  server.on("upgrade", (request, socket, head) => {
    const { pathname } = new URL(request.url!, `http://${request.headers.host}`);
    if (pathname === "/ws") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else if (nextUpgradeHandler) {
      // Forward to Next.js (Turbopack HMR, etc.)
      nextUpgradeHandler(request, socket, head);
    }
  });

  // --- WebSocket handling ---
  wss.on("connection", (ws: WebSocket) => {
    // Send current sessions on connect
    const sessionsMsg: WsMessage = {
      type: "sessions-update",
      payload: terminalManager.listSessions(),
    };
    ws.send(JSON.stringify(sessionsMsg));

    // Send current git status on connect
    const gitMsg: WsMessage = {
      type: "git-update",
      payload: gitWatcher.getStatus(),
    };
    ws.send(JSON.stringify(gitMsg));

    // Subscribe to terminal events and forward to this client
    const unsubscribe = terminalManager.onEvent((message: WsMessage) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    });

    ws.on("message", (raw: Buffer | string) => {
      try {
        const msg: WsMessage = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf-8"));

        if (msg.type === "terminal-input" && msg.sessionId && msg.data) {
          terminalManager.writeToSession(msg.sessionId, msg.data);
        } else if (msg.type === "terminal-resize" && msg.sessionId && msg.cols && msg.rows) {
          terminalManager.resizeSession(msg.sessionId, msg.cols, msg.rows);
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on("close", () => {
      unsubscribe();
    });

    ws.on("error", () => {
      // Don't let a single client error crash the server
      unsubscribe();
    });
  });

  // --- Automation Engine ---
  const automationEngine = new AutomationEngine(getMainProjectDir());

  // Load automations from config
  const initialConfig = getConfig();
  if (initialConfig.automations && Array.isArray(initialConfig.automations)) {
    automationEngine.loadAutomations(initialConfig.automations as Automation[]);
  }

  // Forward automation events to WebSocket clients
  automationEngine.onEvent((event) => {
    broadcast(wss, {
      type: event.type as WsMessage["type"],
      payload: event.payload,
    } satisfies WsMessage);
  });

  // --- Workflow engine setup ---
  const workflowManager = new WorkflowManager();
  const pipelineRegistry = new PipelineRegistry();
  const workflowExecutor = new WorkflowExecutor(new ClaudeCommandRunner());
  const workflowScheduler = new WorkflowScheduler(async (workflowId) => {
    const wf = pipelineRegistry.getWorkflow(workflowId);
    if (!wf) return false;
    const runState = workflowExecutor.startRun(wf);
    workflowExecutor.executeRun(wf, runState).catch(() => {});
    return true;
  });
  workflowScheduler.restoreSchedules();

  // --- Server restart recovery: detect interrupted runs ---
  {
    const interrupted = getActiveRuns().filter((r) => r.status === "running");
    for (const run of interrupted) {
      for (const step of Object.values(run.steps)) {
        if (step.status === "running") {
          step.status = "interrupted";
        }
      }
      run.status = "paused";
      saveRunState(run);
      console.log(
        `[workflow-engine] Run '${run.runId}' (workflow '${run.workflowId}') was interrupted by server restart. Paused at step '${run.currentStep}'.`,
      );
    }
    if (interrupted.length > 0) {
      console.log(
        `[workflow-engine] ${interrupted.length} interrupted run(s) detected. Resume via API or UI.`,
      );
    }
  }

  // --- Usage polling: broadcast usage updates every 60s ---
  setInterval(() => {
    try {
      const usage = getAllSessionUsage();

      // Also enrich managed sessions
      const sessions = terminalManager.listSessions();
      const managedUsage: Record<
        string,
        {
          cost: string;
          tokens: string;
          modelShort: string;
          totalCost: number;
          totalTokens: number;
          contextUsed: number;
          contextTotal: number;
          contextPercent: number;
        }
      > = {};
      for (const session of sessions) {
        let su = getSessionUsage(session.pid);
        if (!su) {
          const claudeSessionId = findSessionIdForPtyPid(session.pid);
          if (claudeSessionId) {
            su = getUsageBySessionId(claudeSessionId);
          }
        }
        if (su) {
          managedUsage[session.id] = {
            cost: formatCost(su.totalCost),
            tokens: formatTokens(su.totalTokens),
            modelShort: su.modelShort,
            totalCost: su.totalCost,
            totalTokens: su.totalTokens,
            contextUsed: su.contextUsed,
            contextTotal: su.contextTotal,
            contextPercent: su.contextPercent,
          };
        }
      }

      broadcast(wss, {
        type: "usage-update",
        payload: { all: usage, managed: managedUsage },
      } satisfies WsMessage);
    } catch {
      // Ignore polling errors
    }
  }, 60_000);

  // --- File watcher for sprint/memory files ---
  const fileWatcher = new FileWatcher();
  fileWatcher.onUpdate((update) => {
    broadcast(wss, {
      type: "file-update",
      data: JSON.stringify({ file: update.file, content: update.content }),
    } satisfies WsMessage);
  });
  fileWatcher.start();

  // --- Git watcher ---
  gitWatcher.onUpdate((repos) => {
    broadcast(wss, {
      type: "git-update",
      payload: repos,
    } satisfies WsMessage);
  });
  gitWatcher.start(30_000);

  // Broadcast workflow updates on sprint file changes
  fileWatcher.onUpdate(() => {
    void workflowManager.getFlows().then((flows) => {
      broadcast(wss, {
        type: "workflow-update",
        payload: flowsToSprints(flows),
      } satisfies WsMessage);
    });
  });

  // Shared deps for route modules
  const routeDeps = { validateProjectPath };

  // =====================================================================
  // Mount route modules
  // =====================================================================

  // Health (early mount so it works even before Next.js is ready)
  app.use("/api/health", healthRoutes(terminalManager, wss));

  // Sessions
  const telegramSessions = new Map<string, string>();
  const sendTelegramNotify = (_message: string) => {
    // Telegram integration hook -- no-op unless telegram plugin is active
  };
  app.use(
    "/api/sessions",
    sessionsRoutes(terminalManager, { telegramSessions, sendTelegramNotify }),
  );

  // Agents
  app.use("/api/agents", agentsRoutes(routeDeps));
  app.post("/api/analyze-project", analyzeProjectRoute(routeDeps));
  app.post("/api/generate-agents/preview", generateAgentsPreviewRoute(routeDeps));
  app.post("/api/generate-claudemd", generateClaudeMdRoute(routeDeps));

  // Automations
  app.use("/api/automations", automationsRoutes({ automationEngine, ...routeDeps }));
  app.use("/api/automation-templates", automationTemplatesRoutes());
  app.use("/api/automation-suggestions", automationSuggestionsRoute(routeDeps));

  // Settings (config, setup wizard, scaffold, settings)
  app.use("/api", settingsRoutes(workflowManager, routeDeps));

  // Memory
  app.use("/api/memory", memoryRoutes());

  // Sprint (file-based sprint data)
  app.use(
    "/api/sprint",
    sprintRoutes({
      workflowManager,
      workflowExecutor,
      pipelineRegistry,
      wss,
    }),
  );

  // Sprints (workflow-backed sprint lifecycle)
  app.use(
    "/api/sprints",
    sprintsRoutes({
      workflowManager,
      workflowExecutor,
      pipelineRegistry,
      wss,
    }),
  );

  // Git
  app.use("/api/git", gitRoutes(gitWatcher));

  // System (processes, usage, servers, dev-servers, PMO, system stats/info/preflight/install/detect)
  app.use("/api", systemRoutes(terminalManager, workflowManager, { ...routeDeps, wss }));

  // --- Custom Workflow CRUD API (index-level, uses workflowManager + pipelineRegistry) ---
  app.get("/api/workflows", async (_req, res) => {
    try {
      const flows = await workflowManager.getFlows();
      // Also include pipeline-defined workflows (ISSUE-04)
      const pipelineWorkflows = pipelineRegistry.listWorkflows();
      const existingIds = new Set(flows.map((f) => f.id));
      for (const pw of pipelineWorkflows) {
        if (!existingIds.has(pw.id)) {
          flows.push({
            id: pw.id,
            name: pw.name,
            description: pw.description ?? "",
            icon: "Workflow",
            runs: [],
          } as Awaited<ReturnType<typeof workflowManager.getFlows>>[number]);
        }
      }
      res.json(flows);
    } catch {
      res.json([]);
    }
  });

  app.get("/api/workflows/:flowId/runs/:runId", async (req, res) => {
    try {
      const flowId = req.params["flowId"];
      const runId = req.params["runId"];

      // Check disk-based pipeline run state first (ISSUE-04)
      const diskRun = loadRunState(flowId, runId);
      if (diskRun) {
        res.json(diskRun);
        return;
      }

      // Fall back to in-memory workflow manager
      const run = await workflowManager.getRun(flowId, runId);
      if (!run) {
        res.status(404).json({ error: "Run not found" });
        return;
      }
      res.json(run);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/workflows", async (req, res) => {
    try {
      const body = req.body as {
        name?: string;
        description?: string;
        icon?: string;
        steps?: Array<Record<string, unknown>>;
        schedule?: unknown;
      };
      if (!body.name || !Array.isArray(body.steps) || body.steps.length === 0) {
        res.status(400).json({ error: "Missing name or steps" });
        return;
      }

      const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const newWorkflow: WorkflowConfig = {
        id,
        name: body.name,
        description: body.description,
        icon: body.icon ?? "Workflow",
        steps: body.steps.map((s) => ({
          ...s,
          id: String(s.id ?? ""),
          name: String(s.name ?? ""),
        })) as WorkflowConfig["steps"],
      };

      // Handle schedule field gracefully (ISSUE-02)
      let scheduleWarning: string | undefined;
      if (body.schedule) {
        scheduleWarning =
          "Schedule field received but scheduling is only supported via POST /api/workflows/:id/schedule. The workflow was created without a schedule.";
        console.warn(`[workflow] ${scheduleWarning}`);
      }

      const cfg = getConfig();
      const workflows = cfg.workflows ?? [];
      workflows.push(newWorkflow);
      cfg.workflows = workflows;
      saveConfig(cfg);
      reloadConfig();
      workflowManager.reload();

      // Also persist to the pipeline registry for disk-based storage (ISSUE-02)
      try {
        pipelineRegistry.saveWorkflow({
          id,
          name: body.name,
          description: body.description,
          mode: "execute",
          trigger: { type: "manual" },
          workingDirectory: ".",
          steps: body.steps.map((s) => ({
            id: String(s.id ?? ""),
            name: String(s.name ?? ""),
            type: (s.type as "agent" | "gate" | "loop" | "agent-group") ?? "agent",
            agent: String(s.agent ?? ""),
            goal: String(s.goal ?? s.description ?? ""),
            ...s,
          })) as import("./workflows/definition.js").PipelineStepDef[],
        });
      } catch {
        // Pipeline persistence is best-effort; config file is the primary store
      }

      const flows = await workflowManager.getFlows();
      broadcast(wss, {
        type: "workflow-update",
        payload: flowsToSprints(flows),
      } satisfies WsMessage);

      const result: Record<string, unknown> = { ok: true, id, workflow: newWorkflow };
      if (scheduleWarning) {
        result.warning = scheduleWarning;
      }
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.put("/api/workflows/:id", async (req, res) => {
    try {
      const workflowId = req.params["id"];
      const body = req.body as {
        name?: string;
        description?: string;
        icon?: string;
        steps?: Array<Record<string, unknown>>;
      };

      const cfg = getConfig();
      const workflows = cfg.workflows ?? [];
      const idx = workflows.findIndex((w) => w.id === workflowId);
      if (idx < 0) {
        res.status(404).json({ error: "Workflow not found" });
        return;
      }

      if (body.name !== undefined) workflows[idx]!.name = body.name;
      if (body.description !== undefined) workflows[idx]!.description = body.description;
      if (body.icon !== undefined) workflows[idx]!.icon = body.icon;
      if (body.steps !== undefined) {
        workflows[idx]!.steps = body.steps.map((s) => ({
          ...s,
          id: String(s.id ?? ""),
          name: String(s.name ?? ""),
        })) as WorkflowConfig["steps"];
      }
      cfg.workflows = workflows;
      saveConfig(cfg);
      reloadConfig();
      workflowManager.reload();

      const flows = await workflowManager.getFlows();
      broadcast(wss, {
        type: "workflow-update",
        payload: flowsToSprints(flows),
      } satisfies WsMessage);

      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.delete("/api/workflows/:id", async (req, res) => {
    try {
      const workflowId = req.params["id"];
      const cfg = getConfig();
      const workflows = cfg.workflows ?? [];
      const idx = workflows.findIndex((w) => w.id === workflowId);
      if (idx < 0) {
        res.status(404).json({ error: "Workflow not found" });
        return;
      }

      workflows.splice(idx, 1);
      cfg.workflows = workflows;
      saveConfig(cfg);
      reloadConfig();
      workflowManager.reload();

      const flows = await workflowManager.getFlows();
      broadcast(wss, {
        type: "workflow-update",
        payload: flowsToSprints(flows),
      } satisfies WsMessage);

      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/workflows/:id/run", async (req, res) => {
    try {
      const workflowId = req.params["id"];
      const flow = await workflowManager.getFlow(workflowId);
      if (!flow) {
        res.status(404).json({ error: "Workflow not found" });
        return;
      }

      const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const run = {
        id: runId,
        flowId: workflowId,
        name: `${flow.name} Run`,
        status: "waiting" as const,
        startedAt: new Date().toISOString(),
        steps:
          flow.runs[0]?.steps.map((s) => ({
            ...s,
            status: "pending" as const,
            startedAt: undefined,
            completedAt: undefined,
          })) ?? [],
        stats: {
          agentsUsed: flow.runs[0]?.stats.agentsUsed ?? [],
        },
      };

      // Persist run to disk so GET endpoints can retrieve it (ISSUE-04)
      const stepsRecord: Record<string, import("./workflows/run-state.js").StepState> = {};
      for (const s of run.steps) {
        const stepId = (s as any).id ?? `step-${Object.keys(stepsRecord).length}`;
        stepsRecord[stepId] = {
          id: stepId,
          status: "pending",
        };
      }
      saveRunState({
        runId,
        workflowId,
        status: "planned",
        currentStep: null,
        startedAt: run.startedAt,
        steps: stepsRecord,
      });

      // Add to the in-memory flow
      flow.runs.unshift(run);

      const flows = await workflowManager.getFlows();
      const targetFlow = flows.find((f) => f.id === workflowId);
      if (targetFlow && !targetFlow.runs.find((r) => r.id === runId)) {
        targetFlow.runs.unshift(run);
      }

      broadcast(wss, {
        type: "workflow-update",
        payload: flowsToSprints(flows),
      } satisfies WsMessage);

      res.json({ ok: true, runId, run });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // Shared handler for route aliases: /start and /runs (ISSUE-06)
  async function handleStartRunAlias(
    req: import("express").Request<{ id: string }>,
    res: import("express").Response,
  ): Promise<void> {
    try {
      const workflowId = req.params["id"];
      const flow = await workflowManager.getFlow(workflowId);
      if (!flow) {
        // Also check pipeline registry
        const pipelineWf = pipelineRegistry.getWorkflow(workflowId);
        if (!pipelineWf) {
          res
            .status(404)
            .json({ error: "Workflow not found. Use POST /api/workflows/:id/run to start a run." });
          return;
        }
        // Delegate to pipeline executor
        const runState = workflowExecutor.startRun(pipelineWf);
        res.status(201).json({ runId: runState.runId, status: "started" });
        workflowExecutor.executeRun(pipelineWf, runState).catch(() => {});
        return;
      }

      const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const run = {
        id: runId,
        flowId: workflowId,
        name: `${flow.name} Run`,
        status: "waiting" as const,
        startedAt: new Date().toISOString(),
        steps:
          flow.runs[0]?.steps.map((s) => ({
            ...s,
            status: "pending" as const,
            startedAt: undefined,
            completedAt: undefined,
          })) ?? [],
        stats: {
          agentsUsed: flow.runs[0]?.stats.agentsUsed ?? [],
        },
      };

      // Persist run to disk so GET endpoints can retrieve it (ISSUE-04)
      const stepsRecord2: Record<string, import("./workflows/run-state.js").StepState> = {};
      for (const s of run.steps) {
        const stepId = (s as any).id ?? `step-${Object.keys(stepsRecord2).length}`;
        stepsRecord2[stepId] = {
          id: stepId,
          status: "pending",
        };
      }
      saveRunState({
        runId,
        workflowId,
        status: "planned",
        currentStep: null,
        startedAt: run.startedAt,
        steps: stepsRecord2,
      });

      flow.runs.unshift(run);
      const flows = await workflowManager.getFlows();
      const targetFlow = flows.find((f) => f.id === workflowId);
      if (targetFlow && !targetFlow.runs.find((r) => r.id === runId)) {
        targetFlow.runs.unshift(run);
      }

      broadcast(wss, {
        type: "workflow-update",
        payload: flowsToSprints(flows),
      } satisfies WsMessage);

      res.json({ ok: true, runId, run });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  }

  app.post("/api/workflows/:id/start", (req, res) => handleStartRunAlias(req, res));
  app.post("/api/workflows/:id/runs", (req, res) => handleStartRunAlias(req, res));

  // --- Room routes (mounted via route module) ---
  app.use("/api/rooms", roomsRoutes(roomManager, sdkManager, wss));

  // --- Pipeline-based workflow engine routes ---
  app.use(
    "/api/workflows",
    workflowRoutes({
      registry: pipelineRegistry,
      executor: workflowExecutor,
      scheduler: workflowScheduler,
      wss,
    }),
  );

  // Custom error handler -- no stack traces in responses
  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      // eslint-disable-next-line no-console
      console.error("Server error:", err.message);
      res.status(500).json({ error: "Internal server error" });
    },
  );

  // --- Next.js catch-all (with loading page while compiling) ---
  let nextReady = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handle: (req: any, res: any, parsedUrl?: any) => Promise<void>;

  app.all("/{*path}", (req, res) => {
    if (nextReady) {
      return handle(req, res);
    }
    // Next.js still compiling -- serve loading page for HTML requests
    if (req.headers.accept?.includes("text/html")) {
      res.send(`<!DOCTYPE html>
<html>
<head><title>Agent Studio</title><meta http-equiv="refresh" content="3"></head>
<body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#0a0b0e;color:#f59e0b;font-family:'Geist Mono',monospace">
  <div style="text-align:center">
    <div style="font-size:32px;margin-bottom:16px">\u26A1</div>
    <div style="font-size:16px;font-weight:600">Agent Studio</div>
    <div style="font-size:12px;color:#888;margin-top:12px">Compiling UI... this only takes long the first time.</div>
    <div style="font-size:11px;color:#555;margin-top:8px">API is already running. The page will refresh automatically.</div>
  </div>
</body>
</html>`);
    } else {
      res.status(503).json({ error: "UI is still compiling" });
    }
  });

  // Start HTTP server IMMEDIATELY -- API routes are ready now
  server.listen(port, "127.0.0.1", () => {
    // eslint-disable-next-line no-console
    console.log(`Agent Studio running on http://localhost:${port}`);
  });

  // Auto-start custom dev servers with autoStart flag
  const autoStartServers = getCustomServers().filter((s) => s.autoStart);
  if (autoStartServers.length > 0) {
    for (const s of autoStartServers) {
      startDevServer(s.cwd, s.command)
        .then((result) => {
          // eslint-disable-next-line no-console
          console.log(
            `Auto-started "${s.name}": pid=${result.pid} port=${result.port} status=${result.status}`,
          );
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error(`Failed to auto-start "${s.name}":`, err);
        });
    }
  }

  // Prepare Next.js in the background -- doesn't block API routes
  const nextApp = next({ dev, hostname: "127.0.0.1", port });

  nextApp
    .prepare()
    .then(() => {
      handle = nextApp.getRequestHandler();
      nextUpgradeHandler = nextApp.getUpgradeHandler();
      nextReady = true;
      // eslint-disable-next-line no-console
      console.log("Next.js ready -- UI is now serving");
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Next.js failed to compile:", err);
      // Still mark as ready so the error page is visible instead of infinite loading
      nextReady = true;
    });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server:", err);
  process.exit(1);
});
