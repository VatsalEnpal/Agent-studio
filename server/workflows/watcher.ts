/**
 * Watch-mode workflow support.
 *
 * Watches a state file for changes and maps them to workflow step status
 * updates. Gates work bidirectionally: UI writes approval to state file,
 * external orchestrator reads it.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { watch, type FSWatcher } from "chokidar";
import type { WorkflowPipelineDef } from "./definition.js";
import { type RunState, type StepState, saveRunState, createRunId } from "./run-state.js";

// ---------- Watch State File Format ----------

/**
 * Standard format for watched state files.
 * Also accepts the existing sprints/state.json format.
 */
export interface WatchStateFile {
  status?: string;
  currentStep?: string;
  steps?: Record<string, { status: string; [key: string]: unknown }>;
  // Sprint format compatibility
  sprint?: string;
  agents?: Record<string, string>;
  gates?: Record<string, string>;
}

// ---------- Watcher ----------

export type WatchEventListener = (runState: RunState) => void;

export class WorkflowWatcher {
  private watchers = new Map<string, FSWatcher>();
  private runStates = new Map<string, RunState>();
  private listeners: WatchEventListener[] = [];

  onUpdate(listener: WatchEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(runState: RunState): void {
    for (const listener of this.listeners) {
      try {
        listener(runState);
      } catch {
        // ignore
      }
    }
  }

  /** Start watching a state file for a workflow */
  startWatching(workflowDef: WorkflowPipelineDef): RunState | null {
    const stateFile = workflowDef.stateFile;
    if (!stateFile) return null;

    // Stop any existing watcher for this workflow
    this.stopWatching(workflowDef.id);

    // Create initial run state
    const runId = createRunId();
    const steps: Record<string, StepState> = {};
    for (const step of workflowDef.steps) {
      steps[step.id] = { id: step.id, status: "pending" };
    }

    const runState: RunState = {
      runId,
      workflowId: workflowDef.id,
      status: "running",
      currentStep: null,
      startedAt: new Date().toISOString(),
      steps,
    };

    this.runStates.set(workflowDef.id, runState);

    // Read initial state if file exists
    if (existsSync(stateFile)) {
      this.processStateFile(stateFile, workflowDef, runState);
    }

    saveRunState(runState);

    // Watch for changes
    const watcher = watch(stateFile, {
      persistent: true,
      ignoreInitial: true,
    });

    watcher.on("change", () => {
      this.processStateFile(stateFile, workflowDef, runState);
      saveRunState(runState);
      this.emit(runState);
    });

    this.watchers.set(workflowDef.id, watcher);
    return runState;
  }

  /** Stop watching a workflow */
  stopWatching(workflowId: string): void {
    const watcher = this.watchers.get(workflowId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(workflowId);
    }
    this.runStates.delete(workflowId);
  }

  /** Stop all watchers */
  stopAll(): void {
    for (const [id] of this.watchers) {
      this.stopWatching(id);
    }
  }

  /** Get the current run state for a watched workflow */
  getRunState(workflowId: string): RunState | null {
    return this.runStates.get(workflowId) ?? null;
  }

  /** Approve a gate in watch mode — writes approval to the state file */
  approveGateInWatchMode(workflowId: string, stepId: string, stateFile: string): boolean {
    if (!existsSync(stateFile)) return false;

    try {
      const raw = readFileSync(stateFile, "utf-8");
      const data = JSON.parse(raw) as WatchStateFile;

      // Update the step status in the state file
      if (!data.steps) data.steps = {};
      data.steps[stepId] = { ...data.steps[stepId], status: "approved" };

      // Also update gates if using sprint format
      if (data.gates) {
        const gateKey = Object.keys(data.gates).find((k) => k.includes(stepId));
        if (gateKey) {
          data.gates[gateKey] = "passed";
        }
      }

      writeFileSync(stateFile, JSON.stringify(data, null, 2), "utf-8");

      // Update local run state
      const runState = this.runStates.get(workflowId);
      if (runState && runState.steps[stepId]) {
        runState.steps[stepId].status = "completed";
        runState.steps[stepId].approvedAt = new Date().toISOString();
        runState.steps[stepId].approvedBy = "user";
        saveRunState(runState);
        this.emit(runState);
      }

      return true;
    } catch {
      return false;
    }
  }

  // ---------- Private ----------

  private processStateFile(
    filePath: string,
    workflowDef: WorkflowPipelineDef,
    runState: RunState,
  ): void {
    try {
      const raw = readFileSync(filePath, "utf-8");
      const data = JSON.parse(raw) as WatchStateFile;

      // Map standard format
      if (data.steps) {
        for (const [stepId, stepData] of Object.entries(data.steps)) {
          if (runState.steps[stepId]) {
            runState.steps[stepId].status = this.mapStatus(stepData.status);
          }
        }
      }

      // Map sprint format (agents map)
      if (data.agents) {
        for (const [agentId, status] of Object.entries(data.agents)) {
          // Find step that uses this agent
          const step = workflowDef.steps.find((s) => s.type === "agent" && s.agent === agentId);
          if (step && runState.steps[step.id]) {
            runState.steps[step.id].status = this.mapStatus(status);
          }
        }
      }

      if (data.currentStep) {
        runState.currentStep = data.currentStep;
      }

      if (data.status) {
        const mappedStatus = this.mapRunStatus(data.status);
        if (mappedStatus) {
          runState.status = mappedStatus;
        }
      }
    } catch {
      // Invalid JSON — ignore
    }
  }

  private mapStatus(status: string): StepState["status"] {
    const map: Record<string, StepState["status"]> = {
      completed: "completed",
      done: "completed",
      passed: "completed",
      approved: "completed",
      running: "running",
      working: "running",
      in_progress: "running",
      pending: "pending",
      not_started: "pending",
      not_spawned: "pending",
      idle: "pending",
      failed: "failed",
      error: "failed",
      waiting: "waiting",
    };
    return map[status] ?? "pending";
  }

  private mapRunStatus(status: string): RunState["status"] | null {
    const map: Record<string, RunState["status"]> = {
      completed: "completed",
      running: "running",
      in_progress: "running",
      paused: "paused",
      failed: "failed",
      cancelled: "cancelled",
    };
    return map[status] ?? null;
  }
}
