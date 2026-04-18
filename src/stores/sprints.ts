import { create } from "zustand";

export type GateStatus = "not_started" | "in_progress" | "awaiting" | "passed" | "failed";
export type SprintStatus =
  | "planned"
  | "launching"
  | "in_progress"
  | "paused"
  | "completed"
  | "cancelled"
  | "failed";

export interface Gate {
  id: string;
  name: string;
  status: GateStatus;
  requirements: Array<{ label: string; met: boolean }>;
  action?: { label: string; type: "go" | "approve" | "input" } | null;
  details?: string | null;
  richContent?: Record<string, unknown> | null;
  /** S3: agent attached to this step (from pipelineDef), for step-card chrome. */
  agent?: string | null;
  /** S3: true when the executor has written a handoff output JSON for this step. */
  hasOutput?: boolean;
}

export interface SprintAgent {
  name: string;
  color: string;
  status: "idle" | "working" | "done" | "error";
  currentTask?: string;
}

export interface ActivityEntry {
  id: string;
  timestamp: string;
  agent: string;
  action: string;
  type: "task" | "handoff" | "gate" | "qa" | "error" | "info";
  handoffData?: Record<string, unknown>;
  qaScore?: number;
}

export interface Sprint {
  id: string;
  name: string;
  status: SprintStatus;
  startedAt?: string;
  completedAt?: string;
  gates: Gate[];
  agents: SprintAgent[];
  qaScore?: number;
  activity: ActivityEntry[];
}

interface SprintsState {
  sprints: Sprint[];
  selectedSprintId: string | null;
  loading: boolean;
  activeTab: "overview" | "activity";
  expandedGateId: string | null;
  handoffPanelData: Record<string, unknown> | null;
  specPanelOpen: boolean;
  specContent: string | null;
  specLoading: boolean;

  setSprints: (sprints: Sprint[]) => void;
  selectSprint: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  setActiveTab: (tab: "overview" | "activity") => void;
  setExpandedGate: (id: string | null) => void;
  setHandoffPanelData: (data: Record<string, unknown> | null) => void;
  updateSprint: (id: string, updates: Partial<Sprint>) => void;
  setSpecPanel: (open: boolean) => void;
  setSpecContent: (content: string | null) => void;
  setSpecLoading: (loading: boolean) => void;
}

export const useSprintsStore = create<SprintsState>((set) => ({
  sprints: [],
  selectedSprintId: null,
  loading: false,
  activeTab: "overview",
  expandedGateId: null,
  handoffPanelData: null,
  specPanelOpen: false,
  specContent: null,
  specLoading: false,

  setSprints: (sprints) => set({ sprints }),
  selectSprint: (selectedSprintId) => set({ selectedSprintId, handoffPanelData: null }),
  setLoading: (loading) => set({ loading }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setExpandedGate: (expandedGateId) => set({ expandedGateId }),
  setHandoffPanelData: (handoffPanelData) => set({ handoffPanelData }),
  updateSprint: (id, updates) =>
    set((state) => ({
      sprints: state.sprints.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    })),
  setSpecPanel: (specPanelOpen) => set({ specPanelOpen }),
  setSpecContent: (specContent) => set({ specContent }),
  setSpecLoading: (specLoading) => set({ specLoading }),
}));
