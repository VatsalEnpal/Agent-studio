import { Router } from "express";
import {
  getConfig,
  saveConfig,
  reloadConfig,
  type AgentSourceConfig,
  type AgentSourceScope,
} from "../config.js";

/**
 * Routes for managing `config.agentSources` entries (plan task 11).
 * Mount under `/api/config/agent-sources`.
 *
 * Note: we intentionally do NOT expand `~` when persisting source paths —
 * keep user-facing forms portable across machines. Expansion happens at
 * read-time via `getAgentSources()` / `resolvePath()`.
 */
export function agentSourcesRoutes(): Router {
  const router = Router();

  // POST /api/config/agent-sources
  // Body: { path: string, scope: "global" | { project: string }, label?: string }
  router.post("/", (req, res) => {
    try {
      const body = req.body as {
        path?: unknown;
        scope?: unknown;
        label?: unknown;
      };

      const sourcePath = typeof body.path === "string" ? body.path.trim() : "";
      const label =
        typeof body.label === "string" && body.label.trim() ? body.label.trim() : undefined;

      if (!sourcePath) {
        res.status(400).json({ error: "path is required" });
        return;
      }

      // Validate scope: either literal "global" or {project: string}.
      let scope: AgentSourceScope;
      if (body.scope === "global") {
        scope = "global";
      } else if (
        body.scope &&
        typeof body.scope === "object" &&
        "project" in (body.scope as Record<string, unknown>)
      ) {
        const raw = (body.scope as { project: unknown }).project;
        const project = typeof raw === "string" ? raw.trim() : "";
        if (!project) {
          res.status(400).json({ error: "scope.project must be a non-empty string" });
          return;
        }
        scope = { project };
      } else {
        res.status(400).json({
          error: 'scope must be "global" or {project: string}',
        });
        return;
      }

      const config = getConfig();
      const existing = Array.isArray(config.agentSources) ? [...config.agentSources] : [];

      // Dedupe: reject exact (path + scope) duplicates. Compare scope by value.
      const isDup = existing.some((s) => {
        if (s.path !== sourcePath) return false;
        if (s.scope === "global" && scope === "global") return true;
        if (
          typeof s.scope === "object" &&
          typeof scope === "object" &&
          s.scope.project === scope.project
        ) {
          return true;
        }
        return false;
      });
      if (isDup) {
        res.status(409).json({ error: "a source with this path and scope already exists" });
        return;
      }

      const entry: AgentSourceConfig = label
        ? { path: sourcePath, scope, label }
        : { path: sourcePath, scope };
      existing.push(entry);

      const updated = { ...config, agentSources: existing };
      saveConfig(updated);
      reloadConfig();

      res.status(201).json({ ok: true, source: entry });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // DELETE /api/config/agent-sources/:index — remove by numeric array index.
  router.delete("/:index", (req, res) => {
    try {
      const idx = Number.parseInt(req.params.index, 10);
      if (!Number.isInteger(idx) || idx < 0) {
        res.status(400).json({ error: "index must be a non-negative integer" });
        return;
      }

      const config = getConfig();
      const existing = Array.isArray(config.agentSources) ? [...config.agentSources] : [];
      if (idx >= existing.length) {
        res.status(404).json({ error: "source index out of range" });
        return;
      }

      existing.splice(idx, 1);
      const updated = { ...config, agentSources: existing };
      saveConfig(updated);
      reloadConfig();

      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  return router;
}
