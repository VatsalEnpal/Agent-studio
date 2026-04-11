import { Router } from "express";
import {
  readCurrentSprint,
  readReadyQueue,
  readScanLog,
  readSprintHistory,
  readHandoffs,
} from "../file-watcher.js";

export function sprintRoutes(): Router {
  const router = Router();

  router.get("/current", async (_req, res) => {
    try {
      const content = await readCurrentSprint();
      res.json({ content });
    } catch {
      res.json({ content: null });
    }
  });

  router.get("/queue", async (_req, res) => {
    try {
      const content = await readReadyQueue();
      res.json({ content });
    } catch {
      res.json({ content: null });
    }
  });

  router.get("/scans", async (_req, res) => {
    try {
      const entries = await readScanLog();
      res.json(entries);
    } catch {
      res.json([]);
    }
  });

  router.get("/history", async (_req, res) => {
    try {
      const entries = await readSprintHistory();
      res.json(entries);
    } catch {
      res.json([]);
    }
  });

  router.get("/handoffs", async (_req, res) => {
    try {
      const handoffs = await readHandoffs();
      res.json(handoffs);
    } catch {
      res.json([]);
    }
  });

  return router;
}
