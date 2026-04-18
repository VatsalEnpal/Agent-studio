import { describe, it, expect, beforeAll } from "vitest";

// ---------------------------------------------------------------------------
// Security tests — hits the REAL server at localhost:8080
// Run with: npm run dev & npx vitest run server/__tests__/integration/security.test.ts
//
// These tests require a live Agent Studio server. In CI (and when another
// subagent has torn down :8080), they would otherwise flake with 403s from
// whatever else answers on that port (Next's dev router, a stray proxy, etc).
// A `beforeAll` connectivity check skips the whole suite cleanly when the
// real server isn't reachable, with a clear log line for the run output.
// ---------------------------------------------------------------------------

const BASE = "http://localhost:8080";

let serverReachable = false;

async function isAgentStudioServerUp(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(`${BASE}/api/health`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return false;
    const body = (await res.json().catch(() => null)) as { status?: string } | null;
    return body?.status === "ok";
  } catch {
    return false;
  }
}

beforeAll(async () => {
  serverReachable = await isAgentStudioServerUp();
  if (!serverReachable) {
    // eslint-disable-next-line no-console
    console.log("skipping integration suite: :8080 not reachable");
  }
});

async function api(method: string, path: string, body?: unknown) {
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, body: json, text };
}

// Helper that skips an individual test when the server wasn't reachable during
// beforeAll. We can't use `it.skipIf(!serverReachable)` at module-parse time
// because `serverReachable` is only set inside beforeAll, so we check inside
// the test body and call `ctx.skip()` instead.
function skipIfServerDown(ctx: { skip: () => void }): boolean {
  if (!serverReachable) {
    ctx.skip();
    return true;
  }
  return false;
}

describe("POST /api/scaffold — path validation", () => {
  it("rejects paths outside home/tmp directory", async (ctx) => {
    if (skipIfServerDown(ctx)) return;
    const res = await api("POST", "/api/scaffold", {
      projectPath: "/etc/passwd",
      agents: [{ id: "test", name: "Test" }],
    });
    expect(res.status).toBe(403);
    expect((res.body as Record<string, string>)?.error).toBe("Path not allowed");
  });

  it("rejects path traversal attempts", async (ctx) => {
    if (skipIfServerDown(ctx)) return;
    const res = await api("POST", "/api/scaffold", {
      projectPath: "/tmp/../etc/shadow",
      agents: [{ id: "test", name: "Test" }],
    });
    expect(res.status).toBe(403);
    expect((res.body as Record<string, string>)?.error).toBe("Path not allowed");
  });

  it("rejects empty projectPath", async (ctx) => {
    if (skipIfServerDown(ctx)) return;
    const res = await api("POST", "/api/scaffold", {
      projectPath: "",
      agents: [{ id: "test", name: "Test" }],
    });
    expect(res.status).toBe(400);
  });

  it("accepts valid path that exists in temp directory", async (ctx) => {
    if (skipIfServerDown(ctx)) return;
    // Use /tmp/shiploop-test-project which was created during test setup
    const res = await api("POST", "/api/scaffold", {
      projectPath: "/tmp/shiploop-test-project",
      agents: [{ id: "test", name: "Test Agent" }],
      workflow: "simple",
    });
    // 201 (created) or 409 (already exists) — both valid, NOT 403
    expect([201, 409]).toContain(res.status);
  });
});

describe("Core endpoints still work after security fixes", () => {
  it("health returns 200", async (ctx) => {
    if (skipIfServerDown(ctx)) return;
    const res = await api("GET", "/api/health");
    expect(res.status).toBe(200);
    expect((res.body as Record<string, string>)?.status).toBe("ok");
  });

  it("agents returns array", async (ctx) => {
    if (skipIfServerDown(ctx)) return;
    const res = await api("GET", "/api/agents");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("sessions returns array", async (ctx) => {
    if (skipIfServerDown(ctx)) return;
    const res = await api("GET", "/api/sessions");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("workflows returns array", async (ctx) => {
    if (skipIfServerDown(ctx)) return;
    const res = await api("GET", "/api/workflows");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("config returns object", async (ctx) => {
    if (skipIfServerDown(ctx)) return;
    const res = await api("GET", "/api/config");
    expect(res.status).toBe(200);
    expect(res.body).toBeTruthy();
  });
});
