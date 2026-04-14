import { Router } from "express";
import type { TerminalManager } from "../terminal-manager.js";
import type { SessionMeta } from "../types.js";
import {
  getSessionUsage,
  findSessionIdForPtyPid,
  getUsageBySessionId,
  getDisplayNameForPtyPid,
  formatCost,
  formatTokens,
} from "../session-usage.js";
import { sanitize } from "../demo-sanitizer.js";
import os from "node:os";

export function sessionsRoutes(
  terminalManager: TerminalManager,
  opts: {
    telegramSessions: Map<string, string>;
    sendTelegramNotify: (message: string) => void;
  },
): Router {
  const router = Router();

  router.post("/", (req, res) => {
    try {
      const { name, command, args, cwd, cols, rows, meta } = req.body as {
        name?: string;
        command?: string;
        args?: string[];
        cwd?: string;
        cols?: number;
        rows?: number;
        meta?: SessionMeta;
      };

      if (!name || typeof name !== "string") {
        res.status(400).json({ error: "Missing required field: name" });
        return;
      }

      const session = terminalManager.createSession({
        name,
        command: command ?? "claude",
        args: args ?? ["--model", "sonnet"],
        cwd,
        cols,
        rows,
        meta,
      });

      // Send Telegram notification if channel is telegram
      if (meta?.channel === "telegram") {
        const model = meta.model ?? "unknown";
        const agent = meta.agent && meta.agent !== "none" ? meta.agent : "no agent";
        opts.sendTelegramNotify(`Session "${session.name}" started (${model}, ${agent})`);
        opts.telegramSessions.set(session.id, session.name);
      }

      res.status(201).json(session);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // IMPORTANT: /history must come before /:id routes to avoid matching "history" as :id
  router.get("/history", async (_req, res) => {
    try {
      const { readdirSync, statSync } = await import("node:fs");
      const { join } = await import("node:path");
      const home = os.homedir();
      const projectsDir = join(home, ".claude", "projects");

      interface HistorySession {
        id: string;
        project: string;
        projectPath: string;
        modified: number;
        file: string;
      }

      const sessions: HistorySession[] = [];

      try {
        const projectDirs = readdirSync(projectsDir);
        for (const projDir of projectDirs) {
          const projPath = join(projectsDir, projDir);
          try {
            const stat = statSync(projPath);
            if (!stat.isDirectory()) continue;
          } catch {
            continue;
          }

          try {
            const files = readdirSync(projPath);
            for (const file of files) {
              if (!file.endsWith(".jsonl")) continue;
              const filePath = join(projPath, file);
              try {
                const fileStat = statSync(filePath);
                // Decode project name from directory name
                const projectName = projDir.replace(/-/g, "/").replace(/^\/+/, "");

                sessions.push({
                  id: file.replace(".jsonl", ""),
                  project: projectName,
                  projectPath: projPath,
                  modified: fileStat.mtimeMs,
                  file: filePath,
                });
              } catch {
                continue;
              }
            }
          } catch {
            continue;
          }
        }
      } catch {
        // projects dir may not exist
      }

      // Sort by modified time, newest first, limit to 20
      sessions.sort((a, b) => b.modified - a.modified);
      const result = sessions.slice(0, 20).map((s) => {
        // Extract preview and agent from first ~30 lines of JSONL
        let preview = "";
        let agent = "";
        try {
          const fd = require("node:fs").openSync(s.file, "r");
          const buf = Buffer.alloc(32768);
          const bytesRead = require("node:fs").readSync(fd, buf, 0, 32768, 0);
          require("node:fs").closeSync(fd);
          const chunk = buf.toString("utf8", 0, bytesRead);
          const lines = chunk.split("\n").filter(Boolean);
          for (const line of lines.slice(0, 30)) {
            try {
              const entry = JSON.parse(line);
              // Extract agent setting (e.g., "pmo", "frontend-worker")
              if (entry.type === "agent-setting" && entry.agentSetting && !agent) {
                agent = entry.agentSetting;
              }
              // Extract first real user message as preview
              if (entry.type === "user" && !preview) {
                const msg = entry.message;
                let text = "";
                if (typeof msg === "string") {
                  text = msg;
                } else if (msg && typeof msg.content === "string") {
                  text = msg.content;
                } else if (msg && Array.isArray(msg.content)) {
                  text = msg.content
                    .filter((b: { type: string }) => b.type === "text")
                    .map((b: { text: string }) => b.text)
                    .join(" ");
                }
                // Skip system/command messages
                if (text && !text.startsWith("<") && text.length > 5) {
                  preview = text.slice(0, 80).replace(/\n/g, " ").trim();
                }
              }
              // Also check last-prompt as fallback
              if (entry.type === "last-prompt" && !preview && entry.lastPrompt) {
                const lp = entry.lastPrompt as string;
                if (!lp.startsWith("<") && lp.length > 5) {
                  preview = lp.slice(0, 80).replace(/\n/g, " ").trim();
                }
              }
            } catch {
              // Skip unparseable lines
            }
          }
        } catch {
          // Can't read file, leave preview empty
        }

        // Derive short project name from directory path
        const projectShort = s.project.split("/").pop() ?? s.project;

        // Extract cost from JSONL usage data
        let cost: string | null = null;
        try {
          const usage = getUsageBySessionId(s.id);
          if (usage && usage.totalCost > 0) {
            cost = formatCost(usage.totalCost);
          }
        } catch {
          // Best effort -- skip if usage parsing fails
        }

        return {
          id: s.id,
          project: s.project,
          projectShort,
          modified: s.modified,
          date: new Date(s.modified).toISOString(),
          agent,
          preview,
          cost,
        };
      });

      res.json(result);
    } catch {
      res.json([]);
    }
  });

  router.delete("/:id", (req, res) => {
    try {
      terminalManager.killSession(req.params["id"]!);
      res.status(204).end();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(404).json({ error: message });
    }
  });

  router.get("/", (_req, res) => {
    res.json(terminalManager.listSessions());
  });

  router.get("/:id/buffer", (req, res) => {
    const buffer = terminalManager.getSessionBuffer(req.params["id"]!);
    if (buffer === null) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json({ buffer: sanitize(buffer) });
  });

  router.get("/:id/usage", (req, res) => {
    try {
      const sessionId = req.params["id"]!;
      const sessions = terminalManager.listSessions();
      const session = sessions.find((s) => s.id === sessionId);
      if (!session) {
        // Return empty usage instead of 404 -- CLI-discovered sessions
        // won't be in the server's session map but the frontend still
        // asks for their usage.
        res.json({
          cost: null,
          tokens: null,
          model: null,
          modelShort: null,
        });
        return;
      }

      let usage = getSessionUsage(session.pid);
      if (!usage) {
        const claudeSessionId = findSessionIdForPtyPid(session.pid);
        if (claudeSessionId) {
          usage = getUsageBySessionId(claudeSessionId);
        }
      }

      const displayName = getDisplayNameForPtyPid(session.pid);

      if (!usage) {
        res.json({
          cost: null,
          tokens: null,
          model: null,
          modelShort: null,
          displayName,
        });
        return;
      }

      res.json({
        cost: formatCost(usage.totalCost),
        tokens: formatTokens(usage.totalTokens),
        model: usage.model,
        modelShort: usage.modelShort,
        totalCost: usage.totalCost,
        totalTokens: usage.totalTokens,
        totalInputTokens: usage.totalInputTokens,
        totalOutputTokens: usage.totalOutputTokens,
        cacheCreationTokens: usage.cacheCreationTokens,
        cacheReadTokens: usage.cacheReadTokens,
        messageCount: usage.messageCount,
        contextUsed: usage.contextUsed,
        contextTotal: usage.contextTotal,
        contextPercent: usage.contextPercent,
        displayName,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  return router;
}
