import { Router } from "express";
import path from "node:path";
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
      // Prevent path traversal -- resolved path must stay within base directory
      const resolvedBase = path.resolve(MEMORY_BASE_PATH);
      const fullPath = path.resolve(MEMORY_BASE_PATH, filePath);
      if (!fullPath.startsWith(resolvedBase + path.sep) && fullPath !== resolvedBase) {
        res.status(400).json({ error: "Invalid file path" });
        return;
      }
      const { readFile } = await import("node:fs/promises");
      const raw = await readFile(fullPath, "utf-8");
      const data = JSON.parse(raw);
      res.json(data);
    } catch {
      res.status(404).json({ error: "Memory entry not found" });
    }
  });

  // Create memory entry
  router.post("/entries", async (req, res) => {
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
        agent_type?: string;
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
      const agentType = body.agent_type ?? "dashboard";
      const entry = {
        agent_type: agentType,
        memory_type: body.category,
        title: body.title,
        content: body.content ?? {},
        tags: body.tags ?? [],
        created_by: agentType,
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
          agent_type: agentType,
          pinned: body.pinned ?? false,
        };
        index.entries.push(newIndexEntry);
        index.total_entries = index.entries.length;
        await writeFile(MEMORY_INDEX_PATH, JSON.stringify(index, null, 2), "utf-8");
      } catch {
        // Index update failed -- entry still saved
      }

      res.json({ ok: true, file: relPath });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // Update memory entry
  router.put("/entries/:id", async (req, res) => {
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

  // Delete memory entry
  router.delete("/entries/:id", async (req, res) => {
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

  // Pin/unpin memory entry
  router.post("/entries/:id/pin", async (req, res) => {
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

  // Export all memories as JSON
  router.get("/export", async (_req, res) => {
    try {
      if (!MEMORY_INDEX_PATH) {
        res.status(400).json({ error: "No agent system configured" });
        return;
      }
      const { readFile } = await import("node:fs/promises");
      const raw = await readFile(MEMORY_INDEX_PATH, "utf-8");
      const index = JSON.parse(raw) as { entries: unknown[] };

      // Read full content of each entry
      const entries = await Promise.all(
        (index.entries ?? []).map(async (raw_entry: unknown) => {
          const entry = raw_entry as Record<string, unknown>;
          try {
            const filePath = String(entry.file ?? "");
            if (!filePath || !MEMORY_BASE_PATH) return entry;
            const fullPath = path.resolve(MEMORY_BASE_PATH, filePath);
            const content = await readFile(fullPath, "utf-8");
            return { ...entry, _fullContent: JSON.parse(content) };
          } catch {
            return entry;
          }
        }),
      );

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", 'attachment; filename="agent-studio-memories.json"');
      res.json({ version: 1, exportedAt: new Date().toISOString(), entries });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // Import memories from JSON (deduplicate by title+key_point hash)
  router.post("/import", async (req, res) => {
    try {
      if (!MEMORY_INDEX_PATH || !MEMORY_BASE_PATH) {
        res.status(400).json({ error: "No agent system configured" });
        return;
      }
      const { readFile, writeFile, mkdir } = await import("node:fs/promises");
      const { createHash } = await import("node:crypto");

      const body = req.body as { entries?: Record<string, unknown>[] };
      if (!body.entries || !Array.isArray(body.entries)) {
        res.status(400).json({ error: "Missing entries array" });
        return;
      }

      // Read existing index for deduplication
      let existingHashes = new Set<string>();
      try {
        const rawIndex = await readFile(MEMORY_INDEX_PATH, "utf-8");
        const index = JSON.parse(rawIndex) as { entries: Record<string, unknown>[] };
        existingHashes = new Set(
          index.entries.map((e) =>
            createHash("md5")
              .update(`${e.title ?? ""}:${e.key_point ?? ""}`)
              .digest("hex"),
          ),
        );
      } catch {
        // No existing index
      }

      let imported = 0;
      let skipped = 0;

      for (const entry of body.entries) {
        const hash = createHash("md5")
          .update(`${entry.title ?? ""}:${entry.key_point ?? ""}`)
          .digest("hex");

        if (existingHashes.has(hash)) {
          skipped++;
          continue;
        }

        // Write entry via the same logic as POST /entries
        const fullContent = (entry._fullContent as Record<string, unknown>) ?? entry;
        const category = String(fullContent.memory_type ?? entry.category ?? "learning");
        const categoryMap: Record<string, string> = {
          learning: "learnings",
          correction: "corrections",
          decision: "decisions",
          knowledge: "knowledge",
        };
        const folder = categoryMap[category] ?? "learnings";
        const memoryDir = path.join(MEMORY_BASE_PATH, "ai-agents", "memory", folder);
        await mkdir(memoryDir, { recursive: true });

        const now = new Date();
        const pad = (n: number, len = 2) => String(n).padStart(len, "0");
        const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const filename = `${dateStr}_import_${String(imported).padStart(3, "0")}.json`;
        const filePath = path.join(memoryDir, filename);
        const relPath = `ai-agents/memory/${folder}/${filename}`;

        await writeFile(filePath, JSON.stringify(fullContent, null, 2), "utf-8");

        // Update index
        try {
          const rawIndex = await readFile(MEMORY_INDEX_PATH, "utf-8");
          const index = JSON.parse(rawIndex) as {
            entries: Record<string, unknown>[];
            total_entries: number;
          };
          index.entries.push({
            file: relPath,
            title: entry.title ?? "Imported entry",
            key_point: entry.key_point ?? "",
            tags: Array.isArray(entry.tags) ? entry.tags : [],
            category: folder,
            agent_type: entry.agent_type ?? "imported",
            pinned: entry.pinned === true,
          });
          index.total_entries = index.entries.length;
          await writeFile(MEMORY_INDEX_PATH, JSON.stringify(index, null, 2), "utf-8");
        } catch {
          // Index update failed
        }

        existingHashes.add(hash);
        imported++;
      }

      res.json({ ok: true, imported, skipped, total: imported + skipped });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  return router;
}
