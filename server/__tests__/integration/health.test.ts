import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createTestServer, type TestServer, type MockSession } from "./helpers";

// ---------------------------------------------------------------------------
// GET /api/health
// ---------------------------------------------------------------------------

describe("GET /api/health", () => {
  let ts: TestServer;

  beforeAll(async () => {
    const sessions: MockSession[] = [
      {
        id: "s1",
        name: "Agent 1",
        pid: 1001,
        command: "claude",
        args: [],
        cwd: "/tmp",
        status: "active",
        createdAt: Date.now(),
      },
      {
        id: "s2",
        name: "Agent 2",
        pid: 1002,
        command: "claude",
        args: [],
        cwd: "/tmp",
        status: "idle",
        createdAt: Date.now(),
      },
      {
        id: "s3",
        name: "Agent 3",
        pid: 1003,
        command: "claude",
        args: [],
        cwd: "/tmp",
        status: "exited",
        exitCode: 0,
        createdAt: Date.now(),
      },
    ];
    ts = await createTestServer(sessions);
  });

  afterAll(async () => {
    await ts.close();
  });

  it("returns 200 with valid JSON", async () => {
    const res = await request(ts.app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body.status).toBe("ok");
  });

  it("includes required fields with correct types", async () => {
    const res = await request(ts.app).get("/api/health");
    const body = res.body;

    expect(typeof body.uptime).toBe("number");
    expect(body.uptime).toBeGreaterThan(0);
    expect(typeof body.activeSessions).toBe("number");
    expect(typeof body.totalSessions).toBe("number");
    expect(typeof body.wsClients).toBe("number");
    expect(typeof body.startedAt).toBe("string");
    expect(typeof body.timestamp).toBe("string");

    // Validate ISO timestamps parse correctly
    expect(new Date(body.startedAt).getTime()).not.toBeNaN();
    expect(new Date(body.timestamp).getTime()).not.toBeNaN();
  });

  it("reports correct session counts", async () => {
    const res = await request(ts.app).get("/api/health");

    // 1 active out of 3 total (idle and exited are not active)
    expect(res.body.activeSessions).toBe(1);
    expect(res.body.totalSessions).toBe(3);
  });

  it("includes memory usage with expected keys", async () => {
    const res = await request(ts.app).get("/api/health");
    const mem = res.body.memoryUsage;

    expect(mem).toBeDefined();
    expect(typeof mem.heapUsed).toBe("number");
    expect(typeof mem.heapTotal).toBe("number");
    expect(typeof mem.rss).toBe("number");
    expect(typeof mem.external).toBe("number");
    expect(mem.heapUsed).toBeGreaterThan(0);
    expect(mem.rss).toBeGreaterThan(0);
  });

  it("reports wsClients as 0 when no WebSocket connections exist", async () => {
    const res = await request(ts.app).get("/api/health");
    expect(res.body.wsClients).toBe(0);
  });
});

describe("GET /api/health with no sessions", () => {
  let ts: TestServer;

  beforeAll(async () => {
    ts = await createTestServer([]);
  });

  afterAll(async () => {
    await ts.close();
  });

  it("returns 0 for all session counts", async () => {
    const res = await request(ts.app).get("/api/health");

    expect(res.body.activeSessions).toBe(0);
    expect(res.body.totalSessions).toBe(0);
  });
});
