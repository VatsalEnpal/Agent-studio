import { Router } from "express";
import { readMemoryStats } from "../file-watcher.js";
import { getAgentSystemPath, getMainProjectDir } from "../config.js";

export function memoryRoutes(): Router {
  const router = Router();
  const MEMORY_INDEX_PATH = getAgentSystemPath("tools/memory_index.json") ?? "";
  const MEMORY_BASE_PATH = getMainProjectDir();

  router.get("/stats", async (_req, res) => {
    try {
      const stats = await readMemoryStats();
      res.json(stats);
    } catch {
      res.json({ total: 0, categories: {} });
    }
  });

  router.get("/entries", async (_req, res) => {
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
      res.json({ entries: [], total: 0 });
    }
  });

  router.get("/entry", async (req, res) => {
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
      res.status(404).json({ error: "Memory entry not found" });
    }
  });

  return router;
}
