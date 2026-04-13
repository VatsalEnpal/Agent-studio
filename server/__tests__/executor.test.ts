import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { MockCommandRunner } from "../workflows/command-runner.js";
import { WorkflowExecutor, type ExecutorEvent } from "../workflows/executor.js";
import { setBaseDir, loadRunState } from "../workflows/run-state.js";
import type {
  WorkflowPipelineDef,
  AgentStepDef,
  GateStepDef,
  LoopStepDef,
  AgentGroupStepDef,
} from "../workflows/definition.js";

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

describe("WorkflowExecutor — Loop Steps", () => {
  it("exits loop when condition met on 2nd iteration", async () => {
    const mock = new MockCommandRunner();
    // Iteration 1: build ok, qa fails. Iteration 2: build ok, qa ok.
    mock.setResponses([
      { exitCode: 0, stdout: "built", stderr: "" },
      { exitCode: 1, stdout: "", stderr: "qa failed" },
      { exitCode: 0, stdout: "rebuilt", stderr: "" },
      { exitCode: 0, stdout: "qa passed", stderr: "" },
    ]);
    const executor = new WorkflowExecutor(mock);

    const wf = makeWorkflow({
      steps: [
        {
          id: "build",
          name: "Build",
          type: "agent",
          agent: "backend",
          goal: "Build",
        } as AgentStepDef,
        { id: "qa", name: "QA", type: "agent", agent: "qa", goal: "Test" } as AgentStepDef,
        {
          id: "loop-1",
          name: "QA Loop",
          type: "loop",
          steps: ["build", "qa"],
          maxIterations: 3,
        } as LoopStepDef,
      ],
    });
    const runState = executor.startRun(wf);
    const result = await executor.executeRun(wf, runState);

    expect(result.steps["loop-1"].status).toBe("completed");
    expect(result.steps["loop-1"].iteration).toBe(2);
    expect(result.status).toBe("completed");
    expect(mock.calls).toHaveLength(4);
  });

  it("pauses when max iterations exhausted (default onExhausted)", async () => {
    const mock = new MockCommandRunner();
    // All iterations fail qa
    mock.setResponses([
      { exitCode: 0, stdout: "built", stderr: "" },
      { exitCode: 1, stdout: "", stderr: "qa failed" },
      { exitCode: 0, stdout: "built", stderr: "" },
      { exitCode: 1, stdout: "", stderr: "qa failed" },
      { exitCode: 0, stdout: "built", stderr: "" },
      { exitCode: 1, stdout: "", stderr: "qa failed" },
    ]);
    const executor = new WorkflowExecutor(mock);

    const wf = makeWorkflow({
      steps: [
        {
          id: "build",
          name: "Build",
          type: "agent",
          agent: "backend",
          goal: "Build",
        } as AgentStepDef,
        { id: "qa", name: "QA", type: "agent", agent: "qa", goal: "Test" } as AgentStepDef,
        {
          id: "loop-1",
          name: "QA Loop",
          type: "loop",
          steps: ["build", "qa"],
          maxIterations: 3,
        } as LoopStepDef,
      ],
    });
    const runState = executor.startRun(wf);
    const result = await executor.executeRun(wf, runState);

    expect(result.steps["loop-1"].status).toBe("failed");
    expect(result.steps["loop-1"].error).toContain("3 iterations");
    expect(result.status).toBe("paused");
  });

  it("passes on first iteration when condition met immediately", async () => {
    const mock = new MockCommandRunner();
    mock.setResponses([
      { exitCode: 0, stdout: "built", stderr: "" },
      { exitCode: 0, stdout: "qa passed", stderr: "" },
    ]);
    const executor = new WorkflowExecutor(mock);

    const wf = makeWorkflow({
      steps: [
        {
          id: "build",
          name: "Build",
          type: "agent",
          agent: "backend",
          goal: "Build",
        } as AgentStepDef,
        { id: "qa", name: "QA", type: "agent", agent: "qa", goal: "Test" } as AgentStepDef,
        {
          id: "loop-1",
          name: "QA Loop",
          type: "loop",
          steps: ["build", "qa"],
          maxIterations: 1,
        } as LoopStepDef,
      ],
    });
    const runState = executor.startRun(wf);
    const result = await executor.executeRun(wf, runState);

    expect(result.steps["loop-1"].status).toBe("completed");
    expect(result.steps["loop-1"].iteration).toBe(1);
    expect(result.status).toBe("completed");
  });

  it("fails run when onExhausted is 'fail'", async () => {
    const mock = new MockCommandRunner();
    mock.setResponses([
      { exitCode: 0, stdout: "built", stderr: "" },
      { exitCode: 1, stdout: "", stderr: "qa failed" },
    ]);
    const executor = new WorkflowExecutor(mock);
    const events: ExecutorEvent[] = [];
    executor.onEvent((e) => events.push(e));

    const wf = makeWorkflow({
      steps: [
        {
          id: "build",
          name: "Build",
          type: "agent",
          agent: "backend",
          goal: "Build",
        } as AgentStepDef,
        { id: "qa", name: "QA", type: "agent", agent: "qa", goal: "Test" } as AgentStepDef,
        {
          id: "loop-1",
          name: "QA Loop",
          type: "loop",
          steps: ["build", "qa"],
          maxIterations: 1,
          onExhausted: "fail",
        } as LoopStepDef,
      ],
    });
    const runState = executor.startRun(wf);
    const result = await executor.executeRun(wf, runState);

    expect(result.status).toBe("failed");
    expect(events.some((e) => e.type === "run-failed")).toBe(true);
  });

  it("skips loop when onExhausted is 'skip' and continues", async () => {
    const mock = new MockCommandRunner();
    mock.setResponses([
      { exitCode: 0, stdout: "built", stderr: "" },
      { exitCode: 1, stdout: "", stderr: "qa failed" },
      { exitCode: 0, stdout: "deployed", stderr: "" },
    ]);
    const executor = new WorkflowExecutor(mock);

    const wf = makeWorkflow({
      steps: [
        {
          id: "build",
          name: "Build",
          type: "agent",
          agent: "backend",
          goal: "Build",
        } as AgentStepDef,
        { id: "qa", name: "QA", type: "agent", agent: "qa", goal: "Test" } as AgentStepDef,
        {
          id: "loop-1",
          name: "QA Loop",
          type: "loop",
          steps: ["build", "qa"],
          maxIterations: 1,
          onExhausted: "skip",
        } as LoopStepDef,
        {
          id: "deploy",
          name: "Deploy",
          type: "agent",
          agent: "backend",
          goal: "Deploy",
        } as AgentStepDef,
      ],
    });
    const runState = executor.startRun(wf);
    const result = await executor.executeRun(wf, runState);

    expect(result.steps["loop-1"].status).toBe("skipped");
    expect(result.steps["deploy"].status).toBe("completed");
    expect(result.status).toBe("completed");
  });
});

describe("WorkflowExecutor — Timeout + Cancellation", () => {
  it("times out a step when mock delays exceed timeout", async () => {
    const mock = new MockCommandRunner();
    mock.setTimeout(5000); // 5s delay
    const executor = new WorkflowExecutor(mock);

    const wf = makeWorkflow({
      steps: [
        {
          id: "s1",
          name: "Slow Step",
          type: "agent",
          agent: "backend",
          goal: "Do something slowly",
          timeout: 0.1, // 100ms timeout
        } as AgentStepDef,
      ],
    });
    const runState = executor.startRun(wf);

    // executeAgentStep will use AbortController with the step's timeout
    // but the mock uses the signal to detect abort
    const abortController = new AbortController();
    setTimeout(() => abortController.abort(), 50);

    await executor.executeAgentStep(
      runState,
      wf.steps[0] as AgentStepDef,
      wf,
      abortController.signal,
    );

    expect(runState.steps["s1"].status).toBe("timeout");
    expect(runState.steps["s1"].error).toContain("timed out");
  });

  it("cancels a running workflow via cancelRun", async () => {
    const mock = new MockCommandRunner();
    mock.setResponses([
      { exitCode: 0, stdout: "step1", stderr: "", delayMs: 200 },
      { exitCode: 0, stdout: "step2", stderr: "" },
    ]);
    const executor = new WorkflowExecutor(mock);

    const wf = makeWorkflow({
      steps: [
        {
          id: "s1",
          name: "Step 1",
          type: "agent",
          agent: "backend",
          goal: "Do thing 1",
        } as AgentStepDef,
        {
          id: "s2",
          name: "Step 2",
          type: "agent",
          agent: "backend",
          goal: "Do thing 2",
        } as AgentStepDef,
      ],
    });
    const runState = executor.startRun(wf);

    // Start execution and cancel after 50ms
    const runPromise = executor.executeRun(wf, runState);
    setTimeout(() => executor.cancelRun(runState.runId), 50);

    const result = await runPromise;

    // Should be cancelled or the first step timed out
    expect(["cancelled", "paused"]).toContain(result.status);
  });

  it("pauses a running workflow via pauseRun", async () => {
    const mock = new MockCommandRunner();
    // First step takes 100ms so pause has time to take effect before step 2
    mock.setResponses([
      { exitCode: 0, stdout: "step1", stderr: "", delayMs: 100 },
      { exitCode: 0, stdout: "step2", stderr: "" },
    ]);
    const executor = new WorkflowExecutor(mock);

    const wf = makeWorkflow({
      steps: [
        {
          id: "s1",
          name: "Step 1",
          type: "agent",
          agent: "backend",
          goal: "Do thing 1",
        } as AgentStepDef,
        {
          id: "s2",
          name: "Step 2",
          type: "agent",
          agent: "backend",
          goal: "Do thing 2",
        } as AgentStepDef,
      ],
    });
    const runState = executor.startRun(wf);

    // Start run, then pause after 20ms (while step 1 is executing)
    const runPromise = executor.executeRun(wf, runState);
    setTimeout(() => executor.pauseRun(runState.runId), 20);
    const result = await runPromise;

    // Step 1 completes, but pause flag is checked before step 2
    expect(result.status).toBe("paused");
    expect(result.steps["s1"].status).toBe("completed");
    expect(result.steps["s2"].status).toBe("pending");
  });
});

describe("WorkflowExecutor — Nested Agent Groups", () => {
  it("executes agent-group with 3 sub-steps in order", async () => {
    const mock = new MockCommandRunner();
    mock.setResponses([
      { exitCode: 0, stdout: "sub1", stderr: "" },
      { exitCode: 0, stdout: "sub2", stderr: "" },
      { exitCode: 0, stdout: "sub3", stderr: "" },
    ]);
    const executor = new WorkflowExecutor(mock);

    const wf = makeWorkflow({
      steps: [
        {
          id: "group-1",
          name: "Clearing",
          type: "agent-group",
          agent: "clearing-agent",
          visibility: "transparent",
          steps: [
            {
              id: "sub-1",
              name: "Fetch",
              type: "agent",
              agent: "fetcher",
              goal: "Fetch data",
            } as AgentStepDef,
            {
              id: "sub-2",
              name: "Process",
              type: "agent",
              agent: "processor",
              goal: "Process data",
            } as AgentStepDef,
            {
              id: "sub-3",
              name: "Validate",
              type: "agent",
              agent: "validator",
              goal: "Validate data",
            } as AgentStepDef,
          ],
        } as AgentGroupStepDef,
      ],
    });
    const runState = executor.startRun(wf);
    const result = await executor.executeRun(wf, runState);

    expect(result.status).toBe("completed");
    expect(result.steps["group-1"].status).toBe("completed");
    expect(result.steps["group-1"].subSteps?.["sub-1"].status).toBe("completed");
    expect(result.steps["group-1"].subSteps?.["sub-2"].status).toBe("completed");
    expect(result.steps["group-1"].subSteps?.["sub-3"].status).toBe("completed");
    expect(mock.calls).toHaveLength(3);
  });

  it("pauses at a gate sub-step within agent-group", async () => {
    const mock = new MockCommandRunner();
    mock.setSuccess("done");
    const executor = new WorkflowExecutor(mock);
    const events: ExecutorEvent[] = [];
    executor.onEvent((e) => events.push(e));

    const wf = makeWorkflow({
      steps: [
        {
          id: "group-1",
          name: "Pipeline",
          type: "agent-group",
          steps: [
            {
              id: "sub-1",
              name: "Build",
              type: "agent",
              agent: "backend",
              goal: "Build",
            } as AgentStepDef,
            {
              id: "sub-gate",
              name: "Review",
              type: "gate",
              reviewArtifact: "output.md",
            } as GateStepDef,
            {
              id: "sub-2",
              name: "Deploy",
              type: "agent",
              agent: "backend",
              goal: "Deploy",
            } as AgentStepDef,
          ],
        } as AgentGroupStepDef,
      ],
    });
    const runState = executor.startRun(wf);
    const result = await executor.executeRun(wf, runState);

    expect(result.status).toBe("waiting_approval");
    expect(result.steps["group-1"].subSteps?.["sub-1"].status).toBe("completed");
    expect(result.steps["group-1"].subSteps?.["sub-gate"].status).toBe("waiting");
    expect(events.some((e) => e.type === "gate-waiting" && e.stepId === "sub-gate")).toBe(true);
  });

  it("fails parent step when sub-step fails", async () => {
    const mock = new MockCommandRunner();
    mock.setResponses([
      { exitCode: 0, stdout: "ok", stderr: "" },
      { exitCode: 1, stdout: "", stderr: "sub failed" },
    ]);
    const executor = new WorkflowExecutor(mock);

    const wf = makeWorkflow({
      steps: [
        {
          id: "group-1",
          name: "Pipeline",
          type: "agent-group",
          steps: [
            {
              id: "sub-1",
              name: "Fetch",
              type: "agent",
              agent: "fetcher",
              goal: "Fetch",
            } as AgentStepDef,
            {
              id: "sub-2",
              name: "Process",
              type: "agent",
              agent: "processor",
              goal: "Process",
            } as AgentStepDef,
          ],
        } as AgentGroupStepDef,
      ],
    });
    const runState = executor.startRun(wf);
    const result = await executor.executeRun(wf, runState);

    expect(result.steps["group-1"].status).toBe("failed");
    expect(result.steps["group-1"].subSteps?.["sub-1"].status).toBe("completed");
    expect(result.steps["group-1"].subSteps?.["sub-2"].status).toBe("failed");
  });

  it("tracks sub-steps in opaque mode (only parent status visible)", async () => {
    const mock = new MockCommandRunner();
    mock.setSuccess("done");
    const executor = new WorkflowExecutor(mock);

    const wf = makeWorkflow({
      steps: [
        {
          id: "group-1",
          name: "Opaque Group",
          type: "agent-group",
          visibility: "opaque",
          steps: [
            {
              id: "sub-1",
              name: "Do Work",
              type: "agent",
              agent: "backend",
              goal: "Work",
            } as AgentStepDef,
          ],
        } as AgentGroupStepDef,
      ],
    });
    const runState = executor.startRun(wf);
    const result = await executor.executeRun(wf, runState);

    // In opaque mode the executor still tracks internally, but the
    // visibility flag tells the UI how to render (not the executor's concern)
    expect(result.steps["group-1"].status).toBe("completed");
  });
});

describe("WorkflowExecutor — Rate Limit Detection", () => {
  it("detects rate limit and retries successfully", async () => {
    const mock = new MockCommandRunner();
    mock.setResponses([
      { exitCode: 1, stdout: "429 Too Many Requests", stderr: "" },
      { exitCode: 0, stdout: "success after retry", stderr: "" },
    ]);
    const executor = new WorkflowExecutor(mock);
    executor._testRetryDelayMs = 10; // 10ms instead of 60s

    const wf = makeWorkflow();
    const runState = executor.startRun(wf);
    const result = await executor.executeRun(wf, runState);

    expect(result.status).toBe("completed");
    expect(result.steps["step-1"].status).toBe("completed");
    expect(mock.calls).toHaveLength(2); // original + retry
  });

  it("pauses run when both attempts are rate limited", async () => {
    const mock = new MockCommandRunner();
    mock.setResponses([
      { exitCode: 1, stdout: "429 Too Many Requests", stderr: "" },
      { exitCode: 1, stdout: "429 Too Many Requests", stderr: "" },
    ]);
    const executor = new WorkflowExecutor(mock);
    executor._testRetryDelayMs = 10;

    const wf = makeWorkflow();
    const runState = executor.startRun(wf);
    const result = await executor.executeRun(wf, runState);

    expect(result.status).toBe("paused");
    expect(result.steps["step-1"].status).toBe("failed");
    expect(result.steps["step-1"].error).toContain("Rate limited after retry");
  });

  it("detects overloaded keyword in stderr", async () => {
    const mock = new MockCommandRunner();
    mock.setResponses([
      { exitCode: 1, stdout: "", stderr: "Server overloaded, try later" },
      { exitCode: 0, stdout: "ok", stderr: "" },
    ]);
    const executor = new WorkflowExecutor(mock);
    executor._testRetryDelayMs = 10;

    const wf = makeWorkflow();
    const runState = executor.startRun(wf);
    const result = await executor.executeRun(wf, runState);

    expect(result.status).toBe("completed");
    expect(mock.calls).toHaveLength(2);
  });
});
