"use client";

import { useState, useCallback, useEffect } from "react";
import { X, Plus, Loader2 } from "lucide-react";
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
  locked?: boolean;
}

const DEFAULT_AGENTS: AgentConfig[] = [
  { id: "orchestrator", name: "Orchestrator", model: "opus", enabled: true, locked: true },
  { id: "frontend-worker", name: "Frontend", model: "sonnet", enabled: false },
  { id: "backend-worker", name: "Backend", model: "sonnet", enabled: false },
  { id: "qa-tester", name: "QA Tester", model: "sonnet", enabled: false },
  { id: "security-reviewer", name: "Security", model: "sonnet", enabled: false },
  { id: "pmo", name: "PMO", model: "haiku", enabled: false },
];

export function CreateRoomDialog({ open, onOpenChange }: CreateRoomDialogProps) {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [agents, setAgents] = useState<AgentConfig[]>(DEFAULT_AGENTS.map((a) => ({ ...a })));
  const [creating, setCreating] = useState(false);
  const addRoom = useRoomsStore((s) => s.addRoom);
  const selectRoom = useRoomsStore((s) => s.selectRoom);

  useEffect(() => {
    if (open) {
      setName("");
      setTopic("");
      setAgents(DEFAULT_AGENTS.map((a) => ({ ...a })));
      setCreating(false);
    }
  }, [open]);

  const toggleAgent = useCallback((id: string) => {
    setAgents((prev) =>
      prev.map((a) => (a.id === id && !a.locked ? { ...a, enabled: !a.enabled } : a)),
    );
  }, []);

  const setAgentModel = useCallback((id: string, model: "opus" | "sonnet" | "haiku") => {
    setAgents((prev) =>
      prev.map((a) => (a.id === id ? { ...a, model } : a)),
    );
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
        } catch {
          // Spawn failure is non-fatal
        }
      }
    } catch {
      // ignore
    }
    setCreating(false);
  }, [name, topic, agents, creating, addRoom, selectRoom, onOpenChange]);

  if (!open) return null;

  const enabledCount = agents.filter((a) => a.enabled).length;

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={() => onOpenChange(false)}
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-lg bg-elevation-3 border border-border rounded-xl shadow-modal animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h2 className="text-title-sm text-text-emphasis">
            Create Team Room
          </h2>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1 rounded-md text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors duration-[100ms]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-5">
          {/* Room name */}
          <div>
            <label className="block text-label-xs text-text-secondary uppercase tracking-[0.04em] mb-1.5">
              Room Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="auth-refactor"
              className="w-full bg-elevation-2 border border-border rounded-md px-3 py-2 text-body font-mono text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors duration-[100ms]"
              autoFocus
            />
          </div>

          {/* Topic */}
          <div>
            <label className="block text-label-xs text-text-secondary uppercase tracking-[0.04em] mb-1.5">
              Topic / Goal
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Refactor auth flow to use server-side sessions"
              className="w-full bg-elevation-2 border border-border rounded-md px-3 py-2 text-body font-mono text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors duration-[100ms]"
            />
          </div>

          {/* Agent picker */}
          <div>
            <label className="block text-label-xs text-text-secondary uppercase tracking-[0.04em] mb-2">
              Agents ({enabledCount} selected)
            </label>
            <div className="space-y-1.5">
              {agents.map((agent) => {
                const color = agentColor(agent.name);
                return (
                  <div
                    key={agent.id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-md border transition-colors duration-[100ms]",
                      agent.enabled
                        ? "border-accent/30 bg-accent-subtle"
                        : "border-border bg-transparent hover:bg-surface-hover/30",
                    )}
                  >
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleAgent(agent.id)}
                      disabled={agent.locked}
                      className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors duration-[100ms]",
                        agent.enabled
                          ? "bg-accent border-accent"
                          : "border-text-tertiary",
                        agent.locked && "opacity-60 cursor-not-allowed",
                      )}
                    >
                      {agent.enabled && (
                        <svg className="w-3 h-3 text-canvas" viewBox="0 0 12 12">
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
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: color + "25" }}
                      >
                        <span className="text-[8px] font-bold" style={{ color }}>
                          {agent.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span
                        className={cn(
                          "text-body-sm font-medium truncate",
                          agent.enabled ? "text-text-primary" : "text-text-secondary",
                        )}
                      >
                        {agent.name}
                        {agent.locked && (
                          <span className="text-label-xs text-text-tertiary ml-1">(required)</span>
                        )}
                      </span>
                    </div>

                    {/* Model selector */}
                    <select
                      value={agent.model}
                      onChange={(e) =>
                        setAgentModel(agent.id, e.target.value as "opus" | "sonnet" | "haiku")
                      }
                      className="bg-canvas border border-border rounded-md px-2 py-0.5 text-label-xs font-mono text-text-secondary focus:outline-none focus:border-accent/50 transition-colors duration-[100ms]"
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
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border">
          <button
            onClick={() => onOpenChange(false)}
            className="px-4 py-1.5 text-body-sm font-medium text-text-secondary hover:text-text-primary rounded-md transition-colors duration-[100ms]"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleCreate()}
            disabled={!name.trim() || !topic.trim() || creating}
            className="flex items-center gap-1.5 px-4 py-1.5 text-body-sm font-medium rounded-md bg-accent text-canvas hover:bg-accent-hover transition-colors duration-[100ms] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {creating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            Create Room
          </button>
        </div>
      </div>
    </div>
  );
}
