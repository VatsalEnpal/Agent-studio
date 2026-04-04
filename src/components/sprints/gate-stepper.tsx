"use client";

import { Check, SpinnerGap } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { Gate } from "@/stores/sprints";

interface GateStepperProps {
  gates: Gate[];
  expandedGateId: string | null;
  onGateClick: (gateId: string) => void;
  onApprove?: (gateId: string) => void;
  approvingGate?: string | null;
}

const STATUS_COLORS: Record<string, { ring: string; bg: string; line: string }> = {
  passed: {
    ring: "ring-emerald-500",
    bg: "bg-emerald-500",
    line: "bg-emerald-500",
  },
  in_progress: {
    ring: "ring-[var(--accent)]",
    bg: "bg-[var(--accent)]",
    line: "bg-[var(--accent)]",
  },
  failed: {
    ring: "ring-red-400",
    bg: "bg-red-400",
    line: "bg-red-400",
  },
  not_started: {
    ring: "ring-[var(--text-tertiary)]",
    bg: "bg-transparent",
    line: "bg-[var(--border)]",
  },
};

export function GateStepper({ gates, expandedGateId, onGateClick, onApprove, approvingGate }: GateStepperProps) {
  return (
    <div className="flex items-center w-full">
      {gates.map((gate, i) => {
        const colors = STATUS_COLORS[gate.status] ?? STATUS_COLORS.not_started;
        const isExpanded = expandedGateId === gate.id;
        const isLast = i === gates.length - 1;
        const hasAction = gate.action && (gate.status === "in_progress" || gate.status === "not_started");
        const isApproving = approvingGate === gate.id;

        return (
          <div key={gate.id} className="flex items-center flex-1 last:flex-none">
            {/* Gate circle */}
            <button
              onClick={() => onGateClick(gate.id)}
              className={cn(
                "relative flex items-center justify-center w-7 h-7 rounded-full ring-2 shrink-0 transition-all",
                colors.ring,
                gate.status === "passed" ? colors.bg : "bg-[var(--elevation-1)]",
                gate.status === "in_progress" && "animate-[pulse_1.5s_ease-in-out_infinite]",
                isExpanded && "ring-offset-2 ring-offset-[var(--elevation-0)]",
              )}
              title={gate.name}
            >
              {gate.status === "passed" ? (
                <Check
                  size={14}
                  weight="bold"
                  className={cn(
                    "text-white",
                    "animate-[bounce-in_300ms_cubic-bezier(0.34,1.56,0.64,1)]",
                  )}
                />
              ) : (
                <span
                  className={cn(
                    "text-label-xs font-semibold",
                    gate.status === "in_progress"
                      ? "text-[var(--accent)]"
                      : gate.status === "failed"
                        ? "text-red-400"
                        : "text-[var(--text-tertiary)]",
                  )}
                >
                  {i + 1}
                </span>
              )}
            </button>

            {/* Gate label + action */}
            <div className="ml-1.5 flex items-center gap-1.5 shrink-0">
              <span
                className={cn(
                  "text-label-xs font-medium whitespace-nowrap",
                  gate.status === "passed"
                    ? "text-emerald-400"
                    : gate.status === "in_progress"
                      ? "text-[var(--text-primary)]"
                      : gate.status === "failed"
                        ? "text-red-400"
                        : "text-[var(--text-tertiary)]",
                )}
              >
                {gate.name}
              </span>

              {/* Inline approve button for actionable gates */}
              {hasAction && onApprove && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onApprove(gate.id);
                  }}
                  disabled={isApproving}
                  className="px-1.5 py-0.5 text-label-xs font-semibold bg-[var(--accent)] text-white rounded hover:opacity-90 transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {isApproving ? (
                    <SpinnerGap size={10} weight="light" className="animate-spin" />
                  ) : (
                    gate.action?.label ?? "Approve"
                  )}
                </button>
              )}
            </div>

            {/* Connecting line */}
            {!isLast && (
              <div className="flex-1 mx-2">
                <div
                  className={cn(
                    "h-px w-full transition-colors",
                    gate.status === "passed" ? colors.line : "bg-[var(--border)]",
                  )}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
