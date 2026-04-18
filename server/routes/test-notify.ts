/**
 * Dev-only test endpoint for Mac desktop notifications.
 *
 * POST /api/test/notify   body: { title?: string, message?: string }
 *
 * Guarded: only mounted when NODE_ENV !== "production". Useful for verifying
 * node-notifier + macOS TCC notification permission without having to trigger
 * a real workflow gate. See task A6b.
 *
 * @module server/routes/test-notify
 */

import { Router } from "express";
import notifier from "node-notifier";

/** Create the dev-only test-notify router. */
export function testNotifyRoutes(): Router {
  const router = Router();

  router.post("/notify", (req, res) => {
    const body = (req.body ?? {}) as { title?: unknown; message?: unknown };
    const title =
      typeof body.title === "string" && body.title.trim().length > 0
        ? body.title
        : "Agent Studio Test";
    const message =
      typeof body.message === "string" && body.message.trim().length > 0 ? body.message : "Hello";

    try {
      notifier.notify({ title, message, sound: true });
      res.json({ ok: true, title, message });
    } catch (err) {
      // node-notifier can fail silently on some platforms, but if it throws
      // synchronously, surface it so the caller knows.
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return router;
}
