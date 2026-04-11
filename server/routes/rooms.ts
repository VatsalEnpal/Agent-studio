import { Router } from "express";
import type { TerminalManager } from "../terminal-manager.js";
import type { RoomManager } from "../rooms.js";
import { getMainProjectDir } from "../config.js";

export function roomsRoutes(
  roomManager: RoomManager,
  terminalManager: TerminalManager,
  sessionToRoom: Map<string, string>,
  sessionToAgent: Map<string, string>,
  lastBufferPos: Map<string, number>,
): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json(roomManager.getRooms());
  });

  router.post("/", (req, res) => {
    try {
      const { name, topic, agents } = req.body as {
        name?: string;
        topic?: string;
        agents?: Array<{
          id: string;
          name: string;
          model: "opus" | "sonnet" | "haiku";
        }>;
      };
      if (!name || !topic) {
        res.status(400).json({ error: "Missing 'name' or 'topic'" });
        return;
      }
      // Validate agents array format
      if (agents !== undefined && !Array.isArray(agents)) {
        res.status(400).json({ error: "agents must be an array" });
        return;
      }
      if (agents) {
        for (const a of agents) {
          if (!a || typeof a.id !== "string" || typeof a.name !== "string") {
            res
              .status(400)
              .json({
                error: "Each agent must have string 'id' and 'name' fields",
              });
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
          ...(to ? { to } : {}),
          type: "message",
        },
        clientId,
      );

      if (!msg) {
        res.status(404).json({ error: "Room not found" });
        return;
      }

      // Route to agent PTY if @mention or to orchestrator by default
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
            for (const agent of room.agents) {
              if (agent.sessionId) {
                try {
                  const inputText = `[Room #${room.name} — from user to @all]: ${cleanText}\n`;
                  terminalManager.writeToSession(agent.sessionId, inputText);
                  roomManager.setAgentStatus(roomId, agent.id, "working");
                } catch {
                  // Session may have exited
                }
              }
            }
            res.status(201).json(msg);
            return;
          }

          const mentionedAgent = room.agents.find((a) => a.id === mentioned);
          if (mentionedAgent?.sessionId) {
            targetAgentId = mentioned;
          }
          messageText = text.replace(/@\w+\s*/, "").trim();
        }

        const targetAgent = room.agents.find((a) => a.id === targetAgentId);
        if (targetAgent?.sessionId) {
          try {
            const inputText = `[Room #${room.name} — from user${to ? ` to @${to}` : ""}]: ${messageText}\n`;
            terminalManager.writeToSession(targetAgent.sessionId, inputText);
            roomManager.setAgentStatus(roomId, targetAgentId, "working");
          } catch {
            // Session may have exited
          }
        } else {
          // Agent not spawned — add a system warning
          roomManager.addMessage(roomId, {
            from: "system",
            text: `Cannot deliver to ${targetAgentId} — agent is offline. Agents are spawned when the room is created; if they exited, close and recreate the room.`,
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

  router.post("/:id/spawn", async (req, res) => {
    try {
      const roomId = req.params["id"]!;
      const room = roomManager.getRoom(roomId);
      if (!room) {
        res.status(404).json({ error: "Room not found" });
        return;
      }

      const mainDir = getMainProjectDir();
      const spawned: Array<{ agentId: string; sessionId: string }> = [];

      for (const agent of room.agents) {
        if (agent.sessionId) continue; // already spawned

        const args: string[] = [
          "--dangerously-skip-permissions",
          "--model",
          agent.model,
        ];

        if (agent.id !== "none") {
          args.push("--agent", agent.id);
        }

        const session = terminalManager.createSession({
          name: `room:${room.id}:${agent.id}`,
          command: "claude",
          args,
          cwd: mainDir,
          meta: {
            model: agent.model,
            agent: agent.id,
            permissions: "bypass",
            group: "room",
            roomId,
            roomName: room.name,
          },
        });

        roomManager.linkSession(roomId, agent.id, session.id);
        sessionToRoom.set(session.id, roomId);
        sessionToAgent.set(session.id, agent.id);
        lastBufferPos.set(session.id, 0);

        const otherAgents = room.agents
          .filter((a) => a.id !== agent.id)
          .map((a) => a.name)
          .join(", ");
        const initMessage = [
          `You are agent "${agent.name}" in team room "#${room.name}".`,
          `Topic: ${room.topic}`,
          `Team members: ${otherAgents}`,
          `Read ${room.contextFile} for team status.`,
          `When you finish a task, write a summary to that file.`,
          `You can message other agents by including @agentname in your response.`,
        ].join(" ");

        setTimeout(() => {
          try {
            terminalManager.writeToSession(session.id, initMessage + "\n");
          } catch {
            // Session may have failed to start
          }
        }, 3000);

        spawned.push({ agentId: agent.id, sessionId: session.id });
      }

      res.json({ spawned });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  router.post("/:id/approve/:msgId", (req, res) => {
    const ok = roomManager.approveAction(
      req.params["id"]!,
      req.params["msgId"]!,
    );
    if (!ok) {
      res.status(404).json({ error: "Message not found or not pending" });
      return;
    }
    res.json({ ok: true });
  });

  router.post("/:id/reject/:msgId", (req, res) => {
    const ok = roomManager.rejectAction(
      req.params["id"]!,
      req.params["msgId"]!,
    );
    if (!ok) {
      res.status(404).json({ error: "Message not found or not pending" });
      return;
    }
    res.json({ ok: true });
  });

  router.delete("/:id", (req, res) => {
    try {
      const roomId = req.params["id"]!;
      const sessionIds = roomManager.closeRoom(roomId);

      for (const sid of sessionIds) {
        try {
          terminalManager.killSession(sid);
        } catch {
          // Already exited
        }
        sessionToRoom.delete(sid);
        sessionToAgent.delete(sid);
        lastBufferPos.delete(sid);
      }

      res.json({ ok: true, killedSessions: sessionIds.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  return router;
}
