/**
 * Workflow run state persistence.
 *
 * Manages read/write/list/delete of workflow run state to disk.
 * Uses atomic writes (tmp + rename) to prevent partial files.
 */

import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
  renameSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";

// ---------- Types ----------

export type RunStatus =
  | "planned"
  | "running"
  | "paused"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "cancelled"
  | "budget_exceeded";

export type StepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "timeout"
  | "waiting"
  | "interrupted";

export interface StepState {
  id: string;
  status: StepStatus;
  startedAt?: string;
  completedAt?: string;
  output?: string;
  error?: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectedAt?: string;
  feedback?: string;
  iteration?: number;
  iterationHistory?: Array<{ iteration: number; status: StepStatus; completedAt: string }>;
  subSteps?: Record<string, StepState>;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalCostUsd: number;
  };
}

export interface RunState {
  runId: string;
  workflowId: string;
  status: RunStatus;
  currentStep: string | null;
  startedAt: string;
  completedAt?: string;
  steps: Record<string, StepState>;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalCostUsd: number;
  };
  /** Per-run budget override (takes precedence over workflow definition budgetCapUsd) */
  budgetCapUsd?: number;
  error?: string;
}

// ---------- Base directory ----------

let _baseDir = ".agent-studio/workflows";

/** Override base directory (useful for tests) */
export function setBaseDir(dir: string): void {
  _baseDir = dir;
}

export function getBaseDir(): string {
  return _baseDir;
}

function runDir(workflowId: string, runId: string): string {
  return join(_baseDir, workflowId, "runs", runId);
}

function runStatePath(workflowId: string, runId: string): string {
  return join(runDir(workflowId, runId), "state.json");
}

// ---------- Create ----------

export function createRunId(): string {
  const now = new Date();
  const date = now.toISOString().split("T")[0];
  const short = randomUUID().slice(0, 8);
  return `run-${date}-${short}`;
}

// ---------- Save (atomic write) ----------

export function saveRunState(state: RunState): void {
  const filePath = runStatePath(state.workflowId, state.runId);
  const dir = dirname(filePath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const tmpPath = filePath + ".tmp";
  const json = JSON.stringify(state, null, 2);
  writeFileSync(tmpPath, json, "utf-8");
  renameSync(tmpPath, filePath);
}

// ---------- Load ----------

export function loadRunState(workflowId: string, runId: string): RunState | null {
  const filePath = runStatePath(workflowId, runId);
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as RunState;
  } catch {
    return null;
  }
}

// ---------- List runs ----------

export interface RunSummary {
  runId: string;
  workflowId: string;
  status: RunStatus;
  startedAt: string;
  completedAt?: string;
}

export function listRuns(workflowId: string): RunSummary[] {
  const runsDir = join(_baseDir, workflowId, "runs");
  if (!existsSync(runsDir)) return [];

  const entries = readdirSync(runsDir, { withFileTypes: true });
  const summaries: RunSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const state = loadRunState(workflowId, entry.name);
    if (state) {
      summaries.push({
        runId: state.runId,
        workflowId: state.workflowId,
        status: state.status,
        startedAt: state.startedAt,
        completedAt: state.completedAt,
      });
    }
  }

  return summaries.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

// ---------- Active runs ----------

export function getActiveRuns(): RunState[] {
  if (!existsSync(_baseDir)) return [];

  const workflowDirs = readdirSync(_baseDir, { withFileTypes: true });
  const active: RunState[] = [];

  for (const wfDir of workflowDirs) {
    if (!wfDir.isDirectory()) continue;
    const runsDir = join(_baseDir, wfDir.name, "runs");
    if (!existsSync(runsDir)) continue;

    const runDirs = readdirSync(runsDir, { withFileTypes: true });
    for (const rDir of runDirs) {
      if (!rDir.isDirectory()) continue;
      const state = loadRunState(wfDir.name, rDir.name);
      if (
        state &&
        (state.status === "running" ||
          state.status === "paused" ||
          state.status === "waiting_approval")
      ) {
        active.push(state);
      }
    }
  }

  return active;
}

// ---------- Delete ----------

export function deleteRun(workflowId: string, runId: string): boolean {
  const dir = runDir(workflowId, runId);
  if (!existsSync(dir)) return false;
  rmSync(dir, { recursive: true, force: true });
  return true;
}
