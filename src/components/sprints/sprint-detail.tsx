"use client";

import { useMemo, useState, useCallback } from "react";
import { CloseIcon, CheckIcon, SprintsIcon, ArrowLeftIcon, BoltIcon, ChevronRightIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { useSprintsStore, type Sprint } from "@/stores/sprints";
import { useToastStore } from "@/stores/toast";
import { ActivityLog } from "./activity-log";

interface SprintDetailProps {
  sprint: Sprint;
  onBack?: () => void;
}

function statusBadge(status: string): { label: string; class: string } {
  switch (status) {
    case "in_progress":
      return { label: "In Progress", class: "bg-sprints/15 text-sprints" };
    case "launching":
      return { label: "Launching", class: "bg-sprints/15 text-sprints" };
    case "paused":
      return { label: "Paused", class: "bg-sprints/15 text-sprints" };
    case "completed":
      return { label: "Completed", class: "bg-sessions/15 text-sessions" };
    case "cancelled":
      return { label: "Cancelled", class: "bg-text-tertiary/15 text-text-tertiary" };
    case "failed":
      return { label: "Failed", class: "bg-error/15 text-error" };
    case "planned":
    default:
      return { label: "Planned", class: "bg-border-default text-text-tertiary" };
  }
}

function formatElapsed(startedAt?: string): string {
  if (!startedAt) return "--";
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  const diffMs = now - start;
  const hours = Math.floor(diffMs / 3_600_000);
  const minutes = Math.floor((diffMs % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** UX #7: Estimate ETA from average gate completion time */
function estimateETA(sprint: Sprint): string | null {
  if (!sprint.startedAt) return null;
  const passedGates = sprint.gates.filter((g) => g.status === "passed");
  const remainingGates = sprint.gates.filter(
    (g) => g.status === "not_started" || g.status === "in_progress",
  );
  if (passedGates.length === 0 || remainingGates.length === 0) return null;

  const startMs = new Date(sprint.startedAt).getTime();
  const elapsedMs = Date.now() - startMs;
  const avgPerGate = elapsedMs / passedGates.length;
  const etaMs = avgPerGate * remainingGates.length;

  const etaMin = Math.ceil(etaMs / 60_000);
  if (etaMin < 60) return `~${etaMin}m`;
  const etaHr = Math.floor(etaMin / 60);
  return `~${etaHr}h ${etaMin % 60}m`;
}

function ExpandedGatePanel({ gate }: { gate: Sprint["gates"][number] }) {
  const rc = gate.richContent as Record<string, unknown> | null | undefined;
  const gateChecks = rc?.gateChecks as string[] | undefined;
  const buildSummary = rc?.buildSummary as string[] | undefined;

  return (
    <div className="px-4 py-3 bg-bg-elevated/50 border-t border-border-subtle">
      {gate.details && (
        <p className="text-xs text-text-secondary mb-2 leading-relaxed">
          {gate.details}
        </p>
      )}

      {gate.requirements.length > 0 && (
        <div className="space-y-1">
          <span className="text-2xs font-medium uppercase tracking-[0.5px] text-text-ghost">
            Requirements
          </span>
          {gate.requirements.map((req, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div
                className={cn(
                  "w-3 h-3 rounded border flex items-center justify-center shrink-0",
                  req.met
                    ? "bg-sessions/20 border-sessions/40"
                    : "bg-transparent border-border-default",
                )}
              >
                {req.met && (
                  <svg className="w-2 h-2 text-sessions" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2 6l3 3 5-5" />
                  </svg>
                )}
              </div>
              <span
                className={cn(
                  "text-xs",
                  req.met ? "text-text-primary" : "text-text-tertiary",
                )}
              >
                {req.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {gateChecks && gateChecks.length > 0 && (
        <div className="mt-2 space-y-1">
          <span className="text-2xs font-medium uppercase tracking-[0.5px] text-text-ghost">
            Gate Checks
          </span>
          {gateChecks.map((check, i) => (
            <div key={i} className="text-xs text-text-secondary pl-2 border-l border-border-default">
              {check}
            </div>
          ))}
        </div>
      )}

      {buildSummary && buildSummary.length > 0 && (
        <div className="mt-2 space-y-1">
          <span className="text-2xs font-medium uppercase tracking-[0.5px] text-text-ghost">
            Build Summary
          </span>
          {buildSummary.map((item, i) => (
            <div key={i} className="text-xs text-text-secondary pl-2 border-l border-border-default">
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SprintDetail({ sprint, onBack }: SprintDetailProps) {
  const activeTab = useSprintsStore((s) => s.activeTab);
  const setActiveTab = useSprintsStore((s) => s.setActiveTab);
  const expandedGateId = useSprintsStore((s) => s.expandedGateId);
  const setExpandedGate = useSprintsStore((s) => s.setExpandedGate);
  const handoffPanelData = useSprintsStore((s) => s.handoffPanelData);
  const setHandoffPanelData = useSprintsStore((s) => s.setHandoffPanelData);
  const specPanelOpen = useSprintsStore((s) => s.specPanelOpen);
  const setSpecPanel = useSprintsStore((s) => s.setSpecPanel);
  const specContent = useSprintsStore((s) => s.specContent);
  const setSpecContent = useSprintsStore((s) => s.setSpecContent);
  const specLoading = useSprintsStore((s) => s.specLoading);
  const setSpecLoading = useSprintsStore((s) => s.setSpecLoading);
  const addToast = useToastStore((s) => s.addToast);

  const [approvingGate, setApprovingGate] = useState<string | null>(null);

  const badge = statusBadge(sprint.status);
  const eta = estimateETA(sprint);

  // Sprint progress percentage
  const passedGates = sprint.gates.filter((g) => g.status === "passed").length;
  const totalGates = sprint.gates.length;
  const progressPct = totalGates > 0 ? Math.round((passedGates / totalGates) * 100) : 0;

  const handleApproveGate = useCallback(async (gateId: string) => {
    setApprovingGate(gateId);
    try {
      const res = await fetch(`/api/sprints/${sprint.id}/gates/${gateId}/approve`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to approve gate");
      addToast("Gate approved", "success");
    } catch {
      addToast("Failed to approve gate", "error");
    } finally {
      setApprovingGate(null);
    }
  }, [sprint.id, addToast]);

  const handlePause = useCallback(async () => {
    try {
      await fetch(`/api/sprints/${sprint.id}/pause`, { method: "POST" });
      addToast("Sprint paused", "success");
    } catch {
      addToast("Failed to pause sprint", "error");
    }
  }, [sprint.id, addToast]);

  const handleResume = useCallback(async () => {
    try {
      await fetch(`/api/sprints/${sprint.id}/resume`, { method: "POST" });
      addToast("Sprint resumed", "success");
    } catch {
      addToast("Failed to resume sprint", "error");
    }
  }, [sprint.id, addToast]);

  const handleViewSpec = useCallback(async () => {
    if (specPanelOpen) {
      setSpecPanel(false);
      return;
    }
    setSpecLoading(true);
    setSpecPanel(true);
    try {
      const res = await fetch(`/api/sprints/${sprint.id}/spec`);
      const data = await res.json();
      setSpecContent(data.content ?? "No spec found.");
    } catch {
      setSpecContent("Failed to load spec.");
    } finally {
      setSpecLoading(false);
    }
  }, [sprint.id, specPanelOpen, setSpecPanel, setSpecContent, setSpecLoading]);

  return (
    <div className="flex flex-col h-full font-sans">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border-default shrink-0">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              className="p-0.5 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-elevated transition-all shrink-0"
              title="Back to sprint list"
            >
              <ArrowLeftIcon size={14} />
            </button>
          )}
          <h2 className="text-title-md font-semibold text-text-primary tracking-[-0.3px] truncate">
            {sprint.name}
          </h2>
          <span className={cn("text-2xs font-medium px-1.5 py-0.5 rounded-full", badge.class)}>
            {badge.label}
          </span>
          {totalGates > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-16 h-1.5 bg-border-default rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    progressPct === 100 ? "bg-sessions" : "bg-sprints",
                  )}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className={cn(
                "text-2xs font-medium",
                progressPct === 100 ? "text-sessions" : "text-text-tertiary",
              )}>
                {progressPct}%
              </span>
            </div>
          )}

          {/* Pause/Resume + View Spec + elapsed + ETA */}
          <div className="flex items-center gap-2 ml-auto shrink-0">
            {sprint.status === "in_progress" && (
              <button
                onClick={handlePause}
                className="px-2 py-0.5 text-xs font-medium text-sprints bg-sprints/10 rounded hover:bg-sprints/20 active:scale-[0.98] transition-all"
              >
                Pause
              </button>
            )}
            {sprint.status === "paused" && (
              <button
                onClick={handleResume}
                className="px-2 py-0.5 text-xs font-medium text-sessions bg-sessions/10 rounded hover:bg-sessions/20 active:scale-[0.98] transition-all"
              >
                Resume
              </button>
            )}
            <button
              onClick={handleViewSpec}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded active:scale-[0.98] transition-all",
                specPanelOpen
                  ? "bg-sprints/15 text-sprints"
                  : "text-text-ghost hover:text-text-secondary hover:bg-bg-elevated",
              )}
            >
              <SprintsIcon size={12} />
              Spec
            </button>
            <span className="text-xs text-text-ghost">
              {formatElapsed(sprint.startedAt)}
            </span>
            {eta && (
              <span className="text-xs text-text-ghost" title="Estimated time remaining">
                ETA {eta}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 border-b border-border-default shrink-0 flex gap-1">
        {(["overview", "activity"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-2.5 py-2 text-xs font-medium border-b transition-all",
              activeTab === tab
                ? "border-text-primary text-text-primary"
                : "border-transparent text-text-tertiary hover:text-text-primary",
            )}
          >
            {tab === "overview" ? "Overview" : "Activity"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden flex">
        {/* Spec panel overlay */}
        {specPanelOpen && (
          <div className="w-[360px] border-r border-border-default bg-bg-base flex flex-col shrink-0 overflow-hidden">
            <div className="px-3 py-2 border-b border-border-default flex items-center justify-between shrink-0">
              <span className="text-xs font-semibold text-text-primary">
                Sprint Spec
              </span>
              <button
                onClick={() => setSpecPanel(false)}
                className="p-0.5 text-text-tertiary hover:text-text-secondary transition-all rounded"
              >
                <CloseIcon size={12} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 scrollbar-thin">
              {specLoading ? (
                <div className="space-y-2 animate-pulse">
                  <div className="skeleton h-3 w-full" />
                  <div className="skeleton h-3 w-5/6" />
                  <div className="skeleton h-3 w-4/6" />
                  <div className="skeleton h-3 w-full" />
                  <div className="skeleton h-3 w-3/4" />
                </div>
              ) : (
                <pre className="text-xs font-mono text-text-secondary whitespace-pre-wrap break-words leading-relaxed">
                  {specContent}
                </pre>
              )}
            </div>
          </div>
        )}

        {activeTab === "overview" ? (
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {/* Vertical gate list — the main content */}
            <div className="divide-y divide-border-default">
              {sprint.gates.map((gate) => {
                const isPassed = gate.status === "passed";
                const isCurrent = gate.status === "in_progress";
                const isFailed = gate.status === "failed";
                const isExpanded = expandedGateId === gate.id;
                const isReady = isCurrent && gate.requirements.length > 0 && gate.requirements.every((r) => r.met);
                const hasAction = gate.action && (isCurrent || gate.status === "not_started");

                return (
                  <div key={gate.id}>
                    {/* Gate row */}
                    <button
                      onClick={() => setExpandedGate(isExpanded ? null : gate.id)}
                      className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-bg-elevated/50 transition-all"
                    >
                      {/* Status dot */}
                      <div className={cn(
                        "w-2.5 h-2.5 rounded-full shrink-0",
                        isPassed && "bg-sessions",
                        isCurrent && "bg-sprints animate-pulse-dot",
                        isFailed && "bg-error",
                        !isPassed && !isCurrent && !isFailed && "bg-border-default",
                      )} />

                      {/* Gate name */}
                      <span className={cn(
                        "text-xs font-medium flex-1 truncate",
                        isPassed ? "text-text-primary" : isCurrent ? "text-sprints" : isFailed ? "text-error" : "text-text-tertiary",
                      )}>
                        {gate.name}
                      </span>

                      {/* Status label */}
                      <span className={cn(
                        "text-2xs font-medium px-1.5 py-0.5 rounded-full shrink-0",
                        isPassed && "bg-sessions/10 text-sessions",
                        isCurrent && "bg-sprints/10 text-sprints",
                        isFailed && "bg-error/10 text-error",
                        !isPassed && !isCurrent && !isFailed && "text-text-ghost",
                      )}>
                        {isPassed ? "Passed" : isCurrent ? "In Progress" : isFailed ? "Failed" : "Pending"}
                      </span>

                      {/* Expand chevron */}
                      <ChevronRightIcon size={14} className={cn(
                        "text-text-ghost transition-transform",
                        isExpanded && "rotate-90",
                      )} />
                    </button>

                    {/* Expanded details — inline below the gate */}
                    {isExpanded && (
                      <ExpandedGatePanel gate={gate} />
                    )}

                    {/* Approve button for gates ready for approval */}
                    {isReady && (
                      <div className="px-4 py-2 bg-sprints/5 flex items-center gap-2">
                        <CheckIcon size={12} className="text-sprints shrink-0" />
                        <span className="text-xs text-sprints flex-1">{gate.name} ready for approval</span>
                        <button
                          onClick={handleViewSpec}
                          className="px-2 py-1 text-xs font-medium text-sprints bg-sprints/10 rounded-md hover:bg-sprints/20 transition-all"
                        >
                          View full spec
                        </button>
                        <button
                          onClick={() => void handleApproveGate(gate.id)}
                          disabled={approvingGate === gate.id}
                          className="px-3 py-1 text-xs font-medium bg-sprints text-bg-base rounded-md hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100"
                        >
                          {approvingGate === gate.id ? "Approving..." : "Approve"}
                        </button>
                      </div>
                    )}

                    {/* Action button for gates with explicit actions (not already showing approve) */}
                    {hasAction && !isReady && (
                      <div className="px-4 py-2 bg-sprints/5 flex items-center gap-2">
                        <BoltIcon size={12} className="text-sprints shrink-0" />
                        <span className="text-xs font-medium text-text-primary flex-1">{gate.name}</span>
                        <button
                          onClick={() => void handleApproveGate(gate.id)}
                          disabled={approvingGate === gate.id}
                          className="px-2.5 py-1 text-xs font-medium bg-sprints text-bg-base rounded-md hover:opacity-90 transition-all disabled:opacity-50"
                        >
                          {approvingGate === gate.id ? "..." : (gate.action?.label ?? "Approve")}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer: agents + runtime stats */}
            <div className="px-4 py-3 border-t border-border-default space-y-2">
              {/* Agents — single line */}
              {sprint.agents.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-text-ghost">
                  <span className="font-medium text-text-tertiary">Agents:</span>
                  <span>{sprint.agents.map((a) => a.name).join(" \u00b7 ")}</span>
                </div>
              )}

              {/* Runtime stats */}
              <div className="flex items-center gap-4 text-xs text-text-ghost">
                {sprint.startedAt && (
                  <span>Started: {new Date(sprint.startedAt).toLocaleString()}</span>
                )}
                {sprint.completedAt && (
                  <span>Completed: {new Date(sprint.completedAt).toLocaleString()}</span>
                )}
                <span>Gates: {sprint.gates.filter((g) => g.status === "passed").length}/{sprint.gates.length} passed</span>
              </div>

              {/* View activity logs link */}
              <button
                onClick={() => setActiveTab("activity")}
                className="text-xs text-sprints hover:underline"
              >
                View activity logs
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex min-h-0">
            {/* Activity log */}
            <div className="flex-1 flex flex-col min-h-0">
              <ActivityLog
                entries={sprint.activity}
                onHandoffClick={setHandoffPanelData}
              />
            </div>

            {/* Handoff detail panel */}
            {handoffPanelData && (
              <div className="w-64 border-l border-border-default bg-bg-elevated flex flex-col overflow-hidden shrink-0">
                <div className="px-2.5 py-2 border-b border-border-default flex items-center justify-between shrink-0">
                  <span className="text-xs font-semibold text-text-primary">
                    Handoff Detail
                  </span>
                  <button
                    onClick={() => setHandoffPanelData(null)}
                    className="p-0.5 text-text-tertiary hover:text-text-secondary transition-all"
                  >
                    <CloseIcon size={12} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2.5 scrollbar-thin">
                  <pre className="text-xs font-mono text-text-secondary whitespace-pre-wrap break-all leading-relaxed">
                    {JSON.stringify(handoffPanelData, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
