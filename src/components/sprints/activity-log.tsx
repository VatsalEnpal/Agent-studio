"use client";

import { useEffect, useRef } from "react";
import { ArrowRightLeft, ShieldCheck, AlertTriangle, Info, Zap, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { agentColor } from "@/lib/design-tokens";
import type { ActivityEntry } from "@/stores/sprints";

interface ActivityLogProps {
  entries: ActivityEntry[];
  onHandoffClick: (data: Record<string, unknown>) => void;
}

const TYPE_ICON: Record<string, typeof Info> = {
  task: Zap,
  handoff: ArrowRightLeft,
  gate: CheckCircle,
  qa: ShieldCheck,
  error: AlertTriangle,
  info: Info,
};

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function ActivityLog({ entries, onHandoffClick }: ActivityLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [entries.length]);

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-tertiary)] text-[10px]">
        No activity yet
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-0.5">
      {entries.map((entry) => {
        const Icon = TYPE_ICON[entry.type] ?? Info;
        const color = agentColor(entry.agent);
        const isHandoff = entry.type === "handoff" && entry.handoffData;
        const isQa = entry.type === "qa" && entry.qaScore != null;

        return (
          <button
            key={entry.id}
            onClick={isHandoff ? () => onHandoffClick(entry.handoffData!) : undefined}
            disabled={!isHandoff}
            className={cn(
              "flex items-start gap-2 w-full text-left px-2 py-1.5 rounded transition-colors",
              isHandoff
                ? "hover:bg-[var(--elevation-2)] cursor-pointer"
                : "cursor-default",
            )}
          >
            {/* Timestamp */}
            <span className="text-[9px] font-mono text-[var(--text-tertiary)] shrink-0 mt-0.5 w-[56px]">
              {formatTimestamp(entry.timestamp)}
            </span>

            {/* Icon */}
            <Icon
              className={cn(
                "w-3 h-3 shrink-0 mt-0.5",
                entry.type === "error"
                  ? "text-red-400"
                  : entry.type === "qa"
                    ? "text-emerald-400"
                    : "text-[var(--text-tertiary)]",
              )}
            />

            {/* Agent */}
            <span
              className="text-[10px] font-medium shrink-0 mt-px"
              style={{ color }}
            >
              {entry.agent}
            </span>

            {/* Action */}
            <span className="text-[10px] text-[var(--text-secondary)] flex-1 min-w-0 truncate mt-px">
              {entry.action}
            </span>

            {/* QA score badge */}
            {isQa && (
              <span
                className={cn(
                  "text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0",
                  entry.qaScore! >= 95
                    ? "bg-emerald-500/15 text-emerald-400"
                    : entry.qaScore! >= 80
                      ? "bg-amber-500/15 text-amber-400"
                      : "bg-red-500/15 text-red-400",
                )}
              >
                {entry.qaScore}%
              </span>
            )}

            {/* Handoff indicator */}
            {isHandoff && (
              <span className="text-[8px] text-[var(--accent)] shrink-0 mt-0.5">
                view
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
