import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SprintManager, type SprintState } from "../sprint-manager.js";

// --- Mocks ---

const mockReadFile = vi.fn();
const mockReaddir = vi.fn();
const mockWriteFile = vi.fn();
const mockRename = vi.fn();

vi.mock("node:fs/promises", () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  readdir: (...args: unknown[]) => mockReaddir(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  rename: (...args: unknown[]) => mockRename(...args),
}));

const mockWatcherOn = vi.fn().mockReturnThis();
const mockWatcherClose = vi.fn().mockResolvedValue(undefined);

vi.mock("chokidar", () => ({
  watch: vi.fn(() => ({
    on: mockWatcherOn,
    close: mockWatcherClose,
  })),
}));

vi.mock("../../config.js", () => ({
  getAgentSystemBase: vi.fn(() => "/fake/ai-agents"),
}));

// --- Helpers ---

function validState(overrides: Partial<SprintState> = {}): SprintState {
  return {
    version: "1",
    sprint: "sprint-42",
    status: "in_progress",
    gates: { design: "passed", qa: "not_started" },
    agents: { frontend: "active", backend: "idle" },
    startedAt: "2026-04-01T00:00:00Z",
    ...overrides,
  };
}

describe("SprintManager", () => {
  let mgr: SprintManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mgr = new SprintManager();
    // Default: state.json doesn't exist
    mockReadFile.mockRejectedValue(new Error("ENOENT"));
    mockReaddir.mockResolvedValue([]);
    mockWriteFile.mockResolvedValue(undefined);
    mockRename.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await mgr.stop();
  });

  describe("start / stop", () => {
    it("starts watcher and loads state", async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify(validState()));
      await mgr.start();

      const { watch } = await import("chokidar");
      expect(watch).toHaveBeenCalled();
      expect(mgr.getState().sprint).toBe("sprint-42");
    });

    it("uses defaults when state.json is missing", async () => {
      await mgr.start();
      const s = mgr.getState();
      expect(s.status).toBe("planned");
      expect(s.sprint).toBeNull();
    });

    it("handles corrupt state.json gracefully", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockReadFile.mockResolvedValueOnce("not json {{{");
      await mgr.start();

      expect(mgr.getState().status).toBe("planned");
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it("stop closes watcher and clears timers", async () => {
      await mgr.start();
      await mgr.stop();
      expect(mockWatcherClose).toHaveBeenCalled();
    });
  });

  describe("getState", () => {
    it("returns a copy, not the internal reference", async () => {
      await mgr.start();
      const a = mgr.getState();
      const b = mgr.getState();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  describe("getActiveSprint", () => {
    it("returns null when no sprint is active", async () => {
      await mgr.start();
      expect(await mgr.getActiveSprint()).toBeNull();
    });

    it("returns spec and state when sprint is active", async () => {
      mockReadFile
        .mockResolvedValueOnce(JSON.stringify(validState())) // state.json in start()
        .mockResolvedValueOnce("# Sprint 42 Spec"); // current.md

      await mgr.start();
      const result = await mgr.getActiveSprint();
      expect(result).not.toBeNull();
      expect(result!.spec).toBe("# Sprint 42 Spec");
      expect(result!.state.sprint).toBe("sprint-42");
    });
  });

  describe("getHandoffs", () => {
    it("reads and parses handoff JSON files", async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify(validState()));
      await mgr.start();

      mockReaddir.mockResolvedValueOnce(["frontend.json", "qa_report.json", ".gitkeep"]);
      mockReadFile.mockResolvedValueOnce(JSON.stringify({ from: "frontend", to: "qa" }));

      const handoffs = await mgr.getHandoffs();
      expect(handoffs).toHaveLength(1);
      expect(handoffs[0]).toMatchObject({ _file: "frontend.json", from: "frontend" });
    });

    it("skips qa_report.json and non-json files", async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify(validState()));
      await mgr.start();

      mockReaddir.mockResolvedValueOnce(["qa_report.json", "notes.md"]);
      const handoffs = await mgr.getHandoffs();
      expect(handoffs).toHaveLength(0);
    });

    it("handles readdir failure gracefully", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      await mgr.start();
      mockReaddir.mockRejectedValueOnce(new Error("ENOENT"));
      const handoffs = await mgr.getHandoffs();
      expect(handoffs).toEqual([]);
      warn.mockRestore();
    });

    it("skips files with invalid JSON", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockReadFile.mockResolvedValueOnce(JSON.stringify(validState()));
      await mgr.start();

      mockReaddir.mockResolvedValueOnce(["bad.json"]);
      mockReadFile.mockResolvedValueOnce("not-json");

      const handoffs = await mgr.getHandoffs();
      expect(handoffs).toHaveLength(0);
      warn.mockRestore();
    });
  });

  describe("getQaReport", () => {
    it("returns parsed QA report", async () => {
      const report = { timestamp: "2026-04-01", health_score: 85, bugs: [], passed_flows: ["login"] };
      mockReadFile
        .mockResolvedValueOnce(JSON.stringify(validState()))
        .mockResolvedValueOnce(JSON.stringify(report));

      await mgr.start();
      const result = await mgr.getQaReport();
      expect(result).toMatchObject({ health_score: 85 });
    });

    it("returns null for missing qa_report.json", async () => {
      await mgr.start();
      expect(await mgr.getQaReport()).toBeNull();
    });

    it("returns null for corrupt qa_report.json", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockReadFile
        .mockResolvedValueOnce(JSON.stringify(validState()))
        .mockResolvedValueOnce("{bad");

      await mgr.start();
      expect(await mgr.getQaReport()).toBeNull();
      warn.mockRestore();
    });
  });

  describe("getArchivedSprints", () => {
    it("returns archived sprints sorted newest-first", async () => {
      await mgr.start();
      mockReaddir.mockResolvedValueOnce(["2026-03-01-sprint-a.md", "2026-04-01-sprint-b.md", ".gitkeep"]);
      mockReadFile
        .mockResolvedValueOnce("# Sprint A")
        .mockResolvedValueOnce("# Sprint B");

      const archived = await mgr.getArchivedSprints();
      expect(archived).toHaveLength(2);
      expect(archived[0].name).toBe("2026-04-01-sprint-b");
      expect(archived[1].name).toBe("2026-03-01-sprint-a");
    });

    it("returns empty array on readdir failure", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      await mgr.start();
      mockReaddir.mockRejectedValueOnce(new Error("ENOENT"));
      expect(await mgr.getArchivedSprints()).toEqual([]);
      warn.mockRestore();
    });
  });

  describe("approveGate", () => {
    it("advances gate from not_started to in_progress", async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify(validState()));
      await mgr.start();

      const spy = vi.fn();
      mgr.on("sprint-update", spy);

      const result = await mgr.approveGate("qa");
      expect(result.gates.qa).toBe("in_progress");
      expect(spy).toHaveBeenCalledOnce();
    });

    it("advances gate from in_progress to passed", async () => {
      mockReadFile.mockResolvedValueOnce(
        JSON.stringify(validState({ gates: { qa: "in_progress" } })),
      );
      await mgr.start();
      const result = await mgr.approveGate("qa");
      expect(result.gates.qa).toBe("passed");
    });

    it("persists state atomically (tmp + rename)", async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify(validState()));
      await mgr.start();
      await mgr.approveGate("qa");

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining("state.json.tmp"),
        expect.any(String),
        "utf-8",
      );
      expect(mockRename).toHaveBeenCalledWith(
        expect.stringContaining("state.json.tmp"),
        expect.stringContaining("state.json"),
      );
    });
  });

  describe("state transitions", () => {
    it("pause: in_progress -> paused", async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify(validState()));
      await mgr.start();

      const spy = vi.fn();
      mgr.on("sprint-update", spy);
      const result = await mgr.pause();
      expect(result.status).toBe("paused");
      expect(spy).toHaveBeenCalledOnce();
    });

    it("pause throws from invalid state", async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify(validState({ status: "completed" })));
      await mgr.start();
      await expect(mgr.pause()).rejects.toThrow('Cannot transition to "paused" from "completed"');
    });

    it("resume: paused -> in_progress", async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify(validState({ status: "paused" })));
      await mgr.start();
      const result = await mgr.resume();
      expect(result.status).toBe("in_progress");
    });

    it("resume throws from invalid state", async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify(validState()));
      await mgr.start();
      await expect(mgr.resume()).rejects.toThrow('Cannot transition to "in_progress" from "in_progress"');
    });

    it("cancel: in_progress -> cancelled with completedAt", async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify(validState()));
      await mgr.start();
      const result = await mgr.cancel();
      expect(result.status).toBe("cancelled");
      expect(result.completedAt).toBeDefined();
    });

    it("cancel from planned works", async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify(validState({ status: "planned" })));
      await mgr.start();
      const result = await mgr.cancel();
      expect(result.status).toBe("cancelled");
    });

    it("cancel throws from completed", async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify(validState({ status: "completed" })));
      await mgr.start();
      await expect(mgr.cancel()).rejects.toThrow('Cannot transition to "cancelled" from "completed"');
    });

    it("cancel throws from failed", async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify(validState({ status: "failed" })));
      await mgr.start();
      await expect(mgr.cancel()).rejects.toThrow('Cannot transition to "cancelled" from "failed"');
    });
  });

  describe("file change events", () => {
    it("emits sprint-update when state.json changes", async () => {
      vi.useFakeTimers();
      mockReadFile.mockResolvedValueOnce(JSON.stringify(validState()));
      await mgr.start();

      const handler = mockWatcherOn.mock.calls.find((c) => c[0] === "all")?.[1];
      expect(handler).toBeDefined();

      const spy = vi.fn();
      mgr.on("sprint-update", spy);

      // Prepare state for reload
      mockReadFile.mockResolvedValueOnce(
        JSON.stringify(validState({ status: "completed" })),
      );

      // Trigger the file change handler
      handler("change", "/fake/ai-agents/sprints/state.json");

      // The handler is debounced at 500ms
      await vi.advanceTimersByTimeAsync(600);
      expect(spy).toHaveBeenCalledOnce();
      vi.useRealTimers();
    });

    it("emits sprint-spec-update when current.md changes", async () => {
      vi.useFakeTimers();
      mockReadFile.mockResolvedValueOnce(JSON.stringify(validState()));
      await mgr.start();

      const handler = mockWatcherOn.mock.calls.find((c) => c[0] === "all")?.[1];
      const spy = vi.fn();
      mgr.on("sprint-spec-update", spy);

      mockReadFile.mockResolvedValueOnce("# Updated spec");
      handler("change", "/fake/ai-agents/sprints/current.md");

      await vi.advanceTimersByTimeAsync(600);
      expect(spy).toHaveBeenCalledOnce();
      vi.useRealTimers();
    });

    it("emits handoff-update for files in handoffs/", async () => {
      vi.useFakeTimers();
      mockReadFile.mockResolvedValueOnce(JSON.stringify(validState()));
      await mgr.start();

      const handler = mockWatcherOn.mock.calls.find((c) => c[0] === "all")?.[1];
      const spy = vi.fn();
      mgr.on("handoff-update", spy);

      mockReadFile.mockResolvedValueOnce('{"from":"frontend"}');
      handler("add", "/fake/ai-agents/sprints/handoffs/frontend.json");

      await vi.advanceTimersByTimeAsync(600);
      expect(spy).toHaveBeenCalledOnce();
      expect(spy.mock.calls[0][0]).toMatchObject({ file: "frontend.json" });
      vi.useRealTimers();
    });

    it("debounces rapid file changes", async () => {
      vi.useFakeTimers();
      mockReadFile.mockResolvedValueOnce(JSON.stringify(validState()));
      await mgr.start();

      const handler = mockWatcherOn.mock.calls.find((c) => c[0] === "all")?.[1];
      const spy = vi.fn();
      mgr.on("sprint-update", spy);

      mockReadFile.mockResolvedValue(JSON.stringify(validState()));

      // Fire 5 rapid changes
      for (let i = 0; i < 5; i++) {
        handler("change", "/fake/ai-agents/sprints/state.json");
      }

      await vi.advanceTimersByTimeAsync(600);
      // Only one event should fire (debounced)
      expect(spy).toHaveBeenCalledOnce();
      vi.useRealTimers();
    });
  });
});
