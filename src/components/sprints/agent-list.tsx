"use client";

import { cn } from "@/lib/utils";
import { agentColor } from "@/lib/design-tokens";
import type { SprintAgent } from "@/stores/sprints";

interface AgentListProps {
  agents: SprintAgent[];
}

const STATUS_LABEL: Record<string, { text: string; class: string }> = {
  idle: { text: "Idle", class: "text-text-tertiary" },
  working: { text: "Working", class: "text-sprints" },
  done: { text: "Done", class: "text-sessions" },
  error: { text: "Error", class: "text-error" },
};

export function AgentList({ agents }: AgentListProps) {
  if (agents.length === 0) {
    return (
      <div className="text-xs text-text-tertiary text-center py-3">
        No agents assigned
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {agents.map((agent) => {
        const color = agent.color || agentColor(agent.name);
        const statusInfo = STATUS_LABEL[agent.status] ?? STATUS_LABEL.idle;

        return (
          <div
            key={agent.name}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-bg-base border border-border-subtle"
          >
            {/* Avatar — 18px rounded-[4px] */}
            <div
              className="w-[18px] h-[18px] rounded-[4px] shrink-0 flex items-center justify-center text-[8px] font-bold text-white"
              style={{ backgroundColor: color }}
            >
              {agent.name.charAt(0).toUpperCase()}
            </div>

            {/* Name + task */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-xs font-medium text-text-primary truncate">
                  {agent.name}
                </span>
                {agent.status === "working" && (
                  <span className="w-[4px] h-[4px] rounded-full bg-sprints animate-pulse-dot shrink-0" />
                )}
              </div>
              {agent.currentTask && (
                <p className="text-xs text-text-ghost truncate">
                  {agent.currentTask}
                </p>
              )}
            </div>

            {/* Status */}
            <span className={cn("text-xs font-medium shrink-0", statusInfo.class)}>
              {statusInfo.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}
