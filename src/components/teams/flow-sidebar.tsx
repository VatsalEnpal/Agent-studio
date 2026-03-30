"use client";

import {
  Rocket,
  Check,
  Loader2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkflowFlow, WorkflowRun } from "@/stores/workflows";
import { SystemPanel } from "./system-panel";

const FLOW_ICONS: Record<string, typeof Rocket> = {
  Rocket: Rocket,
};

const RUN_STATUS_CONFIG: Record<
  WorkflowRun["status"],
  { icon: typeof Check; color: string; label: string; badge: string }
> = {
  completed: {
    icon: Check,
    color: "text-console-success",
    label: "Completed",
    badge: "bg-console-success/15 text-console-success",
  },
  running: {
    icon: Loader2,
    color: "text-console-accent",
    label: "Running",
    badge: "bg-console-accent/15 text-console-accent",
  },
  waiting: {
    icon: Clock,
    color: "text-amber-400",
    label: "Waiting",
    badge: "bg-amber-400/15 text-amber-400",
  },
  failed: {
    icon: AlertCircle,
    color: "text-console-error",
    label: "Failed",
    badge: "bg-console-error/15 text-console-error",
  },
};

interface FlowSidebarProps {
  flows: WorkflowFlow[];
  selectedFlowId: string | null;
  selectedRunId: string | null;
  onSelectRun: (flowId: string, runId: string) => void;
}

export function FlowSidebar({
  flows,
  selectedFlowId,
  selectedRunId,
  onSelectRun,
}: FlowSidebarProps) {
  return (
    <aside className="w-[260px] shrink-0 border-r border-console-border bg-console-panel flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-console-border shrink-0">
        <h3 className="text-[10px] font-medium text-console-muted uppercase tracking-wider">
          Workflows
        </h3>
      </div>

      {/* Flow list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-3">
        {flows.map((flow) => {
          const FlowIcon = FLOW_ICONS[flow.icon] ?? Rocket;
          return (
            <div key={flow.id}>
              {/* Flow header */}
              <div className="flex items-center gap-2 px-2 py-1">
                <FlowIcon className="w-3.5 h-3.5 text-console-muted shrink-0" />
                <span className="text-[10px] font-medium text-console-muted truncate">
                  {flow.name}
                </span>
                <span className="text-[8px] text-console-dim font-mono ml-auto shrink-0">
                  {flow.runs.length} runs
                </span>
              </div>

              {/* Run list */}
              <div className="ml-3 space-y-1">
                {flow.runs.map((run) => {
                  const isSelected =
                    selectedFlowId === flow.id && selectedRunId === run.id;
                  const statusConfig = RUN_STATUS_CONFIG[run.status];
                  const StatusIcon = statusConfig.icon;

                  // Calculate step progress
                  const completedSteps = run.steps.filter(
                    (s) => s.status === "completed",
                  ).length;
                  const totalSteps = run.steps.length;

                  return (
                    <button
                      key={run.id}
                      onClick={() => onSelectRun(flow.id, run.id)}
                      className={cn(
                        "flex flex-col gap-1 w-full px-2.5 py-2 rounded text-left transition-colors",
                        isSelected
                          ? "bg-console-faint border border-console-border"
                          : "hover:bg-console-faint/30",
                        run.status === "waiting" &&
                          !isSelected &&
                          "border border-amber-400/30",
                        run.status === "running" &&
                          !isSelected &&
                          "border border-console-accent/30",
                      )}
                    >
                      {/* Row 1: icon + name + date */}
                      <div className="flex items-center gap-2 w-full">
                        <StatusIcon
                          className={cn(
                            "w-3 h-3 shrink-0",
                            statusConfig.color,
                            run.status === "running" && "animate-spin",
                          )}
                        />
                        <span
                          className={cn(
                            "text-[10px] truncate flex-1 min-w-0 font-medium",
                            isSelected
                              ? "text-console-text"
                              : "text-console-muted",
                          )}
                        >
                          {run.name}
                        </span>
                        <span className="text-[8px] text-console-dim font-mono shrink-0">
                          {formatRunDate(run.startedAt)}
                        </span>
                      </div>

                      {/* Row 2: status badge + step progress */}
                      <div className="flex items-center gap-2 pl-5">
                        <span
                          className={cn(
                            "text-[8px] px-1 py-0.5 rounded font-medium",
                            statusConfig.badge,
                          )}
                        >
                          {statusConfig.label}
                        </span>
                        <span className="text-[8px] text-console-dim">
                          {completedSteps}/{totalSteps} steps
                        </span>
                        {run.stats.agentsUsed.length > 0 && (
                          <span className="text-[8px] text-console-dim ml-auto">
                            {run.stats.agentsUsed.length} agents
                          </span>
                        )}
                      </div>

                      {/* Progress bar */}
                      {totalSteps > 0 && (
                        <div className="ml-5 h-0.5 bg-console-border rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              run.status === "completed"
                                ? "bg-console-success"
                                : run.status === "running"
                                  ? "bg-console-accent"
                                  : "bg-amber-400",
                            )}
                            style={{
                              width: `${(completedSteps / totalSteps) * 100}%`,
                            }}
                          />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {flows.length === 0 && (
          <div className="text-[10px] text-console-dim text-center py-4">
            No workflows found
          </div>
        )}
      </div>

      {/* System stats panel at bottom */}
      <div className="px-2 pb-2 shrink-0">
        <SystemPanel />
      </div>
    </aside>
  );
}

function formatRunDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  } catch {
    return "";
  }
}
