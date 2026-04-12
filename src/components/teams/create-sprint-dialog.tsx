"use client";

import { useState, useCallback, useEffect } from "react";
import { X, Zap, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreateSprintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const AGENT_OPTIONS = [
  { id: "orchestrator", name: "Orchestrator", default: true, locked: true },
  { id: "frontend-worker", name: "Frontend", default: false },
  { id: "backend-worker", name: "Backend", default: false },
  { id: "qa-tester", name: "QA Tester", default: false },
  { id: "security-reviewer", name: "Security", default: false },
] as const;

type AgentId = (typeof AGENT_OPTIONS)[number]["id"];

export function CreateSprintDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateSprintDialogProps) {
  const [goal, setGoal] = useState("");
  const [model, setModel] = useState<"opus" | "sonnet">("opus");
  const [selectedAgents, setSelectedAgents] = useState<Set<AgentId>>(
    new Set(["orchestrator"]),
  );
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cwd, setCwd] = useState("~");

  // Reset on open
  useEffect(() => {
    if (open) {
      setGoal("");
      setModel("opus");
      setSelectedAgents(new Set(["orchestrator"]));
      setCreating(false);
      setError(null);
    }
  }, [open]);

  // Load default working directory
  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const res = await fetch("/api/config");
        if (res.ok) {
          const data = (await res.json()) as {
            config: { defaults?: { workingDirectory?: string } };
          };
          const configCwd = data.config?.defaults?.workingDirectory;
          if (configCwd) setCwd(configCwd);
        }
      } catch (e) {
        console.error("Failed to fetch config for cwd:", e);
      }
    })();
  }, [open]);

  const toggleAgent = useCallback((id: AgentId) => {
    setSelectedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleCreate = useCallback(async () => {
    if (!goal.trim() || creating) return;
    setCreating(true);
    setError(null);

    try {
      // Launch the orchestrator session that kicks off the sprint
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `sprint: ${goal.trim().slice(0, 40)}`,
          command: "claude",
          args: ["--dangerously-skip-permissions"],
          cwd,
          meta: {
            model,
            agent: "orchestrator",
            permissions: "bypass",
            channel: "none",
            group: "sprint",
            sprintGoal: goal.trim(),
            sprintAgents: Array.from(selectedAgents),
          },
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `Server returned ${res.status}`);
      }

      onCreated();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create sprint");
    } finally {
      setCreating(false);
    }
  }, [goal, model, selectedAgents, creating, cwd, onCreated, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={() => onOpenChange(false)}
      />

      <div className="relative z-10 w-full max-w-md bg-console-panel border border-console-border rounded shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-console-border">
          <h2 className="text-[13px] font-medium text-console-text flex items-center gap-2">
            <Zap className="w-4 h-4 text-console-accent" />
            New Sprint
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
          {/* Goal */}
          <div>
            <label className="block text-[10px] font-medium text-console-muted uppercase tracking-wider mb-1.5">
              Sprint Goal
            </label>
            <input
              type="text"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Refactor auth flow to use server sessions"
              className="w-full bg-console-faint border border-console-border rounded px-3 py-2 text-[12px] font-mono text-console-text placeholder:text-console-dim focus:outline-none focus:border-console-accent/50"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && goal.trim()) void handleCreate();
              }}
            />
            <p className="text-[9px] text-console-dim mt-1">
              The orchestrator will plan tasks and assign agents.
            </p>
          </div>

          {/* Model */}
          <div>
            <label className="block text-[10px] font-medium text-console-muted uppercase tracking-wider mb-1.5">
              Model
            </label>
            <div className="flex gap-2">
              {(["opus", "sonnet"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setModel(m)}
                  className={cn(
                    "flex-1 px-3 py-1.5 text-[11px] font-mono rounded border transition-colors",
                    model === m
                      ? "border-console-accent/50 bg-console-accent/10 text-console-text"
                      : "border-console-border text-console-dim hover:text-console-muted",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Agents */}
          <div>
            <label className="block text-[10px] font-medium text-console-muted uppercase tracking-wider mb-1.5">
              Agents ({selectedAgents.size})
            </label>
            <div className="flex flex-wrap gap-1.5">
              {AGENT_OPTIONS.map((agent) => {
                const isSelected = selectedAgents.has(agent.id);
                const isLocked = "locked" in agent && agent.locked;
                return (
                  <button
                    key={agent.id}
                    onClick={() => !isLocked && toggleAgent(agent.id)}
                    disabled={isLocked}
                    className={cn(
                      "px-2.5 py-1 text-[10px] font-mono rounded border transition-colors",
                      isSelected
                        ? "border-console-accent/40 bg-console-accent/10 text-console-text"
                        : "border-console-border text-console-dim hover:text-console-muted",
                      isLocked && "opacity-70 cursor-default",
                    )}
                  >
                    {agent.name}
                    {isLocked && (
                      <span className="text-[8px] text-console-dim ml-1">
                        (required)
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded border-l-2 border-red-500 bg-[#1c0a0a] text-[11px] text-console-text">
              <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-console-border">
          <span className="text-[9px] text-console-dim">
            Launches {model} orchestrator session. Uses API credits.
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onOpenChange(false)}
              className="px-3 py-1.5 text-[11px] font-medium text-console-muted hover:text-console-text rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleCreate()}
              disabled={!goal.trim() || creating}
              className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-medium rounded bg-console-accent text-black hover:bg-console-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {creating ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Zap className="w-3 h-3" />
              )}
              {creating ? "Creating..." : "Start Sprint"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
