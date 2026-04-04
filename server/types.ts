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
  status: "starting" | "active" | "idle" | "building" | "exited";
  exitCode?: number;
  createdAt: number;
  updatedAt: number;
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
    | "room-message"
    | "room-agent-status"
    | "room-approval";
  sessionId?: string;
  data?: string;
  cols?: number;
  rows?: number;
  payload?: unknown;
}
