import { Router } from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import {
  getConfig,
  loadConfig,
  saveConfig,
  reloadConfig,
  generateDefaultConfig,
  getAgentSystemPath,
  resolvePath,
  getMainProjectDir,
} from "../config.js";
import { scaffoldAgentSystem, previewScaffold } from "../scaffold.js";
import type { ScaffoldOptions } from "../scaffold.js";
import type { AgentStudioConfig } from "../config.js";
import type { WorkflowManager } from "../workflows/index.js";

export function settingsRoutes(
  workflowManager: WorkflowManager,
  deps: {
    validateProjectPath: (p: string) => string | null;
  },
): Router {
  const router = Router();
  const SETTINGS_PATH = `${process.cwd()}/.settings.json`;
  const { validateProjectPath } = deps;

  // Config
  router.get("/config", (_req, res) => {
    const config = getConfig();
    res.json({
      homeDir: os.homedir(),
      cwd: process.cwd(),
      mainProjectDir: getMainProjectDir(),
      defaultCwd: resolvePath(config.defaults?.workingDirectory),
      config,
    });
  });

  router.post("/config", async (req, res) => {
    try {
      const newConfig = req.body as AgentStudioConfig;
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

  // Setup wizard
  router.get("/setup/validate-agent-system", async (req, res) => {
    try {
      const agentPath = req.query["path"] as string | undefined;
      if (!agentPath) {
        res.status(400).json({ error: "Missing 'path' query parameter" });
        return;
      }
      const { readFile } = await import("node:fs/promises");

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

  // Scaffold
  router.post("/scaffold/preview", (req, res) => {
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

  router.post("/scaffold", (req, res) => {
    try {
      const options = req.body as ScaffoldOptions;
      if (!options?.projectPath || !Array.isArray(options.agents)) {
        res.status(400).json({ error: "Missing projectPath or agents array" });
        return;
      }
      const validPath = validateProjectPath(options.projectPath);
      if (!validPath) {
        res.status(403).json({ error: "Path not allowed" });
        return;
      }
      options.projectPath = validPath;
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

  // Settings
  router.get("/settings", async (_req, res) => {
    try {
      const { readFile } = await import("node:fs/promises");
      const raw = await readFile(SETTINGS_PATH, "utf-8");
      res.json(JSON.parse(raw));
    } catch {
      const cfg = getConfig();
      res.json({
        defaultModel: cfg.defaults.model,
        defaultPermissions: cfg.defaults.permissions,
        defaultCwd: cfg.defaults.workingDirectory,
      });
    }
  });

  router.post("/settings", async (req, res) => {
    try {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(SETTINGS_PATH, JSON.stringify(req.body, null, 2), "utf-8");
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  return router;
}
