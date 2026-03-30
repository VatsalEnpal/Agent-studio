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

interface WorkflowState {
  flows: WorkflowFlow[];
  selectedFlowId: string | null;
  selectedRunId: string | null;
  loading: boolean;

  setFlows: (flows: WorkflowFlow[]) => void;
  selectRun: (flowId: string, runId: string) => void;
  setLoading: (loading: boolean) => void;
}

export const useWorkflowStore = create<WorkflowState>((set) => ({
  flows: [],
  selectedFlowId: null,
  selectedRunId: null,
  loading: true,

  setFlows: (flows) => set({ flows }),
  selectRun: (flowId, runId) =>
    set({ selectedFlowId: flowId, selectedRunId: runId }),
  setLoading: (loading) => set({ loading }),
}));
