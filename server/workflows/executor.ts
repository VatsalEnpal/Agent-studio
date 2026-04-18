/**
 * Workflow executor — drives workflow runs through their steps.
 *
 * Takes a CommandRunner (real or mock) via dependency injection.
 * Emits events for UI updates via a listener callback.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import type { CommandRunner } from "./command-runner.js";
import { getAgentSystemBase } from "../config.js";
import {
  validateWorkflow,
  type WorkflowPipelineDef,
  type AgentStepDef,
  type GateStepDef,
  type LoopStepDef,
  type AgentGroupStepDef,
  type PipelineStepDef,
} from "./definition.js";
import {
  type RunState,
  type StepState,
  type RunStatus,
  type StepStatus,
  saveRunState,
  createRunId,
} from "./run-state.js";

// ---------- Event Types ----------

export type ExecutorEventType =
  | "step-started"
  | "step-completed"
  | "step-failed"
  | "gate-waiting"
  | "run-completed"
  | "run-failed"
  | "run-paused"
  | "budget-exceeded";

export interface ExecutorEvent {
  type: ExecutorEventType;
  runId: string;
  workflowId: string;
  stepId?: string;
  data?: Record<string, unknown>;
}

export type ExecutorEventListener = (event: ExecutorEvent) => void;

// ---------- Executor ----------

export class WorkflowExecutor {
  private runner: CommandRunner;
  private listeners: ExecutorEventListener[] = [];
  private activeRuns = new Map<string, { abortController: AbortController; paused: boolean }>();
  /**
   * Pending per-step gate approvals. Key: `${runId}::${stepId}`.
   * Each entry resolves the promise when the external approval arrives
   * via `approveStepGate()` (wired from /api/sprints/:sprintId/gates/:gateId/approve).
   */
  private pendingStepGates = new Map<string, () => void>();
  /** Override retry delay for tests (default: 60000ms) */
  _testRetryDelayMs?: number;

  constructor(runner: CommandRunner) {
    this.runner = runner;
  }

  /** Key used in `pendingStepGates` — (runId, stepId) pair. */
  private gateKey(runId: string, stepId: string): string {
    return `${runId}::${stepId}`;
  }

  /**
   * Register a pending step-gate approval and emit the gate-waiting event.
   * Returns a promise that resolves once `approveStepGate` is called.
   * Marks the run as `waiting_approval` and persists run state.
   */
  private waitForStepApproval(
    runState: RunState,
    stepId: string,
    gateType: "approve-before-start" | "approve-before-finish",
  ): Promise<void> {
    const key = this.gateKey(runState.runId, stepId);
    runState.status = "waiting_approval";
    saveRunState(runState);
    this.emit({
      type: "gate-waiting",
      runId: runState.runId,
      workflowId: runState.workflowId,
      stepId,
      data: { gateType },
    });
    return new Promise<void>((resolve) => {
      this.pendingStepGates.set(key, resolve);
    });
  }

  /**
   * Externally signal that a per-step gate has been approved. Invoked from
   * the /gates/:gateId/approve HTTP handler. No-op if no pending gate for
   * this (runId, stepId).
   */
  approveStepGate(runId: string, stepId: string): boolean {
    const key = this.gateKey(runId, stepId);
    const resolve = this.pendingStepGates.get(key);
    if (!resolve) return false;
    this.pendingStepGates.delete(key);
    resolve();
    return true;
  }

  /**
   * Pre-execution validation. Checks BEFORE starting any run:
   * - Workflow definition is valid
   * - claude CLI is on PATH
   * - All referenced agents exist in ~/.claude/agents/
   * - Working directory exists
   * - Input files from config exist (where applicable)
   */
  validatePreExecution(workflowDef: WorkflowPipelineDef): string[] {
    const errors: string[] = [];

    // Validate workflow definition
    const defValidation = validateWorkflow(workflowDef);
    if (!defValidation.valid) {
      errors.push(...defValidation.errors);
    }

    // Check claude CLI on PATH
    try {
      execSync("which claude", { stdio: "pipe" });
    } catch {
      errors.push("Claude Code CLI not found. Install it from https://claude.ai/code");
    }

    // Check working directory exists
    if (!existsSync(workflowDef.workingDirectory)) {
      errors.push(`Working directory '${workflowDef.workingDirectory}' does not exist`);
    }

    // Check each agent exists
    const agentsDir = join(homedir(), ".claude", "agents");
    for (const step of workflowDef.steps) {
      if (step.type === "agent") {
        const agentFile = join(agentsDir, `${step.agent}.md`);
        if (!existsSync(agentFile)) {
          errors.push(`Agent '${step.agent}' not found at ${agentFile}`);
        }
      }
      if (step.type === "agent-group" && step.steps) {
        for (const subStep of step.steps) {
          if (subStep.type === "agent") {
            const agentFile = join(agentsDir, `${subStep.agent}.md`);
            if (!existsSync(agentFile)) {
              errors.push(`Agent '${subStep.agent}' not found at ${agentFile}`);
            }
          }
        }
      }
    }

    return errors;
  }

  onEvent(listener: ExecutorEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(event: ExecutorEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // don't let a bad listener crash the executor
      }
    }
  }

  /** Create a new run from a workflow definition */
  startRun(workflowDef: WorkflowPipelineDef, options?: { budgetCapUsd?: number }): RunState {
    const runId = createRunId();
    const steps: Record<string, StepState> = {};

    for (const step of workflowDef.steps) {
      steps[step.id] = { id: step.id, status: "pending" };
    }

    const runState: RunState = {
      runId,
      workflowId: workflowDef.id,
      status: "running",
      currentStep: null,
      startedAt: new Date().toISOString(),
      steps,
      ...(options?.budgetCapUsd != null ? { budgetCapUsd: options.budgetCapUsd } : {}),
    };

    saveRunState(runState);
    return runState;
  }

  /** Execute a full workflow run */
  async executeRun(workflowDef: WorkflowPipelineDef, runState: RunState): Promise<RunState> {
    const abortController = new AbortController();
    this.activeRuns.set(runState.runId, { abortController, paused: false });

    // Collect step IDs owned by loops — these are executed by the loop, not top-level
    const loopOwnedSteps = new Set<string>();
    for (const step of workflowDef.steps) {
      if (step.type === "loop") {
        for (const subId of step.steps) {
          loopOwnedSteps.add(subId);
        }
      }
    }

    try {
      for (const stepDef of workflowDef.steps) {
        // Check for cancellation
        if (abortController.signal.aborted) {
          runState.status = "cancelled";
          saveRunState(runState);
          return runState;
        }

        // Check for pause
        const runControl = this.activeRuns.get(runState.runId);
        if (runControl?.paused) {
          runState.status = "paused";
          saveRunState(runState);
          return runState;
        }

        // Skip already-completed steps (for resume)
        if (
          runState.steps[stepDef.id]?.status === "completed" ||
          runState.steps[stepDef.id]?.status === "skipped"
        ) {
          continue;
        }

        // Skip steps that are owned by a loop — they execute inside the loop
        if (loopOwnedSteps.has(stepDef.id)) {
          continue;
        }

        runState.currentStep = stepDef.id;

        if (stepDef.type === "agent") {
          await this.executeAgentStep(runState, stepDef, workflowDef, abortController.signal);
        } else if (stepDef.type === "gate") {
          this.executeGateStep(runState, stepDef);
          // Gate pauses the run — return and wait for approval
          if (runState.status === "waiting_approval") {
            return runState;
          }
        } else if (stepDef.type === "loop") {
          await this.executeLoopStep(runState, stepDef, workflowDef, abortController.signal);
        } else if (stepDef.type === "agent-group") {
          await this.executeAgentGroupStep(runState, stepDef, workflowDef, abortController.signal);
        }

        // If step failed, paused, budget exceeded, or waiting for approval, stop
        if (
          runState.status === "paused" ||
          runState.status === "failed" ||
          runState.status === "waiting_approval" ||
          runState.status === "budget_exceeded"
        ) {
          return runState;
        }
      }

      // All steps completed
      runState.status = "completed";
      runState.completedAt = new Date().toISOString();
      runState.currentStep = null;
      saveRunState(runState);
      this.emit({ type: "run-completed", runId: runState.runId, workflowId: runState.workflowId });
      return runState;
    } finally {
      this.activeRuns.delete(runState.runId);
    }
  }

  /**
   * Resolve the handoffs directory on disk:
   *   <agent-system-base>/sprints/handoffs
   * Falls back to `<cwd>/.agent-studio/sprints/handoffs` if no agent system
   * is configured. Creates the directory if missing.
   * Returns null if the directory cannot be created.
   */
  private resolveHandoffsDir(workflowDef: WorkflowPipelineDef): string | null {
    const base = getAgentSystemBase();
    const dir = base
      ? join(base, "sprints", "handoffs")
      : join(workflowDef.workingDirectory, ".agent-studio", "sprints", "handoffs");
    try {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      return dir;
    } catch (err) {
      console.warn("[workflow-executor] Could not create handoffs dir:", err);
      return null;
    }
  }

  /**
   * Write (or reuse, on resume) the input handoff for a step.
   * Shape: { stepId, goal, agent, priorStepOutput?: { stepId, ref } }
   */
  private writeHandoffInput(
    stepDef: AgentStepDef,
    workflowDef: WorkflowPipelineDef,
    runState: RunState,
  ): string | null {
    const dir = this.resolveHandoffsDir(workflowDef);
    if (!dir) return null;
    const file = join(dir, `${stepDef.id}_input.json`);
    if (existsSync(file)) return file; // reuse on resume

    // Find the previous agent step's output file as the prior reference
    const stepIndex = workflowDef.steps.findIndex((s) => s.id === stepDef.id);
    let priorStepOutput: { stepId: string; ref: string } | undefined;
    for (let i = stepIndex - 1; i >= 0; i--) {
      const prev = workflowDef.steps[i];
      if (prev.type === "agent") {
        const prevRef = join(dir, `${prev.id}_output.json`);
        priorStepOutput = { stepId: prev.id, ref: prevRef };
        break;
      }
    }

    const payload: Record<string, unknown> = {
      stepId: stepDef.id,
      runId: runState.runId,
      workflowId: runState.workflowId,
      agent: stepDef.agent,
      goal: stepDef.goal,
      ...(priorStepOutput ? { priorStepOutput } : {}),
    };
    try {
      writeFileSync(file, JSON.stringify(payload, null, 2) + "\n", "utf-8");
    } catch (err) {
      console.warn("[workflow-executor] Could not write handoff input:", err);
      return null;
    }
    return file;
  }

  /** Write the output handoff for a step. */
  private writeHandoffOutput(
    stepDef: AgentStepDef,
    workflowDef: WorkflowPipelineDef,
    runState: RunState,
    stepState: StepState,
  ): void {
    const dir = this.resolveHandoffsDir(workflowDef);
    if (!dir) return;
    const file = join(dir, `${stepDef.id}_output.json`);
    const payload: Record<string, unknown> = {
      stepId: stepDef.id,
      runId: runState.runId,
      workflowId: runState.workflowId,
      agent: stepDef.agent,
      status: stepState.status,
      completedAt: stepState.completedAt ?? new Date().toISOString(),
      output: stepState.output ?? null,
      tokenUsage: stepState.tokenUsage ?? null,
    };
    try {
      writeFileSync(file, JSON.stringify(payload, null, 2) + "\n", "utf-8");
    } catch (err) {
      console.warn("[workflow-executor] Could not write handoff output:", err);
    }
  }

  /**
   * Test-only fast path: noop runtime.
   * Reads handoff input (smoke check), writes canned output, marks step
   * complete, emits step-completed. No subprocess is spawned.
   *
   * Honors `stepDef.gate === "approve-before-finish"` by pausing between
   * producing output and emitting step-completed. The "approve-before-start"
   * gate is enforced by the caller (executeAgentStep) before this runs.
   */
  private async executeNoopStep(
    runState: RunState,
    stepDef: AgentStepDef,
    workflowDef: WorkflowPipelineDef,
  ): Promise<void> {
    const stepState = runState.steps[stepDef.id];
    stepState.status = "running";
    stepState.startedAt = new Date().toISOString();
    saveRunState(runState);
    this.emit({
      type: "step-started",
      runId: runState.runId,
      workflowId: runState.workflowId,
      stepId: stepDef.id,
    });

    // Smoke-check input file
    const dir = this.resolveHandoffsDir(workflowDef);
    const inputFile = dir ? join(dir, `${stepDef.id}_input.json`) : null;
    if (inputFile && existsSync(inputFile)) {
      try {
        readFileSync(inputFile, "utf-8");
      } catch {
        /* ignore */
      }
    }

    stepState.output = `test-noop output for ${stepDef.id}`;

    // approve-before-finish: pause after output produced, before completion.
    // Surface `waiting` on the step state so the UI step-card badge reads
    // "Awaiting approval" (S3). `waitForStepApproval` also sets
    // runState.status to `waiting_approval`.
    if (stepDef.gate === "approve-before-finish") {
      stepState.status = "waiting";
      saveRunState(runState);
      await this.waitForStepApproval(runState, stepDef.id, "approve-before-finish");
      // Post-approval: restore `running` on both run + step and persist
      // BEFORE marking completed. This guarantees syncSprintFileFromRun
      // sees a clean `running` transition instead of jumping straight from
      // `waiting_approval` → `completed`, which can confuse UI polling
      // that filters on intermediate states.
      runState.status = "running";
      stepState.status = "running";
      stepState.approvedAt = new Date().toISOString();
      saveRunState(runState);
    }

    stepState.status = "completed";
    stepState.completedAt = new Date().toISOString();
    saveRunState(runState);

    this.writeHandoffOutput(stepDef, workflowDef, runState, stepState);

    this.emit({
      type: "step-completed",
      runId: runState.runId,
      workflowId: runState.workflowId,
      stepId: stepDef.id,
    });
  }

  /** Execute a single agent step */
  async executeAgentStep(
    runState: RunState,
    stepDef: AgentStepDef,
    workflowDef: WorkflowPipelineDef,
    signal: AbortSignal,
  ): Promise<void> {
    const stepState = runState.steps[stepDef.id];

    // Always write the input handoff before any runtime dispatch.
    this.writeHandoffInput(stepDef, workflowDef, runState);

    // Per-step gate: "approve-before-start" pauses BEFORE any dispatch.
    // Mark step as waiting in persisted state so the UI can reflect it.
    if (stepDef.gate === "approve-before-start") {
      stepState.status = "waiting";
      stepState.startedAt = stepState.startedAt ?? new Date().toISOString();
      await this.waitForStepApproval(runState, stepDef.id, "approve-before-start");
      // Approved — resume as running. Fall through to normal dispatch.
      runState.status = "running";
      stepState.status = "pending";
      stepState.approvedAt = new Date().toISOString();
      saveRunState(runState);
    }

    // Noop runtime: deterministic completion for sprint verification.
    if (stepDef.runtime === "noop") {
      await this.executeNoopStep(runState, stepDef, workflowDef);
      return;
    }

    // --- Budget check before execution (Task 20) ---
    const effectiveBudgetCap = runState.budgetCapUsd ?? workflowDef.budgetCapUsd;
    if (effectiveBudgetCap != null && effectiveBudgetCap > 0) {
      const currentCost = runState.tokenUsage?.totalCostUsd ?? 0;
      if (currentCost >= effectiveBudgetCap) {
        stepState.status = "failed";
        stepState.error = `Budget cap of $${effectiveBudgetCap.toFixed(2)} reached (spent $${currentCost.toFixed(2)})`;
        stepState.completedAt = new Date().toISOString();
        runState.status = "budget_exceeded";
        runState.completedAt = new Date().toISOString();
        saveRunState(runState);
        this.emit({
          type: "budget-exceeded",
          runId: runState.runId,
          workflowId: runState.workflowId,
          stepId: stepDef.id,
          data: { budgetCapUsd: effectiveBudgetCap, totalCostUsd: currentCost },
        });
        return;
      }
    }

    stepState.status = "running";
    stepState.startedAt = new Date().toISOString();
    saveRunState(runState);
    this.emit({
      type: "step-started",
      runId: runState.runId,
      workflowId: runState.workflowId,
      stepId: stepDef.id,
    });

    // Build command
    const args: string[] = ["-p", stepDef.goal, "--output-format", "json"];
    if (stepDef.agent) {
      args.push("--agent", stepDef.agent);
    }
    if (stepDef.model) {
      args.push("--model", stepDef.model);
    }
    if (stepDef.permissions && stepDef.permissions !== "default") {
      args.push("--permissions", stepDef.permissions);
    }

    // --- Per-step budget cap (Task 20) ---
    const stepBudget = stepDef.stepBudgetCapUsd ?? workflowDef.stepBudgetCapUsd;
    if (stepBudget != null && stepBudget > 0) {
      // Use step-level budget directly
      args.push("--max-budget-usd", String(stepBudget));
    } else if (effectiveBudgetCap != null && effectiveBudgetCap > 0) {
      // No step budget set, but there is a run-level cap — pass remaining budget
      const spent = runState.tokenUsage?.totalCostUsd ?? 0;
      const remaining = Math.max(0, effectiveBudgetCap - spent);
      if (remaining > 0) {
        args.push("--max-budget-usd", String(remaining));
      }
    }

    try {
      let result = await this.runner.run("claude", args, {
        cwd: workflowDef.workingDirectory,
        timeout: (stepDef.timeout ?? 300) * 1000,
        signal,
      });

      // Rate limit detection + auto-retry
      const combined = result.stdout + result.stderr;
      if (this.isRateLimited(combined)) {
        const retryDelay = this._testRetryDelayMs ?? 60_000;
        await new Promise((resolve) => setTimeout(resolve, retryDelay));

        result = await this.runner.run("claude", args, {
          cwd: workflowDef.workingDirectory,
          timeout: (stepDef.timeout ?? 300) * 1000,
          signal,
        });

        const retryOutput = result.stdout + result.stderr;
        if (this.isRateLimited(retryOutput)) {
          stepState.status = "failed";
          stepState.error = "Rate limited after retry";
          stepState.completedAt = new Date().toISOString();
          saveRunState(runState);
          this.handleStepFailure(runState, stepDef);
          return;
        }
      }

      if (result.exitCode === 0) {
        // --- Parse JSON output for cost/token data (Task 19) ---
        this.parseAndAccumulateCost(result.stdout, stepState, runState);

        // Check if output file was expected and exists
        if (stepDef.output) {
          const outputPath = join(workflowDef.workingDirectory, stepDef.output);
          if (!existsSync(outputPath)) {
            stepState.status = "failed";
            stepState.error = `Step completed but didn't produce '${stepDef.output}'`;
            stepState.completedAt = new Date().toISOString();
            saveRunState(runState);
            this.handleStepFailure(runState, stepDef);
            return;
          }
        }

        // approve-before-finish: step produced output, but pause before
        // we mark it completed / write the output handoff. Surface `waiting`
        // on the step state so the UI step-card badge reads "Awaiting
        // approval" (S3).
        if (stepDef.gate === "approve-before-finish") {
          stepState.status = "waiting";
          saveRunState(runState);
          await this.waitForStepApproval(runState, stepDef.id, "approve-before-finish");
          // Post-approval: restore `running` + persist BEFORE completion so
          // the run-state never jumps waiting_approval → completed in a
          // single save (which can confuse UI pollers and downstream
          // syncSprintFileFromRun consumers).
          runState.status = "running";
          stepState.status = "running";
          stepState.approvedAt = new Date().toISOString();
          saveRunState(runState);
        }

        stepState.status = "completed";
        stepState.completedAt = new Date().toISOString();
        if (stepDef.output) stepState.output = stepDef.output;
        saveRunState(runState);
        this.writeHandoffOutput(stepDef, workflowDef, runState, stepState);
        this.emit({
          type: "step-completed",
          runId: runState.runId,
          workflowId: runState.workflowId,
          stepId: stepDef.id,
          data: stepState.tokenUsage ? { tokenUsage: stepState.tokenUsage } : undefined,
        });
      } else {
        // Still try to parse cost data even on failure (partial usage may exist)
        this.parseAndAccumulateCost(result.stdout, stepState, runState);

        // Non-zero exit code
        const lastLines = (result.stderr || result.stdout).split("\n").slice(-10).join("\n");
        stepState.status = "failed";
        stepState.error = lastLines || `Agent exited with code ${result.exitCode}`;
        stepState.completedAt = new Date().toISOString();
        saveRunState(runState);
        this.handleStepFailure(runState, stepDef);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        stepState.status = "timeout";
        stepState.error = `Step timed out after ${stepDef.timeout ?? 300} seconds`;
        stepState.completedAt = new Date().toISOString();
        saveRunState(runState);
        this.handleStepFailure(runState, stepDef);
      } else {
        stepState.status = "failed";
        stepState.error = String(err);
        stepState.completedAt = new Date().toISOString();
        saveRunState(runState);
        this.handleStepFailure(runState, stepDef);
      }
    }
  }

  /**
   * Parse JSON output from `claude -p --output-format json` and accumulate cost.
   * Expected JSON shape: { result: string, cost_usd: number, input_tokens: number, output_tokens: number }
   * Gracefully handles non-JSON output (logs warning, continues).
   */
  private parseAndAccumulateCost(stdout: string, stepState: StepState, runState: RunState): void {
    try {
      const parsed = JSON.parse(stdout) as Record<string, unknown>;

      const costUsd =
        typeof parsed.cost_usd === "number"
          ? parsed.cost_usd
          : typeof parsed.total_cost_usd === "number"
            ? parsed.total_cost_usd
            : 0;
      const inputTokens = typeof parsed.input_tokens === "number" ? parsed.input_tokens : 0;
      const outputTokens = typeof parsed.output_tokens === "number" ? parsed.output_tokens : 0;

      // Store per-step token usage
      stepState.tokenUsage = {
        inputTokens,
        outputTokens,
        totalCostUsd: costUsd,
      };

      // Store the text result as step output (if not already a file path)
      if (typeof parsed.result === "string" && !stepState.output) {
        // Truncate very long outputs to avoid bloating state
        const maxLen = 10_000;
        stepState.output =
          parsed.result.length > maxLen
            ? parsed.result.slice(0, maxLen) + "\n... (truncated)"
            : parsed.result;
      }

      // Accumulate into run-level totals
      if (!runState.tokenUsage) {
        runState.tokenUsage = { inputTokens: 0, outputTokens: 0, totalCostUsd: 0 };
      }
      runState.tokenUsage.inputTokens += inputTokens;
      runState.tokenUsage.outputTokens += outputTokens;
      runState.tokenUsage.totalCostUsd += costUsd;
    } catch {
      // stdout is not valid JSON — this is fine, just means the CLI
      // didn't output JSON (older version or unexpected format).
      // Continue without cost data.
      if (stdout.trim().length > 0) {
        console.warn(
          "[workflow-executor] Could not parse JSON output for cost tracking. Continuing without cost data.",
        );
      }
    }
  }

  /** Handle gate step — pause run for approval */
  executeGateStep(runState: RunState, stepDef: GateStepDef): void {
    const stepState = runState.steps[stepDef.id];
    stepState.status = "waiting";
    stepState.startedAt = new Date().toISOString();
    runState.status = "waiting_approval";
    saveRunState(runState);

    this.emit({
      type: "gate-waiting",
      runId: runState.runId,
      workflowId: runState.workflowId,
      stepId: stepDef.id,
      data: {
        artifactPath: stepDef.reviewArtifact,
        allowFeedback: stepDef.allowFeedback ?? false,
      },
    });
  }

  /** Approve a gate — resume execution */
  async approveGate(
    runState: RunState,
    stepId: string,
    workflowDef: WorkflowPipelineDef,
  ): Promise<RunState> {
    const stepState = runState.steps[stepId];
    if (!stepState || stepState.status !== "waiting") {
      return runState;
    }

    stepState.status = "completed";
    stepState.completedAt = new Date().toISOString();
    stepState.approvedAt = new Date().toISOString();
    stepState.approvedBy = "user";
    runState.status = "running";
    saveRunState(runState);

    this.emit({
      type: "step-completed",
      runId: runState.runId,
      workflowId: runState.workflowId,
      stepId,
    });

    // Continue execution from the next step
    return this.executeRun(workflowDef, runState);
  }

  /** Reject a gate */
  async rejectGate(
    runState: RunState,
    stepId: string,
    workflowDef: WorkflowPipelineDef,
    feedback?: string,
  ): Promise<RunState> {
    const stepState = runState.steps[stepId];
    if (!stepState || stepState.status !== "waiting") {
      return runState;
    }

    if (!feedback) {
      // No feedback — cancel the run
      stepState.status = "failed";
      stepState.rejectedAt = new Date().toISOString();
      stepState.completedAt = new Date().toISOString();
      runState.status = "cancelled";
      saveRunState(runState);
      return runState;
    }

    // Feedback provided — re-run previous agent step with feedback
    stepState.rejectedAt = new Date().toISOString();
    stepState.feedback = feedback;
    stepState.status = "pending"; // reset for re-evaluation

    // Find the previous agent step
    const stepIndex = workflowDef.steps.findIndex((s) => s.id === stepId);
    let prevAgentStep: AgentStepDef | null = null;
    for (let i = stepIndex - 1; i >= 0; i--) {
      if (workflowDef.steps[i].type === "agent") {
        prevAgentStep = workflowDef.steps[i] as AgentStepDef;
        break;
      }
    }

    if (prevAgentStep) {
      // Reset the previous agent step and re-run with feedback
      runState.steps[prevAgentStep.id].status = "pending";
      runState.status = "running";
      const modifiedStep: AgentStepDef = {
        ...prevAgentStep,
        goal: `${prevAgentStep.goal}\n\nFeedback from reviewer: ${feedback}`,
      };

      // Replace step in a modified workflow def for re-execution
      const modifiedDef: WorkflowPipelineDef = {
        ...workflowDef,
        steps: workflowDef.steps.map((s) => (s.id === prevAgentStep!.id ? modifiedStep : s)),
      };

      saveRunState(runState);
      return this.executeRun(modifiedDef, runState);
    }

    // No previous agent step found — just cancel
    runState.status = "cancelled";
    saveRunState(runState);
    return runState;
  }

  /** Execute a loop step */
  async executeLoopStep(
    runState: RunState,
    stepDef: LoopStepDef,
    workflowDef: WorkflowPipelineDef,
    signal: AbortSignal,
  ): Promise<void> {
    const loopState = runState.steps[stepDef.id];
    loopState.status = "running";
    loopState.startedAt = new Date().toISOString();
    loopState.iterationHistory = [];

    const maxIter = stepDef.maxIterations;

    for (let iter = 1; iter <= maxIter; iter++) {
      loopState.iteration = iter;
      saveRunState(runState);

      let allPassed = true;

      for (const subStepId of stepDef.steps) {
        const subStepDef = workflowDef.steps.find((s) => s.id === subStepId);
        if (!subStepDef || subStepDef.type !== "agent") continue;

        // Reset sub-step state for this iteration
        runState.steps[subStepId] = { id: subStepId, status: "pending" };

        // Save run status before sub-step — loop controls failure, not global handler
        const savedStatus = runState.status;
        await this.executeAgentStep(runState, subStepDef as AgentStepDef, workflowDef, signal);

        if (runState.steps[subStepId].status !== "completed") {
          allPassed = false;
          // Reset run status — loop handles its own retry/exhaustion logic
          runState.status = savedStatus;
          break;
        }
      }

      loopState.iterationHistory!.push({
        iteration: iter,
        status: allPassed ? "completed" : "failed",
        completedAt: new Date().toISOString(),
      });

      if (allPassed) {
        // Condition met — exit loop
        loopState.status = "completed";
        loopState.completedAt = new Date().toISOString();
        saveRunState(runState);
        return;
      }
    }

    // Max iterations exhausted
    const onExhausted = stepDef.onExhausted ?? "pause";
    if (onExhausted === "fail") {
      loopState.status = "failed";
      loopState.error = `Loop exhausted after ${maxIter} iterations`;
      loopState.completedAt = new Date().toISOString();
      runState.status = "failed";
      saveRunState(runState);
      this.emit({
        type: "run-failed",
        runId: runState.runId,
        workflowId: runState.workflowId,
        stepId: stepDef.id,
      });
    } else if (onExhausted === "skip") {
      loopState.status = "skipped";
      loopState.completedAt = new Date().toISOString();
      saveRunState(runState);
    } else {
      // pause (default)
      loopState.status = "failed";
      loopState.error = `Loop exhausted after ${maxIter} iterations`;
      loopState.completedAt = new Date().toISOString();
      runState.status = "paused";
      saveRunState(runState);
      this.emit({
        type: "run-paused",
        runId: runState.runId,
        workflowId: runState.workflowId,
        stepId: stepDef.id,
      });
    }
  }

  /** Execute an agent-group step */
  async executeAgentGroupStep(
    runState: RunState,
    stepDef: AgentGroupStepDef,
    workflowDef: WorkflowPipelineDef,
    signal: AbortSignal,
  ): Promise<void> {
    const groupState = runState.steps[stepDef.id];
    groupState.status = "running";
    groupState.startedAt = new Date().toISOString();
    groupState.subSteps = {};

    const subSteps = stepDef.steps ?? [];

    for (const subStep of subSteps) {
      groupState.subSteps[subStep.id] = { id: subStep.id, status: "pending" };

      if (subStep.type === "agent") {
        // Execute sub-agent step — track in subSteps
        const subState = groupState.subSteps[subStep.id];
        subState.status = "running";
        subState.startedAt = new Date().toISOString();
        saveRunState(runState);
        this.emit({
          type: "step-started",
          runId: runState.runId,
          workflowId: runState.workflowId,
          stepId: subStep.id,
        });

        const args: string[] = ["-p", subStep.goal];
        if (subStep.agent) args.push("--agent", subStep.agent);

        try {
          const result = await this.runner.run("claude", args, {
            cwd: workflowDef.workingDirectory,
            timeout: (subStep.timeout ?? 300) * 1000,
            signal,
          });

          if (result.exitCode === 0) {
            subState.status = "completed";
            subState.completedAt = new Date().toISOString();
          } else {
            subState.status = "failed";
            subState.error = result.stderr || `Exited with code ${result.exitCode}`;
            subState.completedAt = new Date().toISOString();
            groupState.status = "failed";
            groupState.completedAt = new Date().toISOString();
            saveRunState(runState);
            this.handleStepFailure(runState, stepDef as unknown as AgentStepDef);
            return;
          }
        } catch {
          subState.status = "failed";
          subState.completedAt = new Date().toISOString();
          groupState.status = "failed";
          groupState.completedAt = new Date().toISOString();
          saveRunState(runState);
          this.handleStepFailure(runState, stepDef as unknown as AgentStepDef);
          return;
        }

        saveRunState(runState);
      } else if (subStep.type === "gate") {
        // Gate within agent group — pause the whole workflow
        groupState.subSteps[subStep.id].status = "waiting";
        groupState.subSteps[subStep.id].startedAt = new Date().toISOString();
        runState.status = "waiting_approval";
        saveRunState(runState);
        this.emit({
          type: "gate-waiting",
          runId: runState.runId,
          workflowId: runState.workflowId,
          stepId: subStep.id,
          data: { artifactPath: subStep.reviewArtifact },
        });
        return;
      }
    }

    // All sub-steps completed
    groupState.status = "completed";
    groupState.completedAt = new Date().toISOString();
    saveRunState(runState);
    this.emit({
      type: "step-completed",
      runId: runState.runId,
      workflowId: runState.workflowId,
      stepId: stepDef.id,
    });
  }

  /** Handle step failure based on onFailure policy */
  private handleStepFailure(runState: RunState, stepDef: AgentStepDef): void {
    const onFailure = stepDef.onFailure ?? "pause";

    if (onFailure === "skip") {
      runState.steps[stepDef.id].status = "skipped";
      // Don't change run status — continue
    } else if (onFailure === "fail") {
      runState.status = "failed";
      this.emit({
        type: "run-failed",
        runId: runState.runId,
        workflowId: runState.workflowId,
        stepId: stepDef.id,
      });
    } else {
      // pause (default)
      runState.status = "paused";
      this.emit({
        type: "step-failed",
        runId: runState.runId,
        workflowId: runState.workflowId,
        stepId: stepDef.id,
      });
    }

    saveRunState(runState);
  }

  /** Cancel a running workflow */
  cancelRun(runId: string): void {
    const control = this.activeRuns.get(runId);
    if (control) {
      control.abortController.abort();
    }
  }

  /** Pause a running workflow */
  pauseRun(runId: string): void {
    const control = this.activeRuns.get(runId);
    if (control) {
      control.paused = true;
    }
  }

  /** Check if output indicates a rate limit */
  private isRateLimited(output: string): boolean {
    const lower = output.toLowerCase();
    return (
      lower.includes("429") ||
      lower.includes("529") ||
      lower.includes("rate limit") ||
      lower.includes("overloaded")
    );
  }
}
