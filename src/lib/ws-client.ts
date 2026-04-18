import type { WsMessage } from "./types";

type MessageHandler = (msg: WsMessage) => void;

export type ConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting";
type ConnectionHandler = (state: ConnectionState) => void;

/**
 * Grammar for topic strings recognised by the server. Keep in sync with
 * server/ws/subscriptions.ts → TOPIC_RE.
 */
const TOPIC_RE = /^(?:(?:terminal|room|sprint):[A-Za-z0-9_-]+|global)$/;

class WsClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<MessageHandler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private url: string | null = null;
  private intentionalClose = false;
  private pendingMessages: string[] = [];
  private connected = false;
  private connectionState: ConnectionState = "disconnected";
  private connectionHandlers = new Set<ConnectionHandler>();
  private reconnectAttempts = 0;
  /**
   * Topics this client wants to stay subscribed to. Kept across
   * reconnects so a transient disconnect doesn't silently drop
   * room/sprint/terminal feeds.
   */
  private desiredTopics = new Set<string>();

  private setConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    for (const handler of this.connectionHandlers) {
      handler(state);
    }
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  onConnectionChange(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler);
    return () => {
      this.connectionHandlers.delete(handler);
    };
  }

  connect(url: string): void {
    // If already connected to the same URL, don't reconnect
    if (this.url === url && this.ws && this.ws.readyState <= WebSocket.OPEN) {
      return;
    }

    this.url = url;
    this.intentionalClose = false;
    this.reconnectAttempts = 0;
    this.setConnectionState("connecting");
    this.createConnection();
  }

  private createConnection(): void {
    if (!this.url) return;

    // Close existing connection if any
    if (this.ws) {
      try {
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        this.ws.close();
      } catch (e) {
        console.error("Failed to close existing WebSocket connection:", e);
      }
    }

    this.connected = false;
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.setConnectionState("connected");

      // Replay desired topic subscriptions. Server defaults every new
      // connection to `global`, so we only need to re-send explicit ones.
      for (const topic of this.desiredTopics) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ op: "subscribe", topic }));
        }
      }

      // Flush pending messages
      for (const raw of this.pendingMessages) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(raw);
        }
      }
      this.pendingMessages = [];
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const msg: WsMessage = JSON.parse(event.data as string);
        const typeHandlers = this.handlers.get(msg.type);
        if (typeHandlers) {
          for (const handler of typeHandlers) {
            handler(msg);
          }
        }
      } catch (e) {
        console.error("Failed to parse WebSocket message:", e);
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      if (!this.intentionalClose && this.url) {
        this.reconnectAttempts++;
        this.setConnectionState("reconnecting");
        const delay = Math.min(2000 * Math.pow(1.5, this.reconnectAttempts - 1), 15000);
        this.reconnectTimer = setTimeout(() => {
          this.createConnection();
        }, delay);
      } else {
        this.setConnectionState("disconnected");
      }
    };

    this.ws.onerror = () => {
      // Error will trigger onclose, which handles reconnect
    };
  }

  send(msg: WsMessage): void {
    const raw = JSON.stringify(msg);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(raw);
    } else {
      // Queue for when connection opens
      this.pendingMessages.push(raw);
    }
  }

  on(type: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);

    return () => {
      const typeHandlers = this.handlers.get(type);
      if (typeHandlers) {
        typeHandlers.delete(handler);
        if (typeHandlers.size === 0) {
          this.handlers.delete(type);
        }
      }
    };
  }

  /**
   * Subscribe this connection to a server topic (e.g. `room:abc`,
   * `sprint:run-123`, `terminal:sess-1`). The server filters outgoing
   * frames so only subscribed clients receive topic-scoped events.
   * `global` is already subscribed server-side by default — don't send it.
   *
   * The topic is remembered and replayed on reconnect.
   * Returns a cleanup function that unsubscribes.
   */
  subscribeTopic(topic: string): () => void {
    if (!TOPIC_RE.test(topic)) {
      console.warn(`[ws-client] refusing to subscribe to invalid topic: ${topic}`);
      return () => {};
    }
    this.desiredTopics.add(topic);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ op: "subscribe", topic }));
    }
    // Cleanup unsubscribes — safe to call multiple times
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.unsubscribeTopic(topic);
    };
  }

  /** Unsubscribe from a server topic. Also removes from reconnect replay. */
  unsubscribeTopic(topic: string): void {
    if (!TOPIC_RE.test(topic)) return;
    this.desiredTopics.delete(topic);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ op: "unsubscribe", topic }));
    }
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.connected = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }
    // Do NOT clear handlers here. Handlers are managed by
    // individual component unsubscribes. Clearing them all on
    // disconnect breaks React Strict Mode (dev double-mount).
    this.pendingMessages = [];
  }
}

export const wsClient = new WsClient();
