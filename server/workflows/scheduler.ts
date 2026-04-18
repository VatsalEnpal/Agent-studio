/**
 * Workflow scheduler — manages interval triggers for workflows.
 *
 * Routes recurring triggers through the unified poller service so every
 * background timer in the app is observable via /api/debug/poller-stats.
 * Persists schedules to disk and restores them on server start.
 *
 * Poller key pattern: `workflow-scheduler.<workflowId>` (plan task 3c).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { parseInterval, type ScheduledTrigger } from "./definition.js";
import { register as pollerRegister, unregister as pollerUnregister } from "../services/poller.js";

// ---------- Types ----------

export interface ScheduleEntry {
  workflowId: string;
  interval: string;
  intervalMs: number;
  paused: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
}

export type SchedulerRunCallback = (workflowId: string) => Promise<boolean>;

// ---------- Scheduler ----------

export class WorkflowScheduler {
  /** Set of workflow ids currently registered with the poller. */
  private registered = new Set<string>();
  private schedules = new Map<string, ScheduleEntry>();
  private runCallback: SchedulerRunCallback;
  private persistPath: string;

  constructor(runCallback: SchedulerRunCallback, persistPath = ".agent-studio/schedules.json") {
    this.runCallback = runCallback;
    this.persistPath = persistPath;
  }

  /** Poller key for a given workflow id. */
  private pollerKey(workflowId: string): string {
    return `workflow-scheduler.${workflowId}`;
  }

  /** Schedule a workflow with an interval trigger */
  schedule(workflowId: string, trigger: ScheduledTrigger): { error?: string } {
    const intervalMs = parseInterval(trigger.interval);
    if (intervalMs === null) {
      return { error: `Invalid interval: '${trigger.interval}'` };
    }

    // Min interval check (unless test bypass)
    if (!trigger._testBypassMinInterval && intervalMs < 60_000) {
      return { error: "Schedule interval must be at least 1 minute" };
    }

    // Stop existing timer if any
    this.unschedule(workflowId);

    const entry: ScheduleEntry = {
      workflowId,
      interval: trigger.interval,
      intervalMs,
      paused: trigger.paused ?? false,
      nextRunAt: new Date(Date.now() + intervalMs).toISOString(),
    };

    this.schedules.set(workflowId, entry);

    if (!entry.paused) {
      this.startTimer(workflowId, intervalMs);
    }

    this.persist();
    return {};
  }

  /** Remove schedule for a workflow */
  unschedule(workflowId: string): void {
    this.clearTimer(workflowId);
    this.schedules.delete(workflowId);
    this.persist();
  }

  /** Pause a schedule (stop timer, keep config) */
  pauseSchedule(workflowId: string): void {
    const entry = this.schedules.get(workflowId);
    if (!entry) return;

    entry.paused = true;
    this.clearTimer(workflowId);
    this.persist();
  }

  /** Resume a paused schedule */
  resumeSchedule(workflowId: string): void {
    const entry = this.schedules.get(workflowId);
    if (!entry) return;

    entry.paused = false;
    entry.nextRunAt = new Date(Date.now() + entry.intervalMs).toISOString();
    this.startTimer(workflowId, entry.intervalMs);
    this.persist();
  }

  /** Get all schedule entries */
  getSchedules(): ScheduleEntry[] {
    return Array.from(this.schedules.values());
  }

  /** Get schedule for a specific workflow */
  getSchedule(workflowId: string): ScheduleEntry | null {
    return this.schedules.get(workflowId) ?? null;
  }

  /** Restore all schedules from disk */
  restoreSchedules(): void {
    if (!existsSync(this.persistPath)) return;

    try {
      const raw = readFileSync(this.persistPath, "utf-8");
      const entries = JSON.parse(raw) as ScheduleEntry[];

      for (const entry of entries) {
        this.schedules.set(entry.workflowId, entry);
        if (!entry.paused) {
          // Don't retroactively run — just set up for next fire
          entry.nextRunAt = new Date(Date.now() + entry.intervalMs).toISOString();
          this.startTimer(entry.workflowId, entry.intervalMs);
        }
      }
    } catch {
      // Corrupted file — ignore
    }
  }

  /** Stop all timers (for shutdown) */
  stopAll(): void {
    for (const workflowId of [...this.registered]) {
      this.clearTimer(workflowId);
    }
  }

  // ---------- Private ----------

  private startTimer(workflowId: string, intervalMs: number): void {
    // Route through the unified poller (plan task 3c). This surfaces every
    // workflow schedule under the `workflow-scheduler.<id>` key in
    // /api/debug/poller-stats.
    pollerRegister(this.pollerKey(workflowId), intervalMs, async () => {
      const entry = this.schedules.get(workflowId);
      if (!entry || entry.paused) return;

      entry.lastRunAt = new Date().toISOString();
      entry.nextRunAt = new Date(Date.now() + intervalMs).toISOString();
      this.persist();

      // Run callback returns false if a run is already active (skip)
      await this.runCallback(workflowId);
    });
    this.registered.add(workflowId);
  }

  private clearTimer(workflowId: string): void {
    if (this.registered.has(workflowId)) {
      pollerUnregister(this.pollerKey(workflowId));
      this.registered.delete(workflowId);
    }
  }

  private persist(): void {
    const dir = dirname(this.persistPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const entries = Array.from(this.schedules.values());
    writeFileSync(this.persistPath, JSON.stringify(entries, null, 2), "utf-8");
  }
}
