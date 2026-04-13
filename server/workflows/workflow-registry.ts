import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import type { WorkflowFlow } from "./types.js";
import { getSprintPlanningFlow } from "./sprint-planning.js";
import { getConfig, getAgentSystemBase } from "../config.js";
import { validateWorkflow, type WorkflowPipelineDef } from "./definition.js";
import { getActiveRuns } from "./run-state.js";

// ---------- Public types for config-defined workflows ----------

export interface WorkflowStepDefinition {
  id: string;
  name: string;
  description?: string;
  agents: string[];
  dataSource?: string; // file to read for step data
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  steps: WorkflowStepDefinition[];
}

// ---------- Registry ----------

type FlowProvider = () => Promise<WorkflowFlow>;

/**
 * Central registry for workflow providers.
 *
 * Built-in workflows (Sprint Planning) are registered automatically when the
 * agent system is detected. Custom workflows defined in `.agent-studio.json`
 * are converted into providers at initialization time.
 */
export class WorkflowRegistry {
  private providers = new Map<string, FlowProvider>();

  /** Register a provider by workflow id. Later registrations overwrite. */
  register(id: string, provider: FlowProvider): void {
    this.providers.set(id, provider);
  }

  /** Remove a provider. */
  unregister(id: string): void {
    this.providers.delete(id);
  }

  /** Get all registered flow ids. */
  ids(): string[] {
    return Array.from(this.providers.keys());
  }

  /** Resolve all providers into WorkflowFlow objects. */
  async getAll(): Promise<WorkflowFlow[]> {
    const flows: WorkflowFlow[] = [];
    for (const provider of this.providers.values()) {
      try {
        flows.push(await provider());
      } catch {
        // skip broken providers silently
      }
    }
    return flows;
  }

  /** Resolve a single flow by id. */
  async get(id: string): Promise<WorkflowFlow | null> {
    const provider = this.providers.get(id);
    if (!provider) return null;
    try {
      return await provider();
    } catch {
      return null;
    }
  }
}

// ---------- Custom workflow provider factory ----------

/**
 * Converts a config-defined WorkflowDefinition into a WorkflowFlow.
 * Custom workflows don't have rich content or archive parsing — they return
 * a static flow with all steps in "pending" status.
 */
function customWorkflowProvider(def: WorkflowDefinition): FlowProvider {
  return async () => ({
    id: def.id,
    name: def.name,
    description: def.description,
    icon: def.icon || "Workflow",
    runs: [
      {
        id: `${def.id}-default`,
        flowId: def.id,
        name: def.name,
        status: "waiting" as const,
        startedAt: new Date().toISOString(),
        steps: def.steps.map((s) => ({
          id: s.id,
          name: s.name,
          status: "pending" as const,
          agents: s.agents,
          details: s.description,
        })),
        stats: {
          agentsUsed: Array.from(new Set(def.steps.flatMap((s) => s.agents))),
        },
      },
    ],
  });
}

// ---------- Initialization ----------

/**
 * Build and return a fully-initialized WorkflowRegistry.
 *
 * 1. If an agent system with a sprints/ directory is detected, register Sprint Planning.
 * 2. If the config contains custom `workflows`, register each one.
 */
export function buildRegistry(): WorkflowRegistry {
  const registry = new WorkflowRegistry();

  // --- Built-in: Sprint Planning (only when agent system exists) ---
  const agentBase = getAgentSystemBase();
  if (agentBase) {
    const config = getConfig();
    const sprintDir = config.agentSystem?.sprintDir ?? "sprints/";
    const sprintsPath = join(agentBase, sprintDir);
    if (existsSync(sprintsPath)) {
      registry.register("sprint-planning", getSprintPlanningFlow);
    }
  }

  // --- Custom workflows from config ---
  const config = getConfig();
  const customWorkflows = config.workflows as WorkflowDefinition[] | undefined;

  if (Array.isArray(customWorkflows)) {
    for (const def of customWorkflows) {
      if (def.id && def.name && Array.isArray(def.steps)) {
        registry.register(def.id, customWorkflowProvider(def));
      }
    }
  }

  return registry;
}

// ---------- Pipeline Registry (new workflow engine) ----------

let _pipelineBaseDir = ".agent-studio/workflows";

/** Override base directory for pipeline definitions (useful for tests) */
export function setPipelineBaseDir(dir: string): void {
  _pipelineBaseDir = dir;
}

function defPath(id: string): string {
  return join(_pipelineBaseDir, id, "definition.json");
}

/**
 * CRUD operations for WorkflowPipelineDef.
 * Saves/loads definitions to `.agent-studio/workflows/{id}/definition.json`.
 */
export class PipelineRegistry {
  /** Save a new workflow definition (validates first) */
  saveWorkflow(def: WorkflowPipelineDef): { error?: string } {
    const validation = validateWorkflow(def);
    if (!validation.valid) {
      return { error: validation.errors.join("; ") };
    }

    const filePath = defPath(def.id);
    const dir = join(_pipelineBaseDir, def.id);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, JSON.stringify(def, null, 2), "utf-8");
    return {};
  }

  /** Update an existing workflow (validates, blocks if active run exists) */
  updateWorkflow(id: string, patch: Partial<WorkflowPipelineDef>): { error?: string } {
    const existing = this.getWorkflow(id);
    if (!existing) {
      return { error: `Workflow '${id}' not found` };
    }

    // Block if active run exists
    const active = getActiveRuns().filter((r) => r.workflowId === id);
    if (active.length > 0) {
      return { error: "Cannot update workflow while runs are active. Cancel active runs first." };
    }

    const updated: WorkflowPipelineDef = { ...existing, ...patch, id };
    return this.saveWorkflow(updated);
  }

  /** Delete a workflow (blocks if active run exists) */
  deleteWorkflow(id: string): { error?: string } {
    const active = getActiveRuns().filter((r) => r.workflowId === id);
    if (active.length > 0) {
      return { error: "Cannot delete workflow while runs are active. Cancel active runs first." };
    }

    const dir = join(_pipelineBaseDir, id);
    if (!existsSync(dir)) {
      return { error: `Workflow '${id}' not found` };
    }

    rmSync(dir, { recursive: true, force: true });
    return {};
  }

  /** Get a single workflow definition */
  getWorkflow(id: string): WorkflowPipelineDef | null {
    const filePath = defPath(id);
    if (!existsSync(filePath)) return null;
    try {
      return JSON.parse(readFileSync(filePath, "utf-8")) as WorkflowPipelineDef;
    } catch {
      return null;
    }
  }

  /** List all workflow definitions */
  listWorkflows(): WorkflowPipelineDef[] {
    if (!existsSync(_pipelineBaseDir)) return [];

    const entries = readdirSync(_pipelineBaseDir, { withFileTypes: true });
    const workflows: WorkflowPipelineDef[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const def = this.getWorkflow(entry.name);
      if (def) workflows.push(def);
    }

    return workflows;
  }

  /** Load all definitions from disk (for startup) */
  loadAll(): WorkflowPipelineDef[] {
    return this.listWorkflows();
  }
}
