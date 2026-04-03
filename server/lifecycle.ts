/**
 * Graceful shutdown lifecycle manager.
 *
 * Handles SIGINT, SIGTERM, and SIGHUP to cleanly tear down the server:
 * 1. Stop accepting new HTTP connections
 * 2. Terminate all WebSocket clients
 * 3. Kill all tracked child processes (PTYs, dev servers, automations)
 * 4. Force-exit after 5 seconds if graceful shutdown stalls
 *
 * @module server/lifecycle
 */

import type { Server } from "node:http";
import type { AppContext } from "./app-context.js";

/** Timeout in ms before forcing process.exit(1). */
const FORCE_EXIT_TIMEOUT_MS = 5000;

/**
 * Register signal handlers for graceful shutdown.
 * Should be called once after the HTTP server is listening.
 *
 * @param ctx - The application context containing all managers
 * @param server - The Node.js HTTP server instance
 */
export function setupGracefulShutdown(ctx: AppContext, server: Server): void {
  let shuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    // eslint-disable-next-line no-console
    console.log(`\n[lifecycle] ${signal} received. Shutting down gracefully...`);

    // 1. Stop accepting new connections
    server.close((err) => {
      if (err) {
        // eslint-disable-next-line no-console
        console.error("[lifecycle] Error closing HTTP server:", err.message);
      }
    });

    // 2. Terminate all WebSocket clients
    for (const client of ctx.wss.clients) {
      try {
        client.terminate();
      } catch {
        // Already closed or in bad state
      }
    }

    // 3. Kill all tracked child processes
    try {
      await ctx.processTracker.killAll();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[lifecycle] Error killing tracked processes:", err);
    }

    // eslint-disable-next-line no-console
    console.log("[lifecycle] Shutdown complete.");
    process.exit(0);
  }

  /**
   * Force-exit failsafe. Called via setTimeout so that if the graceful
   * shutdown hangs (e.g. a process won't die), we still exit.
   */
  function forceExit(): void {
    // eslint-disable-next-line no-console
    console.error("[lifecycle] Graceful shutdown timed out. Forcing exit.");
    process.exit(1);
  }

  function handleSignal(signal: string): void {
    const timer = setTimeout(forceExit, FORCE_EXIT_TIMEOUT_MS);
    // Unref so the timer doesn't keep the event loop alive if shutdown
    // completes before the timeout fires.
    timer.unref();
    void shutdown(signal);
  }

  process.on("SIGINT", () => handleSignal("SIGINT"));
  process.on("SIGTERM", () => handleSignal("SIGTERM"));
  process.on("SIGHUP", () => handleSignal("SIGHUP"));
}
