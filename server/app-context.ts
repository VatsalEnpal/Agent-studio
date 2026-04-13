/**
 * Application context and dependency-injection interfaces.
 *
 * Defines forward-declaration interfaces for all managers so that modules
 * can depend on abstractions rather than concrete implementations.
 * The actual implementations are provided by Workstream 2.
 *
 * @module server/app-context
 */

import type { WebSocketServer } from "ws";
import type { Express } from "express";
import type {
  Session,
  SessionMeta,
  WsMessage,
  SprintState,
  AgentStudioConfig,
} from "./shared/types.js";

// ---------------------------------------------------------------------------
// Manager Interfaces (forward declarations for WS2 implementations)
// ---------------------------------------------------------------------------

/** Manages PTY-backed terminal sessions. */
export interface ITerminalManager {
  createSession(opts: {
    name: string;
    command?: string;
    args?: string[];
    cwd?: string;
    cols?: number;
    rows?: number;
    meta?: SessionMeta;
  }): Session;
  killSession(id: string): void;
  writeToSession(id: string, data: string): void;
  resizeSession(id: string, cols: number, rows: number): void;
  getSessionBuffer(id: string): string;
  listSessions(): Session[];
  onEvent(handler: (message: WsMessage) => void): () => void;
}

/** Manages Claude Agent SDK sessions for room conversations. */
export interface ISdkSessionManager {
  createSession(opts: {
    agentId: string;
    roomId: string;
    cwd: string;
    model: string;
    agentProfile?: string;
  }): void;
  sendMessage(
    agentId: string,
    prompt: string,
    callbacks: {
      onTypingStart: (agentId: string) => void;
      onTextDelta: (agentId: string, delta: string) => void;
      onResult: (
        agentId: string,
        text: string,
        usage?: { totalCostUsd: number; inputTokens: number; outputTokens: number },
      ) => void;
      onError: (agentId: string, err: Error) => void;
      onIdle: (agentId: string) => void;
    },
  ): Promise<void>;
  getSession(agentId: string): unknown;
  destroySession(agentId: string): void | Promise<void>;
}

/** Manages sprint lifecycle, gates, and agent coordination. */
export interface ISprintManager {
  getState(): SprintState | null;
  getActiveSprint(): string | null;
  getArchivedSprints(): string[];
  approveGate(gate: string): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
}

/** Tracks child processes for cleanup on shutdown. */
export interface IProcessTracker {
  track(name: string, pid: number): void;
  untrack(name: string): void;
  killAll(): Promise<void>;
  isAlive(name: string): boolean;
}

// ---------------------------------------------------------------------------
// App Context
// ---------------------------------------------------------------------------

/**
 * Central dependency container passed to route handlers, middleware,
 * and lifecycle hooks. Created once at startup, never mutated after init.
 */
export interface AppContext {
  /** Express application instance. */
  app: Express;
  /** WebSocket server for real-time client communication. */
  wss: WebSocketServer;
  /** PTY terminal session manager. */
  terminalManager: ITerminalManager;
  /** Claude Agent SDK session manager for rooms. */
  sdkSessionManager: ISdkSessionManager;
  /** Sprint lifecycle and gate manager. */
  sprintManager: ISprintManager;
  /** Centralized child-process tracker for graceful shutdown. */
  processTracker: IProcessTracker;
  /** Validated application configuration. */
  config: AgentStudioConfig;
  /** Absolute path to the agent system directory, or null if unconfigured. */
  agentSystemPath: string | null;
}
