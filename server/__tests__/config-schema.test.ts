import { describe, it, expect } from "vitest";
import {
  validateConfig,
  safeValidateConfig,
  AgentStudioConfigSchema,
  type ValidatedConfig,
} from "../config-schema";

// ---------------------------------------------------------------------------
// Valid configs
// ---------------------------------------------------------------------------

describe("validateConfig — valid inputs", () => {
  it("applies all defaults when given an empty object", () => {
    const config = validateConfig({});

    expect(config.projects).toEqual([]);
    expect(config.devServers).toEqual([]);
    expect(config.setupComplete).toBe(false);
    expect(config.version).toBe("1.0.0");
    expect(config.defaults).toEqual({
      model: "sonnet",
      permissions: "default",
      workingDirectory: "",
    });
    expect(config.agentSystem).toBeUndefined();
  });

  it("accepts a fully specified config", () => {
    const raw = {
      projects: [
        {
          name: "my-app",
          path: "/home/user/my-app",
          isProd: true,
          trackedBranches: ["main", "develop"],
        },
      ],
      agentSystem: {
        path: "/home/user/.agents",
        memoryIndex: "custom/memory.json",
        sprintDir: "custom/sprints/",
        scanLog: "scan.log",
      },
      devServers: [
        { name: "frontend", path: "/home/user/my-app", command: "npm run dev", port: 3000 },
      ],
      defaults: {
        model: "opus",
        permissions: "admin",
        workingDirectory: "/tmp",
      },
      setupComplete: true,
      version: "2.0.0",
    };

    const config = validateConfig(raw);

    expect(config.projects).toHaveLength(1);
    expect(config.projects[0].isProd).toBe(true);
    expect(config.projects[0].trackedBranches).toEqual(["main", "develop"]);
    expect(config.agentSystem?.memoryIndex).toBe("custom/memory.json");
    expect(config.devServers[0].port).toBe(3000);
    expect(config.defaults.model).toBe("opus");
    expect(config.setupComplete).toBe(true);
    expect(config.version).toBe("2.0.0");
  });

  it("fills defaults for agent system sub-fields", () => {
    const config = validateConfig({
      agentSystem: { path: "/agents" },
    });

    expect(config.agentSystem).toBeDefined();
    expect(config.agentSystem!.memoryIndex).toBe("tools/memory_index.json");
    expect(config.agentSystem!.sprintDir).toBe("sprints/");
    expect(config.agentSystem!.scanLog).toBeUndefined();
  });

  it("fills defaults for partial defaults object", () => {
    const config = validateConfig({
      defaults: { model: "haiku" },
    });

    expect(config.defaults.model).toBe("haiku");
    expect(config.defaults.permissions).toBe("default");
    expect(config.defaults.workingDirectory).toBe("");
  });

  it("defaults project.isProd to false when omitted", () => {
    const config = validateConfig({
      projects: [{ name: "test", path: "/test" }],
    });

    expect(config.projects[0].isProd).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Invalid configs — type rejections
// ---------------------------------------------------------------------------

describe("validateConfig — invalid inputs", () => {
  it("rejects when projects has an entry with empty name", () => {
    expect(() =>
      validateConfig({
        projects: [{ name: "", path: "/valid" }],
      }),
    ).toThrow();
  });

  it("rejects when projects has an entry with empty path", () => {
    expect(() =>
      validateConfig({
        projects: [{ name: "valid", path: "" }],
      }),
    ).toThrow();
  });

  it("rejects when devServer command is missing", () => {
    expect(() =>
      validateConfig({
        devServers: [{ name: "fe", path: "/app" }],
      }),
    ).toThrow();
  });

  it("rejects non-integer port", () => {
    expect(() =>
      validateConfig({
        devServers: [
          { name: "fe", path: "/app", command: "npm dev", port: 3.14 },
        ],
      }),
    ).toThrow();
  });

  it("rejects negative port", () => {
    expect(() =>
      validateConfig({
        devServers: [
          { name: "fe", path: "/app", command: "npm dev", port: -1 },
        ],
      }),
    ).toThrow();
  });

  it("rejects when setupComplete is not a boolean", () => {
    expect(() =>
      validateConfig({ setupComplete: "yes" }),
    ).toThrow();
  });

  it("rejects when version is not a string", () => {
    expect(() =>
      validateConfig({ version: 123 }),
    ).toThrow();
  });

  it("rejects agentSystem with empty path", () => {
    expect(() =>
      validateConfig({ agentSystem: { path: "" } }),
    ).toThrow();
  });

  it("rejects a non-object input", () => {
    expect(() => validateConfig("not an object")).toThrow();
    expect(() => validateConfig(42)).toThrow();
    expect(() => validateConfig(null)).toThrow();
    expect(() => validateConfig(true)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// safeValidateConfig
// ---------------------------------------------------------------------------

describe("safeValidateConfig", () => {
  it("returns success with data for valid input", () => {
    const result = safeValidateConfig({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe("1.0.0");
    }
  });

  it("returns failure with error for invalid input", () => {
    const result = safeValidateConfig("invalid");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it("does not throw for invalid input", () => {
    expect(() => safeValidateConfig(null)).not.toThrow();
    expect(() => safeValidateConfig(undefined)).not.toThrow();
    expect(() => safeValidateConfig(123)).not.toThrow();
  });
});
