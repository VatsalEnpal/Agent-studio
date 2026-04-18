// server/sdk-session.ts
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { EventEmitter } from "events";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Claude CLI path resolution.
//
// The SDK spawns a Node subprocess from `pathToClaudeCodeExecutable`; it
// expects a JavaScript entrypoint (e.g. `cli.js`), NOT a native binary.
// Passing a native Mach-O/ELF binary makes Node fail with a parse error
// ("Claude Code native binary not found at ...").
//
// Resolution order (R1b fix):
//   1) CLAUDE_PATH env override — only honor it if it looks like a .js file.
//   2) @anthropic-ai/claude-code's bundled cli.js (if present — older v1.x
//      packages shipped it).
//   3) @anthropic-ai/claude-agent-sdk's own bundled cli.js — the SDK's
//      default fallback, which is what it uses when no path is passed.
//      We return it explicitly so the path is visible in logs.
//   4) If nothing is found, return null and let the SDK use its built-in
//      default (same as option 3, but without our explicit detection).
//
// We deliberately do NOT fall through to a native `claude` binary
// (~/.local/bin/claude, /opt/homebrew/bin/claude etc.) — those are native
// installer binaries that the SDK cannot execute as a Node script.
// ---------------------------------------------------------------------------

function resolveClaudeCliPath(): string | null {
  // 1) Explicit env override — only if it's a .js file the SDK can execute
  const envPath = process.env["CLAUDE_PATH"];
  if (envPath && existsSync(envPath) && envPath.endsWith(".js")) {
    return envPath;
  }

  // 2) @anthropic-ai/claude-code/cli.js (installed as production dep)
  const claudeCodeCli = join(
    process.cwd(),
    "node_modules",
    "@anthropic-ai",
    "claude-code",
    "cli.js",
  );
  if (existsSync(claudeCodeCli)) return claudeCodeCli;

  // 3) @anthropic-ai/claude-agent-sdk/cli.js (the SDK's bundled CLI — always
  //    present because `@anthropic-ai/claude-agent-sdk` is a direct dep).
  const sdkCli = join(process.cwd(), "node_modules", "@anthropic-ai", "claude-agent-sdk", "cli.js");
  if (existsSync(sdkCli)) return sdkCli;

  // 4) Nothing found — let the SDK use its own default (same as step 3
  //    resolved relative to the SDK's import.meta.url).
  return null;
}

const RESOLVED_CLAUDE_PATH: string | null = resolveClaudeCliPath();
if (RESOLVED_CLAUDE_PATH) {
  console.log(`[sdk-session] Using Claude CLI at: ${RESOLVED_CLAUDE_PATH}`);
} else {
  console.warn(
    "[sdk-session] Could not resolve `claude` CLI executable. " +
      "Room agents will fail until CLAUDE_PATH is set or `claude` is on PATH. " +
      "Install from https://claude.ai/code",
  );
}

export function getResolvedClaudePath(): string | null {
  return RESOLVED_CLAUDE_PATH;
}

export interface SdkSession {
  agentId: string;
  roomId: string;
  sessionId: string; // Claude Code session ID for --resume
  cwd: string;
  model: string;
  agentProfile?: string; // --agent flag value
  busy: boolean;
  activeQuery: ReturnType<typeof query> | null;
}

export interface SdkSessionCallbacks {
  onTypingStart: (agentId: string) => void;
  onTextDelta: (agentId: string, delta: string) => void;
  onResult: (
    agentId: string,
    text: string,
    usage?: { totalCostUsd: number; inputTokens: number; outputTokens: number },
  ) => void;
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

  async sendMessage(
    agentId: string,
    prompt: string,
    callbacks: SdkSessionCallbacks,
  ): Promise<void> {
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

  private async executeQuery(
    session: SdkSession,
    prompt: string,
    callbacks: SdkSessionCallbacks,
  ): Promise<void> {
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

      // The SDK looks for a bundled cli.js that doesn't exist — point it at
      // the system `claude` binary we resolved at module load.
      if (RESOLVED_CLAUDE_PATH) {
        options.pathToClaudeCodeExecutable = RESOLVED_CLAUDE_PATH;
      }

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

  /**
   * Destroy an SDK session, closing the active query and cleaning up.
   * Returns a Promise that resolves once the underlying subprocess is
   * confirmed gone (or after a safety timeout).  The SDK's own close()
   * already does SIGTERM -> 2 s -> SIGKILL, but we add a 10 s outer
   * guard so the caller can await full cleanup.
   */
  destroySession(agentId: string): Promise<void> {
    const session = this.sessions.get(agentId);
    if (!session) {
      this.messageQueues.delete(agentId);
      return Promise.resolve();
    }

    // Clear queue first so nothing fires after close
    this.messageQueues.set(agentId, []);

    const activeQuery = session.activeQuery;
    session.activeQuery = null;
    session.busy = false;

    // Remove from maps immediately so no new work is dispatched
    this.sessions.delete(agentId);
    this.messageQueues.delete(agentId);

    if (!activeQuery) {
      return Promise.resolve();
    }

    // Close the query — the SDK internally sends SIGTERM, then SIGKILL
    // after 5 s.  We wrap in a 10 s guard so we never hang indefinitely.
    return new Promise<void>((resolve) => {
      const guardTimer = setTimeout(() => {
        console.warn(`[sdk-session] Cleanup guard timeout for agent ${agentId} — forcing resolve`);
        resolve();
      }, 10_000);
      // Unref so the timer does not keep the process alive on shutdown
      guardTimer.unref();

      try {
        activeQuery.close();
      } catch {
        // Query may already be closed
      }

      // The SDK's close() fires internal SIGTERM -> SIGKILL via setTimeout.
      // Give it a moment to run, then resolve.  If the subprocess is still
      // shutting down the unref'd SDK timers will finish it off.
      setTimeout(() => {
        clearTimeout(guardTimer);
        resolve();
      }, 500).unref();
    });
  }

  /**
   * Destroy all active SDK sessions.  Waits for each to complete
   * cleanup (up to the per-session guard timeout).
   */
  async destroyAll(): Promise<string[]> {
    const agentIds = [...this.sessions.keys()];
    await Promise.all(agentIds.map((id) => this.destroySession(id)));
    return agentIds;
  }

  private resolveModel(model: string): string {
    switch (model) {
      case "opus":
        return "claude-opus-4-6";
      case "sonnet":
        return "claude-sonnet-4-6";
      case "haiku":
        return "claude-haiku-4-5-20251001";
      default:
        return model;
    }
  }
}
