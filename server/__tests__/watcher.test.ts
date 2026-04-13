import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { WorkflowWatcher } from "../workflows/watcher.js";
import { setBaseDir } from "../workflows/run-state.js";
import type { WorkflowPipelineDef, AgentStepDef, GateStepDef } from "../workflows/definition.js";

const TEST_DIR = join(process.cwd(), ".test-watcher-" + Date.now());
const STATE_FILE = join(TEST_DIR, "state.json");

function makeWatchWorkflow(overrides: Partial<WorkflowPipelineDef> = {}): WorkflowPipelineDef {
  return {
    id: "watch-wf",
    name: "Watch Workflow",
    mode: "watch",
    trigger: { type: "event", stateFile: STATE_FILE },
    workingDirectory: TEST_DIR,
    stateFile: STATE_FILE,
    steps: [
      {
        id: "step-1",
        name: "Build",
        type: "agent",
        agent: "backend",
        goal: "Build",
      } as AgentStepDef,
      { id: "gate-1", name: "Review", type: "gate" } as GateStepDef,
      {
        id: "step-2",
        name: "Deploy",
        type: "agent",
        agent: "frontend",
        goal: "Deploy",
      } as AgentStepDef,
    ],
    ...overrides,
  };
}

beforeEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DIR, { recursive: true });
  setBaseDir(join(TEST_DIR, "run-state"));
});

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("WorkflowWatcher", () => {
  it("creates a run state when starting to watch", () => {
    const watcher = new WorkflowWatcher();
    const wf = makeWatchWorkflow();

    // Write initial state file
    writeFileSync(STATE_FILE, JSON.stringify({ status: "running", steps: {} }));

    const runState = watcher.startWatching(wf);
    expect(runState).not.toBeNull();
    expect(runState!.workflowId).toBe("watch-wf");
    expect(runState!.status).toBe("running");
    expect(Object.keys(runState!.steps)).toHaveLength(3);

    watcher.stopAll();
  });

  it("reads initial state from existing file", () => {
    const watcher = new WorkflowWatcher();
    const wf = makeWatchWorkflow();

    writeFileSync(
      STATE_FILE,
      JSON.stringify({
        status: "running",
        steps: {
          "step-1": { status: "completed" },
          "gate-1": { status: "waiting" },
        },
      }),
    );

    const runState = watcher.startWatching(wf);
    expect(runState!.steps["step-1"].status).toBe("completed");
    expect(runState!.steps["gate-1"].status).toBe("waiting");
    expect(runState!.steps["step-2"].status).toBe("pending");

    watcher.stopAll();
  });

  it("approves a gate by writing to state file", () => {
    const watcher = new WorkflowWatcher();
    const wf = makeWatchWorkflow();

    writeFileSync(
      STATE_FILE,
      JSON.stringify({
        status: "running",
        steps: { "gate-1": { status: "waiting" } },
      }),
    );

    watcher.startWatching(wf);

    const result = watcher.approveGateInWatchMode("watch-wf", "gate-1", STATE_FILE);
    expect(result).toBe(true);

    // Verify state file was updated
    const data = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
    expect(data.steps["gate-1"].status).toBe("approved");

    // Verify run state was updated
    const runState = watcher.getRunState("watch-wf");
    expect(runState!.steps["gate-1"].status).toBe("completed");
    expect(runState!.steps["gate-1"].approvedBy).toBe("user");

    watcher.stopAll();
  });

  it("does not spawn agents (watch-only)", () => {
    const watcher = new WorkflowWatcher();
    const wf = makeWatchWorkflow();

    writeFileSync(STATE_FILE, JSON.stringify({ status: "running" }));
    const runState = watcher.startWatching(wf);

    // All steps should be pending — no execution happened
    for (const step of Object.values(runState!.steps)) {
      expect(["pending", "completed", "waiting"]).toContain(step.status);
    }

    watcher.stopAll();
  });

  it("stops watching cleanly", () => {
    const watcher = new WorkflowWatcher();
    const wf = makeWatchWorkflow();

    writeFileSync(STATE_FILE, JSON.stringify({ status: "running" }));
    watcher.startWatching(wf);

    expect(watcher.getRunState("watch-wf")).not.toBeNull();

    watcher.stopWatching("watch-wf");
    expect(watcher.getRunState("watch-wf")).toBeNull();
  });

  it("maps sprint format agent statuses", () => {
    const watcher = new WorkflowWatcher();
    const wf = makeWatchWorkflow();

    writeFileSync(
      STATE_FILE,
      JSON.stringify({
        status: "in_progress",
        agents: {
          backend: "working",
          frontend: "not_spawned",
        },
      }),
    );

    const runState = watcher.startWatching(wf);
    expect(runState!.steps["step-1"].status).toBe("running"); // working → running
    expect(runState!.steps["step-2"].status).toBe("pending"); // not_spawned → pending

    watcher.stopAll();
  });
});
