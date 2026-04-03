"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Send, Hash, Loader2, Power, PowerOff, Users, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { agentColor } from "@/lib/design-tokens";
import { useRoomsStore } from "@/stores/rooms";
import { useToastStore } from "@/components/ui/notification-toast";
import type { Room, RoomMessage } from "@/stores/rooms";
import { ChatMessage, StreamingMessage } from "./chat-message";
import { TypingIndicator } from "./typing-indicator";

/** Check if two messages should be grouped (same sender, within 2 minutes). */
function shouldGroup(prev: RoomMessage | undefined, curr: RoomMessage): boolean {
  if (!prev) return false;
  if (prev.from !== curr.from) return false;
  if (prev.type === "system" || curr.type === "system") return false;
  const diff = new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime();
  return diff < 2 * 60 * 1000;
}

export function RoomChat() {
  const selectedRoomId = useRoomsStore((s) => s.selectedRoomId);
  const room = useRoomsStore((s) =>
    s.rooms.find((r) => r.id === s.selectedRoomId),
  );

  const typingAgents = useRoomsStore((s) => s.typingAgents);
  const streamingText = useRoomsStore((s) => s.streamingText);
  const roomTyping = room ? (typingAgents[room.id] ?? []) : [];
  const typingAgentIds = roomTyping.map((ta) => ta.agentId);

  const [input, setInput] = useState("");
  const [spawning, setSpawning] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const addToast = useToastStore((s) => s.addToast);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [room?.messages.length, typingAgentIds.length]);

  // Focus input when room changes
  useEffect(() => {
    inputRef.current?.focus();
  }, [selectedRoomId]);

  // Mark room as seen
  useEffect(() => {
    if (selectedRoomId) {
      useRoomsStore.getState().markRoomSeen(selectedRoomId);
    }
  }, [selectedRoomId, room?.messages.length]);

  // Fire toast when agent mentions @vatsal or @human
  useEffect(() => {
    if (!room || room.messages.length === 0) return;
    const lastMsg = room.messages[room.messages.length - 1];
    if (!lastMsg || lastMsg.from === "user") return;
    const text = (lastMsg.text ?? "").toLowerCase();
    if (text.includes("@vatsal") || text.includes("@human") || text.includes("@user")) {
      addToast({
        type: "action-required",
        title: `${lastMsg.from} mentioned you`,
        body: lastMsg.text?.slice(0, 80) ?? "",
      });
    }
  }, [room?.messages.length, room, addToast]);

  const handleInputChange = useCallback((value: string) => {
    setInput(value);
    const lastAtIndex = value.lastIndexOf("@");
    if (lastAtIndex >= 0) {
      const afterAt = value.slice(lastAtIndex + 1);
      if (!afterAt.includes(" ")) {
        setShowMentions(true);
        setMentionFilter(afterAt.toLowerCase());
      } else {
        setShowMentions(false);
      }
    } else {
      setShowMentions(false);
    }
  }, []);

  const selectMention = useCallback((mentionId: string) => {
    setInput((prev) => {
      const lastAt = prev.lastIndexOf("@");
      return prev.slice(0, lastAt) + `@${mentionId} `;
    });
    setShowMentions(false);
    inputRef.current?.focus();
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !selectedRoomId) return;
    setInput("");
    setShowMentions(false);

    const mentionMatch = text.match(/@(\w+)/);
    const to = mentionMatch ? mentionMatch[1] : undefined;

    fetch(`/api/rooms/${selectedRoomId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: "user", text, to }),
    }).catch(() => {});
  }, [input, selectedRoomId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
      if (e.key === "Escape" && showMentions) {
        setShowMentions(false);
      }
    },
    [handleSend, showMentions],
  );

  const handleApprove = useCallback(
    async (msg: RoomMessage) => {
      if (!selectedRoomId) return;
      await fetch(`/api/rooms/${selectedRoomId}/approve/${msg.id}`, { method: "POST" });
    },
    [selectedRoomId],
  );

  const handleReject = useCallback(
    async (msg: RoomMessage) => {
      if (!selectedRoomId) return;
      await fetch(`/api/rooms/${selectedRoomId}/reject/${msg.id}`, { method: "POST" });
    },
    [selectedRoomId],
  );

  const handleSpawn = useCallback(async () => {
    if (!selectedRoomId || spawning) return;
    setSpawning(true);
    try {
      await fetch(`/api/rooms/${selectedRoomId}/spawn`, { method: "POST" });
    } catch {}
    setSpawning(false);
  }, [selectedRoomId, spawning]);

  const handleClose = useCallback(async () => {
    if (!selectedRoomId) return;
    await fetch(`/api/rooms/${selectedRoomId}`, { method: "DELETE" });
    try {
      const res = await fetch("/api/rooms");
      if (res.ok) {
        const data = await res.json();
        useRoomsStore.getState().setRooms(data);
        const active = (data as Room[]).filter((r: Room) => r.active);
        useRoomsStore.getState().selectRoom(active.length > 0 ? active[0].id : null);
      }
    } catch {}
  }, [selectedRoomId]);

  // Compute message grouping
  const messages = room?.messages ?? [];
  const groupedFlags = useMemo(() => {
    return messages.map((msg, i) => shouldGroup(messages[i - 1], msg));
  }, [messages]);

  // Filtered agents for mention dropdown
  const filteredAgents = (room?.agents ?? [])
    .filter((a) => a && a.id && a.name)
    .filter(
      (a) =>
        a.id.toLowerCase().includes(mentionFilter) ||
        a.name.toLowerCase().includes(mentionFilter),
    );

  if (!room) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-sm px-6">
          <Hash className="w-10 h-10 text-text-tertiary mx-auto mb-4" />
          <p className="text-title-sm text-text-secondary mb-1">
            No room selected
          </p>
          <p className="text-body-sm text-text-tertiary leading-relaxed">
            Select a room from the sidebar or create a new one to start chatting
            with your agent team.
          </p>
        </div>
      </div>
    );
  }

  const allOffline = (room.agents ?? []).every((a) => a.status === "offline");

  return (
    <div className="flex flex-col h-full">
      {/* Room header */}
      <div className="px-4 py-3 border-b border-border shrink-0 bg-surface">
        <div className="flex items-center gap-3">
          <Hash className="w-4 h-4 text-text-tertiary shrink-0" />
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-title-sm text-text-emphasis truncate">
              {room.name}
            </span>
            <span className="text-body-sm text-text-tertiary truncate hidden sm:inline">
              {room.topic}
            </span>
          </div>

          {/* Agent count */}
          <div className="flex items-center gap-1 shrink-0">
            <Users className="w-3.5 h-3.5 text-text-tertiary" />
            <span className="text-label-xs text-text-secondary">
              {room.agents.length}
            </span>
          </div>

          {/* Agent status dots */}
          <div className="flex items-center gap-1 shrink-0">
            {room.agents.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-1"
                title={`${a.name}: ${a.status}`}
              >
                <span
                  className={cn(
                    "w-2 h-2 rounded-full transition-colors duration-[150ms]",
                    a.status === "idle" && "bg-success",
                    a.status === "working" && "bg-accent animate-pulse-dot",
                    a.status === "waiting" && "bg-warning animate-pulse-dot",
                    a.status === "offline" && "bg-text-tertiary",
                  )}
                />
              </div>
            ))}
          </div>

          {/* Spawn button */}
          {room.active && allOffline && (
            <button
              onClick={handleSpawn}
              disabled={spawning}
              className="flex items-center gap-1.5 px-3 py-1.5 text-label font-medium rounded-md bg-accent text-canvas hover:bg-accent-hover transition-colors duration-[100ms] disabled:opacity-50 shrink-0"
            >
              {spawning ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5" />
              )}
              {spawning ? "Starting..." : "Spawn Agents"}
            </button>
          )}

          {/* Close button */}
          {room.active && (
            <button
              onClick={handleClose}
              className="flex items-center gap-1 px-2.5 py-1.5 text-label-xs font-medium rounded-md bg-error-subtle text-error hover:bg-error/20 transition-colors duration-[100ms] shrink-0"
            >
              <PowerOff className="w-3 h-3" />
              Close
            </button>
          )}
        </div>
      </div>

      {/* Big spawn CTA when all agents offline and no messages */}
      {room.active && allOffline && room.messages.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-5">
            <Users className="w-12 h-12 text-text-tertiary mx-auto" />
            <h3 className="text-title-md text-text-emphasis">
              Agents are offline
            </h3>
            <p className="text-body-sm text-text-secondary max-w-xs">
              Spawn all agents to start chatting in this room
            </p>
            <button
              onClick={handleSpawn}
              disabled={spawning}
              className="px-6 py-2.5 bg-accent text-canvas text-body font-semibold rounded-lg hover:bg-accent-hover transition-colors duration-[100ms] disabled:opacity-50 shadow-accent-glow"
            >
              {spawning ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Starting...
                </span>
              ) : (
                "Start Room"
              )}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Messages area */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-body-sm text-text-tertiary">
                No messages yet. Send a message to begin.
              </div>
            ) : (
              <div>
                {messages.map((msg, i) => (
                  <ChatMessage
                    key={msg.id}
                    msg={msg}
                    grouped={groupedFlags[i]}
                    onApprove={handleApprove}
                    onReject={handleReject}
                  />
                ))}
                {/* Streaming ghost messages */}
                {typingAgentIds.map((agentId) => (
                  <StreamingMessage
                    key={`streaming-${agentId}`}
                    agentId={agentId}
                    text={streamingText[agentId] ?? ""}
                  />
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Typing indicator bar */}
          <TypingIndicator
            typingAgents={roomTyping}
            roomAgents={room.agents}
          />

          {/* Spawn banner when offline but has messages */}
          {room.active && allOffline && messages.length > 0 && (
            <div className="px-4 py-3 border-t border-border bg-elevation-2 flex items-center justify-between">
              <span className="text-body-sm text-text-secondary">
                All agents are offline
              </span>
              <button
                onClick={handleSpawn}
                disabled={spawning}
                className="flex items-center gap-1.5 px-3 py-1.5 text-label font-medium rounded-md bg-accent text-canvas hover:bg-accent-hover transition-colors duration-[100ms] disabled:opacity-50"
              >
                {spawning ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Power className="w-3 h-3" />
                )}
                {spawning ? "Starting..." : "Start Room"}
              </button>
            </div>
          )}

          {/* Input bar */}
          {room.active && (
            <div className="px-4 py-3 border-t border-border shrink-0 bg-surface">
              <div className="relative flex items-center gap-2">
                {/* @mention dropdown */}
                {showMentions && (
                  <div className="absolute bottom-full left-0 mb-2 w-64 bg-elevation-3 border border-border rounded-lg shadow-modal p-1 z-dropdown animate-slide-up">
                    {filteredAgents.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => selectMention(a.id)}
                        className="w-full text-left px-2.5 py-2 rounded-md text-body-sm hover:bg-surface-hover flex items-center gap-2.5 transition-colors duration-[100ms]"
                      >
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                          style={{ backgroundColor: agentColor(a.name) + "30" }}
                        >
                          <span
                            className="text-[8px] font-bold"
                            style={{ color: agentColor(a.name) }}
                          >
                            {a.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span className="text-text-primary font-medium">
                          {a.name}
                        </span>
                        <span
                          className={cn(
                            "w-1.5 h-1.5 rounded-full shrink-0 ml-auto",
                            a.status === "idle" && "bg-success",
                            a.status === "working" && "bg-accent",
                            a.status === "waiting" && "bg-warning",
                            a.status === "offline" && "bg-text-tertiary",
                          )}
                        />
                        <span className="text-label-xs text-text-tertiary">
                          {a.model}
                        </span>
                      </button>
                    ))}
                    <button
                      onClick={() => selectMention("all")}
                      className="w-full text-left px-2.5 py-2 rounded-md text-body-sm hover:bg-surface-hover flex items-center gap-2.5 transition-colors duration-[100ms]"
                    >
                      <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 bg-accent/20">
                        <span className="text-[8px] font-bold text-accent">*</span>
                      </div>
                      <span className="text-text-primary font-medium">all</span>
                      <span className="text-label-xs text-text-tertiary ml-auto">
                        everyone in room
                      </span>
                    </button>
                  </div>
                )}

                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Message the team... (use @agent to direct)"
                  className="flex-1 bg-elevation-2 border border-border rounded-md px-3 py-2 text-body font-mono text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors duration-[100ms]"
                  disabled={!room.active}
                />
                <button
                  onClick={() => void handleSend()}
                  disabled={!input.trim()}
                  className="p-2.5 rounded-md bg-accent text-canvas hover:bg-accent-hover transition-colors duration-[100ms] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
