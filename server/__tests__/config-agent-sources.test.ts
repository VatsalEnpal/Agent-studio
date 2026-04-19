import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Gap 1 regression test — verify that loadConfig() distinguishes between
// "agentSources key absent" (→ seed defaults) and "agentSources is []"
// (→ honor the user's cleared-all-sources state; do NOT re-seed).
//
// Without the fix, removing the last source in Settings persists
// `agentSources: []` but the next read silently re-seeds the Global row,
// making it look like the delete failed.
// ---------------------------------------------------------------------------

let tempDir: string;
let originalCwd: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "agent-studio-cfg-test-"));
  originalCwd = process.cwd();
  process.chdir(tempDir);
  // Ensure non-production so getConfigPath uses cwd.
  (process.env as Record<string, string>)["NODE_ENV"] = "test";
  vi.resetModules();
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(tempDir, { recursive: true, force: true });
});

function writeRawConfig(obj: Record<string, unknown>): void {
  writeFileSync(join(tempDir, ".agent-studio.json"), JSON.stringify(obj, null, 2), "utf-8");
}

describe("loadConfig / getAgentSources — cleared-vs-absent agentSources", () => {
  it("Case A: honors an explicit empty array (user cleared all sources)", async () => {
    writeRawConfig({
      projects: [{ name: "demo", path: tempDir, isProd: false }],
      devServers: [],
      defaults: { model: "sonnet", permissions: "bypass", workingDirectory: "~" },
      agentSources: [], // ← user explicitly cleared
      setupComplete: true,
      version: "1.0.0",
    });

    const { loadConfig, getAgentSources } = await import("../config.js");
    const cfg = loadConfig();

    expect(cfg).not.toBeNull();
    expect(Array.isArray(cfg!.agentSources)).toBe(true);
    expect(cfg!.agentSources).toEqual([]);

    const sources = getAgentSources(cfg!);
    expect(sources).toEqual([]);
  });

  it("Case B: seeds defaults when the agentSources key is absent from disk", async () => {
    writeRawConfig({
      projects: [{ name: "demo", path: tempDir, isProd: false }],
      devServers: [],
      defaults: { model: "sonnet", permissions: "bypass", workingDirectory: "~" },
      // agentSources key intentionally omitted
      setupComplete: true,
      version: "1.0.0",
    });

    const { loadConfig, getAgentSources } = await import("../config.js");
    const cfg = loadConfig();

    expect(cfg).not.toBeNull();
    expect(Array.isArray(cfg!.agentSources)).toBe(true);
    expect(cfg!.agentSources!.length).toBeGreaterThan(0);
    // The global entry must be present when seeding.
    expect(cfg!.agentSources!.some((s) => s.scope === "global")).toBe(true);

    const sources = getAgentSources(cfg!);
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.some((s) => s.scope === "global")).toBe(true);
  });

  it("Case C: honors an explicit empty array at the getAgentSources boundary too", async () => {
    // Double-checks that callers who go through getAgentSources(cfg) with a
    // config that has `agentSources: []` don't get defaults re-injected.
    const { getAgentSources } = await import("../config.js");
    const cfg = {
      projects: [],
      devServers: [],
      defaults: { model: "sonnet" as const, permissions: "bypass" as const, workingDirectory: "~" },
      agentSources: [],
      setupComplete: true,
      version: "1.0.0",
    };
    expect(getAgentSources(cfg)).toEqual([]);
  });

  it("Case D: falls back to defaults when agentSources is a non-array (corrupt)", async () => {
    writeRawConfig({
      projects: [],
      devServers: [],
      defaults: { model: "sonnet", permissions: "bypass", workingDirectory: "~" },
      agentSources: null as unknown as [], // corrupt value
      setupComplete: true,
      version: "1.0.0",
    });

    const { loadConfig } = await import("../config.js");
    const cfg = loadConfig();
    expect(cfg).not.toBeNull();
    expect(Array.isArray(cfg!.agentSources)).toBe(true);
    expect(cfg!.agentSources!.length).toBeGreaterThan(0);
  });
});
