"use client";

import { useEffect, useRef } from "react";
import { CheckIcon, WarningIcon, InfoIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { agentColor } from "@/lib/design-tokens";
import type { ActivityEntry } from "@/stores/sprints";

type IconComponent = React.ComponentType<{ className?: string; size?: number }>;

const TYPE_ICON: Record<string, IconComponent> = {
  task: CheckIcon,
  handoff: InfoIcon,
  gate: CheckIcon,
  qa: CheckIcon,
  error: WarningIcon,
  info: InfoIcon,
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

function dateLabel(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const entryDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((today.getTime() - entryDay.getTime()) / 86400_000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  } catch {
    return "";
  }
}

interface ActivityLogProps {
  entries: ActivityEntry[];
  onHandoffClick: (data: Record<string, unknown>) => void;
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
      <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
        <InfoIcon size={20} className="text-text-ghost" />
        <p className="text-[10px] text-text-secondary font-medium">No activity recorded</p>
        <p className="text-[10px] text-text-tertiary max-w-[200px]">
          Agent actions, handoffs, and gate transitions will appear here in real time
        </p>
      </div>
    );
  }

  let lastDateLabel = "";

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5 scrollbar-thin">
      {entries.map((entry) => {
        const Icon = TYPE_ICON[entry.type] ?? InfoIcon;
        const color = agentColor(entry.agent);
        const isHandoff = entry.type === "handoff" && entry.handoffData;
        const isQa = entry.type === "qa" && entry.qaScore != null;

        // Date divider
        const currentDateLabel = dateLabel(entry.timestamp);
        let showDivider = false;
        if (currentDateLabel && currentDateLabel !== lastDateLabel) {
          showDivider = true;
          lastDateLabel = currentDateLabel;
        }

        return (
          <div key={entry.id}>
            {showDivider && (
              <div className="flex items-center gap-2 py-1.5 mt-1">
                <div className="flex-1 h-px bg-border-subtle" />
                <span className="text-[9px] text-text-ghost uppercase tracking-wider shrink-0">
                  {currentDateLabel}
                </span>
                <div className="flex-1 h-px bg-border-subtle" />
              </div>
            )}
            <button
              onClick={isHandoff ? () => onHandoffClick(entry.handoffData!) : undefined}
              disabled={!isHandoff}
              className={cn(
                "flex items-start gap-2 w-full text-left px-2 py-1.5 rounded transition-all",
                isHandoff
                  ? "hover:bg-bg-elevated hover:shadow-[0_0_12px_rgba(251,191,36,0.04)] cursor-pointer"
                  : "cursor-default",
              )}
            >
              {/* Timestamp */}
              <span className="text-label font-mono text-text-tertiary shrink-0 mt-0.5 w-[56px]">
                {formatTimestamp(entry.timestamp)}
              </span>

              {/* Icon */}
              <Icon
                size={12}
                className={cn(
                  "shrink-0 mt-0.5",
                  entry.type === "error"
                    ? "text-error"
                    : entry.type === "qa"
                      ? "text-sessions"
                      : "text-text-tertiary",
                )}
              />

              {/* Agent */}
              <span
                className="text-label font-medium shrink-0 mt-px"
                style={{ color }}
              >
                {entry.agent}
              </span>

              {/* Action */}
              <span className="text-label text-text-secondary flex-1 min-w-0 truncate mt-px">
                {entry.action}
              </span>

              {/* QA score badge */}
              {isQa && (
                <span
                  className={cn(
                    "text-label font-semibold px-1.5 py-0.5 rounded shrink-0",
                    entry.qaScore! >= 95
                      ? "bg-sessions/15 text-sessions"
                      : entry.qaScore! >= 80
                        ? "bg-sprints/15 text-sprints"
                        : "bg-error/15 text-error",
                  )}
                >
                  {entry.qaScore}%
                </span>
              )}

              {/* Handoff indicator */}
              {isHandoff && (
                <span className="text-label text-rooms shrink-0 mt-0.5">
                  view
                </span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
