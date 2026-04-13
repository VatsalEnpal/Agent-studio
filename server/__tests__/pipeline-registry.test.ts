import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { PipelineRegistry, setPipelineBaseDir } from "../workflows/workflow-registry.js";
import {
  setBaseDir as setRunStateBaseDir,
  saveRunState,
  type RunState,
} from "../workflows/run-state.js";
import type { WorkflowPipelineDef, AgentStepDef } from "../workflows/definition.js";

const TEST_DIR = join(process.cwd(), ".test-pipeline-registry-" + Date.now());

function makeDef(overrides: Partial<WorkflowPipelineDef> = {}): WorkflowPipelineDef {
  return {
    id: "test-wf",
    name: "Test Workflow",
    mode: "execute",
    trigger: { type: "manual" },
    workingDirectory: "/tmp/test",
    steps: [
      {
        id: "s1",
        name: "Build",
        type: "agent",
        agent: "backend",
        goal: "Build it",
      } as AgentStepDef,
    ],
    ...overrides,
  };
}

beforeEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
  setPipelineBaseDir(TEST_DIR);
  setRunStateBaseDir(TEST_DIR);
});

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("PipelineRegistry", () => {
  it("CRUD roundtrip: create, read, update, delete", () => {
    const registry = new PipelineRegistry();

    // Create
    const saveResult = registry.saveWorkflow(makeDef());
    expect(saveResult.error).toBeUndefined();

    // Read
    const loaded = registry.getWorkflow("test-wf");
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe("Test Workflow");

    // Update
    const updateResult = registry.updateWorkflow("test-wf", { name: "Updated Name" });
    expect(updateResult.error).toBeUndefined();
    const updated = registry.getWorkflow("test-wf");
    expect(updated!.name).toBe("Updated Name");

    // Delete
    const deleteResult = registry.deleteWorkflow("test-wf");
    expect(deleteResult.error).toBeUndefined();
    expect(registry.getWorkflow("test-wf")).toBeNull();
  });

  it("rejects saving invalid workflow", () => {
    const registry = new PipelineRegistry();
    const result = registry.saveWorkflow(makeDef({ steps: [] }));
    expect(result.error).toBeDefined();
    expect(result.error).toContain("at least one step");
  });

  it("blocks delete when active run exists", () => {
    const registry = new PipelineRegistry();
    registry.saveWorkflow(makeDef());

    // Create an active run
    const runState: RunState = {
      runId: "run-1",
      workflowId: "test-wf",
      status: "running",
      currentStep: "s1",
      startedAt: new Date().toISOString(),
      steps: { s1: { id: "s1", status: "running" } },
    };
    saveRunState(runState);

    const result = registry.deleteWorkflow("test-wf");
    expect(result.error).toBeDefined();
    expect(result.error).toContain("active runs");
  });

  it("blocks update when active run exists", () => {
    const registry = new PipelineRegistry();
    registry.saveWorkflow(makeDef());

    const runState: RunState = {
      runId: "run-1",
      workflowId: "test-wf",
      status: "running",
      currentStep: "s1",
      startedAt: new Date().toISOString(),
      steps: { s1: { id: "s1", status: "running" } },
    };
    saveRunState(runState);

    const result = registry.updateWorkflow("test-wf", { name: "New Name" });
    expect(result.error).toBeDefined();
    expect(result.error).toContain("active runs");
  });

  it("lists all workflows after creating multiple", () => {
    const registry = new PipelineRegistry();
    registry.saveWorkflow(makeDef({ id: "wf-1", name: "Workflow 1" }));
    registry.saveWorkflow(makeDef({ id: "wf-2", name: "Workflow 2" }));
    registry.saveWorkflow(makeDef({ id: "wf-3", name: "Workflow 3" }));

    const all = registry.listWorkflows();
    expect(all).toHaveLength(3);
    expect(all.map((w) => w.id).sort()).toEqual(["wf-1", "wf-2", "wf-3"]);
  });

  it("returns null for nonexistent workflow", () => {
    const registry = new PipelineRegistry();
    expect(registry.getWorkflow("nonexistent")).toBeNull();
  });

  it("returns error when updating nonexistent workflow", () => {
    const registry = new PipelineRegistry();
    const result = registry.updateWorkflow("nonexistent", { name: "X" });
    expect(result.error).toContain("not found");
  });
});
