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
      if ((client as WebSocket).readyState === 1) { // WebSocket.OPEN
        (client as WebSocket).send(msg);
      }
    }
  }

  // Per-room ConversationProtocol instances for @mention chaining
  const protocols = new Map<string, ConversationProtocol>();

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
          const contextPrefix = [
            `You are agent "${agent?.name ?? agentId}" in team room "#${room.name}".`,
            `Topic: ${room.topic}.`,
            `Team members: ${otherAgents}.`,
            `You can @mention other agents to hand off work, or @user to ask the human a question.`,
            `Do NOT introduce yourself. Just do the work requested.`,
            `\n---\n`,
          ].join(" ");
          messageToSend = contextPrefix + prompt;
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
      onTextDelta(agentId: string, delta: string) {
        broadcast("room-agent-streaming", { roomId, agentId, delta });
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
          const mentions = parseMentions(text);

          // If agent mentioned the user, pause the chain and notify
          if (mentions.includes("user") || mentions.includes("vatsal")) {
            protocol.pause();
            broadcast("room-needs-user", { roomId, agentId, reason: "mention" });
            return;
          }

          // Let the protocol handle chaining to @mentioned agents
          protocol.handleAgentResponse(agentId, text);

          // Orchestrator fallback: if nobody was chained and no queue,
          // ask orchestrator whether anyone else should respond
          const room = roomManager.getRoom(roomId);
          if (
            room &&
            protocol.queueLength === 0 &&
            protocol.activeAgent === null &&
            agentId !== "orchestrator" &&
            room.agents.some((a) => a.id === "orchestrator")
          ) {
            const orchestratorPrompt = `The last message was from @${agentId}. No agent was @mentioned. Should anyone else respond? Reply with @agentname if yes, or say DONE if the conversation can pause.`;
            protocol.handleAgentResponse("__fallback__", orchestratorPrompt);
            // handleAgentResponse won't route "__fallback__" — invoke orchestrator directly
            if (protocol.activeAgent === null && protocol.queueLength === 0) {
              // Manually invoke orchestrator for the fallback question
              const callbacks = makeSdkCallbacks(roomId);
              sdkManager.sendMessage("orchestrator", orchestratorPrompt, callbacks).catch((err) => {
                roomManager.addMessage(roomId, {
                  from: "system",
                  text: `Orchestrator fallback failed: ${err instanceof Error ? err.message : String(err)}`,
                  type: "system",
                });
              });
            }
          }
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
      const { from, text, to, id: clientId } = req.body as {
        from?: string; text?: string; to?: string; id?: string;
      };
      if (!text) {
        res.status(400).json({ error: "Missing 'text'" });
        return;
      }

      const msg = roomManager.addMessage(roomId, {
        from: from ?? "user",
        text,
        to,
        type: "message",
      }, clientId);

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
        protocol.humanMessage(text, "orchestrator");
      }

      res.status(201).json(msg);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // --- Spawn: create SDK sessions for all agents ---
  router.post("/:id/spawn", async (req, res) => {
    try {
      const roomId = req.params["id"]!;
      const room = roomManager.getRoom(roomId);
      if (!room) {
        res.status(404).json({ error: "Room not found" });
        return;
      }

      const mainDir = getMainProjectDir();
      const spawned: Array<{ agentId: string }> = [];

      for (const agent of room.agents) {
        // Skip if already has an SDK session
        if (sdkManager.getSession(agent.id)) continue;

        sdkManager.createSession({
          agentId: agent.id,
          roomId,
          cwd: mainDir,
          model: agent.model,
          agentProfile: agent.id !== "none" ? agent.id : undefined,
        });

        roomManager.setAgentStatus(roomId, agent.id, "idle");
        spawned.push({ agentId: agent.id });
      }

      // Send init message to ALL agents so they have context about the room
      const callbacks = makeSdkCallbacks(roomId);
      for (const agent of room.agents) {
        const session = sdkManager.getSession(agent.id);
        if (!session) continue;

        const otherAgents = room.agents.filter(a => a.id !== agent.id).map(a => a.name).join(", ");
        const initMessage = [
          `You are agent "${agent.name}" in team room "#${room.name}".`,
          `Topic: ${room.topic}.`,
          `Team members: ${otherAgents}.`,
          `Read ${room.contextFile} for team status.`,
          `When you finish a task, write a summary to that file.`,
          `You can message other agents by including @agentname in your response.`,
          `Acknowledge briefly that you're ready.`,
        ].join(" ");

        sdkManager.sendMessage(agent.id, initMessage, callbacks).catch((err) => {
          // Surface errors to the room so the user can see what went wrong
          roomManager.addMessage(roomId, {
            from: "system",
            text: `Failed to initialize ${agent.name}: ${err instanceof Error ? err.message : String(err)}`,
            type: "system",
          });
        });
      }

      roomManager.addMessage(roomId, {
        from: "system",
        text: `Agents started: ${spawned.map(s => s.agentId).join(", ")}`,
        type: "system",
      });

      res.json({ spawned });
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

  // --- Close room: destroy SDK sessions ---
  router.delete("/:id", (req, res) => {
    try {
      const roomId = req.params["id"]!;
      const room = roomManager.getRoom(roomId);
      if (room) {
        for (const agent of room.agents) {
          sdkManager.destroySession(agent.id);
        }
      }
      protocols.delete(roomId);
      roomManager.closeRoom(roomId);
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  return router;
}
