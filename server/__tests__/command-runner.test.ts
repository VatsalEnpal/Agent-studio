import { describe, it, expect, beforeEach } from "vitest";
import {
  MockCommandRunner,
  ClaudeCommandRunner,
  createCommandRunner,
} from "../workflows/command-runner.js";

describe("MockCommandRunner", () => {
  let mock: MockCommandRunner;

  beforeEach(() => {
    mock = new MockCommandRunner();
  });

  it("returns configured success response", async () => {
    mock.setSuccess("output data");
    const result = await mock.run("claude", ["-p", "test"], { cwd: "/tmp" });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("output data");
    expect(result.stderr).toBe("");
  });

  it("returns configured failure response", async () => {
    mock.setFailure(1, "something broke");
    const result = await mock.run("claude", ["-p", "test"], { cwd: "/tmp" });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("something broke");
  });

  it("cycles through multiple responses in order", async () => {
    mock.setResponses([
      { exitCode: 0, stdout: "first", stderr: "" },
      { exitCode: 1, stdout: "second", stderr: "err" },
    ]);

    const r1 = await mock.run("claude", [], { cwd: "/tmp" });
    expect(r1.stdout).toBe("first");
    expect(r1.exitCode).toBe(0);

    const r2 = await mock.run("claude", [], { cwd: "/tmp" });
    expect(r2.stdout).toBe("second");
    expect(r2.exitCode).toBe(1);
  });

  it("sticks on last response when exhausted", async () => {
    mock.setResponses([{ exitCode: 0, stdout: "only", stderr: "" }]);

    await mock.run("claude", [], { cwd: "/tmp" });
    const r2 = await mock.run("claude", [], { cwd: "/tmp" });
    expect(r2.stdout).toBe("only");
  });

  it("records all calls with arguments", async () => {
    mock.setSuccess();
    await mock.run("claude", ["-p", "hello"], { cwd: "/home" });
    await mock.run("claude", ["--agent", "qa"], { cwd: "/work" });

    expect(mock.calls).toHaveLength(2);
    expect(mock.calls[0].args).toEqual(["-p", "hello"]);
    expect(mock.calls[0].options.cwd).toBe("/home");
    expect(mock.calls[1].args).toEqual(["--agent", "qa"]);
  });

  it("simulates timeout via abort signal", async () => {
    mock.setTimeout(5000); // long delay
    const controller = new AbortController();

    // Abort immediately
    setTimeout(() => controller.abort(), 10);

    await expect(
      mock.run("claude", [], { cwd: "/tmp", signal: controller.signal }),
    ).rejects.toThrow();
  });

  it("simulates rate limit response", async () => {
    mock.setRateLimit();
    const result = await mock.run("claude", [], { cwd: "/tmp" });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("429");
  });

  it("resets state cleanly", async () => {
    mock.setSuccess("data");
    await mock.run("claude", [], { cwd: "/tmp" });
    expect(mock.calls).toHaveLength(1);

    mock.reset();
    expect(mock.calls).toHaveLength(0);
  });
});

describe("ClaudeCommandRunner", () => {
  it("has a static isAvailable method", () => {
    // Just verify the method exists and returns a boolean
    const result = ClaudeCommandRunner.isAvailable();
    expect(typeof result).toBe("boolean");
  });
});

describe("createCommandRunner", () => {
  it("returns MockCommandRunner in test environment", () => {
    const runner = createCommandRunner();
    expect(runner).toBeInstanceOf(MockCommandRunner);
  });

  it("returns MockCommandRunner when useMock=true", () => {
    const runner = createCommandRunner(true);
    expect(runner).toBeInstanceOf(MockCommandRunner);
  });
});
