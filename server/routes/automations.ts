import { Router } from "express";
import type { AutomationEngine, Automation } from "../automations.js";
import { AUTOMATION_TEMPLATES } from "../automations.js";
import {
  AUTOMATION_TEMPLATES as RICH_TEMPLATES,
  getTemplate,
  fillPromptTemplate,
} from "../automation-templates.js";
import { suggestAutomations } from "../automation-suggestions.js";
import { analyzeProject as analyzeProjectEnhanced } from "../project-analyzer.js";
import { getConfig, saveConfig, reloadConfig } from "../config.js";

export function automationsRoutes(deps: {
  automationEngine: AutomationEngine;
  validateProjectPath: (p: string) => string | null;
}): Router {
  const router = Router();
  const { automationEngine, validateProjectPath } = deps;

  // List automations
  router.get("/", (_req, res) => {
    try {
      const automations = automationEngine.getAutomations();
      res.json(automations);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // Create automation
  router.post("/", (req, res) => {
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

  // Update automation
  router.put("/:id", (req, res) => {
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

  // Delete automation
  router.delete("/:id", (req, res) => {
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

  // Run automation
  router.post("/:id/run", async (req, res) => {
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

  // Create automation from template
  router.post("/from-template", (req, res) => {
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

  // Generate automation from natural language description
  router.post("/from-description", async (req, res) => {
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

  return router;
}

/**
 * Automation templates routes (mounted at /api/automation-templates).
 */
export function automationTemplatesRoutes(): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json(AUTOMATION_TEMPLATES);
  });

  router.get("/rich", (_req, res) => {
    res.json(RICH_TEMPLATES);
  });

  return router;
}

/**
 * Automation suggestions route (mounted at /api/automation-suggestions).
 */
export function automationSuggestionsRoute(deps: {
  validateProjectPath: (p: string) => string | null;
}): Router {
  const router = Router();

  router.get("/", (req, res) => {
    try {
      const projectPath = req.query["project"] as string | undefined;
      if (!projectPath) {
        res.status(400).json({ error: "Missing 'project' query parameter" });
        return;
      }
      const validPath = deps.validateProjectPath(projectPath);
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

  return router;
}
