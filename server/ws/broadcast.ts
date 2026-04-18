/**
 * WebSocket broadcast utilities with topic routing, error handling and
 * backpressure.
 *
 * As of v0.6 broadcast is topic-filtered: each WebSocket carries a Set
 * of subscribed topics (see `./subscriptions`). A message is only
 * delivered to a client whose Set contains the message's routed topic.
 * The WS message protocol itself is unchanged — callers emit the same
 * `WsMessage` shapes as before; routing is derived from `message.type`
 * plus id fields, or supplied explicitly via the optional `topic` arg.
 *
 * @module server/ws/broadcast
 */

import { WebSocketServer, WebSocket } from "ws";
import { inferTopic, isSubscribed, GLOBAL_TOPIC } from "./subscriptions.js";

/** Maximum buffered bytes before skipping a client (1 MB). */
const MAX_BUFFERED_AMOUNT = 1024 * 1024;

/**
 * Broadcast a JSON-serializable message to WebSocket clients subscribed
 * to the message's topic. Skips clients that are not in OPEN state or
 * have too much buffered data (backpressure protection). Errors on
 * individual clients are caught and silently ignored -- the client will
 * be cleaned up on disconnect.
 *
 * Topic routing: if `topic` is omitted, the topic is inferred from the
 * message (`type` field + id fields). Unknown / unrouted messages fall
 * back to `GLOBAL_TOPIC`, which every client is subscribed to by default.
 *
 * @param wss - The WebSocket server instance
 * @param message - Any JSON-serializable value to broadcast
 * @param topic - Optional explicit topic override
 */
export function broadcast(wss: WebSocketServer, message: unknown, topic?: string): void {
  const data = JSON.stringify(message);
  const t = topic ?? inferTopic(message);
  for (const client of wss.clients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    if (client.bufferedAmount > MAX_BUFFERED_AMOUNT) continue;
    if (!isSubscribed(client, t)) continue;
    try {
      client.send(data);
    } catch {
      // Client in bad state -- will be cleaned up on close event
    }
  }
}

/**
 * Send a JSON-serializable message to a single WebSocket client.
 * No-ops if the client is not in OPEN state. Errors are caught silently.
 * Bypasses topic filtering — the caller has chosen a specific client.
 *
 * @param client - The target WebSocket client
 * @param message - Any JSON-serializable value to send
 */
export function sendTo(client: WebSocket, message: unknown): void {
  if (client.readyState !== WebSocket.OPEN) return;
  try {
    client.send(JSON.stringify(message));
  } catch {
    // Client in bad state -- will be cleaned up on close event
  }
}

// Re-export for tests that want to assert on the default topic
export { GLOBAL_TOPIC };
