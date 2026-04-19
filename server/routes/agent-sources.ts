import { Router } from "express";
import {
  getConfig,
  saveConfig,
  reloadConfig,
  resolvePath,
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

  // Compare two scopes by value (handles "global" sentinel + {project} object).
  const scopeEquals = (a: AgentSourceScope, b: AgentSourceScope): boolean => {
    if (a === "global" && b === "global") return true;
    if (typeof a === "object" && typeof b === "object") return a.project === b.project;
    return false;
  };

  // Parse + validate a scope payload value into an AgentSourceScope, or
  // return an error string for the caller to relay as 400.
  const parseScope = (raw: unknown): { scope?: AgentSourceScope; error?: string } => {
    if (raw === "global") return { scope: "global" };
    if (raw && typeof raw === "object" && "project" in (raw as Record<string, unknown>)) {
      const projectRaw = (raw as { project: unknown }).project;
      const project = typeof projectRaw === "string" ? projectRaw.trim() : "";
      if (!project) return { error: "scope.project must be a non-empty string" };
      return { scope: { project } };
    }
    return { error: 'scope must be "global" or {project: string}' };
  };

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

      const parsed = parseScope(body.scope);
      if (parsed.error || !parsed.scope) {
        res.status(400).json({ error: parsed.error ?? "invalid scope" });
        return;
      }
      const scope = parsed.scope;

      const config = getConfig();
      const existing = Array.isArray(config.agentSources) ? [...config.agentSources] : [];

      // Dedupe: reject exact (path + scope) duplicates. Compare scope by value.
      const isDup = existing.some((s) => s.path === sourcePath && scopeEquals(s.scope, scope));
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

  // DELETE /api/config/agent-sources
  // Body: { path: string, scope: "global" | { project: string } }
  // Keys by {resolved-path, scope} signature so concurrent edits / reorder
  // can't accidentally delete the wrong row (M4 fix — replaces position-indexed
  // /:index lookup, which is still mounted below as deprecated).
  router.delete("/", (req, res) => {
    try {
      const body = req.body as { path?: unknown; scope?: unknown };
      const rawPath = typeof body.path === "string" ? body.path.trim() : "";
      if (!rawPath) {
        res.status(400).json({ error: "path is required" });
        return;
      }
      const parsed = parseScope(body.scope);
      if (parsed.error || !parsed.scope) {
        res.status(400).json({ error: parsed.error ?? "invalid scope" });
        return;
      }
      const scope = parsed.scope;

      // Compare by ~-expanded path so callers can pass the user-facing form.
      const targetResolved = resolvePath(rawPath);

      const config = getConfig();
      const existing = Array.isArray(config.agentSources) ? [...config.agentSources] : [];
      const matchIdx = existing.findIndex(
        (s) => resolvePath(s.path) === targetResolved && scopeEquals(s.scope, scope),
      );
      if (matchIdx === -1) {
        res.status(404).json({ error: "no source matches that path + scope" });
        return;
      }

      existing.splice(matchIdx, 1);
      const updated = { ...config, agentSources: existing };
      saveConfig(updated);
      reloadConfig();

      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // DEPRECATED: DELETE /api/config/agent-sources/:index — remove by numeric
  // array index. Kept for in-flight callers; new clients should use the
  // signature-keyed body form above. Sets `Deprecation: true` per RFC 8594.
  router.delete("/:index", (req, res) => {
    try {
      res.setHeader("Deprecation", "true");
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
