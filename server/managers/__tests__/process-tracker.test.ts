import { describe, it, expect, beforeEach, vi } from "vitest";
import { ProcessTracker } from "../process-tracker.js";

// Stub tree-kill so tests don't actually kill processes
vi.mock("tree-kill", () => ({
  default: vi.fn((pid: number, signal: string, cb: (err?: Error) => void) => {
    cb();
  }),
}));

describe("ProcessTracker", () => {
  let tracker: ProcessTracker;

  beforeEach(() => {
    tracker = new ProcessTracker();
  });

  describe("track / untrack / list / size", () => {
    it("tracks a process and returns it via list()", () => {
      tracker.track("agent-a", 1234);
      const list = tracker.list();
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ name: "agent-a", pid: 1234 });
      expect(typeof list[0].trackedAt).toBe("number");
    });

    it("reports correct size", () => {
      expect(tracker.size).toBe(0);
      tracker.track("a", 1);
      tracker.track("b", 2);
      expect(tracker.size).toBe(2);
    });

    it("overwrites an entry when tracking the same name", () => {
      tracker.track("a", 1);
      tracker.track("a", 2);
      expect(tracker.size).toBe(1);
      expect(tracker.list()[0].pid).toBe(2);
    });

    it("untracks a process", () => {
      tracker.track("a", 1);
      tracker.untrack("a");
      expect(tracker.size).toBe(0);
    });

    it("untrack on unknown name is a no-op", () => {
      tracker.untrack("nonexistent");
      expect(tracker.size).toBe(0);
    });

    it("list returns a copy, not the internal collection", () => {
      tracker.track("a", 1);
      const list1 = tracker.list();
      const list2 = tracker.list();
      expect(list1).not.toBe(list2);
    });
  });

  describe("isAlive", () => {
    it("returns false for unknown process", () => {
      expect(tracker.isAlive("ghost")).toBe(false);
    });

    it("returns true for the current process (known to be alive)", () => {
      tracker.track("self", process.pid);
      expect(tracker.isAlive("self")).toBe(true);
    });

    it("returns false for a bogus PID", () => {
      tracker.track("dead", 999999999);
      expect(tracker.isAlive("dead")).toBe(false);
    });
  });

  describe("killAll", () => {
    it("clears all tracked processes after kill", async () => {
      tracker.track("a", process.pid);
      tracker.track("b", process.pid);
      const results = await tracker.killAll();
      expect(results).toHaveLength(2);
      expect(tracker.size).toBe(0);
    });

    it("returns empty array when nothing is tracked", async () => {
      const results = await tracker.killAll();
      expect(results).toHaveLength(0);
    });
  });
});
