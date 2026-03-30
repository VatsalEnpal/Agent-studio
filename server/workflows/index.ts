import type { WorkflowFlow, WorkflowRun } from "./types.js";
import { buildRegistry, type WorkflowRegistry } from "./workflow-registry.js";

export type { WorkflowFlow, WorkflowRun, WorkflowStep } from "./types.js";
export type { WorkflowDefinition, WorkflowStepDefinition } from "./workflow-registry.js";

export class WorkflowManager {
  private registry: WorkflowRegistry;

  constructor() {
    this.registry = buildRegistry();
  }

  /** Re-initialize the registry (e.g. after config change). */
  reload(): void {
    this.registry = buildRegistry();
  }

  async getFlows(): Promise<WorkflowFlow[]> {
    return this.registry.getAll();
  }

  async getFlow(flowId: string): Promise<WorkflowFlow | null> {
    return this.registry.get(flowId);
  }

  async getRun(
    flowId: string,
    runId: string,
  ): Promise<WorkflowRun | null> {
    const flow = await this.getFlow(flowId);
    if (!flow) return null;
    return flow.runs.find((r) => r.id === runId) ?? null;
  }
}
