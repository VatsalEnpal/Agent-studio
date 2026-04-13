import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { MockCommandRunner } from "../workflows/command-runner.js";
import { WorkflowExecutor } from "../workflows/executor.js";
import {
  setBaseDir,
  loadRunState,
  saveRunState,
  getActiveRuns,
  type RunState,
} from "../workflows/run-state.js";
import type { WorkflowPipelineDef, AgentStepDef, GateStepDef } from "../workflows/definition.js";

const TEST_DIR = join(process.cwd(), ".test-error-handling-" + Date.now());
const WORK_DIR = join(TEST_DIR, "workdir");

function makeWorkflow(overrides: Partial<WorkflowPipelineDef> = {}): WorkflowPipelineDef {
  return {
    id: "test-wf",
    name: "Test",
    mode: "execute",
    trigger: { type: "manual" },
    workingDirectory: WORK_DIR,
    steps: [
      { id: "s1", name: "Build", type: "agent", agent: "backend", goal: "Build" } as AgentStepDef,
    ],
    ...overrides,
  };
}

beforeEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(WORK_DIR, { recursive: true });
  setBaseDir(join(TEST_DIR, "state"));
});

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
});

// ---------- Task 27: Crash, Timeout, Missing Output ----------

describe("Task 27 — Execution Errors", () => {
  it("agent crash: captures last 10 lines of stderr in error", async () => {
    const mock = new MockCommandRunner();
    const longError = Array.from({ length: 15 }, (_, i) => `error line ${i + 1}`).join("\n");
    mock.setFailure(1, longError);
    const executor = new WorkflowExecutor(mock);
    const wf = makeWorkflow();
    const runState = executor.startRun(wf);
    const result = await executor.executeRun(wf, runState);

    expect(result.steps["s1"].status).toBe("failed");
    // Should contain last 10 lines
    expect(result.steps["s1"].error).toContain("error line 6");
    expect(result.steps["s1"].error).toContain("error line 15");
  });

  it("agent timeout: step status is 'timeout' with descriptive error", async () => {
    const mock = new MockCommandRunner();
    mock.setTimeout(5000);
    const executor = new WorkflowExecutor(mock);
    const wf = makeWorkflow({
      steps: [
        {
          id: "s1",
          name: "Slow",
          type: "agent",
          agent: "backend",
          goal: "Slow task",
          timeout: 0.05,
        } as AgentStepDef,
      ],
    });
    const runState = executor.startRun(wf);

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 30);
    await executor.executeAgentStep(runState, wf.steps[0] as AgentStepDef, wf, controller.signal);

    expect(runState.steps["s1"].status).toBe("timeout");
    expect(runState.steps["s1"].error).toContain("timed out");
  });

  it("missing output: step fails with descriptive error", async () => {
    const mock = new MockCommandRunner();
    mock.setSuccess("done");
    const executor = new WorkflowExecutor(mock);
    const wf = makeWorkflow({
      steps: [
        {
          id: "s1",
          name: "Build",
          type: "agent",
          agent: "backend",
          goal: "Build",
          output: "nonexistent.md",
        } as AgentStepDef,
      ],
    });
    const runState = executor.startRun(wf);
    const result = await executor.executeRun(wf, runState);

    expect(result.steps["s1"].status).toBe("failed");
    expect(result.steps["s1"].error).toContain("didn't produce");
    expect(result.steps["s1"].error).toContain("nonexistent.md");
  });

  it("large output (100KB): no crash, step completes", async () => {
    const mock = new MockCommandRunner();
    const largeOutput = "x".repeat(100_000);
    mock.setSuccess(largeOutput);
    const executor = new WorkflowExecutor(mock);
    const wf = makeWorkflow();
    const runState = executor.startRun(wf);
    const result = await executor.executeRun(wf, runState);

    expect(result.status).toBe("completed");
    expect(result.steps["s1"].status).toBe("completed");
  });
});

// ---------- Task 28: Rate Limit, Server Restart, Agent Conflict ----------

describe("Task 28 — Rate Limit, Restart, Conflict", () => {
  it("rate limit: detects 429 and retries", async () => {
    const mock = new MockCommandRunner();
    mock.setResponses([
      { exitCode: 1, stdout: "429 Too Many Requests", stderr: "" },
      { exitCode: 0, stdout: "success", stderr: "" },
    ]);
    const executor = new WorkflowExecutor(mock);
    executor._testRetryDelayMs = 10;
    const wf = makeWorkflow();
    const runState = executor.startRun(wf);
    const result = await executor.executeRun(wf, runState);

    expect(result.status).toBe("completed");
    expect(mock.calls).toHaveLength(2);
  });

  it("server restart: running state detected and paused", () => {
    // Simulate a run that was running when server died
    const runState: RunState = {
      runId: "run-crash",
      workflowId: "wf-x",
      status: "running",
      currentStep: "s2",
      startedAt: new Date().toISOString(),
      steps: {
        s1: { id: "s1", status: "completed" },
        s2: { id: "s2", status: "running" },
      },
    };
    saveRunState(runState);

    // Recovery logic
    const active = getActiveRuns().filter((r) => r.status === "running");
    expect(active).toHaveLength(1);
    for (const run of active) {
      for (const step of Object.values(run.steps)) {
        if (step.status === "running") step.status = "interrupted";
      }
      run.status = "paused";
      saveRunState(run);
    }

    const recovered = loadRunState("wf-x", "run-crash");
    expect(recovered!.status).toBe("paused");
    expect(recovered!.steps.s2.status).toBe("interrupted");
  });

  it("two consecutive gates with no agent: both pause correctly", async () => {
    const mock = new MockCommandRunner();
    mock.setSuccess("done");
    const executor = new WorkflowExecutor(mock);
    const wf = makeWorkflow({
      steps: [
        { id: "s1", name: "Build", type: "agent", agent: "backend", goal: "Build" } as AgentStepDef,
        { id: "g1", name: "Gate 1", type: "gate" } as GateStepDef,
        { id: "g2", name: "Gate 2", type: "gate" } as GateStepDef,
      ],
    });
    const runState = executor.startRun(wf);
    let result = await executor.executeRun(wf, runState);

    expect(result.status).toBe("waiting_approval");
    expect(result.steps.g1.status).toBe("waiting");

    // Approve gate 1
    result = await executor.approveGate(result, "g1", wf);
    expect(result.status).toBe("waiting_approval");
    expect(result.steps.g2.status).toBe("waiting");

    // Approve gate 2
    result = await executor.approveGate(result, "g2", wf);
    expect(result.status).toBe("completed");
  });
});

// ---------- Task 29: Graceful Degradation + Edge Cases ----------

describe("Task 29 — Graceful Degradation", () => {
  it("workflow with 0 steps passed to executor: clear error", () => {
    const mock = new MockCommandRunner();
    const executor = new WorkflowExecutor(mock);
    const errors = executor.validatePreExecution(makeWorkflow({ steps: [] }));
    expect(errors).toContain("Workflow must have at least one step");
  });

  it("agent stdout with binary garbage: no crash", async () => {
    const mock = new MockCommandRunner();
    // Simulate binary garbage
    const garbage = Buffer.from([0x00, 0xff, 0xfe, 0x80, 0x01]).toString();
    mock.setSuccess(garbage);
    const executor = new WorkflowExecutor(mock);
    const wf = makeWorkflow();
    const runState = executor.startRun(wf);
    const result = await executor.executeRun(wf, runState);

    expect(result.status).toBe("completed");
  });

  it("step with empty goal: validation catches it", () => {
    const mock = new MockCommandRunner();
    const executor = new WorkflowExecutor(mock);
    const errors = executor.validatePreExecution(
      makeWorkflow({
        steps: [
          { id: "s1", name: "Build", type: "agent", agent: "backend", goal: "" } as AgentStepDef,
        ],
      }),
    );
    expect(errors.some((e) => e.includes("needs a goal"))).toBe(true);
  });

  it("gate as first step: pauses immediately", async () => {
    const mock = new MockCommandRunner();
    const executor = new WorkflowExecutor(mock);
    const wf = makeWorkflow({
      steps: [
        { id: "g1", name: "Initial Gate", type: "gate" } as GateStepDef,
        { id: "s1", name: "Build", type: "agent", agent: "backend", goal: "Build" } as AgentStepDef,
      ],
    });
    const runState = executor.startRun(wf);
    const result = await executor.executeRun(wf, runState);

    expect(result.status).toBe("waiting_approval");
    expect(result.steps.g1.status).toBe("waiting");
    expect(result.steps.s1.status).toBe("pending");
    expect(mock.calls).toHaveLength(0);
  });

  it("gate as last step: pauses before completed", async () => {
    const mock = new MockCommandRunner();
    mock.setSuccess("done");
    const executor = new WorkflowExecutor(mock);
    const wf = makeWorkflow({
      steps: [
        { id: "s1", name: "Build", type: "agent", agent: "backend", goal: "Build" } as AgentStepDef,
        { id: "g1", name: "Final Gate", type: "gate" } as GateStepDef,
      ],
    });
    const runState = executor.startRun(wf);
    const result = await executor.executeRun(wf, runState);

    expect(result.status).toBe("waiting_approval");
    expect(result.steps.s1.status).toBe("completed");
    expect(result.steps.g1.status).toBe("waiting");
  });
});
