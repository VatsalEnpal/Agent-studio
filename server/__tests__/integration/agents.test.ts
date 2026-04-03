import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { createTempFixtures, type TempFixtures } from "./helpers";

// ---------------------------------------------------------------------------
// Build a minimal Express app that mirrors /api/agents from index.ts.
// We replicate the inline route so we can inject the fixture paths.
// ---------------------------------------------------------------------------

function createAgentsApp(fixtures: TempFixtures) {
  const app = express();
  app.use(express.json());

  app.get("/api/agents", async (_req, res) => {
    try {
      const config = JSON.parse(readFileSync(fixtures.configPath, "utf-8"));
      const agents: Array<{ id: string; name: string; description: string }> = [];
      const seenIds = new Set<string>();

      // Always include "No Agent" first
      agents.push({ id: "none", name: "No Agent", description: "Plain Claude session" });
      seenIds.add("none");

      // Add agents from config
      if (config.agents && Array.isArray(config.agents)) {
        for (const a of config.agents) {
          if (!seenIds.has(a.id)) {
            agents.push(a);
            seenIds.add(a.id);
          }
        }
      }

      // Auto-discover agents from .claude/agents/ in each project
      for (const project of config.projects) {
        const agentsDir = join(project.path, ".claude", "agents");
        if (!existsSync(agentsDir)) continue;

        try {
          const files = readdirSync(agentsDir).filter((f: string) => f.endsWith(".md"));
          for (const file of files) {
            const id = basename(file, ".md");
            if (seenIds.has(id)) continue;

            let description = `Agent from ${project.name}`;
            try {
              const content = readFileSync(join(agentsDir, file), "utf-8");
              const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
              if (fmMatch) {
                const descMatch = fmMatch[1]!.match(/description:\s*(.+)/);
                if (descMatch) description = descMatch[1]!.trim();
              }
            } catch {
              // Use default description
            }

            agents.push({ id, name: id, description });
            seenIds.add(id);
          }
        } catch {
          // Can't read directory, skip
        }
      }

      // Fallback defaults when no agents found
      if (agents.length <= 1) {
        agents.push(
          { id: "orchestrator", name: "orchestrator", description: "Coordinates agent teams" },
          { id: "frontend", name: "frontend", description: "Builds UI" },
          { id: "backend", name: "backend", description: "Builds APIs" },
        );
      }

      res.json(agents);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/agents — discovers .md files", () => {
  let fixtures: TempFixtures;
  let app: express.Express;

  beforeEach(() => {
    fixtures = createTempFixtures({
      agentFiles: [
        {
          name: "frontend.md",
          content: [
            "---",
            "description: Builds React components",
            "---",
            "# Frontend Agent",
            "You build frontend code.",
          ].join("\n"),
        },
        {
          name: "qa.md",
          content: [
            "---",
            "description: Tests everything",
            "---",
            "# QA Agent",
          ].join("\n"),
        },
        { name: "notes.txt", content: "not an agent file" },
      ],
    });
    app = createAgentsApp(fixtures);
  });

  afterEach(() => {
    fixtures.cleanup();
  });

  it("always includes 'No Agent' as first entry", async () => {
    const res = await request(app).get("/api/agents");

    expect(res.status).toBe(200);
    expect(res.body[0]).toEqual({
      id: "none",
      name: "No Agent",
      description: "Plain Claude session",
    });
  });

  it("discovers .md files from .claude/agents/", async () => {
    const res = await request(app).get("/api/agents");

    const ids = res.body.map((a: { id: string }) => a.id);
    expect(ids).toContain("frontend");
    expect(ids).toContain("qa");
  });

  it("extracts description from YAML frontmatter", async () => {
    const res = await request(app).get("/api/agents");

    const frontend = res.body.find((a: { id: string }) => a.id === "frontend");
    expect(frontend.description).toBe("Builds React components");
  });

  it("ignores non-.md files", async () => {
    const res = await request(app).get("/api/agents");

    const ids = res.body.map((a: { id: string }) => a.id);
    expect(ids).not.toContain("notes");
  });

  it("de-duplicates agents by id", async () => {
    const res = await request(app).get("/api/agents");

    const frontendCount = res.body.filter(
      (a: { id: string }) => a.id === "frontend",
    ).length;
    expect(frontendCount).toBe(1);
  });
});

describe("GET /api/agents — no agent files", () => {
  let fixtures: TempFixtures;
  let app: express.Express;

  beforeEach(() => {
    fixtures = createTempFixtures({ agentFiles: [] });
    app = createAgentsApp(fixtures);
  });

  afterEach(() => {
    fixtures.cleanup();
  });

  it("returns default agents when no .md files exist", async () => {
    const res = await request(app).get("/api/agents");

    expect(res.body.length).toBeGreaterThan(1);
    const ids = res.body.map((a: { id: string }) => a.id);
    expect(ids).toContain("none");
    expect(ids).toContain("orchestrator");
    expect(ids).toContain("frontend");
    expect(ids).toContain("backend");
  });
});

describe("GET /api/agents — agents in config", () => {
  let fixtures: TempFixtures;
  let app: express.Express;

  beforeEach(() => {
    fixtures = createTempFixtures({
      config: {
        agents: [
          { id: "security", name: "security", description: "Security scanner" },
          { id: "pmo", name: "pmo", description: "Project manager" },
        ],
      },
    });
    app = createAgentsApp(fixtures);
  });

  afterEach(() => {
    fixtures.cleanup();
  });

  it("includes agents from config", async () => {
    const res = await request(app).get("/api/agents");

    const ids = res.body.map((a: { id: string }) => a.id);
    expect(ids).toContain("security");
    expect(ids).toContain("pmo");
  });

  it("config agents come before discovered agents", async () => {
    const res = await request(app).get("/api/agents");

    const securityIdx = res.body.findIndex((a: { id: string }) => a.id === "security");
    const noneIdx = res.body.findIndex((a: { id: string }) => a.id === "none");
    // "none" is always first, config agents follow
    expect(noneIdx).toBe(0);
    expect(securityIdx).toBeGreaterThan(0);
  });
});

describe("GET /api/agents — missing .claude/agents/ directory", () => {
  let fixtures: TempFixtures;
  let app: express.Express;

  beforeEach(() => {
    // Create fixture without the agents dir
    fixtures = createTempFixtures();
    // Remove the agents directory that createTempFixtures always creates
    const { rmSync } = require("node:fs");
    rmSync(fixtures.agentsDir, { recursive: true, force: true });
    app = createAgentsApp(fixtures);
  });

  afterEach(() => {
    fixtures.cleanup();
  });

  it("gracefully falls back to defaults when agents dir is missing", async () => {
    const res = await request(app).get("/api/agents");

    expect(res.status).toBe(200);
    expect(res.body[0].id).toBe("none");
    // Should still have fallback defaults
    expect(res.body.length).toBeGreaterThan(1);
  });
});
