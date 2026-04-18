/**
 * Workflow pipeline definition schema and validation.
 *
 * Uses `WorkflowPipelineDef` (not `WorkflowDefinition`) to avoid
 * collision with the existing type in workflow-registry.ts.
 */

// ---------- Trigger Config ----------

export interface ManualTrigger {
  type: "manual";
}

export interface ScheduledTrigger {
  type: "scheduled";
  interval: string; // e.g. "every 2h", "every 30m"
  paused?: boolean;
  /** Test-only: bypass minimum interval check */
  _testBypassMinInterval?: boolean;
}

export interface EventTrigger {
  type: "event";
  stateFile: string;
}

export type TriggerConfig = ManualTrigger | ScheduledTrigger | EventTrigger;

// ---------- Step Definitions ----------

export interface AgentStepDef {
  id: string;
  name: string;
  type: "agent";
  agent: string;
  goal: string;
  input?: string;
  output?: string;
  model?: "sonnet" | "opus" | "haiku";
  permissions?: "default" | "bypass" | "plan" | "auto";
  onFailure?: "pause" | "retry" | "skip" | "fail";
  maxRetries?: number;
  timeout?: number; // seconds
  /** For hybrid mode: "internal" (Agent Studio executes) or "external" (watched) */
  execution?: "internal" | "external";
  watchFile?: string;
  /** Max budget for this individual step in USD */
  stepBudgetCapUsd?: number;
  /**
   * Dispatch runtime for this step.
   * - "cli" (default): spawn `claude` CLI via CommandRunner.
   * - "sdk": reserved for SDK-backed dispatch (future).
   * - "pty": reserved for PTY-backed dispatch (future).
   * - "noop": test affordance — writes canned handoff output and completes
   *   immediately without spawning any process. Used by sprint verification
   *   harness; not production surface.
   */
  runtime?: "cli" | "sdk" | "pty" | "noop";
}

export interface GateStepDef {
  id: string;
  name: string;
  type: "gate";
  reviewArtifact?: string;
  notify?: ("mac" | "telegram")[];
  allowFeedback?: boolean;
  description?: string;
}

export interface LoopStepDef {
  id: string;
  name: string;
  type: "loop";
  steps: string[]; // IDs of steps to loop over
  condition?: string; // e.g. "qa-test.passes"
  maxIterations: number;
  onExhausted?: "pause" | "fail" | "skip";
}

export interface AgentGroupStepDef {
  id: string;
  name: string;
  type: "agent-group";
  agent?: string;
  manifest?: string; // path to manifest JSON
  steps?: (AgentStepDef | GateStepDef)[]; // inline sub-steps
  visibility?: "opaque" | "transparent" | "expandable";
}

export type PipelineStepDef = AgentStepDef | GateStepDef | LoopStepDef | AgentGroupStepDef;

// ---------- Workflow Pipeline Definition ----------

export interface WorkflowPipelineDef {
  id: string;
  name: string;
  description?: string;
  mode: "execute" | "watch" | "hybrid";
  trigger: TriggerConfig;
  workingDirectory: string;
  steps: PipelineStepDef[];
  /** For watch mode */
  stateFile?: string;
  /** Total budget cap for the entire workflow run in USD */
  budgetCapUsd?: number;
  /** Default per-step budget cap in USD (used if individual step doesn't specify one) */
  stepBudgetCapUsd?: number;
}

// ---------- Validation ----------

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Parse an interval string like "every 2h" into milliseconds.
 * Returns null if the format is unrecognized.
 */
export function parseInterval(interval: string): number | null {
  const match = interval.match(/^every\s+(\d+)\s*(s|m|h|d)$/i);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return value * (multipliers[unit] ?? 0);
}

/**
 * Validate a workflow pipeline definition against all 7 config validation rules:
 * 1. No steps defined
 * 2. Loop references nonexistent steps
 * 3. Circular loop (loop contains itself)
 * 4. Gate with feedback but no previous agent step
 * 5. Duplicate step IDs
 * 6. Schedule interval < 1 minute (bypassed with _testBypassMinInterval)
 * 7. Agent step with no goal
 */
export function validateWorkflow(def: WorkflowPipelineDef): ValidationResult {
  const errors: string[] = [];

  // Rule 1: No steps defined
  if (!def.steps || def.steps.length === 0) {
    errors.push("Workflow must have at least one step");
    return { valid: false, errors };
  }

  // Collect all step IDs for reference checks
  const stepIds = new Set<string>();
  const allStepIds: string[] = [];

  for (const step of def.steps) {
    allStepIds.push(step.id);
  }

  // Rule 5: Duplicate step IDs
  for (const step of def.steps) {
    if (stepIds.has(step.id)) {
      errors.push(`Duplicate step ID: '${step.id}'`);
    }
    stepIds.add(step.id);
  }

  for (let i = 0; i < def.steps.length; i++) {
    const step = def.steps[i];

    // Rule 7: Agent step with no goal
    if (step.type === "agent" && !step.goal) {
      errors.push(`Step '${step.id}' needs a goal — what should the agent do?`);
    }

    // Rule 2: Loop references nonexistent steps
    if (step.type === "loop") {
      for (const refId of step.steps) {
        if (!stepIds.has(refId)) {
          errors.push(`Loop '${step.id}' references step '${refId}' which is not defined`);
        }
      }

      // Rule 3: Circular loop (loop references itself)
      if (step.steps.includes(step.id)) {
        errors.push(`Loop '${step.id}' creates a circular reference`);
      }
    }

    // Rule 4: Gate with feedback but no previous agent step
    if (step.type === "gate" && step.allowFeedback) {
      const hasPreviousAgent = def.steps
        .slice(0, i)
        .some((s) => s.type === "agent" || s.type === "agent-group");
      if (!hasPreviousAgent) {
        errors.push(
          `Gate '${step.id}' allows feedback but has no previous agent step to send feedback to`,
        );
      }
    }
  }

  // Rule 6: Schedule interval < 1 minute
  if (def.trigger.type === "scheduled") {
    const trigger = def.trigger as ScheduledTrigger;
    if (!trigger._testBypassMinInterval) {
      const ms = parseInterval(trigger.interval);
      if (ms === null) {
        errors.push(
          `Invalid schedule interval: '${trigger.interval}'. Use format like 'every 2h', 'every 30m'`,
        );
      } else if (ms < 60_000) {
        errors.push("Schedule interval must be at least 1 minute");
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
