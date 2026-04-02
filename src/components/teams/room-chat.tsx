"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Hash, Loader2, Power, PowerOff, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRoomsStore } from "@/stores/rooms";
import type { Room, RoomMessage } from "@/stores/rooms";
import { ChatMessage, StreamingMessage } from "./chat-message";

export function RoomChat() {
  const selectedRoomId = useRoomsStore((s) => s.selectedRoomId);
  const room = useRoomsStore((s) =>
    s.rooms.find((r) => r.id === s.selectedRoomId),
  );

  const typingAgents = useRoomsStore((s) => s.typingAgents);
  const streamingText = useRoomsStore((s) => s.streamingText);
  const typingAgentIds = room ? (typingAgents[room.id] ?? []) : [];

  const [input, setInput] = useState("");
  const [spawning, setSpawning] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [room?.messages.length]);

  // Focus input when room changes
  useEffect(() => {
    inputRef.current?.focus();
  }, [selectedRoomId]);

  // Mark room as seen when viewing it or when messages change
  useEffect(() => {
    if (selectedRoomId) {
      useRoomsStore.getState().markRoomSeen(selectedRoomId);
    }
  }, [selectedRoomId, room?.messages.length]);

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

    // Detect @mention for the "to" field
    const mentionMatch = text.match(/@(\w+)/);
    const to = mentionMatch ? mentionMatch[1] : undefined;

    // No optimistic update — let the WebSocket broadcast add the message once.
    // This prevents duplicates (optimistic + echo) when dedup fails or IDs mismatch.
    fetch(`/api/rooms/${selectedRoomId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: "user", text, to }),
    }).catch(() => {
      // Network error — message was not sent
    });
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
      await fetch(`/api/rooms/${selectedRoomId}/approve/${msg.id}`, {
        method: "POST",
      });
    },
    [selectedRoomId],
  );

  const handleReject = useCallback(
    async (msg: RoomMessage) => {
      if (!selectedRoomId) return;
      await fetch(`/api/rooms/${selectedRoomId}/reject/${msg.id}`, {
        method: "POST",
      });
    },
    [selectedRoomId],
  );

  const handleSpawn = useCallback(async () => {
    if (!selectedRoomId || spawning) return;
    setSpawning(true);
    try {
      await fetch(`/api/rooms/${selectedRoomId}/spawn`, { method: "POST" });
    } catch {
      // ignore
    }
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
        // Select another active room, or clear selection
        const active = (data as Room[]).filter((r: Room) => r.active);
        useRoomsStore.getState().selectRoom(active.length > 0 ? active[0].id : null);
      }
    } catch {
      // ignore
    }
  }, [selectedRoomId]);

  if (!room) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-sm px-6">
          <Hash className="w-8 h-8 text-console-dim mx-auto mb-3" />
          <p className="text-console-dim text-[11px] mb-1">
            No room selected
          </p>
          <p className="text-console-dim/60 text-[10px] leading-relaxed">
            Select a room from the sidebar or create a new one to start chatting
            with your agent team.
          </p>
        </div>
      </div>
    );
  }

  const allOffline = (room.agents ?? []).every((a) => a.status === "offline");

  // Filtered agents for mention dropdown — exclude agents with missing id/name
  const filteredAgents = (room.agents ?? [])
    .filter((a) => a && a.id && a.name)
    .filter(
      (a) =>
        (a.id ?? "").toLowerCase().includes(mentionFilter) ||
        (a.name ?? "").toLowerCase().includes(mentionFilter),
    );

  return (
    <div className="flex flex-col h-full">
      {/* Room header */}
      <div className="px-4 py-2.5 border-b border-console-border shrink-0">
        <div className="flex items-center gap-2">
          <Hash className="w-4 h-4 text-console-dim shrink-0" />
          <span className="text-[13px] font-medium text-console-text truncate">
            {room.name}
          </span>
          <span className="text-[10px] text-console-dim truncate hidden sm:inline">
            &mdash; {room.topic}
          </span>
          {room.active && (
            <span className="text-[8px] px-1.5 py-0.5 rounded font-medium bg-console-success/15 text-console-success shrink-0">
              Active
            </span>
          )}
          {!room.active && (
            <span className="text-[8px] px-1.5 py-0.5 rounded font-medium bg-console-dim/15 text-console-dim shrink-0">
              Closed
            </span>
          )}

          {/* Agent status dots */}
          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            {room.agents.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-1"
                title={`${a.name}: ${a.status}`}
              >
                <span
                  className={cn(
                    "w-2 h-2 rounded-full",
                    a.status === "idle"
                      ? "bg-green-400"
                      : a.status === "working"
                        ? "bg-amber-400 animate-pulse"
                        : a.status === "waiting"
                          ? "bg-blue-400 animate-pulse"
                          : "bg-gray-500",
                  )}
                />
                <span className="text-[9px] text-console-dim font-mono">
                  {a.id}
                </span>
              </div>
            ))}

            {/* Close button — always visible for active rooms */}
            {room.active && (
              <button
                onClick={handleClose}
                className="flex items-center gap-1 ml-2 px-2 py-1 text-[10px] font-medium rounded bg-console-error/15 text-console-error hover:bg-console-error/25 transition-colors"
              >
                <PowerOff className="w-3 h-3" />
                Close Room
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Big spawn CTA when all agents are offline */}
      {room.active && allOffline && room.messages.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <Users className="w-10 h-10 text-console-dim mx-auto" />
            <h3 className="text-sm font-semibold text-console-text">
              Agents are offline
            </h3>
            <p className="text-xs text-console-muted">
              Spawn all agents to start chatting
            </p>
            <button
              onClick={handleSpawn}
              disabled={spawning}
              className="px-5 py-2.5 bg-console-accent text-black text-sm font-semibold rounded-lg hover:bg-console-accent/90 transition-colors disabled:opacity-50"
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
          <div className="flex-1 overflow-y-auto">
            {room.messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-console-dim text-[10px]">
                No messages yet. Send a message to begin.
              </div>
            ) : (
              <div className="divide-y divide-console-border/30">
                {room.messages.map((msg) => (
                  <ChatMessage
                    key={msg.id}
                    msg={msg}
                    onApprove={handleApprove}
                    onReject={handleReject}
                  />
                ))}
                {/* Streaming ghost messages — shown while agents are typing */}
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

          {/* Spawn banner when offline but has messages */}
          {room.active && allOffline && room.messages.length > 0 && (
            <div className="px-4 py-3 border-t border-console-border bg-console-faint flex items-center justify-between">
              <span className="text-[11px] text-console-muted">
                All agents are offline
              </span>
              <button
                onClick={handleSpawn}
                disabled={spawning}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded bg-console-accent text-black hover:bg-console-accent/90 transition-colors disabled:opacity-50"
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
            <div className="px-4 py-3 border-t border-console-border shrink-0">
              <div className="relative flex items-center gap-2">
                {/* @mention dropdown */}
                {showMentions && (
                  <div className="absolute bottom-full left-0 mb-1 w-64 bg-console-panel border border-console-border rounded-lg shadow-lg p-1 z-10">
                    {filteredAgents.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => selectMention(a.id)}
                        className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-console-elevated flex items-center gap-2"
                      >
                        <span
                          className={cn(
                            "w-2 h-2 rounded-full shrink-0",
                            a.status === "idle"
                              ? "bg-green-400"
                              : a.status === "working"
                                ? "bg-amber-400"
                                : a.status === "waiting"
                                  ? "bg-blue-400"
                                  : "bg-gray-500",
                          )}
                        />
                        <span className="text-console-text font-mono">
                          {a.name}
                        </span>
                        <span className="text-console-dim text-[10px]">
                          {a.model}
                        </span>
                      </button>
                    ))}
                    <button
                      onClick={() => selectMention("all")}
                      className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-console-elevated flex items-center gap-2"
                    >
                      <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                      <span className="text-console-text font-mono">all</span>
                      <span className="text-console-dim text-[10px]">
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
                  className="flex-1 bg-console-faint border border-console-border rounded px-3 py-1.5 text-[12px] font-mono text-console-text placeholder:text-console-dim focus:outline-none focus:border-console-accent/50 transition-colors"
                  disabled={!room.active}
                />
                <button
                  onClick={() => void handleSend()}
                  disabled={!input.trim()}
                  className="p-2 rounded bg-console-accent/15 text-console-accent hover:bg-console-accent/25 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
