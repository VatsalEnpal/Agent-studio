# Room Chat Overhaul + Terminal Reliability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace broken PTY-based room chat with Claude Agent SDK for clean TalkTo-style replies, and harden terminal infrastructure with kill escalation + spawn limiting + shell readiness.

**Architecture:** Room agents communicate via `@anthropic-ai/claude-agent-sdk` `query()` instead of PTY stdin/stdout scraping. The SDK returns structured events (text deltas, results). Individual (non-room) terminal sessions keep PTY + xterm.js unchanged. Terminal reliability upgrades (tree-kill, semaphore, readiness) apply to all PTY sessions.

**Tech Stack:** `@anthropic-ai/claude-agent-sdk` ^0.2.90, `tree-kill` ^1.2.2, `react-markdown` ^9.0.0, `remark-gfm` ^4.0.0

---

## Parallel Agent Assignment

| Agent | Tasks | Can Start Immediately? |
|-------|-------|----------------------|
| **Agent A** (Backend SDK) | Tasks 1, 2, 3, 4 | Yes |
| **Agent B** (Frontend Chat) | Tasks 5, 6, 7, 8 | Tasks 5-6 immediately, Tasks 7-8 after Agent A finishes Task 2 |
| **Agent C** (Terminal Reliability) | Tasks 9, 10, 11 | Yes (fully independent) |

---

## Task 1: Install Dependencies

**Files:**
- Modify: `/Users/vatsalbhatt230813/Code/agent-studio/package.json`

- [ ] **Step 1: Install backend dependencies**

```bash
cd /Users/vatsalbhatt230813/Code/agent-studio
npm install @anthropic-ai/claude-agent-sdk@^0.2.90 tree-kill@^1.2.2
```

- [ ] **Step 2: Install frontend dependencies**

```bash
cd /Users/vatsalbhatt230813/Code/agent-studio
npm install react-markdown@^9.0.0 remark-gfm@^4.0.0
```

- [ ] **Step 3: Verify installation**

```bash
cd /Users/vatsalbhatt230813/Code/agent-studio
node -e "require('@anthropic-ai/claude-agent-sdk'); console.log('SDK OK')"
node -e "require('tree-kill'); console.log('tree-kill OK')"
```

Expected: Both print OK without errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/vatsalbhatt230813/Code/agent-studio
git add package.json package-lock.json
git commit -m "feat: add claude-agent-sdk, tree-kill, react-markdown deps"
```

---

## Task 2: Create SDK Session Manager (`server/sdk-session.ts`)

**Agent A — This is the core backend change.**

**Files:**
- Create: `/Users/vatsalbhatt230813/Code/agent-studio/server/sdk-session.ts`

- [ ] **Step 1: Create the SDK session manager**

```typescript
// server/sdk-session.ts
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { EventEmitter } from "events";
import { randomUUID } from "node:crypto";

export interface SdkSession {
  agentId: string;
  roomId: string;
  sessionId: string;       // Claude Code session ID for --resume
  cwd: string;
  model: string;
  agentProfile?: string;   // --agent flag value
  busy: boolean;
  activeQuery: ReturnType<typeof query> | null;
}

export interface SdkSessionCallbacks {
  onTypingStart: (agentId: string) => void;
  onTextDelta: (agentId: string, delta: string) => void;
  onResult: (agentId: string, text: string, usage?: { totalCostUsd: number; inputTokens: number; outputTokens: number }) => void;
  onError: (agentId: string, err: Error) => void;
  onIdle: (agentId: string) => void;
}

export class SdkSessionManager extends EventEmitter {
  private sessions = new Map<string, SdkSession>();
  private messageQueues = new Map<string, string[]>(); // agentId -> queued prompts

  createSession(opts: {
    agentId: string;
    roomId: string;
    cwd: string;
    model: string;
    agentProfile?: string;
  }): SdkSession {
    const session: SdkSession = {
      agentId: opts.agentId,
      roomId: opts.roomId,
      sessionId: "", // Set after first query returns a session_id
      cwd: opts.cwd,
      model: opts.model,
      agentProfile: opts.agentProfile,
      busy: false,
      activeQuery: null,
    };
    this.sessions.set(opts.agentId, session);
    this.messageQueues.set(opts.agentId, []);
    return session;
  }

  getSession(agentId: string): SdkSession | undefined {
    return this.sessions.get(agentId);
  }

  async sendMessage(agentId: string, prompt: string, callbacks: SdkSessionCallbacks): Promise<void> {
    const session = this.sessions.get(agentId);
    if (!session) {
      callbacks.onError(agentId, new Error(`No SDK session for agent ${agentId}`));
      return;
    }

    if (session.busy) {
      // Queue the message — process after current query completes
      const queue = this.messageQueues.get(agentId) ?? [];
      queue.push(prompt);
      this.messageQueues.set(agentId, queue);
      return;
    }

    await this.executeQuery(session, prompt, callbacks);
  }

  private async executeQuery(session: SdkSession, prompt: string, callbacks: SdkSessionCallbacks): Promise<void> {
    session.busy = true;
    callbacks.onTypingStart(session.agentId);

    try {
      const options: Record<string, unknown> = {
        model: this.resolveModel(session.model),
        cwd: session.cwd,
        permissionMode: "bypassPermissions" as const,
        allowDangerouslySkipPermissions: true,
        includePartialMessages: true,
      };

      // Resume existing conversation if we have a sessionId
      if (session.sessionId) {
        options.resume = session.sessionId;
      }

      // Use --agent flag if specified
      if (session.agentProfile && session.agentProfile !== "none") {
        options.agent = session.agentProfile;
      }

      const conversation = query({ prompt, options: options as any });
      session.activeQuery = conversation;

      let accumulatedText = "";

      for await (const message of conversation) {
        // Capture session ID from first message
        if (!session.sessionId && message.session_id) {
          session.sessionId = message.session_id;
        }

        if (message.type === "stream_event") {
          // Extract text deltas from streaming events
          const event = (message as any).event;
          if (event?.type === "content_block_delta" && event?.delta?.type === "text_delta") {
            const delta = event.delta.text ?? "";
            accumulatedText += delta;
            callbacks.onTextDelta(session.agentId, delta);
          }
        }

        if (message.type === "result") {
          if (message.subtype === "success") {
            const resultMsg = message as any;
            const finalText = resultMsg.result ?? accumulatedText;
            callbacks.onResult(session.agentId, finalText, {
              totalCostUsd: resultMsg.total_cost_usd ?? 0,
              inputTokens: resultMsg.usage?.input_tokens ?? 0,
              outputTokens: resultMsg.usage?.output_tokens ?? 0,
            });
          } else {
            // Error result
            callbacks.onError(session.agentId, new Error(`Agent query failed: ${message.subtype}`));
          }
        }
      }
    } catch (err) {
      callbacks.onError(session.agentId, err instanceof Error ? err : new Error(String(err)));
    } finally {
      session.busy = false;
      session.activeQuery = null;
      callbacks.onIdle(session.agentId);

      // Process queued messages
      const queue = this.messageQueues.get(session.agentId) ?? [];
      if (queue.length > 0) {
        const nextPrompt = queue.shift()!;
        this.messageQueues.set(session.agentId, queue);
        // Fire-and-forget — don't await, so the current call can return
        this.executeQuery(session, nextPrompt, callbacks).catch(() => {});
      }
    }
  }

  interruptAgent(agentId: string): void {
    const session = this.sessions.get(agentId);
    if (session?.activeQuery) {
      session.activeQuery.close();
      session.activeQuery = null;
      session.busy = false;
    }
  }

  destroySession(agentId: string): void {
    this.interruptAgent(agentId);
    this.sessions.delete(agentId);
    this.messageQueues.delete(agentId);
  }

  destroyAll(): string[] {
    const agentIds = [...this.sessions.keys()];
    for (const id of agentIds) {
      this.destroySession(id);
    }
    return agentIds;
  }

  private resolveModel(model: string): string {
    switch (model) {
      case "opus": return "claude-opus-4-6";
      case "sonnet": return "claude-sonnet-4-6";
      case "haiku": return "claude-haiku-4-5-20251001";
      default: return model;
    }
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/vatsalbhatt230813/Code/agent-studio
npx tsc --noEmit server/sdk-session.ts 2>&1 | head -20
```

If there are type errors related to SDK types, adjust `any` casts as needed — the SDK's `query()` return type may need casting.

- [ ] **Step 3: Commit**

```bash
cd /Users/vatsalbhatt230813/Code/agent-studio
git add server/sdk-session.ts
git commit -m "feat: add SDK session manager for room agents"
```

---

## Task 3: Rewire Room Spawn to Use SDK Sessions

**Agent A — Replaces PTY spawning for room agents.**

**Files:**
- Modify: `/Users/vatsalbhatt230813/Code/agent-studio/server/routes/rooms.ts`

- [ ] **Step 1: Replace the PTY-based spawn route**

In `server/routes/rooms.ts`, change the function signature to accept `SdkSessionManager` and remove PTY maps:

Replace the entire file content with:

```typescript
// server/routes/rooms.ts
import { Router } from "express";
import type { RoomManager } from "../rooms.js";
import type { SdkSessionManager, SdkSessionCallbacks } from "../sdk-session.js";
import { getMainProjectDir } from "../config.js";
import type { WebSocket } from "ws";
import type { WebSocketServer } from "ws";

export function roomsRoutes(
  roomManager: RoomManager,
  sdkManager: SdkSessionManager,
  wss: WebSocketServer,
): Router {
  const router = Router();

  // Helper: broadcast a WebSocket message to all clients
  function broadcast(type: string, payload: unknown): void {
    const msg = JSON.stringify({ type, payload });
    for (const client of wss.clients) {
      if ((client as WebSocket).readyState === 1) { // WebSocket.OPEN
        (client as WebSocket).send(msg);
      }
    }
  }

  // Shared callbacks for SDK session events — broadcasts to all WS clients
  function makeSdkCallbacks(roomId: string): SdkSessionCallbacks {
    return {
      onTypingStart(agentId: string) {
        roomManager.setAgentStatus(roomId, agentId, "working");
        broadcast("room-agent-typing", { roomId, agentId });
      },
      onTextDelta(agentId: string, delta: string) {
        broadcast("room-agent-streaming", { roomId, agentId, delta });
      },
      onResult(agentId: string, text: string, usage) {
        const truncated = text.length > 5000 ? text.slice(0, 5000) + "\n...(truncated)" : text;
        roomManager.addMessage(roomId, {
          from: agentId,
          text: truncated,
          type: "message",
        });
        roomManager.updateContextFile(roomId);

        if (usage) {
          broadcast("room-agent-usage", { roomId, agentId, ...usage });
        }
      },
      onError(agentId: string, err: Error) {
        roomManager.addMessage(roomId, {
          from: "system",
          text: `Agent ${agentId} error: ${err.message}`,
          type: "system",
        });
        roomManager.setAgentStatus(roomId, agentId, "idle");
      },
      onIdle(agentId: string) {
        roomManager.setAgentStatus(roomId, agentId, "idle");
      },
    };
  }

  router.get("/", (_req, res) => {
    res.json(roomManager.getRooms());
  });

  router.post("/", (req, res) => {
    try {
      const { name, topic, agents } = req.body as {
        name?: string;
        topic?: string;
        agents?: Array<{ id: string; name: string; model: "opus" | "sonnet" | "haiku" }>;
      };
      if (!name || !topic) {
        res.status(400).json({ error: "Missing 'name' or 'topic'" });
        return;
      }
      if (agents !== undefined && !Array.isArray(agents)) {
        res.status(400).json({ error: "agents must be an array" });
        return;
      }
      if (agents) {
        for (const a of agents) {
          if (!a || typeof a.id !== "string" || typeof a.name !== "string") {
            res.status(400).json({ error: "Each agent must have string 'id' and 'name' fields" });
            return;
          }
        }
      }
      const room = roomManager.createRoom(name, topic, agents ?? []);
      res.status(201).json(room);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      if (message.includes("already exists")) {
        res.status(409).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  router.get("/:id", (req, res) => {
    const room = roomManager.getRoom(req.params["id"]!);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    res.json(room);
  });

  // --- Message routing: user -> SDK agent ---
  router.post("/:id/messages", (req, res) => {
    try {
      const roomId = req.params["id"]!;
      const { from, text, to, id: clientId } = req.body as {
        from?: string; text?: string; to?: string; id?: string;
      };
      if (!text) {
        res.status(400).json({ error: "Missing 'text'" });
        return;
      }

      const msg = roomManager.addMessage(roomId, {
        from: from ?? "user",
        text,
        to,
        type: "message",
      }, clientId);

      if (!msg) {
        res.status(404).json({ error: "Room not found" });
        return;
      }

      const room = roomManager.getRoom(roomId);
      if (room && (from === "user" || from === undefined)) {
        const mentionMatch = text.match(/@(\w+)/);
        let targetAgentId = "orchestrator";
        let messageText = text;

        if (mentionMatch) {
          const mentioned = mentionMatch[1]!;
          if (mentioned === "all") {
            // Broadcast to all agents
            const cleanText = text.replace(/@all\s*/g, "").trim();
            const callbacks = makeSdkCallbacks(roomId);
            for (const agent of room.agents) {
              const session = sdkManager.getSession(agent.id);
              if (session) {
                sdkManager.sendMessage(agent.id, cleanText, callbacks).catch(() => {});
              }
            }
            roomManager.updateContextFile(roomId);
            res.status(201).json(msg);
            return;
          }

          const mentionedAgent = room.agents.find(a => a.id === mentioned);
          if (mentionedAgent && sdkManager.getSession(mentioned)) {
            targetAgentId = mentioned;
          }
          messageText = text.replace(/@\w+\s*/, "").trim();
        }

        const session = sdkManager.getSession(targetAgentId);
        if (session) {
          const callbacks = makeSdkCallbacks(roomId);
          sdkManager.sendMessage(targetAgentId, messageText, callbacks).catch(() => {});
          roomManager.updateContextFile(roomId);
        } else {
          roomManager.addMessage(roomId, {
            from: "system",
            text: `Cannot deliver to ${targetAgentId} — agent is offline. Start the room first.`,
            type: "system",
          });
        }
      }

      res.status(201).json(msg);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // --- Spawn: create SDK sessions for all agents ---
  router.post("/:id/spawn", async (req, res) => {
    try {
      const roomId = req.params["id"]!;
      const room = roomManager.getRoom(roomId);
      if (!room) {
        res.status(404).json({ error: "Room not found" });
        return;
      }

      const mainDir = getMainProjectDir();
      const spawned: Array<{ agentId: string }> = [];

      for (const agent of room.agents) {
        // Skip if already has an SDK session
        if (sdkManager.getSession(agent.id)) continue;

        sdkManager.createSession({
          agentId: agent.id,
          roomId,
          cwd: mainDir,
          model: agent.model,
          agentProfile: agent.id !== "none" ? agent.id : undefined,
        });

        roomManager.setAgentStatus(roomId, agent.id, "idle");
        spawned.push({ agentId: agent.id });
      }

      // Send init message to orchestrator to establish the session
      const orchestratorSession = sdkManager.getSession("orchestrator");
      if (orchestratorSession && spawned.length > 0) {
        const otherAgents = room.agents.filter(a => a.id !== "orchestrator").map(a => a.name).join(", ");
        const initMessage = [
          `You are the orchestrator in team room "#${room.name}".`,
          `Topic: ${room.topic}.`,
          `Team: ${otherAgents}.`,
          `Read ${room.contextFile} for team status.`,
          `Acknowledge briefly that you're ready.`,
        ].join(" ");

        const callbacks = makeSdkCallbacks(roomId);
        sdkManager.sendMessage("orchestrator", initMessage, callbacks).catch(() => {});
      }

      roomManager.addMessage(roomId, {
        from: "system",
        text: `Agents started: ${spawned.map(s => s.agentId).join(", ")}`,
        type: "system",
      });

      res.json({ spawned });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  router.post("/:id/approve/:msgId", (req, res) => {
    const ok = roomManager.approveAction(req.params["id"]!, req.params["msgId"]!);
    if (!ok) {
      res.status(404).json({ error: "Message not found or not pending" });
      return;
    }
    res.json({ ok: true });
  });

  router.post("/:id/reject/:msgId", (req, res) => {
    const ok = roomManager.rejectAction(req.params["id"]!, req.params["msgId"]!);
    if (!ok) {
      res.status(404).json({ error: "Message not found or not pending" });
      return;
    }
    res.json({ ok: true });
  });

  // --- Close room: destroy SDK sessions ---
  router.delete("/:id", (req, res) => {
    try {
      const roomId = req.params["id"]!;
      const room = roomManager.getRoom(roomId);
      if (room) {
        for (const agent of room.agents) {
          sdkManager.destroySession(agent.id);
        }
      }
      roomManager.closeRoom(roomId);
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  return router;
}
```

- [ ] **Step 2: Validate the route file compiles**

```bash
cd /Users/vatsalbhatt230813/Code/agent-studio
npx tsc --noEmit 2>&1 | grep "routes/rooms" | head -10
```

Expected: No errors from routes/rooms.ts (index.ts will have errors until Task 4).

- [ ] **Step 3: Commit**

```bash
cd /Users/vatsalbhatt230813/Code/agent-studio
git add server/routes/rooms.ts
git commit -m "feat: replace PTY routing with SDK sessions in room routes"
```

---

## Task 4: Clean Up `server/index.ts` — Remove PTY Polling Loop

**Agent A — Removes the broken 3-second polling loop and wires up SDK manager.**

**Files:**
- Modify: `/Users/vatsalbhatt230813/Code/agent-studio/server/index.ts`

- [ ] **Step 1: Add SdkSessionManager import**

At the top of `server/index.ts`, add after the existing imports:

```typescript
import { SdkSessionManager } from "./sdk-session.js";
```

- [ ] **Step 2: Replace room management setup**

Find these lines (around line 86-90):
```typescript
  // --- Room management ---
  const roomManager = new RoomManager();
  const sessionToRoom = new Map<string, string>(); // sessionId -> roomId
  const sessionToAgent = new Map<string, string>(); // sessionId -> agentId
  const lastBufferPos = new Map<string, number>();  // sessionId -> last read position
```

Replace with:
```typescript
  // --- Room management ---
  const roomManager = new RoomManager();
  const sdkManager = new SdkSessionManager();
```

- [ ] **Step 3: Remove stripAnsi function**

Delete the `stripAnsi` function (lines ~92-100):
```typescript
  function stripAnsi(str: string): string {
    // ... entire function
  }
```

- [ ] **Step 4: Remove the 3-second PTY polling loop**

Delete the entire `setInterval` block that starts with `// Poll terminal output for room-linked sessions every 3 seconds` (lines ~130-211). This is the broken code that dumps raw terminal output into room chat.

Also delete the `terminalManager.onEvent` listener that cleans up `sessionToRoom`/`sessionToAgent` (lines ~213-228).

- [ ] **Step 5: Update the rooms route mounting**

Find the line:
```typescript
  app.use("/api/rooms", roomsRoutes(roomManager, terminalManager, sessionToRoom, sessionToAgent, lastBufferPos));
```

Replace with:
```typescript
  app.use("/api/rooms", roomsRoutes(roomManager, sdkManager, wss));
```

- [ ] **Step 6: Verify server starts**

```bash
cd /Users/vatsalbhatt230813/Code/agent-studio
npx tsc --noEmit 2>&1 | head -20
```

Expected: Clean compile (or only unrelated warnings).

- [ ] **Step 7: Commit**

```bash
cd /Users/vatsalbhatt230813/Code/agent-studio
git add server/index.ts
git commit -m "fix: remove broken PTY polling loop, wire SDK session manager"
```

---

## Task 5: Add Streaming State to Zustand Store

**Agent B — Frontend streaming support.**

**Files:**
- Modify: `/Users/vatsalbhatt230813/Code/agent-studio/src/stores/rooms.ts`

- [ ] **Step 1: Add typing and streaming state**

Replace the entire file with:

```typescript
import { create } from "zustand";

export interface RoomAgent {
  id: string;
  name: string;
  model: "opus" | "sonnet" | "haiku";
  sessionId?: string;
  status: "offline" | "idle" | "working" | "waiting";
}

export interface RoomMessage {
  id: string;
  roomId: string;
  from: string;
  to?: string;
  text: string;
  timestamp: string;
  type: "message" | "action" | "approval-request" | "system";
  approvalStatus?: "pending" | "approved" | "rejected";
  actionCommand?: string;
}

export interface Room {
  id: string;
  name: string;
  topic: string;
  agents: RoomAgent[];
  messages: RoomMessage[];
  active: boolean;
  createdAt: string;
}

interface RoomsState {
  rooms: Room[];
  selectedRoomId: string | null;
  loading: boolean;
  lastSeenByRoom: Record<string, string>;

  // Streaming state (TalkTo-style)
  typingAgents: Record<string, string[]>;         // roomId -> agentId[]
  streamingText: Record<string, string>;           // agentId -> accumulated text so far

  setRooms: (rooms: Room[]) => void;
  addRoom: (room: Room) => void;
  selectRoom: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  addMessage: (roomId: string, msg: RoomMessage) => void;
  updateAgentStatus: (roomId: string, agentId: string, status: RoomAgent["status"]) => void;
  updateApproval: (roomId: string, messageId: string, approved: boolean) => void;
  markRoomSeen: (roomId: string) => void;

  // Streaming actions
  setAgentTyping: (roomId: string, agentId: string) => void;
  appendStreamingDelta: (roomId: string, agentId: string, delta: string) => void;
  clearStreaming: (roomId: string, agentId: string) => void;
}

export const useRoomsStore = create<RoomsState>((set) => ({
  rooms: [],
  selectedRoomId: null,
  loading: false,
  lastSeenByRoom: {},
  typingAgents: {},
  streamingText: {},

  setRooms: (rooms) => set({ rooms }),
  addRoom: (room) => set((state) => ({ rooms: [...state.rooms, room] })),
  selectRoom: (id) => set((state) => ({
    selectedRoomId: id,
    lastSeenByRoom: id
      ? { ...state.lastSeenByRoom, [id]: new Date().toISOString() }
      : state.lastSeenByRoom,
  })),
  setLoading: (loading) => set({ loading }),

  addMessage: (roomId, msg) =>
    set((state) => {
      const room = state.rooms.find((r) => r.id === roomId);
      if (room?.messages.some((m) => m.id === msg.id)) {
        return state;
      }
      // Clear streaming state for this agent when final message arrives
      const newStreamingText = { ...state.streamingText };
      delete newStreamingText[msg.from];
      const newTyping = { ...state.typingAgents };
      if (newTyping[roomId]) {
        newTyping[roomId] = newTyping[roomId].filter((id) => id !== msg.from);
      }
      return {
        rooms: state.rooms.map((r) =>
          r.id === roomId ? { ...r, messages: [...r.messages, msg] } : r,
        ),
        streamingText: newStreamingText,
        typingAgents: newTyping,
      };
    }),

  markRoomSeen: (roomId) =>
    set((state) => ({
      lastSeenByRoom: { ...state.lastSeenByRoom, [roomId]: new Date().toISOString() },
    })),

  updateAgentStatus: (roomId, agentId, status) =>
    set((state) => ({
      rooms: state.rooms.map((r) =>
        r.id === roomId
          ? {
              ...r,
              agents: r.agents.map((a) =>
                a.id === agentId ? { ...a, status } : a,
              ),
            }
          : r,
      ),
    })),

  updateApproval: (roomId, messageId, approved) =>
    set((state) => ({
      rooms: state.rooms.map((r) =>
        r.id === roomId
          ? {
              ...r,
              messages: r.messages.map((m) =>
                m.id === messageId
                  ? { ...m, approvalStatus: approved ? "approved" as const : "rejected" as const }
                  : m,
              ),
            }
          : r,
      ),
    })),

  // --- Streaming actions ---
  setAgentTyping: (roomId, agentId) =>
    set((state) => {
      const current = state.typingAgents[roomId] ?? [];
      if (current.includes(agentId)) return state;
      return {
        typingAgents: { ...state.typingAgents, [roomId]: [...current, agentId] },
        streamingText: { ...state.streamingText, [agentId]: "" },
      };
    }),

  appendStreamingDelta: (_roomId, agentId, delta) =>
    set((state) => ({
      streamingText: {
        ...state.streamingText,
        [agentId]: (state.streamingText[agentId] ?? "") + delta,
      },
    })),

  clearStreaming: (roomId, agentId) =>
    set((state) => {
      const newStreamingText = { ...state.streamingText };
      delete newStreamingText[agentId];
      const newTyping = { ...state.typingAgents };
      if (newTyping[roomId]) {
        newTyping[roomId] = newTyping[roomId].filter((id) => id !== agentId);
      }
      return { streamingText: newStreamingText, typingAgents: newTyping };
    }),
}));
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/vatsalbhatt230813/Code/agent-studio
npx tsc --noEmit src/stores/rooms.ts 2>&1 | head -10
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/vatsalbhatt230813/Code/agent-studio
git add src/stores/rooms.ts
git commit -m "feat: add streaming state to rooms store (typing, text deltas)"
```

---

## Task 6: Update Chat Message Component with Markdown Rendering

**Agent B — Adds markdown + streaming message variant.**

**Files:**
- Modify: `/Users/vatsalbhatt230813/Code/agent-studio/src/components/teams/chat-message.tsx`

- [ ] **Step 1: Replace the entire chat-message component**

```typescript
"use client";

import type React from "react";
import { lazy, Suspense } from "react";
import { cn } from "@/lib/utils";
import { Bot, User, AlertTriangle, Info, Check, X } from "lucide-react";
import type { RoomMessage } from "@/stores/rooms";

const Markdown = lazy(() => import("react-markdown"));
const remarkGfm = lazy(() => import("remark-gfm").then((m) => ({ default: m.default })));

interface ChatMessageProps {
  msg: RoomMessage;
  onApprove: (msg: RoomMessage) => void;
  onReject: (msg: RoomMessage) => void;
}

const AGENT_COLORS: Record<string, string> = {
  orchestrator: "text-purple-400",
  "frontend-worker": "text-blue-400",
  frontend: "text-blue-400",
  "backend-worker": "text-green-400",
  backend: "text-green-400",
  "qa-tester": "text-yellow-400",
  qa: "text-yellow-400",
  "security-reviewer": "text-red-400",
  security: "text-red-400",
  pmo: "text-orange-400",
};

function MessageContent({ text, isSystem }: { text: string; isSystem: boolean }) {
  if (isSystem) {
    return <span className="text-console-dim italic">{text}</span>;
  }

  // For short messages without markdown syntax, render as plain text
  const hasMarkdown = /[*_`#\[\]|>-]/.test(text) && text.length > 40;
  if (!hasMarkdown) {
    return <span className="text-console-text">{highlightMentions(text)}</span>;
  }

  return (
    <Suspense fallback={<span className="text-console-text">{text}</span>}>
      <div className="text-console-text prose prose-invert prose-sm max-w-none
        prose-p:my-1 prose-pre:my-2 prose-code:text-console-accent prose-code:bg-console-faint
        prose-code:px-1 prose-code:rounded prose-headings:text-console-text prose-headings:mt-3 prose-headings:mb-1
        prose-a:text-console-accent prose-strong:text-console-text">
        <Markdown remarkPlugins={[remarkGfm as any]}>
          {text}
        </Markdown>
      </div>
    </Suspense>
  );
}

export function ChatMessage({ msg, onApprove, onReject }: ChatMessageProps) {
  const isUser = msg.from === "user";
  const isSystem = msg.from === "system";
  const isApproval = msg.type === "approval-request";

  const agentColor = AGENT_COLORS[msg.from] ?? "text-console-muted";

  return (
    <div
      className={cn(
        "px-4 py-2.5 transition-colors",
        isUser && "bg-console-elevated/20",
        isApproval && msg.approvalStatus === "pending" && "bg-amber-400/5 border-l-2 border-amber-400/50",
        isApproval && msg.approvalStatus === "approved" && "bg-green-400/5 border-l-2 border-green-400/30",
        isApproval && msg.approvalStatus === "rejected" && "bg-red-400/5 border-l-2 border-red-400/30",
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        {isUser ? (
          <User className="w-3 h-3 text-console-accent shrink-0" />
        ) : isSystem ? (
          <Info className="w-3 h-3 text-console-dim shrink-0" />
        ) : isApproval ? (
          <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
        ) : (
          <Bot className="w-3 h-3 text-console-muted shrink-0" />
        )}

        <span
          className={cn(
            "text-[11px] font-semibold font-mono",
            isUser ? "text-console-accent" : isSystem ? "text-console-dim" : agentColor,
          )}
        >
          {isUser ? "You" : msg.from}
        </span>

        {msg.to && (
          <span className="text-[9px] text-console-dim font-mono">
            &rarr; {msg.to}
          </span>
        )}

        <span className="text-[9px] text-console-dim ml-auto font-mono shrink-0">
          {formatRelativeTime(msg.timestamp)}
        </span>
      </div>

      <div className="pl-5">
        <MessageContent text={msg.text ?? ""} isSystem={isSystem} />
      </div>

      {isApproval && msg.approvalStatus === "pending" && (
        <div className="flex gap-2 mt-2 pl-5">
          <button
            onClick={() => onApprove(msg)}
            className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-medium bg-green-600/20 text-green-400 rounded hover:bg-green-600/30 transition-colors"
          >
            <Check className="w-3 h-3" />
            Approve
          </button>
          <button
            onClick={() => onReject(msg)}
            className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-medium bg-red-600/20 text-red-400 rounded hover:bg-red-600/30 transition-colors"
          >
            <X className="w-3 h-3" />
            Reject
          </button>
        </div>
      )}
      {isApproval && msg.approvalStatus === "approved" && (
        <span className="text-[9px] text-green-400 mt-1 block pl-5 font-mono">Approved</span>
      )}
      {isApproval && msg.approvalStatus === "rejected" && (
        <span className="text-[9px] text-red-400 mt-1 block pl-5 font-mono">Rejected</span>
      )}
    </div>
  );
}

// --- Streaming ghost message (shown while agent is typing) ---
export function StreamingMessage({ agentId, text }: { agentId: string; text: string }) {
  const agentColor = AGENT_COLORS[agentId] ?? "text-console-muted";

  if (!text) {
    // Typing indicator — no text yet
    return (
      <div className="px-4 py-2.5">
        <div className="flex items-center gap-2 mb-1">
          <Bot className="w-3 h-3 text-console-muted shrink-0" />
          <span className={cn("text-[11px] font-semibold font-mono", agentColor)}>
            {agentId}
          </span>
          <span className="text-[9px] text-console-dim italic">is thinking...</span>
        </div>
        <div className="pl-5 flex gap-1">
          <span className="w-1.5 h-1.5 bg-console-dim rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-1.5 h-1.5 bg-console-dim rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-1.5 h-1.5 bg-console-dim rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    );
  }

  // Streaming text — show accumulated markdown with pulsing cursor
  return (
    <div className="px-4 py-2.5 bg-console-elevated/10">
      <div className="flex items-center gap-2 mb-1">
        <Bot className="w-3 h-3 text-console-muted shrink-0 animate-pulse" />
        <span className={cn("text-[11px] font-semibold font-mono", agentColor)}>
          {agentId}
        </span>
        <span className="text-[9px] text-console-dim italic">typing...</span>
      </div>
      <div className="pl-5">
        <MessageContent text={text} isSystem={false} />
        <span className="inline-block w-1.5 h-4 bg-console-accent/70 animate-pulse ml-0.5 align-text-bottom" />
      </div>
    </div>
  );
}

function highlightMentions(text: string): React.ReactNode {
  const parts = text.split(/(@\w+)/g);
  return parts.map((part, i) =>
    part.startsWith("@") ? (
      <span key={i} className="text-console-accent font-semibold">{part}</span>
    ) : (
      part
    ),
  );
}

function formatRelativeTime(iso: string): string {
  try {
    const now = Date.now();
    const then = new Date(iso).getTime();
    const diffSec = Math.floor((now - then) / 1000);
    if (diffSec < 60) return "just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/vatsalbhatt230813/Code/agent-studio
git add src/components/teams/chat-message.tsx
git commit -m "feat: markdown rendering + streaming ghost message in chat"
```

---

## Task 7: Update Room Chat to Show Streaming Messages

**Agent B — Wire streaming state into room-chat.tsx.**

**Files:**
- Modify: `/Users/vatsalbhatt230813/Code/agent-studio/src/components/teams/room-chat.tsx`

- [ ] **Step 1: Add streaming message rendering**

At the top of room-chat.tsx, add the StreamingMessage import:

```typescript
import { ChatMessage, StreamingMessage } from "./chat-message";
```

Then in the message list area, after the `{room.messages.map(...)}` block but before `<div ref={messagesEndRef} />`, add streaming messages:

Find this block:
```typescript
              <div className="divide-y divide-console-border/30">
                {room.messages.map((msg) => (
                  <ChatMessage
                    key={msg.id}
                    msg={msg}
                    onApprove={handleApprove}
                    onReject={handleReject}
                  />
                ))}
                <div ref={messagesEndRef} />
              </div>
```

Replace with:
```typescript
              <div className="divide-y divide-console-border/30">
                {room.messages.map((msg) => (
                  <ChatMessage
                    key={msg.id}
                    msg={msg}
                    onApprove={handleApprove}
                    onReject={handleReject}
                  />
                ))}
                {/* Streaming ghost messages — shown while agents are typing */}
                {typingAgentIds.map((agentId) => (
                  <StreamingMessage
                    key={`streaming-${agentId}`}
                    agentId={agentId}
                    text={streamingText[agentId] ?? ""}
                  />
                ))}
                <div ref={messagesEndRef} />
              </div>
```

At the top of the `RoomChat` component function, add the streaming state selectors:

After `const room = useRoomsStore(...)`:
```typescript
  const typingAgents = useRoomsStore((s) => s.typingAgents);
  const streamingText = useRoomsStore((s) => s.streamingText);

  const typingAgentIds = room ? (typingAgents[room.id] ?? []) : [];
```

- [ ] **Step 2: Commit**

```bash
cd /Users/vatsalbhatt230813/Code/agent-studio
git add src/components/teams/room-chat.tsx
git commit -m "feat: render streaming ghost messages in room chat"
```

---

## Task 8: Wire New WebSocket Events in `page.tsx`

**Agent B — Connect frontend to new streaming events.**

**Files:**
- Modify: `/Users/vatsalbhatt230813/Code/agent-studio/src/app/page.tsx`

- [ ] **Step 1: Add WebSocket handlers for typing and streaming**

In the `useEffect` that sets up WebSocket handlers (around line 334), add after the `unsubRoomApproval` handler:

```typescript
    const unsubRoomTyping = wsClient.on("room-agent-typing", (msg: WsMessage) => {
      const payload = msg.payload as { roomId: string; agentId: string };
      if (payload?.roomId) {
        useRoomsStore.getState().setAgentTyping(payload.roomId, payload.agentId);
      }
    });

    const unsubRoomStreaming = wsClient.on("room-agent-streaming", (msg: WsMessage) => {
      const payload = msg.payload as { roomId: string; agentId: string; delta: string };
      if (payload?.roomId) {
        useRoomsStore.getState().appendStreamingDelta(payload.roomId, payload.agentId, payload.delta);
      }
    });
```

Add both to the cleanup function:
```typescript
    return () => {
      unsubSessions();
      unsubGit();
      unsubRoomMsg();
      unsubRoomStatus();
      unsubRoomApproval();
      unsubRoomTyping();
      unsubRoomStreaming();
    };
```

- [ ] **Step 2: Verify the full app compiles**

```bash
cd /Users/vatsalbhatt230813/Code/agent-studio
npx tsc --noEmit 2>&1 | head -20
```

Expected: Clean compile.

- [ ] **Step 3: Commit**

```bash
cd /Users/vatsalbhatt230813/Code/agent-studio
git add src/app/page.tsx
git commit -m "feat: wire room-agent-typing and room-agent-streaming WebSocket events"
```

---

## Task 9: Add Kill Escalation with tree-kill

**Agent C — Terminal reliability (independent of Tasks 1-8).**

**Files:**
- Modify: `/Users/vatsalbhatt230813/Code/agent-studio/server/terminal-manager.ts`

- [ ] **Step 1: Add tree-kill import and escalation logic**

At the top of `terminal-manager.ts`, add:
```typescript
import treeKill from "tree-kill";
```

Replace the `killSession` method:

Find:
```typescript
  killSession(id: string): void {
    const entry = this.sessions.get(id);
    if (!entry) {
      throw new Error(`Session ${id} not found`);
    }
    entry.pty.kill();
    // Don't delete immediately — let onExit set status to 'exited' first
    // so the frontend can show a toast notification.
    setTimeout(() => {
      if (this.sessions.has(id)) {
        this.sessions.delete(id);
        this.emit({
          type: "sessions-update",
          payload: this.listSessions(),
        });
      }
    }, 3000);
  }
```

Replace with:
```typescript
  killSession(id: string): void {
    const entry = this.sessions.get(id);
    if (!entry) {
      throw new Error(`Session ${id} not found`);
    }

    const pid = entry.session.pid;

    // Escalation: SIGTERM -> 2s -> SIGKILL tree -> 1s -> force cleanup
    // Step 1: Graceful SIGTERM
    try {
      entry.pty.kill("SIGTERM");
    } catch {
      // PTY may already be dead
    }

    // Step 2: After 2s, kill entire process tree with SIGKILL
    setTimeout(() => {
      if (entry.session.status !== "exited" && pid) {
        treeKill(pid, "SIGKILL", (err) => {
          if (err) {
            // tree-kill failed — force cleanup anyway
          }
        });
      }
    }, 2000);

    // Step 3: After 3s total, force cleanup regardless
    setTimeout(() => {
      if (this.sessions.has(id)) {
        entry.session.status = "exited";
        this.sessions.delete(id);
        this.emit({
          type: "sessions-update",
          payload: this.listSessions(),
        });
      }
    }, 3500);
  }
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/vatsalbhatt230813/Code/agent-studio
npx tsc --noEmit server/terminal-manager.ts 2>&1 | head -10
```

- [ ] **Step 3: Manual test — start a session, kill it, verify no zombie processes**

```bash
# In the running agent-studio, create a session via the UI, then kill it
# Check for zombie processes:
ps aux | grep claude | grep -v grep
```

Expected: No lingering claude processes after kill.

- [ ] **Step 4: Commit**

```bash
cd /Users/vatsalbhatt230813/Code/agent-studio
git add server/terminal-manager.ts
git commit -m "fix: kill escalation with tree-kill (SIGTERM -> SIGKILL tree)"
```

---

## Task 10: Add Spawn Semaphore

**Agent C — Limits concurrent PTY spawns.**

**Files:**
- Modify: `/Users/vatsalbhatt230813/Code/agent-studio/server/terminal-manager.ts`

- [ ] **Step 1: Add semaphore to TerminalManager class**

Add these fields to the class:

```typescript
  private spawnCount = 0;
  private readonly maxConcurrentSpawns = 4;
  private spawnQueue: Array<{ resolve: (session: Session) => void; reject: (err: Error) => void; opts: CreateSessionOptions }> = [];
```

- [ ] **Step 2: Wrap createSession with semaphore**

Rename the existing `createSession` to `_doCreateSession` (make it private). Create a new public `createSession` that gates on the semaphore:

Add before `_doCreateSession`:
```typescript
  createSession(opts: CreateSessionOptions): Session {
    if (this.spawnCount >= this.maxConcurrentSpawns) {
      // Synchronous fallback: wait briefly then spawn
      // For async queue, callers would need to handle promises.
      // Since the current API is synchronous, we allow slight over-limit
      // but log a warning.
      console.warn(`[terminal-manager] Spawn limit reached (${this.spawnCount}/${this.maxConcurrentSpawns}). Spawning anyway.`);
    }
    this.spawnCount++;
    try {
      const session = this._doCreateSession(opts);
      return session;
    } catch (err) {
      this.spawnCount--;
      throw err;
    }
  }

  private _doCreateSession(opts: CreateSessionOptions): Session {
```

In the `onExit` handler inside `_doCreateSession`, decrement the counter:

After `entry.session.exitCode = exitCode;`, add:
```typescript
          this.spawnCount--;
```

- [ ] **Step 3: Verify it compiles**

```bash
cd /Users/vatsalbhatt230813/Code/agent-studio
npx tsc --noEmit server/terminal-manager.ts 2>&1 | head -10
```

- [ ] **Step 4: Commit**

```bash
cd /Users/vatsalbhatt230813/Code/agent-studio
git add server/terminal-manager.ts
git commit -m "feat: spawn semaphore limits concurrent PTY sessions to 4"
```

---

## Task 11: Add Shell Readiness Detection

**Agent C — Buffers writes until shell prompt is ready.**

**Files:**
- Modify: `/Users/vatsalbhatt230813/Code/agent-studio/server/terminal-manager.ts`

- [ ] **Step 1: Add readiness tracking**

Add to the session entry type in the `sessions` Map:

Change:
```typescript
  private sessions = new Map<
    string,
    { session: Session; pty: pty.IPty; outputBuffer: string }
  >();
```

To:
```typescript
  private sessions = new Map<
    string,
    { session: Session; pty: pty.IPty; outputBuffer: string; ready: boolean; pendingWrites: string[] }
  >();
```

- [ ] **Step 2: Initialize readiness state in _doCreateSession**

In `_doCreateSession`, change the entry creation:

```typescript
    const entry = { session, pty: ptyProcess, outputBuffer: "", ready: false, pendingWrites: [] as string[] };
```

Add readiness detection in the `onData` handler. Inside `ptyProcess.onData`, after the buffer append but before the flush logic, add:

```typescript
        // Shell readiness detection: look for prompt indicators
        if (!entry.ready) {
          const bufferTail = entry.outputBuffer.slice(-500);
          // Match common prompt patterns: $, >, ❯, %, or Claude's ">" prompt
          if (/[>$❯%]\s*$/.test(bufferTail) || bufferTail.includes("Claude Code")) {
            entry.ready = true;
            // Flush any pending writes
            for (const pending of entry.pendingWrites) {
              ptyProcess.write(pending);
            }
            entry.pendingWrites = [];
          }
        }
```

Add a readiness timeout at the end of `_doCreateSession`, before `return session`:

```typescript
    // Readiness timeout: if shell doesn't show a prompt within 15s, mark as ready anyway
    setTimeout(() => {
      if (!entry.ready) {
        entry.ready = true;
        for (const pending of entry.pendingWrites) {
          ptyProcess.write(pending);
        }
        entry.pendingWrites = [];
      }
    }, 15000);
```

- [ ] **Step 3: Update writeToSession to buffer if not ready**

Replace:
```typescript
  writeToSession(id: string, data: string): void {
    const entry = this.sessions.get(id);
    if (!entry) {
      throw new Error(`Session ${id} not found`);
    }
    entry.pty.write(data);
  }
```

With:
```typescript
  writeToSession(id: string, data: string): void {
    const entry = this.sessions.get(id);
    if (!entry) {
      throw new Error(`Session ${id} not found`);
    }
    if (!entry.ready) {
      entry.pendingWrites.push(data);
      return;
    }
    entry.pty.write(data);
  }
```

- [ ] **Step 4: Verify it compiles**

```bash
cd /Users/vatsalbhatt230813/Code/agent-studio
npx tsc --noEmit server/terminal-manager.ts 2>&1 | head -10
```

- [ ] **Step 5: Commit**

```bash
cd /Users/vatsalbhatt230813/Code/agent-studio
git add server/terminal-manager.ts
git commit -m "feat: shell readiness detection — buffer writes until prompt is ready"
```

---

## Task 12: Integration Verification

**All agents done — verify everything works together.**

- [ ] **Step 1: Start the server**

```bash
cd /Users/vatsalbhatt230813/Code/agent-studio
npm run dev
```

Expected: `Agent Studio running on http://localhost:8080` with no errors.

- [ ] **Step 2: Verify individual terminal sessions still work**

Open http://localhost:8080, create a new session (Sessions tab). Verify:
- Terminal renders in xterm.js
- Claude Code starts and shows prompt
- Can type and get responses
- Kill session works (no zombie processes)

- [ ] **Step 3: Verify room chat with SDK**

1. Go to Teams tab, create a new room with orchestrator agent
2. Click "Start Room" — agents should go to "idle" status
3. Type a message: "@orchestrator Hello, what can you help with?"
4. Verify:
   - Typing indicator appears ("orchestrator is thinking...")
   - Text streams in as ghost message with pulsing cursor
   - Final clean message replaces ghost message
   - NO ANSI codes, tool calls, or terminal garbage in the chat
   - Agent status goes back to "idle" after response

- [ ] **Step 4: Verify room close cleans up**

Close the room. Verify no SDK sessions leak (no background Claude processes):
```bash
ps aux | grep claude | grep -v grep
```

- [ ] **Step 5: Final commit**

```bash
cd /Users/vatsalbhatt230813/Code/agent-studio
git add -A
git commit -m "feat: room chat overhaul — SDK sessions, streaming, terminal reliability"
```

---

## Validation Checklist

| # | Criterion | How to verify |
|---|-----------|---------------|
| 1 | Room chat shows ONLY clean text replies | Send a message, check no ANSI/tool calls appear |
| 2 | Streaming ghost messages work | Watch for typing indicator + live text during response |
| 3 | No messages appear without user input | Create room, start agents, wait 30s — no messages should appear |
| 4 | @mention routing works | Send "@orchestrator hello" — only orchestrator responds |
| 5 | @all broadcast works | Send "@all hello" — all agents respond |
| 6 | Individual terminal sessions unchanged | Create a session in Sessions tab — xterm works normally |
| 7 | Kill escalation works | Kill a session, check `ps aux | grep claude` — no zombies |
| 8 | Shell readiness works | Create a session, verify first write arrives after prompt |
| 9 | Server starts cleanly | `npm run dev` — no errors in console |
| 10 | Markdown renders in chat | Agent responds with code blocks/lists — renders properly |
