import type { RepoStatus } from "@/lib/types";

export interface DiscoveredProcess {
  pid: number;
  command: string;
  args: string;
  cwd: string;
  startTime: string;
  user: string;
  model?: string;
  modelShort?: "opus" | "sonnet" | "haiku" | "unknown";
  cost?: string;
  tokens?: string;
  totalCost?: number;
  totalTokens?: number;
  sessionId?: string;
}

export interface PastSession {
  id: string;
  project: string;
  projectShort?: string;
  modified: number;
  date: string;
  agent?: string;
  preview?: string;
}

export interface DevServer {
  pid: number;
  port: number;
  command: string;
  cwd: string;
  name: string;
  running: boolean;
  isSelf: boolean;
  isCustom?: boolean;
}

export interface SidebarProps {
  onNewSession: () => void;
  onKillSession: (id: string) => void;
}

export type RepoAction = (repo: RepoStatus) => void;
