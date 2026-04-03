// server/managers/sprint-manager.ts
import { EventEmitter } from "node:events";
import { readFile, readdir, writeFile, rename } from "node:fs/promises";
import { join, basename } from "node:path";
import { watch, type FSWatcher } from "chokidar";
import { getAgentSystemBase } from "../config.js";

type GateStatus = "not_started" | "in_progress" | "passed" | "failed";
type SprintStatus = "planned" | "launching" | "in_progress" | "paused" | "completed" | "cancelled" | "failed";

/** Persistent sprint state stored in state.json. */
export interface SprintState {
  version: string;
  sprint: string | null;
  status: SprintStatus;
  gates: Record<string, GateStatus>;
  agents: Record<string, string>;
  startedAt?: string;
  completedAt?: string;
}

/** QA test report with health score and bug list. */
export interface QaReport {
  timestamp: string;
  health_score: number;
  bugs: Array<{ severity: string; title: string; assigned_to?: string }>;
  passed_flows: string[];
}

const DEFAULT_STATE: SprintState = {
  version: "1", sprint: null, status: "planned", gates: {}, agents: {},
};
const DEBOUNCE_MS = 500;

/**
 * State machine that powers the Sprints page.
 * Watches `ai-agents/sprints/` for file changes, emits events for state,
 * spec, handoff, and readiness updates.
 *
 * Events: "sprint-update", "sprint-spec-update", "sprint-ready", "handoff-update"
 */
export class SprintManager extends EventEmitter {
  private state: SprintState = { ...DEFAULT_STATE };
  private watcher: FSWatcher | null = null;
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private dir(): string | null {
    const b = getAgentSystemBase();
    return b ? join(b, "sprints") : null;
  }

  /** Load state from disk and start the file watcher. */
  async start(): Promise<void> {
    await this.loadState();
    const dir = this.dir();
    if (!dir) return;
    this.watcher = watch(dir, {
      persistent: true, ignoreInitial: true, depth: 2,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
    });
    this.watcher.on("all", (_ev: string, fp: string) => this.debouncedHandle(fp));
  }

  /** Close watcher and clear all debounce timers. */
  async stop(): Promise<void> {
    for (const t of this.debounceTimers.values()) clearTimeout(t);
    this.debounceTimers.clear();
    if (this.watcher) { await this.watcher.close(); this.watcher = null; }
  }

  /** Return the current in-memory sprint state. */
  getState(): SprintState { return { ...this.state }; }

  /** Return the active sprint spec and state, or null if none. */
  async getActiveSprint(): Promise<{ spec: string; state: SprintState } | null> {
    const d = this.dir();
    if (!d || !this.state.sprint) return null;
    const spec = await this.safeRead(join(d, "current.md"));
    return spec ? { spec, state: this.getState() } : null;
  }

  /** Read all handoff JSON files from `handoffs/`. */
  async getHandoffs(): Promise<Record<string, unknown>[]> {
    const d = this.dir();
    if (!d) return [];
    try {
      const files = await readdir(join(d, "handoffs"));
      const results: Record<string, unknown>[] = [];
      for (const f of files) {
        if (!f.endsWith(".json") || f === "qa_report.json") continue;
        const raw = await this.safeRead(join(d, "handoffs", f));
        if (!raw) continue;
        try { results.push({ _file: f, ...JSON.parse(raw) }); }
        catch (err) { console.warn(`[SprintManager] Invalid JSON in ${f}:`, err); }
      }
      return results;
    } catch (err) {
      console.warn("[SprintManager] Failed to read handoffs:", err);
      return [];
    }
  }

  /** Read the QA report from `handoffs/qa_report.json`. */
  async getQaReport(): Promise<QaReport | null> {
    const d = this.dir();
    if (!d) return null;
    const raw = await this.safeRead(join(d, "handoffs", "qa_report.json"));
    if (!raw) return null;
    try { return JSON.parse(raw) as QaReport; }
    catch (err) { console.warn("[SprintManager] Invalid qa_report.json:", err); return null; }
  }

  /** Read completed sprint specs from `archive/`, sorted newest-first. */
  async getArchivedSprints(): Promise<Array<{ name: string; date: string; content: string }>> {
    const d = this.dir();
    if (!d) return [];
    try {
      const files = (await readdir(join(d, "archive"))).filter((f) => f.endsWith(".md"));
      const entries = await Promise.all(files.map(async (f) => {
        const content = (await this.safeRead(join(d, "archive", f))) ?? "";
        const dateMatch = f.match(/^(\d{4}-\d{2}-\d{2})/);
        return { name: f.replace(/\.md$/, ""), date: dateMatch?.[1] ?? "unknown", content };
      }));
      return entries.sort((a, b) => b.date.localeCompare(a.date));
    } catch (err) {
      console.warn("[SprintManager] Failed to read archive:", err);
      return [];
    }
  }

  /** Advance a gate to the next status and persist atomically. */
  async approveGate(gate: string): Promise<SprintState> {
    const cur = this.state.gates[gate];
    this.state.gates[gate] =
      cur === "not_started" ? "in_progress" : cur === "in_progress" ? "passed" : "in_progress";
    await this.persistState();
    this.emit("sprint-update", this.getState());
    return this.getState();
  }

  /** Pause the active sprint. Only valid from "in_progress" or "launching". */
  async pause(): Promise<SprintState> {
    return this.transition("paused", ["in_progress", "launching"]);
  }

  /** Resume a paused sprint back to "in_progress". */
  async resume(): Promise<SprintState> {
    return this.transition("in_progress", ["paused"]);
  }

  /** Cancel the sprint. Valid from any active status. */
  async cancel(): Promise<SprintState> {
    this.assertFrom("cancelled", ["planned", "launching", "in_progress", "paused"]);
    this.state.status = "cancelled";
    this.state.completedAt = new Date().toISOString();
    await this.persistState();
    this.emit("sprint-update", this.getState());
    return this.getState();
  }

  // --- Private ---

  private async transition(target: SprintStatus, from: SprintStatus[]): Promise<SprintState> {
    this.assertFrom(target, from);
    this.state.status = target;
    await this.persistState();
    this.emit("sprint-update", this.getState());
    return this.getState();
  }

  private assertFrom(target: SprintStatus, valid: SprintStatus[]): void {
    if (!valid.includes(this.state.status)) {
      throw new Error(`Cannot transition to "${target}" from "${this.state.status}"`);
    }
  }

  private async loadState(): Promise<void> {
    const d = this.dir();
    if (!d) return;
    const raw = await this.safeRead(join(d, "state.json"));
    if (!raw) return;
    try { this.state = { ...DEFAULT_STATE, ...JSON.parse(raw) }; }
    catch (err) { console.warn("[SprintManager] Corrupt state.json, using defaults:", err); this.state = { ...DEFAULT_STATE }; }
  }

  /** Write state to .tmp then atomically rename. */
  private async persistState(): Promise<void> {
    const d = this.dir();
    if (!d) return;
    const tmp = join(d, "state.json.tmp");
    await writeFile(tmp, JSON.stringify(this.state, null, 2) + "\n", "utf-8");
    await rename(tmp, join(d, "state.json"));
  }

  private debouncedHandle(filePath: string): void {
    const existing = this.debounceTimers.get(filePath);
    if (existing) clearTimeout(existing);
    this.debounceTimers.set(filePath, setTimeout(() => {
      this.debounceTimers.delete(filePath);
      void this.handleFileChange(filePath);
    }, DEBOUNCE_MS));
  }

  private async handleFileChange(filePath: string): Promise<void> {
    const name = basename(filePath);
    if (name === "state.json") {
      await this.loadState();
      this.emit("sprint-update", this.getState());
    } else if (name === "current.md") {
      this.emit("sprint-spec-update", await this.safeRead(filePath));
    } else if (name === "ready.md") {
      this.emit("sprint-ready", await this.safeRead(filePath));
    } else if (filePath.includes("handoffs/")) {
      this.emit("handoff-update", { file: name, content: await this.safeRead(filePath) });
    }
  }

  private async safeRead(path: string): Promise<string | null> {
    try { return await readFile(path, "utf-8"); }
    catch (err) { console.warn(`[SprintManager] Failed to read ${basename(path)}:`, err); return null; }
  }
}
