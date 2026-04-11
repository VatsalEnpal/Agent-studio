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

      const session = terminalManager.createSession({
        name: name ?? "Agent",
        command: command ?? "claude",
        args: args ?? ["--dangerously-skip-permissions"],
        cwd,
        cols,
        rows,
        meta,
      });

      // Send Telegram notification if channel is telegram
      if (meta?.channel === "telegram") {
        const model = meta.model ?? "unknown";
        const agent =
          meta.agent && meta.agent !== "none" ? meta.agent : "no agent";
        opts.sendTelegramNotify(
          `Session "${session.name}" started (${model}, ${agent})`,
        );
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
      const { readdir, stat: fsStat } = await import("node:fs/promises");
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
        const projectDirs = await readdir(projectsDir);
        for (const projDir of projectDirs) {
          const projPath = join(projectsDir, projDir);
          try {
            const s = await fsStat(projPath);
            if (!s.isDirectory()) continue;
          } catch {
            continue;
          }

          try {
            const files = await readdir(projPath);
            for (const file of files) {
              if (!file.endsWith(".jsonl")) continue;
              const filePath = join(projPath, file);
              try {
                const fileStat = await fsStat(filePath);
                const projectName = projDir
                  .replace(/-/g, "/")
                  .replace(/^\/+/, "");

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

      sessions.sort((a, b) => b.modified - a.modified);
      const { open } = await import("node:fs/promises");
      const result = await Promise.all(
        sessions.slice(0, 20).map(async (s) => {
          let preview = "";
          let agent = "";
          try {
            const fh = await open(s.file, "r");
            const buf = Buffer.alloc(32768);
            const { bytesRead } = await fh.read(buf, 0, 32768, 0);
            await fh.close();
            const chunk = buf.toString("utf8", 0, bytesRead);
            const lines = chunk.split("\n").filter(Boolean);
            for (const line of lines.slice(0, 30)) {
              try {
                const entry = JSON.parse(line);
                if (
                  entry.type === "agent-setting" &&
                  entry.agentSetting &&
                  !agent
                ) {
                  agent = entry.agentSetting;
                }
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
                  if (text && !text.startsWith("<") && text.length > 5) {
                    preview = text.slice(0, 80).replace(/\n/g, " ").trim();
                  }
                }
                if (
                  entry.type === "last-prompt" &&
                  !preview &&
                  entry.lastPrompt
                ) {
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

          const projectShort = s.project.split("/").pop() ?? s.project;

          return {
            id: s.id,
            project: s.project,
            projectShort,
            modified: s.modified,
            date: new Date(s.modified).toISOString(),
            agent,
            preview,
          };
        }),
      );

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
    res.json({ buffer });
  });

  router.get("/:id/usage", async (req, res) => {
    try {
      const sessionId = req.params["id"]!;
      const sessions = terminalManager.listSessions();
      const session = sessions.find((s) => s.id === sessionId);
      if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      let usage = getSessionUsage(session.pid);
      if (!usage) {
        const claudeSessionId = await findSessionIdForPtyPid(session.pid);
        if (claudeSessionId) {
          usage = getUsageBySessionId(claudeSessionId);
        }
      }

      const displayName = await getDisplayNameForPtyPid(session.pid);

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
