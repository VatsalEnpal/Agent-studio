/**
 * Health check endpoint for monitoring and the Electron watchdog.
 *
 * Returns server status, uptime, active session count,
 * WebSocket client count, and memory usage.
 *
 * @module server/routes/health
 */

import { Router } from "express";
import type { TerminalManager } from "../terminal-manager.js";
import type { WebSocketServer } from "ws";

/**
 * Create the health-check router.
 *
 * @param terminalManager - The terminal session manager
 * @param wss - The WebSocket server instance
 * @returns Express Router mounted at /api/health
 */
export function healthRoutes(terminalManager: TerminalManager, wss: WebSocketServer): Router {
  const router = Router();
  const serverStartTime = Date.now();

  router.get("/", (_req, res) => {
    const sessions = terminalManager.listSessions();
    res.json({
      status: "ok",
      uptime: Math.floor((Date.now() - serverStartTime) / 1000),
      activeSessions: sessions.filter((s: { status: string }) => s.status === "active").length,
      totalSessions: sessions.length,
      wsClients: wss.clients.size,
      memoryUsage: process.memoryUsage().heapUsed,
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
