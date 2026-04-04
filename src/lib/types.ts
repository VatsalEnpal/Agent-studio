export type SessionStatus = "starting" | "active" | "idle" | "building" | "exited";

export interface SessionMeta {
  model?: "opus" | "sonnet" | "haiku";
  agent?: string;
  permissions?: "bypass" | "default" | "plan" | "auto";
  channel?: "none" | "telegram";
  group?: "sprint" | "standalone" | "room";
  roomId?: string;
  roomName?: string;
  cost?: string;
  contextPercent?: number;
}

export interface Session {
  id: string;
  name: string;
  pid: number;
  command: string;
  args: string[];
  cwd: string;
  status: SessionStatus;
  exitCode?: number;
  createdAt: number;
  updatedAt: number;
  meta?: SessionMeta;
}

export interface SessionUsageData {
  pid: number;
  sessionId: string;
  cwd: string;
  model: string;
  modelShort: "opus" | "sonnet" | "haiku" | "unknown";
  totalInputTokens: number;
  totalOutputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalCost: number;
  totalTokens: number;
  startedAt: number;
  messageCount: number;
  contextUsed: number;
  contextTotal: number;
  contextPercent: number;
}

export interface WsMessage {
  type:
    | "terminal-data"
    | "terminal-resize"
    | "terminal-input"
    | "sessions-update"
    | "file-update"
    | "git-update"
    | "workflow-update"
    | "usage-update"
    | "automation-report"
    | "room-message"
    | "room-agent-status"
    | "room-agent-typing"
    | "room-agent-streaming"
    | "room-agent-activity"
    | "room-approval";
  sessionId?: string;
  data?: string;
  cols?: number;
  rows?: number;
  payload?: unknown;
}

export interface BranchInfo {
  name: string;
  lastCommit: string;
  isCurrent: boolean;
}

export interface RepoStatus {
  path: string;
  name: string;
  branch: string;
  dirty: boolean;
  lastCommit: string;
  changedFiles: number;
  isProd: boolean;
  branches?: BranchInfo[];
}

export type ActiveMode = "sessions" | "teams" | "sprints" | "memory" | "reports" | "settings";

export interface LauncherPreset {
  name: string;
  model: "opus" | "sonnet" | "haiku";
  agent: string;
  permissions: "bypass" | "default" | "plan" | "auto";
  channel: "none" | "telegram";
  cwd: string;
  customName?: string;
}
