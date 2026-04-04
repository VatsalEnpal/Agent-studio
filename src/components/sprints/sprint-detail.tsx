"use client";

import { useMemo, useState, useCallback } from "react";
import { CloseIcon, CheckIcon, SprintsIcon, ArrowLeftIcon, BoltIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { useSprintsStore, type Sprint } from "@/stores/sprints";
import { useToastStore } from "@/stores/toast";
import { GateStepper } from "./gate-stepper";
import { AgentList } from "./agent-list";
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

function ExpandedGatePanel({ gate, onClose }: { gate: Sprint["gates"][number]; onClose: () => void }) {
  const rc = gate.richContent as Record<string, unknown> | null | undefined;
  const gateChecks = rc?.gateChecks as string[] | undefined;
  const buildSummary = rc?.buildSummary as string[] | undefined;

  return (
    <div className="px-4 py-3 border-b border-border-default bg-bg-elevated">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-text-primary">
          {gate.name}
        </span>
        <button
          onClick={onClose}
          className="p-0.5 text-text-tertiary hover:text-text-secondary transition-colors rounded"
        >
          <CloseIcon size={12} />
        </button>
      </div>

      {gate.details && (
        <p className="text-[10px] text-text-secondary mb-2 leading-relaxed">
          {gate.details}
        </p>
      )}

      {gate.requirements.length > 0 && (
        <div className="space-y-1">
          <span className="text-[9px] font-medium uppercase tracking-[0.5px] text-text-ghost">
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
                  "text-[10px]",
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
          <span className="text-[9px] font-medium uppercase tracking-[0.5px] text-text-ghost">
            Gate Checks
          </span>
          {gateChecks.map((check, i) => (
            <div key={i} className="text-[10px] text-text-secondary pl-2 border-l border-border-default">
              {check}
            </div>
          ))}
        </div>
      )}

      {buildSummary && buildSummary.length > 0 && (
        <div className="mt-2 space-y-1">
          <span className="text-[9px] font-medium uppercase tracking-[0.5px] text-text-ghost">
            Build Summary
          </span>
          {buildSummary.map((item, i) => (
            <div key={i} className="text-[10px] text-text-secondary pl-2 border-l border-border-default">
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

  const expandedGate = sprint.gates.find((g) => g.id === expandedGateId);

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

  // Find gates that have an action (approve/go buttons)
  const actionableGates = useMemo(() => {
    return sprint.gates.filter(
      (g) => g.action && (g.status === "in_progress" || g.status === "not_started"),
    );
  }, [sprint.gates]);

  // Find gate that's ready for approval (in_progress with all requirements met)
  const readyGate = useMemo(() => {
    return sprint.gates.find(
      (g) =>
        g.status === "in_progress" &&
        g.requirements.length > 0 &&
        g.requirements.every((r) => r.met),
    );
  }, [sprint.gates]);

  return (
    <div className="flex flex-col h-full font-sans">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border-default shrink-0">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              className="p-0.5 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-elevated transition-colors shrink-0"
              title="Back to sprint list"
            >
              <ArrowLeftIcon size={14} />
            </button>
          )}
          <h2 className="text-[13px] font-semibold text-text-primary tracking-[-0.3px] truncate">
            {sprint.name}
          </h2>
          <span className={cn("text-[9px] font-medium px-1.5 py-0.5 rounded-full", badge.class)}>
            {badge.label}
          </span>
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <button
              onClick={handleViewSpec}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded transition-colors",
                specPanelOpen
                  ? "bg-sprints/15 text-sprints"
                  : "text-text-ghost hover:text-text-secondary hover:bg-bg-elevated",
              )}
            >
              <SprintsIcon size={12} />
              View Spec
            </button>
            <span className="text-[10px] text-text-ghost">
              {formatElapsed(sprint.startedAt)}
            </span>
            {eta && (
              <span className="text-[10px] text-text-ghost" title="Estimated time remaining">
                ETA {eta}
              </span>
            )}
          </div>
        </div>

        {/* Gate stepper */}
        {sprint.gates.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <GateStepper
              gates={sprint.gates}
              expandedGateId={expandedGateId}
              onGateClick={(id) =>
                setExpandedGate(expandedGateId === id ? null : id)
              }
              onApprove={handleApproveGate}
              approvingGate={approvingGate}
            />
          </div>
        )}
      </div>

      {/* Gate approval banner */}
      {readyGate && (
        <div className="px-4 py-2 bg-sprints/5 border-b border-sprints/20 flex items-center gap-2">
          <CheckIcon size={12} className="text-sprints shrink-0" />
          <span className="text-[10px] font-medium text-sprints flex-1">
            {readyGate.name} ready for approval
          </span>
          <button
            onClick={() => void handleApproveGate(readyGate.id)}
            disabled={approvingGate === readyGate.id}
            className="px-3 py-1 text-[10px] font-medium bg-sprints text-bg-base rounded-md hover:opacity-90 transition-colors disabled:opacity-50"
          >
            {approvingGate === readyGate.id ? "Approving..." : "Approve"}
          </button>
          <button
            onClick={() => setExpandedGate(readyGate.id)}
            className="px-2 py-1 text-[10px] font-medium text-sprints bg-sprints/10 rounded-md hover:bg-sprints/20 transition-colors"
          >
            Details
          </button>
        </div>
      )}

      {/* Action banners for gates with explicit actions */}
      {actionableGates.filter((g) => g.id !== readyGate?.id).map((gate) => (
        <div key={gate.id} className="px-4 py-2 bg-sprints/5 border-b border-sprints/20 flex items-center gap-2">
          <BoltIcon size={12} className="text-sprints shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-medium text-text-primary block">
              {gate.name}
            </span>
            {gate.details && (
              <span className="text-[10px] text-text-ghost block mt-0.5 truncate">
                {gate.details}
              </span>
            )}
          </div>
          <button
            onClick={() => void handleApproveGate(gate.id)}
            disabled={approvingGate === gate.id}
            className="px-2.5 py-1 text-[10px] font-medium bg-sprints text-bg-base rounded-md hover:opacity-90 transition-colors disabled:opacity-50"
          >
            {approvingGate === gate.id ? "..." : (gate.action?.label ?? "Approve")}
          </button>
        </div>
      ))}

      {/* Expanded gate details */}
      {expandedGate && (
        <ExpandedGatePanel
          gate={expandedGate}
          onClose={() => setExpandedGate(null)}
        />
      )}

      {/* Tabs */}
      <div className="px-4 border-b border-border-default shrink-0 flex gap-1">
        {(["overview", "activity"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-2.5 py-2 text-[10px] font-medium border-b transition-colors",
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
              <span className="text-[10px] font-semibold text-text-primary">
                Sprint Spec
              </span>
              <button
                onClick={() => setSpecPanel(false)}
                className="p-0.5 text-text-tertiary hover:text-text-secondary transition-colors rounded"
              >
                <CloseIcon size={12} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 scrollbar-thin">
              {specLoading ? (
                <div className="flex items-center justify-center py-6">
                  <span className="text-[10px] text-text-tertiary animate-pulse">Loading...</span>
                </div>
              ) : (
                <pre className="text-[10px] font-mono text-text-secondary whitespace-pre-wrap break-words leading-relaxed">
                  {specContent}
                </pre>
              )}
            </div>
          </div>
        )}

        {activeTab === "overview" ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
            {/* Agents section */}
            {sprint.agents.length > 0 && (
              <div>
                <h4 className="text-[10px] font-medium uppercase tracking-[0.5px] text-text-ghost mb-1.5">
                  Agents
                </h4>
                <AgentList agents={sprint.agents} />
              </div>
            )}

            {/* Gates overview */}
            <div>
              <h4 className="text-[10px] font-medium uppercase tracking-[0.5px] text-text-ghost mb-1.5">
                Gates
              </h4>
              <div className="space-y-1">
                {sprint.gates.map((gate) => (
                  <button
                    key={gate.id}
                    onClick={() => setExpandedGate(expandedGateId === gate.id ? null : gate.id)}
                    className="flex items-center gap-2 w-full text-left px-2.5 py-1.5 rounded-md hover:bg-bg-elevated transition-colors"
                  >
                    <div
                      className={cn(
                        "w-[5px] h-[5px] rounded-full shrink-0",
                        gate.status === "passed" ? "bg-sessions"
                          : gate.status === "in_progress" ? "bg-sprints"
                          : gate.status === "failed" ? "bg-error"
                          : "bg-text-ghost",
                      )}
                    />
                    <span className="text-[10px] text-text-primary font-medium flex-1">
                      {gate.name}
                    </span>
                    <span className={cn(
                      "text-[9px] font-medium px-1.5 py-0.5 rounded-full",
                      gate.status === "passed" ? "bg-sessions/10 text-sessions"
                        : gate.status === "in_progress" ? "bg-sprints/10 text-sprints"
                        : gate.status === "failed" ? "bg-error/10 text-error"
                        : "bg-bg-input text-text-tertiary",
                    )}>
                      {gate.status === "passed" ? "Passed" : gate.status === "in_progress" ? "In Progress" : gate.status === "failed" ? "Failed" : "Pending"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Sprint info */}
            <div>
              <h4 className="text-[10px] font-medium uppercase tracking-[0.5px] text-text-ghost mb-1.5">
                Info
              </h4>
              <div className="space-y-1 text-[10px]">
                {sprint.startedAt && (
                  <div className="flex items-center gap-2">
                    <span className="text-text-ghost w-16">Started</span>
                    <span className="text-text-secondary">
                      {new Date(sprint.startedAt).toLocaleString()}
                    </span>
                  </div>
                )}
                {sprint.completedAt && (
                  <div className="flex items-center gap-2">
                    <span className="text-text-ghost w-16">Completed</span>
                    <span className="text-text-secondary">
                      {new Date(sprint.completedAt).toLocaleString()}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-text-ghost w-16">Gates</span>
                  <span className="text-text-secondary">
                    {sprint.gates.filter((g) => g.status === "passed").length}/{sprint.gates.length} passed
                  </span>
                </div>
              </div>
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
                  <span className="text-[10px] font-semibold text-text-primary">
                    Handoff Detail
                  </span>
                  <button
                    onClick={() => setHandoffPanelData(null)}
                    className="p-0.5 text-text-tertiary hover:text-text-secondary transition-colors"
                  >
                    <CloseIcon size={12} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2.5 scrollbar-thin">
                  <pre className="text-[10px] font-mono text-text-secondary whitespace-pre-wrap break-all leading-relaxed">
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
