import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Security tests — hits the REAL server at localhost:8080
// Run with: npm run dev & npx vitest run server/__tests__/integration/security.test.ts
// ---------------------------------------------------------------------------

const BASE = "http://localhost:8080";

async function api(method: string, path: string, body?: unknown) {
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, body: json, text };
}

describe("POST /api/scaffold — path validation", () => {
  it("rejects paths outside home/tmp directory", async () => {
    const res = await api("POST", "/api/scaffold", {
      projectPath: "/etc/passwd",
      agents: [{ id: "test", name: "Test" }],
    });
    expect(res.status).toBe(403);
    expect((res.body as Record<string, string>)?.error).toBe("Path not allowed");
  });

  it("rejects path traversal attempts", async () => {
    const res = await api("POST", "/api/scaffold", {
      projectPath: "/tmp/../etc/shadow",
      agents: [{ id: "test", name: "Test" }],
    });
    expect(res.status).toBe(403);
    expect((res.body as Record<string, string>)?.error).toBe("Path not allowed");
  });

  it("rejects empty projectPath", async () => {
    const res = await api("POST", "/api/scaffold", {
      projectPath: "",
      agents: [{ id: "test", name: "Test" }],
    });
    expect(res.status).toBe(400);
  });

  it("accepts valid path that exists in temp directory", async () => {
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
  it("health returns 200", async () => {
    const res = await api("GET", "/api/health");
    expect(res.status).toBe(200);
    expect((res.body as Record<string, string>)?.status).toBe("ok");
  });

  it("agents returns array", async () => {
    const res = await api("GET", "/api/agents");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("sessions returns array", async () => {
    const res = await api("GET", "/api/sessions");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("workflows returns array", async () => {
    const res = await api("GET", "/api/workflows");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("config returns object", async () => {
    const res = await api("GET", "/api/config");
    expect(res.status).toBe(200);
    expect(res.body).toBeTruthy();
  });
});
