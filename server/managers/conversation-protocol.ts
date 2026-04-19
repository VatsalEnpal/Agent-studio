// server/managers/conversation-protocol.ts

/** An agent that can be invoked in room conversations. */
export interface ProtocolAgent {
  id: string;
  name: string;
}

/** Callback to invoke an agent with a prompt. */
export type InvokeCallback = (agentId: string, prompt: string) => void;

/** Queued message waiting for the current agent turn to complete. */
interface QueuedInvocation {
  agentId: string;
  prompt: string;
}

/** Depth limit before forcing human intervention. */
const MAX_CHAIN_DEPTH = 10;

/**
 * Parse @mentions from message text. Matches `@word` patterns.
 * @param text - Message text to parse
 * @returns Deduplicated array of mentioned names (lowercase, without @)
 */
export function parseMentions(text: string): string[] {
  const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
  const mentions: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push(match[1].toLowerCase());
  }
  return [...new Set(mentions)];
}

/**
 * Manages turn-based agent conversations in rooms with @mention routing,
 * one-at-a-time turn order, self-loop prevention, depth limiting (10 turns),
 * @all broadcast, and pause/resume support.
 */
export class ConversationProtocol {
  private agents: Map<string, ProtocolAgent>;
  private onInvoke: InvokeCallback;
  private onDepthLimitReached: () => void;
  private onError: (error: Error) => void;

  private queue: QueuedInvocation[] = [];
  private currentAgent: string | null = null;
  private chainDepth = 0;
  private paused = false;

  /**
   * @param availableAgents - Agents that can participate in conversation
   * @param onInvoke - Called when an agent should be sent a prompt
   * @param onDepthLimitReached - Called when chain depth exceeds limit
   * @param onError - Called on protocol errors
   */
  constructor(
    availableAgents: ProtocolAgent[],
    onInvoke: InvokeCallback,
    onDepthLimitReached: () => void,
    onError: (error: Error) => void,
  ) {
    this.agents = new Map(availableAgents.map((a) => [a.id, a]));
    this.onInvoke = onInvoke;
    this.onDepthLimitReached = onDepthLimitReached;
    this.onError = onError;
  }

  /**
   * Directly route a human message to a specific agent without parsing mentions.
   * Used by the leading-@ parser to dispatch to ONE agent and skip orchestrator
   * fan-out. The full `text` is passed through so the target agent sees any
   * remaining mid-body @mentions as part of the prompt.
   */
  routeHumanMessageTo(agentId: string, text: string): void {
    // Reset chain state — human input starts a new turn
    this.chainDepth = 0;
    this.queue = [];
    this.currentAgent = null;

    if (!this.agents.has(agentId)) {
      this.onError(new Error(`Target agent "${agentId}" not found`));
      return;
    }
    this.invokeAgent(agentId, text);
  }

  /** Process a human message. Resets chain depth, parses @mentions, routes to agent(s). */
  humanMessage(text: string, defaultTarget?: string): void {
    // Human input resets chain depth and cancels pending chain
    this.chainDepth = 0;
    this.queue = [];
    this.currentAgent = null;

    const mentions = parseMentions(text);

    if (mentions.includes("all")) {
      // Sequential broadcast to all agents
      this.broadcastToAll(text);
      return;
    }

    // Resolve mentioned agents
    const targetIds = this.resolveMentions(mentions);

    if (targetIds.length === 0 && defaultTarget) {
      // No valid mention found — route to default target
      if (this.agents.has(defaultTarget)) {
        this.invokeAgent(defaultTarget, text);
      } else {
        this.onError(new Error(`Default target "${defaultTarget}" not found`));
      }
      return;
    }

    if (targetIds.length === 0) {
      // No target at all — nothing to route
      return;
    }

    // Invoke first, queue the rest
    const [first, ...rest] = targetIds;
    for (const id of rest) {
      this.queue.push({ agentId: id, prompt: text });
    }
    this.invokeAgent(first, text);
  }

  /** Process an agent's response. Chains to @mentioned agents, drains queue. */
  handleAgentResponse(agentId: string, responseText: string): void {
    // Release current turn
    if (this.currentAgent === agentId) {
      this.currentAgent = null;
    }

    this.chainDepth++;

    if (this.chainDepth >= MAX_CHAIN_DEPTH) {
      this.queue = [];
      this.onDepthLimitReached();
      return;
    }

    if (this.paused) {
      return;
    }

    // Check for @mentions in the agent's response (chaining)
    const mentions = parseMentions(responseText);
    const chainTargets = this.resolveMentions(mentions).filter(
      (id) => id !== agentId, // No self-loops
    );

    // Prepend chain targets to the front of the queue
    for (let i = chainTargets.length - 1; i >= 0; i--) {
      this.queue.unshift({
        agentId: chainTargets[i],
        prompt: responseText,
      });
    }

    // Drain next from queue
    this.drainQueue();
  }

  /** Pause agent chain processing. The current turn finishes, but no new invocations fire. */
  pause(): void {
    this.paused = true;
  }

  /** Resume agent chain processing and drain any queued invocations. */
  resume(): void {
    this.paused = false;
    if (!this.currentAgent) {
      this.drainQueue();
    }
  }

  /** Returns whether the protocol is currently paused. */
  get isPaused(): boolean {
    return this.paused;
  }

  /** Returns the number of queued invocations waiting. */
  get queueLength(): number {
    return this.queue.length;
  }

  /** Returns the ID of the agent currently holding the turn, or null. */
  get activeAgent(): string | null {
    return this.currentAgent;
  }

  /** Broadcast message to all agents sequentially. */
  private broadcastToAll(text: string): void {
    const agentIds = [...this.agents.keys()];
    if (agentIds.length === 0) return;

    const [first, ...rest] = agentIds;
    for (const id of rest) {
      this.queue.push({ agentId: id, prompt: text });
    }
    this.invokeAgent(first, text);
  }

  /** Resolve mention strings to valid agent IDs. */
  private resolveMentions(mentions: string[]): string[] {
    const resolved: string[] = [];
    for (const mention of mentions) {
      if (mention === "all") continue; // Handled separately
      if (this.agents.has(mention)) {
        resolved.push(mention);
      }
      // Also try to match by name (case-insensitive)
      for (const agent of this.agents.values()) {
        if (agent.name.toLowerCase() === mention && !resolved.includes(agent.id)) {
          resolved.push(agent.id);
        }
      }
    }
    return [...new Set(resolved)];
  }

  /** Invoke an agent if no other agent is currently active. */
  private invokeAgent(agentId: string, prompt: string): void {
    if (this.currentAgent) {
      // Someone is busy — queue it
      this.queue.push({ agentId, prompt });
      return;
    }

    this.currentAgent = agentId;
    try {
      this.onInvoke(agentId, prompt);
    } catch (err) {
      this.currentAgent = null;
      this.onError(err instanceof Error ? err : new Error(String(err)));
      this.drainQueue();
    }
  }

  /** Process the next queued invocation if no agent is active. */
  private drainQueue(): void {
    if (this.paused || this.currentAgent || this.queue.length === 0) {
      return;
    }

    const next = this.queue.shift();
    if (next) {
      this.invokeAgent(next.agentId, next.prompt);
    }
  }
}
