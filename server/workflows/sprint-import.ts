/**
 * Import existing sprint as a watch-mode workflow.
 *
 * Reads the current SprintManager state and creates a WorkflowPipelineDef
 * that mirrors the sprint's 8 hardcoded steps as a watch-mode workflow.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentSystemBase } from "../config.js";
import type { WorkflowPipelineDef, AgentStepDef, GateStepDef } from "./definition.js";

// The 8 standard sprint steps
const SPRINT_STEPS: Array<{ id: string; name: string; type: "agent" | "gate"; agent?: string }> = [
  { id: "pmo-scan", name: "PMO Scan", type: "agent", agent: "pmo" },
  { id: "approval", name: "Sprint Approval", type: "gate" },
  { id: "orchestrator", name: "Orchestrator", type: "agent", agent: "orchestrator" },
  { id: "backend", name: "Backend Build", type: "agent", agent: "backend" },
  { id: "frontend", name: "Frontend Build", type: "agent", agent: "frontend" },
  { id: "qa-security", name: "QA & Security", type: "agent", agent: "qa" },
  { id: "review-gate", name: "Final Review", type: "gate" },
  { id: "deploy", name: "Deploy", type: "agent", agent: "orchestrator" },
];

export interface ImportResult {
  workflow?: WorkflowPipelineDef;
  error?: string;
}

/**
 * Import the current sprint setup as a watch-mode workflow.
 * Returns the workflow definition without saving it.
 */
export function importSprintAsWorkflow(): ImportResult {
  const agentBase = getAgentSystemBase();
  if (!agentBase) {
    return { error: "No agent system detected. Cannot import sprint." };
  }

  const sprintDir = join(agentBase, "sprints");
  if (!existsSync(sprintDir)) {
    return { error: `Sprint directory not found at ${sprintDir}` };
  }

  const stateFile = join(sprintDir, "state.json");

  // Read current sprint name if available
  let sprintName = "Imported Sprint";
  if (existsSync(stateFile)) {
    try {
      const data = JSON.parse(readFileSync(stateFile, "utf-8"));
      if (data.sprint) {
        sprintName = `Sprint: ${data.sprint}`;
      }
    } catch {
      // ignore parse errors
    }
  }

  const steps = SPRINT_STEPS.map((s) => {
    if (s.type === "gate") {
      return {
        id: s.id,
        name: s.name,
        type: "gate" as const,
        allowFeedback: false,
      } satisfies GateStepDef;
    }
    return {
      id: s.id,
      name: s.name,
      type: "agent" as const,
      agent: s.agent!,
      goal: `${s.name} step (watched from external orchestration)`,
      execution: "external" as const,
    } satisfies AgentStepDef;
  });

  const workflow: WorkflowPipelineDef = {
    id: "imported-sprint",
    name: sprintName,
    description:
      "Imported from existing sprint setup. Watch mode — Agent Studio monitors but does not execute.",
    mode: "watch",
    trigger: { type: "event", stateFile },
    workingDirectory: agentBase,
    stateFile,
    steps,
  };

  return { workflow };
}
