import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConversationProtocol, parseMentions, type ProtocolAgent, type InvokeCallback } from "../conversation-protocol.js";

const agents: ProtocolAgent[] = [
  { id: "frontend", name: "Frontend" },
  { id: "backend", name: "Backend" },
  { id: "qa", name: "QA" },
];

describe("parseMentions", () => {
  it("extracts single mention", () => {
    expect(parseMentions("hey @frontend please fix this")).toEqual(["frontend"]);
  });

  it("extracts multiple mentions", () => {
    expect(parseMentions("@frontend and @backend work together")).toEqual(["frontend", "backend"]);
  });

  it("deduplicates mentions", () => {
    expect(parseMentions("@frontend @frontend")).toEqual(["frontend"]);
  });

  it("returns empty for no mentions", () => {
    expect(parseMentions("no mentions here")).toEqual([]);
  });

  it("lowercases mentions", () => {
    expect(parseMentions("@Frontend")).toEqual(["frontend"]);
  });

  it("handles @all", () => {
    expect(parseMentions("@all do something")).toEqual(["all"]);
  });
});

describe("ConversationProtocol", () => {
  let invoke: ReturnType<typeof vi.fn<InvokeCallback>>;
  let onDepthLimit: ReturnType<typeof vi.fn<() => void>>;
  let onError: ReturnType<typeof vi.fn<(error: Error) => void>>;
  let protocol: ConversationProtocol;

  beforeEach(() => {
    invoke = vi.fn<InvokeCallback>();
    onDepthLimit = vi.fn<() => void>();
    onError = vi.fn<(error: Error) => void>();
    protocol = new ConversationProtocol(agents, invoke, onDepthLimit, onError);
  });

  describe("humanMessage", () => {
    it("routes to mentioned agent", () => {
      protocol.humanMessage("@frontend build the page");
      expect(invoke).toHaveBeenCalledWith("frontend", "@frontend build the page");
      expect(protocol.activeAgent).toBe("frontend");
    });

    it("uses defaultTarget when no mention", () => {
      protocol.humanMessage("fix this bug", "backend");
      expect(invoke).toHaveBeenCalledWith("backend", "fix this bug");
    });

    it("does nothing when no mention and no default target", () => {
      protocol.humanMessage("hello world");
      expect(invoke).not.toHaveBeenCalled();
    });

    it("errors on invalid default target", () => {
      protocol.humanMessage("hello", "nonexistent");
      expect(onError).toHaveBeenCalledOnce();
    });

    it("broadcasts to all agents with @all", () => {
      protocol.humanMessage("@all status report");
      expect(invoke).toHaveBeenCalledOnce();
      // First agent invoked, rest queued
      expect(invoke.mock.calls[0][0]).toBe("frontend");
      expect(protocol.queueLength).toBe(2);
    });

    it("queues multiple mentioned agents and invokes first", () => {
      protocol.humanMessage("@frontend @backend pair on this");
      expect(invoke).toHaveBeenCalledOnce();
      expect(invoke.mock.calls[0][0]).toBe("frontend");
      expect(protocol.queueLength).toBe(1);
    });

    it("resets chain depth and queue on new human message", () => {
      // Start a chain
      protocol.humanMessage("@frontend do something");
      // Simulate agent response that chains to backend
      protocol.handleAgentResponse("frontend", "@backend your turn");
      // Human message should reset everything
      protocol.humanMessage("@qa run tests");
      expect(protocol.queueLength).toBe(0);
    });
  });

  describe("handleAgentResponse", () => {
    it("chains to mentioned agent in response", () => {
      protocol.humanMessage("@frontend start");
      invoke.mockClear();

      protocol.handleAgentResponse("frontend", "@backend continue");
      expect(invoke).toHaveBeenCalledWith("backend", "@backend continue");
    });

    it("prevents self-loops", () => {
      protocol.humanMessage("@frontend start");
      invoke.mockClear();

      protocol.handleAgentResponse("frontend", "@frontend loop back");
      expect(invoke).not.toHaveBeenCalled();
    });

    it("drains queued items after agent finishes", () => {
      protocol.humanMessage("@frontend @backend @qa go");
      invoke.mockClear();

      protocol.handleAgentResponse("frontend", "done");
      expect(invoke).toHaveBeenCalledWith("backend", "@frontend @backend @qa go");
    });

    it("triggers depth limit after 10 chained turns", () => {
      protocol.humanMessage("@frontend start");

      for (let i = 0; i < 10; i++) {
        const currentAgent = i % 2 === 0 ? "frontend" : "backend";
        const nextAgent = i % 2 === 0 ? "backend" : "frontend";
        protocol.handleAgentResponse(currentAgent, `@${nextAgent} keep going`);
      }

      expect(onDepthLimit).toHaveBeenCalledOnce();
    });
  });

  describe("pause / resume", () => {
    it("pauses prevents queue drain", () => {
      protocol.humanMessage("@frontend @backend go");
      invoke.mockClear();

      protocol.pause();
      expect(protocol.isPaused).toBe(true);

      protocol.handleAgentResponse("frontend", "done");
      expect(invoke).not.toHaveBeenCalled();
    });

    it("resume drains queued invocations", () => {
      protocol.humanMessage("@frontend @backend go");
      invoke.mockClear();

      protocol.pause();
      protocol.handleAgentResponse("frontend", "done");
      expect(invoke).not.toHaveBeenCalled();

      protocol.resume();
      expect(protocol.isPaused).toBe(false);
      expect(invoke).toHaveBeenCalledOnce();
    });
  });

  describe("name-based mention resolution", () => {
    it("resolves agent by name (case-insensitive)", () => {
      protocol.humanMessage("@qa check this");
      expect(invoke).toHaveBeenCalledWith("qa", "@qa check this");
    });
  });
});
