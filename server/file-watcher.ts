import { watch, type FSWatcher } from "chokidar";
import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { getAgentSystemBase } from "./config.js";

export interface FileUpdate {
  file: string; // e.g. "scan_log.md", "current.md", "handoffs/qa_report.json"
  content: string;
}

type UpdateCallback = (update: FileUpdate) => void;

function getBase(): string {
  return getAgentSystemBase() ?? "";
}

function getWatchPaths(): string[] {
  const base = getBase();
  if (!base) return [];
  return [
    join(base, "sprints/current.md"),
    join(base, "sprints/ready.md"),
    join(base, "sprints/scan_log.md"),
    join(base, "sprints/archive"),
    join(base, "sprints/handoffs"),
    join(base, "tools/memory_index.json"),
  ];
}

export class FileWatcher {
  private watcher: FSWatcher | null = null;
  private callbacks: Set<UpdateCallback> = new Set();

  start(): void {
    const paths = getWatchPaths();
    if (paths.length === 0) return; // no agent system configured
    this.watcher = watch(paths, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    });

    this.watcher.on("change", (filePath: string) => {
      void this.handleChange(filePath);
    });

    this.watcher.on("add", (filePath: string) => {
      void this.handleChange(filePath);
    });
  }

  private async handleChange(filePath: string): Promise<void> {
    try {
      const content = await readFile(filePath, "utf-8");
      const label = this.labelFor(filePath);
      const update: FileUpdate = { file: label, content };
      for (const cb of this.callbacks) {
        cb(update);
      }
    } catch {
      // File might have been deleted between event and read — ignore
    }
  }

  private labelFor(filePath: string): string {
    if (filePath.includes("handoffs/")) {
      return `handoffs/${basename(filePath)}`;
    }
    if (filePath.includes("archive/")) {
      return `archive/${basename(filePath)}`;
    }
    return basename(filePath);
  }

  onUpdate(callback: UpdateCallback): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    this.callbacks.clear();
  }
}

// --- Static read helpers for REST endpoints ---

async function safeRead(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

export async function readCurrentSprint(): Promise<string | null> {
  return safeRead(join(getBase(), "sprints/current.md"));
}

export async function readReadyQueue(): Promise<string | null> {
  return safeRead(join(getBase(), "sprints/ready.md"));
}

export async function readScanLog(): Promise<
  Array<{ timestamp: string; status: string; detail: string }>
> {
  const raw = await safeRead(join(getBase(), "sprints/scan_log.md"));
  if (!raw) return [];
  return parseScanLog(raw);
}

export function parseScanLog(
  raw: string,
): Array<{ timestamp: string; status: string; detail: string }> {
  const entries: Array<{ timestamp: string; status: string; detail: string }> =
    [];

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Format 1: [2026-03-28T09:14:52Z] STATUS — detail
    const bracketMatch = trimmed.match(
      /^\[(\d{4}-\d{2}-\d{2}T[\d:]+Z)\]\s+(.+)$/,
    );
    if (bracketMatch) {
      const ts = bracketMatch[1]!;
      const rest = bracketMatch[2]!;
      const dashIdx = rest.indexOf(" — ");
      if (dashIdx >= 0) {
        entries.push({
          timestamp: ts,
          status: rest.slice(0, dashIdx).trim(),
          detail: rest.slice(dashIdx + 3).trim(),
        });
      } else {
        entries.push({ timestamp: ts, status: "INFO", detail: rest });
      }
      continue;
    }

    // Format 2: 2026-03-28T18:28:54Z | STATUS | detail
    const pipeMatch = trimmed.match(
      /^(\d{4}-\d{2}-\d{2}T[\d:]+Z)\s*\|\s*(.+?)\s*\|\s*(.+)$/,
    );
    if (pipeMatch) {
      entries.push({
        timestamp: pipeMatch[1]!,
        status: pipeMatch[2]!.trim(),
        detail: pipeMatch[3]!.trim(),
      });
    }
  }

  return entries;
}

export async function readSprintHistory(): Promise<
  Array<{ name: string; date: string }>
> {
  const archiveDir = join(getBase(), "sprints/archive");
  try {
    const files = await readdir(archiveDir);
    return files
      .filter((f) => f.endsWith(".md"))
      .map((f) => {
        // Extract date from filename like 2026-03-15_column_header_tooltips.md
        const dateMatch = f.match(/^(\d{4}-\d{2}-\d{2})/);
        return {
          name: f.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}_/, ""),
          date: dateMatch ? dateMatch[1]! : "unknown",
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch {
    return [];
  }
}

export async function readHandoffs(): Promise<
  Array<{ from: string; to: string; file: string; detail: string }>
> {
  const handoffsDir = join(getBase(), "sprints/handoffs");
  try {
    const files = await readdir(handoffsDir);
    const results: Array<{
      from: string;
      to: string;
      file: string;
      detail: string;
    }> = [];

    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const raw = await safeRead(join(handoffsDir, f));
      if (!raw) continue;
      try {
        const data = JSON.parse(raw) as Record<string, unknown>;
        const agent = (data["agent"] as string) ?? "unknown";
        // Derive "to" from filename pattern: backend_to_frontend.json, frontend_to_qa.json
        const toMatch = f.match(/_to_(\w+)\.json$/);
        const to = toMatch ? toMatch[1]! : "orchestrator";
        const detail =
          (data["test_scope"] as string) ??
          (data["notes"] as string) ??
          (Array.isArray(data["deliverables"])
            ? (data["deliverables"] as string[]).join(", ")
            : f);
        results.push({ from: agent, to, file: f, detail });
      } catch {
        // Invalid JSON — skip
      }
    }

    return results;
  } catch {
    return [];
  }
}

export async function readMemoryStats(): Promise<{
  total: number;
  categories: Record<string, number>;
}> {
  const raw = await safeRead(join(getBase(), "tools/memory_index.json"));
  if (!raw) return { total: 0, categories: {} };

  try {
    const data = JSON.parse(raw) as {
      entries?: Array<{ category?: string }>;
    };
    const entries = data.entries ?? [];
    const categories: Record<string, number> = {};
    for (const entry of entries) {
      const cat = entry.category ?? "uncategorized";
      categories[cat] = (categories[cat] ?? 0) + 1;
    }
    return { total: entries.length, categories };
  } catch {
    return { total: 0, categories: {} };
  }
}
