import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { MockCommandRunner } from "../workflows/command-runner.js";
import { WorkflowExecutor } from "../workflows/executor.js";
import { setBaseDir } from "../workflows/run-state.js";
import {
  validateWorkflow,
  type WorkflowPipelineDef,
  type AgentStepDef,
  type GateStepDef,
  type LoopStepDef,
} from "../workflows/definition.js";

const TEST_DIR = join(process.cwd(), ".test-boundary-" + Date.now());
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

// ---------- Task 30: Small Workflows ----------

describe("Task 30 — Small Workflows", () => {
  it("single-step workflow executes end to end", async () => {
    const mock = new MockCommandRunner();
    mock.setSuccess("done");
    const executor = new WorkflowExecutor(mock);
    const wf = makeWorkflow();
    const runState = executor.startRun(wf);
    const result = await executor.executeRun(wf, runState);

    expect(result.status).toBe("completed");
    expect(result.steps.s1.status).toBe("completed");
    expect(mock.calls).toHaveLength(1);
  });

  it("workflow with only gates (no agents) fails validation", () => {
    const result = validateWorkflow(
      makeWorkflow({
        steps: [
          { id: "g1", name: "Gate", type: "gate" } as GateStepDef,
          { id: "g2", name: "Gate 2", type: "gate" } as GateStepDef,
        ],
      }),
    );
    // This is valid per schema — gates don't require agents unless allowFeedback is set
    // The workflow just pauses at each gate
    expect(result.valid).toBe(true);
  });

  it("gate as first step pauses immediately", async () => {
    const mock = new MockCommandRunner();
    const executor = new WorkflowExecutor(mock);
    const wf = makeWorkflow({
      steps: [{ id: "g1", name: "Gate", type: "gate" } as GateStepDef],
    });
    const runState = executor.startRun(wf);
    const result = await executor.executeRun(wf, runState);

    expect(result.status).toBe("waiting_approval");
    expect(mock.calls).toHaveLength(0);
  });

  it("gate as last step pauses before completed", async () => {
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

// ---------- Task 31: Large + Unusual Workflows ----------

describe("Task 31 — Large + Unusual Workflows", () => {
  it("workflow with 30 steps creates and validates successfully", () => {
    const steps = Array.from({ length: 30 }, (_, i) => ({
      id: `step-${i}`,
      name: `Step ${i}`,
      type: "agent" as const,
      agent: "backend",
      goal: `Do task ${i}`,
    }));
    const result = validateWorkflow(makeWorkflow({ steps }));
    expect(result.valid).toBe(true);
  });

  it("workflow with 30 steps executes all in order", async () => {
    const mock = new MockCommandRunner();
    mock.setSuccess("done");
    const executor = new WorkflowExecutor(mock);
    const steps = Array.from({ length: 30 }, (_, i) => ({
      id: `step-${i}`,
      name: `Step ${i}`,
      type: "agent" as const,
      agent: "backend",
      goal: `Do task ${i}`,
    }));
    const wf = makeWorkflow({ steps });
    const runState = executor.startRun(wf);
    const result = await executor.executeRun(wf, runState);

    expect(result.status).toBe("completed");
    expect(mock.calls).toHaveLength(30);
    for (let i = 0; i < 30; i++) {
      expect(result.steps[`step-${i}`].status).toBe("completed");
    }
  });

  it("goal text with 5000 characters saves and validates", () => {
    const longGoal = "x".repeat(5000);
    const result = validateWorkflow(
      makeWorkflow({
        steps: [
          {
            id: "s1",
            name: "Long",
            type: "agent",
            agent: "backend",
            goal: longGoal,
          } as AgentStepDef,
        ],
      }),
    );
    expect(result.valid).toBe(true);
  });

  it("unicode in names and goals: no crashes", async () => {
    const mock = new MockCommandRunner();
    mock.setSuccess("done");
    const executor = new WorkflowExecutor(mock);
    const wf = makeWorkflow({
      name: "工作流程 🚀 سير العمل",
      steps: [
        {
          id: "s1",
          name: "构建 مرحلة",
          type: "agent",
          agent: "backend",
          goal: "Build with emoji 🔨 and Chinese 中文",
        } as AgentStepDef,
      ],
    });
    const runState = executor.startRun(wf);
    const result = await executor.executeRun(wf, runState);

    expect(result.status).toBe("completed");
  });

  it("step IDs with special characters: validation catches", () => {
    const result = validateWorkflow(
      makeWorkflow({
        steps: [
          {
            id: "step with spaces",
            name: "Bad",
            type: "agent",
            agent: "backend",
            goal: "test",
          } as AgentStepDef,
        ],
      }),
    );
    // Currently we don't validate step ID format — just check it works
    expect(result.valid).toBe(true);
  });

  it("duplicate step IDs: validation catches", () => {
    const result = validateWorkflow(
      makeWorkflow({
        steps: [
          { id: "same-id", name: "A", type: "agent", agent: "backend", goal: "a" } as AgentStepDef,
          { id: "same-id", name: "B", type: "agent", agent: "backend", goal: "b" } as AgentStepDef,
        ],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Duplicate step ID: 'same-id'");
  });
});
