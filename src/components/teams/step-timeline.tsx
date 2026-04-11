"use client";

import type { WorkflowRun } from "@/stores/workflows";
import { StepCard } from "./step-card";
import { cn } from "@/lib/utils";

interface StepTimelineProps {
  run: WorkflowRun;
}

const STATUS_LINE_COLORS: Record<string, string> = {
  completed: "bg-console-success",
  active: "bg-console-accent",
  waiting: "bg-amber-400",
  pending: "bg-console-dim/50",
  failed: "bg-console-error",
};

export function StepTimeline({ run }: StepTimelineProps) {
  const completedSteps = run.steps.filter((s) => s.status === "completed").length;
  const totalSteps = run.steps.length;

  return (
    <div className="flex flex-col h-full">
      {/* Run header */}
      <div className="px-4 py-3 border-b border-console-border shrink-0">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "w-2 h-2 rounded-full shrink-0",
              run.status === "running"
                ? "bg-console-accent animate-pulse"
                : run.status === "waiting"
                  ? "bg-amber-400 animate-pulse"
                  : run.status === "completed"
                    ? "bg-console-success"
                    : "bg-console-error",
            )}
          />
          <h2 className="text-[13px] font-medium text-console-text truncate">
            {run.name}
          </h2>
          <span
            className={cn(
              "text-[8px] px-1.5 py-0.5 rounded font-medium ml-1",
              run.status === "completed"
                ? "bg-console-success/15 text-console-success"
                : run.status === "running"
                  ? "bg-console-accent/15 text-console-accent"
                  : run.status === "waiting"
                    ? "bg-amber-400/15 text-amber-400"
                    : "bg-console-error/15 text-console-error",
            )}
          >
            {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
          </span>
        </div>
        <div className="flex items-center gap-4 mt-1.5">
          <span className="text-[10px] text-console-dim font-mono">
            {formatDate(run.startedAt)}
          </span>
          <span className="text-[10px] text-console-muted">
            {completedSteps}/{totalSteps} steps
          </span>
          {run.stats.agentsUsed.length > 0 && (
            <span className="text-[10px] text-console-dim">
              {run.stats.agentsUsed.length} agents
            </span>
          )}
          {run.stats.filesChanged != null && (
            <span className="text-[10px] text-console-dim">
              {run.stats.filesChanged} files
            </span>
          )}
          {run.stats.qaHealth != null && (
            <span
              className={cn(
                "text-[10px] font-medium",
                run.stats.qaHealth >= 95
                  ? "text-console-success"
                  : run.stats.qaHealth >= 80
                    ? "text-amber-400"
                    : "text-console-error",
              )}
            >
              QA {run.stats.qaHealth}%
            </span>
          )}
        </div>
        {/* Overall progress bar */}
        {totalSteps > 0 && (
          <div className="mt-2 h-1 bg-console-border rounded-full overflow-hidden">
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
      </div>

      {/* Steps with vertical timeline */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="relative pl-4">
          {/* Vertical connecting line */}
          <div className="absolute left-[7px] top-3 bottom-3 w-px bg-console-border" />

          <div className="space-y-2 relative">
            {run.steps.map((step, i) => (
              <div key={step.id} className="relative">
                {/* Timeline dot */}
                <div
                  className={cn(
                    "absolute -left-4 top-3 w-[7px] h-[7px] rounded-full z-10 ring-2 ring-console-bg",
                    STATUS_LINE_COLORS[step.status] ?? "bg-console-dim",
                    step.status === "active" && "animate-pulse",
                    step.status === "waiting" && "animate-pulse",
                  )}
                />

                {/* Colored segment connecting to next */}
                {i < run.steps.length - 1 && step.status !== "pending" && (
                  <div
                    className={cn(
                      "absolute -left-[13px] top-[18px] w-px",
                      STATUS_LINE_COLORS[step.status] ?? "bg-console-dim",
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
