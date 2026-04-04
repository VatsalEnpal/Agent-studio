"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { SendIcon, HashIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { agentColor } from "@/lib/design-tokens";
import { useRoomsStore } from "@/stores/rooms";
import { useUIStore } from "@/stores/ui";
import { useToastStore } from "@/components/ui/notification-toast";
import { notifyMention, getNotificationPrefs } from "@/lib/notifications";
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

  // Fire toast + native notification when agent mentions @vatsal or @human
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
      const prefs = getNotificationPrefs();
      if (prefs.approvals) {
        notifyMention(
          lastMsg.from ?? "Agent",
          (lastMsg.text ?? "").slice(0, 100),
          room.id,
        );
      }
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
    }).catch((err) => {
      useToastStore.getState().addToast({
        type: "error",
        title: "Failed to send message",
        body: err instanceof Error ? err.message : String(err),
      });
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
    } catch (err) {
      useToastStore.getState().addToast({
        type: "error",
        title: "Failed to spawn agents",
        body: err instanceof Error ? err.message : String(err),
      });
    }
    setSpawning(false);
  }, [selectedRoomId, spawning]);

  // UX #6: Click agent name → navigate to their session
  const handleAgentClick = useCallback(
    (agentId: string) => {
      const agent = room?.agents.find((a) => a.id === agentId || a.name === agentId);
      if (agent?.sessionId) {
        useUIStore.getState().navigateToSession(agent.sessionId);
      }
    },
    [room?.agents],
  );

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
    } catch (err) {
      useToastStore.getState().addToast({
        type: "error",
        title: "Failed to refresh rooms after close",
        body: err instanceof Error ? err.message : String(err),
      });
    }
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
          <div className="w-12 h-12 rounded-xl bg-bg-elevated flex items-center justify-center mx-auto mb-3">
            <HashIcon size={20} className="text-text-ghost" />
          </div>
          <p className="text-[10px] font-medium text-text-secondary mb-1">
            No room selected
          </p>
          <p className="text-[10px] text-text-tertiary leading-relaxed">
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
      <div className="px-3 py-2 border-b border-border-default shrink-0 bg-bg-surface">
        <div className="flex items-center gap-2">
          <HashIcon size={12} className="text-rooms shrink-0" />
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-[10px] font-semibold text-text-primary truncate">
              {room.name}
            </span>
            <span className="text-[10px] text-text-ghost truncate hidden sm:inline">
              {room.topic}
            </span>
          </div>

          {/* Agent avatars — 16px colored squares */}
          <div className="flex items-center -space-x-1 shrink-0">
            {room.agents.slice(0, 5).map((a) => {
              const color = agentColor(a.name);
              return (
                <div
                  key={a.id}
                  className="w-4 h-4 rounded-[4px] flex items-center justify-center border border-bg-surface"
                  style={{ backgroundColor: color }}
                  title={`${a.name}: ${a.status}`}
                >
                  <span className="text-[7px] font-bold text-white leading-none">
                    {a.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Member count */}
          <span className="text-[10px] text-text-ghost shrink-0">
            {room.agents.length}
          </span>

          {/* Spawn button */}
          {room.active && allOffline && (
            <button
              onClick={handleSpawn}
              disabled={spawning}
              className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded-md bg-rooms text-bg-base hover:bg-rooms/90 transition-colors disabled:opacity-50 shrink-0"
            >
              {spawning ? "Starting..." : "Spawn Agents"}
            </button>
          )}

          {/* Close button */}
          {room.active && (
            <button
              onClick={handleClose}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md text-error hover:bg-error/10 transition-colors shrink-0"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Legacy room banner */}
      {!room.active && (
        <div className="px-3 py-2 border-b border-sprints/20 bg-sprints/5 text-[10px] text-sprints shrink-0">
          This room was created in an older version. Messages may contain terminal artifacts.
        </div>
      )}

      {/* Big spawn CTA when all agents offline and no messages */}
      {room.active && allOffline && room.messages.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-bg-elevated flex items-center justify-center mx-auto">
              <HashIcon size={20} className="text-text-ghost" />
            </div>
            <h3 className="text-[10px] font-medium text-text-secondary">
              Agents are offline
            </h3>
            <p className="text-[10px] text-text-tertiary max-w-xs">
              Spawn all agents to start chatting in this room
            </p>
            <button
              onClick={handleSpawn}
              disabled={spawning}
              className="px-2.5 py-1 bg-rooms text-bg-base text-[10px] font-medium rounded-md hover:bg-rooms/90 transition-colors disabled:opacity-50 shadow-rooms-glow"
            >
              {spawning ? "Starting..." : "Start Room"}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Messages area */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
                <p className="text-[10px] text-text-secondary font-medium">No messages yet</p>
                <p className="text-[10px] text-text-tertiary">Type a message below to start the conversation</p>
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
                    onAgentClick={handleAgentClick}
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
            <div className="px-3 py-2 border-t border-border-default bg-bg-elevated flex items-center justify-between">
              <span className="text-[10px] text-text-tertiary">
                All agents are offline
              </span>
              <button
                onClick={handleSpawn}
                disabled={spawning}
                className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded-md bg-rooms text-bg-base hover:bg-rooms/90 transition-colors disabled:opacity-50"
              >
                {spawning ? "Starting..." : "Start Room"}
              </button>
            </div>
          )}

          {/* Input bar */}
          {room.active && (
            <div className="px-3 py-2 border-t border-border-default shrink-0 bg-bg-surface">
              <div className="relative flex items-center gap-2">
                {/* @mention dropdown */}
                {showMentions && (
                  <div className="absolute bottom-full left-0 mb-2 w-56 bg-bg-elevated border border-border-subtle rounded-lg shadow-modal p-1 z-40 animate-slide-up">
                    {filteredAgents.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => selectMention(a.id)}
                        className="w-full text-left px-2 py-1.5 rounded-md text-[10px] hover:bg-bg-input flex items-center gap-2 transition-colors"
                      >
                        <div
                          className="w-4 h-4 rounded-[4px] flex items-center justify-center shrink-0"
                          style={{ backgroundColor: agentColor(a.name) }}
                        >
                          <span className="text-[7px] font-bold text-white">
                            {a.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span className="text-text-primary font-medium">
                          {a.name}
                        </span>
                        <span
                          className={cn(
                            "w-1.5 h-1.5 rounded-full shrink-0 ml-auto",
                            a.status === "idle" && "bg-sessions",
                            a.status === "working" && "bg-rooms",
                            a.status === "waiting" && "bg-sprints",
                            a.status === "offline" && "bg-text-ghost",
                          )}
                        />
                        <span className="text-label text-text-ghost">
                          {a.model}
                        </span>
                      </button>
                    ))}
                    <button
                      onClick={() => selectMention("all")}
                      className="w-full text-left px-2 py-1.5 rounded-md text-[10px] hover:bg-bg-input flex items-center gap-2 transition-colors"
                    >
                      <div className="w-4 h-4 rounded-[4px] flex items-center justify-center shrink-0 bg-rooms/20">
                        <span className="text-[7px] font-bold text-rooms">*</span>
                      </div>
                      <span className="text-text-primary font-medium">all</span>
                      <span className="text-label text-text-ghost ml-auto">
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
                  placeholder={`Message #${room.name}...`}
                  className="flex-1 bg-bg-input border border-border-default rounded-md px-3 py-1.5 text-[10px] text-text-primary placeholder:text-text-ghost focus:outline-none focus:border-border-subtle transition-colors"
                  disabled={!room.active}
                />
                <button
                  onClick={() => void handleSend()}
                  disabled={!input.trim()}
                  className="p-2 rounded-md bg-rooms text-bg-base hover:bg-rooms/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <SendIcon size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
