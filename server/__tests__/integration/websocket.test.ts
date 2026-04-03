import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { WebSocket } from "ws";
import {
  createTestServer,
  connectWs,
  waitForMessage,
  type TestServer,
  type MockSession,
  type BufferedWs,
} from "./helpers";

// ---------------------------------------------------------------------------
// WebSocket connect + initial data
// ---------------------------------------------------------------------------

describe("WebSocket — connect", () => {
  let ts: TestServer;

  const sessions: MockSession[] = [
    {
      id: "ws-s1",
      name: "WS Agent",
      pid: 5001,
      command: "claude",
      args: [],
      cwd: "/tmp",
      status: "active",
      createdAt: Date.now(),
    },
  ];

  beforeAll(async () => {
    ts = await createTestServer(sessions);
  });

  afterAll(async () => {
    await ts.close();
  });

  it("sends sessions-update on connection", async () => {
    const bws = await connectWs(ts.wsUrl);
    try {
      const msg = await waitForMessage(bws, { type: "sessions-update" });

      expect(msg.type).toBe("sessions-update");
      expect(Array.isArray(msg.payload)).toBe(true);
      const payload = msg.payload as MockSession[];
      expect(payload).toHaveLength(1);
      expect(payload[0].id).toBe("ws-s1");
    } finally {
      bws.close();
    }
  });

  it("connects to /ws path successfully", async () => {
    const bws = await connectWs(ts.wsUrl);
    try {
      expect(bws.readyState).toBe(WebSocket.OPEN);
    } finally {
      bws.close();
    }
  });

  it("rejects connection on non-/ws path", async () => {
    await expect(
      connectWs(ts.wsUrl.replace("/ws", "/not-ws")),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// WebSocket — reconnect
// ---------------------------------------------------------------------------

describe("WebSocket — reconnect", () => {
  let ts: TestServer;

  beforeAll(async () => {
    ts = await createTestServer([
      {
        id: "rc-1",
        name: "Reconnect Agent",
        pid: 6001,
        command: "claude",
        args: [],
        cwd: "/tmp",
        status: "active",
        createdAt: Date.now(),
      },
    ]);
  });

  afterAll(async () => {
    await ts.close();
  });

  it("can reconnect after disconnecting and receive fresh state", async () => {
    // First connection
    const bws1 = await connectWs(ts.wsUrl);
    const msg1 = await waitForMessage(bws1, { type: "sessions-update" });
    expect((msg1.payload as MockSession[]).length).toBe(1);
    bws1.close();

    // Wait for close to propagate
    await new Promise((r) => setTimeout(r, 100));

    // Second connection — should get fresh sessions-update
    const bws2 = await connectWs(ts.wsUrl);
    const msg2 = await waitForMessage(bws2, { type: "sessions-update" });
    expect((msg2.payload as MockSession[]).length).toBe(1);
    bws2.close();
  });
});

// ---------------------------------------------------------------------------
// WebSocket — broadcast to multiple clients
// ---------------------------------------------------------------------------

describe("WebSocket — broadcast to multiple clients", () => {
  let ts: TestServer;

  beforeAll(async () => {
    ts = await createTestServer([]);
  });

  afterAll(async () => {
    await ts.close();
  });

  it("broadcasts terminal events to all connected clients", async () => {
    // Connect 3 clients, drain their initial sessions-update
    const clients = await Promise.all([
      connectWs(ts.wsUrl),
      connectWs(ts.wsUrl),
      connectWs(ts.wsUrl),
    ]);

    // Drain initial sessions-update messages
    await Promise.all(
      clients.map((bws) => waitForMessage(bws, { type: "sessions-update" })),
    );

    // Set up listeners before emitting
    const received = clients.map((bws) =>
      waitForMessage(bws, { type: "terminal-data", timeoutMs: 3000 }),
    );

    // Emit the event through the mock terminal manager
    ts.terminalManager.emit({
      type: "terminal-data",
      sessionId: "test-session",
      data: "Hello from the terminal",
    });

    // All 3 clients should receive the broadcast
    const messages = await Promise.all(received);
    for (const msg of messages) {
      expect(msg.type).toBe("terminal-data");
      expect(msg.sessionId).toBe("test-session");
      expect(msg.data).toBe("Hello from the terminal");
    }

    // Cleanup
    for (const bws of clients) bws.close();
  });

  it("does not send to disconnected clients", async () => {
    const bws1 = await connectWs(ts.wsUrl);
    const bws2 = await connectWs(ts.wsUrl);

    // Drain initial messages
    await Promise.all([
      waitForMessage(bws1, { type: "sessions-update" }),
      waitForMessage(bws2, { type: "sessions-update" }),
    ]);

    // Disconnect bws1
    bws1.close();
    await new Promise((r) => setTimeout(r, 100));

    // Set up listener on bws2 only
    const bws2Promise = waitForMessage(bws2, {
      type: "terminal-data",
      timeoutMs: 2000,
    });

    ts.terminalManager.emit({
      type: "terminal-data",
      sessionId: "x",
      data: "only bws2 should get this",
    });

    const msg = await bws2Promise;
    expect(msg.data).toBe("only bws2 should get this");

    bws2.close();
  });
});

// ---------------------------------------------------------------------------
// WebSocket — backpressure (bufferedAmount)
// ---------------------------------------------------------------------------

describe("WebSocket — backpressure handling", () => {
  let ts: TestServer;

  beforeAll(async () => {
    ts = await createTestServer([]);
  });

  afterAll(async () => {
    await ts.close();
  });

  it("handles rapid-fire messages without crashing", async () => {
    const bws = await connectWs(ts.wsUrl);
    await waitForMessage(bws, { type: "sessions-update" });

    // Fire 100 messages rapidly through the terminal manager
    for (let i = 0; i < 100; i++) {
      ts.terminalManager.emit({
        type: "terminal-data",
        sessionId: "burst",
        data: `line-${i}\n`,
      });
    }

    // Just verify we can still receive a message after the burst
    const msg = await waitForMessage(bws, {
      type: "terminal-data",
      timeoutMs: 3000,
    });
    expect(msg.type).toBe("terminal-data");

    bws.close();
  });
});

// ---------------------------------------------------------------------------
// WebSocket — message handling (terminal input)
// ---------------------------------------------------------------------------

describe("WebSocket — terminal input", () => {
  let ts: TestServer;

  beforeAll(async () => {
    ts = await createTestServer([
      {
        id: "input-session",
        name: "Input Test",
        pid: 7001,
        command: "claude",
        args: [],
        cwd: "/tmp",
        status: "active",
        createdAt: Date.now(),
      },
    ]);
  });

  afterAll(async () => {
    await ts.close();
  });

  it("accepts terminal-input messages without error", async () => {
    const bws = await connectWs(ts.wsUrl);
    await waitForMessage(bws, { type: "sessions-update" });

    // Send a terminal input message via raw WebSocket
    bws.ws.send(
      JSON.stringify({
        type: "terminal-input",
        sessionId: "input-session",
        data: "ls -la\n",
      }),
    );

    // No error expected — just verify the connection stays alive
    await new Promise((r) => setTimeout(r, 200));
    expect(bws.readyState).toBe(WebSocket.OPEN);

    bws.close();
  });

  it("ignores malformed JSON messages", async () => {
    const bws = await connectWs(ts.wsUrl);
    await waitForMessage(bws, { type: "sessions-update" });

    // Send garbage via raw WebSocket
    bws.ws.send("not json at all {{{");
    bws.ws.send(Buffer.from([0x00, 0x01, 0x02]));

    // Connection should remain open
    await new Promise((r) => setTimeout(r, 200));
    expect(bws.readyState).toBe(WebSocket.OPEN);

    bws.close();
  });
});

// ---------------------------------------------------------------------------
// WebSocket — concurrent connections tracked in health
// ---------------------------------------------------------------------------

describe("WebSocket — health reports wsClients", () => {
  let ts: TestServer;

  beforeAll(async () => {
    ts = await createTestServer([]);
  });

  afterAll(async () => {
    await ts.close();
  });

  it("tracks connected client count", async () => {
    const { default: supertest } = await import("supertest");

    // Start with 0 clients
    let res = await supertest(ts.app).get("/api/health");
    expect(res.body.wsClients).toBe(0);

    // Connect 2 clients
    const bws1 = await connectWs(ts.wsUrl);
    const bws2 = await connectWs(ts.wsUrl);

    // Drain initial messages
    await Promise.all([
      waitForMessage(bws1, { type: "sessions-update" }),
      waitForMessage(bws2, { type: "sessions-update" }),
    ]);

    res = await supertest(ts.app).get("/api/health");
    expect(res.body.wsClients).toBe(2);

    // Disconnect one
    bws1.close();
    await new Promise((r) => setTimeout(r, 200));

    res = await supertest(ts.app).get("/api/health");
    expect(res.body.wsClients).toBe(1);

    bws2.close();
    await new Promise((r) => setTimeout(r, 200));

    res = await supertest(ts.app).get("/api/health");
    expect(res.body.wsClients).toBe(0);
  });
});
