// server/routes/rooms.ts
import { Router } from "express";
import type { RoomManager } from "../rooms.js";
import type { SdkSessionManager, SdkSessionCallbacks } from "../sdk-session.js";
import { getMainProjectDir } from "../config.js";
import type { WebSocket } from "ws";
import type { WebSocketServer } from "ws";
import { ConversationProtocol, parseMentions } from "../managers/conversation-protocol.js";

export function roomsRoutes(
  roomManager: RoomManager,
  sdkManager: SdkSessionManager,
  wss: WebSocketServer,
): Router {
  const router = Router();

  // Helper: broadcast a WebSocket message to all clients
  function broadcast(type: string, payload: unknown): void {
    const msg = JSON.stringify({ type, payload });
    for (const client of wss.clients) {
      if ((client as WebSocket).readyState === 1) {
        // WebSocket.OPEN
        (client as WebSocket).send(msg);
      }
    }
  }

  // Per-room ConversationProtocol instances for @mention chaining
  const protocols = new Map<string, ConversationProtocol>();
  // Track agent turns per room since last human message — for soft stop
  const agentTurnCounts = new Map<string, number>();
  const SOFT_STOP_TURNS = 6;

  /** Lazily create (or return existing) ConversationProtocol for a room. */
  function getOrCreateProtocol(roomId: string): ConversationProtocol {
    const existing = protocols.get(roomId);
    if (existing) return existing;

    const room = roomManager.getRoom(roomId);
    if (!room) throw new Error(`Room ${roomId} not found`);

    // Track which agents have already received their initial room context
    const initialized = new Set<string>();

    const protocol = new ConversationProtocol(
      room.agents.map((a) => ({ id: a.id, name: a.name })),

      // onInvoke — lazy-spawn agent, prepend context on first message, then send
      (agentId: string, prompt: string) => {
        // Ensure agent has an SDK session (lazy-spawn)
        if (!sdkManager.getSession(agentId)) {
          const agent = room.agents.find((a) => a.id === agentId);
          if (!agent) {
            roomManager.addMessage(roomId, {
              from: "system",
              text: `Cannot invoke unknown agent "${agentId}".`,
              type: "system",
            });
            return;
          }
          const mainDir = getMainProjectDir();
          sdkManager.createSession({
            agentId: agent.id,
            roomId,
            cwd: mainDir,
            model: agent.model,
            agentProfile: agent.id !== "none" ? agent.id : undefined,
          });
          roomManager.setAgentStatus(roomId, agent.id, "idle");
        }

        // First message to a new agent: prepend room context
        let messageToSend = prompt;
        if (!initialized.has(agentId)) {
          initialized.add(agentId);
          const agent = room.agents.find((a) => a.id === agentId);
          const otherAgents = room.agents
            .filter((a) => a.id !== agentId)
            .map((a) => `@${a.id} (${a.name})`)
            .join(", ");
          const contextPrefix = `You are ${agent?.name ?? agentId} in a group chat called "#${room.name}".
Topic: ${room.topic}
Teammates: ${otherAgents}

ROOM RULES — read carefully, this is NOT a normal Claude session:

HOW IT WORKS: You can use all your tools (read files, query databases, run commands) — the room only sees your FINAL response. Do your work first, then write a brief message with your findings. You get ONE message per turn. You cannot "come back later."

STYLE:
- Keep your room message SHORT — a few sentences with key findings, then @mention the next agent.
- Do NOT write reports, tables, or "comprehensive analyses." Just the headline + @mention.
- Ask ONE question at a time.
- ALWAYS @mention who you're talking to. Without @mention, nobody receives your message.
- To ask the human: @user
- Do NOT use the SendMessage tool — write @agentname directly in your text.
- Never introduce yourself. Never say "Let me check" without actually checking and reporting.

EXAMPLE good message:
"Checked Notion — 5 tickets look stale (Week 1-2 leftovers). @frontend-worker are these 3 features actually shipped? [list]. @backend-worker is the migration ticket still needed?"

EXAMPLE bad message:
"I'll start by pulling tickets from Notion and loading relevant memory, then coordinate with frontend and backend agents..." (this is useless — do the work, then report)

You are a teammate on Slack, not an assistant writing a report.
---
`;
          messageToSend =
            contextPrefix +
            prompt +
            "\n\n[ROOM REMINDER: Max 3-4 sentences. Summarize findings briefly. List max 3-5 items, not everything. @mention who should act next. No reports.]";
        } else {
          // Not first message — still append brevity reminder after the prompt
          messageToSend =
            prompt +
            "\n\n[ROOM REMINDER: Max 3-4 sentences. Summarize findings briefly. List max 3-5 items, not everything. @mention who should act next. No reports.]";
        }

        const callbacks = makeSdkCallbacks(roomId);
        sdkManager.sendMessage(agentId, messageToSend, callbacks).catch((err) => {
          roomManager.addMessage(roomId, {
            from: "system",
            text: `Failed to deliver to ${agentId}: ${err instanceof Error ? err.message : String(err)}`,
            type: "system",
          });
        });
      },

      // onDepthLimitReached — notify room that human intervention is needed
      () => {
        roomManager.addMessage(roomId, {
          from: "system",
          text: "Chain depth limit reached (10 turns). The conversation needs human input to continue.",
          type: "system",
        });
        broadcast("room-needs-user", { roomId, reason: "depth-limit" });
      },

      // onError
      (error: Error) => {
        roomManager.addMessage(roomId, {
          from: "system",
          text: `Protocol error: ${error.message}`,
          type: "system",
        });
      },
    );

    protocols.set(roomId, protocol);
    return protocol;
  }

  // Shared callbacks for SDK session events — broadcasts to all WS clients
  function makeSdkCallbacks(roomId: string): SdkSessionCallbacks {
    return {
      onTypingStart(agentId: string) {
        roomManager.setAgentStatus(roomId, agentId, "working");
        broadcast("room-agent-typing", { roomId, agentId });
      },
      onTextDelta(_agentId: string, _delta: string) {
        // Don't stream raw Claude Code output to the room.
        // Agents do tool calls, read files, query databases — that's internal work.
        // Only the final result (onResult) gets posted as a room message.
        // The typing indicator (onTypingStart) shows the agent is working.
      },
      onResult(agentId: string, text: string, usage) {
        const truncated = text.length > 5000 ? text.slice(0, 5000) + "\n...(truncated)" : text;
        roomManager.addMessage(roomId, {
          from: agentId,
          text: truncated,
          type: "message",
        });
        roomManager.updateContextFile(roomId);

        if (usage) {
          broadcast("room-agent-usage", { roomId, agentId, ...usage });
        }

        // --- Protocol chaining: route @mentions to next agent(s) ---
        const protocol = protocols.get(roomId);
        if (protocol) {
          // Track agent turns for soft stop
          const turns = (agentTurnCounts.get(roomId) ?? 0) + 1;
          agentTurnCounts.set(roomId, turns);

          // Soft stop: after N agent turns without human input, pause and ask
          if (turns >= SOFT_STOP_TURNS) {
            protocol.pause();
            agentTurnCounts.set(roomId, 0);
            roomManager.addMessage(roomId, {
              from: "system",
              text: "Agents have been discussing for a while. Send a message to continue, or let them wrap up.",
              type: "system",
            });
            broadcast("room-needs-user", { roomId, agentId, reason: "soft-stop" });
            return;
          }

          const mentions = parseMentions(text);
          console.log(
            `[room-chain] Agent ${agentId} finished (turn ${turns}/${SOFT_STOP_TURNS}). Mentions: [${mentions.join(", ")}]`,
          );

          const mentionsUser = mentions.includes("user") || mentions.includes("vatsal");
          const mentionsAgents = mentions.some((m) => m !== "user" && m !== "vatsal");

          // Let the protocol handle chaining to @mentioned agents FIRST
          protocol.handleAgentResponse(agentId, text);
          console.log(
            `[room-chain] After handleAgentResponse: queue=${protocol.queueLength}, active=${protocol.activeAgent}`,
          );

          // If agent also mentioned the user, notify but only pause if no other agents were chained
          if (mentionsUser) {
            broadcast("room-needs-user", { roomId, agentId, reason: "mention" });
            if (!mentionsAgents || (protocol.queueLength === 0 && !protocol.activeAgent)) {
              // No other agents to chain to — pause and wait for user
              protocol.pause();
              roomManager.addMessage(roomId, {
                from: "system",
                text: "Agents are waiting for your input.",
                type: "system",
              });
            }
            // If other agents ARE chained, let them finish — user was notified
          }
        } else {
          console.log(`[room-chain] Agent ${agentId} finished but NO protocol for room ${roomId}`);
        }
      },
      onError(agentId: string, err: Error) {
        roomManager.addMessage(roomId, {
          from: "system",
          text: `Agent ${agentId} error: ${err.message}`,
          type: "system",
        });
        roomManager.setAgentStatus(roomId, agentId, "idle");
      },
      onIdle(agentId: string) {
        roomManager.setAgentStatus(roomId, agentId, "idle");
      },
    };
  }

  router.get("/", (_req, res) => {
    res.json(roomManager.getRooms());
  });

  router.post("/", (req, res) => {
    try {
      const { name, topic, agents } = req.body as {
        name?: string;
        topic?: string;
        agents?: Array<{ id: string; name: string; model: "opus" | "sonnet" | "haiku" }>;
      };
      if (!name || !topic) {
        res.status(400).json({ error: "Missing 'name' or 'topic'" });
        return;
      }
      if (agents !== undefined && !Array.isArray(agents)) {
        res.status(400).json({ error: "agents must be an array" });
        return;
      }
      if (agents) {
        for (const a of agents) {
          if (!a || typeof a.id !== "string" || typeof a.name !== "string") {
            res.status(400).json({ error: "Each agent must have string 'id' and 'name' fields" });
            return;
          }
        }
      }
      const room = roomManager.createRoom(name, topic, agents ?? []);
      res.status(201).json(room);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      if (message.includes("already exists")) {
        res.status(409).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  router.get("/:id", (req, res) => {
    const room = roomManager.getRoom(req.params["id"]!);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    res.json(room);
  });

  // --- Message routing: user -> SDK agent ---
  router.post("/:id/messages", (req, res) => {
    try {
      const roomId = req.params["id"]!;
      const {
        from,
        text,
        to,
        id: clientId,
      } = req.body as {
        from?: string;
        text?: string;
        to?: string;
        id?: string;
      };
      if (!text) {
        res.status(400).json({ error: "Missing 'text'" });
        return;
      }

      const msg = roomManager.addMessage(
        roomId,
        {
          from: from ?? "user",
          text,
          to,
          type: "message",
        },
        clientId,
      );

      if (!msg) {
        res.status(404).json({ error: "Room not found" });
        return;
      }

      const room = roomManager.getRoom(roomId);
      if (room && (from === "user" || from === undefined)) {
        const protocol = getOrCreateProtocol(roomId);
        if (protocol.isPaused) {
          protocol.resume();
        }
        agentTurnCounts.set(roomId, 0); // Reset turn counter on human input
        // Route to the first agent in the room (no hardcoded orchestrator dependency)
        const targetAgent = room.agents[0]?.id ?? "orchestrator";
        protocol.humanMessage(text, targetAgent);
      }

      res.status(201).json(msg);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // --- Spawn: register agents as ready but dormant (no SDK sessions, no init messages) ---
  router.post("/:id/spawn", async (req, res) => {
    try {
      const roomId = req.params["id"]!;
      const room = roomManager.getRoom(roomId);
      if (!room) {
        res.status(404).json({ error: "Room not found" });
        return;
      }

      // Mark agents as ready but dormant — no SDK sessions, no init messages.
      // Sessions are created lazily when an agent is first @mentioned.
      for (const agent of room.agents) {
        roomManager.setAgentStatus(roomId, agent.id, "idle");
      }

      // Initialize the protocol for this room
      getOrCreateProtocol(roomId);

      roomManager.addMessage(roomId, {
        from: "system",
        text: `Room ready. ${room.agents.length} agents available: ${room.agents.map((a) => a.name).join(", ")}. @mention an agent to start.`,
        type: "system",
      });

      res.json({ spawned: room.agents.map((a) => ({ agentId: a.id })) });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  router.post("/:id/approve/:msgId", (req, res) => {
    const ok = roomManager.approveAction(req.params["id"]!, req.params["msgId"]!);
    if (!ok) {
      res.status(404).json({ error: "Message not found or not pending" });
      return;
    }
    res.json({ ok: true });
  });

  router.post("/:id/reject/:msgId", (req, res) => {
    const ok = roomManager.rejectAction(req.params["id"]!, req.params["msgId"]!);
    if (!ok) {
      res.status(404).json({ error: "Message not found or not pending" });
      return;
    }
    res.json({ ok: true });
  });

  // --- Close room: destroy SDK sessions with graceful shutdown ---
  router.delete("/:id", async (req, res) => {
    try {
      const roomId = req.params["id"]!;
      const room = roomManager.getRoom(roomId);
      if (room) {
        // Destroy all agent SDK sessions in parallel.
        // Each destroySession call sends SIGTERM to the underlying Claude
        // Code subprocess; the SDK escalates to SIGKILL after 5 s.
        // We await all of them so the response is only sent once processes
        // are confirmed dead (or the safety timeout fires).
        await Promise.all(room.agents.map((agent) => sdkManager.destroySession(agent.id)));
      }
      protocols.delete(roomId);
      agentTurnCounts.delete(roomId);
      roomManager.closeRoom(roomId);
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  return router;
}
