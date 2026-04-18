import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { MockCommandRunner } from "../workflows/command-runner.js";
import { WorkflowExecutor, type ExecutorEvent } from "../workflows/executor.js";
import { setBaseDir } from "../workflows/run-state.js";
import type { WorkflowPipelineDef, AgentStepDef } from "../workflows/definition.js";

const TEST_DIR = join(process.cwd(), ".test-approve-finish-" + Date.now());
const WORK_DIR = join(TEST_DIR, "workdir");

beforeEach(() => {
  setBaseDir(join(TEST_DIR, "state"));
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(WORK_DIR, { recursive: true });
});
afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("approve-before-finish advances post-approval", () => {
  it("noop + approve-before-finish: approving step1 completes the run", async () => {
    const mock = new MockCommandRunner();
    const executor = new WorkflowExecutor(mock);
    const events: ExecutorEvent[] = [];
    executor.onEvent((e) => events.push(e));

    const wf: WorkflowPipelineDef = {
      id: "wf-test",
      name: "test",
      mode: "execute",
      trigger: { type: "manual" },
      workingDirectory: WORK_DIR,
      steps: [
        {
          id: "step1",
          name: "Step 1",
          type: "agent",
          agent: "test-noop",
          goal: "first",
          runtime: "noop",
          gate: "approve-before-finish",
        } as AgentStepDef,
        {
          id: "step2",
          name: "Step 2",
          type: "agent",
          agent: "test-noop",
          goal: "second",
          runtime: "noop",
        } as AgentStepDef,
      ],
    };

    const runState = executor.startRun(wf);
    const runPromise = executor.executeRun(wf, runState);

    // Wait for step1 to pause at the approve-before-finish gate.
    await new Promise((r) => setTimeout(r, 50));

    expect(runState.status).toBe("waiting_approval");
    expect(runState.steps.step1.status).toBe("waiting");

    // Approve the gate via the same code path the HTTP handler hits.
    const approved = executor.approveStepGate(runState.runId, "step1");
    expect(approved).toBe(true);

    const result = await runPromise;

    expect(result.status).toBe("completed");
    expect(result.steps.step1.status).toBe("completed");
    expect(result.steps.step1.approvedAt).toBeDefined();
    expect(result.steps.step2.status).toBe("completed");

    const completedEvents = events.filter((e) => e.type === "step-completed");
    expect(completedEvents.map((e) => e.stepId)).toEqual(["step1", "step2"]);
  });
});
