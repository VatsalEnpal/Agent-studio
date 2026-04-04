// server/sdk-session.ts
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { EventEmitter } from "events";
import { randomUUID } from "node:crypto";

export interface SdkSession {
  agentId: string;
  roomId: string;
  sessionId: string;       // Claude Code session ID for --resume
  cwd: string;
  model: string;
  agentProfile?: string;   // --agent flag value
  busy: boolean;
  activeQuery: ReturnType<typeof query> | null;
}

export interface SdkSessionCallbacks {
  onTypingStart: (agentId: string) => void;
  onTextDelta: (agentId: string, delta: string) => void;
  onResult: (agentId: string, text: string, usage?: { totalCostUsd: number; inputTokens: number; outputTokens: number }) => void;
  onError: (agentId: string, err: Error) => void;
  onIdle: (agentId: string) => void;
}

export class SdkSessionManager extends EventEmitter {
  private sessions = new Map<string, SdkSession>();
  private messageQueues = new Map<string, string[]>(); // agentId -> queued prompts

  createSession(opts: {
    agentId: string;
    roomId: string;
    cwd: string;
    model: string;
    agentProfile?: string;
  }): SdkSession {
    const session: SdkSession = {
      agentId: opts.agentId,
      roomId: opts.roomId,
      sessionId: "", // Set after first query returns a session_id
      cwd: opts.cwd,
      model: opts.model,
      agentProfile: opts.agentProfile,
      busy: false,
      activeQuery: null,
    };
    this.sessions.set(opts.agentId, session);
    this.messageQueues.set(opts.agentId, []);
    return session;
  }

  getSession(agentId: string): SdkSession | undefined {
    return this.sessions.get(agentId);
  }

  async sendMessage(agentId: string, prompt: string, callbacks: SdkSessionCallbacks): Promise<void> {
    const session = this.sessions.get(agentId);
    if (!session) {
      callbacks.onError(agentId, new Error(`No SDK session for agent ${agentId}`));
      return;
    }

    if (session.busy) {
      // Queue the message — process after current query completes
      const queue = this.messageQueues.get(agentId) ?? [];
      queue.push(prompt);
      this.messageQueues.set(agentId, queue);
      return;
    }

    await this.executeQuery(session, prompt, callbacks);
  }

  private async executeQuery(session: SdkSession, prompt: string, callbacks: SdkSessionCallbacks): Promise<void> {
    session.busy = true;
    callbacks.onTypingStart(session.agentId);

    try {
      const options: Record<string, unknown> = {
        model: this.resolveModel(session.model),
        cwd: session.cwd,
        permissionMode: "bypassPermissions" as const,
        allowDangerouslySkipPermissions: true,
        includePartialMessages: true,
      };

      // Resume existing conversation if we have a sessionId
      if (session.sessionId) {
        options.resume = session.sessionId;
      }

      // Use --agent flag if specified
      if (session.agentProfile && session.agentProfile !== "none") {
        options.agent = session.agentProfile;
      }

      const conversation = query({ prompt, options: options as any });
      session.activeQuery = conversation;

      let accumulatedText = "";

      for await (const message of conversation) {
        // Capture session ID from first message
        if (!session.sessionId && (message as any).session_id) {
          session.sessionId = (message as any).session_id;
        }

        if (message.type === "stream_event") {
          // Extract text deltas from streaming events
          const event = (message as any).event;
          if (event?.type === "content_block_delta" && event?.delta?.type === "text_delta") {
            const delta = event.delta.text ?? "";
            accumulatedText += delta;
            callbacks.onTextDelta(session.agentId, delta);
          }
        }

        if (message.type === "result") {
          if (message.subtype === "success") {
            const resultMsg = message as any;
            const finalText = resultMsg.result ?? accumulatedText;
            callbacks.onResult(session.agentId, finalText, {
              totalCostUsd: resultMsg.total_cost_usd ?? 0,
              inputTokens: resultMsg.usage?.input_tokens ?? 0,
              outputTokens: resultMsg.usage?.output_tokens ?? 0,
            });
          } else {
            // Error result
            callbacks.onError(session.agentId, new Error(`Agent query failed: ${message.subtype}`));
          }
        }
      }
    } catch (err) {
      callbacks.onError(session.agentId, err instanceof Error ? err : new Error(String(err)));
    } finally {
      session.busy = false;
      session.activeQuery = null;
      callbacks.onIdle(session.agentId);

      // Process queued messages
      const queue = this.messageQueues.get(session.agentId) ?? [];
      if (queue.length > 0) {
        const nextPrompt = queue.shift()!;
        this.messageQueues.set(session.agentId, queue);
        // Fire-and-forget — don't await, so the current call can return
        this.executeQuery(session, nextPrompt, callbacks).catch((err) => {
          callbacks.onError(session.agentId, err instanceof Error ? err : new Error(String(err)));
        });
      }
    }
  }

  interruptAgent(agentId: string): void {
    const session = this.sessions.get(agentId);
    if (!session) return;
    // Clear pending queue so no queued message fires after the interrupt
    this.messageQueues.set(agentId, []);
    // Abort active query
    if (session.activeQuery) {
      session.activeQuery.close();
      session.activeQuery = null;
    }
    session.busy = false;
  }

  destroySession(agentId: string): void {
    this.interruptAgent(agentId);
    this.sessions.delete(agentId);
    this.messageQueues.delete(agentId);
  }

  destroyAll(): string[] {
    const agentIds = [...this.sessions.keys()];
    for (const id of agentIds) {
      this.destroySession(id);
    }
    return agentIds;
  }

  private resolveModel(model: string): string {
    switch (model) {
      case "opus": return "claude-opus-4-6";
      case "sonnet": return "claude-sonnet-4-6";
      case "haiku": return "claude-haiku-4-5-20251001";
      default: return model;
    }
  }
}
