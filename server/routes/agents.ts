import { Router } from "express";
import type express from "express";
import fs from "node:fs";
import path from "node:path";
import { getConfig, getAgentSources, type AgentConfig, type DiscoveredAgent } from "../config.js";
import {
  generateAgentsWithClaudeMd,
  writeAgentFiles,
  isClaudeCliAvailable,
  refreshClaudeCliCheck,
  previewAgents,
  getGenerationStatus,
} from "../agent-generator.js";
import type { ProjectProfile } from "../project-analyzer.js";
import { analyzeProject as analyzeProjectEnhanced } from "../project-analyzer.js";
import { writeClaudeMd } from "../claudemd-generator.js";

export function agentsRoutes(deps: { validateProjectPath: (p: string) => string | null }): Router {
  const router = Router();
  const { validateProjectPath } = deps;

  // List agents. Optional ?projectPath=<path> filters to global sources
  // plus the one source scoped to that exact project. Project-scoped
  // agents override global agents on name-collision (same id).
  router.get("/", async (req, res) => {
    try {
      const config = getConfig();
      const projectPathQuery =
        typeof req.query.projectPath === "string" ? req.query.projectPath : undefined;

      // byId preserves insertion order (globals first, then project-scoped so
      // project entries overwrite global on same id — precedence rule).
      const byId = new Map<string, DiscoveredAgent | AgentConfig>();

      // Always include "No Agent" as the first option
      byId.set("none", { id: "none", name: "No Agent", description: "Plain Claude session" });

      // Add agents from config (explicitly listed agents, treated as global)
      if (config.agents && Array.isArray(config.agents)) {
        for (const a of config.agents) {
          if (!byId.has(a.id)) byId.set(a.id, a);
        }
      }

      const { existsSync, readdirSync } = await import("node:fs");
      const { readFile } = await import("node:fs/promises");
      const { join, basename } = await import("node:path");

      const sources = getAgentSources(config);

      // Partition into global and project-matching sources so we can insert
      // global entries first, then overwrite with project-scoped entries.
      const globalSources = sources.filter((s) => s.scope === "global");
      const projectSources = projectPathQuery
        ? sources.filter((s) => s.scope !== "global" && s.scope.project === projectPathQuery)
        : sources.filter((s) => s.scope !== "global");

      const readSource = async (source: (typeof sources)[number]): Promise<DiscoveredAgent[]> => {
        if (!existsSync(source.path)) return [];
        let files: string[];
        try {
          files = readdirSync(source.path).filter((f: string) => f.endsWith(".md"));
        } catch {
          return [];
        }
        const out: DiscoveredAgent[] = [];
        for (const file of files) {
          const id = basename(file, ".md");
          const scopeLabel =
            source.scope === "global" ? "global" : (source.label ?? source.scope.project);
          let description = `Agent from ${scopeLabel}`;
          let model: "opus" | "sonnet" | "haiku" | undefined;
          try {
            const content = await readFile(join(source.path, file), "utf-8");
            const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
            if (fmMatch) {
              const descMatch = fmMatch[1].match(/description:\s*(.+)/);
              if (descMatch) description = descMatch[1].trim();
            }
          } catch {
            // Use default description
          }
          out.push({
            id,
            name: id,
            description,
            model,
            sourcePath: source.path,
            scope: source.scope,
          });
        }
        return out;
      };

      // Insert global agents first.
      for (const source of globalSources) {
        for (const agent of await readSource(source)) {
          if (!byId.has(agent.id)) byId.set(agent.id, agent);
        }
      }
      // Then project-scoped — these overwrite global entries on same id (precedence).
      for (const source of projectSources) {
        for (const agent of await readSource(source)) {
          byId.set(agent.id, agent);
        }
      }

      const agents = Array.from(byId.values());

      // If no real agents were discovered (only "none"), fall back to built-in defaults.
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
          if (!byId.has(d.id)) agents.push(d);
        }
      }

      res.json(agents);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // CLI status check
  router.get("/cli-status", (req, res) => {
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
  router.post("/analyze", handleAnalyze);

  // Generate agents (with optional userDescription and teamSize)
  router.post("/generate", async (req, res) => {
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
  router.post("/preview", handlePreview);

  // Generation status polling
  router.get("/generate/status", (_req, res) => {
    res.json(getGenerationStatus());
  });

  // Apply agents (write files to disk)
  router.post("/apply", (req, res) => {
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
  router.post("/create", (req, res) => {
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

  return router;
}

/**
 * Standalone route for /api/analyze-project (alias for /api/agents/analyze).
 */
export function analyzeProjectRoute(deps: {
  validateProjectPath: (p: string) => string | null;
}): express.RequestHandler {
  return (req, res) => {
    try {
      const body = req.body as { projectPath?: string; path?: string };
      const projectPath = body.projectPath ?? body.path;
      if (!projectPath) {
        res.status(400).json({ error: "Missing projectPath" });
        return;
      }
      const validPath = deps.validateProjectPath(projectPath);
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
}

/**
 * Standalone route for /api/generate-agents/preview (alias).
 */
export function generateAgentsPreviewRoute(deps: {
  validateProjectPath: (p: string) => string | null;
}): express.RequestHandler {
  return async (req, res) => {
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
      const validPath = deps.validateProjectPath(projectPath);
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
}

/**
 * Standalone route for /api/generate-claudemd.
 */
export function generateClaudeMdRoute(deps: {
  validateProjectPath: (p: string) => string | null;
}): express.RequestHandler {
  return (req, res) => {
    try {
      const { projectPath, preserveExisting } = req.body as {
        projectPath?: string;
        preserveExisting?: boolean;
      };
      if (!projectPath) {
        res.status(400).json({ error: "Missing projectPath" });
        return;
      }
      const validPath = deps.validateProjectPath(projectPath);
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
  };
}
