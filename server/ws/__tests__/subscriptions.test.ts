/**
 * Tests for ws/subscriptions topic parsing + inferTopic routing.
 *
 * These are characterisation tests: where the spec was ambiguous (e.g. which
 * payload id wins for sprint-update), the test pins the CURRENT behaviour
 * documented in subscriptions.ts so future refactors are intentional.
 */

import { describe, it, expect } from "vitest";
import { parseControlFrame, inferTopic, isValidTopic, GLOBAL_TOPIC } from "../subscriptions.js";

describe("parseControlFrame", () => {
  it("accepts a valid subscribe frame for a room topic", () => {
    expect(parseControlFrame({ op: "subscribe", topic: "room:abc" })).toEqual({
      op: "subscribe",
      topic: "room:abc",
    });
  });

  it("accepts a valid unsubscribe frame for a terminal topic", () => {
    expect(parseControlFrame({ op: "unsubscribe", topic: "terminal:sess_123" })).toEqual({
      op: "unsubscribe",
      topic: "terminal:sess_123",
    });
  });

  it("accepts the literal `global` topic", () => {
    expect(parseControlFrame({ op: "subscribe", topic: "global" })).toEqual({
      op: "subscribe",
      topic: "global",
    });
  });

  it("rejects an invalid topic prefix (`foo:bar`)", () => {
    expect(parseControlFrame({ op: "subscribe", topic: "foo:bar" })).toBeNull();
  });

  it("rejects an unknown op", () => {
    expect(parseControlFrame({ op: "publish", topic: "room:abc" })).toBeNull();
  });

  it("rejects non-objects", () => {
    expect(parseControlFrame(null)).toBeNull();
    expect(parseControlFrame(undefined)).toBeNull();
    expect(parseControlFrame("subscribe")).toBeNull();
    expect(parseControlFrame(42)).toBeNull();
  });

  it("rejects missing topic", () => {
    expect(parseControlFrame({ op: "subscribe" })).toBeNull();
  });
});

describe("isValidTopic", () => {
  it("accepts allowlisted topic prefixes", () => {
    expect(isValidTopic("terminal:abc")).toBe(true);
    expect(isValidTopic("room:abc")).toBe(true);
    expect(isValidTopic("sprint:abc")).toBe(true);
    expect(isValidTopic("global")).toBe(true);
  });

  it("rejects unknown prefixes and malformed input", () => {
    expect(isValidTopic("foo:bar")).toBe(false);
    expect(isValidTopic("terminal:")).toBe(false);
    expect(isValidTopic("terminal")).toBe(false);
    expect(isValidTopic("")).toBe(false);
    expect(isValidTopic(undefined)).toBe(false);
    expect(isValidTopic(123)).toBe(false);
  });
});

describe("inferTopic", () => {
  // ---- terminal-* ----
  it("routes terminal-data with sessionId → terminal:<id>", () => {
    expect(inferTopic({ type: "terminal-data", sessionId: "sess_abc", data: "x" })).toBe(
      "terminal:sess_abc",
    );
  });

  it("falls back to global for terminal-data missing sessionId", () => {
    expect(inferTopic({ type: "terminal-data" })).toBe(GLOBAL_TOPIC);
  });

  // ---- room-* ----
  it("routes room-message with payload.roomId → room:<id>", () => {
    expect(
      inferTopic({
        type: "room-message",
        payload: { roomId: "room_42", text: "hi" },
      }),
    ).toBe("room:room_42");
  });

  it("routes room-agent-status with payload.roomId → room:<id>", () => {
    expect(
      inferTopic({
        type: "room-agent-status",
        payload: { roomId: "room_xyz", agentId: "a1", status: "idle" },
      }),
    ).toBe("room:room_xyz");
  });

  it("falls back to global for room-* missing roomId", () => {
    expect(inferTopic({ type: "room-message", payload: {} })).toBe(GLOBAL_TOPIC);
    expect(inferTopic({ type: "room-message" })).toBe(GLOBAL_TOPIC);
  });

  // ---- workflow-* / sprint-update ----
  // H2: when both workflowId+runId are present, the topic is the
  // composite `<workflowId>-<runId>` id used by the UI (sprints-view.tsx
  // subscribes to `sprint:${selectedSprintId}` where selectedSprintId is
  // `<flowId>-<runId>` from flowsToSprints). Otherwise fall back to
  // sprintId, then runId, then workflowId.
  it("routes workflow-step-update with runId+workflowId → composite sprint:<workflowId>-<runId>", () => {
    expect(
      inferTopic({
        type: "workflow-step-update",
        payload: { workflowId: "wf_1", runId: "run_99", stepId: "s1" },
      }),
    ).toBe("sprint:wf_1-run_99");
  });

  it("routes workflow-step-update with only runId → sprint:<runId>", () => {
    expect(
      inferTopic({
        type: "workflow-step-update",
        payload: { runId: "run_99", stepId: "s1" },
      }),
    ).toBe("sprint:run_99");
  });

  it("routes sprint-update with sprintId → sprint:<sprintId> (sprintId wins over runId)", () => {
    expect(
      inferTopic({
        type: "sprint-update",
        payload: { sprintId: "spr_1", runId: "run_99" },
      }),
    ).toBe("sprint:spr_1");
  });

  it("routes workflow-* with only workflowId → sprint:<workflowId>", () => {
    expect(
      inferTopic({
        type: "workflow-gate-waiting",
        payload: { workflowId: "wf_only" },
      }),
    ).toBe("sprint:wf_only");
  });

  it("workflow-update with array payload stays global (no single id)", () => {
    expect(
      inferTopic({
        type: "workflow-update",
        payload: [{ id: "s1" }, { id: "s2" }],
      }),
    ).toBe(GLOBAL_TOPIC);
  });

  it("falls back to global for sprint-update missing all ids", () => {
    expect(inferTopic({ type: "sprint-update", payload: {} })).toBe(GLOBAL_TOPIC);
    expect(inferTopic({ type: "sprint-update" })).toBe(GLOBAL_TOPIC);
  });

  // ---- system-wide types ----
  it("routes usage-update / git-update / sessions-update → global", () => {
    expect(inferTopic({ type: "usage-update", payload: {} })).toBe(GLOBAL_TOPIC);
    expect(inferTopic({ type: "git-update", payload: {} })).toBe(GLOBAL_TOPIC);
    expect(inferTopic({ type: "sessions-update", payload: [] })).toBe(GLOBAL_TOPIC);
  });

  it("routes unknown / undefined type → global", () => {
    expect(inferTopic({ type: "totally-made-up-type" })).toBe(GLOBAL_TOPIC);
    expect(inferTopic({})).toBe(GLOBAL_TOPIC);
    expect(inferTopic(null)).toBe(GLOBAL_TOPIC);
    expect(inferTopic("string")).toBe(GLOBAL_TOPIC);
  });
});
