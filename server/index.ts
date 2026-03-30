import express from "express";
import { createServer } from "node:http";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";
import { TerminalManager } from "./terminal-manager.js";
import { discoverClaudeProcesses } from "./process-discovery.js";
import {
  getAllSessionUsage,
  getSessionUsage,
  findSessionIdForPtyPid,
  getUsageBySessionId,
  formatCost,
  formatTokens,
} from "./session-usage.js";
import {
  FileWatcher,
  readCurrentSprint,
  readReadyQueue,
  readScanLog,
  readSprintHistory,
  readHandoffs,
  readMemoryStats,
} from "./file-watcher.js";
import { GitWatcher } from "./git-status.js";
import { createPR, getRepoBranches } from "./pr-creator.js";
import { getDevServers, startDevServer, stopDevServer, addCustomServer, removeCustomServer } from "./dev-servers.js";
import { execSync, exec } from "node:child_process";
import os from "node:os";
import type { SessionMeta, WsMessage } from "./types.js";
import { WorkflowManager } from "./workflows/index.js";
import { getConfig, loadConfig, saveConfig, generateDefaultConfig, reloadConfig, getAgentSystemPath, getMainProjectDir, resolvePath, type AgentConfig, type WorkflowConfig } from "./config.js";
import { scaffoldAgentSystem, previewScaffold } from "./scaffold.js";
import type { ScaffoldOptions } from "./scaffold.js";
import { AutomationEngine, AUTOMATION_TEMPLATES } from "./automations.js";
import type { Automation } from "./automations.js";
import { analyzeProject, generateAgents, writeAgentFiles, isClaudeCliAvailable } from "./agent-generator.js";
import type { ProjectAnalysis } from "./agent-generator.js";

const port = parseInt(process.env["PORT"] ?? "8080", 10);
const dev = process.env["NODE_ENV"] !== "production";

const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();

async function main() {
  // Auto-generate config on first run if missing
  const existingConfig = loadConfig();
  if (!existingConfig) {
    const defaultConfig = generateDefaultConfig();
    saveConfig(defaultConfig);
    // eslint-disable-next-line no-console
    console.log("Generated default config at .agent-studio.json");
  }

  await nextApp.prepare();

  const app = express();
  app.use(express.json());

  const server = createServer(app);

  const wss = new WebSocketServer({ noServer: true });
  const terminalManager = new TerminalManager();
  const gitWatcher = new GitWatcher();

  // Route WebSocket upgrades: only /ws goes to our server,
  // everything else (e.g. /_next/webpack-hmr) passes through to Next.js
  server.on("upgrade", (request, socket, head) => {
    const { pathname } = new URL(
      request.url!,
      `http://${request.headers.host}`,
    );
    if (pathname === "/ws") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
    // All other upgrade requests fall through to Next.js (Turbopack HMR)
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
        const msg: WsMessage = JSON.parse(
          typeof raw === "string" ? raw : raw.toString("utf-8"),
        );

        if (msg.type === "terminal-input" && msg.sessionId && msg.data) {
          terminalManager.writeToSession(msg.sessionId, msg.data);
        } else if (
          msg.type === "terminal-resize" &&
          msg.sessionId &&
          msg.cols &&
          msg.rows
        ) {
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

  // --- Config API ---
  app.get("/api/config", (_req, res) => {
    const config = getConfig();
    res.json({
      homeDir: os.homedir(),
      cwd: process.cwd(),
      mainProjectDir: getMainProjectDir(),
      defaultCwd: resolvePath(config.defaults?.workingDirectory),
      config,
    });
  });

  app.post("/api/config", async (req, res) => {
    try {
      const newConfig = req.body as import("./config.js").AgentStudioConfig;
      if (!newConfig || !newConfig.version) {
        res.status(400).json({ error: "Invalid config" });
        return;
      }
      saveConfig(newConfig);
      reloadConfig();
      workflowManager.reload();
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // --- Agents API ---
  app.get("/api/agents", async (_req, res) => {
    try {
      const config = getConfig();
      const agents: AgentConfig[] = [];
      const seenIds = new Set<string>();

      // Always include "No Agent" as the first option
      agents.push({ id: "none", name: "No Agent", description: "Plain Claude session" });
      seenIds.add("none");

      // Add agents from config
      if (config.agents && Array.isArray(config.agents)) {
        for (const a of config.agents) {
          if (!seenIds.has(a.id)) {
            agents.push(a);
            seenIds.add(a.id);
          }
        }
      }

      // Auto-discover agents from .claude/agents/ in each project
      const { existsSync, readdirSync } = await import("node:fs");
      const { readFile } = await import("node:fs/promises");
      const { join, basename } = await import("node:path");

      for (const project of config.projects) {
        const agentsDir = join(project.path, ".claude", "agents");
        if (!existsSync(agentsDir)) continue;

        try {
          const files = readdirSync(agentsDir).filter((f: string) => f.endsWith(".md"));
          for (const file of files) {
            const id = basename(file, ".md");
            if (seenIds.has(id)) continue;

            // Try to extract description from frontmatter
            let description = `Agent from ${project.name}`;
            let model: "opus" | "sonnet" | "haiku" | undefined;
            try {
              const content = await readFile(join(agentsDir, file), "utf-8");
              // Parse YAML frontmatter for description
              const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
              if (fmMatch) {
                const descMatch = fmMatch[1].match(/description:\s*(.+)/);
                if (descMatch) description = descMatch[1].trim();
              }
            } catch {
              // Use default description
            }

            agents.push({ id, name: id, description, model });
            seenIds.add(id);
          }
        } catch {
          // Can't read directory, skip
        }
      }

      // If no agents beyond "none", add sensible defaults
      if (agents.length <= 1) {
        const defaults: AgentConfig[] = [
          { id: "orchestrator", name: "orchestrator", description: "Coordinates agent teams and delegates work" },
          { id: "frontend", name: "frontend", description: "Builds UI and frontend code" },
          { id: "backend", name: "backend", description: "Builds APIs, database, server logic" },
          { id: "qa", name: "qa", description: "Tests the application" },
          { id: "security", name: "security", description: "Reviews code for vulnerabilities" },
          { id: "pmo", name: "pmo", description: "Scans for tasks, manages sprints" },
          { id: "documentation", name: "documentation", description: "Maintains docs and READMEs" },
        ];
        for (const d of defaults) {
          if (!seenIds.has(d.id)) {
            agents.push(d);
            seenIds.add(d.id);
          }
        }
      }

      res.json(agents);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
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
    const msg: WsMessage = {
      type: event.type as WsMessage["type"],
      payload: event.payload,
    };
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(msg));
      }
    }
  });

  // --- Automations API ---
  app.get("/api/automations", (_req, res) => {
    try {
      const automations = automationEngine.getAutomations();
      res.json(automations);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/automations", (req, res) => {
    try {
      const body = req.body as Omit<Automation, "id">;
      if (!body.name || !body.prompt) {
        res.status(400).json({ error: "Missing required fields: name, prompt" });
        return;
      }
      const auto = automationEngine.addAutomation(body);
      // Persist to config
      const cfg = getConfig();
      cfg.automations = automationEngine.toConfig();
      saveConfig(cfg);
      reloadConfig();
      res.status(201).json(auto);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.put("/api/automations/:id", (req, res) => {
    try {
      const updated = automationEngine.updateAutomation(req.params["id"], req.body as Partial<Automation>);
      if (!updated) {
        res.status(404).json({ error: "Automation not found" });
        return;
      }
      // Persist to config
      const cfg = getConfig();
      cfg.automations = automationEngine.toConfig();
      saveConfig(cfg);
      reloadConfig();
      res.json(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.delete("/api/automations/:id", (req, res) => {
    try {
      const removed = automationEngine.removeAutomation(req.params["id"]);
      if (!removed) {
        res.status(404).json({ error: "Automation not found" });
        return;
      }
      // Persist to config
      const cfg = getConfig();
      cfg.automations = automationEngine.toConfig();
      saveConfig(cfg);
      reloadConfig();
      res.status(204).end();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/automations/:id/run", async (req, res) => {
    try {
      const report = await automationEngine.runAutomation(req.params["id"]);
      if (!report) {
        res.status(404).json({ error: "Automation not found" });
        return;
      }
      res.json(report);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // --- Automation Templates API ---
  app.get("/api/automation-templates", (_req, res) => {
    res.json(AUTOMATION_TEMPLATES);
  });

  // --- Reports API ---
  app.get("/api/reports", (_req, res) => {
    try {
      const reports = automationEngine.getReports();
      res.json(reports);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/reports/:id", (req, res) => {
    try {
      const report = automationEngine.getReport(req.params["id"]);
      if (!report) {
        res.status(404).json({ error: "Report not found" });
        return;
      }
      res.json(report);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/reports/:id/approve", (req, res) => {
    try {
      const report = automationEngine.approveReport(req.params["id"]);
      if (!report) {
        res.status(404).json({ error: "Report not found" });
        return;
      }
      res.json(report);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/reports/:id/dismiss", (req, res) => {
    try {
      const report = automationEngine.dismissReport(req.params["id"]);
      if (!report) {
        res.status(404).json({ error: "Report not found" });
        return;
      }
      res.json(report);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/reports/:id/actions/:actionId/approve", (req, res) => {
    try {
      const report = automationEngine.approveAction(req.params["id"], req.params["actionId"]);
      if (!report) {
        res.status(404).json({ error: "Report or action not found" });
        return;
      }
      res.json(report);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // --- Setup Wizard API ---
  app.get("/api/setup/validate-agent-system", async (req, res) => {
    try {
      const agentPath = req.query["path"] as string | undefined;
      if (!agentPath) {
        res.status(400).json({ error: "Missing 'path' query parameter" });
        return;
      }
      const { existsSync } = await import("node:fs");
      const { readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");

      const memoryIndexPath = join(agentPath, "tools/memory_index.json");
      const currentSprintPath = join(agentPath, "sprints/current.md");
      const scanLogPath = join(agentPath, "sprints/scan_log.md");

      const memoryIndexExists = existsSync(memoryIndexPath);
      let memoryCount = 0;
      if (memoryIndexExists) {
        try {
          const raw = await readFile(memoryIndexPath, "utf-8");
          const data = JSON.parse(raw) as { total_entries?: number };
          memoryCount = data.total_entries ?? 0;
        } catch { /* ignore */ }
      }

      res.json({
        memoryIndex: memoryIndexExists,
        currentSprint: existsSync(currentSprintPath),
        scanLog: existsSync(scanLogPath),
        memoryCount,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // --- Scaffold API ---
  app.post("/api/scaffold/preview", (req, res) => {
    try {
      const options = req.body as ScaffoldOptions;
      if (!options?.projectPath || !Array.isArray(options.agents)) {
        res.status(400).json({ error: "Missing projectPath or agents array" });
        return;
      }
      const tree = previewScaffold(options);
      res.json({ tree });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/scaffold", (req, res) => {
    try {
      const options = req.body as ScaffoldOptions;
      if (!options?.projectPath || !Array.isArray(options.agents)) {
        res.status(400).json({ error: "Missing projectPath or agents array" });
        return;
      }
      const result = scaffoldAgentSystem(options);
      if (result.alreadyExists) {
        res.status(409).json({ error: "Agent system already exists at this path", result });
        return;
      }
      res.status(201).json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // --- Agent Generator API ---
  app.get("/api/agents/cli-status", (_req, res) => {
    try {
      res.json({ available: isClaudeCliAvailable() });
    } catch {
      res.json({ available: false });
    }
  });

  app.post("/api/agents/analyze", (req, res) => {
    try {
      const { projectPath } = req.body as { projectPath?: string };
      if (!projectPath) {
        res.status(400).json({ error: "Missing projectPath" });
        return;
      }
      const { existsSync: fsExists } = require("node:fs") as typeof import("node:fs");
      if (!fsExists(projectPath)) {
        res.status(404).json({ error: "Project path does not exist" });
        return;
      }
      const analysis = analyzeProject(projectPath);
      res.json(analysis);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/agents/generate", async (req, res) => {
    try {
      const { analysis, projectPath } = req.body as {
        analysis?: ProjectAnalysis;
        projectPath?: string;
      };
      if (!analysis || !projectPath) {
        res.status(400).json({ error: "Missing analysis or projectPath" });
        return;
      }
      const agents = await generateAgents(analysis, projectPath);
      res.json(agents);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/agents/apply", (req, res) => {
    try {
      const { agents, projectPath } = req.body as {
        agents?: Array<{ id: string; name: string; description: string; model: string; mdContent: string }>;
        projectPath?: string;
      };
      if (!agents || !projectPath || !Array.isArray(agents)) {
        res.status(400).json({ error: "Missing agents array or projectPath" });
        return;
      }
      const result = writeAgentFiles(
        agents.map((a) => ({
          ...a,
          model: (a.model === "opus" || a.model === "sonnet" || a.model === "haiku") ? a.model : "sonnet" as const,
        })),
        projectPath,
      );
      res.status(201).json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // --- REST API ---
  app.post("/api/sessions", (req, res) => {
    try {
      const {
        name,
        command,
        args,
        cwd,
        cols,
        rows,
        meta,
      } = req.body as {
        name?: string;
        command?: string;
        args?: string[];
        cwd?: string;
        cols?: number;
        rows?: number;
        meta?: SessionMeta;
      };

      const session = terminalManager.createSession({
        name: name ?? "Agent",
        command: command ?? "claude",
        args: args ?? ["--dangerously-skip-permissions"],
        cwd,
        cols,
        rows,
        meta,
      });

      res.status(201).json(session);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.delete("/api/sessions/:id", (req, res) => {
    try {
      terminalManager.killSession(req.params["id"]);
      res.status(204).end();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(404).json({ error: message });
    }
  });

  app.get("/api/sessions", (_req, res) => {
    res.json(terminalManager.listSessions());
  });

  // --- Process discovery API ---
  app.get("/api/processes", (_req, res) => {
    try {
      const processes = discoverClaudeProcesses();
      res.json(processes);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // --- Usage API ---
  app.get("/api/usage", (_req, res) => {
    try {
      const usage = getAllSessionUsage();
      res.json(usage);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/usage/:pid", (req, res) => {
    try {
      const pid = parseInt(req.params["pid"], 10);
      if (isNaN(pid)) {
        res.status(400).json({ error: "Invalid PID" });
        return;
      }
      const usage = getSessionUsage(pid);
      if (!usage) {
        res.status(404).json({ error: "No usage data for PID" });
        return;
      }
      res.json(usage);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // Provide usage data for managed sessions (matches pty PID to Claude session)
  app.get("/api/sessions/:id/usage", (req, res) => {
    try {
      const sessionId = req.params["id"];
      // Find the managed session to get its PID
      const sessions = terminalManager.listSessions();
      const session = sessions.find((s) => s.id === sessionId);
      if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      // Try direct PID match first, then search child processes
      let usage = getSessionUsage(session.pid);
      if (!usage) {
        const claudeSessionId = findSessionIdForPtyPid(session.pid);
        if (claudeSessionId) {
          usage = getUsageBySessionId(claudeSessionId);
        }
      }

      if (!usage) {
        res.json({
          cost: null,
          tokens: null,
          model: null,
          modelShort: null,
        });
        return;
      }

      res.json({
        cost: formatCost(usage.totalCost),
        tokens: formatTokens(usage.totalTokens),
        model: usage.model,
        modelShort: usage.modelShort,
        totalCost: usage.totalCost,
        totalTokens: usage.totalTokens,
        totalInputTokens: usage.totalInputTokens,
        totalOutputTokens: usage.totalOutputTokens,
        cacheCreationTokens: usage.cacheCreationTokens,
        cacheReadTokens: usage.cacheReadTokens,
        messageCount: usage.messageCount,
        contextUsed: usage.contextUsed,
        contextTotal: usage.contextTotal,
        contextPercent: usage.contextPercent,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // --- Usage polling: broadcast usage updates every 30s ---
  setInterval(() => {
    try {
      const usage = getAllSessionUsage();

      // Also enrich managed sessions
      const sessions = terminalManager.listSessions();
      const managedUsage: Record<string, { cost: string; tokens: string; modelShort: string; totalCost: number; totalTokens: number; contextUsed: number; contextTotal: number; contextPercent: number }> = {};
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

      const msg: WsMessage = {
        type: "usage-update",
        payload: { all: usage, managed: managedUsage },
      };
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(msg));
        }
      }
    } catch {
      // Ignore polling errors
    }
  }, 30_000);

  // --- File watcher for sprint/memory files ---
  const fileWatcher = new FileWatcher();
  fileWatcher.onUpdate((update) => {
    const msg: WsMessage = {
      type: "file-update",
      data: JSON.stringify({ file: update.file, content: update.content }),
    };
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(msg));
      }
    }
  });
  fileWatcher.start();

  // --- Sprint API ---
  app.get("/api/sprint/current", async (_req, res) => {
    try {
      const content = await readCurrentSprint();
      res.json({ content });
    } catch {
      res.json({ content: null });
    }
  });

  app.get("/api/sprint/queue", async (_req, res) => {
    try {
      const content = await readReadyQueue();
      res.json({ content });
    } catch {
      res.json({ content: null });
    }
  });

  app.get("/api/sprint/scans", async (_req, res) => {
    try {
      const entries = await readScanLog();
      res.json(entries);
    } catch {
      res.json([]);
    }
  });

  app.get("/api/sprint/history", async (_req, res) => {
    try {
      const history = await readSprintHistory();
      res.json(history);
    } catch {
      res.json([]);
    }
  });

  app.get("/api/sprint/handoffs", async (_req, res) => {
    try {
      const handoffs = await readHandoffs();
      res.json(handoffs);
    } catch {
      res.json([]);
    }
  });

  app.get("/api/memory/stats", async (_req, res) => {
    try {
      const stats = await readMemoryStats();
      res.json(stats);
    } catch {
      res.json({ total: 0, categories: {} });
    }
  });

  // --- Git watcher ---
  gitWatcher.onUpdate((repos) => {
    const msg: WsMessage = {
      type: "git-update",
      payload: repos,
    };
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(msg));
      }
    }
  });
  gitWatcher.start(10_000);

  // --- Git REST API ---
  app.get("/api/git/status", (_req, res) => {
    try {
      const statuses = gitWatcher.getStatus();
      res.json(statuses);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/git/branches", (req, res) => {
    try {
      const repoPath = req.query["repo"] as string | undefined;
      if (!repoPath) {
        res.status(400).json({ error: "Missing 'repo' query parameter" });
        return;
      }
      const branches = getRepoBranches(repoPath);
      res.json(branches);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/git/pr", async (req, res) => {
    try {
      const { repo, sourceBranch, targetBranch, title, description } =
        req.body as {
          repo?: string;
          sourceBranch?: string;
          targetBranch?: string;
          title?: string;
          description?: string;
        };

      if (!repo || !sourceBranch || !targetBranch || !title) {
        res.status(400).json({
          error: "Missing required fields: repo, sourceBranch, targetBranch, title",
        });
        return;
      }

      const result = await createPR({
        repo,
        sourceBranch,
        targetBranch,
        title,
        description: description ?? "",
      });

      res.status(201).json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // --- Git changes (status --porcelain) ---
  app.get("/api/git/changes", (req, res) => {
    try {
      const repoPath = req.query["repo"] as string | undefined;
      if (!repoPath) {
        res.status(400).json({ error: "Missing 'repo' query parameter" });
        return;
      }
      const output = execSync("git status --porcelain", {
        cwd: repoPath,
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
      res.json({ changes: output || "(no changes)" });
    } catch {
      res.json({ changes: "(unavailable)" });
    }
  });

  // --- Git diff (staged + unstaged) ---
  app.get("/api/git/diff", (req, res) => {
    try {
      const repoPath = req.query["repo"] as string | undefined;
      if (!repoPath) {
        res.status(400).json({ error: "Missing 'repo' query parameter" });
        return;
      }
      const staged = execSync("git diff --cached --stat", {
        cwd: repoPath,
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
      const unstaged = execSync("git diff --stat", {
        cwd: repoPath,
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
      res.json({ staged: staged || "(none)", unstaged: unstaged || "(none)" });
    } catch {
      res.json({ staged: "(unavailable)", unstaged: "(unavailable)" });
    }
  });

  // --- Git commit ---
  app.post("/api/git/commit", (req, res) => {
    try {
      const { repo, message: commitMsg } = req.body as {
        repo?: string;
        message?: string;
      };
      if (!repo || !commitMsg) {
        res.status(400).json({ error: "Missing 'repo' or 'message'" });
        return;
      }

      // Safety: check if this is the prod repo
      const statuses = gitWatcher.getStatus();
      const repoInfo = statuses.find((r) => r.path === repo);
      if (repoInfo?.isProd) {
        res.status(403).json({
          error:
            "BLOCKED: Cannot commit directly to production repo. Changes require explicit confirmation.",
        });
        return;
      }

      execSync("git add -A", {
        cwd: repo,
        encoding: "utf-8",
        timeout: 10000,
      });
      const output = execSync(
        `git commit -m ${JSON.stringify(commitMsg)}`,
        {
          cwd: repo,
          encoding: "utf-8",
          timeout: 10000,
        },
      ).trim();
      res.json({ ok: true, output });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // --- Git push ---
  app.post("/api/git/push", (req, res) => {
    try {
      const { repo, confirmed } = req.body as {
        repo?: string;
        confirmed?: boolean;
      };
      if (!repo) {
        res.status(400).json({ error: "Missing 'repo'" });
        return;
      }

      // Safety: prod repo requires explicit confirmation
      const statuses = gitWatcher.getStatus();
      const repoInfo = statuses.find((r) => r.path === repo);
      if (repoInfo?.isProd && !confirmed) {
        res.status(403).json({
          error:
            "BLOCKED: Pushing to production repo requires explicit confirmation. Set confirmed=true after typing CONFIRM.",
          requiresConfirmation: true,
        });
        return;
      }

      const output = execSync("git push", {
        cwd: repo,
        encoding: "utf-8",
        timeout: 30000,
      }).trim();
      res.json({ ok: true, output });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/git/open", (req, res) => {
    try {
      const { path: dirPath, app: appName } = req.body as {
        path?: string;
        app?: string;
      };
      if (!dirPath) {
        res.status(400).json({ error: "Missing 'path' in request body" });
        return;
      }
      if (appName) {
        execSync(`open -a "${appName}" "${dirPath}"`, { timeout: 5000 });
      } else {
        execSync(`open "${dirPath}"`, { timeout: 5000 });
      }
      res.status(200).json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // --- Workflow API ---
  const workflowManager = new WorkflowManager();

  app.get("/api/workflows", async (_req, res) => {
    try {
      const flows = await workflowManager.getFlows();
      res.json(flows);
    } catch {
      res.json([]);
    }
  });

  app.get("/api/workflows/:flowId/runs/:runId", async (req, res) => {
    try {
      const run = await workflowManager.getRun(
        req.params["flowId"],
        req.params["runId"],
      );
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

  // --- Custom Workflow CRUD API ---

  app.post("/api/workflows", async (req, res) => {
    try {
      const body = req.body as {
        name?: string;
        description?: string;
        icon?: string;
        steps?: Array<{ id: string; name: string; description?: string; agents: string[] }>;
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
          id: s.id,
          name: s.name,
          description: s.description,
          agents: s.agents ?? [],
        })),
      };

      const cfg = getConfig();
      const workflows = cfg.workflows ?? [];
      workflows.push(newWorkflow);
      cfg.workflows = workflows;
      saveConfig(cfg);
      reloadConfig();
      workflowManager.reload();

      const flows = await workflowManager.getFlows();
      // Broadcast update
      const msg: WsMessage = { type: "workflow-update", payload: flows };
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(msg));
        }
      }

      res.json({ ok: true, id, workflow: newWorkflow });
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
        steps?: Array<{ id: string; name: string; description?: string; agents: string[] }>;
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
          id: s.id,
          name: s.name,
          description: s.description,
          agents: s.agents ?? [],
        }));
      }
      cfg.workflows = workflows;
      saveConfig(cfg);
      reloadConfig();
      workflowManager.reload();

      const flows = await workflowManager.getFlows();
      const msg: WsMessage = { type: "workflow-update", payload: flows };
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(msg));
        }
      }

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
      const msg: WsMessage = { type: "workflow-update", payload: flows };
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(msg));
        }
      }

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

      // Create a new run by adding to the flow's config
      // For custom workflows, we create a run entry and broadcast
      const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const run = {
        id: runId,
        flowId: workflowId,
        name: `${flow.name} Run`,
        status: "waiting" as const,
        startedAt: new Date().toISOString(),
        steps: flow.runs[0]?.steps.map((s) => ({
          ...s,
          status: "pending" as const,
          startedAt: undefined,
          completedAt: undefined,
        })) ?? [],
        stats: {
          agentsUsed: flow.runs[0]?.stats.agentsUsed ?? [],
        },
      };

      // We don't persist runs (they're ephemeral), just broadcast
      // Add to the in-memory flow
      flow.runs.unshift(run);

      const flows = await workflowManager.getFlows();
      // Inject the new run into the matching flow
      const targetFlow = flows.find((f) => f.id === workflowId);
      if (targetFlow && !targetFlow.runs.find((r) => r.id === runId)) {
        targetFlow.runs.unshift(run);
      }

      const msg: WsMessage = { type: "workflow-update", payload: flows };
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(msg));
        }
      }

      res.json({ ok: true, runId, run });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // Broadcast workflow updates on sprint file changes
  fileWatcher.onUpdate(() => {
    void workflowManager.getFlows().then((flows) => {
      const msg: WsMessage = {
        type: "workflow-update",
        payload: flows,
      };
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(msg));
        }
      }
    });
  });

  // --- PMO Scheduler API ---
  const PMO_PLIST = `${os.homedir()}/Library/LaunchAgents/com.agent-studio.pmo-scan.plist`;
  const PMO_SCAN_SCRIPT = getAgentSystemPath("tools/pmo-scan.sh") ?? "";

  app.get("/api/pmo/status", (_req, res) => {
    try {
      let isLoaded = false;
      try {
        const result = execSync("launchctl list 2>/dev/null", { timeout: 5000 }).toString();
        isLoaded = result.includes("agent-studio");
      } catch {
        isLoaded = false;
      }

      // Read last scan from scan_log.md
      let lastScan: string | null = null;
      let lastStatus: string | null = null;
      try {
        const scanEntries = readScanLog() as unknown as Promise<Array<{ timestamp: string; status: string }>>;
        // readScanLog is async, handle synchronously here
        res.json({ loaded: isLoaded, lastScan: null, lastStatus: null, checking: true });
        return;
      } catch {
        // fall through
      }

      res.json({ loaded: isLoaded, lastScan, lastStatus });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // Async version that properly reads scan log
  app.get("/api/pmo/status-full", async (_req, res) => {
    try {
      let isLoaded = false;
      try {
        const result = execSync("launchctl list 2>/dev/null", { timeout: 5000 }).toString();
        isLoaded = result.includes("agent-studio");
      } catch {
        isLoaded = false;
      }

      const scanEntries = await readScanLog();
      const lastEntry = scanEntries.length > 0 ? scanEntries[scanEntries.length - 1] : null;

      let nextScanIn: string | null = null;
      if (isLoaded && lastEntry) {
        const lastTime = new Date(lastEntry.timestamp).getTime();
        const nextTime = lastTime + 2 * 60 * 60 * 1000; // 2 hours
        const remainMs = nextTime - Date.now();
        if (remainMs > 0) {
          const mins = Math.floor(remainMs / 60000);
          const hrs = Math.floor(mins / 60);
          nextScanIn = hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`;
        } else {
          nextScanIn = "overdue";
        }
      }

      res.json({
        loaded: isLoaded,
        lastScan: lastEntry?.timestamp ?? null,
        lastStatus: lastEntry?.status ?? null,
        lastDetail: lastEntry?.detail ?? null,
        nextScanIn,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/pmo/start", (_req, res) => {
    try {
      execSync(`launchctl load "${PMO_PLIST}" 2>/dev/null || true`, { timeout: 5000 });
      res.json({ ok: true, status: "started" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/pmo/stop", (_req, res) => {
    try {
      execSync(`launchctl unload "${PMO_PLIST}" 2>/dev/null || true`, { timeout: 5000 });
      res.json({ ok: true, status: "stopped" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/pmo/scan", (_req, res) => {
    try {
      // Run scan in background
      exec(`bash "${PMO_SCAN_SCRIPT}"`, { timeout: 120000 }, () => {
        // fire and forget — result lands in scan_log.md
      });
      res.json({ ok: true, status: "scan-started" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // --- Process Kill API ---
  app.post("/api/processes/:pid/kill", (req, res) => {
    try {
      const pid = parseInt(req.params["pid"], 10);
      if (isNaN(pid) || pid <= 0) {
        res.status(400).json({ error: "Invalid PID" });
        return;
      }
      // Safety: don't allow killing PID 1 or the current process
      if (pid === 1 || pid === process.pid) {
        res.status(403).json({ error: "Cannot kill this process" });
        return;
      }
      process.kill(pid, "SIGTERM");
      res.json({ ok: true, pid });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // --- Dev Servers API ---
  app.get("/api/servers", (_req, res) => {
    try {
      const servers = getDevServers();
      res.json(servers);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/servers/start", async (req, res) => {
    try {
      const { cwd, command } = req.body as { cwd?: string; command?: string };
      if (!cwd) {
        res.status(400).json({ error: "Missing 'cwd'" });
        return;
      }
      const result = await startDevServer(cwd, command ?? "npm run dev");
      res.status(201).json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/servers/:pid/stop", (req, res) => {
    try {
      const pid = parseInt(req.params["pid"], 10);
      if (isNaN(pid) || pid <= 0) {
        res.status(400).json({ error: "Invalid PID" });
        return;
      }
      // Safety: don't allow stopping the agent-studio server itself
      if (pid === process.pid) {
        res.status(403).json({ error: "Cannot stop the agent-studio server" });
        return;
      }
      const ok = stopDevServer(pid);
      res.json({ ok, pid });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // --- Custom Servers API ---
  app.post("/api/servers/custom", (req, res) => {
    try {
      const { name, cwd, command } = req.body as { name?: string; cwd?: string; command?: string };
      if (!name || !cwd) {
        res.status(400).json({ error: "Missing 'name' or 'cwd'" });
        return;
      }
      addCustomServer({ name, cwd, command: command ?? "npm run dev" });
      res.status(201).json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.delete("/api/servers/custom/:name", (req, res) => {
    try {
      const name = req.params["name"];
      if (!name) {
        res.status(400).json({ error: "Missing server name" });
        return;
      }
      const removed = removeCustomServer(name);
      res.json({ ok: removed });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // --- Session History API ---
  app.get("/api/sessions/history", async (_req, res) => {
    try {
      const { readdirSync, statSync, readFileSync } = await import("node:fs");
      const { join } = await import("node:path");
      const home = os.homedir();
      const projectsDir = join(home, ".claude", "projects");

      interface HistorySession {
        id: string;
        project: string;
        projectPath: string;
        modified: number;
        file: string;
      }

      const sessions: HistorySession[] = [];

      try {
        const projectDirs = readdirSync(projectsDir);
        for (const projDir of projectDirs) {
          const projPath = join(projectsDir, projDir);
          try {
            const stat = statSync(projPath);
            if (!stat.isDirectory()) continue;
          } catch {
            continue;
          }

          try {
            const files = readdirSync(projPath);
            for (const file of files) {
              if (!file.endsWith(".jsonl")) continue;
              const filePath = join(projPath, file);
              try {
                const fileStat = statSync(filePath);
                // Decode project name from directory name
                const projectName = projDir.replace(/-/g, "/").replace(/^\/+/, "");

                sessions.push({
                  id: file.replace(".jsonl", ""),
                  project: projectName,
                  projectPath: projPath,
                  modified: fileStat.mtimeMs,
                  file: filePath,
                });
              } catch {
                continue;
              }
            }
          } catch {
            continue;
          }
        }
      } catch {
        // projects dir may not exist
      }

      // Sort by modified time, newest first, limit to 20
      sessions.sort((a, b) => b.modified - a.modified);
      const result = sessions.slice(0, 20).map((s) => {
        // Extract preview and agent from first ~30 lines of JSONL
        let preview = "";
        let agent = "";
        try {
          const fd = require("node:fs").openSync(s.file, "r");
          const buf = Buffer.alloc(32768);
          const bytesRead = require("node:fs").readSync(fd, buf, 0, 32768, 0);
          require("node:fs").closeSync(fd);
          const chunk = buf.toString("utf8", 0, bytesRead);
          const lines = chunk.split("\n").filter(Boolean);
          for (const line of lines.slice(0, 30)) {
            try {
              const entry = JSON.parse(line);
              // Extract agent setting (e.g., "pmo", "frontend-worker")
              if (entry.type === "agent-setting" && entry.agentSetting && !agent) {
                agent = entry.agentSetting;
              }
              // Extract first real user message as preview
              if (entry.type === "user" && !preview) {
                const msg = entry.message;
                let text = "";
                if (typeof msg === "string") {
                  text = msg;
                } else if (msg && typeof msg.content === "string") {
                  text = msg.content;
                } else if (msg && Array.isArray(msg.content)) {
                  text = msg.content
                    .filter((b: { type: string }) => b.type === "text")
                    .map((b: { text: string }) => b.text)
                    .join(" ");
                }
                // Skip system/command messages
                if (text && !text.startsWith("<") && text.length > 5) {
                  preview = text.slice(0, 80).replace(/\n/g, " ").trim();
                }
              }
              // Also check last-prompt as fallback
              if (entry.type === "last-prompt" && !preview && entry.lastPrompt) {
                const lp = entry.lastPrompt as string;
                if (!lp.startsWith("<") && lp.length > 5) {
                  preview = lp.slice(0, 80).replace(/\n/g, " ").trim();
                }
              }
            } catch {
              // Skip unparseable lines
            }
          }
        } catch {
          // Can't read file, leave preview empty
        }

        // Derive short project name from directory path
        const projectShort = s.project.split("/").pop() ?? s.project;

        return {
          id: s.id,
          project: s.project,
          projectShort,
          modified: s.modified,
          date: new Date(s.modified).toISOString(),
          agent,
          preview,
        };
      });

      res.json(result);
    } catch {
      res.json([]);
    }
  });

  // --- Memory Browser API ---
  const MEMORY_INDEX_PATH = getAgentSystemPath("tools/memory_index.json") ?? "";
  const MEMORY_BASE_PATH = getMainProjectDir();

  app.get("/api/memory/entries", async (_req, res) => {
    try {
      if (!MEMORY_INDEX_PATH) {
        res.json({ entries: [], total: 0 });
        return;
      }
      const { readFile } = await import("node:fs/promises");
      const raw = await readFile(MEMORY_INDEX_PATH, "utf-8");
      const index = JSON.parse(raw) as { entries: unknown[]; total_entries: number };
      res.json({ entries: index.entries ?? [], total: index.total_entries ?? 0 });
    } catch {
      // File doesn't exist or is invalid — return empty
      res.json({ entries: [], total: 0 });
    }
  });

  app.get("/api/memory/entry", async (req, res) => {
    try {
      const filePath = req.query["file"] as string | undefined;
      if (!filePath) {
        res.status(400).json({ error: "Missing 'file' query parameter" });
        return;
      }
      if (!MEMORY_BASE_PATH) {
        res.status(404).json({ error: "No agent system configured" });
        return;
      }
      const { readFile } = await import("node:fs/promises");
      const fullPath = `${MEMORY_BASE_PATH}/${filePath}`;
      const raw = await readFile(fullPath, "utf-8");
      const data = JSON.parse(raw);
      res.json(data);
    } catch {
      // File doesn't exist or is invalid
      res.status(404).json({ error: "Memory entry not found" });
    }
  });

  // --- Memory Write API ---

  app.post("/api/memory/entries", async (req, res) => {
    try {
      if (!MEMORY_INDEX_PATH || !MEMORY_BASE_PATH) {
        res.status(400).json({ error: "No agent system configured" });
        return;
      }
      const { readFile, writeFile, mkdir } = await import("node:fs/promises");
      const { join } = await import("node:path");

      const body = req.body as {
        title?: string;
        category?: string;
        content?: { observation?: string; action?: string; outcome?: string; lesson?: string };
        tags?: string[];
        pinned?: boolean;
      };
      if (!body.title || !body.category) {
        res.status(400).json({ error: "Missing title or category" });
        return;
      }

      // Build filename
      const now = new Date();
      const pad = (n: number, len = 2) => String(n).padStart(len, "0");
      const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const categoryMap: Record<string, string> = {
        learning: "learnings", learnings: "learnings",
        correction: "corrections", corrections: "corrections",
        decision: "decisions", decisions: "decisions",
        knowledge: "knowledge",
        "human-input": "human-inputs", "human-inputs": "human-inputs",
      };
      const folder = categoryMap[body.category] ?? "learnings";
      const memoryDir = join(MEMORY_BASE_PATH, "ai-agents", "memory", folder);
      await mkdir(memoryDir, { recursive: true });
      const filename = `${dateStr}_dashboard_${body.category.replace(/-/g, "_")}.json`;
      const filePath = join(memoryDir, filename);
      const relPath = `ai-agents/memory/${folder}/${filename}`;

      // Build entry JSON
      const entry = {
        agent_type: "dashboard",
        memory_type: body.category,
        title: body.title,
        content: body.content ?? {},
        tags: body.tags ?? [],
        created_by: "dashboard",
        created_at: now.toISOString(),
        pinned: body.pinned ?? false,
      };
      await writeFile(filePath, JSON.stringify(entry, null, 2), "utf-8");

      // Update index
      try {
        const rawIndex = await readFile(MEMORY_INDEX_PATH, "utf-8");
        const index = JSON.parse(rawIndex) as { entries: Record<string, unknown>[]; total_entries: number; [k: string]: unknown };
        const newIndexEntry = {
          file: relPath,
          title: body.title,
          key_point: body.content?.lesson ?? body.content?.observation ?? body.title,
          tags: body.tags ?? [],
          category: folder,
          agent_type: "dashboard",
          pinned: body.pinned ?? false,
        };
        index.entries.push(newIndexEntry);
        index.total_entries = index.entries.length;
        await writeFile(MEMORY_INDEX_PATH, JSON.stringify(index, null, 2), "utf-8");
      } catch {
        // Index update failed — entry still saved
      }

      res.json({ ok: true, file: relPath });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.put("/api/memory/entries/:id", async (req, res) => {
    try {
      if (!MEMORY_INDEX_PATH || !MEMORY_BASE_PATH) {
        res.status(400).json({ error: "No agent system configured" });
        return;
      }
      const { readFile, writeFile } = await import("node:fs/promises");

      const filePath = decodeURIComponent(req.params["id"] ?? "");
      if (!filePath) {
        res.status(400).json({ error: "Missing entry id (file path)" });
        return;
      }
      const fullPath = `${MEMORY_BASE_PATH}/${filePath}`;
      const raw = await readFile(fullPath, "utf-8");
      const existing = JSON.parse(raw) as Record<string, unknown>;

      const body = req.body as {
        title?: string;
        content?: { observation?: string; action?: string; outcome?: string; lesson?: string };
        tags?: string[];
        pinned?: boolean;
      };

      if (body.title !== undefined) existing["title"] = body.title;
      if (body.content !== undefined) existing["content"] = body.content;
      if (body.tags !== undefined) existing["tags"] = body.tags;
      if (body.pinned !== undefined) existing["pinned"] = body.pinned;

      await writeFile(fullPath, JSON.stringify(existing, null, 2), "utf-8");

      // Update index entry
      try {
        const rawIndex = await readFile(MEMORY_INDEX_PATH, "utf-8");
        const index = JSON.parse(rawIndex) as { entries: Record<string, unknown>[]; total_entries: number; [k: string]: unknown };
        const idx = index.entries.findIndex((e) => e["file"] === filePath);
        if (idx >= 0) {
          if (body.title !== undefined) index.entries[idx]!["title"] = body.title;
          if (body.tags !== undefined) index.entries[idx]!["tags"] = body.tags;
          if (body.pinned !== undefined) index.entries[idx]!["pinned"] = body.pinned;
          if (body.content?.lesson) index.entries[idx]!["key_point"] = body.content.lesson;
          else if (body.content?.observation) index.entries[idx]!["key_point"] = body.content.observation;
          await writeFile(MEMORY_INDEX_PATH, JSON.stringify(index, null, 2), "utf-8");
        }
      } catch {
        // Index update failed
      }

      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.delete("/api/memory/entries/:id", async (req, res) => {
    try {
      if (!MEMORY_INDEX_PATH || !MEMORY_BASE_PATH) {
        res.status(400).json({ error: "No agent system configured" });
        return;
      }
      const { readFile, writeFile, unlink } = await import("node:fs/promises");

      const filePath = decodeURIComponent(req.params["id"] ?? "");
      if (!filePath) {
        res.status(400).json({ error: "Missing entry id (file path)" });
        return;
      }
      const fullPath = `${MEMORY_BASE_PATH}/${filePath}`;

      // Delete file
      try {
        await unlink(fullPath);
      } catch {
        // File may already be gone
      }

      // Remove from index
      try {
        const rawIndex = await readFile(MEMORY_INDEX_PATH, "utf-8");
        const index = JSON.parse(rawIndex) as { entries: Record<string, unknown>[]; total_entries: number; [k: string]: unknown };
        index.entries = index.entries.filter((e) => e["file"] !== filePath);
        index.total_entries = index.entries.length;
        await writeFile(MEMORY_INDEX_PATH, JSON.stringify(index, null, 2), "utf-8");
      } catch {
        // Index update failed
      }

      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/memory/entries/:id/pin", async (req, res) => {
    try {
      if (!MEMORY_INDEX_PATH || !MEMORY_BASE_PATH) {
        res.status(400).json({ error: "No agent system configured" });
        return;
      }
      const { readFile, writeFile } = await import("node:fs/promises");

      const filePath = decodeURIComponent(req.params["id"] ?? "");
      if (!filePath) {
        res.status(400).json({ error: "Missing entry id (file path)" });
        return;
      }
      const fullPath = `${MEMORY_BASE_PATH}/${filePath}`;
      const raw = await readFile(fullPath, "utf-8");
      const existing = JSON.parse(raw) as Record<string, unknown>;
      const wasPinned = existing["pinned"] === true;
      existing["pinned"] = !wasPinned;
      await writeFile(fullPath, JSON.stringify(existing, null, 2), "utf-8");

      // Update index
      try {
        const rawIndex = await readFile(MEMORY_INDEX_PATH, "utf-8");
        const index = JSON.parse(rawIndex) as { entries: Record<string, unknown>[]; total_entries: number; [k: string]: unknown };
        const idx = index.entries.findIndex((e) => e["file"] === filePath);
        if (idx >= 0) {
          index.entries[idx]!["pinned"] = !wasPinned;
          await writeFile(MEMORY_INDEX_PATH, JSON.stringify(index, null, 2), "utf-8");
        }
      } catch {
        // Index update failed
      }

      res.json({ ok: true, pinned: !wasPinned });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // --- System Stats API ---
  app.get("/api/system/stats", (_req, res) => {
    try {
      // CPU usage: calculate from os.cpus()
      const cpus = os.cpus();
      let totalIdle = 0;
      let totalTick = 0;
      for (const cpu of cpus) {
        totalIdle += cpu.times.idle;
        totalTick += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
      }
      const cpuUsage = totalTick > 0 ? ((1 - totalIdle / totalTick) * 100) : 0;

      // Memory
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;

      // Disk
      let diskUsed = 0;
      let diskTotal = 0;
      let diskPercentage = 0;
      try {
        const dfOutput = execSync("df -k /", { encoding: "utf-8", timeout: 3000 });
        const lines = dfOutput.trim().split("\n");
        if (lines.length >= 2) {
          const parts = lines[1].split(/\s+/);
          // df -k outputs: Filesystem 1K-blocks Used Available Use% Mounted
          const totalBlocks = parseInt(parts[1], 10) || 0;
          const usedBlocks = parseInt(parts[2], 10) || 0;
          diskTotal = totalBlocks / (1024 * 1024); // Convert to GB
          diskUsed = usedBlocks / (1024 * 1024);
          diskPercentage = diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0;
        }
      } catch {
        // Disk stats unavailable
      }

      // Active server count
      let activeServers = 0;
      try {
        const servers = getDevServers();
        activeServers = servers.filter((s) => s.running).length;
      } catch {
        // ignore
      }

      // Active Claude session count
      const activeSessions = terminalManager.listSessions().length;

      res.json({
        cpu: { usage: Math.round(cpuUsage * 10) / 10, cores: cpus.length },
        memory: {
          used: Math.round((usedMem / (1024 * 1024 * 1024)) * 100) / 100,
          total: Math.round((totalMem / (1024 * 1024 * 1024)) * 100) / 100,
          percentage: Math.round((usedMem / totalMem) * 1000) / 10,
        },
        disk: {
          used: Math.round(diskUsed * 100) / 100,
          total: Math.round(diskTotal * 100) / 100,
          percentage: Math.round(diskPercentage * 10) / 10,
        },
        activeServers,
        activeSessions,
        uptime: Math.round(process.uptime()),
        wsConnections: wss.clients.size,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // --- Settings API ---
  const SETTINGS_PATH = `${process.cwd()}/.settings.json`;

  app.get("/api/settings", async (_req, res) => {
    try {
      const { readFile } = await import("node:fs/promises");
      const raw = await readFile(SETTINGS_PATH, "utf-8");
      res.json(JSON.parse(raw));
    } catch {
      // Return defaults from config if .settings.json doesn't exist
      const cfg = getConfig();
      res.json({
        defaultModel: cfg.defaults.model,
        defaultPermissions: cfg.defaults.permissions,
        defaultCwd: cfg.defaults.workingDirectory,
      });
    }
  });

  app.post("/api/settings", async (req, res) => {
    try {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(SETTINGS_PATH, JSON.stringify(req.body, null, 2), "utf-8");
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // --- System Preflight API ---
  app.get("/api/system/preflight", (_req, res) => {
    try {
      const checks = {
        claudeCode: { installed: false } as { installed: boolean; version?: string; path?: string; authenticated?: boolean },
        node: { installed: true, version: process.version },
        git: { installed: false } as { installed: boolean; version?: string },
      };
      const blockers: string[] = [];

      // Check Claude Code CLI
      try {
        const claudePath = execSync("which claude", { encoding: "utf-8", timeout: 5000 }).trim();
        checks.claudeCode.installed = true;
        checks.claudeCode.path = claudePath;
        try {
          const versionOutput = execSync("claude --version", { encoding: "utf-8", timeout: 5000 }).trim();
          checks.claudeCode.version = versionOutput;
        } catch {
          // version check failed but CLI exists
        }
        const { join: joinPre } = require("node:path") as typeof import("node:path");
        const claudeDir = joinPre(os.homedir(), ".claude");
        const { existsSync: fsExistsPre } = require("node:fs") as typeof import("node:fs");
        checks.claudeCode.authenticated = fsExistsPre(claudeDir);
        if (!checks.claudeCode.authenticated) {
          blockers.push("Claude Code is not authenticated. Run `claude` in your terminal and complete setup first.");
        }
      } catch {
        checks.claudeCode.installed = false;
        blockers.push("Claude Code CLI is not installed.");
      }

      // Check git
      try {
        const gitVersion = execSync("git --version", { encoding: "utf-8", timeout: 5000 }).trim();
        checks.git.installed = true;
        checks.git.version = gitVersion.replace("git version ", "");
      } catch {
        checks.git.installed = false;
        blockers.push("Git is not installed.");
      }

      res.json({ ready: blockers.length === 0, checks, blockers });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // --- System Detect API ---
  app.post("/api/system/detect", (_req, res) => {
    try {
      const { existsSync: fse, readdirSync: fsr, statSync: fss, readFileSync: fsrf, realpathSync: fsrp } = require("node:fs") as typeof import("node:fs");
      const { join: pj } = require("node:path") as typeof import("node:path");
      const home = os.homedir();

      const searchDirs = [
        pj(home, "Code"), pj(home, "code"), pj(home, "Projects"),
        pj(home, "Documents"), pj(home, "Desktop"), pj(home, "repos"),
        pj(home, "dev"), pj(home, "workspace"), pj(home, "src"), pj(home, "work"),
      ];

      interface DetectedProject {
        name: string; path: string; techStack: string[]; languages: string[];
        packageManager: string; devCommand?: string; hasAgentSystem: boolean;
        gitBranch: string; lastCommit: string; lastModified: number;
      }

      const projects: DetectedProject[] = [];
      const seenPaths = new Set<string>();

      for (const dir of searchDirs) {
        if (!fse(dir)) continue;
        try {
          const entries = fsr(dir);
          for (const entry of entries) {
            if (entry.startsWith(".")) continue;
            const fullPath = pj(dir, entry);
            try {
              const stat = fss(fullPath);
              if (!stat.isDirectory()) continue;
              const resolved = fsrp(fullPath);
              if (seenPaths.has(resolved)) continue;
              if (!fse(pj(fullPath, ".git"))) continue;
              seenPaths.add(resolved);

              const techStack: string[] = [];
              const languages: string[] = [];
              let packageManager = "unknown";
              let devCommand: string | undefined;

              // package.json detection
              if (fse(pj(fullPath, "package.json"))) {
                try {
                  const pkg = JSON.parse(fsrf(pj(fullPath, "package.json"), "utf-8")) as {
                    dependencies?: Record<string, string>; devDependencies?: Record<string, string>;
                    scripts?: Record<string, string>;
                  };
                  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
                  if (allDeps["next"]) techStack.push("Next.js");
                  else if (allDeps["react"]) techStack.push("React");
                  if (allDeps["vue"]) techStack.push("Vue");
                  if (allDeps["svelte"] || allDeps["@sveltejs/kit"]) techStack.push("Svelte");
                  if (allDeps["@angular/core"]) techStack.push("Angular");
                  if (allDeps["express"]) techStack.push("Express");
                  if (allDeps["fastify"]) techStack.push("Fastify");
                  if (allDeps["tailwindcss"]) techStack.push("Tailwind");
                  if (allDeps["electron"]) techStack.push("Electron");
                  if (allDeps["react-native"]) techStack.push("React Native");
                  if (allDeps["typescript"]) languages.push("TypeScript");
                  else languages.push("JavaScript");

                  if (fse(pj(fullPath, "pnpm-lock.yaml"))) packageManager = "pnpm";
                  else if (fse(pj(fullPath, "yarn.lock"))) packageManager = "yarn";
                  else if (fse(pj(fullPath, "bun.lockb"))) packageManager = "bun";
                  else packageManager = "npm";

                  if (pkg.scripts?.["dev"]) devCommand = `${packageManager} run dev`;
                  else if (pkg.scripts?.["start"]) devCommand = `${packageManager} run start`;
                } catch { /* bad package.json */ }
              }

              if (fse(pj(fullPath, "requirements.txt")) || fse(pj(fullPath, "pyproject.toml"))) {
                languages.push("Python");
                if (packageManager === "unknown") packageManager = fse(pj(fullPath, "pyproject.toml")) ? "poetry" : "pip";
                if (fse(pj(fullPath, "manage.py"))) { techStack.push("Django"); devCommand = devCommand ?? "python manage.py runserver"; }
              }
              if (fse(pj(fullPath, "go.mod"))) { languages.push("Go"); if (packageManager === "unknown") packageManager = "go"; devCommand = devCommand ?? "go run ."; }
              if (fse(pj(fullPath, "Cargo.toml"))) { languages.push("Rust"); if (packageManager === "unknown") packageManager = "cargo"; devCommand = devCommand ?? "cargo run"; }
              if (fse(pj(fullPath, "pom.xml")) || fse(pj(fullPath, "build.gradle"))) {
                languages.push("Java");
                if (packageManager === "unknown") packageManager = fse(pj(fullPath, "build.gradle")) ? "gradle" : "maven";
              }

              const hasAgentSystem = fse(pj(fullPath, "ai-agents")) || fse(pj(fullPath, ".claude", "agents"));

              let gitBranch = "main";
              try { gitBranch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: fullPath, encoding: "utf-8", timeout: 3000 }).trim(); } catch { /* default */ }

              let lastCommit = "";
              let lastModified = 0;
              try {
                const ct = execSync("git log -1 --format=%ci", { cwd: fullPath, encoding: "utf-8", timeout: 3000 }).trim();
                lastModified = new Date(ct).getTime();
                const dm = Math.floor((Date.now() - lastModified) / 60000);
                if (dm < 60) lastCommit = `${dm}m ago`;
                else if (dm < 1440) lastCommit = `${Math.floor(dm / 60)}h ago`;
                else lastCommit = `${Math.floor(dm / 1440)}d ago`;
              } catch { lastCommit = "unknown"; }

              projects.push({ name: entry, path: fullPath, techStack, languages: languages.length > 0 ? languages : ["Unknown"], packageManager, devCommand, hasAgentSystem, gitBranch, lastCommit, lastModified });
            } catch { /* skip */ }
          }
        } catch { /* skip */ }
      }

      projects.sort((a, b) => b.lastModified - a.lastModified);
      res.json({ projects });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // --- Next.js catch-all ---
  app.all("/{*path}", (req, res) => {
    return handle(req, res);
  });

  // Listen on :: to accept both IPv4 and IPv6 connections.
  // macOS resolves "localhost" to ::1 (IPv6). Binding only to
  // 127.0.0.1 causes browser WebSocket connections to fail.
  server.listen(port, "::", () => {
    // eslint-disable-next-line no-console
    console.log(`Agent Studio running on http://localhost:${port}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server:", err);
  process.exit(1);
});
