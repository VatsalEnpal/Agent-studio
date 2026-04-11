import express from "express";
import { createServer } from "node:http";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";
import { TerminalManager } from "./terminal-manager.js";
import {
  getAllSessionUsage,
  getSessionUsage,
  findSessionIdForPtyPid,
  getUsageBySessionId,
  formatCost,
  formatTokens,
} from "./session-usage.js";
import { FileWatcher } from "./file-watcher.js";
import { GitWatcher } from "./git-status.js";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { WsMessage } from "./types.js";
import { WorkflowManager } from "./workflows/index.js";
import {
  loadConfig,
  saveConfig,
  generateDefaultConfig,
  getAgentSystemBase,
} from "./config.js";
import { RoomManager } from "./rooms.js";
import type { RoomMessage } from "./rooms.js";

// Route modules
import { sessionsRoutes } from "./routes/sessions.js";
import { roomsRoutes } from "./routes/rooms.js";
import { gitRoutes } from "./routes/git.js";
import { memoryRoutes } from "./routes/memory.js";
import { sprintRoutes } from "./routes/sprint.js";
import { settingsRoutes } from "./routes/settings.js";
import { systemRoutes } from "./routes/system.js";

const port = parseInt(process.env["PORT"] ?? "8080", 10);
const dev = process.env["NODE_ENV"] !== "production";

/**
 * Send a Telegram notification via ai-agents/tools/notify.sh.
 * Fire-and-forget — errors are silently ignored.
 */
function sendTelegramNotify(message: string): void {
  const agentBase = getAgentSystemBase();
  if (!agentBase) return;
  const notifyScript = join(agentBase, "tools", "notify.sh");
  if (!existsSync(notifyScript)) return;
  try {
    const child = spawn("bash", [notifyScript, message], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch {
    // Best effort — don't crash if notify fails
  }
}

const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();

async function main() {
  // Auto-generate config on first run if missing
  const existingConfig = loadConfig();
  if (!existingConfig) {
    const defaultConfig = generateDefaultConfig();
    saveConfig(defaultConfig);
    // eslint-disable-next-line no-console
    console.log("Generated default config at .agent-studio.json");
  }

  await nextApp.prepare();

  const app = express();
  app.use(express.json());

  const server = createServer(app);

  const wss = new WebSocketServer({ noServer: true });
  const terminalManager = new TerminalManager();
  const gitWatcher = new GitWatcher();
  const workflowManager = new WorkflowManager();

  // Track sessions with Telegram channel enabled for exit notifications
  const telegramSessions = new Map<string, string>(); // sessionId -> session name

  // --- Room management ---
  const roomManager = new RoomManager();
  const sessionToRoom = new Map<string, string>(); // sessionId -> roomId
  const sessionToAgent = new Map<string, string>(); // sessionId -> agentId
  const lastBufferPos = new Map<string, number>(); // sessionId -> last read position

  function stripAnsi(str: string): string {
    return str
      .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "")
      .replace(/\x1B\][^\x07]*\x07/g, "");
  }

  // --- Broadcast room events via WebSocket ---
  roomManager.on("message", (msg: RoomMessage) => {
    const wsMsg: WsMessage = { type: "room-message", payload: msg };
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(wsMsg));
      }
    }
  });

  roomManager.on(
    "agent-status",
    (payload: { roomId: string; agentId: string; status: string }) => {
      const wsMsg: WsMessage = { type: "room-agent-status", payload };
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(wsMsg));
        }
      }
    },
  );

  roomManager.on(
    "approval",
    (payload: { roomId: string; messageId: string; approved: boolean }) => {
      const wsMsg: WsMessage = { type: "room-approval", payload };
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(wsMsg));
        }
      }
    },
  );

  // --- Poll terminal output for room-linked sessions every 3 seconds ---
  setInterval(() => {
    for (const [sessionId, roomId] of sessionToRoom) {
      const buffer = terminalManager.getSessionBuffer(sessionId);
      if (!buffer) continue;

      const lastPos = lastBufferPos.get(sessionId) ?? 0;
      if (buffer.length <= lastPos) continue;

      const newOutput = buffer.slice(lastPos);
      lastBufferPos.set(sessionId, buffer.length);

      const agentId = sessionToAgent.get(sessionId);
      if (!agentId) continue;

      const dangerous = roomManager.checkDangerous(newOutput);
      if (dangerous) {
        roomManager.addMessage(roomId, {
          from: agentId,
          text: `Wants to execute: ${dangerous}`,
          type: "approval-request",
          actionCommand: dangerous,
          approvalStatus: "pending",
        });
        sendTelegramNotify(
          `${agentId} wants to: ${dangerous}\nRoom: #${roomId}\nApprove in Agent Studio`,
        );
      }

      const cleaned = stripAnsi(newOutput).trim();
      if (
        cleaned.length > 20 &&
        (newOutput.includes("\n> ") ||
          newOutput.includes("\n❯ ") ||
          newOutput.includes("\n$ "))
      ) {
        const lines = cleaned.split("\n").filter((l) => l.trim().length > 0);
        const meaningful = lines.slice(-20).join("\n").trim();
        if (meaningful.length > 10) {
          roomManager.addMessage(roomId, {
            from: agentId,
            text: meaningful.slice(0, 2000),
            type: "message",
          });
          roomManager.updateContextFile(roomId);
        }
      }
    }
  }, 3000);

  // --- Listen for session exit events ---
  terminalManager.onEvent((message: WsMessage) => {
    if (message.type === "sessions-update") {
      const sessions = message.payload as import("./types.js").Session[];
      for (const session of sessions) {
        if (session.status === "exited") {
          // Clean up room session maps
          if (sessionToRoom.has(session.id)) {
            const roomId = sessionToRoom.get(session.id)!;
            const agentId = sessionToAgent.get(session.id);
            if (agentId) {
              roomManager.setAgentStatus(roomId, agentId, "offline");
            }
            sessionToRoom.delete(session.id);
            sessionToAgent.delete(session.id);
            lastBufferPos.delete(session.id);
          }

          // Telegram notification
          if (telegramSessions.has(session.id)) {
            const name = telegramSessions.get(session.id)!;
            const exitCode = session.exitCode ?? "unknown";
            sendTelegramNotify(
              `Session "${name}" finished (exit code: ${exitCode})`,
            );
            telegramSessions.delete(session.id);
          }
        }
      }
    }
  });

  // --- WebSocket upgrade handling ---
  server.on("upgrade", (request, socket, head) => {
    const { pathname } = new URL(
      request.url!,
      `http://${request.headers.host}`,
    );
    if (pathname === "/ws") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
    // All other upgrade requests fall through to Next.js (Turbopack HMR)
  });

  // --- WebSocket connection handling ---
  wss.on("connection", (ws: WebSocket) => {
    const sessionsMsg: WsMessage = {
      type: "sessions-update",
      payload: terminalManager.listSessions(),
    };
    ws.send(JSON.stringify(sessionsMsg));

    gitWatcher
      .getStatus()
      .then((statuses) => {
        const gitMsg: WsMessage = {
          type: "git-update",
          payload: statuses,
        };
        ws.send(JSON.stringify(gitMsg));
      })
      .catch(() => {
        /* ignore git status errors on connect */
      });

    const unsubscribe = terminalManager.onEvent((message: WsMessage) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    });

    ws.on("message", (raw: Buffer | string) => {
      try {
        const msg: WsMessage = JSON.parse(
          typeof raw === "string" ? raw : raw.toString("utf-8"),
        );

        if (msg.type === "terminal-input" && msg.sessionId && msg.data) {
          terminalManager.writeToSession(msg.sessionId, msg.data);
        } else if (
          msg.type === "terminal-resize" &&
          msg.sessionId &&
          msg.cols &&
          msg.rows
        ) {
          terminalManager.resizeSession(msg.sessionId, msg.cols, msg.rows);
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on("close", () => {
      unsubscribe();
    });

    ws.on("error", () => {
      unsubscribe();
    });
  });

  // --- Usage polling: broadcast usage updates every 30s ---
  setInterval(async () => {
    try {
      const usage = getAllSessionUsage();
      const sessions = terminalManager.listSessions();
      const managedUsage: Record<
        string,
        {
          cost: string;
          tokens: string;
          modelShort: string;
          totalCost: number;
          totalTokens: number;
          contextUsed: number;
          contextTotal: number;
          contextPercent: number;
        }
      > = {};
      for (const session of sessions) {
        let su = getSessionUsage(session.pid);
        if (!su) {
          const claudeSessionId = await findSessionIdForPtyPid(session.pid);
          if (claudeSessionId) {
            su = getUsageBySessionId(claudeSessionId);
          }
        }
        if (su) {
          managedUsage[session.id] = {
            cost: formatCost(su.totalCost),
            tokens: formatTokens(su.totalTokens),
            modelShort: su.modelShort,
            totalCost: su.totalCost,
            totalTokens: su.totalTokens,
            contextUsed: su.contextUsed,
            contextTotal: su.contextTotal,
            contextPercent: su.contextPercent,
          };
        }
      }

      const msg: WsMessage = {
        type: "usage-update",
        payload: { all: usage, managed: managedUsage },
      };
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(msg));
        }
      }
    } catch {
      // Ignore polling errors
    }
  }, 30_000);

  // --- File watcher for sprint/memory files ---
  const fileWatcher = new FileWatcher();
  fileWatcher.onUpdate((update) => {
    const msg: WsMessage = {
      type: "file-update",
      data: JSON.stringify({ file: update.file, content: update.content }),
    };
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(msg));
      }
    }
  });
  fileWatcher.start();

  // --- Git watcher ---
  gitWatcher.onUpdate((repos) => {
    const msg: WsMessage = {
      type: "git-update",
      payload: repos,
    };
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(msg));
      }
    }
  });
  gitWatcher.start(10_000);

  // Broadcast workflow updates on sprint file changes
  fileWatcher.onUpdate(() => {
    void workflowManager.getFlows().then((flows) => {
      const msg: WsMessage = {
        type: "workflow-update",
        payload: flows,
      };
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(msg));
        }
      }
    });
  });

  // --- Mount route modules ---
  app.use(
    "/api/sessions",
    sessionsRoutes(terminalManager, { telegramSessions, sendTelegramNotify }),
  );
  app.use(
    "/api/rooms",
    roomsRoutes(
      roomManager,
      terminalManager,
      sessionToRoom,
      sessionToAgent,
      lastBufferPos,
    ),
  );
  app.use("/api/git", gitRoutes(gitWatcher));
  app.use("/api/memory", memoryRoutes());
  app.use("/api/sprint", sprintRoutes());
  // Settings routes span multiple prefixes (config, setup, scaffold, settings)
  app.use("/api", settingsRoutes(workflowManager));
  // System routes span multiple prefixes (processes, usage, servers, system, pmo, workflows)
  app.use("/api", systemRoutes(terminalManager, workflowManager));

  // --- Next.js catch-all ---
  app.all("/{*path}", (req, res) => {
    return handle(req, res);
  });

  // Listen on :: to accept both IPv4 and IPv6 connections.
  server.listen(port, "::", () => {
    // eslint-disable-next-line no-console
    console.log(`Agent Studio running on http://localhost:${port}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server:", err);
  process.exit(1);
});
