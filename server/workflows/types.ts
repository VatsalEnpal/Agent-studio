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
  /** Last N scan log entries for PMO scan step */
  scanEntries?: ScanLogEntry[];
  /** Total tickets found in latest scan */
  ticketsFound?: number;
  /** Domains found in scan */
  domains?: string[];
  /** READY / NOT READY status text */
  readinessStatus?: string;
  /** Full scan log text (for "view full" toggle) */
  fullScanLog?: string;
  /** Sprint spec formatted sections */
  sprintTitle?: string;
  sprintStatus?: string;
  sprintCreated?: string;
  taskCount?: { total: number; safe: number; medium: number; high: number };
  assignedAgents?: string[];
  /** Rendered spec preview (first ~20 lines) */
  specPreview?: string;
  /** Full spec markdown */
  fullSpec?: string;
  /** Approval summary - what will be built */
  buildSummary?: string[];
  /** Estimated scope */
  estimatedScope?: string;
  /** Gate checks - what this gate verifies */
  gateChecks?: string[];
  /** Gate results - what passed */
  gateResults?: string[];
  /** Files changed */
  filesChanged?: number;
  /** Handoff files found */
  handoffs?: HandoffEntry[];
  /** Agent-specific notes */
  agentNotes?: string;
  /** QA health score */
  qaHealth?: number;
  /** PR link */
  prLink?: string;
  /** Deploy summary */
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
