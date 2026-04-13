import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { MockCommandRunner } from "../workflows/command-runner.js";
import { WorkflowExecutor, type ExecutorEvent } from "../workflows/executor.js";
import { setBaseDir, loadRunState } from "../workflows/run-state.js";
import type { WorkflowPipelineDef, AgentStepDef, GateStepDef } from "../workflows/definition.js";

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

describe("WorkflowExecutor — Pre-Execution Validation", () => {
  it("returns error for nonexistent agent", () => {
    const mock = new MockCommandRunner();
    const executor = new WorkflowExecutor(mock);
    const wf = makeWorkflow({
      steps: [
        {
          id: "s1",
          name: "Build",
          type: "agent",
          agent: "nonexistent-agent-xyz-12345",
          goal: "do something",
        } as AgentStepDef,
      ],
    });

    const errors = executor.validatePreExecution(wf);
    expect(errors.some((e) => e.includes("nonexistent-agent-xyz-12345"))).toBe(true);
    expect(errors.some((e) => e.includes("not found"))).toBe(true);
  });

  it("returns error for nonexistent working directory", () => {
    const mock = new MockCommandRunner();
    const executor = new WorkflowExecutor(mock);
    const wf = makeWorkflow({
      workingDirectory: "/nonexistent/path/that/does/not/exist",
    });

    const errors = executor.validatePreExecution(wf);
    expect(errors.some((e) => e.includes("does not exist"))).toBe(true);
  });

  it("returns empty array when all checks pass (with existing dir)", () => {
    const mock = new MockCommandRunner();
    const executor = new WorkflowExecutor(mock);
    // Use a workflow with an agent that likely doesn't exist, but check that
    // workingDirectory validation passes for an existing directory
    const wf = makeWorkflow({
      workingDirectory: process.cwd(),
      steps: [], // will fail definition validation
    });

    const errors = executor.validatePreExecution(wf);
    // Should have definition error (no steps) but NOT working directory error
    expect(errors.some((e) => e.includes("does not exist"))).toBe(false);
    expect(errors.some((e) => e.includes("at least one step"))).toBe(true);
  });

  it("catches definition validation errors", () => {
    const mock = new MockCommandRunner();
    const executor = new WorkflowExecutor(mock);
    const wf = makeWorkflow({ steps: [] });

    const errors = executor.validatePreExecution(wf);
    expect(errors).toContain("Workflow must have at least one step");
  });
});

describe("WorkflowExecutor — Gate Steps", () => {
  it("pauses at a gate step with waiting_approval status", async () => {
    const mock = new MockCommandRunner();
    mock.setSuccess("done");
    const executor = new WorkflowExecutor(mock);
    const events: ExecutorEvent[] = [];
    executor.onEvent((e) => events.push(e));

    const wf = makeWorkflow({
      steps: [
        { id: "s1", name: "Build", type: "agent", agent: "backend", goal: "Build" } as AgentStepDef,
        { id: "gate-1", name: "Review", type: "gate", reviewArtifact: "output.md" } as GateStepDef,
        {
          id: "s2",
          name: "Deploy",
          type: "agent",
          agent: "backend",
          goal: "Deploy",
        } as AgentStepDef,
      ],
    });
    const runState = executor.startRun(wf);
    const result = await executor.executeRun(wf, runState);

    expect(result.status).toBe("waiting_approval");
    expect(result.steps["gate-1"].status).toBe("waiting");
    expect(result.steps["s2"].status).toBe("pending"); // not yet executed
    expect(mock.calls).toHaveLength(1); // only first agent ran
    expect(events.some((e) => e.type === "gate-waiting")).toBe(true);
  });

  it("resumes after gate approval", async () => {
    const mock = new MockCommandRunner();
    mock.setResponses([
      { exitCode: 0, stdout: "built", stderr: "" },
      { exitCode: 0, stdout: "deployed", stderr: "" },
    ]);
    const executor = new WorkflowExecutor(mock);

    const wf = makeWorkflow({
      steps: [
        { id: "s1", name: "Build", type: "agent", agent: "backend", goal: "Build" } as AgentStepDef,
        { id: "gate-1", name: "Review", type: "gate" } as GateStepDef,
        {
          id: "s2",
          name: "Deploy",
          type: "agent",
          agent: "backend",
          goal: "Deploy",
        } as AgentStepDef,
      ],
    });
    const runState = executor.startRun(wf);
    await executor.executeRun(wf, runState);

    expect(runState.status).toBe("waiting_approval");

    // Approve the gate
    const result = await executor.approveGate(runState, "gate-1", wf);

    expect(result.status).toBe("completed");
    expect(result.steps["gate-1"].status).toBe("completed");
    expect(result.steps["gate-1"].approvedBy).toBe("user");
    expect(result.steps["s2"].status).toBe("completed");
    expect(mock.calls).toHaveLength(2);
  });

  it("cancels run when gate is rejected without feedback", async () => {
    const mock = new MockCommandRunner();
    mock.setSuccess("done");
    const executor = new WorkflowExecutor(mock);

    const wf = makeWorkflow({
      steps: [
        { id: "s1", name: "Build", type: "agent", agent: "backend", goal: "Build" } as AgentStepDef,
        { id: "gate-1", name: "Review", type: "gate" } as GateStepDef,
        {
          id: "s2",
          name: "Deploy",
          type: "agent",
          agent: "backend",
          goal: "Deploy",
        } as AgentStepDef,
      ],
    });
    const runState = executor.startRun(wf);
    await executor.executeRun(wf, runState);

    const result = await executor.rejectGate(runState, "gate-1", wf);

    expect(result.status).toBe("cancelled");
    expect(result.steps["gate-1"].rejectedAt).toBeDefined();
  });

  it("re-runs previous agent with feedback when gate is rejected with feedback", async () => {
    const mock = new MockCommandRunner();
    mock.setResponses([
      { exitCode: 0, stdout: "built v1", stderr: "" },
      { exitCode: 0, stdout: "built v2 with feedback", stderr: "" },
      { exitCode: 0, stdout: "deployed", stderr: "" },
    ]);
    const executor = new WorkflowExecutor(mock);

    const wf = makeWorkflow({
      steps: [
        {
          id: "s1",
          name: "Build",
          type: "agent",
          agent: "backend",
          goal: "Build the API",
        } as AgentStepDef,
        { id: "gate-1", name: "Review", type: "gate", allowFeedback: true } as GateStepDef,
        {
          id: "s2",
          name: "Deploy",
          type: "agent",
          agent: "backend",
          goal: "Deploy",
        } as AgentStepDef,
      ],
    });
    const runState = executor.startRun(wf);
    await executor.executeRun(wf, runState);

    const result = await executor.rejectGate(runState, "gate-1", wf, "Please add error handling");

    // After reject with feedback: agent re-runs, then gate re-presents
    expect(result.status).toBe("waiting_approval");
    expect(result.steps["gate-1"].feedback).toBe("Please add error handling");
    // The re-run should have the feedback appended to the goal
    const rerunArgs = mock.calls[1].args.join(" ");
    expect(rerunArgs).toContain("Please add error handling");

    // Now approve the gate to complete the workflow
    const final = await executor.approveGate(result, "gate-1", wf);
    expect(final.status).toBe("completed");
    expect(mock.calls).toHaveLength(3); // build, rebuild, deploy
  });

  it("gate without artifact still works", async () => {
    const mock = new MockCommandRunner();
    mock.setSuccess("done");
    const executor = new WorkflowExecutor(mock);
    const events: ExecutorEvent[] = [];
    executor.onEvent((e) => events.push(e));

    const wf = makeWorkflow({
      steps: [
        { id: "s1", name: "Build", type: "agent", agent: "backend", goal: "Build" } as AgentStepDef,
        { id: "gate-1", name: "Approve", type: "gate" } as GateStepDef,
      ],
    });
    const runState = executor.startRun(wf);
    await executor.executeRun(wf, runState);

    const gateEvent = events.find((e) => e.type === "gate-waiting");
    expect(gateEvent).toBeDefined();
    expect(gateEvent!.data?.artifactPath).toBeUndefined();
  });

  it("gate with artifact includes path in event", async () => {
    const mock = new MockCommandRunner();
    mock.setSuccess("done");
    const executor = new WorkflowExecutor(mock);
    const events: ExecutorEvent[] = [];
    executor.onEvent((e) => events.push(e));

    const wf = makeWorkflow({
      steps: [
        { id: "s1", name: "Build", type: "agent", agent: "backend", goal: "Build" } as AgentStepDef,
        { id: "gate-1", name: "Review", type: "gate", reviewArtifact: "report.md" } as GateStepDef,
      ],
    });
    const runState = executor.startRun(wf);
    await executor.executeRun(wf, runState);

    const gateEvent = events.find((e) => e.type === "gate-waiting");
    expect(gateEvent!.data?.artifactPath).toBe("report.md");
  });
});
