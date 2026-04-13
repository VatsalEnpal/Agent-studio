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
import {
  getDevServers,
  startDevServer,
  stopDevServer,
  addCustomServer,
  removeCustomServer,
} from "./dev-servers.js";
import { execSync, exec } from "node:child_process";
import {
  whichCommand,
  isAllowedPath,
  killProcess as platformKill,
  openInOS,
  openTerminal,
  openVSCode,
  getDiskUsage,
  isSchedulerLoaded,
  loadScheduler,
  unloadScheduler,
  IS_MAC,
  findListeningPorts,
  getProcessCwd,
} from "./platform.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { SessionMeta, WsMessage } from "./types.js";
import { WorkflowManager } from "./workflows/index.js";
import { RoomManager } from "./rooms.js";
import type { RoomMessage } from "./rooms.js";
import { roomsRoutes } from "./routes/rooms.js";
import { SdkSessionManager } from "./sdk-session.js";
import {
  getConfig,
  loadConfig,
  saveConfig,
  generateDefaultConfig,
  reloadConfig,
  getAgentSystemPath,
  getMainProjectDir,
  resolvePath,
  type AgentConfig,
  type WorkflowConfig,
} from "./config.js";
import { scaffoldAgentSystem, previewScaffold } from "./scaffold.js";
import type { ScaffoldOptions } from "./scaffold.js";
import { AutomationEngine, AUTOMATION_TEMPLATES } from "./automations.js";
import type { Automation } from "./automations.js";
import {
  generateAgents,
  generateAgentsWithClaudeMd,
  writeAgentFiles,
  isClaudeCliAvailable,
  refreshClaudeCliCheck,
  previewAgents,
  getGenerationStatus,
} from "./agent-generator.js";
import type { ProjectAnalysis } from "./agent-generator.js";
import { analyzeProject as analyzeProjectEnhanced } from "./project-analyzer.js";
import type { ProjectProfile } from "./project-analyzer.js";
import { suggestAutomations } from "./automation-suggestions.js";
import {
  AUTOMATION_TEMPLATES as RICH_TEMPLATES,
  getTemplate,
  fillPromptTemplate,
} from "./automation-templates.js";
import { writeClaudeMd } from "./claudemd-generator.js";
import { broadcast } from "./ws/broadcast.js";

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

  // --- Health endpoint (works even before Next.js is ready) ---
  const serverStartTime = Date.now();
  app.get("/api/health", (_req, res) => {
    const sessions = terminalManager.listSessions();
    res.json({
      status: "ok",
      uptime: Math.floor((Date.now() - serverStartTime) / 1000),
      activeSessions: sessions.filter((s: { status: string }) => s.status === "active").length,
      totalSessions: sessions.length,
      wsClients: wss.clients.size,
      memoryUsage: process.memoryUsage().heapUsed,
      timestamp: new Date().toISOString(),
    });
  });
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
          {
            id: "orchestrator",
            name: "orchestrator",
            description: "Coordinates agent teams and delegates work",
          },
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
    broadcast(wss, {
      type: event.type as WsMessage["type"],
      payload: event.payload,
    } satisfies WsMessage);
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
      const updated = automationEngine.updateAutomation(
        req.params["id"],
        req.body as Partial<Automation>,
      );
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

  // --- Rich Automation Templates API (with prompt templates + applicability) ---
  app.get("/api/automation-templates/rich", (_req, res) => {
    res.json(RICH_TEMPLATES);
  });

  // --- Automation Suggestions API ---
  app.get("/api/automation-suggestions", (req, res) => {
    try {
      const projectPath = req.query["project"] as string | undefined;
      if (!projectPath) {
        res.status(400).json({ error: "Missing 'project' query parameter" });
        return;
      }
      const validPath = validateProjectPath(projectPath);
      if (!validPath) {
        res.status(400).json({ error: "Invalid project path" });
        return;
      }
      const profile = analyzeProjectEnhanced(validPath);
      const suggestions = suggestAutomations(profile, validPath);
      res.json({
        profile: {
          name: profile.name,
          languages: profile.languages,
          frameworks: profile.frameworks,
        },
        suggestions,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // --- Create Automation from Template ---
  app.post("/api/automations/from-template", (req, res) => {
    try {
      const { templateId, projectPath, schedule, model } = req.body as {
        templateId?: string;
        projectPath?: string;
        schedule?: string;
        model?: "opus" | "sonnet" | "haiku";
      };
      if (!templateId || !projectPath) {
        res.status(400).json({ error: "Missing templateId or projectPath" });
        return;
      }
      const validPath = validateProjectPath(projectPath);
      if (!validPath) {
        res.status(400).json({ error: "Invalid project path" });
        return;
      }
      const template = getTemplate(templateId);
      if (!template) {
        res.status(404).json({ error: `Template '${templateId}' not found` });
        return;
      }
      const prompt = fillPromptTemplate(template.promptTemplate, { projectPath: validPath });
      const auto = automationEngine.addAutomation({
        name: template.name,
        description: template.description,
        schedule: schedule ?? template.defaultSchedule,
        agent: "none",
        model: model ?? template.defaultModel,
        prompt,
        enabled: true,
      });
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

  // --- Generate Automation from Natural Language Description ---
  app.post("/api/automations/from-description", async (req, res) => {
    try {
      const { description, projectPath } = req.body as {
        description?: string;
        projectPath?: string;
      };
      if (!description || !projectPath) {
        res.status(400).json({ error: "Missing description or projectPath" });
        return;
      }

      // Use Claude --print to generate an automation config from the description
      const generationPrompt = `You are an automation configuration generator for a developer tool called Agent Studio.

The user wants to create an automation for their project at: ${projectPath}
Their description: "${description}"

Generate a JSON automation configuration. The automation will run Claude headlessly with the prompt you write.

Output ONLY valid JSON (no markdown fences, no explanation):
{
  "name": "Short name for this automation (2-4 words)",
  "description": "One sentence description",
  "schedule": "every 2h|every 6h|daily|weekly",
  "model": "haiku|sonnet|opus",
  "prompt": "The detailed prompt that Claude will execute. Include specific commands to run, what to check, and the expected output format. Reference the project path: ${projectPath}"
}

Choose the schedule and model based on the task:
- Lightweight checks (lint, type check): haiku, every 2h
- Code review, security: sonnet, every 6h or daily
- Complex analysis, refactoring suggestions: opus, daily or weekly`;

      const { spawn: spawnProc } = await import("node:child_process");

      const output = await new Promise<string>((resolve) => {
        try {
          const proc = spawnProc("claude", ["--print", "--model", "haiku", generationPrompt], {
            cwd: projectPath,
            env: { ...process.env },
            timeout: 60_000,
          });
          let stdout = "";
          proc.stdout.on("data", (data: Buffer) => {
            stdout += data.toString("utf-8");
          });
          proc.on("close", () => resolve(stdout));
          proc.on("error", () => resolve(""));
        } catch {
          resolve("");
        }
      });

      if (!output.trim()) {
        res
          .status(500)
          .json({ error: "Failed to generate automation — Claude CLI may not be available" });
        return;
      }

      // Try to parse the JSON from the output
      let config: {
        name: string;
        description: string;
        schedule: string;
        model: string;
        prompt: string;
      };
      try {
        // Strip any markdown fences if present
        const cleaned = output
          .replace(/```json?\n?/g, "")
          .replace(/```\n?/g, "")
          .trim();
        config = JSON.parse(cleaned) as typeof config;
      } catch {
        res.status(500).json({ error: "Failed to parse generated automation config", raw: output });
        return;
      }

      // Return the generated config for user approval (don't auto-create)
      res.json({
        generated: true,
        automation: {
          name: config.name || "Custom Automation",
          description: config.description || description,
          schedule: config.schedule || "daily",
          agent: "none",
          model:
            config.model === "opus" || config.model === "sonnet" || config.model === "haiku"
              ? config.model
              : "sonnet",
          prompt: config.prompt || description,
          enabled: true,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // --- CLAUDE.md Generator API ---
  app.post("/api/generate-claudemd", (req, res) => {
    try {
      const { projectPath, preserveExisting } = req.body as {
        projectPath?: string;
        preserveExisting?: boolean;
      };
      if (!projectPath) {
        res.status(400).json({ error: "Missing projectPath" });
        return;
      }
      const validPath = validateProjectPath(projectPath);
      if (!validPath) {
        res.status(400).json({ error: "Invalid project path" });
        return;
      }

      // Analyze the project
      const profile = analyzeProjectEnhanced(validPath);

      // Check for generated agents
      const agentsDir = path.join(validPath, ".claude", "agents");
      const agents: Array<{
        id: string;
        name: string;
        description: string;
        model: "opus" | "sonnet" | "haiku";
        mdContent: string;
      }> = [];
      if (fs.existsSync(agentsDir)) {
        try {
          const files = fs.readdirSync(agentsDir).filter((f: string) => f.endsWith(".md"));
          for (const file of files) {
            agents.push({
              id: path.basename(file, ".md"),
              name: path.basename(file, ".md"),
              description: `Agent from ${profile.name}`,
              model: "sonnet",
              mdContent: "",
            });
          }
        } catch {
          // Skip if can't read
        }
      }

      const result = writeClaudeMd({
        analysis: profile,
        agents,
        projectPath: validPath,
        preserveExisting,
      });

      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
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
        } catch {
          /* ignore */
        }
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
  app.get("/api/agents/cli-status", (req, res) => {
    try {
      // ?refresh=1 forces a re-check (e.g. after user installs CLI)
      if (req.query.refresh) {
        res.json({ available: refreshClaudeCliCheck() });
      } else {
        res.json({ available: isClaudeCliAvailable() });
      }
    } catch {
      res.json({ available: false });
    }
  });

  // Enhanced project analysis (returns full ProjectProfile)
  const handleAnalyze: express.RequestHandler = (req, res) => {
    try {
      const body = req.body as { projectPath?: string; path?: string };
      const projectPath = body.projectPath ?? body.path;
      if (!projectPath) {
        res.status(400).json({ error: "Missing projectPath" });
        return;
      }
      const validPath = validateProjectPath(projectPath);
      if (!validPath) {
        res.status(400).json({ error: "Invalid project path" });
        return;
      }
      const profile = analyzeProjectEnhanced(validPath);
      res.json(profile);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  };
  app.post("/api/agents/analyze", handleAnalyze);
  app.post("/api/analyze-project", handleAnalyze);

  // Generate agents (with optional userDescription and teamSize)
  app.post("/api/agents/generate", async (req, res) => {
    try {
      const { analysis, projectPath, userDescription, teamSize } = req.body as {
        analysis?: ProjectProfile;
        projectPath?: string;
        userDescription?: string;
        teamSize?: number;
      };
      if (!analysis || !projectPath) {
        res.status(400).json({ error: "Missing analysis or projectPath" });
        return;
      }
      const result = await generateAgentsWithClaudeMd(
        analysis,
        projectPath,
        userDescription,
        teamSize,
      );
      // Return agents array for backward compatibility, include claudeMd as extra field
      res.json({ agents: result.agents, claudeMd: result.claudeMd });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // Preview agents (same as generate but no file writes)
  const handlePreview: express.RequestHandler = async (req, res) => {
    try {
      const { projectPath, userDescription, teamSize } = req.body as {
        projectPath?: string;
        userDescription?: string;
        teamSize?: number;
      };
      if (!projectPath) {
        res.status(400).json({ error: "Missing projectPath" });
        return;
      }
      const validPath = validateProjectPath(projectPath);
      if (!validPath) {
        res.status(400).json({ error: "Invalid project path" });
        return;
      }
      const profile = analyzeProjectEnhanced(validPath);
      const result = await previewAgents(profile, userDescription, teamSize);
      res.json({ agents: result.agents, claudeMd: result.claudeMd, profile });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  };
  app.post("/api/agents/preview", handlePreview);
  app.post("/api/generate-agents/preview", handlePreview);

  // Generation status polling
  app.get("/api/agents/generate/status", (_req, res) => {
    res.json(getGenerationStatus());
  });

  // Apply agents (write files to disk)
  app.post("/api/agents/apply", (req, res) => {
    try {
      const { agents, projectPath, claudeMd } = req.body as {
        agents?: Array<{
          id: string;
          name: string;
          description: string;
          model: string;
          mdContent: string;
          rulesFiles?: Array<{ filename: string; content: string }>;
        }>;
        projectPath?: string;
        claudeMd?: string;
      };
      if (!agents || !projectPath || !Array.isArray(agents)) {
        res.status(400).json({ error: "Missing agents array or projectPath" });
        return;
      }
      const result = writeAgentFiles(
        agents.map((a) => ({
          ...a,
          model:
            a.model === "opus" || a.model === "sonnet" || a.model === "haiku"
              ? a.model
              : ("sonnet" as const),
        })),
        projectPath,
        claudeMd,
      );
      res.status(201).json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // Create a single agent (simple endpoint for the Create Agent dialog)
  app.post("/api/agents/create", (req, res) => {
    try {
      const { id, name, description, mdContent, projectPath } = req.body as {
        id?: string;
        name?: string;
        description?: string;
        mdContent?: string;
        projectPath?: string;
      };
      if (!id || !mdContent) {
        res.status(400).json({ error: "Missing required fields: id, mdContent" });
        return;
      }
      const model = "sonnet" as const;
      const targetPath = projectPath || getConfig().defaults?.workingDirectory || process.cwd();
      const result = writeAgentFiles(
        [{ id, name: name ?? id, description: description ?? "", model, mdContent }],
        targetPath,
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
      const { name, command, args, cwd, cols, rows, meta } = req.body as {
        name?: string;
        command?: string;
        args?: string[];
        cwd?: string;
        cols?: number;
        rows?: number;
        meta?: SessionMeta;
      };

      if (!name || typeof name !== "string") {
        res.status(400).json({ error: "Missing required field: name" });
        return;
      }

      const session = terminalManager.createSession({
        name,
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

  app.get("/api/sessions/:id/buffer", (req, res) => {
    const buffer = terminalManager.getSessionBuffer(req.params["id"]);
    if (buffer === null) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json({ buffer });
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
        // Return empty usage instead of 404 — CLI-discovered sessions
        // won't be in the server's session map but the frontend still
        // asks for their usage. A 404 here causes an error storm when
        // the History tab is open.
        res.json({
          cost: null,
          tokens: null,
          model: null,
          modelShort: null,
        });
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
    broadcast(wss, {
      type: "git-update",
      payload: repos,
    } satisfies WsMessage);
  });
  gitWatcher.start(30_000);

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

  // --- Git details (commits, changed files, branches for a repo) ---
  app.get("/api/git/details", (req, res) => {
    try {
      const repoPath = req.query["path"] as string | undefined;
      if (!repoPath) {
        res.status(400).json({ error: "Missing 'path' query parameter" });
        return;
      }
      if (!fs.existsSync(repoPath) || !fs.statSync(repoPath).isDirectory()) {
        res.status(400).json({ error: "Invalid directory path" });
        return;
      }

      // Current branch
      let currentBranch = "unknown";
      try {
        currentBranch = execSync("git rev-parse --abbrev-ref HEAD", {
          cwd: repoPath,
          encoding: "utf-8",
          timeout: 5000,
        }).trim();
      } catch {
        // ignore
      }

      // Branches with ahead/behind relative to main/master
      let branchEntries: {
        name: string;
        isCurrent: boolean;
        lastCommit: string;
        ahead?: number;
        behind?: number;
      }[] = [];
      try {
        const branchOutput = execSync("git branch --format='%(refname:short)'", {
          cwd: repoPath,
          encoding: "utf-8",
          timeout: 5000,
        }).trim();
        if (branchOutput) {
          const branchNames = branchOutput
            .split("\n")
            .map((b) => b.trim().replace(/^'|'$/g, ""))
            .filter((b) => b.length > 0);

          // Detect main branch name (main or master)
          const mainBranch = branchNames.includes("main")
            ? "main"
            : branchNames.includes("master")
              ? "master"
              : null;

          branchEntries = branchNames.map((name) => {
            const isCurrent = name === currentBranch;
            let lastCommit = "";
            try {
              lastCommit = execSync(`git log -1 --format="%s" ${JSON.stringify(name)}`, {
                cwd: repoPath,
                encoding: "utf-8",
                timeout: 5000,
              }).trim();
            } catch {
              // ignore
            }

            let ahead: number | undefined;
            let behind: number | undefined;
            if (mainBranch && name !== mainBranch) {
              try {
                const aheadStr = execSync(
                  `git rev-list --count ${JSON.stringify(mainBranch)}..${JSON.stringify(name)}`,
                  { cwd: repoPath, encoding: "utf-8", timeout: 5000 },
                ).trim();
                ahead = parseInt(aheadStr, 10) || 0;
              } catch {
                // ignore
              }
              try {
                const behindStr = execSync(
                  `git rev-list --count ${JSON.stringify(name)}..${JSON.stringify(mainBranch)}`,
                  { cwd: repoPath, encoding: "utf-8", timeout: 5000 },
                ).trim();
                behind = parseInt(behindStr, 10) || 0;
              } catch {
                // ignore
              }
            }

            return { name, isCurrent, lastCommit, ahead, behind };
          });
        }
      } catch {
        // ignore
      }

      // Recent commits (last 20)
      let commits: { hash: string; message: string; author: string; date: string }[] = [];
      try {
        const logOutput = execSync('git log -20 --format="%H|||%s|||%an|||%ar"', {
          cwd: repoPath,
          encoding: "utf-8",
          timeout: 10000,
        }).trim();
        if (logOutput) {
          commits = logOutput.split("\n").map((line) => {
            const [hash = "", message = "", author = "", date = ""] = line.split("|||");
            return { hash, message, author, date };
          });
        }
      } catch {
        // ignore
      }

      // Changed files
      let changedFiles: { path: string; status: string }[] = [];
      try {
        const statusOutput = execSync("git status --porcelain", {
          cwd: repoPath,
          encoding: "utf-8",
          timeout: 5000,
        }).trim();
        if (statusOutput) {
          changedFiles = statusOutput.split("\n").map((line) => {
            const status = line.substring(0, 2).trim();
            const filePath = line.substring(3);
            return { path: filePath, status };
          });
        }
      } catch {
        // ignore
      }

      res.json({
        commits,
        changedFiles,
        branches: branchEntries,
        currentBranch,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // --- Git create branch ---
  app.post("/api/git/branch", (req, res) => {
    try {
      const { path: repoPath, name } = req.body as {
        path?: string;
        name?: string;
      };
      if (!repoPath || !name) {
        res.status(400).json({ error: "Missing 'path' or 'name'" });
        return;
      }
      if (!fs.existsSync(repoPath) || !fs.statSync(repoPath).isDirectory()) {
        res.status(400).json({ error: "Invalid directory path" });
        return;
      }

      // Validate branch name (no spaces, no special chars except - _ / .)
      if (!/^[\w./-]+$/.test(name)) {
        res.status(400).json({ error: "Invalid branch name" });
        return;
      }

      execSync(`git checkout -b ${JSON.stringify(name)}`, {
        cwd: repoPath,
        encoding: "utf-8",
        timeout: 10000,
      });
      res.json({ ok: true, branch: name });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // --- Git checkout (switch branch) ---
  app.post("/api/git/checkout", (req, res) => {
    try {
      const { path: repoPath, branch } = req.body as {
        path?: string;
        branch?: string;
      };
      if (!repoPath || !branch) {
        res.status(400).json({ error: "Missing 'path' or 'branch'" });
        return;
      }
      if (!fs.existsSync(repoPath) || !fs.statSync(repoPath).isDirectory()) {
        res.status(400).json({ error: "Invalid directory path" });
        return;
      }

      // Check for uncommitted changes first
      const statusOutput = execSync("git status --porcelain", {
        cwd: repoPath,
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
      if (statusOutput) {
        res.json({
          ok: false,
          error: "uncommitted changes",
          dirty: true,
        });
        return;
      }

      execSync(`git checkout ${JSON.stringify(branch)}`, {
        cwd: repoPath,
        encoding: "utf-8",
        timeout: 10000,
      });
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/git/pr", async (req, res) => {
    try {
      const { repo, sourceBranch, targetBranch, title, description } = req.body as {
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

      execSync("git add -u", {
        cwd: repo,
        encoding: "utf-8",
        timeout: 10000,
      });
      const output = execSync(`git commit -m ${JSON.stringify(commitMsg)}`, {
        cwd: repo,
        encoding: "utf-8",
        timeout: 10000,
      }).trim();
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
      const { repo, app: appChoice } = req.body as {
        repo?: string;
        app?: string;
      };
      if (!repo || typeof repo !== "string") {
        res.status(400).json({ error: "Missing repo path" });
        return;
      }
      // Validate path exists and is a directory
      if (!fs.existsSync(repo) || !fs.statSync(repo).isDirectory()) {
        res.status(400).json({ error: "Invalid directory path" });
        return;
      }
      // Use cross-platform helpers to open directories
      if (appChoice === "terminal") {
        openTerminal(repo, (err) => {
          if (err) res.status(500).json({ error: "Failed to open terminal" });
          else res.json({ ok: true });
        });
      } else if (appChoice === "finder") {
        openInOS(repo, undefined, (err) => {
          if (err) res.status(500).json({ error: "Failed to open file manager" });
          else res.json({ ok: true });
        });
      } else if (appChoice === "code") {
        openVSCode(repo, (err) => {
          if (err) res.status(500).json({ error: "Failed to open VS Code" });
          else res.json({ ok: true });
        });
      } else {
        openInOS(repo, undefined, (err) => {
          if (err) res.status(500).json({ error: "Failed to open" });
          else res.json({ ok: true });
        });
      }
    } catch {
      res.status(500).json({ error: "Failed to open" });
    }
  });

  // --- Workflow API ---
  const workflowManager = new WorkflowManager();

  // --- /api/sprints — maps workflow runs to Sprint objects for the Sprints page ---
  /** Map raw WorkflowFlow[] into Sprint[] for the frontend. */
  function flowsToSprints(
    flows: Awaited<ReturnType<typeof workflowManager.getFlows>>,
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

  app.get("/api/sprints", async (_req, res) => {
    try {
      const flows = await workflowManager.getFlows();
      res.json(flowsToSprints(flows));
    } catch {
      res.json([]);
    }
  });

  // --- Create sprint endpoint ---
  app.post("/api/sprints/create", async (req, res) => {
    try {
      const { name, goal, agents, cwd, pipeline } = req.body as {
        name?: string;
        goal?: string;
        agents?: string[];
        cwd?: string;
        pipeline?: Array<{ id: string; agent: string; name: string; description: string }>;
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

      // Add to workflow manager's in-memory flows
      const flows = await workflowManager.getFlows();
      flows.unshift(flow as never);

      // Broadcast update
      broadcast(wss, {
        type: "workflow-update",
        payload: flowsToSprints(flows),
      } satisfies WsMessage);

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

  // --- Gate approval endpoint ---
  app.post("/api/sprints/:sprintId/gates/:gateId/approve", async (req, res) => {
    try {
      const { sprintId, gateId } = req.params as { sprintId: string; gateId: string };
      // Approve works via the sprint-planning workflow's state file
      const { getAgentSystemPath } = await import("./config.js");
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

  // --- Sprint pause/resume/cancel endpoints ---
  app.post("/api/sprints/:sprintId/pause", async (req, res) => {
    try {
      const { sprintId } = req.params as { sprintId: string };
      const { getAgentSystemPath } = await import("./config.js");
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

  app.post("/api/sprints/:sprintId/resume", async (req, res) => {
    try {
      const { sprintId } = req.params as { sprintId: string };
      const { getAgentSystemPath } = await import("./config.js");
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

  app.post("/api/sprints/:sprintId/cancel", async (req, res) => {
    try {
      const { sprintId } = req.params as { sprintId: string };
      const { getAgentSystemPath } = await import("./config.js");
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

  // --- Sprint spec endpoint ---
  app.get("/api/sprints/:sprintId/spec", async (req, res) => {
    try {
      const { sprintId } = req.params as { sprintId: string };
      const { getAgentSystemPath } = await import("./config.js");
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
      const run = await workflowManager.getRun(req.params["flowId"], req.params["runId"]);
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
      broadcast(wss, {
        type: "workflow-update",
        payload: flowsToSprints(flows),
      } satisfies WsMessage);

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

      // Create a new run by adding to the flow's config
      // For custom workflows, we create a run entry and broadcast
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

      // We don't persist runs (they're ephemeral), just broadcast
      // Add to the in-memory flow
      flow.runs.unshift(run);

      const flows = await workflowManager.getFlows();
      // Inject the new run into the matching flow
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

  // Broadcast workflow updates on sprint file changes
  fileWatcher.onUpdate(() => {
    void workflowManager.getFlows().then((flows) => {
      broadcast(wss, {
        type: "workflow-update",
        payload: flowsToSprints(flows),
      } satisfies WsMessage);
    });
  });

  // --- PMO Scheduler API ---
  const PMO_PLIST = `${os.homedir()}/Library/LaunchAgents/com.agent-studio.pmo-scan.plist`;
  const PMO_SCAN_SCRIPT = getAgentSystemPath("tools/pmo-scan.sh") ?? "";

  app.get("/api/pmo/status", (_req, res) => {
    try {
      const isLoaded = isSchedulerLoaded("agent-studio");

      // Read last scan from scan_log.md
      let lastScan: string | null = null;
      let lastStatus: string | null = null;
      try {
        const scanEntries = readScanLog() as unknown as Promise<
          Array<{ timestamp: string; status: string }>
        >;
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
      const isLoaded = isSchedulerLoaded("agent-studio");

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
      if (!IS_MAC) {
        res.status(501).json({ error: "PMO scheduler is only supported on macOS (launchd)" });
        return;
      }
      loadScheduler(PMO_PLIST);
      res.json({ ok: true, status: "started" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/pmo/stop", (_req, res) => {
    try {
      if (!IS_MAC) {
        res.status(501).json({ error: "PMO scheduler is only supported on macOS (launchd)" });
        return;
      }
      unloadScheduler(PMO_PLIST);
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
      const killed = platformKill(pid);
      if (!killed) {
        res.status(500).json({ error: "Failed to kill process" });
        return;
      }
      res.json({ ok: true, pid });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // --- All Listening Ports API (for Dev Servers view) ---
  app.get("/api/servers/all", (_req, res) => {
    try {
      const selfPid = process.pid;
      const selfPort = parseInt(process.env["PORT"] ?? "8080", 10);
      const raw = findListeningPorts();
      const seen = new Map<
        number,
        { pid: number; port: number; command: string; cwd: string; isSelf: boolean }
      >();

      for (const entry of raw) {
        // Deduplicate by pid — take the first (lowest) port
        if (seen.has(entry.pid)) continue;
        const cwd = getProcessCwd(entry.pid) ?? "unknown";
        const isSelf = entry.pid === selfPid || entry.port === selfPort;
        seen.set(entry.pid, {
          pid: entry.pid,
          port: entry.port,
          command: entry.command ?? "unknown",
          cwd,
          isSelf,
        });
      }

      res.json(Array.from(seen.values()).sort((a, b) => a.port - b.port));
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

        // Extract cost from JSONL usage data
        let cost: string | null = null;
        try {
          const usage = getUsageBySessionId(s.id);
          if (usage && usage.totalCost > 0) {
            cost = formatCost(usage.totalCost);
          }
        } catch {
          // Best effort — skip if usage parsing fails
        }

        return {
          id: s.id,
          project: s.project,
          projectShort,
          modified: s.modified,
          date: new Date(s.modified).toISOString(),
          agent,
          preview,
          cost,
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
        learning: "learnings",
        learnings: "learnings",
        correction: "corrections",
        corrections: "corrections",
        decision: "decisions",
        decisions: "decisions",
        knowledge: "knowledge",
        "human-input": "human-inputs",
        "human-inputs": "human-inputs",
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
        const index = JSON.parse(rawIndex) as {
          entries: Record<string, unknown>[];
          total_entries: number;
          [k: string]: unknown;
        };
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
        const index = JSON.parse(rawIndex) as {
          entries: Record<string, unknown>[];
          total_entries: number;
          [k: string]: unknown;
        };
        const idx = index.entries.findIndex((e) => e["file"] === filePath);
        if (idx >= 0) {
          if (body.title !== undefined) index.entries[idx]!["title"] = body.title;
          if (body.tags !== undefined) index.entries[idx]!["tags"] = body.tags;
          if (body.pinned !== undefined) index.entries[idx]!["pinned"] = body.pinned;
          if (body.content?.lesson) index.entries[idx]!["key_point"] = body.content.lesson;
          else if (body.content?.observation)
            index.entries[idx]!["key_point"] = body.content.observation;
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
        const index = JSON.parse(rawIndex) as {
          entries: Record<string, unknown>[];
          total_entries: number;
          [k: string]: unknown;
        };
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
        const index = JSON.parse(rawIndex) as {
          entries: Record<string, unknown>[];
          total_entries: number;
          [k: string]: unknown;
        };
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
  app.get("/api/system/stats", async (_req, res) => {
    try {
      // CPU usage: calculate from os.cpus()
      const cpus = os.cpus();
      let totalIdle = 0;
      let totalTick = 0;
      for (const cpu of cpus) {
        totalIdle += cpu.times.idle;
        totalTick +=
          cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
      }
      const cpuUsage = totalTick > 0 ? (1 - totalIdle / totalTick) * 100 : 0;

      // Memory — on macOS, show memory pressure (active + wired + compressed)
      // instead of raw usage, which always appears ~99% due to disk cache.
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;

      let pressureUsedGB = Math.round((usedMem / (1024 * 1024 * 1024)) * 100) / 100;
      let pressurePercent = Math.round((usedMem / totalMem) * 1000) / 10;
      let pressureLevel: "normal" | "warn" | "critical" = "normal";

      if (IS_MAC) {
        try {
          const { promisify } = await import("node:util");
          const execPromise = promisify(exec);
          const { stdout: vmOutput } = await execPromise("vm_stat", {
            encoding: "utf-8",
            timeout: 3000,
          });
          const pageSizeMatch = vmOutput.match(/page size of (\d+) bytes/);
          const ps = pageSizeMatch ? parseInt(pageSizeMatch[1]!, 10) : 16384;

          const getPages = (label: string): number => {
            const m = vmOutput.match(new RegExp(`${label}:\\s+(\\d+)`));
            return m ? parseInt(m[1]!, 10) : 0;
          };

          const activePages = getPages("Pages active");
          const wiredPages = getPages("Pages wired down");
          const compressedPages = getPages("Pages occupied by compressor");

          const appMemBytes = (activePages + wiredPages + compressedPages) * ps;
          pressureUsedGB = Math.round((appMemBytes / (1024 * 1024 * 1024)) * 100) / 100;
          pressurePercent = Math.round((appMemBytes / totalMem) * 1000) / 10;

          if (pressurePercent > 80) pressureLevel = "critical";
          else if (pressurePercent > 60) pressureLevel = "warn";
        } catch {
          // Fall back to raw os.freemem values
        }
      } else {
        if (pressurePercent > 90) pressureLevel = "critical";
        else if (pressurePercent > 75) pressureLevel = "warn";
      }

      // Disk
      let diskUsed = 0;
      let diskTotal = 0;
      let diskPercentage = 0;
      const diskInfo = getDiskUsage();
      if (diskInfo) {
        diskUsed = diskInfo.used;
        diskTotal = diskInfo.total;
        diskPercentage = diskInfo.percentage;
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
          used: pressureUsedGB,
          total: Math.round((totalMem / (1024 * 1024 * 1024)) * 100) / 100,
          percentage: pressurePercent,
          pressure: pressureLevel,
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

  // --- System Info API (git branch, node version, etc.) ---
  app.get("/api/system/info", (_req, res) => {
    try {
      let branch = "unknown";
      let commitHash = "unknown";
      try {
        branch = execSync("git rev-parse --abbrev-ref HEAD", {
          encoding: "utf-8",
          timeout: 3000,
          cwd: process.cwd(),
        }).trim();
        commitHash = execSync("git rev-parse --short HEAD", {
          encoding: "utf-8",
          timeout: 3000,
          cwd: process.cwd(),
        }).trim();
      } catch {
        // Not a git repo or git not available
      }

      res.json({
        branch,
        commitHash,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
        uptime: Math.round(process.uptime()),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // --- Dev Servers API ---
  app.get("/api/dev-servers", (_req, res) => {
    try {
      const servers = getDevServers();
      res.json(servers);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/dev-servers/start", async (req, res) => {
    try {
      const { cwd, command } = req.body as { cwd: string; command: string };
      if (!cwd || !command) {
        res.status(400).json({ error: "cwd and command are required" });
        return;
      }
      const validPath = validateProjectPath(cwd);
      if (!validPath) {
        res.status(403).json({ error: "Path not allowed" });
        return;
      }
      const result = await startDevServer(validPath, command);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/dev-servers/:pid/stop", (req, res) => {
    try {
      const pid = parseInt(req.params.pid, 10);
      if (isNaN(pid) || pid <= 0) {
        res.status(400).json({ error: "Invalid PID" });
        return;
      }
      const success = stopDevServer(pid);
      res.json({ ok: success });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/dev-servers/custom", (req, res) => {
    try {
      const { name, port, command, cwd, autoStart } = req.body as {
        name?: string;
        port?: number;
        command?: string;
        cwd?: string;
        autoStart?: boolean;
      };
      if (!name || !command || !cwd) {
        res.status(400).json({ error: "name, command, and cwd are required" });
        return;
      }
      addCustomServer({
        name,
        cwd,
        command,
        port: port ?? undefined,
        autoStart: autoStart ?? false,
      });
      const servers = getDevServers();
      res.json(servers);
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
        claudeCode: { installed: false } as {
          installed: boolean;
          version?: string;
          path?: string;
          authenticated?: boolean;
        },
        node: { installed: true, version: process.version },
        git: { installed: false } as { installed: boolean; version?: string },
      };
      const blockers: string[] = [];

      // Check Claude Code CLI
      try {
        const claudePath = whichCommand("claude");
        if (!claudePath) throw new Error("not found");
        checks.claudeCode.installed = true;
        checks.claudeCode.path = claudePath;
        try {
          const versionOutput = execSync("claude --version", {
            encoding: "utf-8",
            timeout: 5000,
          }).trim();
          checks.claudeCode.version = versionOutput;
        } catch {
          // version check failed but CLI exists
        }
        const { join: joinPre } = require("node:path") as typeof import("node:path");
        const claudeDir = joinPre(os.homedir(), ".claude");
        const { existsSync: fsExistsPre } = require("node:fs") as typeof import("node:fs");
        checks.claudeCode.authenticated = fsExistsPre(claudeDir);
        if (!checks.claudeCode.authenticated) {
          blockers.push(
            "Claude Code is not authenticated. Run `claude` in your terminal and complete setup first.",
          );
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

  // --- Install Claude Code CLI ---
  app.post("/api/system/install-claude", async (_req, res) => {
    try {
      // Check if npm is available
      const npmPath = whichCommand("npm");
      if (!npmPath) {
        res.status(400).json({ error: "npm is not installed. Install Node.js first." });
        return;
      }

      // Run the install
      const result = execSync("npm install -g @anthropic-ai/claude-code 2>&1", {
        encoding: "utf-8",
        timeout: 120000,
      });

      // Verify it installed
      try {
        const version = execSync("claude --version 2>&1", {
          encoding: "utf-8",
          timeout: 5000,
        }).trim();
        res.json({ success: true, version, output: result });
      } catch {
        res.json({
          success: false,
          error: "Installed but claude command not found. You may need to restart your terminal.",
          output: result,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Installation failed";
      if (message.includes("EACCES") || message.includes("permission")) {
        res.status(403).json({
          error:
            "Permission denied. Try running Agent Studio with sudo, or install Claude Code manually:\n\nsudo npm install -g @anthropic-ai/claude-code",
          output: message,
        });
      } else {
        res.status(500).json({ error: message, output: message });
      }
    }
  });

  // --- System Detect API ---
  app.post("/api/system/detect", (_req, res) => {
    try {
      const {
        existsSync: fse,
        readdirSync: fsr,
        statSync: fss,
        readFileSync: fsrf,
        realpathSync: fsrp,
      } = require("node:fs") as typeof import("node:fs");
      const { join: pj } = require("node:path") as typeof import("node:path");
      const home = os.homedir();

      const searchDirs = [
        pj(home, "Code"),
        pj(home, "code"),
        pj(home, "Projects"),
        pj(home, "Documents"),
        pj(home, "Desktop"),
        pj(home, "repos"),
        pj(home, "dev"),
        pj(home, "workspace"),
        pj(home, "src"),
        pj(home, "work"),
      ];

      interface DetectedProject {
        name: string;
        path: string;
        techStack: string[];
        languages: string[];
        packageManager: string;
        devCommand?: string;
        hasAgentSystem: boolean;
        gitBranch: string;
        lastCommit: string;
        lastModified: number;
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
                    dependencies?: Record<string, string>;
                    devDependencies?: Record<string, string>;
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
                } catch {
                  /* bad package.json */
                }
              }

              if (fse(pj(fullPath, "requirements.txt")) || fse(pj(fullPath, "pyproject.toml"))) {
                languages.push("Python");
                if (packageManager === "unknown")
                  packageManager = fse(pj(fullPath, "pyproject.toml")) ? "poetry" : "pip";
                if (fse(pj(fullPath, "manage.py"))) {
                  techStack.push("Django");
                  devCommand = devCommand ?? "python manage.py runserver";
                }
              }
              if (fse(pj(fullPath, "go.mod"))) {
                languages.push("Go");
                if (packageManager === "unknown") packageManager = "go";
                devCommand = devCommand ?? "go run .";
              }
              if (fse(pj(fullPath, "Cargo.toml"))) {
                languages.push("Rust");
                if (packageManager === "unknown") packageManager = "cargo";
                devCommand = devCommand ?? "cargo run";
              }
              if (fse(pj(fullPath, "pom.xml")) || fse(pj(fullPath, "build.gradle"))) {
                languages.push("Java");
                if (packageManager === "unknown")
                  packageManager = fse(pj(fullPath, "build.gradle")) ? "gradle" : "maven";
              }

              const hasAgentSystem =
                fse(pj(fullPath, "ai-agents")) || fse(pj(fullPath, ".claude", "agents"));

              let gitBranch = "main";
              try {
                gitBranch = execSync("git rev-parse --abbrev-ref HEAD", {
                  cwd: fullPath,
                  encoding: "utf-8",
                  timeout: 3000,
                }).trim();
              } catch {
                /* default */
              }

              let lastCommit = "";
              let lastModified = 0;
              try {
                const ct = execSync("git log -1 --format=%ci", {
                  cwd: fullPath,
                  encoding: "utf-8",
                  timeout: 3000,
                }).trim();
                lastModified = new Date(ct).getTime();
                const dm = Math.floor((Date.now() - lastModified) / 60000);
                if (dm < 60) lastCommit = `${dm}m ago`;
                else if (dm < 1440) lastCommit = `${Math.floor(dm / 60)}h ago`;
                else lastCommit = `${Math.floor(dm / 1440)}d ago`;
              } catch {
                lastCommit = "unknown";
              }

              projects.push({
                name: entry,
                path: fullPath,
                techStack,
                languages: languages.length > 0 ? languages : ["Unknown"],
                packageManager,
                devCommand,
                hasAgentSystem,
                gitBranch,
                lastCommit,
                lastModified,
              });
            } catch {
              /* skip */
            }
          }
        } catch {
          /* skip */
        }
      }

      projects.sort((a, b) => b.lastModified - a.lastModified);
      res.json({ projects });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // Custom error handler — no stack traces in responses
  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      // eslint-disable-next-line no-console
      console.error("Server error:", err.message);
      res.status(500).json({ error: "Internal server error" });
    },
  );

  // --- Room routes (mounted via route module) ---
  app.use("/api/rooms", roomsRoutes(roomManager, sdkManager, wss));

  // --- Next.js catch-all (with loading page while compiling) ---
  let nextReady = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handle: (req: any, res: any, parsedUrl?: any) => Promise<void>;

  app.all("/{*path}", (req, res) => {
    if (nextReady) {
      return handle(req, res);
    }
    // Next.js still compiling — serve loading page for HTML requests
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

  // Start HTTP server IMMEDIATELY — API routes are ready now
  server.listen(port, "127.0.0.1", () => {
    // eslint-disable-next-line no-console
    console.log(`Agent Studio running on http://localhost:${port}`);
  });

  // Prepare Next.js in the background — doesn't block API routes
  const nextApp = next({ dev, hostname: "127.0.0.1", port });

  nextApp
    .prepare()
    .then(() => {
      handle = nextApp.getRequestHandler();
      nextUpgradeHandler = nextApp.getUpgradeHandler();
      nextReady = true;
      // eslint-disable-next-line no-console
      console.log("Next.js ready — UI is now serving");
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
