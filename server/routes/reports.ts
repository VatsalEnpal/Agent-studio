import { Router } from "express";
import type { AutomationEngine } from "../automations.js";

export function reportsRoutes(automationEngine: AutomationEngine): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    try {
      const reports = automationEngine.getReports();
      res.json(reports);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  router.get("/:id", (req, res) => {
    try {
      const report = automationEngine.getReport(req.params["id"]);
      if (!report) {
        res.status(404).json({ error: "Report not found" });
        return;
      }
      res.json(report);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  router.post("/:id/approve", (req, res) => {
    try {
      const report = automationEngine.approveReport(req.params["id"]);
      if (!report) {
        res.status(404).json({ error: "Report not found" });
        return;
      }
      res.json(report);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  router.post("/:id/dismiss", (req, res) => {
    try {
      const report = automationEngine.dismissReport(req.params["id"]);
      if (!report) {
        res.status(404).json({ error: "Report not found" });
        return;
      }
      res.json(report);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  router.post("/:id/actions/:actionId/approve", (req, res) => {
    try {
      const report = automationEngine.approveAction(req.params["id"], req.params["actionId"]);
      if (!report) {
        res.status(404).json({ error: "Report or action not found" });
        return;
      }
      res.json(report);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  return router;
}
