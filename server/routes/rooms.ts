// server/routes/rooms.ts
import { Router } from "express";
import type { RoomManager } from "../rooms.js";
import type { SdkSessionManager, SdkSessionCallbacks } from "../sdk-session.js";
import { getMainProjectDir } from "../config.js";
import type { WebSocket } from "ws";
import type { WebSocketServer } from "ws";

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
        const mentionMatch = text.match(/@(\w+)/);
        let targetAgentId = "orchestrator";
        let messageText = text;

        if (mentionMatch) {
          const mentioned = mentionMatch[1]!;
          if (mentioned === "all") {
            // Broadcast to all agents
            const cleanText = text.replace(/@all\s*/g, "").trim();
            const callbacks = makeSdkCallbacks(roomId);
            for (const agent of room.agents) {
              const session = sdkManager.getSession(agent.id);
              if (session) {
                sdkManager.sendMessage(agent.id, cleanText, callbacks).catch((err) => {
                  roomManager.addMessage(roomId, {
                    from: "system",
                    text: `Failed to deliver to ${agent.id}: ${err instanceof Error ? err.message : String(err)}`,
                    type: "system",
                  });
                });
              }
            }
            roomManager.updateContextFile(roomId);
            res.status(201).json(msg);
            return;
          }

          const mentionedAgent = room.agents.find(a => a.id.toLowerCase() === mentioned.toLowerCase());
          const mentionedId = mentionedAgent?.id ?? mentioned;
          const hasSession = !!sdkManager.getSession(mentionedId);
          console.log(`[room-msg] mentioned="${mentioned}", found agent=${!!mentionedAgent}, agentId=${mentionedId}, has session=${hasSession}, target=${hasSession ? mentionedId : targetAgentId}`);
          if (mentionedAgent && sdkManager.getSession(mentionedId)) {
            targetAgentId = mentionedId;
          }
          messageText = text.replace(/@\w+\s*/, "").trim();
        }

        const session = sdkManager.getSession(targetAgentId);
        if (session) {
          const callbacks = makeSdkCallbacks(roomId);
          sdkManager.sendMessage(targetAgentId, messageText, callbacks).catch((err) => {
            roomManager.addMessage(roomId, {
              from: "system",
              text: `Failed to deliver to ${targetAgentId}: ${err instanceof Error ? err.message : String(err)}`,
              type: "system",
            });
          });
          roomManager.updateContextFile(roomId);
        } else {
          roomManager.addMessage(roomId, {
            from: "system",
            text: `Cannot deliver to ${targetAgentId} — agent is offline. Start the room first.`,
            type: "system",
          });
        }
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
      roomManager.closeRoom(roomId);
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  return router;
}
