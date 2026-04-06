"use client";

import { useCallback } from "react";
import { SprintsIcon, CheckIcon, SearchIcon, PlusIcon, EditIcon, TrashIcon, ChevronRightIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { useWorkflowStore, type WorkflowFlow, type WorkflowRun } from "@/stores/workflows";
import { useToastStore } from "@/stores/toast";
import { SystemPanel } from "./system-panel";

type IconComponent = React.ComponentType<{ className?: string; size?: number }>;

const RUN_STATUS_CONFIG: Record<
  WorkflowRun["status"],
  { icon: IconComponent; color: string; label: string; badge: string }
> = {
  completed: {
    icon: CheckIcon,
    color: "text-sessions",
    label: "Completed",
    badge: "bg-sessions/15 text-sessions",
  },
  running: {
    icon: SprintsIcon,
    color: "text-rooms",
    label: "Running",
    badge: "bg-rooms/15 text-rooms",
  },
  waiting: {
    icon: SearchIcon,
    color: "text-sprints",
    label: "Waiting",
    badge: "bg-sprints/15 text-sprints",
  },
  failed: {
    icon: SprintsIcon,
    color: "text-error",
    label: "Failed",
    badge: "bg-error/15 text-error",
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
  const openBuilder = useWorkflowStore((s) => s.openBuilder);
  const addToast = useToastStore((s) => s.addToast);

  const handleRun = useCallback(
    async (flowId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        const res = await fetch(`/api/workflows/${encodeURIComponent(flowId)}/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const data = await res.json() as { ok?: boolean; runId?: string; error?: string };
        if (!data.ok) throw new Error(data.error ?? "Failed to start run");
        addToast("Workflow run started", "success");
        if (data.runId) onSelectRun(flowId, data.runId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        addToast(`Run failed: ${msg}`, "error");
      }
    },
    [addToast, onSelectRun],
  );

  const handleDelete = useCallback(
    async (flowId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!flowId.startsWith("custom-")) {
        addToast("Built-in workflows cannot be deleted", "warning");
        return;
      }
      try {
        const res = await fetch(`/api/workflows/${encodeURIComponent(flowId)}`, {
          method: "DELETE",
        });
        const data = await res.json() as { ok?: boolean; error?: string };
        if (!data.ok) throw new Error(data.error ?? "Failed to delete");
        addToast("Workflow deleted", "success");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        addToast(`Delete failed: ${msg}`, "error");
      }
    },
    [addToast],
  );

  return (
    <aside className="w-[260px] shrink-0 border-r border-border-default bg-bg-surface flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border-default shrink-0 flex items-center justify-between">
        <h3 className="text-label text-text-ghost uppercase tracking-[0.06em]">
          Workflows
        </h3>
        <button
          onClick={() => openBuilder()}
          className="flex items-center gap-1 px-2 py-1 text-label font-medium bg-rooms text-bg-base rounded hover:bg-rooms/90 transition-all active:scale-[0.98]"
        >
          <PlusIcon size={12} />
          Create
        </button>
      </div>

      {/* Flow list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-3 scrollbar-thin">
        {flows.map((flow) => {
          const isCustom = flow.id.startsWith("custom-");
          return (
            <div key={flow.id}>
              {/* Flow header */}
              <div className="flex items-center gap-2 px-2 py-1 group">
                <SprintsIcon size={14} className="text-text-ghost shrink-0" />
                <span className="text-label text-text-ghost truncate flex-1 min-w-0">
                  {flow.name}
                </span>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={(e) => handleRun(flow.id, e)}
                    className="p-0.5 text-text-ghost hover:text-rooms transition-all"
                    title="Run workflow"
                  >
                    <ChevronRightIcon size={12} />
                  </button>
                  {isCustom && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openBuilder(flow.id);
                        }}
                        className="p-0.5 text-text-ghost hover:text-text-secondary transition-all"
                        title="Edit workflow"
                      >
                        <EditIcon size={12} />
                      </button>
                      <button
                        onClick={(e) => handleDelete(flow.id, e)}
                        className="p-0.5 text-text-ghost hover:text-error transition-all"
                        title="Delete workflow"
                      >
                        <TrashIcon size={12} />
                      </button>
                    </>
                  )}
                </div>
                <span className="text-[8px] text-text-ghost font-mono shrink-0">
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
                        "flex flex-col gap-1 w-full px-2.5 py-2 rounded text-left transition-all",
                        isSelected
                          ? "bg-bg-elevated border border-border-subtle"
                          : "hover:bg-bg-elevated/30 hover:shadow-[0_0_12px_rgba(124,131,247,0.06)]",
                        run.status === "waiting" &&
                          !isSelected &&
                          "border border-sprints/30",
                        run.status === "running" &&
                          !isSelected &&
                          "border border-rooms/30",
                      )}
                    >
                      {/* Row 1: icon + name + date */}
                      <div className="flex items-center gap-2 w-full">
                        <StatusIcon
                          size={12}
                          className={cn(
                            "shrink-0",
                            statusConfig.color,
                            run.status === "running" && "animate-spin",
                          )}
                        />
                        <span
                          className={cn(
                            "text-label truncate flex-1 min-w-0 font-medium",
                            isSelected
                              ? "text-text-primary"
                              : "text-text-secondary",
                          )}
                        >
                          {run.name}
                        </span>
                        <span className="text-[8px] text-text-ghost font-mono shrink-0">
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
                        <span className="text-[8px] text-text-ghost">
                          {completedSteps}/{totalSteps} steps
                        </span>
                        {run.stats.agentsUsed.length > 0 && (
                          <span className="text-[8px] text-text-ghost ml-auto">
                            {run.stats.agentsUsed.length} agents
                          </span>
                        )}
                      </div>

                      {/* Progress bar */}
                      {totalSteps > 0 && (
                        <div className="ml-5 h-0.5 bg-border-default rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              run.status === "completed"
                                ? "bg-sessions"
                                : run.status === "running"
                                  ? "bg-rooms"
                                  : "bg-sprints",
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
          <div className="text-center py-6 px-3">
            <p className="text-[10px] text-text-secondary font-medium">No workflows</p>
            <p className="text-[10px] text-text-tertiary mt-1">
              Create a workflow to automate multi-step tasks
            </p>
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
