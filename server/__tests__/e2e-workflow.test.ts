/**
 * End-to-end workflow tests (Tasks 36, 37, 38).
 *
 * These test the full workflow lifecycle using MockCommandRunner
 * and direct executor/registry calls (no HTTP server needed).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MockCommandRunner } from "../workflows/command-runner.js";
import { WorkflowExecutor, type ExecutorEvent } from "../workflows/executor.js";
import { WorkflowScheduler } from "../workflows/scheduler.js";
import { WorkflowWatcher } from "../workflows/watcher.js";
import { PipelineRegistry, setPipelineBaseDir } from "../workflows/workflow-registry.js";
import { setBaseDir, loadRunState, listRuns } from "../workflows/run-state.js";
import type {
  WorkflowPipelineDef,
  AgentStepDef,
  GateStepDef,
  LoopStepDef,
} from "../workflows/definition.js";

const TEST_DIR = join(process.cwd(), ".test-e2e-" + Date.now());
const WORK_DIR = join(TEST_DIR, "workdir");

beforeEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(WORK_DIR, { recursive: true });
  setBaseDir(join(TEST_DIR, "state"));
  setPipelineBaseDir(join(TEST_DIR, "defs"));
});

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
});

// ---------- Task 36: Execute Mode E2E ----------

describe("Task 36 — E2E Execute Mode", () => {
  it("full lifecycle: create → start → gate → loop → complete", async () => {
    const mock = new MockCommandRunner();
    // Agent steps: build succeeds, qa fails first time, then both succeed on loop iteration 2
    mock.setResponses([
      { exitCode: 0, stdout: "agent-1 done", stderr: "" }, // step: agent-1
      { exitCode: 0, stdout: "agent-2 done", stderr: "" }, // step: agent-2
      // Gate pauses here — after approve:
      { exitCode: 0, stdout: "loop-build ok", stderr: "" }, // loop iter 1: loop-build
      { exitCode: 1, stdout: "", stderr: "qa fail" }, // loop iter 1: loop-qa (fails)
      { exitCode: 0, stdout: "loop-build ok", stderr: "" }, // loop iter 2: loop-build
      { exitCode: 0, stdout: "loop-qa pass", stderr: "" }, // loop iter 2: loop-qa (passes)
      { exitCode: 0, stdout: "final done", stderr: "" }, // step: final-agent
    ]);

    const executor = new WorkflowExecutor(mock);
    const registry = new PipelineRegistry();
    const events: ExecutorEvent[] = [];
    executor.onEvent((e) => events.push(e));

    const wf: WorkflowPipelineDef = {
      id: "e2e-test",
      name: "E2E Test Workflow",
      mode: "execute",
      trigger: { type: "manual" },
      workingDirectory: WORK_DIR,
      steps: [
        {
          id: "agent-1",
          name: "Step 1",
          type: "agent",
          agent: "backend",
          goal: "Do step 1",
        } as AgentStepDef,
        {
          id: "agent-2",
          name: "Step 2",
          type: "agent",
          agent: "frontend",
          goal: "Do step 2",
        } as AgentStepDef,
        {
          id: "gate-1",
          name: "Approval",
          type: "gate",
          reviewArtifact: "output.md",
        } as GateStepDef,
        {
          id: "loop-build",
          name: "Loop Build",
          type: "agent",
          agent: "backend",
          goal: "Build in loop",
        } as AgentStepDef,
        {
          id: "loop-qa",
          name: "Loop QA",
          type: "agent",
          agent: "qa",
          goal: "Test in loop",
        } as AgentStepDef,
        {
          id: "qa-loop",
          name: "QA Loop",
          type: "loop",
          steps: ["loop-build", "loop-qa"],
          maxIterations: 3,
        } as LoopStepDef,
        {
          id: "final-agent",
          name: "Final",
          type: "agent",
          agent: "backend",
          goal: "Finalize",
        } as AgentStepDef,
      ],
    };

    // Save workflow
    registry.saveWorkflow(wf);
    const loaded = registry.getWorkflow("e2e-test");
    expect(loaded).not.toBeNull();

    // Start run
    const runState = executor.startRun(wf);
    expect(runState.status).toBe("running");

    // Execute — should pause at gate
    let result = await executor.executeRun(wf, runState);
    expect(result.status).toBe("waiting_approval");
    expect(result.steps["agent-1"].status).toBe("completed");
    expect(result.steps["agent-2"].status).toBe("completed");
    expect(result.steps["gate-1"].status).toBe("waiting");

    // Approve gate
    result = await executor.approveGate(result, "gate-1", wf);

    // Should complete: loop runs 2 iterations, final step completes
    expect(result.status).toBe("completed");
    expect(result.steps["gate-1"].status).toBe("completed");
    expect(result.steps["qa-loop"].status).toBe("completed");
    expect(result.steps["qa-loop"].iteration).toBe(2);
    expect(result.steps["final-agent"].status).toBe("completed");
    expect(result.completedAt).toBeDefined();

    // Verify run state persisted to disk
    const diskState = loadRunState("e2e-test", runState.runId);
    expect(diskState).not.toBeNull();
    expect(diskState!.status).toBe("completed");

    // Verify events emitted
    expect(events.some((e) => e.type === "gate-waiting")).toBe(true);
    expect(events.some((e) => e.type === "run-completed")).toBe(true);
    expect(mock.calls.length).toBe(7);
  });
});

// ---------- Task 37: Watch Mode E2E ----------

describe("Task 37 — E2E Watch Mode", () => {
  it("watches state file and reflects changes", () => {
    const stateFile = join(TEST_DIR, "watch-state.json");
    const watcher = new WorkflowWatcher();

    const wf: WorkflowPipelineDef = {
      id: "watch-e2e",
      name: "Watch Test",
      mode: "watch",
      trigger: { type: "event", stateFile },
      workingDirectory: WORK_DIR,
      stateFile,
      steps: [
        { id: "s1", name: "Build", type: "agent", agent: "backend", goal: "Build" } as AgentStepDef,
        { id: "g1", name: "Gate", type: "gate" } as GateStepDef,
      ],
    };

    // Write initial state
    writeFileSync(
      stateFile,
      JSON.stringify({
        status: "running",
        steps: { s1: { status: "completed" }, g1: { status: "waiting" } },
      }),
    );

    const runState = watcher.startWatching(wf);
    expect(runState).not.toBeNull();
    expect(runState!.steps.s1.status).toBe("completed");
    expect(runState!.steps.g1.status).toBe("waiting");

    // Approve gate via UI → writes to state file
    const approved = watcher.approveGateInWatchMode("watch-e2e", "g1", stateFile);
    expect(approved).toBe(true);

    // Verify state file updated
    const fileData = JSON.parse(readFileSync(stateFile, "utf-8"));
    expect(fileData.steps.g1.status).toBe("approved");

    // Verify run state updated
    const rs = watcher.getRunState("watch-e2e");
    expect(rs!.steps.g1.status).toBe("completed");
    expect(rs!.steps.g1.approvedBy).toBe("user");

    watcher.stopAll();
  });
});

// ---------- Task 38: Scheduled Workflow E2E ----------

describe("Task 38 — E2E Scheduled Workflow", () => {
  it("schedule fires and creates runs", async () => {
    vi.useFakeTimers();

    const runLog: string[] = [];
    const scheduler = new WorkflowScheduler(
      async (workflowId) => {
        runLog.push(workflowId);
        return true;
      },
      join(TEST_DIR, "schedules.json"),
    );

    // Schedule with test bypass
    const result = scheduler.schedule("sched-wf", {
      type: "scheduled",
      interval: "every 2s",
      _testBypassMinInterval: true,
    });
    expect(result.error).toBeUndefined();

    // First fire
    await vi.advanceTimersByTimeAsync(2100);
    expect(runLog).toContain("sched-wf");

    // Pause
    scheduler.pauseSchedule("sched-wf");
    runLog.length = 0;
    await vi.advanceTimersByTimeAsync(2100);
    expect(runLog).toHaveLength(0); // should not fire

    // Resume
    scheduler.resumeSchedule("sched-wf");
    await vi.advanceTimersByTimeAsync(2100);
    expect(runLog).toContain("sched-wf");

    scheduler.stopAll();
    vi.useRealTimers();
  });
});
