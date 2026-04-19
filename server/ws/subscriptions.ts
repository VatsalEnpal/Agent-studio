/**
 * WebSocket topic subscription state and message→topic routing.
 *
 * Topics are kept as a Set on each WebSocket instance (property
 * `__topics`). `"global"` is subscribed by default for every
 * connection so system-wide events (usage-update, git-update, etc.)
 * still reach every client without an explicit opt-in.
 *
 * Topic grammar (allowlist):
 *   - `terminal:<id>`  — terminal I/O for a single PTY session
 *   - `room:<id>`      — room messages / agent-status / typing / approval
 *   - `sprint:<id>`    — sprint/workflow updates and step-progress
 *   - `global`         — system-wide fan-out
 *
 * Unknown topics inferred from a message fall back to `"global"` so no
 * client is silently dropped when a new event type is added.
 *
 * @module server/ws/subscriptions
 */

import type { WebSocket } from "ws";

export const GLOBAL_TOPIC = "global";

/** Matches `terminal:ID`, `room:ID`, `sprint:ID`, or literal `global`. */
const TOPIC_RE = /^(?:(?:terminal|room|sprint):[A-Za-z0-9_-]+|global)$/;

/** Extension of WebSocket that carries a per-connection topic Set. */
interface TopicAwareWs extends WebSocket {
  __topics?: Set<string>;
}

/** Return (and lazily create) the topic Set attached to a socket. */
function topicsOf(ws: WebSocket): Set<string> {
  const w = ws as TopicAwareWs;
  if (!w.__topics) w.__topics = new Set([GLOBAL_TOPIC]);
  return w.__topics;
}

/** Initialize per-ws topic state with default `global` subscription. */
export function initSubscriptions(ws: WebSocket): void {
  topicsOf(ws);
}

/** Validate a topic string against the allowlist. */
export function isValidTopic(topic: unknown): topic is string {
  return typeof topic === "string" && TOPIC_RE.test(topic);
}

/** Subscribe a socket to a topic. Returns true if added, false if invalid. */
export function subscribe(ws: WebSocket, topic: unknown): boolean {
  if (!isValidTopic(topic)) return false;
  topicsOf(ws).add(topic);
  return true;
}

/** Unsubscribe a socket from a topic. Returns true if removed. */
export function unsubscribe(ws: WebSocket, topic: unknown): boolean {
  if (!isValidTopic(topic)) return false;
  return topicsOf(ws).delete(topic);
}

/** Is this socket subscribed to `topic`? */
export function isSubscribed(ws: WebSocket, topic: string): boolean {
  const w = ws as TopicAwareWs;
  const set = w.__topics;
  if (!set) return topic === GLOBAL_TOPIC; // pre-init: global only
  return set.has(topic);
}

/** Subset of WsMessage fields used to derive a topic. */
interface TopicHintMessage {
  type?: string;
  sessionId?: string;
  payload?: unknown;
}

/**
 * Infer the topic for an outgoing broadcast from the message shape.
 *
 * Routing table:
 *   - `terminal-data` / `terminal-input` / `terminal-resize`
 *         → `terminal:<sessionId>`
 *   - `room-*` (room-message, room-agent-*, room-approval, room-needs-user)
 *         → `room:<payload.roomId>`
 *   - `sprint-update` / `workflow-*` (workflow-update, workflow-step-update,
 *     workflow-gate-waiting, workflow-run-complete, workflow-run-failed)
 *         → `sprint:<workflowId>-<runId>` when both are present (this is the
 *           composite id the UI subscribes to — see `flowsToSprints` in
 *           server/routes/sprint.ts which exposes each sprint as
 *           `${flowId}-${runId}`, and src/components/sprints/sprints-view.tsx
 *           which calls `subscribeTopic("sprint:" + selectedSprintId)`).
 *           Falls back to `sprint:<sprintId>` or `sprint:<runId>` when only
 *           one id is available.
 *   - Anything without enough id metadata, or types like `usage-update`,
 *     `git-update`, `sessions-update`, `memory-*`, `notification`,
 *     `file-update`, `server-status` → `global`.
 */
export function inferTopic(message: unknown): string {
  if (!message || typeof message !== "object") return GLOBAL_TOPIC;
  const msg = message as TopicHintMessage;
  const type = msg.type;
  if (!type) return GLOBAL_TOPIC;

  // Terminal I/O: sessionId is a top-level field on WsMessage
  if (type === "terminal-data" || type === "terminal-input" || type === "terminal-resize") {
    return msg.sessionId ? `terminal:${msg.sessionId}` : GLOBAL_TOPIC;
  }

  // Room events — roomId lives on payload (or on the room-message payload itself)
  if (type.startsWith("room-")) {
    const payload = msg.payload as { roomId?: string } | undefined;
    return payload?.roomId ? `room:${payload.roomId}` : GLOBAL_TOPIC;
  }

  // Sprint / workflow events
  if (type === "sprint-update" || type.startsWith("workflow-")) {
    const payload = msg.payload as
      | { runId?: string; sprintId?: string; workflowId?: string }
      | undefined;
    // `workflow-update` carries a Sprint[] payload (no single id) — stays global
    if (type === "workflow-update" && Array.isArray(msg.payload)) {
      return GLOBAL_TOPIC;
    }
    // Prefer the composite `<workflowId>-<runId>` id used by the UI when
    // both are present. The client's selected sprint id is built from
    // exactly these two fields, so the topic must match or the
    // sprint-scoped tab will never receive its scoped frames.
    if (payload?.workflowId && payload?.runId) {
      return `sprint:${payload.workflowId}-${payload.runId}`;
    }
    const id = payload?.sprintId ?? payload?.runId ?? payload?.workflowId;
    if (id) return `sprint:${id}`;
    return GLOBAL_TOPIC;
  }

  // usage-update, git-update, sessions-update, memory-*, notification,
  // file-update, server-status, and anything unknown: system-wide
  return GLOBAL_TOPIC;
}

/**
 * Parse an incoming control frame. Returns the parsed op if valid,
 * otherwise `null`. The WS message protocol itself is unchanged —
 * control frames are additive and piggyback on the same JSON channel.
 */
export interface SubscribeControlFrame {
  op: "subscribe" | "unsubscribe";
  topic: string;
}

export function parseControlFrame(raw: unknown): SubscribeControlFrame | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { op?: unknown; topic?: unknown };
  if ((r.op !== "subscribe" && r.op !== "unsubscribe") || !isValidTopic(r.topic)) {
    return null;
  }
  return { op: r.op, topic: r.topic };
}
