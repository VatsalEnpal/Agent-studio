export interface SessionMeta {
  model?: "opus" | "sonnet" | "haiku";
  agent?: string;
  permissions?: "bypass" | "default" | "plan" | "auto";
  channel?: "none" | "telegram";
  group?: "sprint" | "standalone";
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
  status: "starting" | "active" | "idle" | "building" | "exited";
  exitCode?: number;
  createdAt: number;
  meta?: SessionMeta;
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
    | "automation-report";
  sessionId?: string;
  data?: string;
  cols?: number;
  rows?: number;
  payload?: unknown;
}
