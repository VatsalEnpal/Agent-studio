import { create } from "zustand";

export interface ScanLogEntry {
  timestamp: string;
  status: string;
  detail: string;
}

export interface HandoffEntry {
  from: string;
  to: string;
  file: string;
  detail: string;
  content?: Record<string, unknown>;
}

export interface StepRichContent {
  type: "pmo-scan" | "readiness-report" | "sprint-spec" | "approval" | "gate" | "deploy";
  scanEntries?: ScanLogEntry[];
  ticketsFound?: number;
  domains?: string[];
  readinessStatus?: string;
  fullScanLog?: string;
  sprintTitle?: string;
  sprintStatus?: string;
  sprintCreated?: string;
  taskCount?: { total: number; safe: number; medium: number; high: number };
  assignedAgents?: string[];
  specPreview?: string;
  fullSpec?: string;
  buildSummary?: string[];
  estimatedScope?: string;
  gateChecks?: string[];
  gateResults?: string[];
  filesChanged?: number;
  handoffs?: HandoffEntry[];
  agentNotes?: string;
  qaHealth?: number;
  prLink?: string;
  deploySummary?: string;
}

export interface WorkflowStep {
  id: string;
  name: string;
  status: "completed" | "active" | "waiting" | "pending" | "failed";
  agents: string[];
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  iterations?: number;
  details?: string;
  action?: { label: string; type: "go" | "approve" | "input" };
  richContent?: StepRichContent;
}

export interface WorkflowRun {
  id: string;
  flowId: string;
  name: string;
  status: "running" | "completed" | "failed" | "waiting";
  startedAt: string;
  completedAt?: string;
  steps: WorkflowStep[];
  stats: {
    filesChanged?: number;
    qaHealth?: number;
    agentsUsed: string[];
  };
}

export interface WorkflowFlow {
  id: string;
  name: string;
  description: string;
  icon: string;
  runs: WorkflowRun[];
}

// Builder types for creating custom workflows
export interface WorkflowStepDraft {
  id: string;
  name: string;
  description: string;
  agent: string;
}

export interface WorkflowDraft {
  name: string;
  description: string;
  icon: string;
  steps: WorkflowStepDraft[];
}

interface WorkflowState {
  flows: WorkflowFlow[];
  selectedFlowId: string | null;
  selectedRunId: string | null;
  loading: boolean;
  builderOpen: boolean;
  editingWorkflowId: string | null;
  draft: WorkflowDraft;
  saving: boolean;

  setFlows: (flows: WorkflowFlow[]) => void;
  selectRun: (flowId: string, runId: string) => void;
  setLoading: (loading: boolean) => void;
  openBuilder: (editId?: string | null) => void;
  closeBuilder: () => void;
  setDraft: (draft: WorkflowDraft) => void;
  updateDraftField: <K extends keyof WorkflowDraft>(key: K, value: WorkflowDraft[K]) => void;
  addStep: () => void;
  removeStep: (stepId: string) => void;
  updateStep: (stepId: string, updates: Partial<WorkflowStepDraft>) => void;
  moveStep: (stepId: string, direction: "up" | "down") => void;
  setSaving: (saving: boolean) => void;
  resetDraft: () => void;
}

function emptyDraft(): WorkflowDraft {
  return {
    name: "",
    description: "",
    icon: "Rocket",
    steps: [
      { id: `step-${Date.now()}`, name: "", description: "", agent: "" },
    ],
  };
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  flows: [],
  selectedFlowId: null,
  selectedRunId: null,
  loading: true,
  builderOpen: false,
  editingWorkflowId: null,
  draft: emptyDraft(),
  saving: false,

  setFlows: (flows) => set({ flows }),
  selectRun: (flowId, runId) =>
    set({ selectedFlowId: flowId, selectedRunId: runId }),
  setLoading: (loading) => set({ loading }),

  openBuilder: (editId = null) => {
    if (editId) {
      // Load existing workflow into draft
      const cfg = get().flows.find((f) => f.id === editId);
      if (cfg) {
        const steps = cfg.runs[0]?.steps.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.details ?? "",
          agent: s.agents[0] ?? "",
        })) ?? [{ id: `step-${Date.now()}`, name: "", description: "", agent: "" }];
        set({
          builderOpen: true,
          editingWorkflowId: editId,
          draft: {
            name: cfg.name,
            description: cfg.description,
            icon: cfg.icon,
            steps,
          },
        });
        return;
      }
    }
    set({ builderOpen: true, editingWorkflowId: null, draft: emptyDraft() });
  },
  closeBuilder: () => set({ builderOpen: false, editingWorkflowId: null }),

  setDraft: (draft) => set({ draft }),
  updateDraftField: (key, value) =>
    set((state) => ({ draft: { ...state.draft, [key]: value } })),

  addStep: () =>
    set((state) => ({
      draft: {
        ...state.draft,
        steps: [
          ...state.draft.steps,
          { id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: "", description: "", agent: "" },
        ],
      },
    })),

  removeStep: (stepId) =>
    set((state) => ({
      draft: {
        ...state.draft,
        steps: state.draft.steps.filter((s) => s.id !== stepId),
      },
    })),

  updateStep: (stepId, updates) =>
    set((state) => ({
      draft: {
        ...state.draft,
        steps: state.draft.steps.map((s) =>
          s.id === stepId ? { ...s, ...updates } : s,
        ),
      },
    })),

  moveStep: (stepId, direction) =>
    set((state) => {
      const steps = [...state.draft.steps];
      const idx = steps.findIndex((s) => s.id === stepId);
      if (idx < 0) return state;
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= steps.length) return state;
      [steps[idx], steps[newIdx]] = [steps[newIdx]!, steps[idx]!];
      return { draft: { ...state.draft, steps } };
    }),

  setSaving: (saving) => set({ saving }),
  resetDraft: () => set({ draft: emptyDraft(), editingWorkflowId: null }),
}));
