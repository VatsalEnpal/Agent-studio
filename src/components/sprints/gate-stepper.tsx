"use client";

import { cn } from "@/lib/utils";
import type { Gate } from "@/stores/sprints";

interface GateStepperProps {
  gates: Gate[];
  expandedGateId: string | null;
  onGateClick: (gateId: string) => void;
  onApprove?: (gateId: string) => void;
  approvingGate?: string | null;
}

export function GateStepper({ gates, expandedGateId, onGateClick }: GateStepperProps) {
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <div className="flex items-end gap-[3px] min-w-0">
        {gates.map((gate, i) => {
          const isExpanded = expandedGateId === gate.id;
          const isPassed = gate.status === "passed";
          const isCurrent = gate.status === "in_progress";
          const isFailed = gate.status === "failed";

          return (
            <button
              key={gate.id}
              onClick={() => onGateClick(gate.id)}
              className="flex flex-col items-center gap-1 group shrink-0"
              title={gate.name}
            >
              {/* Gate label */}
              <span
                className={cn(
                  "text-[9px] leading-none max-w-[72px] truncate",
                  isExpanded
                    ? "text-text-primary font-medium"
                    : isPassed
                      ? "text-sessions/70"
                      : isCurrent
                        ? "text-sprints"
                        : isFailed
                          ? "text-error/70"
                          : "text-text-ghost",
                )}
              >
                {gate.name}
              </span>

              {/* Bar segment */}
              <div
                className={cn(
                  "w-12 h-[3px] rounded-[1.5px] transition-all",
                  isPassed && "bg-sessions",
                  isCurrent && "bg-sprints animate-[pulse_2s_ease-in-out_infinite]",
                  isFailed && "bg-error",
                  !isPassed && !isCurrent && !isFailed && "bg-border-default",
                  isExpanded && "ring-1 ring-text-primary ring-offset-1 ring-offset-bg-base",
                  "group-hover:opacity-80",
                )}
              />

              {/* Current gate indicator — tiny number */}
              {isCurrent && (
                <span className="text-[8px] text-sprints font-medium leading-none">
                  {i + 1}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
