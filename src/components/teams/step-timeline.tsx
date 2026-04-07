"use client";

import type { WorkflowRun } from "@/stores/workflows";
import { StepCard } from "./step-card";
import { cn } from "@/lib/utils";

interface StepTimelineProps {
  run: WorkflowRun;
}

const STATUS_LINE_COLORS: Record<string, string> = {
  completed: "bg-sessions",
  active: "bg-rooms",
  waiting: "bg-amber-400",
  pending: "bg-text-tertiary/50",
  failed: "bg-error",
};

export function StepTimeline({ run }: StepTimelineProps) {
  const completedSteps = run.steps.filter((s) => s.status === "completed").length;
  const totalSteps = run.steps.length;

  return (
    <div className="flex flex-col h-full">
      {/* Run header */}
      <div className="px-4 py-3 border-b border-border-default shrink-0">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "w-2 h-2 rounded-full shrink-0",
              run.status === "running"
                ? "bg-rooms animate-pulse"
                : run.status === "waiting"
                  ? "bg-amber-400 animate-pulse"
                  : run.status === "completed"
                    ? "bg-sessions"
                    : "bg-error",
            )}
          />
          <h2 className="text-title-md font-medium text-text-primary truncate">
            {run.name}
          </h2>
          <span
            className={cn(
              "text-[8px] px-1.5 py-0.5 rounded font-medium ml-1",
              run.status === "completed"
                ? "bg-sessions/15 text-sessions"
                : run.status === "running"
                  ? "bg-rooms/15 text-rooms"
                  : run.status === "waiting"
                    ? "bg-amber-400/15 text-amber-400"
                    : "bg-error/15 text-error",
            )}
          >
            {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
          </span>
        </div>
        <div className="flex items-center gap-4 mt-1.5">
          <span className="text-xs text-text-tertiary font-mono">
            {formatDate(run.startedAt)}
          </span>
          <span className="text-xs text-text-secondary">
            {completedSteps}/{totalSteps} steps
          </span>
          {run.stats.agentsUsed.length > 0 && (
            <span className="text-xs text-text-tertiary">
              {run.stats.agentsUsed.length} agents
            </span>
          )}
          {run.stats.filesChanged != null && (
            <span className="text-xs text-text-tertiary">
              {run.stats.filesChanged} files
            </span>
          )}
          {run.stats.qaHealth != null && (
            <span
              className={cn(
                "text-xs font-medium",
                run.stats.qaHealth >= 95
                  ? "text-sessions"
                  : run.stats.qaHealth >= 80
                    ? "text-amber-400"
                    : "text-error",
              )}
            >
              QA {run.stats.qaHealth}%
            </span>
          )}
        </div>
        {/* Overall progress bar */}
        {totalSteps > 0 && (
          <div className="mt-2 h-1 bg-border-default rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                run.status === "completed"
                  ? "bg-sessions"
                  : run.status === "running"
                    ? "bg-rooms"
                    : "bg-amber-400",
              )}
              style={{
                width: `${(completedSteps / totalSteps) * 100}%`,
              }}
            />
          </div>
        )}
      </div>

      {/* Steps with vertical timeline */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="relative pl-4">
          {/* Vertical connecting line */}
          <div className="absolute left-[7px] top-3 bottom-3 w-px bg-border-default" />

          <div className="space-y-2 relative">
            {run.steps.map((step, i) => (
              <div key={step.id} className="relative">
                {/* Timeline dot */}
                <div
                  className={cn(
                    "absolute -left-4 top-3 w-[7px] h-[7px] rounded-full z-10 ring-2 ring-bg-base",
                    STATUS_LINE_COLORS[step.status] ?? "bg-text-tertiary",
                    step.status === "active" && "animate-pulse",
                    step.status === "waiting" && "animate-pulse",
                  )}
                />

                {/* Colored segment connecting to next */}
                {i < run.steps.length - 1 && step.status !== "pending" && (
                  <div
                    className={cn(
                      "absolute -left-[13px] top-[18px] w-px",
                      STATUS_LINE_COLORS[step.status] ?? "bg-text-tertiary",
                    )}
                    style={{ height: "calc(100% + 8px)" }}
                  />
                )}

                <StepCard step={step} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
