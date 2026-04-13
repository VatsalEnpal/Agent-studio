import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { MockCommandRunner } from "../workflows/command-runner.js";
import { WorkflowExecutor, type ExecutorEvent } from "../workflows/executor.js";
import { setBaseDir, loadRunState } from "../workflows/run-state.js";
import type { WorkflowPipelineDef, AgentStepDef } from "../workflows/definition.js";

const TEST_DIR = join(process.cwd(), ".test-executor-" + Date.now());
const WORK_DIR = join(TEST_DIR, "workdir");

function makeWorkflow(overrides: Partial<WorkflowPipelineDef> = {}): WorkflowPipelineDef {
  return {
    id: "test-wf",
    name: "Test Workflow",
    mode: "execute",
    trigger: { type: "manual" },
    workingDirectory: WORK_DIR,
    steps: [
      {
        id: "step-1",
        name: "Build",
        type: "agent",
        agent: "backend",
        goal: "Build the backend",
      } as AgentStepDef,
    ],
    ...overrides,
  };
}

beforeEach(() => {
  setBaseDir(join(TEST_DIR, "state"));
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(WORK_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("WorkflowExecutor — Agent Steps", () => {
  it("executes a single-step workflow successfully", async () => {
    const mock = new MockCommandRunner();
    mock.setSuccess("done");
    const executor = new WorkflowExecutor(mock);
    const wf = makeWorkflow();
    const runState = executor.startRun(wf);

    const result = await executor.executeRun(wf, runState);

    expect(result.status).toBe("completed");
    expect(result.steps["step-1"].status).toBe("completed");
    expect(result.completedAt).toBeDefined();
    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0].args).toContain("-p");
    expect(mock.calls[0].args).toContain("Build the backend");
  });

  it("executes a two-step workflow in order", async () => {
    const mock = new MockCommandRunner();
    mock.setResponses([
      { exitCode: 0, stdout: "step1 done", stderr: "" },
      { exitCode: 0, stdout: "step2 done", stderr: "" },
    ]);
    const executor = new WorkflowExecutor(mock);
    const wf = makeWorkflow({
      steps: [
        {
          id: "s1",
          name: "Step 1",
          type: "agent",
          agent: "backend",
          goal: "Do first thing",
        } as AgentStepDef,
        {
          id: "s2",
          name: "Step 2",
          type: "agent",
          agent: "frontend",
          goal: "Do second thing",
        } as AgentStepDef,
      ],
    });
    const runState = executor.startRun(wf);

    const result = await executor.executeRun(wf, runState);

    expect(result.status).toBe("completed");
    expect(result.steps["s1"].status).toBe("completed");
    expect(result.steps["s2"].status).toBe("completed");
    expect(mock.calls).toHaveLength(2);
    // Verify order
    expect(mock.calls[0].args).toContain("Do first thing");
    expect(mock.calls[1].args).toContain("Do second thing");
  });

  it("pauses on non-zero exit code (default onFailure)", async () => {
    const mock = new MockCommandRunner();
    mock.setFailure(1, "compilation error");
    const executor = new WorkflowExecutor(mock);
    const wf = makeWorkflow();
    const runState = executor.startRun(wf);

    const result = await executor.executeRun(wf, runState);

    expect(result.status).toBe("paused");
    expect(result.steps["step-1"].status).toBe("failed");
    expect(result.steps["step-1"].error).toContain("compilation error");
  });

  it("fails when output file is missing", async () => {
    const mock = new MockCommandRunner();
    mock.setSuccess("done");
    const executor = new WorkflowExecutor(mock);
    const wf = makeWorkflow({
      steps: [
        {
          id: "step-1",
          name: "Build",
          type: "agent",
          agent: "backend",
          goal: "Build",
          output: "build-output.md",
        } as AgentStepDef,
      ],
    });
    const runState = executor.startRun(wf);

    const result = await executor.executeRun(wf, runState);

    expect(result.status).toBe("paused");
    expect(result.steps["step-1"].status).toBe("failed");
    expect(result.steps["step-1"].error).toContain("didn't produce");
  });

  it("persists run state to disk after each step", async () => {
    const mock = new MockCommandRunner();
    mock.setSuccess("done");
    const executor = new WorkflowExecutor(mock);
    const wf = makeWorkflow();
    const runState = executor.startRun(wf);

    await executor.executeRun(wf, runState);

    const loaded = loadRunState("test-wf", runState.runId);
    expect(loaded).not.toBeNull();
    expect(loaded!.status).toBe("completed");
    expect(loaded!.steps["step-1"].status).toBe("completed");
  });

  it("emits step-started and step-completed events", async () => {
    const mock = new MockCommandRunner();
    mock.setSuccess("done");
    const executor = new WorkflowExecutor(mock);
    const events: ExecutorEvent[] = [];
    executor.onEvent((e) => events.push(e));
    const wf = makeWorkflow();
    const runState = executor.startRun(wf);

    await executor.executeRun(wf, runState);

    const types = events.map((e) => e.type);
    expect(types).toContain("step-started");
    expect(types).toContain("step-completed");
    expect(types).toContain("run-completed");
  });

  it("emits step-failed event on failure", async () => {
    const mock = new MockCommandRunner();
    mock.setFailure(1, "error");
    const executor = new WorkflowExecutor(mock);
    const events: ExecutorEvent[] = [];
    executor.onEvent((e) => events.push(e));
    const wf = makeWorkflow();
    const runState = executor.startRun(wf);

    await executor.executeRun(wf, runState);

    expect(events.some((e) => e.type === "step-failed")).toBe(true);
  });

  it("passes model and agent flags to command runner", async () => {
    const mock = new MockCommandRunner();
    mock.setSuccess();
    const executor = new WorkflowExecutor(mock);
    const wf = makeWorkflow({
      steps: [
        {
          id: "s1",
          name: "Build",
          type: "agent",
          agent: "qa",
          goal: "test everything",
          model: "opus",
          permissions: "bypass",
        } as AgentStepDef,
      ],
    });
    const runState = executor.startRun(wf);

    await executor.executeRun(wf, runState);

    const args = mock.calls[0].args;
    expect(args).toContain("--agent");
    expect(args).toContain("qa");
    expect(args).toContain("--model");
    expect(args).toContain("opus");
    expect(args).toContain("--permissions");
    expect(args).toContain("bypass");
  });
});
