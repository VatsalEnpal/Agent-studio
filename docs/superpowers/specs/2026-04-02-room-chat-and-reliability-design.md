# Room Chat Overhaul + Terminal Reliability Upgrades

**Date**: 2026-04-02
**Status**: Design
**Scope**: agent-studio (~/Code/agent-studio)

---

## Problem Statement

Two problems:

1. **Room chat is broken.** It dumps raw PTY output (ANSI codes, tool calls, thinking, file contents) as chat messages. The 3-second polling loop with regex blocklisting is fundamentally flawed — it's an arms race against Claude Code's ever-changing terminal output format. Messages appear even when no one asked anything (agent initialization noise).

2. **Terminal infrastructure is fragile.** PTY runs in-process (hung PTY blocks the server), no kill escalation (zombie processes), no spawn limiting (fork-bomb risk), no shell readiness detection (writes before prompt is ready).

## Design

### Part 1: Room Chat — Switch from PTY Parsing to Claude Agent SDK

**Inspired by**: TalkTo (hyperslack/talkto) uses `@anthropic-ai/claude-agent-sdk` to communicate with Claude Code programmatically. It never parses PTY output. The SDK returns structured events — text deltas, result, tool use — and TalkTo only shows the text.

**Architecture change**: Room agents stop using persistent interactive PTY sessions. Instead, each room agent gets a **SDK session** that communicates via the Claude Agent SDK's `query()` function.

```
BEFORE (broken):
  User message → write to PTY stdin → Claude TUI renders → 
  poll PTY buffer every 3s → regex strip ANSI → guess what's a reply → 
  post garbage to chat

AFTER (clean):
  User message → SDK query({prompt, sessionId, resume}) →
  stream_event text_delta → live ghost message in chat →
  result.success → final clean message in chat
```

#### 1.1 New file: `server/sdk-session.ts`

Manages Claude Agent SDK sessions for room agents. Wraps `@anthropic-ai/claude-agent-sdk`.

```typescript
interface SdkSession {
  agentId: string;          // "orchestrator", "frontend", etc.
  roomId: string;
  sessionId: string;        // Claude Code session ID for --resume
  cwd: string;              // Working directory
  model: string;            // opus, sonnet, haiku
  busy: boolean;            // Currently processing a query
}

// Core function — sends a message and streams the response
async function queryAgent(session: SdkSession, prompt: string, callbacks: {
  onTypingStart: () => void;
  onTextDelta: (delta: string) => void;
  onResult: (text: string, usage?: TokenUsage) => void;
  onError: (err: Error) => void;
}): Promise<void>
```

Key behaviors:
- Uses `query()` with `resume: sessionId` to maintain conversation history across messages
- Uses `includePartialMessages: true` for streaming text deltas
- Uses `permissionMode: "bypassPermissions"` (same as current `--dangerously-skip-permissions`)
- Passes agent profile via system prompt or `--agent` flag
- Queues messages if agent is busy (one at a time per agent)

#### 1.2 Changes to `server/rooms.ts`

Add SDK session tracking to `RoomAgent`:

```typescript
interface RoomAgent {
  // ... existing fields
  sdkSessionId?: string;    // Claude Code session ID (for resume)
}
```

New method: `RoomManager.routeMessage()` — replaces PTY write routing:
- Extracts @mention target
- Calls `queryAgent()` on the target's SDK session
- Emits `agent-typing`, `agent-streaming`, `room-message` events

#### 1.3 Changes to `server/index.ts`

**Remove**: The entire 3-second polling loop (lines 130-211). This is the broken code.

**Remove**: `sessionToRoom`, `sessionToAgent`, `lastBufferPos` maps. No longer needed.

**Remove**: `stripAnsi()` function. No more ANSI to strip.

**Add**: SDK session lifecycle management:
- On room spawn: create SDK sessions (not PTY sessions) for each agent
- On message: route through `queryAgent()` with streaming callbacks
- On room close: cleanup SDK sessions

**Add**: New WebSocket events:
- `room-agent-typing: { roomId, agentId }` — agent is thinking
- `room-agent-streaming: { roomId, agentId, delta }` — text chunk arrived
- `room-message` (existing) — final clean message

#### 1.4 Frontend changes

**`stores/rooms.ts`** — Add streaming state:
```typescript
interface RoomsState {
  // ... existing
  typingAgents: Map<string, Set<string>>;        // roomId -> Set<agentId>
  streamingMessages: Map<string, string>;         // agentId -> accumulated text
}
```

**`components/teams/room-chat.tsx`** — Add:
- Typing indicator: "orchestrator is thinking..." with bouncing dots (like TalkTo)
- Ghost streaming message: live-updating markdown bubble while agent is responding
- When `room-message` arrives: clear typing + streaming state, show final message

**`components/teams/chat-message.tsx`** — Add:
- Markdown rendering for agent messages (react-markdown + remark-gfm)
- Streaming message variant (pulsing cursor, partial text)

#### 1.5 What this preserves

- **Room concept**: unchanged. Rooms still have agents, messages, context files.
- **@mention routing**: unchanged UX. "@orchestrator fix the bug" still routes to orchestrator.
- **Dangerous command detection**: moves from PTY output scanning to SDK tool-use events. The SDK exposes tool calls — we can intercept dangerous ones.
- **Terminal view**: Individual (non-room) sessions still use PTY + xterm.js. Only room agents switch to SDK.
- **Context file**: still updated on each message.
- **Approval flow**: unchanged UX, but triggered by SDK tool events instead of PTY regex.

#### 1.6 What this changes

| Aspect | Before | After |
|--------|--------|-------|
| Agent communication | PTY stdin write | SDK query() |
| Response extraction | Regex on PTY buffer | Structured SDK events |
| Streaming | No (batch every 3s) | Yes (text_delta events) |
| Tool call visibility | Leaked into chat | Hidden (like TalkTo) |
| Thinking visibility | Leaked into chat | Hidden |
| Terminal view for room agents | Yes (xterm pane) | No (chat only) |
| Message timing | 3s poll delay | Real-time streaming |

### Part 2: Terminal Reliability Upgrades (from Superset patterns)

These apply to the **individual session** terminal (non-room), which still uses PTY.

#### 2.1 Kill escalation with tree-kill

**File**: `server/terminal-manager.ts` → `killSession()`

Replace `entry.pty.kill()` with escalation:

```
SIGTERM → wait 2s → SIGKILL entire process tree → wait 1s → force cleanup
```

New dependency: `tree-kill` (npm package). Kills the shell PID and ALL child processes (Claude Code spawns subprocesses).

Impact on rooms: None. Room agents use SDK, not PTY.

#### 2.2 Spawn semaphore

**File**: `server/terminal-manager.ts` → `createSession()`

Add a semaphore limiting concurrent PTY spawns to 4. Queue excess spawns.

```typescript
private spawnSemaphore = { count: 0, max: 4, queue: [] };
```

Prevents fork-bombing when creating a room with 6+ agents (though room agents now use SDK, this still protects individual session spawns).

#### 2.3 Shell readiness detection

**File**: `server/terminal-manager.ts` → `createSession()`

Before sending any input to a new PTY:
1. Inject a shell readiness marker: `echo "AGENT_STUDIO_READY_${sessionId}"`
2. Buffer all `writeToSession()` calls until the marker appears in output
3. Timeout after 15s (proceed anyway)

Impact on rooms: Not needed — SDK handles its own readiness. This is only for individual PTY sessions.

#### 2.4 Process-isolated PTY (deferred — P2)

Moving node-pty to a child process with binary IPC (like Superset) is a significant refactor. Defer to a later sprint. The SDK migration for rooms removes most PTY usage, reducing the blast radius of in-process PTY hangs.

### Part 3: Dependency Changes

**New dependencies**:
```
@anthropic-ai/claude-agent-sdk  ^0.2.90   # Core — structured Claude communication
tree-kill                        ^1.2.2    # Kill escalation
react-markdown                   ^9.0.0    # Markdown rendering in chat
remark-gfm                       ^4.0.0    # GitHub-flavored markdown tables, etc.
```

**No removals** — node-pty stays for individual terminal sessions.

---

## What We're NOT Doing

- **Not adding MCP server** (like TalkTo does for agent registration). Our agents are room-scoped, not globally registered.
- **Not removing terminal view**. Individual sessions keep full xterm.js. Only room agents switch to SDK.
- **Not adding conversation search, reactions, pins** (TalkTo features). Out of scope.
- **Not doing process-isolated PTY** (Superset P0). Deferred — SDK migration reduces PTY usage enough.
- **Not changing the room data model**. Rooms, agents, messages all stay the same shape.

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Claude Agent SDK doesn't support `--agent` flag | Pass agent profile via system prompt in query() |
| SDK subprocess management conflicts with our server | SDK manages its own subprocess — no PTY conflict |
| Streaming latency | SDK text_delta is near-real-time, faster than 3s polling |
| Session resume breaks across server restarts | Store sessionId in room.json, SDK handles resume |
| tree-kill not available on all platforms | Fallback to pty.kill() if tree-kill fails |

---

## Success Criteria

1. Room chat shows ONLY clean text replies — no ANSI, no tool calls, no thinking
2. Agent responses stream in real-time (ghost message with typing indicator)
3. No messages appear in chat until a user actually asks something
4. Kill session reliably cleans up all child processes
5. Spawning 6+ sessions doesn't crash the server
6. Individual terminal sessions (non-room) work exactly as before
