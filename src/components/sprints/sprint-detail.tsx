"use client";

import { useMemo, useState, useCallback } from "react";
import { Clock, X, CheckCircle, FileText, SpinnerGap } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useSprintsStore, type Sprint } from "@/stores/sprints";
import { useToastStore } from "@/stores/toast";
import { GateStepper } from "./gate-stepper";
import { AgentList } from "./agent-list";
import { ActivityLog } from "./activity-log";

interface SprintDetailProps {
  sprint: Sprint;
}

function statusBadge(status: string): { label: string; class: string } {
  switch (status) {
    case "in_progress":
      return { label: "In Progress", class: "bg-[var(--accent)]/15 text-[var(--accent)]" };
    case "launching":
      return { label: "Launching", class: "bg-[var(--accent)]/15 text-[var(--accent)]" };
    case "paused":
      return { label: "Paused", class: "bg-amber-400/15 text-amber-400" };
    case "completed":
      return { label: "Completed", class: "bg-emerald-500/15 text-emerald-400" };
    case "cancelled":
      return { label: "Cancelled", class: "bg-[var(--text-tertiary)]/15 text-[var(--text-tertiary)]" };
    case "failed":
      return { label: "Failed", class: "bg-red-500/15 text-red-400" };
    case "planned":
    default:
      return { label: "Planned", class: "bg-[var(--border)] text-[var(--text-tertiary)]" };
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

function ExpandedGatePanel({ gate, onClose }: { gate: Sprint["gates"][number]; onClose: () => void }) {
  const rc = gate.richContent as Record<string, unknown> | null | undefined;
  const gateChecks = rc?.gateChecks as string[] | undefined;
  const buildSummary = rc?.buildSummary as string[] | undefined;

  return (
    <div className="px-5 py-4 border-b border-[var(--border)] bg-[var(--elevation-1)]">
      <div className="flex items-center justify-between mb-3">
        <span className="text-body-sm font-semibold text-[var(--text-primary)]">
          {gate.name}
        </span>
        <button
          onClick={onClose}
          className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors rounded"
        >
          <X size={14} weight="light" />
        </button>
      </div>

      {gate.details && (
        <p className="text-body-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
          {gate.details}
        </p>
      )}

      {gate.requirements.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-label-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
            Requirements
          </span>
          {gate.requirements.map((req, i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                className={cn(
                  "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                  req.met
                    ? "bg-emerald-500/20 border-emerald-500/40"
                    : "bg-transparent border-[var(--border)]",
                )}
              >
                {req.met && (
                  <svg className="w-2.5 h-2.5 text-emerald-400" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2 6l3 3 5-5" />
                  </svg>
                )}
              </div>
              <span
                className={cn(
                  "text-body-sm",
                  req.met ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]",
                )}
              >
                {req.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {gateChecks && gateChecks.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <span className="text-label-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
            Gate Checks
          </span>
          {gateChecks.map((check, i) => (
            <div key={i} className="text-body-sm text-[var(--text-secondary)] pl-2 border-l-2 border-[var(--border)]">
              {check}
            </div>
          ))}
        </div>
      )}

      {buildSummary && buildSummary.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <span className="text-label-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
            Build Summary
          </span>
          {buildSummary.map((item, i) => (
            <div key={i} className="text-body-sm text-[var(--text-secondary)] pl-2 border-l-2 border-[var(--border)]">
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SprintDetail({ sprint }: SprintDetailProps) {
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
      <div className="px-5 py-4 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-title-sm text-[var(--text-primary)] truncate">
            {sprint.name}
          </h2>
          <span className={cn("text-label-xs px-2 py-0.5 rounded-full font-medium", badge.class)}>
            {badge.label}
          </span>
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <button
              onClick={handleViewSpec}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 text-body-sm font-medium rounded-md transition-colors",
                specPanelOpen
                  ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--elevation-2)]",
              )}
            >
              <FileText size={14} weight="light" />
              View Spec
            </button>
            <span className="text-label-xs text-[var(--text-tertiary)] flex items-center gap-1">
              <Clock size={12} weight="light" />
              {formatElapsed(sprint.startedAt)}
            </span>
          </div>
        </div>

        {/* Gate stepper */}
        {sprint.gates.length > 0 && (
          <div className="mt-4">
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

      {/* Gate approval banner — for gates with all requirements met */}
      {readyGate && (
        <div className="px-5 py-3 bg-[var(--accent)]/5 border-b border-[var(--accent)]/20 flex items-center gap-3">
          <CheckCircle size={16} weight="light" className="text-[var(--accent)] shrink-0" />
          <span className="text-body-sm font-medium text-[var(--accent)] flex-1">
            {readyGate.name} ready for approval
          </span>
          <button
            onClick={() => void handleApproveGate(readyGate.id)}
            disabled={approvingGate === readyGate.id}
            className="px-3 py-1.5 text-body-sm font-medium bg-[var(--accent)] text-white rounded-md hover:opacity-90 transition-colors disabled:opacity-50"
          >
            {approvingGate === readyGate.id ? "Approving..." : "Approve"}
          </button>
          <button
            onClick={() => setExpandedGate(readyGate.id)}
            className="px-2.5 py-1.5 text-body-sm font-medium text-[var(--accent)] bg-[var(--accent)]/10 rounded-md hover:bg-[var(--accent)]/20 transition-colors"
          >
            View Details
          </button>
        </div>
      )}

      {/* Action banners for gates with explicit actions (approve/go) */}
      {actionableGates.filter((g) => g.id !== readyGate?.id).map((gate) => (
        <div key={gate.id} className="px-5 py-3 bg-[var(--accent)]/5 border-b border-[var(--accent)]/20 flex items-center gap-3">
          <CheckCircle size={16} weight="light" className="text-[var(--accent)] shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-body-sm font-medium text-[var(--text-primary)] block">
              {gate.name}
            </span>
            {gate.details && (
              <span className="text-label-xs text-[var(--text-secondary)] block mt-0.5 truncate">
                {gate.details}
              </span>
            )}
          </div>
          <button
            onClick={() => void handleApproveGate(gate.id)}
            disabled={approvingGate === gate.id}
            className="px-3 py-1.5 text-body-sm font-medium bg-[var(--accent)] text-white rounded-md hover:opacity-90 transition-colors disabled:opacity-50"
          >
            {approvingGate === gate.id ? (
              <SpinnerGap size={12} weight="light" className="animate-spin" />
            ) : (
              gate.action?.label ?? "Approve"
            )}
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
      <div className="px-5 border-b border-[var(--border)] shrink-0 flex gap-1">
        {(["overview", "activity"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-3 py-2.5 text-body-sm font-medium border-b-2 transition-colors",
              activeTab === tab
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
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
          <div className="w-[400px] border-r border-[var(--border)] bg-[var(--elevation-0)] flex flex-col shrink-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between shrink-0">
              <span className="text-body-sm font-semibold text-[var(--text-primary)]">
                Sprint Spec
              </span>
              <button
                onClick={() => setSpecPanel(false)}
                className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors rounded"
              >
                <X size={14} weight="light" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {specLoading ? (
                <div className="flex items-center justify-center py-8">
                  <SpinnerGap size={16} weight="light" className="animate-spin text-[var(--text-tertiary)]" />
                </div>
              ) : (
                <pre className="text-body-sm font-mono text-[var(--text-secondary)] whitespace-pre-wrap break-words leading-relaxed">
                  {specContent}
                </pre>
              )}
            </div>
          </div>
        )}

        {activeTab === "overview" ? (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Agents section */}
            {sprint.agents.length > 0 && (
              <div>
                <h4 className="text-label-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
                  Agents
                </h4>
                <AgentList agents={sprint.agents} />
              </div>
            )}

            {/* Gates overview */}
            <div>
              <h4 className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
                Gates
              </h4>
              <div className="space-y-2">
                {sprint.gates.map((gate) => (
                  <button
                    key={gate.id}
                    onClick={() => setExpandedGate(expandedGateId === gate.id ? null : gate.id)}
                    className="flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-lg hover:bg-[var(--elevation-2)] transition-colors"
                  >
                    <div
                      className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        gate.status === "passed" ? "bg-emerald-500"
                          : gate.status === "in_progress" ? "bg-[var(--accent)]"
                          : gate.status === "failed" ? "bg-red-400"
                          : "bg-[var(--text-tertiary)]/30",
                      )}
                    />
                    <span className="text-body-sm text-[var(--text-primary)] font-medium flex-1">
                      {gate.name}
                    </span>
                    <span className={cn(
                      "text-label-xs font-medium px-2 py-0.5 rounded-full",
                      gate.status === "passed" ? "bg-emerald-500/10 text-emerald-400"
                        : gate.status === "in_progress" ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                        : gate.status === "failed" ? "bg-red-500/10 text-red-400"
                        : "bg-[var(--surface)] text-[var(--text-tertiary)]",
                    )}>
                      {gate.status === "passed" ? "Passed" : gate.status === "in_progress" ? "In Progress" : gate.status === "failed" ? "Failed" : "Pending"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Sprint info */}
            <div>
              <h4 className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
                Info
              </h4>
              <div className="space-y-1.5 text-body-sm">
                {sprint.startedAt && (
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--text-tertiary)] w-20">Started</span>
                    <span className="text-[var(--text-secondary)]">
                      {new Date(sprint.startedAt).toLocaleString()}
                    </span>
                  </div>
                )}
                {sprint.completedAt && (
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--text-tertiary)] w-20">Completed</span>
                    <span className="text-[var(--text-secondary)]">
                      {new Date(sprint.completedAt).toLocaleString()}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-[var(--text-tertiary)] w-20">Gates</span>
                  <span className="text-[var(--text-secondary)]">
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
              <div className="w-72 border-l border-[var(--border)] bg-[var(--elevation-1)] flex flex-col overflow-hidden shrink-0">
                <div className="px-3 py-2.5 border-b border-[var(--border)] flex items-center justify-between shrink-0">
                  <span className="text-body-sm font-semibold text-[var(--text-primary)]">
                    Handoff Detail
                  </span>
                  <button
                    onClick={() => setHandoffPanelData(null)}
                    className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                  >
                    <X size={14} weight="light" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-3">
                  <pre className="text-label-xs font-mono text-[var(--text-secondary)] whitespace-pre-wrap break-all leading-relaxed">
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
