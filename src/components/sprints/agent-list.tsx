"use client";

import { cn } from "@/lib/utils";
import { agentColor } from "@/lib/design-tokens";
import type { SprintAgent } from "@/stores/sprints";

interface AgentListProps {
  agents: SprintAgent[];
}

const STATUS_LABEL: Record<string, { text: string; class: string }> = {
  idle: { text: "Idle", class: "text-[var(--text-tertiary)]" },
  working: { text: "Working", class: "text-[var(--accent)]" },
  done: { text: "Done", class: "text-emerald-400" },
  error: { text: "Error", class: "text-red-400" },
};

export function AgentList({ agents }: AgentListProps) {
  if (agents.length === 0) {
    return (
      <div className="text-[10px] text-[var(--text-tertiary)] text-center py-4">
        No agents assigned
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {agents.map((agent) => {
        const color = agent.color || agentColor(agent.name);
        const statusInfo = STATUS_LABEL[agent.status] ?? STATUS_LABEL.idle;

        return (
          <div
            key={agent.name}
            className="flex items-center gap-2.5 px-3 py-2 rounded-md bg-[var(--elevation-0)] border border-[var(--border-subtle)]"
          >
            {/* Avatar dot */}
            <div
              className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[8px] font-bold text-white"
              style={{ backgroundColor: color }}
            >
              {agent.name.charAt(0).toUpperCase()}
            </div>

            {/* Name + task */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-medium text-[var(--text-primary)] truncate">
                  {agent.name}
                </span>
                {agent.status === "working" && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse shrink-0" />
                )}
              </div>
              {agent.currentTask && (
                <p className="text-[9px] text-[var(--text-secondary)] truncate mt-0.5">
                  {agent.currentTask}
                </p>
              )}
            </div>

            {/* Status */}
            <span className={cn("text-[9px] font-medium shrink-0", statusInfo.class)}>
              {statusInfo.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}
