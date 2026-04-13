import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  saveRunState,
  loadRunState,
  listRuns,
  getActiveRuns,
  deleteRun,
  createRunId,
  setBaseDir,
  type RunState,
} from "../workflows/run-state.js";

const TEST_DIR = join(process.cwd(), ".test-run-state-" + Date.now());

beforeEach(() => {
  setBaseDir(TEST_DIR);
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
});

function makeRunState(overrides: Partial<RunState> = {}): RunState {
  return {
    runId: "run-2026-04-13-abc12345",
    workflowId: "test-workflow",
    status: "running",
    currentStep: "step-1",
    startedAt: "2026-04-13T10:00:00Z",
    steps: {
      "step-1": { id: "step-1", status: "running", startedAt: "2026-04-13T10:00:00Z" },
    },
    ...overrides,
  };
}

describe("createRunId", () => {
  it("generates a run ID with date prefix", () => {
    const id = createRunId();
    expect(id).toMatch(/^run-\d{4}-\d{2}-\d{2}-[a-f0-9]{8}$/);
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 10 }, () => createRunId()));
    expect(ids.size).toBe(10);
  });
});

describe("saveRunState + loadRunState roundtrip", () => {
  it("saves and loads state correctly", () => {
    const state = makeRunState();
    saveRunState(state);

    const loaded = loadRunState("test-workflow", state.runId);
    expect(loaded).not.toBeNull();
    expect(loaded!.runId).toBe(state.runId);
    expect(loaded!.workflowId).toBe(state.workflowId);
    expect(loaded!.status).toBe("running");
    expect(loaded!.steps["step-1"].status).toBe("running");
  });

  it("creates directories automatically", () => {
    const state = makeRunState({ workflowId: "new-workflow" });
    saveRunState(state);
    expect(existsSync(join(TEST_DIR, "new-workflow", "runs", state.runId, "state.json"))).toBe(
      true,
    );
  });

  it("returns null for nonexistent run", () => {
    expect(loadRunState("nonexistent", "no-such-run")).toBeNull();
  });

  it("overwrites existing state on re-save", () => {
    const state = makeRunState();
    saveRunState(state);

    state.status = "completed";
    state.completedAt = "2026-04-13T11:00:00Z";
    saveRunState(state);

    const loaded = loadRunState("test-workflow", state.runId);
    expect(loaded!.status).toBe("completed");
    expect(loaded!.completedAt).toBe("2026-04-13T11:00:00Z");
  });
});

describe("listRuns", () => {
  it("returns empty array for nonexistent workflow", () => {
    expect(listRuns("nonexistent")).toEqual([]);
  });

  it("lists all runs sorted by startedAt descending", () => {
    saveRunState(
      makeRunState({
        runId: "run-1",
        workflowId: "wf-1",
        startedAt: "2026-04-13T08:00:00Z",
        status: "completed",
      }),
    );
    saveRunState(
      makeRunState({
        runId: "run-2",
        workflowId: "wf-1",
        startedAt: "2026-04-13T10:00:00Z",
        status: "running",
      }),
    );
    saveRunState(
      makeRunState({
        runId: "run-3",
        workflowId: "wf-1",
        startedAt: "2026-04-13T09:00:00Z",
        status: "failed",
      }),
    );

    const runs = listRuns("wf-1");
    expect(runs).toHaveLength(3);
    expect(runs[0].runId).toBe("run-2"); // most recent
    expect(runs[1].runId).toBe("run-3");
    expect(runs[2].runId).toBe("run-1"); // oldest
  });
});

describe("getActiveRuns", () => {
  it("returns empty array when no workflows exist", () => {
    expect(getActiveRuns()).toEqual([]);
  });

  it("returns only running and paused runs", () => {
    saveRunState(makeRunState({ runId: "r1", workflowId: "wf-a", status: "running" }));
    saveRunState(makeRunState({ runId: "r2", workflowId: "wf-a", status: "completed" }));
    saveRunState(makeRunState({ runId: "r3", workflowId: "wf-b", status: "paused" }));
    saveRunState(makeRunState({ runId: "r4", workflowId: "wf-b", status: "failed" }));
    saveRunState(makeRunState({ runId: "r5", workflowId: "wf-c", status: "waiting_approval" }));

    const active = getActiveRuns();
    expect(active).toHaveLength(3);
    const ids = active.map((r) => r.runId).sort();
    expect(ids).toEqual(["r1", "r3", "r5"]);
  });
});

describe("deleteRun", () => {
  it("deletes an existing run", () => {
    const state = makeRunState();
    saveRunState(state);

    expect(loadRunState("test-workflow", state.runId)).not.toBeNull();
    const deleted = deleteRun("test-workflow", state.runId);
    expect(deleted).toBe(true);
    expect(loadRunState("test-workflow", state.runId)).toBeNull();
  });

  it("returns false for nonexistent run", () => {
    expect(deleteRun("test-workflow", "nonexistent")).toBe(false);
  });
});

describe("atomic write safety", () => {
  it("does not leave .tmp files on successful write", () => {
    const state = makeRunState();
    saveRunState(state);

    const dir = join(TEST_DIR, "test-workflow", "runs", state.runId);
    const files = require("node:fs").readdirSync(dir);
    expect(files).toEqual(["state.json"]);
    expect(files.some((f: string) => f.endsWith(".tmp"))).toBe(false);
  });
});
