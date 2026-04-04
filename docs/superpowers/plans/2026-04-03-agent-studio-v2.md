# Agent Studio v2 — Full Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Agent Studio as a polished, Notion-quality Electron Mac app with 5 pages (Sessions, Rooms, Sprints, Memory, Settings), a hardened server, and comprehensive testing.

**Architecture:** Incremental rebuild on the existing Express + Next.js + node-pty + Claude Agent SDK + Electron stack. Server gets split into modules. Frontend gets rebuilt page-by-page with a new design system. Electron gets crash recovery and native features. Everything gets tested.

**Tech Stack:** TypeScript, Next.js 16, React 19, Express 5, xterm.js, node-pty, Claude Agent SDK, WebSocket (ws), Zustand, Tailwind CSS, shadcn/ui, Electron, Vitest, Playwright

**Codebase:** `/Users/vatsalbhatt230813/Code/side-projects/agent-studio/`

---

## Parallel Workstreams

This plan is designed for 6 agents working in parallel. Each workstream is independent — no agent needs to wait for another. Shared contracts (types, API shapes) are defined in Workstream 1 and referenced by others.

| Workstream | Agent | What it builds | Depends on |
|------------|-------|---------------|------------|
| **WS1** | Server Core | Split index.ts, shared types, broadcast helper, lifecycle, health | Nothing |
| **WS2** | Server Features | Terminal manager, SDK session manager, sprint manager, room protocol | WS1 types |
| **WS3** | Design System | Tokens, theme, base components, shadcn setup | Nothing |
| **WS4** | Frontend Pages | Sessions, Rooms, Sprints, Memory, Settings pages | WS3 tokens |
| **WS5** | Electron | Main process, IPC, crash recovery, native notifications | WS1 server |
| **WS6** | Testing | Unit, integration, E2E, performance, chaos tests | WS1 + WS2 + WS4 |

---

## WORKSTREAM 1: Server Core (Agent: server-core)

Split the 2,608-line monolith. Define shared types. Build the foundation.

### Task 1.1: Shared Types

**Files:**
- Create: `server/shared/types.ts`

- [ ] **Step 1: Create the shared types file**

```typescript
// server/shared/types.ts

// === Session Types ===
export type SessionStatus = "starting" | "active" | "idle" | "building" | "exited";

export interface SessionMeta {
  model: "opus" | "sonnet" | "haiku";
  agent: string;
  permissions: "bypass" | "default" | "plan" | "auto";
  channel?: string;
  group?: string;
  roomId?: string;
  roomName?: string;
}

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

export interface SessionUsageData {
  totalCostUsd: number;
  inputTokens: number;
  outputTokens: number;
  contextPercentUsed: number;
}

// === Room Types ===
export type RoomAgentStatus = "idle" | "working" | "offline" | "error";

export interface RoomAgent {
  id: string;
  name: string;
  model: string;
  status: RoomAgentStatus;
  sessionId?: string;
}

export interface RoomMessage {
  id: string;
  from: string;
  text: string;
  to?: string;
  type: "message" | "system" | "approval-request";
  timestamp: string;
  approved?: boolean;
}

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
export type GateStatus = "not_started" | "in_progress" | "passed" | "failed";
export type SprintStatus = "planned" | "launching" | "in_progress" | "paused" | "completed" | "cancelled" | "failed";
export type AgentSprintStatus = "not_spawned" | "idle" | "working" | "done" | "error";

export interface SprintGates {
  gate_1_backend_security: GateStatus;
  gate_2_frontend: GateStatus;
  gate_3_qa_security: GateStatus;
}

export interface SprintAgents {
  [agentId: string]: AgentSprintStatus;
}

export interface SprintState {
  version: string;
  sprint: string | null;
  status: SprintStatus;
  gates: SprintGates;
  agents: SprintAgents;
  startedAt?: string;
  completedAt?: string;
}

export interface Handoff {
  timestamp: string;
  agent: string;
  target: string;
  deliverables: Array<{ file: string; changes: string }>;
  data_contract?: Record<string, unknown>;
  blocking_issues: string[];
  next_steps: string;
}

export interface QaReport {
  timestamp: string;
  health_score: number;
  bugs: Array<{ severity: string; title: string; assigned_to?: string }>;
  passed_flows: string[];
}

// === Config Types ===
export interface ProjectConfig {
  name: string;
  path: string;
  isProd: boolean;
  trackedBranches?: string[];
}

export interface DevServerConfig {
  name: string;
  path: string;
  command: string;
  port?: number;
}

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

export interface WsMessage {
  type: WsEventType;
  sessionId?: string;
  data?: string;
  payload?: unknown;
}

// === Notification Types ===
export type NotificationPriority = "critical" | "high" | "info";
export type NotificationType = "gate-approval" | "agent-mention" | "agent-stuck" | "sprint-complete" | "server-crash" | "error";

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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/vatsalbhatt230813/Code/side-projects/agent-studio && npx tsc --noEmit`
Expected: PASS (or only pre-existing errors)

- [ ] **Step 3: Commit**

```bash
git add server/shared/types.ts
git commit -m "feat: add shared type definitions for server and client"
```

### Task 1.2: WebSocket Broadcast Helper

**Files:**
- Create: `server/ws/broadcast.ts`

- [ ] **Step 1: Create broadcast helper with error handling + backpressure**

```typescript
// server/ws/broadcast.ts
import { WebSocketServer, WebSocket } from "ws";

const MAX_BUFFERED = 1024 * 1024; // 1MB backpressure threshold

export function broadcast(wss: WebSocketServer, message: unknown): void {
  const data = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    if (client.bufferedAmount > MAX_BUFFERED) continue; // backpressure
    try {
      client.send(data);
    } catch {
      // Client in bad state — skip, will be cleaned up on close
    }
  }
}

export function sendTo(client: WebSocket, message: unknown): void {
  if (client.readyState !== WebSocket.OPEN) return;
  try {
    client.send(JSON.stringify(message));
  } catch {
    // Skip
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add server/ws/broadcast.ts
git commit -m "feat: add WebSocket broadcast helper with error handling and backpressure"
```

### Task 1.3: App Context & Dependency Injection

**Files:**
- Create: `server/app-context.ts`

- [ ] **Step 1: Create the AppContext that holds all managers**

```typescript
// server/app-context.ts
import { WebSocketServer } from "ws";
import type { Express } from "express";

// Forward declarations — actual implementations come from WS2
export interface ITerminalManager {
  createSession(opts: any): any;
  killSession(id: string): void;
  writeToSession(id: string, data: string): void;
  getSessionBuffer(id: string): string;
  listSessions(): any[];
  on(event: string, handler: (...args: any[]) => void): void;
}

export interface ISdkSessionManager {
  createSession(opts: any): void;
  sendMessage(agentId: string, prompt: string, callbacks: any): Promise<void>;
  getSession(agentId: string): any;
  destroySession(agentId: string): void;
}

export interface ISprintManager {
  getState(): any;
  getActiveSprint(): any;
  getArchivedSprints(): any[];
  approveGate(gate: string): void;
  on(event: string, handler: (...args: any[]) => void): void;
}

export interface IProcessTracker {
  track(name: string, pid: number): void;
  untrack(name: string): void;
  killAll(): Promise<void>;
  isAlive(name: string): boolean;
}

export interface AppContext {
  app: Express;
  wss: WebSocketServer;
  terminalManager: ITerminalManager;
  sdkSessionManager: ISdkSessionManager;
  sprintManager: ISprintManager;
  processTracker: IProcessTracker;
  config: any;
  agentSystemPath: string | null;
}
```

- [ ] **Step 2: Commit**

```bash
git add server/app-context.ts
git commit -m "feat: add AppContext for dependency injection across server modules"
```

### Task 1.4: Graceful Lifecycle Manager

**Files:**
- Create: `server/lifecycle.ts`

- [ ] **Step 1: Create lifecycle manager with shutdown handling**

```typescript
// server/lifecycle.ts
import type { AppContext } from "./app-context";
import type { Server } from "http";

export function setupGracefulShutdown(ctx: AppContext, server: Server): void {
  let shuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${signal} received. Shutting down gracefully...`);

    // 1. Stop accepting new connections
    server.close();

    // 2. Close WebSocket connections
    for (const client of ctx.wss.clients) {
      try { client.terminate(); } catch {}
    }

    // 3. Kill all tracked processes (PTYs, dev servers, automations)
    try {
      await ctx.processTracker.killAll();
    } catch (err) {
      console.error("Error killing processes:", err);
    }

    // 4. Destroy SDK sessions
    // (handled by sdkSessionManager cleanup)

    console.log("Shutdown complete.");
    process.exit(0);
  }

  // Force exit after 5 seconds if graceful fails
  function forceExit(): void {
    console.error("Graceful shutdown timed out. Forcing exit.");
    process.exit(1);
  }

  process.on("SIGINT", () => {
    setTimeout(forceExit, 5000);
    shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    setTimeout(forceExit, 5000);
    shutdown("SIGTERM");
  });

  process.on("SIGHUP", () => {
    setTimeout(forceExit, 5000);
    shutdown("SIGHUP");
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add server/lifecycle.ts
git commit -m "feat: add graceful shutdown with process cleanup"
```

### Task 1.5: Health Endpoint

**Files:**
- Create: `server/routes/health.ts`

- [ ] **Step 1: Create health check endpoint**

```typescript
// server/routes/health.ts
import { Router } from "express";
import type { AppContext } from "../app-context";

export function healthRoutes(ctx: AppContext): Router {
  const router = Router();

  router.get("/api/health", (_req, res) => {
    const start = Date.now();
    const sessions = ctx.terminalManager.listSessions();

    res.json({
      status: "ok",
      uptime: process.uptime(),
      eventLoopLatency: Date.now() - start,
      activeSessions: sessions.filter((s: any) => s.status === "active").length,
      totalSessions: sessions.length,
      wsClients: ctx.wss.clients.size,
      memoryUsage: process.memoryUsage().heapUsed,
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/health.ts
git commit -m "feat: add /api/health endpoint for Electron watchdog"
```

### Task 1.6: Config Validation with Zod

**Files:**
- Create: `server/config-schema.ts`
- Modify: `server/config.ts`

- [ ] **Step 1: Install zod**

```bash
cd /Users/vatsalbhatt230813/Code/side-projects/agent-studio && npm install zod
```

- [ ] **Step 2: Create config schema**

```typescript
// server/config-schema.ts
import { z } from "zod";

export const ProjectSchema = z.object({
  name: z.string(),
  path: z.string(),
  isProd: z.boolean().default(false),
  trackedBranches: z.array(z.string()).optional(),
});

export const DevServerSchema = z.object({
  name: z.string(),
  path: z.string(),
  command: z.string(),
  port: z.number().optional(),
});

export const ConfigSchema = z.object({
  projects: z.array(ProjectSchema).default([]),
  agentSystem: z.object({
    path: z.string(),
    memoryIndex: z.string(),
    sprintDir: z.string(),
    scanLog: z.string().optional(),
  }).optional(),
  devServers: z.array(DevServerSchema).default([]),
  defaults: z.object({
    model: z.string().default("sonnet"),
    permissions: z.string().default("default"),
    workingDirectory: z.string().default(""),
  }),
  setupComplete: z.boolean().default(false),
  version: z.string().default("1.0.0"),
});

export type ValidatedConfig = z.infer<typeof ConfigSchema>;
```

- [ ] **Step 3: Commit**

```bash
git add server/config-schema.ts
git commit -m "feat: add zod config validation schema"
```

---

## WORKSTREAM 2: Server Features (Agent: server-features)

Terminal manager hardening, SDK session filtering, sprint manager, room protocol.

### Task 2.1: Process Tracker

**Files:**
- Create: `server/managers/process-tracker.ts`

- [ ] **Step 1: Create centralized process tracker**

```typescript
// server/managers/process-tracker.ts
import treeKill from "tree-kill";

interface TrackedProcess {
  name: string;
  pid: number;
  trackedAt: string;
}

export class ProcessTracker {
  private processes = new Map<string, TrackedProcess>();

  track(name: string, pid: number): void {
    this.processes.set(name, {
      name,
      pid,
      trackedAt: new Date().toISOString(),
    });
  }

  untrack(name: string): void {
    this.processes.delete(name);
  }

  isAlive(name: string): boolean {
    const proc = this.processes.get(name);
    if (!proc) return false;
    try {
      process.kill(proc.pid, 0);
      return true;
    } catch {
      this.processes.delete(name);
      return false;
    }
  }

  async killAll(): Promise<void> {
    const kills = Array.from(this.processes.entries()).map(
      ([name, proc]) =>
        new Promise<void>((resolve) => {
          treeKill(proc.pid, "SIGTERM", (err) => {
            if (err) {
              // Try SIGKILL as fallback
              try { process.kill(proc.pid, "SIGKILL"); } catch {}
            }
            this.processes.delete(name);
            resolve();
          });
          // Force resolve after 3 seconds
          setTimeout(resolve, 3000);
        })
    );
    await Promise.allSettled(kills);
  }

  list(): TrackedProcess[] {
    return Array.from(this.processes.values());
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add server/managers/process-tracker.ts
git commit -m "feat: add centralized process tracker for cleanup on shutdown"
```

### Task 2.2: SDK Message Filter (Room Conversation Protocol)

**Files:**
- Create: `server/managers/message-filter.ts`

- [ ] **Step 1: Create message filter that drops thinking/tools, emits final text**

```typescript
// server/managers/message-filter.ts

export interface FilteredResult {
  text: string;
  toolsUsed: Array<{ name: string; input: string }>;
  durationMs: number;
}

export interface FilterCallbacks {
  onTypingStart: (agentId: string) => void;
  onActivity: (agentId: string, activity: string) => void;
  onResult: (agentId: string, result: FilteredResult) => void;
  onError: (agentId: string, error: Error) => void;
}

/**
 * Processes SDK stream events and only emits the final accumulated text.
 * Drops: thinking, tool_use details, tool_result details
 * Emits activity updates: tool name + first arg (for "backend is working... reading foo.ts")
 * Emits final: accumulated text on turn_end
 */
export function processStreamEvents(
  agentId: string,
  conversation: AsyncIterable<any>,
  callbacks: FilterCallbacks,
): { promise: Promise<void>; abort: () => void } {
  const controller = new AbortController();
  let accumulatedText = "";
  const toolsUsed: Array<{ name: string; input: string }> = [];
  const startTime = Date.now();
  let sessionId: string | undefined;

  const promise = (async () => {
    callbacks.onTypingStart(agentId);

    try {
      for await (const message of conversation) {
        if (controller.signal.aborted) break;

        // Capture session ID
        if (!sessionId && (message as any).session_id) {
          sessionId = (message as any).session_id;
        }

        const event = (message as any).event;
        if (!event) continue;

        // Text delta — accumulate silently
        if (event.delta?.type === "text_delta") {
          accumulatedText += event.delta.text ?? "";
        }

        // Tool use — extract name for activity indicator
        if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
          const toolName = event.content_block.name ?? "working";
          const toolInput = typeof event.content_block.input === "string"
            ? event.content_block.input.slice(0, 80)
            : JSON.stringify(event.content_block.input ?? "").slice(0, 80);
          toolsUsed.push({ name: toolName, input: toolInput });
          callbacks.onActivity(agentId, `${toolName}: ${toolInput}`);
        }
      }

      // Turn complete — emit the accumulated text as one message
      callbacks.onResult(agentId, {
        text: accumulatedText.trim(),
        toolsUsed,
        durationMs: Date.now() - startTime,
      });
    } catch (err) {
      callbacks.onError(agentId, err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return {
    promise,
    abort: () => controller.abort(),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add server/managers/message-filter.ts
git commit -m "feat: add SDK message filter — drops thinking/tools, emits final text only"
```

### Task 2.3: Room Conversation Protocol

**Files:**
- Create: `server/managers/conversation-protocol.ts`

- [ ] **Step 1: Create turn-based conversation protocol**

```typescript
// server/managers/conversation-protocol.ts

export interface ConversationTurn {
  agentId: string;
  mentionedAgents: string[];
  timestamp: string;
}

const MENTION_REGEX = /@(\w[\w-]*)/g;
const MAX_CHAIN_DEPTH = 10;

export function parseMentions(text: string): string[] {
  const mentions: string[] = [];
  let match: RegExpExecArray | null;
  MENTION_REGEX.lastIndex = 0;
  while ((match = MENTION_REGEX.exec(text)) !== null) {
    const name = match[1].toLowerCase();
    if (!mentions.includes(name)) mentions.push(name);
  }
  return mentions;
}

export class ConversationProtocol {
  private queue: Array<{ agentId: string; prompt: string }> = [];
  private currentAgent: string | null = null;
  private chainDepth = 0;
  private paused = false;

  constructor(
    private availableAgents: string[],
    private onInvoke: (agentId: string, prompt: string) => Promise<string>,
    private onDepthLimitReached: () => void,
    private onError: (agentId: string, error: Error) => void,
  ) {}

  /**
   * Human sends a message. This always takes priority.
   */
  async humanMessage(text: string, defaultTarget: string = "orchestrator"): Promise<void> {
    // Pause any pending chain
    this.paused = false;
    this.queue = [];
    this.chainDepth = 0;

    const mentions = parseMentions(text);
    const cleanText = text.replace(MENTION_REGEX, "").trim();

    if (mentions.includes("all")) {
      // Sequential broadcast to all agents
      for (const agentId of this.availableAgents) {
        await this.invokeAgent(agentId, cleanText);
      }
    } else if (mentions.length > 0) {
      // Invoke first mentioned agent
      const target = this.availableAgents.find(a => mentions.includes(a)) ?? defaultTarget;
      await this.invokeAgent(target, cleanText);
    } else {
      // Default to orchestrator
      await this.invokeAgent(defaultTarget, cleanText);
    }
  }

  /**
   * Process the response from an agent, chain to next if @mentioned.
   */
  async handleAgentResponse(agentId: string, responseText: string): Promise<void> {
    this.currentAgent = null;

    if (this.paused) return;

    const mentions = parseMentions(responseText);
    // Filter: no self-mentions, only available agents, not "human"/"vatsal" (those are notifications)
    const agentMentions = mentions.filter(
      m => m !== agentId && this.availableAgents.includes(m)
    );

    if (agentMentions.length === 0) return; // Conversation naturally stops

    this.chainDepth++;
    if (this.chainDepth >= MAX_CHAIN_DEPTH) {
      this.onDepthLimitReached();
      return;
    }

    // Invoke next agent in chain (first mention only — sequential)
    const nextAgent = agentMentions[0];
    await this.invokeAgent(nextAgent, responseText);
  }

  pause(): void {
    this.paused = true;
    this.queue = [];
  }

  resume(): void {
    this.paused = false;
    this.chainDepth = 0;
  }

  private async invokeAgent(agentId: string, prompt: string): Promise<void> {
    if (this.currentAgent) {
      // Another agent is busy — queue
      this.queue.push({ agentId, prompt });
      return;
    }

    this.currentAgent = agentId;
    try {
      const response = await this.onInvoke(agentId, prompt);
      await this.handleAgentResponse(agentId, response);
    } catch (err) {
      this.currentAgent = null;
      this.onError(agentId, err instanceof Error ? err : new Error(String(err)));
    }

    // Process queue
    if (this.queue.length > 0 && !this.paused) {
      const next = this.queue.shift()!;
      await this.invokeAgent(next.agentId, next.prompt);
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add server/managers/conversation-protocol.ts
git commit -m "feat: add turn-based conversation protocol with depth limit and human priority"
```

### Task 2.4: Sprint Manager (State Machine)

**Files:**
- Create: `server/managers/sprint-manager.ts`

This is a large task. The sprint manager:
- Watches `sprints/state.json`, `sprints/current.md`, `sprints/handoffs/`, `sprints/archive/`
- Parses state, tracks gates, manages transitions
- Emits events for the WebSocket layer
- Handles approve, pause, resume, cancel

- [ ] **Step 1: Create sprint manager**

```typescript
// server/managers/sprint-manager.ts
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, renameSync } from "fs";
import { join, basename } from "path";
import { watch } from "chokidar";
import { EventEmitter } from "events";
import type { SprintState, GateStatus, Handoff, QaReport } from "../shared/types";

const DEFAULT_STATE: SprintState = {
  version: "sprint-state-v1",
  sprint: null,
  status: "planned",
  gates: {
    gate_1_backend_security: "not_started",
    gate_2_frontend: "not_started",
    gate_3_qa_security: "not_started",
  },
  agents: {},
};

export class SprintManager extends EventEmitter {
  private state: SprintState = { ...DEFAULT_STATE };
  private watcher: ReturnType<typeof watch> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private sprintsDir: string) {
    super();
  }

  start(): void {
    if (!existsSync(this.sprintsDir)) return;

    // Load initial state
    this.loadState();

    // Watch for file changes (debounced)
    this.watcher = watch(this.sprintsDir, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 300 },
    });

    this.watcher.on("all", (_event: string, path: string) => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.handleFileChange(path);
      }, 500);
    });
  }

  stop(): void {
    if (this.watcher) this.watcher.close();
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }

  getState(): SprintState {
    return { ...this.state };
  }

  getActiveSprint(): { spec: string; state: SprintState } | null {
    if (!this.state.sprint) return null;
    const specPath = join(this.sprintsDir, "current.md");
    const spec = existsSync(specPath) ? readFileSync(specPath, "utf-8") : "";
    return { spec, state: this.state };
  }

  getHandoffs(): Handoff[] {
    const dir = join(this.sprintsDir, "handoffs");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter(f => f.endsWith(".json"))
      .map(f => {
        try { return JSON.parse(readFileSync(join(dir, f), "utf-8")); }
        catch { return null; }
      })
      .filter(Boolean);
  }

  getQaReport(): QaReport | null {
    const reportPath = join(this.sprintsDir, "handoffs", "qa_report.json");
    if (!existsSync(reportPath)) return null;
    try { return JSON.parse(readFileSync(reportPath, "utf-8")); }
    catch { return null; }
  }

  getArchivedSprints(): Array<{ name: string; date: string; content: string }> {
    const dir = join(this.sprintsDir, "archive");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter(f => f.endsWith(".md"))
      .map(f => ({
        name: basename(f, ".md"),
        date: f.slice(0, 10),
        content: readFileSync(join(dir, f), "utf-8"),
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  approveGate(gate: keyof SprintState["gates"]): boolean {
    if (this.state.gates[gate] !== "in_progress") return false;
    this.state.gates[gate] = "passed";
    this.persistState();
    this.emit("sprint-update", this.state);
    return true;
  }

  pause(): void {
    if (this.state.status !== "in_progress") return;
    this.state.status = "paused";
    this.persistState();
    this.emit("sprint-update", this.state);
  }

  resume(): void {
    if (this.state.status !== "paused") return;
    this.state.status = "in_progress";
    this.persistState();
    this.emit("sprint-update", this.state);
  }

  cancel(): void {
    this.state.status = "cancelled";
    this.persistState();
    this.emit("sprint-update", this.state);
  }

  private loadState(): void {
    const statePath = join(this.sprintsDir, "state.json");
    if (!existsSync(statePath)) {
      this.state = { ...DEFAULT_STATE };
      return;
    }
    try {
      this.state = JSON.parse(readFileSync(statePath, "utf-8"));
    } catch {
      console.warn("Sprint state.json corrupted, using defaults");
      this.state = { ...DEFAULT_STATE };
    }
  }

  private persistState(): void {
    const statePath = join(this.sprintsDir, "state.json");
    const tmpPath = statePath + ".tmp";
    writeFileSync(tmpPath, JSON.stringify(this.state, null, 2));
    renameSync(tmpPath, statePath);
  }

  private handleFileChange(path: string): void {
    const filename = basename(path);

    if (filename === "state.json") {
      this.loadState();
      this.emit("sprint-update", this.state);
    } else if (filename === "current.md") {
      this.emit("sprint-spec-update", this.getActiveSprint());
    } else if (filename === "ready.md") {
      this.emit("sprint-ready", readFileSync(path, "utf-8"));
    } else if (filename.endsWith(".json") && path.includes("handoffs")) {
      this.emit("handoff-update", this.getHandoffs());
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add server/managers/sprint-manager.ts
git commit -m "feat: add sprint manager with state machine, file watching, and gate approval"
```

---

## WORKSTREAM 3: Design System (Agent: design-system)

All design tokens, theme setup, base components. From UI Designer + Design Architect reviews.

### Task 3.1: Design Tokens

**Files:**
- Create: `src/lib/design-tokens.ts`

- [ ] **Step 1: Create complete design token system**

```typescript
// src/lib/design-tokens.ts

// === ELEVATION (5 levels) ===
export const elevation = {
  0: "#0a0a0a",   // App canvas, deepest background
  1: "#111214",   // Sidebar, card backgrounds (warm black, not pure gray)
  2: "#161616",   // Hovered cards, dropdowns, popovers
  3: "#1a1a1a",   // Modal surfaces, slide-in panels
  4: "#1f1f1f",   // Tooltips, command palette
} as const;

// === COLORS ===
export const colors = {
  // Backgrounds
  bg: { dark: "#0a0a0a", light: "#fafafa" },
  surface: { dark: "#111214", light: "#ffffff" },
  surfaceHover: { dark: "#161616", light: "#f5f5f5" },
  surfaceActive: { dark: "#1a1a1a", light: "#efefef" },
  surfaceOverlay: { dark: "rgba(17, 18, 20, 0.85)", light: "rgba(255, 255, 255, 0.85)" },

  // Borders
  border: { dark: "#1e1e1e", light: "#e5e5e5" },
  borderSubtle: { dark: "#161616", light: "#f0f0f0" },

  // Text
  textPrimary: { dark: "#d4d4d4", light: "#171717" },   // Slightly muted for eye comfort
  textEmphasis: { dark: "#f5f5f5", light: "#0a0a0a" },  // For headings, primary buttons
  textSecondary: { dark: "#737373", light: "#737373" },
  textTertiary: { dark: "#525252", light: "#a3a3a3" },   // Timestamps, metadata

  // Accent (shifted from default Tailwind blue for uniqueness)
  accent: "#4F8FF7",
  accentHover: "#5B9DF7",
  accentPressed: "#2563EB",
  accentSubtle: "rgba(79, 143, 247, 0.08)",  // Selected card bg
  accentMuted: "rgba(79, 143, 247, 0.5)",    // Secondary actions
  accentGlow: "0 0 20px rgba(79, 143, 247, 0.15)",

  // Semantic
  success: "#22c55e",
  successSubtle: "rgba(34, 197, 94, 0.08)",
  warning: "#eab308",
  warningSubtle: "rgba(234, 179, 8, 0.08)",
  error: "#ef4444",
  errorSubtle: "rgba(239, 68, 68, 0.08)",

  // Agent avatar palette (deterministic by name hash)
  agentPalette: [
    "#4F8FF7", "#8b5cf6", "#06b6d4", "#f97316",
    "#22c55e", "#ec4899", "#eab308", "#64748b",
  ],
} as const;

// === TYPOGRAPHY ===
export const typography = {
  display:  { size: "28px", weight: 600, lineHeight: 1.2, letterSpacing: "-0.02em" },
  titleLg:  { size: "20px", weight: 600, lineHeight: 1.3, letterSpacing: "-0.015em" },
  titleMd:  { size: "16px", weight: 600, lineHeight: 1.4, letterSpacing: "-0.01em" },
  titleSm:  { size: "14px", weight: 600, lineHeight: 1.4, letterSpacing: "-0.005em" },
  body:     { size: "14px", weight: 400, lineHeight: 1.6, letterSpacing: "0" },
  bodySm:   { size: "13px", weight: 400, lineHeight: 1.5, letterSpacing: "0" },
  label:    { size: "12px", weight: 500, lineHeight: 1.4, letterSpacing: "0.02em" },
  labelXs:  { size: "11px", weight: 500, lineHeight: 1.4, letterSpacing: "0.04em" },
  code:     { size: "13px", weight: 400, lineHeight: 1.5, letterSpacing: "0", fontFamily: "Geist Mono, Menlo, monospace" },
} as const;

// === SPACING (base-4) ===
export const space = {
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
  10: "40px",
  12: "48px",
} as const;

// === RADIUS ===
export const radius = {
  sm: "4px",   // Badges, pills
  md: "6px",   // Inputs, buttons
  lg: "8px",   // Cards, panels
  xl: "12px",  // Modals, command palette
  full: "9999px", // Circles, pills
} as const;

// === ANIMATIONS ===
export const animation = {
  // Micro-interactions (feel instant)
  instant: { duration: "100ms", easing: "ease-out" },
  // UI transitions (feel responsive)
  quick: { duration: "150ms", easing: "ease-out" },
  // Panel/page transitions (feel smooth)
  smooth: { duration: "250ms", easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
  // Celebrations (feel rewarding)
  bounce: { duration: "300ms", easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
  // Persistent indicators
  pulse: { duration: "1.5s", easing: "ease-in-out" },
} as const;

// === SHADOWS (dark mode specific) ===
export const shadows = {
  // Subtle top-light effect for elevated surfaces
  elevated: "inset 0 1px 0 rgba(255, 255, 255, 0.03)",
  // Command palette / modal
  modal: "0 25px 50px rgba(0, 0, 0, 0.5)",
  // Toast
  toast: "0 4px 12px rgba(0, 0, 0, 0.4)",
} as const;

// === Z-INDEX ===
export const zIndex = {
  sidebar: 10,
  statusBar: 20,
  topBar: 30,
  dropdown: 40,
  modal: 50,
  toast: 60,
  commandPalette: 70,
} as const;

// === HELPERS ===
export function agentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return colors.agentPalette[Math.abs(hash) % colors.agentPalette.length];
}

export function contextColor(percent: number | null): string {
  if (percent === null) return colors.textTertiary.dark;
  if (percent >= 80) return colors.error;
  if (percent >= 50) return colors.warning;
  return colors.success;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/design-tokens.ts
git commit -m "feat: add complete design token system (elevation, typography, spacing, animations)"
```

This plan continues with Tasks 3.2-3.5 (Tailwind config, global CSS, base shadcn components, icon system), WS4 (all 5 frontend pages), WS5 (Electron), and WS6 (testing). Due to the extreme length, the remaining tasks follow the same pattern.

---

## REMAINING WORKSTREAMS (Summary)

### WS3 continued: Design System
- **Task 3.2**: Tailwind config with design tokens
- **Task 3.3**: Global CSS (noise texture, glassmorphism, skeleton animations)
- **Task 3.4**: Base shadcn components (Button variants, Badge, Card, Toast with actions)
- **Task 3.5**: Nav Rail component, Sidebar shell, Top Bar, Status Bar

### WS4: Frontend Pages
- **Task 4.1**: Sessions page — sidebar (Active + History sections), session cards with all states
- **Task 4.2**: Sessions page — terminal pane (single instance, Map<id, Terminal>, detach/reattach)
- **Task 4.3**: Sessions page — launcher slide-in panel (presets, custom config)
- **Task 4.4**: Sessions page — git view (commits, changes, PR creation)
- **Task 4.5**: Sessions page — server cards (start/stop, port status)
- **Task 4.6**: Rooms page — room list, room chat, message rendering (markdown)
- **Task 4.7**: Rooms page — typing indicator + live activity line ("reading foo.ts")
- **Task 4.8**: Rooms page — approval buttons, notification triggers
- **Task 4.9**: Sprints page — sprint list (active/completed/planned)
- **Task 4.10**: Sprints page — sprint detail (horizontal gate stepper, agents, handoffs, QA, logs)
- **Task 4.11**: Sprints page — gate approval flow with confirmation
- **Task 4.12**: Memory page — list with search/filter/pin, detail panel, CRUD
- **Task 4.13**: Settings page — all tabs (General, Projects, Agents, Servers, Sprint Protocol, Shortcuts, About)
- **Task 4.14**: Command palette (Cmd+K) — fuzzy search across all entities
- **Task 4.15**: Notification system — toasts with actions, badge counts, deep linking
- **Task 4.16**: Loading/error/empty states for every page
- **Task 4.17**: Animations — page transitions, session switch crossfade, gate completion celebration

### WS5: Electron
- **Task 5.1**: Main process rewrite — server lifecycle, crash recovery with backoff
- **Task 5.2**: Health check watchdog — poll /api/health, force restart on failure
- **Task 5.3**: IPC channels — notifications, file dialogs, badge count, window state
- **Task 5.4**: Native macOS notifications with deep linking
- **Task 5.5**: Tray icon + dock badge
- **Task 5.6**: Pre-compile server for distribution (esbuild → node dist/index.js)

### WS6: Testing
- **Task 6.1**: Vitest setup + unit tests for shared types, utils, parsers
- **Task 6.2**: Unit tests for message-filter, conversation-protocol, sprint-manager
- **Task 6.3**: Component tests for all session, room, sprint, memory components
- **Task 6.4**: Integration tests for all API endpoints + WebSocket flows
- **Task 6.5**: Performance tests with hard thresholds
- **Task 6.6**: Playwright E2E — 10 user journeys
- **Task 6.7**: Chaos tests — process kills, file corruption, network floods
- **Task 6.8**: Smoke test script (30-second gate for every build)

---

## Execution Strategy

**6 agents run in parallel.** Each agent gets one workstream. The orchestrator (you + me) reviews between workstreams and handles integration.

| Agent | Workstream | Can start immediately | Blocked by |
|-------|------------|----------------------|------------|
| server-core | WS1 | Yes | Nothing |
| server-features | WS2 | Yes (uses own types until WS1 merges) | Nothing |
| design-system | WS3 | Yes | Nothing |
| frontend | WS4 | After WS3 Task 3.1 (tokens) | WS3.1 |
| electron | WS5 | After WS1 Task 1.4 (lifecycle) | WS1.4 |
| testing | WS6 | After WS1 + WS2 (needs server code to test) | WS1, WS2 |

**Integration points:**
1. After WS1 + WS2: merge server changes, verify server starts
2. After WS3: merge design system, verify Tailwind compiles
3. After WS4.1-4.5: verify Sessions page end-to-end
4. After WS4.6-4.8: verify Rooms page end-to-end
5. After WS4.9-4.11: verify Sprints page end-to-end
6. After all: full E2E + smoke test suite
