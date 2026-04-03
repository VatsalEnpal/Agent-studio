import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createTestServer, type TestServer, type MockSession } from "./helpers";

// ---------------------------------------------------------------------------
// Sessions API
// ---------------------------------------------------------------------------

describe("GET /api/sessions", () => {
  let ts: TestServer;

  const sessions: MockSession[] = [
    {
      id: "s1",
      name: "Agent A",
      pid: 2001,
      command: "claude",
      args: ["--dangerously-skip-permissions"],
      cwd: "/tmp/project-a",
      status: "active",
      createdAt: Date.now() - 60_000,
    },
    {
      id: "s2",
      name: "Agent B",
      pid: 2002,
      command: "claude",
      args: [],
      cwd: "/tmp/project-b",
      status: "idle",
      createdAt: Date.now(),
    },
  ];

  beforeAll(async () => {
    ts = await createTestServer(sessions);
  });

  afterAll(async () => {
    await ts.close();
  });

  it("returns all sessions as JSON array", async () => {
    const res = await request(ts.app).get("/api/sessions");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
  });

  it("each session has required fields", async () => {
    const res = await request(ts.app).get("/api/sessions");

    for (const session of res.body) {
      expect(session.id).toBeDefined();
      expect(session.name).toBeDefined();
      expect(typeof session.pid).toBe("number");
      expect(typeof session.command).toBe("string");
      expect(Array.isArray(session.args)).toBe(true);
      expect(typeof session.cwd).toBe("string");
      expect(typeof session.status).toBe("string");
      expect(typeof session.createdAt).toBe("number");
    }
  });

  it("returns empty array when no sessions exist", async () => {
    const empty = await createTestServer([]);
    const res = await request(empty.app).get("/api/sessions");

    expect(res.body).toEqual([]);
    await empty.close();
  });
});

describe("POST /api/sessions", () => {
  let ts: TestServer;

  beforeAll(async () => {
    ts = await createTestServer([]);
  });

  afterAll(async () => {
    await ts.close();
  });

  it("creates a new session and returns 201", async () => {
    const res = await request(ts.app).post("/api/sessions").send({
      name: "New Agent",
      command: "claude",
      args: ["--model", "opus"],
      cwd: "/tmp",
    });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("New Agent");
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe("active");
  });

  it("new session appears in GET /api/sessions", async () => {
    const listRes = await request(ts.app).get("/api/sessions");

    expect(listRes.body.length).toBeGreaterThanOrEqual(1);
    const created = listRes.body.find(
      (s: { name: string }) => s.name === "New Agent",
    );
    expect(created).toBeDefined();
  });
});

describe("DELETE /api/sessions/:id", () => {
  let ts: TestServer;

  beforeAll(async () => {
    ts = await createTestServer([
      {
        id: "to-delete",
        name: "Doomed",
        pid: 3001,
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

  it("returns 204 for existing session", async () => {
    const res = await request(ts.app).delete("/api/sessions/to-delete");
    expect(res.status).toBe(204);
  });

  it("session is gone after deletion", async () => {
    const listRes = await request(ts.app).get("/api/sessions");
    const found = listRes.body.find(
      (s: { id: string }) => s.id === "to-delete",
    );
    expect(found).toBeUndefined();
  });

  it("returns 404 for non-existent session", async () => {
    const res = await request(ts.app).delete("/api/sessions/nonexistent-id");
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});

describe("GET /api/sessions/:id/buffer", () => {
  let ts: TestServer;

  beforeAll(async () => {
    ts = await createTestServer([
      {
        id: "buffered",
        name: "Has Buffer",
        pid: 4001,
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

  it("returns buffer content for existing session", async () => {
    const res = await request(ts.app).get("/api/sessions/buffered/buffer");

    expect(res.status).toBe(200);
    expect(res.body.buffer).toBeDefined();
    expect(typeof res.body.buffer).toBe("string");
  });

  it("returns 404 for non-existent session", async () => {
    const res = await request(ts.app).get("/api/sessions/ghost/buffer");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});
