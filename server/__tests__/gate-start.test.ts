/**
 * Mirror of approve-finish-repro.test.ts but for `gate: "approve-before-start"`.
 *
 * Asserts that:
 * - A noop step with `approve-before-start` does NOT emit `step-started`
 *   or `step-completed` before `approveStepGate(runId, stepId)` is called.
 * - Once approved, the step transitions running → completed and step2 proceeds.
 * - The step's output / completedAt are only set after approval.
 * - No gate promise remains in `pendingStepGates` after approval — verified
 *   indirectly via `approveStepGate` returning `false` on a second call.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { MockCommandRunner } from "../workflows/command-runner.js";
import { WorkflowExecutor, type ExecutorEvent } from "../workflows/executor.js";
import { setBaseDir } from "../workflows/run-state.js";
import type { WorkflowPipelineDef, AgentStepDef } from "../workflows/definition.js";

const TEST_DIR = join(process.cwd(), ".test-approve-start-" + Date.now());
const WORK_DIR = join(TEST_DIR, "workdir");

beforeEach(() => {
  setBaseDir(join(TEST_DIR, "state"));
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(WORK_DIR, { recursive: true });
});
afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("approve-before-start pauses pre-dispatch and resumes post-approval", () => {
  it("noop + approve-before-start: step holds before step-started, then completes after approval", async () => {
    const mock = new MockCommandRunner();
    const executor = new WorkflowExecutor(mock);
    const events: ExecutorEvent[] = [];
    executor.onEvent((e) => events.push(e));

    const wf: WorkflowPipelineDef = {
      id: "wf-test-start",
      name: "test-start",
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
          gate: "approve-before-start",
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

    // Wait for step1 to pause at the approve-before-start gate.
    await new Promise((r) => setTimeout(r, 50));

    // Run is paused waiting for approval, step1 is in `waiting` state.
    expect(runState.status).toBe("waiting_approval");
    expect(runState.steps.step1.status).toBe("waiting");

    // CRITICAL: no step-started or step-completed events should have fired
    // for step1 before approval. The only step1 event so far is gate-waiting.
    const preApprovalStep1 = events.filter(
      (e) => e.stepId === "step1" && (e.type === "step-started" || e.type === "step-completed"),
    );
    expect(preApprovalStep1).toEqual([]);
    const gateEvents = events.filter((e) => e.type === "gate-waiting" && e.stepId === "step1");
    expect(gateEvents.length).toBe(1);
    expect(gateEvents[0].data?.gateType).toBe("approve-before-start");

    // step2 must not have been touched yet.
    expect(runState.steps.step2.status).toBe("pending");

    // No output recorded on step1 yet — output is only written post-approval.
    expect(runState.steps.step1.completedAt).toBeUndefined();

    // Approve via the same code path the HTTP handler hits.
    const approved = executor.approveStepGate(runState.runId, "step1");
    expect(approved).toBe(true);

    // A SECOND approve call must return false — proves the entry was removed
    // from pendingStepGates (the private map) after the first resolve.
    const approvedAgain = executor.approveStepGate(runState.runId, "step1");
    expect(approvedAgain).toBe(false);

    const result = await runPromise;

    // Run completed end to end.
    expect(result.status).toBe("completed");
    expect(result.steps.step1.status).toBe("completed");
    expect(result.steps.step1.approvedAt).toBeDefined();
    expect(result.steps.step2.status).toBe("completed");

    // Now both step-started and step-completed must have fired for step1,
    // and step2 must have completed too.
    const completed = events.filter((e) => e.type === "step-completed").map((e) => e.stepId);
    expect(completed).toEqual(["step1", "step2"]);
    const started = events.filter((e) => e.type === "step-started").map((e) => e.stepId);
    expect(started).toContain("step1");
    expect(started).toContain("step2");

    // step1 output is recorded post-approval.
    expect(result.steps.step1.completedAt).toBeDefined();
    expect(result.steps.step1.output).toBeDefined();
  });
});
