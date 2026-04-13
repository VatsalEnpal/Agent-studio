import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { WorkflowScheduler, type ScheduleEntry } from "../workflows/scheduler.js";
import type { ScheduledTrigger } from "../workflows/definition.js";

const TEST_DIR = join(process.cwd(), ".test-scheduler-" + Date.now());
const PERSIST_PATH = join(TEST_DIR, "schedules.json");

let scheduler: WorkflowScheduler;
let runLog: string[];

beforeEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
  runLog = [];
  scheduler = new WorkflowScheduler(async (workflowId) => {
    runLog.push(workflowId);
    return true;
  }, PERSIST_PATH);
});

afterEach(() => {
  scheduler.stopAll();
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("WorkflowScheduler", () => {
  it("schedules a workflow with a valid interval", () => {
    const result = scheduler.schedule("wf-1", {
      type: "scheduled",
      interval: "every 2s",
      _testBypassMinInterval: true,
    });

    expect(result.error).toBeUndefined();
    const entry = scheduler.getSchedule("wf-1");
    expect(entry).not.toBeNull();
    expect(entry!.workflowId).toBe("wf-1");
    expect(entry!.intervalMs).toBe(2000);
    expect(entry!.paused).toBe(false);
  });

  it("fires timer and creates a run", async () => {
    vi.useFakeTimers();

    const fakeScheduler = new WorkflowScheduler(async (workflowId) => {
      runLog.push(workflowId);
      return true;
    }, PERSIST_PATH);

    fakeScheduler.schedule("wf-1", {
      type: "scheduled",
      interval: "every 2s",
      _testBypassMinInterval: true,
    });

    // Advance time by 2.1 seconds
    await vi.advanceTimersByTimeAsync(2100);

    expect(runLog).toContain("wf-1");

    fakeScheduler.stopAll();
    vi.useRealTimers();
  });

  it("pauses and resumes a schedule", () => {
    scheduler.schedule("wf-1", {
      type: "scheduled",
      interval: "every 5s",
      _testBypassMinInterval: true,
    });

    scheduler.pauseSchedule("wf-1");
    const paused = scheduler.getSchedule("wf-1");
    expect(paused!.paused).toBe(true);

    scheduler.resumeSchedule("wf-1");
    const resumed = scheduler.getSchedule("wf-1");
    expect(resumed!.paused).toBe(false);
  });

  it("persists schedules to disk", () => {
    scheduler.schedule("wf-1", {
      type: "scheduled",
      interval: "every 1m",
    });

    expect(existsSync(PERSIST_PATH)).toBe(true);
    const raw = readFileSync(PERSIST_PATH, "utf-8");
    const entries = JSON.parse(raw) as ScheduleEntry[];
    expect(entries).toHaveLength(1);
    expect(entries[0].workflowId).toBe("wf-1");
  });

  it("restores schedules from disk", () => {
    scheduler.schedule("wf-1", {
      type: "scheduled",
      interval: "every 2h",
    });
    scheduler.schedule("wf-2", {
      type: "scheduled",
      interval: "every 1d",
    });

    // Create a new scheduler instance and restore
    const scheduler2 = new WorkflowScheduler(async () => true, PERSIST_PATH);
    scheduler2.restoreSchedules();

    const schedules = scheduler2.getSchedules();
    expect(schedules).toHaveLength(2);
    expect(schedules.map((s) => s.workflowId).sort()).toEqual(["wf-1", "wf-2"]);

    scheduler2.stopAll();
  });

  it("unschedules a workflow", () => {
    scheduler.schedule("wf-1", {
      type: "scheduled",
      interval: "every 5m",
    });

    expect(scheduler.getSchedule("wf-1")).not.toBeNull();
    scheduler.unschedule("wf-1");
    expect(scheduler.getSchedule("wf-1")).toBeNull();
  });

  it("rejects invalid interval", () => {
    const result = scheduler.schedule("wf-1", {
      type: "scheduled",
      interval: "invalid",
    });

    expect(result.error).toBeDefined();
    expect(result.error).toContain("Invalid interval");
  });

  it("rejects interval < 1 minute without bypass", () => {
    const result = scheduler.schedule("wf-1", {
      type: "scheduled",
      interval: "every 30s",
    });

    expect(result.error).toBeDefined();
    expect(result.error).toContain("at least 1 minute");
  });

  it("replaces existing schedule on re-schedule", () => {
    scheduler.schedule("wf-1", {
      type: "scheduled",
      interval: "every 1h",
    });
    scheduler.schedule("wf-1", {
      type: "scheduled",
      interval: "every 2h",
    });

    const entry = scheduler.getSchedule("wf-1");
    expect(entry!.interval).toBe("every 2h");
    expect(entry!.intervalMs).toBe(7_200_000);
    expect(scheduler.getSchedules()).toHaveLength(1);
  });
});
