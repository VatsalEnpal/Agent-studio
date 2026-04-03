"use client";

import { useMemo } from "react";
import { Clock, X, CheckCircle } from "lucide-react";
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
      return { label: "In Progress", class: "bg-console-accent/15 text-console-accent" };
    case "launching":
      return { label: "Launching", class: "bg-console-accent/15 text-console-accent" };
    case "paused":
      return { label: "Paused", class: "bg-amber-400/15 text-amber-400" };
    case "completed":
      return { label: "Completed", class: "bg-emerald-500/15 text-emerald-400" };
    case "cancelled":
      return { label: "Cancelled", class: "bg-console-dim/15 text-console-dim" };
    case "failed":
      return { label: "Failed", class: "bg-red-500/15 text-red-400" };
    case "planned":
    default:
      return { label: "Planned", class: "bg-console-border text-console-dim" };
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

export function SprintDetail({ sprint }: SprintDetailProps) {
  const activeTab = useSprintsStore((s) => s.activeTab);
  const setActiveTab = useSprintsStore((s) => s.setActiveTab);
  const expandedGateId = useSprintsStore((s) => s.expandedGateId);
  const setExpandedGate = useSprintsStore((s) => s.setExpandedGate);
  const handoffPanelData = useSprintsStore((s) => s.handoffPanelData);
  const setHandoffPanelData = useSprintsStore((s) => s.setHandoffPanelData);
  const addToast = useToastStore((s) => s.addToast);

  const badge = statusBadge(sprint.status);

  // Find gate that's ready for approval (in_progress with all requirements met)
  const readyGate = useMemo(() => {
    return sprint.gates.find(
      (g) =>
        g.status === "in_progress" &&
        g.requirements.length > 0 &&
        g.requirements.every((r) => r.met),
    );
  }, [sprint.gates]);

  const expandedGate = sprint.gates.find((g) => g.id === expandedGateId);

  const handleApproveGate = async (gateId: string) => {
    try {
      const res = await fetch(`/api/sprint/gate/${gateId}/approve`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to approve gate");
      addToast("Gate approved", "success");
    } catch {
      addToast("Failed to approve gate", "error");
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-console-border shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-medium text-console-text truncate">
            {sprint.name}
          </h2>
          <span className={cn("text-[8px] px-1.5 py-0.5 rounded font-medium", badge.class)}>
            {badge.label}
          </span>
          <span className="text-[9px] text-console-dim flex items-center gap-1 ml-auto shrink-0">
            <Clock className="w-3 h-3" />
            {formatElapsed(sprint.startedAt)}
          </span>
        </div>

        {/* Gate stepper */}
        {sprint.gates.length > 0 && (
          <div className="mt-3">
            <GateStepper
              gates={sprint.gates}
              expandedGateId={expandedGateId}
              onGateClick={(id) =>
                setExpandedGate(expandedGateId === id ? null : id)
              }
            />
          </div>
        )}
      </div>

      {/* Gate approval banner */}
      {readyGate && (
        <div className="px-4 py-2.5 bg-[var(--accent-subtle)] border-b border-[var(--accent)]/20 flex items-center gap-3">
          <CheckCircle className="w-4 h-4 text-[var(--accent)] shrink-0" />
          <span className="text-[11px] font-medium text-[var(--accent)] flex-1">
            {readyGate.name} ready for approval
          </span>
          <button
            onClick={() => void handleApproveGate(readyGate.id)}
            className="px-3 py-1 text-[10px] font-medium bg-[var(--accent)] text-white rounded hover:bg-[var(--accent-hover)] transition-colors"
          >
            Approve
          </button>
          <button
            onClick={() => setExpandedGate(readyGate.id)}
            className="px-2 py-1 text-[10px] font-medium text-[var(--accent)] bg-[var(--accent)]/10 rounded hover:bg-[var(--accent)]/20 transition-colors"
          >
            View Changes
          </button>
        </div>
      )}

      {/* Expanded gate requirements */}
      {expandedGate && (
        <div className="px-4 py-3 border-b border-console-border bg-[var(--elevation-1)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium text-console-text">
              {expandedGate.name} Requirements
            </span>
            <button
              onClick={() => setExpandedGate(null)}
              className="p-0.5 text-console-dim hover:text-console-muted transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-1">
            {expandedGate.requirements.map((req, i) => (
              <div key={i} className="flex items-center gap-2">
                <div
                  className={cn(
                    "w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0",
                    req.met
                      ? "bg-emerald-500/20 border-emerald-500/40"
                      : "bg-transparent border-console-border",
                  )}
                >
                  {req.met && (
                    <svg className="w-2 h-2 text-emerald-400" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M2 6l3 3 5-5" />
                    </svg>
                  )}
                </div>
                <span
                  className={cn(
                    "text-[10px]",
                    req.met ? "text-console-text" : "text-console-muted",
                  )}
                >
                  {req.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="px-4 border-b border-console-border shrink-0 flex gap-1">
        {(["overview", "activity"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-3 py-2 text-[10px] font-medium border-b-2 transition-colors",
              activeTab === tab
                ? "border-console-accent text-console-accent"
                : "border-transparent text-console-muted hover:text-console-text",
            )}
          >
            {tab === "overview" ? "Overview" : "Activity"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden flex">
        {activeTab === "overview" ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Agents section */}
            <div>
              <h4 className="text-[10px] font-medium text-console-muted uppercase tracking-wider mb-2">
                Agents
              </h4>
              <AgentList agents={sprint.agents} />
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
              <div className="w-72 border-l border-console-border bg-[var(--elevation-1)] flex flex-col overflow-hidden shrink-0">
                <div className="px-3 py-2 border-b border-console-border flex items-center justify-between shrink-0">
                  <span className="text-[10px] font-medium text-console-text">
                    Handoff Detail
                  </span>
                  <button
                    onClick={() => setHandoffPanelData(null)}
                    className="p-0.5 text-console-dim hover:text-console-muted transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-3">
                  <pre className="text-[9px] font-mono text-console-muted whitespace-pre-wrap break-all leading-relaxed">
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
