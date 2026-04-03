import { describe, it, expect, vi, beforeEach } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { broadcast, sendTo } from "../broadcast";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockClient(
  overrides: Partial<{
    readyState: number;
    bufferedAmount: number;
    send: ReturnType<typeof vi.fn>;
  }> = {},
): WebSocket {
  return {
    readyState: WebSocket.OPEN,
    bufferedAmount: 0,
    send: vi.fn(),
    ...overrides,
  } as unknown as WebSocket;
}

function createMockWss(clients: WebSocket[]): WebSocketServer {
  return {
    clients: new Set(clients),
  } as unknown as WebSocketServer;
}

// ---------------------------------------------------------------------------
// broadcast()
// ---------------------------------------------------------------------------

describe("broadcast", () => {
  it("sends JSON to all OPEN clients", () => {
    const c1 = createMockClient();
    const c2 = createMockClient();
    const wss = createMockWss([c1, c2]);

    broadcast(wss, { type: "ping" });

    const expected = JSON.stringify({ type: "ping" });
    expect(c1.send).toHaveBeenCalledWith(expected);
    expect(c2.send).toHaveBeenCalledWith(expected);
  });

  it("skips clients that are not OPEN", () => {
    const open = createMockClient();
    const closing = createMockClient({ readyState: WebSocket.CLOSING });
    const closed = createMockClient({ readyState: WebSocket.CLOSED });
    const connecting = createMockClient({ readyState: WebSocket.CONNECTING });
    const wss = createMockWss([open, closing, closed, connecting]);

    broadcast(wss, "hello");

    expect(open.send).toHaveBeenCalledOnce();
    expect(closing.send).not.toHaveBeenCalled();
    expect(closed.send).not.toHaveBeenCalled();
    expect(connecting.send).not.toHaveBeenCalled();
  });

  it("skips clients with bufferedAmount exceeding 1 MB", () => {
    const normal = createMockClient({ bufferedAmount: 0 });
    const backpressured = createMockClient({
      bufferedAmount: 1024 * 1024 + 1,
    });
    const atLimit = createMockClient({ bufferedAmount: 1024 * 1024 });
    const wss = createMockWss([normal, backpressured, atLimit]);

    broadcast(wss, { data: "test" });

    expect(normal.send).toHaveBeenCalledOnce();
    expect(backpressured.send).not.toHaveBeenCalled();
    // At exactly the limit the check is `>` not `>=`, so it still sends
    expect(atLimit.send).toHaveBeenCalledOnce();
  });

  it("continues broadcasting if one client throws", () => {
    const throwing = createMockClient({
      send: vi.fn(() => {
        throw new Error("connection reset");
      }),
    });
    const healthy = createMockClient();
    const wss = createMockWss([throwing, healthy]);

    // Should not throw
    expect(() => broadcast(wss, { type: "update" })).not.toThrow();

    expect(throwing.send).toHaveBeenCalledOnce();
    expect(healthy.send).toHaveBeenCalledOnce();
  });

  it("handles empty client set", () => {
    const wss = createMockWss([]);
    expect(() => broadcast(wss, "no-one-listening")).not.toThrow();
  });

  it("serializes various JSON types correctly", () => {
    const client = createMockClient();
    const wss = createMockWss([client]);

    broadcast(wss, "plain string");
    expect(client.send).toHaveBeenLastCalledWith(JSON.stringify("plain string"));

    broadcast(wss, 42);
    expect(client.send).toHaveBeenLastCalledWith("42");

    broadcast(wss, [1, 2, 3]);
    expect(client.send).toHaveBeenLastCalledWith("[1,2,3]");

    broadcast(wss, null);
    expect(client.send).toHaveBeenLastCalledWith("null");
  });
});

// ---------------------------------------------------------------------------
// sendTo()
// ---------------------------------------------------------------------------

describe("sendTo", () => {
  it("sends JSON to an OPEN client", () => {
    const client = createMockClient();
    sendTo(client, { type: "hello" });
    expect(client.send).toHaveBeenCalledWith(JSON.stringify({ type: "hello" }));
  });

  it("does not send if client is not OPEN", () => {
    const closing = createMockClient({ readyState: WebSocket.CLOSING });
    sendTo(closing, "data");
    expect(closing.send).not.toHaveBeenCalled();
  });

  it("does not throw if client.send throws", () => {
    const broken = createMockClient({
      send: vi.fn(() => {
        throw new Error("broken pipe");
      }),
    });
    expect(() => sendTo(broken, "test")).not.toThrow();
  });
});
