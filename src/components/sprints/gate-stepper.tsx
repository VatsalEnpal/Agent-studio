"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Gate } from "@/stores/sprints";

interface GateStepperProps {
  gates: Gate[];
  expandedGateId: string | null;
  onGateClick: (gateId: string) => void;
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

export function GateStepper({ gates, expandedGateId, onGateClick }: GateStepperProps) {
  return (
    <div className="flex items-center w-full px-4">
      {gates.map((gate, i) => {
        const colors = STATUS_COLORS[gate.status] ?? STATUS_COLORS.not_started;
        const isExpanded = expandedGateId === gate.id;
        const isLast = i === gates.length - 1;

        return (
          <div key={gate.id} className="flex items-center flex-1 last:flex-none">
            {/* Gate circle */}
            <button
              onClick={() => onGateClick(gate.id)}
              className={cn(
                "relative flex items-center justify-center w-8 h-8 rounded-full ring-2 shrink-0 transition-all",
                colors.ring,
                gate.status === "passed" ? colors.bg : "bg-[var(--elevation-1)]",
                gate.status === "in_progress" && "animate-[pulse_1.5s_ease-in-out_infinite]",
                isExpanded && "ring-offset-2 ring-offset-[var(--elevation-0)]",
              )}
              title={gate.name}
            >
              {gate.status === "passed" ? (
                <Check
                  className={cn(
                    "w-4 h-4 text-white",
                    "animate-[bounce-in_300ms_cubic-bezier(0.34,1.56,0.64,1)]",
                  )}
                />
              ) : (
                <span
                  className={cn(
                    "text-[10px] font-semibold",
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

            {/* Gate label */}
            <span
              className={cn(
                "ml-2 text-[10px] font-medium whitespace-nowrap",
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

            {/* Connecting line */}
            {!isLast && (
              <div className="flex-1 mx-3">
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
