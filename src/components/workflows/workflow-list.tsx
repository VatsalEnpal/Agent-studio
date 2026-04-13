"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useWorkflowV2Store, type WorkflowPipelineClient } from "@/stores/workflows-v2";
import { PlusIcon, ClockIcon } from "@/components/ui/icons";

// ---------- Status Config ----------

const STATUS_DOT: Record<string, string> = {
  running: "bg-green-500",
  paused: "bg-amber-500",
  waiting_approval: "bg-amber-500 animate-pulse",
  completed: "bg-zinc-500",
  failed: "bg-red-500",
  planned: "bg-zinc-400",
};

function statusLabel(wf: WorkflowPipelineClient): string {
  if (wf.activeRuns && wf.activeRuns > 0) return "Active";
  if (wf.schedule && !wf.schedule.paused) return "Scheduled";
  return "Idle";
}

function statusDotClass(wf: WorkflowPipelineClient): string {
  if (wf.activeRuns && wf.activeRuns > 0) return STATUS_DOT.running;
  if (wf.schedule && !wf.schedule.paused) return "bg-blue-500";
  return "bg-zinc-500";
}

function scheduleLabel(wf: WorkflowPipelineClient): string | null {
  if (!wf.schedule) return null;
  if (wf.schedule.paused) return "Paused";
  if (wf.schedule.nextRunAt) {
    const next = new Date(wf.schedule.nextRunAt);
    const diff = Math.max(0, next.getTime() - Date.now());
    const mins = Math.round(diff / 60_000);
    if (mins < 60) return `Next: in ${mins}m`;
    const hrs = Math.round(mins / 60);
    return `Next: in ${hrs}h`;
  }
  return wf.schedule.interval;
}

// ---------- Component ----------

interface WorkflowListProps {
  onSelectWorkflow?: (id: string) => void;
  onCreateNew?: () => void;
  selectedId?: string | null;
}

export function WorkflowList({ onSelectWorkflow, onCreateNew, selectedId }: WorkflowListProps) {
  const workflows = useWorkflowV2Store((s) => s.workflows);
  const fetchWorkflows = useWorkflowV2Store((s) => s.fetchWorkflows);
  const loading = useWorkflowV2Store((s) => s.loading);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  // Group workflows
  const active = workflows.filter((wf) => wf.activeRuns && wf.activeRuns > 0);
  const scheduled = workflows.filter(
    (wf) => (!wf.activeRuns || wf.activeRuns === 0) && wf.schedule && !wf.schedule.paused,
  );
  const other = workflows.filter(
    (wf) => (!wf.activeRuns || wf.activeRuns === 0) && (!wf.schedule || wf.schedule.paused),
  );

  if (loading && workflows.length === 0) {
    return <div className="p-4 text-sm text-zinc-500">Loading workflows...</div>;
  }

  if (workflows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 p-6 text-center">
        <div className="text-sm text-zinc-500">
          No workflows yet. Create one to automate your agent pipelines.
        </div>
        <button
          onClick={onCreateNew}
          className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
        >
          <PlusIcon className="h-3 w-3" />
          New Workflow
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {active.length > 0 && (
        <WorkflowGroup
          label="Active"
          workflows={active}
          selectedId={selectedId}
          onSelect={onSelectWorkflow}
        />
      )}
      {scheduled.length > 0 && (
        <WorkflowGroup
          label="Scheduled"
          workflows={scheduled}
          selectedId={selectedId}
          onSelect={onSelectWorkflow}
        />
      )}
      {other.length > 0 && (
        <WorkflowGroup
          label={active.length > 0 || scheduled.length > 0 ? "Other" : "Workflows"}
          workflows={other}
          selectedId={selectedId}
          onSelect={onSelectWorkflow}
        />
      )}

      <button
        onClick={onCreateNew}
        className="mx-2 mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-zinc-700 px-3 py-2 text-xs text-zinc-500 hover:border-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <PlusIcon className="h-3 w-3" />
        New Workflow
      </button>
    </div>
  );
}

// ---------- Sub-components ----------

function WorkflowGroup({
  label,
  workflows,
  selectedId,
  onSelect,
}: {
  label: string;
  workflows: WorkflowPipelineClient[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  return (
    <div>
      <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
        {label}
      </div>
      {workflows.map((wf) => (
        <WorkflowEntry
          key={wf.id}
          workflow={wf}
          selected={selectedId === wf.id}
          onSelect={() => onSelect?.(wf.id)}
        />
      ))}
    </div>
  );
}

function WorkflowEntry({
  workflow,
  selected,
  onSelect,
}: {
  workflow: WorkflowPipelineClient;
  selected: boolean;
  onSelect: () => void;
}) {
  const schedule = scheduleLabel(workflow);

  return (
    <button
      onClick={onSelect}
      className={cn(
        "group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
        selected
          ? "bg-zinc-800 text-zinc-100"
          : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200",
      )}
    >
      {/* Status dot */}
      <div className={cn("h-2 w-2 shrink-0 rounded-full", statusDotClass(workflow))} />

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-xs">{workflow.name}</div>
        <div className="flex items-center gap-2 text-[10px] text-zinc-500">
          <span>{workflow.steps?.length ?? 0} steps</span>
          {schedule && (
            <>
              <span className="text-zinc-700">|</span>
              <span className="flex items-center gap-0.5">
                <ClockIcon className="h-2.5 w-2.5" />
                {schedule}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Active run count */}
      {workflow.activeRuns && workflow.activeRuns > 0 && (
        <span className="rounded bg-green-500/15 px-1.5 py-0.5 text-[10px] font-medium text-green-400">
          {workflow.activeRuns} run{workflow.activeRuns > 1 ? "s" : ""}
        </span>
      )}
    </button>
  );
}
