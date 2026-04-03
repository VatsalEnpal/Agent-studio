/**
 * Integration test helpers: creates a minimal Express app with mocked
 * managers and mounts the routes under test.
 */

import express from "express";
import { createServer, type Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ---------------------------------------------------------------------------
// Mock managers
// ---------------------------------------------------------------------------

export interface MockSession {
  id: string;
  name: string;
  pid: number;
  command: string;
  args: string[];
  cwd: string;
  status: "active" | "idle" | "exited";
  exitCode?: number;
  createdAt: number;
  meta?: Record<string, unknown>;
}

export function createMockTerminalManager(sessions: MockSession[] = []) {
  const listeners = new Set<(msg: unknown) => void>();
  return {
    sessions,
    listSessions() {
      return this.sessions;
    },
    getSessionBuffer(id: string) {
      const s = this.sessions.find((s) => s.id === id);
      return s ? "mock buffer content" : null;
    },
    createSession(opts: Record<string, unknown>) {
      const session: MockSession = {
        id: `session-${Date.now()}`,
        name: (opts.name as string) ?? "test",
        pid: 99999,
        command: (opts.command as string) ?? "claude",
        args: (opts.args as string[]) ?? [],
        cwd: (opts.cwd as string) ?? "/tmp",
        status: "active",
        createdAt: Date.now(),
        meta: opts.meta as Record<string, unknown>,
      };
      this.sessions.push(session);
      return session;
    },
    killSession(id: string) {
      const idx = this.sessions.findIndex((s) => s.id === id);
      if (idx === -1) throw new Error(`Session ${id} not found`);
      this.sessions.splice(idx, 1);
    },
    writeToSession(_id: string, _data: string) {},
    resizeSession(_id: string, _cols: number, _rows: number) {},
    onEvent(handler: (msg: unknown) => void) {
      listeners.add(handler);
      return () => listeners.delete(handler);
    },
    emit(msg: unknown) {
      for (const l of listeners) l(msg);
    },
  };
}

// ---------------------------------------------------------------------------
// Temp directory with mock fixtures
// ---------------------------------------------------------------------------

export interface TempFixtures {
  dir: string;
  configPath: string;
  agentsDir: string;
  cleanup: () => void;
}

export function createTempFixtures(opts?: {
  config?: Record<string, unknown>;
  agentFiles?: Array<{ name: string; content: string }>;
}): TempFixtures {
  const dir = mkdtempSync(join(tmpdir(), "agent-studio-test-"));
  const configPath = join(dir, ".agent-studio.json");
  const agentsDir = join(dir, ".claude", "agents");

  // Write config file
  const defaultConfig = {
    version: "1.0.0",
    projects: [{ name: "test-project", path: dir, isProd: false }],
    devServers: [],
    defaults: {
      model: "sonnet",
      permissions: "default",
      workingDirectory: dir,
    },
    setupComplete: true,
    agents: [],
    ...(opts?.config ?? {}),
  };
  writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));

  // Write agent .md files
  mkdirSync(agentsDir, { recursive: true });
  if (opts?.agentFiles) {
    for (const f of opts.agentFiles) {
      writeFileSync(join(agentsDir, f.name), f.content);
    }
  }

  return {
    dir,
    configPath,
    agentsDir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

// ---------------------------------------------------------------------------
// Test server with Express + WebSocket
// ---------------------------------------------------------------------------

export interface TestServer {
  app: express.Express;
  server: Server;
  wss: WebSocketServer;
  terminalManager: ReturnType<typeof createMockTerminalManager>;
  url: string;
  wsUrl: string;
  close: () => Promise<void>;
}

export async function createTestServer(
  sessions?: MockSession[],
): Promise<TestServer> {
  const app = express();
  app.use(express.json());

  const server = createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  const terminalManager = createMockTerminalManager(sessions ?? []);

  // WebSocket upgrade handling (mirrors index.ts)
  server.on("upgrade", (req, socket, head) => {
    const { pathname } = new URL(req.url!, `http://${req.headers.host}`);
    if (pathname === "/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  // WebSocket connection handling (mirrors index.ts)
  wss.on("connection", (ws: WebSocket) => {
    const sessionsMsg = {
      type: "sessions-update",
      payload: terminalManager.listSessions(),
    };
    ws.send(JSON.stringify(sessionsMsg));

    const unsubscribe = terminalManager.onEvent((message: unknown) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    });

    ws.on("message", (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf-8"));
        if (msg.type === "terminal-input" && msg.sessionId && msg.data) {
          terminalManager.writeToSession(msg.sessionId, msg.data);
        }
      } catch {
        // Ignore malformed
      }
    });

    ws.on("close", () => unsubscribe());
    ws.on("error", () => unsubscribe());
  });

  // Mount health route
  const startTime = Date.now();
  app.get("/api/health", (_req, res) => {
    const sessions = terminalManager.listSessions();
    const activeSessions = sessions.filter(
      (s) => s.status === "active",
    ).length;
    const mem = process.memoryUsage();
    res.json({
      status: "ok",
      uptime: process.uptime(),
      activeSessions,
      totalSessions: sessions.length,
      wsClients: wss.clients.size,
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

  // Mount sessions routes
  app.get("/api/sessions", (_req, res) => {
    res.json(terminalManager.listSessions());
  });

  app.post("/api/sessions", (req, res) => {
    try {
      const session = terminalManager.createSession(req.body);
      res.status(201).json(session);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.delete("/api/sessions/:id", (req, res) => {
    try {
      terminalManager.killSession(req.params.id!);
      res.status(204).end();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(404).json({ error: message });
    }
  });

  app.get("/api/sessions/:id/buffer", (req, res) => {
    const buffer = terminalManager.getSessionBuffer(req.params.id!);
    if (buffer === null) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json({ buffer });
  });

  // Start listening on a random port
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const addr = server.address() as { port: number };
  const url = `http://127.0.0.1:${addr.port}`;
  const wsUrl = `ws://127.0.0.1:${addr.port}/ws`;

  return {
    app,
    server,
    wss,
    terminalManager,
    url,
    wsUrl,
    close: () =>
      new Promise<void>((resolve) => {
        // Close all WS clients first
        for (const client of wss.clients) {
          client.terminate();
        }
        wss.close(() => {
          server.close(() => resolve());
        });
      }),
  };
}

/**
 * A WebSocket client wrapper that buffers all messages from the moment
 * of connection, so no messages are missed between connect and listen.
 */
export interface BufferedWs {
  ws: WebSocket;
  /** Messages received since connection, in order. */
  buffer: Record<string, unknown>[];
  close: () => void;
  readyState: number;
}

/**
 * Connect a WebSocket client to the test server.
 * Immediately starts buffering parsed messages so none are lost.
 * Resolves once the connection is open.
 */
export function connectWs(url: string): Promise<BufferedWs> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const buffer: Record<string, unknown>[] = [];

    ws.on("message", (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf-8"));
        buffer.push(msg);
      } catch {
        // Skip unparseable
      }
    });

    ws.on("open", () => {
      resolve({
        ws,
        buffer,
        close: () => ws.close(),
        get readyState() {
          return ws.readyState;
        },
      });
    });
    ws.on("error", reject);
  });
}

/**
 * Wait for a WebSocket message matching an optional type filter.
 * First checks the buffer of already-received messages, then listens
 * for new ones. Times out after `ms` milliseconds.
 */
export function waitForMessage(
  bws: BufferedWs,
  opts?: { type?: string; timeoutMs?: number },
): Promise<Record<string, unknown>> {
  const timeout = opts?.timeoutMs ?? 5000;

  // Check buffer first
  const idx = bws.buffer.findIndex(
    (msg) => !opts?.type || msg.type === opts.type,
  );
  if (idx !== -1) {
    const msg = bws.buffer[idx]!;
    bws.buffer.splice(idx, 1);
    return Promise.resolve(msg);
  }

  // Listen for new messages
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => {
        bws.ws.removeListener("message", handler);
        reject(new Error(`Timed out waiting for WS message (${timeout}ms)`));
      },
      timeout,
    );

    const handler = (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf-8"));
        if (!opts?.type || msg.type === opts.type) {
          clearTimeout(timer);
          bws.ws.removeListener("message", handler);
          resolve(msg);
        } else {
          // Buffer non-matching messages for future waitForMessage calls
          bws.buffer.push(msg);
        }
      } catch {
        // Skip unparseable
      }
    };

    bws.ws.on("message", handler);
  });
}
