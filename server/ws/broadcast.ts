/**
 * WebSocket broadcast utilities with error handling and backpressure.
 * @module server/ws/broadcast
 */

import { WebSocketServer, WebSocket } from "ws";

/** Maximum buffered bytes before skipping a client (1 MB). */
const MAX_BUFFERED_AMOUNT = 1024 * 1024;

/**
 * Broadcast a JSON-serializable message to all connected WebSocket clients.
 * Skips clients that are not in OPEN state or have too much buffered data
 * (backpressure protection). Errors on individual clients are caught and
 * silently ignored -- the client will be cleaned up on disconnect.
 *
 * @param wss - The WebSocket server instance
 * @param message - Any JSON-serializable value to broadcast
 */
export function broadcast(wss: WebSocketServer, message: unknown): void {
  const data = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    if (client.bufferedAmount > MAX_BUFFERED_AMOUNT) continue;
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
