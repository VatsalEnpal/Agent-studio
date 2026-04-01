"use client";

import { useState, useCallback, useEffect } from "react";
import { X, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
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
  locked?: boolean; // orchestrator is always enabled
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

  // Reset form when dialog opens
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

        // Auto-spawn agents so they're ready immediately
        try {
          await fetch(`/api/rooms/${room.id}/spawn`, { method: "POST" });
        } catch {
          // Spawn failure is non-fatal — user can retry via Start Room button
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-lg bg-console-panel border border-console-border rounded-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-console-border">
          <h2 className="text-[13px] font-medium text-console-text">
            Create Team Room
          </h2>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1 rounded text-console-dim hover:text-console-text transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Room name */}
          <div>
            <label className="block text-[10px] font-medium text-console-muted uppercase tracking-wider mb-1.5">
              Room Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="auth-refactor"
              className="w-full bg-console-faint border border-console-border rounded px-3 py-2 text-[12px] font-mono text-console-text placeholder:text-console-dim focus:outline-none focus:border-console-accent/50"
              autoFocus
            />
          </div>

          {/* Topic */}
          <div>
            <label className="block text-[10px] font-medium text-console-muted uppercase tracking-wider mb-1.5">
              Topic / Goal
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Refactor auth flow to use server-side sessions"
              className="w-full bg-console-faint border border-console-border rounded px-3 py-2 text-[12px] font-mono text-console-text placeholder:text-console-dim focus:outline-none focus:border-console-accent/50"
            />
          </div>

          {/* Agent picker */}
          <div>
            <label className="block text-[10px] font-medium text-console-muted uppercase tracking-wider mb-2">
              Agents ({enabledCount} selected)
            </label>
            <div className="space-y-2">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded border transition-colors",
                    agent.enabled
                      ? "border-console-accent/30 bg-console-faint"
                      : "border-console-border bg-transparent",
                  )}
                >
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleAgent(agent.id)}
                    disabled={agent.locked}
                    className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                      agent.enabled
                        ? "bg-console-accent border-console-accent"
                        : "border-console-border",
                      agent.locked && "opacity-60 cursor-not-allowed",
                    )}
                  >
                    {agent.enabled && (
                      <svg className="w-3 h-3 text-black" viewBox="0 0 12 12">
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

                  {/* Name */}
                  <span
                    className={cn(
                      "text-[11px] font-mono flex-1",
                      agent.enabled ? "text-console-text" : "text-console-dim",
                    )}
                  >
                    {agent.name}
                    {agent.locked && (
                      <span className="text-[8px] text-console-dim ml-1">(required)</span>
                    )}
                  </span>

                  {/* Model selector */}
                  <select
                    value={agent.model}
                    onChange={(e) =>
                      setAgentModel(agent.id, e.target.value as "opus" | "sonnet" | "haiku")
                    }
                    className="bg-console-bg border border-console-border rounded px-2 py-0.5 text-[10px] font-mono text-console-muted focus:outline-none"
                  >
                    <option value="opus">opus</option>
                    <option value="sonnet">sonnet</option>
                    <option value="haiku">haiku</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-console-border">
          <button
            onClick={() => onOpenChange(false)}
            className="px-4 py-1.5 text-[11px] font-medium text-console-muted hover:text-console-text rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleCreate()}
            disabled={!name.trim() || !topic.trim() || creating}
            className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-medium rounded bg-console-accent text-black hover:bg-console-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {creating ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Plus className="w-3 h-3" />
            )}
            Create Room
          </button>
        </div>
      </div>
    </div>
  );
}
