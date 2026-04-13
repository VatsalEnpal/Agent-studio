"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  useWorkflowV2Store,
  type RunStateClient,
  type StepStateClient,
  type WorkflowPipelineClient,
  type PipelineStepClient,
} from "@/stores/workflows-v2";
import {
  PlayIcon,
  PauseIcon,
  StopIcon,
  RefreshIcon,
  CheckIcon,
  WarningIcon,
  ClockIcon,
  ChevronRightIcon,
  ChevronDownIcon,
} from "@/components/ui/icons";

// ---------- Status config ----------

const STEP_STATUS_DOT: Record<string, string> = {
  completed: "bg-green-500",
  running: "bg-blue-500 animate-pulse",
  waiting: "bg-amber-500 animate-pulse",
  failed: "bg-red-500",
  timeout: "bg-red-500",
  skipped: "bg-zinc-500",
  pending: "bg-zinc-600",
  interrupted: "bg-amber-600",
};

const RUN_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  running: { label: "Running", color: "text-blue-400" },
  paused: { label: "Paused", color: "text-amber-400" },
  waiting_approval: { label: "Waiting for Approval", color: "text-amber-400" },
  completed: { label: "Completed", color: "text-green-400" },
  failed: { label: "Failed", color: "text-red-400" },
  cancelled: { label: "Cancelled", color: "text-zinc-400" },
  planned: { label: "Planned", color: "text-zinc-400" },
};

// ---------- Component ----------

interface WorkflowDetailProps {
  workflow: WorkflowPipelineClient;
}

export function WorkflowDetail({ workflow }: WorkflowDetailProps) {
  const {
    runs,
    activeRun,
    fetchRuns,
    fetchRunDetail,
    startRun,
    approveGate,
    rejectGate,
    pauseRun,
    resumeRun,
    cancelRun,
    retryStep,
  } = useWorkflowV2Store();

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  useEffect(() => {
    fetchRuns(workflow.id);
  }, [workflow.id, fetchRuns]);

  useEffect(() => {
    if (selectedRunId) {
      fetchRunDetail(workflow.id, selectedRunId);
      const timer = setInterval(() => fetchRunDetail(workflow.id, selectedRunId), 3000);
      return () => clearInterval(timer);
    }
  }, [workflow.id, selectedRunId, fetchRunDetail]);

  // Auto-select latest run
  useEffect(() => {
    if (runs.length > 0 && !selectedRunId) {
      setSelectedRunId(runs[0].runId);
    }
  }, [runs, selectedRunId]);

  const handleStartRun = async () => {
    const result = await startRun(workflow.id);
    if (result.runId) {
      setSelectedRunId(result.runId);
      fetchRuns(workflow.id);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">{workflow.name}</h2>
          {workflow.description && (
            <p className="text-xs text-zinc-500 mt-0.5">{workflow.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleStartRun}
            className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500"
          >
            <PlayIcon className="h-3 w-3" />
            Run
          </button>
        </div>
      </div>

      {/* Run selector */}
      {runs.length > 1 && (
        <div className="flex gap-1 overflow-x-auto border-b border-zinc-800 px-4 py-2">
          {runs.slice(0, 10).map((run) => (
            <button
              key={run.runId}
              onClick={() => setSelectedRunId(run.runId)}
              className={cn(
                "shrink-0 rounded px-2 py-1 text-[10px]",
                selectedRunId === run.runId
                  ? "bg-zinc-700 text-zinc-200"
                  : "text-zinc-500 hover:text-zinc-300",
              )}
            >
              {run.runId.slice(-8)} — {run.status}
            </button>
          ))}
        </div>
      )}

      {/* Paused banner */}
      {activeRun?.status === "paused" && (
        <div className="flex items-center justify-between bg-amber-500/10 px-4 py-2 border-b border-amber-500/20">
          <span className="text-xs text-amber-400">Run paused — resume to continue execution</span>
          <button
            onClick={() => resumeRun(workflow.id, activeRun.runId)}
            className="rounded bg-amber-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-amber-500"
          >
            Resume
          </button>
        </div>
      )}

      {/* Run control bar */}
      {activeRun && (activeRun.status === "running" || activeRun.status === "waiting_approval") && (
        <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2">
          <div className={cn("text-xs font-medium", RUN_STATUS_LABEL[activeRun.status]?.color)}>
            {RUN_STATUS_LABEL[activeRun.status]?.label}
          </div>
          <div className="flex-1" />
          <button
            onClick={() => pauseRun(workflow.id, activeRun.runId)}
            className="rounded p-1 text-zinc-500 hover:text-zinc-300"
            title="Pause"
          >
            <PauseIcon className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => cancelRun(workflow.id, activeRun.runId)}
            className="rounded p-1 text-zinc-500 hover:text-red-400"
            title="Cancel"
          >
            <StopIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {!activeRun && runs.length === 0 && (
          <div className="text-center text-sm text-zinc-500 py-8">
            No runs yet. Click &quot;Run&quot; to start this workflow.
          </div>
        )}

        {activeRun && (
          <div className="space-y-1">
            {(workflow.steps ?? []).map((stepDef, idx) => {
              const stepState = activeRun.steps[stepDef.id];
              return (
                <StepRow
                  key={stepDef.id}
                  stepDef={stepDef}
                  stepState={stepState}
                  isLast={idx === (workflow.steps ?? []).length - 1}
                  workflowId={workflow.id}
                  runId={activeRun.runId}
                  onApprove={() => approveGate(workflow.id, activeRun.runId, stepDef.id)}
                  onReject={(feedback) =>
                    rejectGate(workflow.id, activeRun.runId, stepDef.id, feedback)
                  }
                  onRetry={() => retryStep(workflow.id, activeRun.runId, stepDef.id)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Step Row ----------

interface StepRowProps {
  stepDef: PipelineStepClient;
  stepState?: StepStateClient;
  isLast: boolean;
  workflowId: string;
  runId: string;
  onApprove: () => void;
  onReject: (feedback?: string) => void;
  onRetry: () => void;
}

function StepRow({ stepDef, stepState, isLast, onApprove, onReject, onRetry }: StepRowProps) {
  const [feedbackText, setFeedbackText] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const status = stepState?.status ?? "pending";
  const isGroup = stepDef.type === "agent-group";

  return (
    <div className="flex gap-3">
      {/* Timeline line + dot */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "h-2.5 w-2.5 rounded-full shrink-0 mt-1.5",
            STEP_STATUS_DOT[status] || "bg-zinc-600",
          )}
        />
        {!isLast && <div className="w-px flex-1 bg-zinc-800 my-1" />}
      </div>

      {/* Content */}
      <div className="flex-1 pb-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded px-1 py-0.5 text-[9px] font-semibold uppercase",
              stepDef.type === "agent"
                ? "bg-blue-500/15 text-blue-400"
                : stepDef.type === "gate"
                  ? "bg-amber-500/15 text-amber-400"
                  : stepDef.type === "loop"
                    ? "bg-purple-500/15 text-purple-400"
                    : "bg-zinc-500/15 text-zinc-400",
            )}
          >
            {stepDef.type}
          </span>
          <span className="text-xs font-medium text-zinc-200">{stepDef.name}</span>
          <span className="text-[10px] text-zinc-600">{status}</span>

          {/* Duration */}
          {stepState?.startedAt && stepState?.completedAt && (
            <span className="text-[10px] text-zinc-600">
              {formatDuration(stepState.startedAt, stepState.completedAt)}
            </span>
          )}

          {/* Loop iteration */}
          {stepDef.type === "loop" && stepState?.iteration && (
            <span className="rounded bg-purple-500/15 px-1 py-0.5 text-[9px] text-purple-400">
              Round {stepState.iteration}/{stepDef.maxIterations}
            </span>
          )}
        </div>

        {/* Goal preview for agent steps */}
        {stepDef.type === "agent" && stepDef.goal && (
          <p className="mt-0.5 text-[10px] text-zinc-600 truncate max-w-md">{stepDef.goal}</p>
        )}

        {/* Error inline */}
        {stepState?.error && (
          <div className="mt-1 rounded bg-red-500/10 px-2 py-1 text-[10px] text-red-400">
            {stepState.error}
          </div>
        )}

        {/* Gate actions */}
        {stepDef.type === "gate" && status === "waiting" && (
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={onApprove}
              className="rounded bg-green-600 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-green-500"
            >
              Approve
            </button>
            {stepDef.allowFeedback ? (
              <button
                onClick={() => setShowFeedback(!showFeedback)}
                className="rounded bg-red-600/80 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-red-500"
              >
                Send Back
              </button>
            ) : (
              <button
                onClick={() => onReject()}
                className="rounded bg-red-600/80 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-red-500"
              >
                Reject
              </button>
            )}
          </div>
        )}

        {/* Feedback textarea */}
        {showFeedback && (
          <div className="mt-2 space-y-1">
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="What should the agent change?"
              rows={2}
              className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-[10px] text-zinc-200 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none resize-none"
            />
            <button
              onClick={() => {
                onReject(feedbackText);
                setShowFeedback(false);
                setFeedbackText("");
              }}
              disabled={!feedbackText.trim()}
              className="rounded bg-red-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-red-500 disabled:opacity-50"
            >
              Send Feedback
            </button>
          </div>
        )}

        {/* Retry button for failed steps */}
        {(status === "failed" || status === "timeout") && (
          <div className="mt-1 flex gap-2">
            <button
              onClick={onRetry}
              className="flex items-center gap-1 rounded bg-zinc-700 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-600"
            >
              <RefreshIcon className="h-2.5 w-2.5" />
              Retry
            </button>
          </div>
        )}

        {/* Agent group: expandable sub-steps */}
        {isGroup && (
          <div className="mt-1">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300"
            >
              {expanded ? (
                <ChevronDownIcon className="h-3 w-3" />
              ) : (
                <ChevronRightIcon className="h-3 w-3" />
              )}
              {expanded ? "Collapse" : "Expand"} sub-steps
              {!expanded && stepState?.subSteps && (
                <span className="text-zinc-600">
                  (
                  {Object.values(stepState.subSteps).filter((s) => s.status === "completed").length}
                  /{Object.values(stepState.subSteps).length} complete)
                </span>
              )}
            </button>

            {expanded && stepState?.subSteps && (
              <div className="ml-2 mt-1 border-l border-zinc-800 pl-3 space-y-1">
                {Object.values(stepState.subSteps).map((sub) => (
                  <div key={sub.id} className="flex items-center gap-2">
                    <div
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        STEP_STATUS_DOT[sub.status] || "bg-zinc-600",
                      )}
                    />
                    <span className="text-[10px] text-zinc-400">{sub.id}</span>
                    <span className="text-[10px] text-zinc-600">{sub.status}</span>
                    {sub.error && (
                      <span className="text-[10px] text-red-400 truncate max-w-xs">
                        {sub.error}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Helpers ----------

function formatDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.round(secs / 60);
  return `${mins}m`;
}
