# Room Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make room agents behave like Slack teammates — dormant until mentioned, chain @mentions automatically, orchestrator fallback when nobody is tagged, Mac notification when agents need the user.

**Architecture:** Wire the existing `ConversationProtocol` (server/managers/conversation-protocol.ts) into the room message routing (server/routes/rooms.ts). Change agent lifecycle from "spawn all on room create" to "spawn on first @mention." Add orchestrator fallback when chain has no next agent. Detect `@user` mentions to fire Mac notifications.

**Tech Stack:** Express 5, Claude Agent SDK, WebSocket, Electron IPC, React, react-markdown

---

### Task 1: Wire ConversationProtocol into room message routing

**Files:**
- Modify: `server/routes/rooms.ts:9-60` (imports + callbacks)

- [ ] **Step 1: Import ConversationProtocol and parseMentions**

Add to imports at top of `server/routes/rooms.ts`:

```typescript
import { ConversationProtocol, parseMentions } from "../managers/conversation-protocol.js";
```

- [ ] **Step 2: Create per-room protocol instances**

Add a Map to store protocol instances, after the `broadcast` helper (line 24):

```typescript
const protocols = new Map<string, ConversationProtocol>();

function getOrCreateProtocol(roomId: string): ConversationProtocol {
  const existing = protocols.get(roomId);
  if (existing) return existing;

  const room = roomManager.getRoom(roomId);
  if (!room) throw new Error(`Room ${roomId} not found`);

  const callbacks = makeSdkCallbacks(roomId);

  const protocol = new ConversationProtocol(
    room.agents.map(a => ({ id: a.id, name: a.name })),
    // onInvoke: spawn-on-mention + send message
    (agentId: string, prompt: string) => {
      const mainDir = getMainProjectDir();
      // Lazy spawn: create session if it doesn't exist
      if (!sdkManager.getSession(agentId)) {
        const agent = room.agents.find(a => a.id === agentId);
        if (!agent) return;
        sdkManager.createSession({
          agentId,
          roomId,
          cwd: mainDir,
          model: agent.model,
          agentProfile: agentId !== "none" ? agentId : undefined,
        });
        roomManager.setAgentStatus(roomId, agentId, "idle");
      }
      sdkManager.sendMessage(agentId, prompt, callbacks).catch((err) => {
        roomManager.addMessage(roomId, {
          from: "system",
          text: `Failed to deliver to ${agentId}: ${err instanceof Error ? err.message : String(err)}`,
          type: "system",
        });
      });
    },
    // onDepthLimitReached
    () => {
      roomManager.addMessage(roomId, {
        from: "system",
        text: "Agent chain reached depth limit (10 turns). Waiting for human input.",
        type: "system",
      });
      broadcast("room-needs-user", { roomId, reason: "depth-limit" });
    },
    // onError
    (error: Error) => {
      roomManager.addMessage(roomId, {
        from: "system",
        text: `Protocol error: ${error.message}`,
        type: "system",
      });
    },
  );

  protocols.set(roomId, protocol);
  return protocol;
}
```

- [ ] **Step 3: Wire onResult to chain @mentions**

Replace the `onResult` callback in `makeSdkCallbacks` (lines 36-47) to chain mentions:

```typescript
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

  // Check for @user mention — pause chain and notify
  const mentions = parseMentions(text);
  if (mentions.includes("user") || mentions.includes("vatsal")) {
    broadcast("room-needs-user", { roomId, agentId, reason: "mentioned-user" });
    const protocol = protocols.get(roomId);
    if (protocol) protocol.pause();
    return;
  }

  // Chain @mentions via ConversationProtocol
  const protocol = protocols.get(roomId);
  if (protocol) {
    protocol.handleAgentResponse(agentId, text);

    // Orchestrator fallback: if no agent queued and chain isn't done
    if (protocol.queueLength === 0 && !protocol.activeAgent) {
      const room = roomManager.getRoom(roomId);
      const hasOrchestrator = room?.agents.some(a => a.id === "orchestrator");
      if (hasOrchestrator && agentId !== "orchestrator") {
        const fallbackPrompt = `The last message was from ${agentId}. No agent was @mentioned. Should anyone else respond? Reply with @agentname if yes, or say DONE if the conversation can pause.`;
        const callbacks = makeSdkCallbacks(roomId);
        if (!sdkManager.getSession("orchestrator")) {
          const agent = room!.agents.find(a => a.id === "orchestrator");
          if (agent) {
            sdkManager.createSession({
              agentId: "orchestrator",
              roomId,
              cwd: getMainProjectDir(),
              model: agent.model,
              agentProfile: "orchestrator",
            });
          }
        }
        sdkManager.sendMessage("orchestrator", fallbackPrompt, callbacks).catch(() => {});
      }
    }
  }
},
```

- [ ] **Step 4: Update user message routing to use protocol**

Replace the message routing in `POST /:id/messages` (lines 133-186) with protocol-based routing:

```typescript
if (room && (from === "user" || from === undefined)) {
  const protocol = getOrCreateProtocol(roomId);

  // If protocol was paused (waiting for user), resume it
  if (protocol.isPaused) {
    protocol.resume();
  }

  // Route through protocol — handles @mentions, @all, default to orchestrator
  protocol.humanMessage(text, "orchestrator");
}
```

- [ ] **Step 5: Clean up protocol on room close**

In the `DELETE /:id` handler (line 262), add:

```typescript
protocols.delete(roomId);
```

- [ ] **Step 6: Test manually**

Run: `npm run dev`
1. Create a room with orchestrator + pmo + backend
2. Send "@pmo audit the tickets"
3. Verify: only PMO responds (no intro messages from others)
4. Verify: if PMO's response contains "@backend", backend gets invoked automatically
5. Verify: if no @mention in response, orchestrator gets fallback prompt

- [ ] **Step 7: Commit**

```bash
git add server/routes/rooms.ts
git commit -m "feat: wire ConversationProtocol for @mention chaining in rooms"
```

---

### Task 2: Kill intro messages — spawn on mention only

**Files:**
- Modify: `server/routes/rooms.ts:196-244` (spawn endpoint)

- [ ] **Step 1: Replace spawn endpoint**

Replace the `/spawn` endpoint to only register agents without sending init messages:

```typescript
router.post("/:id/spawn", async (req, res) => {
  try {
    const roomId = req.params["id"]!;
    const room = roomManager.getRoom(roomId);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }

    // Just mark agents as ready — don't create SDK sessions or send init messages.
    // Sessions are created lazily when an agent is first @mentioned (in getOrCreateProtocol).
    for (const agent of room.agents) {
      roomManager.setAgentStatus(roomId, agent.id, "idle");
    }

    // Initialize the protocol for this room
    getOrCreateProtocol(roomId);

    roomManager.addMessage(roomId, {
      from: "system",
      text: `Room ready. ${room.agents.length} agents available: ${room.agents.map(a => a.name).join(", ")}. @mention an agent to start.`,
      type: "system",
    });

    res.json({ spawned: room.agents.map(a => ({ agentId: a.id })) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});
```

- [ ] **Step 2: Update lazy spawn to include room context in first message**

In the `getOrCreateProtocol` `onInvoke` callback, when creating a new session, prepend room context to the first prompt:

```typescript
// In the onInvoke callback, after sdkManager.createSession:
const isFirstMessage = !sdkManager.getSession(agentId);
// ... create session ...

// Build context-enriched prompt for first invocation
let enrichedPrompt = prompt;
if (isFirstMessage) {
  const otherAgents = room.agents.filter(a => a.id !== agentId).map(a => a.name).join(", ");
  const context = [
    `You are agent "${agent!.name}" in team room "#${room.name}".`,
    `Topic: ${room.topic}.`,
    `Team members: ${otherAgents}.`,
    `You can @mention other agents to hand off work.`,
    `If you need a human decision, mention @user.`,
    `Do NOT introduce yourself. Just do the work requested.\n\n`,
  ].join(" ");
  enrichedPrompt = context + prompt;
}
```

- [ ] **Step 3: Test**

1. Create room → verify NO intro messages, just "Room ready. N agents available."
2. Send "@pmo audit tickets" → verify PMO session created on-the-fly, PMO responds
3. Verify backend/frontend stay dormant until tagged

- [ ] **Step 4: Commit**

```bash
git add server/routes/rooms.ts
git commit -m "feat: spawn agents on first mention, kill intro messages"
```

---

### Task 3: User notification via Electron

**Files:**
- Modify: `server/routes/rooms.ts` (already done in Task 1 — broadcasts `room-needs-user`)
- Modify: `electron/main.js` (listen for WebSocket event, fire native notification)
- Modify: `src/components/teams/room-chat.tsx` (highlight messages that tag user)

- [ ] **Step 1: Add WebSocket listener in Electron main process**

In `electron/main.js`, after the server health check succeeds, add a WebSocket client that listens for `room-needs-user`:

```javascript
// After server is healthy, connect WS to listen for agent notifications
const WebSocket = require("ws");
let notifyWs = null;

function connectNotifyWs(port) {
  notifyWs = new WebSocket(`ws://127.0.0.1:${port}`);
  notifyWs.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === "room-needs-user") {
        const { Notification } = require("electron");
        if (Notification.isSupported()) {
          const n = new Notification({
            title: "Agent Studio",
            body: `Agent ${msg.payload.agentId ?? "unknown"} needs your input`,
            silent: false,
          });
          n.on("click", () => { if (mainWindow) mainWindow.focus(); });
          n.show();
        }
      }
    } catch {}
  });
  notifyWs.on("close", () => { setTimeout(() => connectNotifyWs(port), 5000); });
  notifyWs.on("error", () => {});
}
```

Call `connectNotifyWs(port)` after `log("Server is healthy...")`.

- [ ] **Step 2: Highlight user-tagged messages in UI**

In `src/components/teams/chat-message.tsx`, in the agent message section (line 136), add a highlight for messages that mention @user:

```typescript
const mentionsUser = (msg.text ?? "").toLowerCase().includes("@user") || 
                     (msg.text ?? "").toLowerCase().includes("@vatsal");
```

Add to the className of the outer div:
```typescript
mentionsUser && "bg-rooms/[0.06] border-l-2 border-rooms",
```

- [ ] **Step 3: Test**

1. In a room, have an agent respond with "@user please review"
2. Verify Mac notification appears
3. Verify message has visual highlight in the chat

- [ ] **Step 4: Commit**

```bash
git add electron/main.js src/components/teams/chat-message.tsx
git commit -m "feat: Mac notification when agents mention @user"
```

---

### Task 4: Improve message rendering (Slack-style polish)

**Files:**
- Modify: `src/components/teams/chat-message.tsx:74-92` (markdown rendering)

- [ ] **Step 1: Always render markdown**

In `MessageContent` (line 74), remove the `hasMarkdown` shortcut that skips markdown for short messages. Agent responses with tables and structured content need proper rendering even when short:

```typescript
// Remove this block (lines 74-76):
// const hasMarkdown = /[*_`#\[\]|>-]/.test(cleanText) && cleanText.length > 40;
// if (!hasMarkdown) {
//   return <span className="text-xs leading-relaxed">{highlightMentions(cleanText)}</span>;
// }
```

Always render through Markdown component. This ensures tables, bold, headers always render properly.

- [ ] **Step 2: Improve markdown prose styling**

Update the prose classes (line 79-83) for better readability:

```typescript
<div className="text-xs leading-relaxed prose prose-invert prose-sm max-w-none
  prose-p:my-1.5 prose-pre:my-2
  prose-code:text-rooms prose-code:bg-bg-elevated prose-code:px-1 prose-code:py-0.5 prose-code:rounded-sm prose-code:text-xs prose-code:font-mono
  prose-pre:bg-bg-elevated prose-pre:border prose-pre:border-border-subtle prose-pre:rounded-md prose-pre:p-3
  prose-headings:text-text-primary prose-headings:mt-3 prose-headings:mb-1 prose-headings:text-xs prose-headings:font-semibold
  prose-a:text-rooms prose-a:no-underline hover:prose-a:underline
  prose-strong:text-text-primary
  prose-li:my-0.5
  prose-table:text-xs prose-th:text-left prose-th:text-text-secondary prose-th:font-semibold prose-th:pb-1 prose-th:pr-4
  prose-td:py-0.5 prose-td:pr-4 prose-td:text-text-primary
  prose-blockquote:border-rooms/30 prose-blockquote:text-text-secondary
  prose-hr:border-border-subtle prose-hr:my-3">
```

Key additions: `prose-table`, `prose-th`, `prose-td` styles for PMO's ticket tables. `prose-pre:p-3` for code block padding.

- [ ] **Step 3: Test**

1. Open the PMO tickets room
2. Verify tables render with proper columns, not as flat text
3. Verify bold headers like "ALREADY DONE" render correctly
4. Verify emoji (checkmarks) render

- [ ] **Step 4: Commit**

```bash
git add src/components/teams/chat-message.tsx
git commit -m "feat: always render markdown, improve table and prose styling"
```

---

### Task 5: Integration test

- [ ] **Step 1: Full flow test**

Run: `npm run dev`
1. Create room "Test chaining" with orchestrator + pmo + backend
2. Send: "@pmo list the open tickets"
3. Verify: PMO responds (spawned on demand, no intro message)
4. Verify: if PMO tags @backend, backend auto-responds
5. Verify: if nobody is tagged, orchestrator decides who goes next
6. Verify: if agent says @user, notification fires and chain pauses
7. Verify: your message resumes the chain

- [ ] **Step 2: Build Mac app and test**

```bash
npm run build:mac
cp -R "dist/mac-arm64/Agent Studio.app" /Applications/
open "/Applications/Agent Studio.app"
```

Verify same flow works in packaged app.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: room reliability v0.3.0 — mention chaining, spawn on demand, notifications"
```
