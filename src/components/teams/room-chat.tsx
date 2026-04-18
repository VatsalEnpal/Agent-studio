"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { SendIcon, HashIcon, ChevronDownIcon, SettingsIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { agentColor } from "@/lib/design-tokens";
import { useRoomsStore } from "@/stores/rooms";
import { useUIStore } from "@/stores/ui";
import { useToastStore } from "@/components/ui/notification-toast";
import { useHasAgentSystem } from "@/hooks/use-config";
import { notifyMention, getNotificationPrefs } from "@/lib/notifications";
import { wsClient } from "@/lib/ws-client";
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
  const room = useRoomsStore((s) => s.rooms.find((r) => r.id === s.selectedRoomId));

  const typingAgents = useRoomsStore((s) => s.typingAgents);
  const streamingText = useRoomsStore((s) => s.streamingText);
  const waitingForUser = useRoomsStore((s) =>
    room ? (s.waitingForUser[room.id] ?? false) : false,
  );
  const roomTyping = room ? (typingAgents[room.id] ?? []) : [];
  const typingAgentIds = roomTyping.map((ta) => ta.agentId);

  const [input, setInput] = useState("");
  const [spawning, setSpawning] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const addToast = useToastStore((s) => s.addToast);

  // Auto-scroll on new messages (only if near bottom)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [room?.messages.length, typingAgentIds.length]);

  // Track scroll position to show/hide "scroll to bottom" button
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      setShowScrollDown(distFromBottom > 200);
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Focus input when room changes
  useEffect(() => {
    inputRef.current?.focus();
  }, [selectedRoomId]);

  // Subscribe to this room's WebSocket topic so room-message / room-agent-*
  // frames are delivered. Other rooms' traffic is filtered server-side.
  useEffect(() => {
    if (!selectedRoomId) return;
    return wsClient.subscribeTopic(`room:${selectedRoomId}`);
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
        notifyMention(lastMsg.from ?? "Agent", (lastMsg.text ?? "").slice(0, 100), room.id);
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

    // Clear waiting-for-user state — the human has responded
    useRoomsStore.getState().clearWaitingForUser(selectedRoomId);

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
      try {
        const res = await fetch(`/api/rooms/${selectedRoomId}/messages/${msg.id}/approve`, {
          method: "POST",
        });
        if (!res.ok) throw new Error(`Approve failed (${res.status})`);
      } catch (err) {
        useToastStore.getState().addToast({
          type: "error",
          title: "Could not approve action",
          body: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [selectedRoomId],
  );

  const handleReject = useCallback(
    async (msg: RoomMessage) => {
      if (!selectedRoomId) return;
      try {
        const res = await fetch(`/api/rooms/${selectedRoomId}/messages/${msg.id}/reject`, {
          method: "POST",
        });
        if (!res.ok) throw new Error(`Reject failed (${res.status})`);
      } catch (err) {
        useToastStore.getState().addToast({
          type: "error",
          title: "Could not reject action",
          body: err instanceof Error ? err.message : String(err),
        });
      }
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
        a.id.toLowerCase().includes(mentionFilter) || a.name.toLowerCase().includes(mentionFilter),
    );

  const hasAgentSystem = useHasAgentSystem();

  if (!room) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-sm px-6">
          <div className="w-12 h-12 rounded bg-bg-elevated flex items-center justify-center mx-auto mb-3">
            <HashIcon size={20} className="text-text-ghost" />
          </div>
          <p className="text-xs font-medium text-text-secondary mb-1">No room selected</p>
          <p className="text-xs text-text-tertiary leading-relaxed">
            Select a room from the sidebar or create a new one to start chatting with your agent
            team.
          </p>
          {!hasAgentSystem && (
            <>
              <p className="text-xs text-text-tertiary leading-relaxed mt-3">
                Rooms require an agent system. Set one up in Settings to define your agents and
                start collaborating.
              </p>
              <button
                onClick={() => useUIStore.getState().setActiveMode("settings")}
                className="flex items-center gap-1.5 px-3 py-1.5 text-label font-medium text-text-secondary bg-bg-elevated hover:bg-bg-elevated/80 rounded border border-border-default hover:border-text-secondary transition-all mt-3 mx-auto"
              >
                <SettingsIcon size={12} />
                Create Agent System
              </button>
            </>
          )}
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
            <span className="text-xs font-semibold text-text-primary truncate">{room.name}</span>
            <span className="text-xs text-text-ghost truncate hidden sm:inline">{room.topic}</span>
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
          <span className="text-xs text-text-ghost shrink-0">{room.agents.length}</span>

          {/* Spawn button */}
          {room.active && allOffline && (
            <button
              onClick={handleSpawn}
              disabled={spawning}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-rooms text-bg-base hover:bg-rooms/90 transition-all active:scale-[0.98] disabled:opacity-50 shrink-0"
            >
              {spawning ? "Starting..." : "Spawn Agents"}
            </button>
          )}

          {/* Close button */}
          {room.active && (
            <button
              onClick={handleClose}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded text-error hover:bg-error/10 transition-all active:scale-[0.98] shrink-0"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Legacy room banner */}
      {!room.active && (
        <div className="px-3 py-2 border-b border-sprints/20 bg-sprints/5 text-xs text-sprints shrink-0">
          This room was created in an older version. Messages may contain terminal artifacts.
        </div>
      )}

      {/* Big spawn CTA when all agents offline and no messages */}
      {room.active && allOffline && room.messages.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="w-12 h-12 rounded bg-bg-elevated flex items-center justify-center mx-auto">
              <HashIcon size={20} className="text-text-ghost" />
            </div>
            <h3 className="text-xs font-medium text-text-secondary">Agents are offline</h3>
            <p className="text-xs text-text-tertiary max-w-xs">
              Spawn all agents to start chatting in this room
            </p>
            <button
              onClick={handleSpawn}
              disabled={spawning}
              className="px-2.5 py-1 bg-rooms text-bg-base text-xs font-medium rounded hover:bg-rooms/90 transition-all active:scale-[0.98] disabled:opacity-50 shadow-rooms-glow"
            >
              {spawning ? "Starting..." : "Start Room"}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Messages area */}
          <div ref={scrollContainerRef} className="relative flex-1 overflow-y-auto scrollbar-thin">
            {/* Scroll to bottom button */}
            {showScrollDown && (
              <button
                onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })}
                className="sticky top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 px-2.5 py-1 text-2xs font-medium bg-bg-elevated border border-border-default rounded-full text-text-secondary hover:text-text-primary hover:border-rooms/30 shadow-card transition-all"
              >
                <ChevronDownIcon size={10} />
                New messages
              </button>
            )}
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
                <p className="text-xs text-text-secondary font-medium">Start the conversation</p>
                <p className="text-xs text-text-tertiary">
                  Send a message to begin collaborating with agents in this room
                </p>
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

          {/* Waiting-for-user banner */}
          {waitingForUser && (
            <div className="px-3 py-2 border-t border-amber-500/20 bg-amber-500/10 flex items-center gap-2 shrink-0">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
              <span className="text-xs text-amber-200 font-medium">
                Agents are waiting for your input. Send a message to continue the conversation.
              </span>
            </div>
          )}

          {/* Typing indicator bar */}
          <TypingIndicator typingAgents={roomTyping} roomAgents={room.agents} />

          {/* Spawn banner when offline but has messages */}
          {room.active && allOffline && messages.length > 0 && (
            <div className="px-3 py-2 border-t border-border-default bg-bg-elevated flex items-center justify-between">
              <span className="text-xs text-text-tertiary">All agents are offline</span>
              <button
                onClick={handleSpawn}
                disabled={spawning}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-rooms text-bg-base hover:bg-rooms/90 transition-all active:scale-[0.98] disabled:opacity-50"
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
                  <div className="absolute bottom-full left-0 mb-2 w-56 bg-bg-elevated border border-border-subtle rounded shadow-modal p-1 z-40 animate-slide-up">
                    {filteredAgents.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => selectMention(a.id)}
                        className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-bg-input flex items-center gap-2 transition-all"
                      >
                        <div
                          className="w-4 h-4 rounded-[4px] flex items-center justify-center shrink-0"
                          style={{ backgroundColor: agentColor(a.name) }}
                        >
                          <span className="text-[7px] font-bold text-white">
                            {a.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span className="text-text-primary font-medium">{a.name}</span>
                        <span
                          className={cn(
                            "w-1.5 h-1.5 rounded-full shrink-0 ml-auto",
                            a.status === "idle" && "bg-sessions",
                            a.status === "working" && "bg-rooms",
                            a.status === "waiting" && "bg-sprints",
                            a.status === "offline" && "bg-text-ghost",
                          )}
                        />
                        <span className="text-label text-text-ghost">{a.model}</span>
                      </button>
                    ))}
                    <button
                      onClick={() => selectMention("all")}
                      className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-bg-input flex items-center gap-2 transition-all"
                    >
                      <div className="w-4 h-4 rounded-[4px] flex items-center justify-center shrink-0 bg-rooms/20">
                        <span className="text-[7px] font-bold text-rooms">*</span>
                      </div>
                      <span className="text-text-primary font-medium">all</span>
                      <span className="text-label text-text-ghost ml-auto">everyone in room</span>
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
                  className="flex-1 bg-bg-input border border-border-default rounded px-3 py-1.5 text-xs text-text-primary placeholder:text-text-ghost focus:outline-none focus:border-border-subtle transition-all"
                  disabled={!room.active}
                />
                <button
                  onClick={() => void handleSend()}
                  disabled={!input.trim()}
                  className="p-2 rounded bg-rooms text-bg-base hover:bg-rooms/90 transition-all active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed"
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
