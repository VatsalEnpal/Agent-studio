"use client";

import { useState, useCallback, useEffect } from "react";
import { CloseIcon, PlusIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { agentColor } from "@/lib/design-tokens";
import { useRoomsStore } from "@/stores/rooms";
import type { Room } from "@/stores/rooms";

interface CreateRoomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface AgentConfig {
  id: string;
  name: string;
  model: "opus" | "sonnet" | "haiku";
  enabled: boolean;
}

export function CreateRoomDialog({ open, onOpenChange }: CreateRoomDialogProps) {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [creating, setCreating] = useState(false);
  const addRoom = useRoomsStore((s) => s.addRoom);
  const selectRoom = useRoomsStore((s) => s.selectRoom);

  // Fetch discovered agents from server when dialog opens
  useEffect(() => {
    if (!open) return;
    setName("");
    setTopic("");
    setCreating(false);
    fetch("/api/agents")
      .then((res) => res.json())
      .then((data: Array<{ id: string; name: string; description?: string }>) => {
        const agentConfigs: AgentConfig[] = data
          .filter((a) => a.id !== "none")
          .map((a) => ({
            id: a.id,
            name: a.name,
            model: a.id === "orchestrator" ? ("opus" as const) : ("sonnet" as const),
            enabled: false,
          }));
        setAgents(agentConfigs);
      })
      .catch(() => {
        setAgents([]);
      });
  }, [open]);

  // Escape key to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  const toggleAgent = useCallback((id: string) => {
    setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)));
  }, []);

  const setAgentModel = useCallback((id: string, model: "opus" | "sonnet" | "haiku") => {
    setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, model } : a)));
  }, []);

  const handleCreate = useCallback(async () => {
    if (!name.trim() || !topic.trim() || creating) return;
    setCreating(true);

    const enabledAgents = agents
      .filter((a) => a.enabled)
      .map((a) => ({ id: a.id, name: a.name, model: a.model }));

    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          topic: topic.trim(),
          agents: enabledAgents,
        }),
      });

      if (res.ok) {
        const room = (await res.json()) as Room;
        addRoom(room);
        selectRoom(room.id);
        onOpenChange(false);

        try {
          await fetch(`/api/rooms/${room.id}/spawn`, { method: "POST" });
        } catch (e) {
          console.error("Failed to spawn agent in room:", e);
        }
      }
    } catch (e) {
      console.error("Failed to create room:", e);
    }
    setCreating(false);
  }, [name, topic, agents, creating, addRoom, selectRoom, onOpenChange]);

  if (!open) return null;

  const enabledCount = agents.filter((a) => a.enabled).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={() => onOpenChange(false)}
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-md bg-bg-elevated border border-border-subtle rounded shadow-modal animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-default">
          <h2 className="text-xs font-semibold text-text-primary">Create Team Room</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="p-0.5 rounded text-text-ghost hover:text-text-secondary transition-all"
          >
            <CloseIcon size={12} />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-3">
          {/* Room name */}
          <div>
            <label className="block text-2xs font-medium text-text-ghost uppercase tracking-[0.5px] mb-1">
              Room Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="auth-refactor"
              className="w-full bg-bg-input border border-border-default rounded px-2 py-1 text-xs text-text-primary placeholder:text-text-ghost focus:outline-none focus:border-border-subtle transition-all"
              autoFocus
            />
          </div>

          {/* Topic */}
          <div>
            <label className="block text-2xs font-medium text-text-ghost uppercase tracking-[0.5px] mb-1">
              Topic / Goal
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Refactor auth flow to use server-side sessions"
              className="w-full bg-bg-input border border-border-default rounded px-2 py-1 text-xs text-text-primary placeholder:text-text-ghost focus:outline-none focus:border-border-subtle transition-all"
            />
          </div>

          {/* Agent picker */}
          <div>
            <label className="block text-2xs font-medium text-text-ghost uppercase tracking-[0.5px] mb-1">
              Agents ({enabledCount} selected)
            </label>
            <div className="space-y-1">
              {agents.map((agent) => {
                const color = agentColor(agent.name);
                return (
                  <div
                    key={agent.id}
                    className={cn(
                      "flex items-center gap-2 px-2.5 py-1.5 rounded border transition-all",
                      agent.enabled
                        ? "border-rooms/30 bg-rooms-subtle shadow-[0_0_8px_rgba(124,131,247,0.06)]"
                        : "border-border-default bg-transparent hover:bg-bg-input/30 hover:shadow-[0_0_12px_rgba(124,131,247,0.06)]",
                    )}
                  >
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleAgent(agent.id)}
                      className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all",
                        agent.enabled ? "bg-rooms border-rooms" : "border-text-tertiary",
                      )}
                    >
                      {agent.enabled && (
                        <svg className="w-3 h-3 text-bg-base" viewBox="0 0 12 12">
                          <path
                            d="M2 6l3 3 5-6"
                            stroke="currentColor"
                            strokeWidth="2"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </button>

                    {/* Avatar + Name */}
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <div
                        className="w-[18px] h-[18px] rounded-[4px] flex items-center justify-center shrink-0"
                        style={{ backgroundColor: color + "25" }}
                      >
                        <span className="text-[8px] font-bold" style={{ color }}>
                          {agent.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span
                        className={cn(
                          "text-xs font-medium truncate",
                          agent.enabled ? "text-text-primary" : "text-text-secondary",
                        )}
                      >
                        {agent.name}
                      </span>
                    </div>

                    {/* Model selector */}
                    <select
                      value={agent.model}
                      onChange={(e) =>
                        setAgentModel(agent.id, e.target.value as "opus" | "sonnet" | "haiku")
                      }
                      className="bg-bg-base border border-border-default rounded px-2 py-1 text-label font-mono text-text-secondary focus:outline-none focus:border-border-subtle transition-all"
                    >
                      <option value="opus">opus</option>
                      <option value="sonnet">sonnet</option>
                      <option value="haiku">haiku</option>
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-border-default">
          {enabledCount === 0 && (
            <span className="text-2xs text-text-ghost mr-auto">Select at least one agent</span>
          )}
          <button
            onClick={() => onOpenChange(false)}
            className="px-2.5 py-1 text-xs font-medium text-text-secondary hover:text-text-primary rounded transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleCreate()}
            disabled={!name.trim() || !topic.trim() || enabledCount === 0 || creating}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-rooms text-bg-base hover:bg-rooms/90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            <PlusIcon size={12} />
            {creating ? "Creating..." : "Create Room"}
          </button>
        </div>
      </div>
    </div>
  );
}
