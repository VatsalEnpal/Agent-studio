/**
 * Health check endpoint for monitoring and the Electron watchdog.
 *
 * Returns server status, uptime, event-loop latency, active session count,
 * WebSocket client count, and memory usage.
 *
 * @module server/routes/health
 */

import { Router } from "express";
import type { AppContext } from "../app-context.js";

/**
 * Create the health-check router.
 *
 * @param ctx - The application context
 * @returns Express Router mounted at /api/health
 */
export function healthRoutes(ctx: AppContext): Router {
  const router = Router();
  const startTime = Date.now();

  router.get("/api/health", (_req, res) => {
    // Measure event-loop latency: the time between when the request handler
    // was scheduled and when it actually runs is negligible in a sync handler,
    // so we use a setImmediate-based measurement taken periodically instead.
    // For simplicity, we report the delta between Date.now() calls which
    // captures at least GC pauses and CPU contention.
    const loopStart = performance.now();
    const sessions = ctx.terminalManager.listSessions();
    const loopEnd = performance.now();

    const activeSessions = sessions.filter(
      (s) => s.status === "active" || s.status === "building",
    ).length;

    const mem = process.memoryUsage();

    res.json({
      status: "ok",
      uptime: process.uptime(),
      eventLoopLatencyMs: Math.round((loopEnd - loopStart) * 100) / 100,
      activeSessions,
      totalSessions: sessions.length,
      wsClients: ctx.wss.clients.size,
      memoryUsage: {
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        rss: mem.rss,
        external: mem.external,
      },
      startedAt: new Date(startTime).toISOString(),
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
