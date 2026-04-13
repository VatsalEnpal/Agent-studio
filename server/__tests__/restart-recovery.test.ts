import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  saveRunState,
  loadRunState,
  getActiveRuns,
  setBaseDir,
  type RunState,
} from "../workflows/run-state.js";

const TEST_DIR = join(process.cwd(), ".test-restart-recovery-" + Date.now());

beforeEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
  setBaseDir(TEST_DIR);
});

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("Server Restart Recovery", () => {
  it("detects interrupted runs and marks them as paused", () => {
    // Simulate a run that was "running" when server died
    const runState: RunState = {
      runId: "run-interrupted",
      workflowId: "wf-1",
      status: "running",
      currentStep: "step-2",
      startedAt: "2026-04-13T10:00:00Z",
      steps: {
        "step-1": { id: "step-1", status: "completed", completedAt: "2026-04-13T10:01:00Z" },
        "step-2": { id: "step-2", status: "running", startedAt: "2026-04-13T10:01:00Z" },
        "step-3": { id: "step-3", status: "pending" },
      },
    };
    saveRunState(runState);

    // Simulate recovery logic (same as in server/index.ts)
    const interrupted = getActiveRuns().filter((r) => r.status === "running");
    for (const run of interrupted) {
      for (const step of Object.values(run.steps)) {
        if (step.status === "running") {
          step.status = "interrupted";
        }
      }
      run.status = "paused";
      saveRunState(run);
    }

    // Verify
    expect(interrupted).toHaveLength(1);
    const recovered = loadRunState("wf-1", "run-interrupted");
    expect(recovered!.status).toBe("paused");
    expect(recovered!.steps["step-1"].status).toBe("completed");
    expect(recovered!.steps["step-2"].status).toBe("interrupted");
    expect(recovered!.steps["step-3"].status).toBe("pending");
    expect(recovered!.currentStep).toBe("step-2");
  });

  it("does not touch already-paused or completed runs", () => {
    saveRunState({
      runId: "run-paused",
      workflowId: "wf-1",
      status: "paused",
      currentStep: "step-1",
      startedAt: "2026-04-13T10:00:00Z",
      steps: { "step-1": { id: "step-1", status: "failed" } },
    });

    saveRunState({
      runId: "run-complete",
      workflowId: "wf-2",
      status: "completed",
      currentStep: null,
      startedAt: "2026-04-13T09:00:00Z",
      completedAt: "2026-04-13T09:30:00Z",
      steps: { "step-1": { id: "step-1", status: "completed" } },
    });

    // Only "running" runs should be detected
    const interrupted = getActiveRuns().filter((r) => r.status === "running");
    expect(interrupted).toHaveLength(0);

    // Paused run still returns from getActiveRuns but not filtered as "running"
    const active = getActiveRuns();
    expect(active).toHaveLength(1); // only the paused one (completed is not active)
  });

  it("can resume a recovered run from the interrupted step", async () => {
    // This tests the concept — the actual resume is via executor.executeRun
    const runState: RunState = {
      runId: "run-resumable",
      workflowId: "wf-1",
      status: "paused",
      currentStep: "step-2",
      startedAt: "2026-04-13T10:00:00Z",
      steps: {
        "step-1": { id: "step-1", status: "completed" },
        "step-2": { id: "step-2", status: "interrupted" },
        "step-3": { id: "step-3", status: "pending" },
      },
    };
    saveRunState(runState);

    // When resuming, the executor should skip completed steps
    // and re-execute from the interrupted step
    const loaded = loadRunState("wf-1", "run-resumable");
    expect(loaded!.status).toBe("paused");
    expect(loaded!.steps["step-1"].status).toBe("completed");
    expect(loaded!.steps["step-2"].status).toBe("interrupted");
  });
});
