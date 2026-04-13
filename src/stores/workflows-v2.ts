/**
 * Zustand store for the new workflow engine (v2).
 *
 * Manages workflow pipeline definitions, runs, and real-time updates.
 * Does NOT modify the existing workflows.ts store — kept for backward compat.
 */

import { create } from "zustand";

// ---------- Types (mirror server types for the client) ----------

export interface WorkflowPipelineClient {
  id: string;
  name: string;
  description?: string;
  mode: "execute" | "watch" | "hybrid";
  trigger: {
    type: "manual" | "scheduled" | "event";
    interval?: string;
    paused?: boolean;
    stateFile?: string;
  };
  workingDirectory: string;
  steps: PipelineStepClient[];
  schedule?: {
    workflowId: string;
    interval: string;
    intervalMs: number;
    paused: boolean;
    nextRunAt?: string;
  } | null;
  activeRuns?: number;
}

export interface PipelineStepClient {
  id: string;
  name: string;
  type: "agent" | "gate" | "loop" | "agent-group";
  agent?: string;
  goal?: string;
  model?: string;
  output?: string;
  reviewArtifact?: string;
  allowFeedback?: boolean;
  notify?: string[];
  steps?: string[] | PipelineStepClient[];
  maxIterations?: number;
  onExhausted?: string;
  onFailure?: string;
}

export interface RunStateClient {
  runId: string;
  workflowId: string;
  status: string;
  currentStep: string | null;
  startedAt: string;
  completedAt?: string;
  steps: Record<string, StepStateClient>;
  error?: string;
}

export interface StepStateClient {
  id: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  output?: string;
  iteration?: number;
  feedback?: string;
  subSteps?: Record<string, StepStateClient>;
}

export interface RunSummaryClient {
  runId: string;
  workflowId: string;
  status: string;
  startedAt: string;
  completedAt?: string;
}

// ---------- Store ----------

interface WorkflowV2State {
  workflows: WorkflowPipelineClient[];
  selectedWorkflowId: string | null;
  runs: RunSummaryClient[];
  activeRun: RunStateClient | null;
  loading: boolean;

  // Actions
  fetchWorkflows: () => Promise<void>;
  createWorkflow: (def: WorkflowPipelineClient) => Promise<{ error?: string }>;
  deleteWorkflow: (id: string) => Promise<{ error?: string }>;
  selectWorkflow: (id: string | null) => void;
  startRun: (workflowId: string) => Promise<{ runId?: string; error?: string }>;
  fetchRuns: (workflowId: string) => Promise<void>;
  fetchRunDetail: (workflowId: string, runId: string) => Promise<void>;
  approveGate: (workflowId: string, runId: string, stepId: string) => Promise<void>;
  rejectGate: (
    workflowId: string,
    runId: string,
    stepId: string,
    feedback?: string,
  ) => Promise<void>;
  pauseRun: (workflowId: string, runId: string) => Promise<void>;
  resumeRun: (workflowId: string, runId: string) => Promise<void>;
  cancelRun: (workflowId: string, runId: string) => Promise<void>;
  retryStep: (workflowId: string, runId: string, stepId: string) => Promise<void>;

  // WebSocket event handlers
  handleStepUpdate: (payload: Record<string, unknown>) => void;
  handleGateWaiting: (payload: Record<string, unknown>) => void;
  handleRunComplete: (payload: Record<string, unknown>) => void;
  handleRunFailed: (payload: Record<string, unknown>) => void;
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api/workflows${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  return res.json() as Promise<T>;
}

export const useWorkflowV2Store = create<WorkflowV2State>((set, get) => ({
  workflows: [],
  selectedWorkflowId: null,
  runs: [],
  activeRun: null,
  loading: false,

  fetchWorkflows: async () => {
    set({ loading: true });
    try {
      const workflows = await api<WorkflowPipelineClient[]>("");
      set({ workflows, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createWorkflow: async (def) => {
    try {
      const result = await api<{ id?: string; error?: string }>("", {
        method: "POST",
        body: JSON.stringify(def),
      });
      if (result.error) return { error: result.error };
      await get().fetchWorkflows();
      return {};
    } catch (err) {
      return { error: String(err) };
    }
  },

  deleteWorkflow: async (id) => {
    try {
      const result = await api<{ error?: string }>(`/${id}`, { method: "DELETE" });
      if (result.error) return { error: result.error };
      await get().fetchWorkflows();
      return {};
    } catch (err) {
      return { error: String(err) };
    }
  },

  selectWorkflow: (id) => set({ selectedWorkflowId: id }),

  startRun: async (workflowId) => {
    try {
      const result = await api<{ runId?: string; error?: string }>(`/${workflowId}/run`, {
        method: "POST",
      });
      if (result.error) return { error: result.error };
      if (result.runId) {
        await get().fetchRuns(workflowId);
      }
      return { runId: result.runId };
    } catch (err) {
      return { error: String(err) };
    }
  },

  fetchRuns: async (workflowId) => {
    try {
      const runs = await api<RunSummaryClient[]>(`/${workflowId}/runs`);
      set({ runs });
    } catch {
      // ignore
    }
  },

  fetchRunDetail: async (workflowId, runId) => {
    try {
      const run = await api<RunStateClient>(`/${workflowId}/runs/${runId}`);
      set({ activeRun: run });
    } catch {
      // ignore
    }
  },

  approveGate: async (workflowId, runId, stepId) => {
    await api(`/${workflowId}/runs/${runId}/approve/${stepId}`, { method: "POST" });
  },

  rejectGate: async (workflowId, runId, stepId, feedback?) => {
    await api(`/${workflowId}/runs/${runId}/reject/${stepId}`, {
      method: "POST",
      body: JSON.stringify({ feedback }),
    });
  },

  pauseRun: async (workflowId, runId) => {
    await api(`/${workflowId}/runs/${runId}/pause`, { method: "POST" });
  },

  resumeRun: async (workflowId, runId) => {
    await api(`/${workflowId}/runs/${runId}/resume`, { method: "POST" });
  },

  cancelRun: async (workflowId, runId) => {
    await api(`/${workflowId}/runs/${runId}/cancel`, { method: "POST" });
  },

  retryStep: async (workflowId, runId, stepId) => {
    await api(`/${workflowId}/runs/${runId}/retry/${stepId}`, { method: "POST" });
  },

  // WebSocket event handlers
  handleStepUpdate: (payload) => {
    const { runId, workflowId } = payload as { runId: string; workflowId: string };
    const state = get();
    if (state.activeRun?.runId === runId) {
      state.fetchRunDetail(workflowId, runId);
    }
    state.fetchWorkflows();
  },

  handleGateWaiting: (payload) => {
    const { runId, workflowId } = payload as { runId: string; workflowId: string };
    const state = get();
    if (state.activeRun?.runId === runId) {
      state.fetchRunDetail(workflowId, runId);
    }
    state.fetchWorkflows();
  },

  handleRunComplete: (payload) => {
    const { workflowId } = payload as { workflowId: string };
    get().fetchWorkflows();
    get().fetchRuns(workflowId);
  },

  handleRunFailed: (payload) => {
    const { workflowId } = payload as { workflowId: string };
    get().fetchWorkflows();
    get().fetchRuns(workflowId);
  },
}));
