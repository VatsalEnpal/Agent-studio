import { describe, it, expect } from "vitest";
import {
  validateWorkflow,
  parseInterval,
  type WorkflowPipelineDef,
  type AgentStepDef,
  type GateStepDef,
  type LoopStepDef,
  type AgentGroupStepDef,
} from "../workflows/definition.js";

// ---------- Helper: minimal valid workflow ----------

function makeWorkflow(overrides: Partial<WorkflowPipelineDef> = {}): WorkflowPipelineDef {
  return {
    id: "test-workflow",
    name: "Test Workflow",
    mode: "execute",
    trigger: { type: "manual" },
    workingDirectory: "/tmp/test",
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

// ---------- parseInterval ----------

describe("parseInterval", () => {
  it("parses seconds", () => {
    expect(parseInterval("every 30s")).toBe(30_000);
  });

  it("parses minutes", () => {
    expect(parseInterval("every 30m")).toBe(1_800_000);
  });

  it("parses hours", () => {
    expect(parseInterval("every 2h")).toBe(7_200_000);
  });

  it("parses days", () => {
    expect(parseInterval("every 1d")).toBe(86_400_000);
  });

  it("returns null for invalid format", () => {
    expect(parseInterval("invalid")).toBeNull();
    expect(parseInterval("2h")).toBeNull();
    expect(parseInterval("every")).toBeNull();
  });
});

// ---------- Validation Rule 1: No steps defined ----------

describe("Rule 1: No steps defined", () => {
  it("rejects workflow with empty steps array", () => {
    const result = validateWorkflow(makeWorkflow({ steps: [] }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Workflow must have at least one step");
  });
});

// ---------- Validation Rule 2: Loop references nonexistent steps ----------

describe("Rule 2: Loop references nonexistent steps", () => {
  it("rejects loop that references a step that does not exist", () => {
    const wf = makeWorkflow({
      steps: [
        {
          id: "step-1",
          name: "Build",
          type: "agent",
          agent: "backend",
          goal: "Build",
        } as AgentStepDef,
        {
          id: "loop-1",
          name: "QA Loop",
          type: "loop",
          steps: ["step-1", "nonexistent-step"],
          maxIterations: 3,
        } as LoopStepDef,
      ],
    });
    const result = validateWorkflow(wf);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining("'nonexistent-step' which is not defined")]),
    );
  });
});

// ---------- Validation Rule 3: Circular loop ----------

describe("Rule 3: Circular loop", () => {
  it("rejects loop that contains itself", () => {
    const wf = makeWorkflow({
      steps: [
        {
          id: "step-1",
          name: "Build",
          type: "agent",
          agent: "backend",
          goal: "Build",
        } as AgentStepDef,
        {
          id: "loop-1",
          name: "Self Loop",
          type: "loop",
          steps: ["step-1", "loop-1"],
          maxIterations: 3,
        } as LoopStepDef,
      ],
    });
    const result = validateWorkflow(wf);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining("circular reference")]),
    );
  });
});

// ---------- Validation Rule 4: Gate with feedback but no previous agent ----------

describe("Rule 4: Gate with feedback but no previous agent step", () => {
  it("rejects gate with allowFeedback as first step", () => {
    const wf = makeWorkflow({
      steps: [
        {
          id: "gate-1",
          name: "Review",
          type: "gate",
          allowFeedback: true,
        } as GateStepDef,
      ],
    });
    const result = validateWorkflow(wf);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("has no previous agent step to send feedback to"),
      ]),
    );
  });

  it("accepts gate with allowFeedback after an agent step", () => {
    const wf = makeWorkflow({
      steps: [
        {
          id: "step-1",
          name: "Build",
          type: "agent",
          agent: "backend",
          goal: "Build",
        } as AgentStepDef,
        {
          id: "gate-1",
          name: "Review",
          type: "gate",
          allowFeedback: true,
        } as GateStepDef,
      ],
    });
    const result = validateWorkflow(wf);
    expect(result.valid).toBe(true);
  });
});

// ---------- Validation Rule 5: Duplicate step IDs ----------

describe("Rule 5: Duplicate step IDs", () => {
  it("rejects workflow with duplicate step IDs", () => {
    const wf = makeWorkflow({
      steps: [
        {
          id: "build",
          name: "Build 1",
          type: "agent",
          agent: "backend",
          goal: "Build v1",
        } as AgentStepDef,
        {
          id: "build",
          name: "Build 2",
          type: "agent",
          agent: "frontend",
          goal: "Build v2",
        } as AgentStepDef,
      ],
    });
    const result = validateWorkflow(wf);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining("Duplicate step ID: 'build'")]),
    );
  });
});

// ---------- Validation Rule 6: Schedule interval < 1 minute ----------

describe("Rule 6: Schedule interval too short", () => {
  it("rejects interval shorter than 1 minute", () => {
    const wf = makeWorkflow({
      trigger: { type: "scheduled", interval: "every 30s" },
    });
    const result = validateWorkflow(wf);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining("at least 1 minute")]),
    );
  });

  it("accepts interval with _testBypassMinInterval", () => {
    const wf = makeWorkflow({
      trigger: {
        type: "scheduled",
        interval: "every 2s",
        _testBypassMinInterval: true,
      },
    });
    const result = validateWorkflow(wf);
    expect(result.valid).toBe(true);
  });

  it("rejects invalid interval format", () => {
    const wf = makeWorkflow({
      trigger: { type: "scheduled", interval: "garbage" },
    });
    const result = validateWorkflow(wf);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining("Invalid schedule interval")]),
    );
  });
});

// ---------- Validation Rule 7: Agent step with no goal ----------

describe("Rule 7: Agent step with no goal", () => {
  it("rejects agent step with empty goal", () => {
    const wf = makeWorkflow({
      steps: [
        {
          id: "step-1",
          name: "Build",
          type: "agent",
          agent: "backend",
          goal: "",
        } as AgentStepDef,
      ],
    });
    const result = validateWorkflow(wf);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining("needs a goal")]),
    );
  });
});

// ---------- Valid configurations ----------

describe("Valid workflow configurations", () => {
  it("accepts a simple 2-agent workflow", () => {
    const wf = makeWorkflow({
      steps: [
        {
          id: "step-1",
          name: "Backend",
          type: "agent",
          agent: "backend",
          goal: "Build API",
        } as AgentStepDef,
        {
          id: "step-2",
          name: "Frontend",
          type: "agent",
          agent: "frontend",
          goal: "Build UI",
        } as AgentStepDef,
      ],
    });
    expect(validateWorkflow(wf).valid).toBe(true);
  });

  it("accepts workflow with a gate", () => {
    const wf = makeWorkflow({
      steps: [
        {
          id: "step-1",
          name: "Build",
          type: "agent",
          agent: "backend",
          goal: "Build",
        } as AgentStepDef,
        {
          id: "gate-1",
          name: "Review",
          type: "gate",
          reviewArtifact: "output.md",
        } as GateStepDef,
      ],
    });
    expect(validateWorkflow(wf).valid).toBe(true);
  });

  it("accepts workflow with a valid loop", () => {
    const wf = makeWorkflow({
      steps: [
        {
          id: "build",
          name: "Build",
          type: "agent",
          agent: "backend",
          goal: "Build",
        } as AgentStepDef,
        {
          id: "qa",
          name: "QA",
          type: "agent",
          agent: "qa",
          goal: "Test",
        } as AgentStepDef,
        {
          id: "loop-1",
          name: "QA Loop",
          type: "loop",
          steps: ["build", "qa"],
          maxIterations: 3,
        } as LoopStepDef,
      ],
    });
    expect(validateWorkflow(wf).valid).toBe(true);
  });

  it("accepts workflow with nested agent-group", () => {
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
          ],
        } as AgentGroupStepDef,
      ],
    });
    expect(validateWorkflow(wf).valid).toBe(true);
  });

  it("accepts workflow with scheduled trigger (valid interval)", () => {
    const wf = makeWorkflow({
      trigger: { type: "scheduled", interval: "every 2h" },
    });
    expect(validateWorkflow(wf).valid).toBe(true);
  });
});
