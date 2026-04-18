import { Router } from "express";
import type express from "express";
import fs from "node:fs";
import path from "node:path";
import {
  getConfig,
  getAgentSources,
  resolvePath,
  type AgentConfig,
  type DiscoveredAgent,
} from "../config.js";
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

  // Create a single agent as a markdown file under a configured agent source.
  // Accepts the richer payload spec'd by plan task A7: name (filename-safe),
  // description, optional model/permissions/icon, body (markdown), and a
  // targetSourcePath that MUST match one of config.agentSources[].path.
  router.post("/", (req, res) => {
    try {
      const body = req.body as {
        name?: string;
        description?: string;
        model?: string;
        permissions?: string;
        icon?: string;
        body?: string;
        targetSourcePath?: string;
      };
      const name = (body.name ?? "").trim();
      const description = (body.description ?? "").trim();
      const model = (body.model ?? "inherit").trim();
      const permissions = (body.permissions ?? "").trim();
      const icon = (body.icon ?? "").trim();
      const mdBody = body.body ?? "";
      const targetRaw = (body.targetSourcePath ?? "").trim();

      // --- Validation ---
      if (!name) {
        res.status(400).json({ error: "name is required" });
        return;
      }
      // Filename-safe: alphanumeric + _- , must start with alphanumeric.
      const nameRe = /^[a-z0-9][a-z0-9_-]*$/i;
      if (!nameRe.test(name)) {
        res.status(400).json({
          error:
            "name must be filename-safe (letters, digits, _ and -; must start with a letter or digit)",
        });
        return;
      }
      const allowedModels = new Set(["opus", "sonnet", "haiku", "inherit"]);
      if (!allowedModels.has(model)) {
        res.status(400).json({ error: "model must be one of: opus, sonnet, haiku, inherit" });
        return;
      }
      if (permissions) {
        const allowedPerms = new Set(["auto", "plan", "default", "bypass"]);
        if (!allowedPerms.has(permissions)) {
          res
            .status(400)
            .json({ error: "permissions must be one of: auto, plan, default, bypass" });
          return;
        }
      }
      if (!targetRaw) {
        res.status(400).json({ error: "targetSourcePath is required" });
        return;
      }

      // Resolve ~ on both sides and compare.
      const config = getConfig();
      const sources = getAgentSources(config);
      const targetResolved = resolvePath(targetRaw);
      const matchedSource = sources.find((s) => s.path === targetResolved);
      if (!matchedSource) {
        res.status(400).json({
          error: "targetSourcePath must match one of the configured agentSources",
        });
        return;
      }

      const targetDir = matchedSource.path;
      const targetFile = path.join(targetDir, `${name}.md`);
      if (fs.existsSync(targetFile)) {
        res.status(409).json({ error: "agent with this name already exists" });
        return;
      }

      // --- Compose frontmatter ---
      // YAML-ish serializer for a flat map of strings. Skips empty values and
      // `model: "inherit"` (the sentinel meaning "don't set it"). Values that
      // contain characters needing quoting are wrapped in double quotes.
      const escapeYaml = (v: string): string => {
        // Allow bare scalars for simple descriptions; quote anything that
        // looks risky (leading/trailing whitespace, colon, #, quotes, newline).
        if (/^[A-Za-z0-9 _\-./,()!?]*$/.test(v) && !/^\s|\s$/.test(v)) {
          return v;
        }
        return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
      };
      const fmLines: string[] = [`name: ${name}`];
      if (description) fmLines.push(`description: ${escapeYaml(description)}`);
      if (model && model !== "inherit") fmLines.push(`model: ${model}`);
      if (permissions) fmLines.push(`permissions: ${permissions}`);
      if (icon) fmLines.push(`icon: ${escapeYaml(icon)}`);

      const trimmedBody = mdBody.replace(/^\s+/, "");
      const fileContents = `---\n${fmLines.join("\n")}\n---\n\n${trimmedBody}${
        trimmedBody.endsWith("\n") ? "" : "\n"
      }`;

      // --- Atomic write: tmp + rename ---
      fs.mkdirSync(targetDir, { recursive: true });
      const tmpFile = `${targetFile}.tmp-${process.pid}-${Date.now()}`;
      fs.writeFileSync(tmpFile, fileContents, "utf-8");
      fs.renameSync(tmpFile, targetFile);

      // Mirror the shape used by GET /api/agents for the new record.
      const scopeLabel =
        matchedSource.scope === "global"
          ? "global"
          : (matchedSource.label ?? matchedSource.scope.project);
      const agentRecord: DiscoveredAgent = {
        id: name,
        name,
        description: description || `Agent from ${scopeLabel}`,
        ...(model !== "inherit" ? { model: model as "opus" | "sonnet" | "haiku" } : {}),
        ...(icon ? { icon } : {}),
        sourcePath: matchedSource.path,
        scope: matchedSource.scope,
      };

      res.status(201).json({ ok: true, path: targetFile, agent: agentRecord });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // ---------- Browse Templates (plan task A8) ----------
  // The repo ships a curated set of agent templates under `<repo>/.claude/agents/*.md`.
  // GET /api/agents/templates lists them; POST /api/agents/templates/import copies
  // explicitly-selected ones into a chosen configured agentSource.
  //
  // Repo-root resolution: server runs from the AgentStudio repo root (process.cwd()).
  // In packaged Electron builds cwd may be the app bundle, so we also try a few
  // relative fallbacks from this module's location. Guarded to avoid
  // ReferenceError under strict ESM where __dirname is undefined.
  const resolveTemplatesDir = (): string | null => {
    const candidates: string[] = [path.join(process.cwd(), ".claude", "agents")];
    const here: string | undefined = typeof __dirname !== "undefined" ? __dirname : undefined;
    if (here) {
      candidates.push(path.resolve(here, "..", "..", ".claude", "agents"));
      candidates.push(path.resolve(here, "..", "..", "..", ".claude", "agents"));
    }
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return null;
  };

  // Minimal YAML frontmatter parser — handles `key: value` and `key: "quoted"`.
  // Leaves anything fancier (multiline, nested) as a single string.
  const parseFrontmatter = (content: string): Record<string, string> => {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return {};
    const out: Record<string, string> = {};
    for (const line of match[1].split(/\r?\n/)) {
      const idx = line.indexOf(":");
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      let value = line.slice(idx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key) out[key] = value;
    }
    return out;
  };

  router.get("/templates", (_req, res) => {
    try {
      const dir = resolveTemplatesDir();
      if (!dir) {
        res.json([]);
        return;
      }
      const files = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".md"))
        .sort();
      const out: Array<{
        filename: string;
        name: string;
        description: string;
        model?: string;
      }> = [];
      for (const filename of files) {
        try {
          const content = fs.readFileSync(path.join(dir, filename), "utf-8");
          const fm = parseFrontmatter(content);
          out.push({
            filename,
            name: fm.name || path.basename(filename, ".md"),
            description: fm.description || "",
            ...(fm.model ? { model: fm.model } : {}),
          });
        } catch {
          // Skip unreadable files — stay lenient.
        }
      }
      res.json(out);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // Safe filename pattern: must match a .md file with no path separators or `..`.
  const FILENAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*\.md$/;

  router.post("/templates/import", (req, res) => {
    try {
      const body = req.body as { filenames?: unknown; targetSourcePath?: unknown };
      const filenames = body.filenames;
      const targetRaw = typeof body.targetSourcePath === "string" ? body.targetSourcePath : "";

      if (!Array.isArray(filenames) || filenames.length === 0) {
        res.status(400).json({ error: "filenames must be a non-empty array" });
        return;
      }
      for (const f of filenames) {
        if (typeof f !== "string" || !FILENAME_RE.test(f)) {
          res.status(400).json({ error: `Invalid filename: ${String(f)}` });
          return;
        }
      }
      if (!targetRaw) {
        res.status(400).json({ error: "targetSourcePath is required" });
        return;
      }

      const config = getConfig();
      const sources = getAgentSources(config);
      const targetResolved = resolvePath(targetRaw);
      const matchedSource = sources.find((s) => s.path === targetResolved);
      if (!matchedSource) {
        res.status(400).json({
          error: "targetSourcePath must match one of the configured agentSources",
        });
        return;
      }

      const templatesDir = resolveTemplatesDir();
      if (!templatesDir) {
        res.status(500).json({ error: "Templates directory not found on server" });
        return;
      }

      const targetDir = matchedSource.path;
      fs.mkdirSync(targetDir, { recursive: true });

      const imported: string[] = [];
      const skipped: string[] = [];
      for (const filename of filenames as string[]) {
        const srcFile = path.join(templatesDir, filename);
        const dstFile = path.join(targetDir, filename);
        if (!fs.existsSync(srcFile)) {
          skipped.push(filename);
          continue;
        }
        if (fs.existsSync(dstFile)) {
          // Never overwrite — report as skipped.
          skipped.push(filename);
          continue;
        }
        try {
          // COPYFILE_EXCL guards against a race between the existsSync check
          // and the write.
          fs.copyFileSync(srcFile, dstFile, fs.constants.COPYFILE_EXCL);
          imported.push(filename);
        } catch {
          skipped.push(filename);
        }
      }

      res.json({ ok: true, imported, skipped });
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
