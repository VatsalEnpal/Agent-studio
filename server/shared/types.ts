/**
 * Shared type definitions for Agent Studio server and client.
 * All types used across multiple modules should be defined here.
 * @module server/shared/types
 */

// === Session Types ===

/** Lifecycle status of a terminal or SDK session. */
export type SessionStatus = "starting" | "active" | "idle" | "building" | "exited";

/** Metadata attached to a session at creation time. */
export interface SessionMeta {
  model: "opus" | "sonnet" | "haiku";
  agent: string;
  permissions: "bypass" | "default" | "plan" | "auto";
  channel?: string;
  group?: string;
  roomId?: string;
  roomName?: string;
}

/** A running or exited agent session (PTY-backed or SDK-backed). */
export interface Session {
  id: string;
  name: string;
  pid: number | null;
  command: string;
  args: string[];
  cwd: string;
  status: SessionStatus;
  exitCode: number | null;
  createdAt: string;
  meta: SessionMeta;
}

/** Aggregated token and cost usage data for a session. */
export interface SessionUsageData {
  totalCostUsd: number;
  inputTokens: number;
  outputTokens: number;
  contextPercentUsed: number;
}

// === Room Types ===

/** Possible states of an agent within a room. */
export type RoomAgentStatus = "idle" | "working" | "offline" | "error";

/** An agent participating in a room conversation. */
export interface RoomAgent {
  id: string;
  name: string;
  model: string;
  status: RoomAgentStatus;
  sessionId?: string;
}

/** A single message in a room conversation. */
export interface RoomMessage {
  id: string;
  from: string;
  text: string;
  to?: string;
  type: "message" | "system" | "approval-request";
  timestamp: string;
  approved?: boolean;
}

/** A collaborative room where agents converse and coordinate. */
export interface Room {
  id: string;
  name: string;
  topic: string;
  agents: RoomAgent[];
  messages: RoomMessage[];
  contextFile?: string;
  createdAt: string;
}

// === Sprint Types ===

/** Status of a quality gate within a sprint. */
export type GateStatus = "not_started" | "in_progress" | "passed" | "failed";

/** Overall status of a sprint lifecycle. */
export type SprintStatus =
  | "planned"
  | "launching"
  | "in_progress"
  | "paused"
  | "completed"
  | "cancelled"
  | "failed";

/** Status of an individual agent within a sprint. */
export type AgentSprintStatus = "not_spawned" | "idle" | "working" | "done" | "error";

/** Quality gates tracked for each sprint. */
export interface SprintGates {
  gate_1_backend_security: GateStatus;
  gate_2_frontend: GateStatus;
  gate_3_qa_security: GateStatus;
}

/** Map of agent IDs to their sprint status. */
export interface SprintAgents {
  [agentId: string]: AgentSprintStatus;
}

/** Full state of a sprint including gates, agents, and timing. */
export interface SprintState {
  version: string;
  sprint: string | null;
  status: SprintStatus;
  gates: SprintGates;
  agents: SprintAgents;
  startedAt?: string;
  completedAt?: string;
}

/** A handoff record between agents during a sprint. */
export interface Handoff {
  timestamp: string;
  agent: string;
  target: string;
  deliverables: Array<{ file: string; changes: string }>;
  data_contract?: Record<string, unknown>;
  blocking_issues: string[];
  next_steps: string;
}

/** QA report generated after test runs. */
export interface QaReport {
  timestamp: string;
  health_score: number;
  bugs: Array<{ severity: string; title: string; assigned_to?: string }>;
  passed_flows: string[];
}

// === Config Types ===

/** A project tracked by Agent Studio. */
export interface ProjectConfig {
  name: string;
  path: string;
  isProd: boolean;
  trackedBranches?: string[];
}

/** A development server that can be started/stopped from the dashboard. */
export interface DevServerConfig {
  name: string;
  path: string;
  command: string;
  port?: number;
}

/** Top-level configuration for the Agent Studio application. */
export interface AgentStudioConfig {
  projects: ProjectConfig[];
  agentSystem?: {
    path: string;
    memoryIndex: string;
    sprintDir: string;
    scanLog?: string;
  };
  devServers: DevServerConfig[];
  defaults: {
    model: string;
    permissions: string;
    workingDirectory: string;
  };
  setupComplete: boolean;
  version: string;
}

// === WebSocket Event Types ===

/** All WebSocket event types used for real-time communication. */
export type WsEventType =
  | "sessions-update"
  | "terminal-data"
  | "terminal-input"
  | "terminal-resize"
  | "room-message"
  | "room-agent-status"
  | "room-agent-typing"
  | "room-agent-activity"
  | "room-agent-streaming"
  | "room-approval"
  | "sprint-update"
  | "memory-update"
  | "git-update"
  | "server-status"
  | "notification";

/** A WebSocket message exchanged between server and client. */
export interface WsMessage {
  type: WsEventType;
  sessionId?: string;
  data?: string;
  cols?: number;
  rows?: number;
  payload?: unknown;
}

// === Notification Types ===

/** Urgency level for notifications. */
export type NotificationPriority = "critical" | "high" | "info";

/** Categories of notifications the system can produce. */
export type NotificationType =
  | "gate-approval"
  | "agent-mention"
  | "agent-stuck"
  | "sprint-complete"
  | "server-crash"
  | "error";

/** A notification displayed in the dashboard or sent to the OS. */
export interface AppNotification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  body: string;
  targetPage?: "sessions" | "rooms" | "sprints" | "memory";
  targetId?: string;
  timestamp: string;
  dismissed: boolean;
  actions?: Array<{ label: string; action: string }>;
}
