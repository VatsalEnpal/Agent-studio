import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { processStreamEvents, type FilterCallbacks, type FilteredResult, type ToolActivity } from "../message-filter.js";

function makeCallbacks() {
  return {
    onTypingStart: vi.fn(),
    onActivity: vi.fn(),
    onResult: vi.fn(),
    onError: vi.fn(),
  } satisfies FilterCallbacks;
}

/** Helper to build an async iterable from an array of events. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function* toStream(events: any[]): AsyncIterable<any> {
  for (const e of events) yield e;
}

describe("processStreamEvents", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("accumulates text_delta events and emits result", async () => {
    const cb = makeCallbacks();
    const events = [
      {
        type: "stream_event",
        event: { type: "content_block_delta", delta: { type: "text_delta", text: "Hello " } },
      },
      {
        type: "stream_event",
        event: { type: "content_block_delta", delta: { type: "text_delta", text: "world" } },
      },
      { type: "result", subtype: "success", result: undefined },
    ];

    await processStreamEvents("agent-1", toStream(events), cb);

    expect(cb.onTypingStart).toHaveBeenCalledOnce();
    expect(cb.onResult).toHaveBeenCalledOnce();
    const result = cb.onResult.mock.calls[0][0] as FilteredResult;
    expect(result.text).toBe("Hello world");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("uses result.result when subtype is success", async () => {
    const cb = makeCallbacks();
    const events = [
      {
        type: "stream_event",
        event: { type: "content_block_delta", delta: { type: "text_delta", text: "partial" } },
      },
      { type: "result", subtype: "success", result: "final answer" },
    ];

    await processStreamEvents("agent-1", toStream(events), cb);

    const result = cb.onResult.mock.calls[0][0] as FilteredResult;
    expect(result.text).toBe("final answer");
  });

  it("drops thinking events", async () => {
    const cb = makeCallbacks();
    const events = [
      { type: "stream_event", event: { type: "thinking" } },
      {
        type: "stream_event",
        event: { type: "content_block_delta", delta: { type: "thinking_delta", text: "hmm" } },
      },
      { type: "result", subtype: "success" },
    ];

    await processStreamEvents("agent-1", toStream(events), cb);

    expect(cb.onTypingStart).not.toHaveBeenCalled();
    const result = cb.onResult.mock.calls[0][0] as FilteredResult;
    expect(result.text).toBe("");
  });

  it("extracts tool activity from content_block_start", async () => {
    const cb = makeCallbacks();
    const events = [
      {
        type: "stream_event",
        event: {
          type: "content_block_start",
          content_block: { type: "tool_use", name: "Read", input: { file_path: "foo.ts", limit: 100 } },
        },
      },
      { type: "result", subtype: "success" },
    ];

    await processStreamEvents("agent-1", toStream(events), cb);

    expect(cb.onActivity).toHaveBeenCalledOnce();
    const activity = cb.onActivity.mock.calls[0][0] as ToolActivity;
    expect(activity.name).toBe("Read");
    // Only first arg should be extracted
    expect(activity.input).toEqual({ file_path: "foo.ts" });
  });

  it("drops input_json_delta events", async () => {
    const cb = makeCallbacks();
    const events = [
      {
        type: "stream_event",
        event: { type: "content_block_delta", delta: { type: "input_json_delta" } },
      },
      { type: "result", subtype: "success" },
    ];

    await processStreamEvents("agent-1", toStream(events), cb);

    const result = cb.onResult.mock.calls[0][0] as FilteredResult;
    expect(result.text).toBe("");
  });

  it("emits accumulated text when stream ends without result message", async () => {
    const cb = makeCallbacks();
    const events = [
      {
        type: "stream_event",
        event: { type: "content_block_delta", delta: { type: "text_delta", text: "orphan" } },
      },
    ];

    await processStreamEvents("agent-1", toStream(events), cb);

    expect(cb.onResult).toHaveBeenCalledOnce();
    const result = cb.onResult.mock.calls[0][0] as FilteredResult;
    expect(result.text).toBe("orphan");
  });

  it("calls onError for already-aborted signal", async () => {
    const cb = makeCallbacks();
    const ac = new AbortController();
    ac.abort();

    await processStreamEvents("agent-1", toStream([]), cb, ac.signal);

    expect(cb.onError).toHaveBeenCalledOnce();
    expect(cb.onError.mock.calls[0][0].message).toContain("already aborted");
  });

  it("calls onError when stream throws", async () => {
    const cb = makeCallbacks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async function* badStream(): AsyncIterable<any> {
      throw new Error("stream broke");
    }

    await processStreamEvents("agent-1", badStream(), cb);

    expect(cb.onError).toHaveBeenCalledOnce();
    expect(cb.onError.mock.calls[0][0].message).toBe("stream broke");
  });
});
