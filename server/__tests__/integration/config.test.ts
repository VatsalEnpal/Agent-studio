import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import { readFileSync, existsSync } from "node:fs";
import { createTempFixtures, type TempFixtures } from "./helpers";

// ---------------------------------------------------------------------------
// Build a minimal Express app that mounts config routes inline,
// mirroring how index.ts handles /api/config.
// ---------------------------------------------------------------------------

function createConfigApp(configPath: string) {
  const app = express();
  app.use(express.json());

  app.get("/api/config", (_req, res) => {
    try {
      if (!existsSync(configPath)) {
        // Missing config file — return defaults
        res.json({
          homeDir: "/home/test",
          cwd: process.cwd(),
          config: {
            version: "1.0.0",
            projects: [],
            devServers: [],
            defaults: { model: "sonnet", permissions: "default", workingDirectory: "" },
            setupComplete: false,
          },
        });
        return;
      }
      const raw = readFileSync(configPath, "utf-8");
      const config = JSON.parse(raw);
      res.json({
        homeDir: "/home/test",
        cwd: process.cwd(),
        config,
      });
    } catch (err) {
      // Corrupt JSON — return defaults
      res.json({
        homeDir: "/home/test",
        cwd: process.cwd(),
        config: {
          version: "1.0.0",
          projects: [],
          devServers: [],
          defaults: { model: "sonnet", permissions: "default", workingDirectory: "" },
          setupComplete: false,
        },
      });
    }
  });

  app.post("/api/config", (req, res) => {
    try {
      const newConfig = req.body;
      if (!newConfig || !newConfig.version) {
        res.status(400).json({ error: "Invalid config" });
        return;
      }
      const { writeFileSync } = require("node:fs");
      writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
      res.json({ ok: true });
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

describe("GET /api/config", () => {
  let fixtures: TempFixtures;
  let app: express.Express;

  beforeEach(() => {
    fixtures = createTempFixtures({
      config: {
        projects: [{ name: "my-project", path: "/code/project", isProd: false }],
        agents: [{ id: "backend", name: "backend", description: "API agent" }],
      },
    });
    app = createConfigApp(fixtures.configPath);
  });

  afterEach(() => {
    fixtures.cleanup();
  });

  it("returns 200 with config object", async () => {
    const res = await request(app).get("/api/config");

    expect(res.status).toBe(200);
    expect(res.body.config).toBeDefined();
    expect(res.body.config.version).toBe("1.0.0");
  });

  it("returns projects from config", async () => {
    const res = await request(app).get("/api/config");

    expect(res.body.config.projects).toHaveLength(1);
    expect(res.body.config.projects[0].name).toBe("my-project");
  });

  it("returns agents from config", async () => {
    const res = await request(app).get("/api/config");

    expect(res.body.config.agents).toHaveLength(1);
    expect(res.body.config.agents[0].id).toBe("backend");
  });

  it("includes homeDir and cwd metadata", async () => {
    const res = await request(app).get("/api/config");

    expect(res.body.homeDir).toBe("/home/test");
    expect(typeof res.body.cwd).toBe("string");
  });
});

describe("GET /api/config — missing file", () => {
  it("returns default config when file does not exist", async () => {
    const app = createConfigApp("/nonexistent/path/.agent-studio.json");
    const res = await request(app).get("/api/config");

    expect(res.status).toBe(200);
    expect(res.body.config.version).toBe("1.0.0");
    expect(res.body.config.projects).toEqual([]);
    expect(res.body.config.setupComplete).toBe(false);
  });
});

describe("GET /api/config — corrupt JSON file", () => {
  let fixtures: TempFixtures;

  beforeEach(() => {
    fixtures = createTempFixtures();
    // Write invalid JSON to config path
    const { writeFileSync } = require("node:fs");
    writeFileSync(fixtures.configPath, "{ invalid json !!!");
  });

  afterEach(() => {
    fixtures.cleanup();
  });

  it("returns default config when JSON is corrupt", async () => {
    const app = createConfigApp(fixtures.configPath);
    const res = await request(app).get("/api/config");

    expect(res.status).toBe(200);
    expect(res.body.config.version).toBe("1.0.0");
    expect(res.body.config.projects).toEqual([]);
  });
});

describe("POST /api/config", () => {
  let fixtures: TempFixtures;
  let app: express.Express;

  beforeEach(() => {
    fixtures = createTempFixtures();
    app = createConfigApp(fixtures.configPath);
  });

  afterEach(() => {
    fixtures.cleanup();
  });

  it("saves valid config and returns ok", async () => {
    const newConfig = {
      version: "2.0.0",
      projects: [{ name: "updated", path: "/new/path", isProd: true }],
      devServers: [],
      defaults: { model: "opus", permissions: "bypass", workingDirectory: "~" },
      setupComplete: true,
    };

    const res = await request(app).post("/api/config").send(newConfig);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Verify it was persisted
    const raw = readFileSync(fixtures.configPath, "utf-8");
    const saved = JSON.parse(raw);
    expect(saved.version).toBe("2.0.0");
    expect(saved.projects[0].name).toBe("updated");
  });

  it("rejects config without version", async () => {
    const res = await request(app).post("/api/config").send({ projects: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid config/i);
  });

  it("rejects empty body", async () => {
    const res = await request(app).post("/api/config").send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid config/i);
  });
});
