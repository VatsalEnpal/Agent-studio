"use client";

import { cn } from "@/lib/utils";
import type { Report } from "@/stores/reports";

function formatRelativeTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  } catch {
    return iso;
  }
}

function StatusBadge({ status }: { status: Report["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium",
        status === "pending" && "bg-amber-500/12 text-amber-400",
        status === "approved" && "bg-emerald-500/12 text-emerald-400",
        status === "dismissed" && "bg-bg-elevated/60 text-text-tertiary",
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          status === "pending" && "bg-amber-400",
          status === "approved" && "bg-emerald-400",
          status === "dismissed" && "bg-text-tertiary",
        )}
      />
      {status}
    </span>
  );
}

interface ReportCardProps {
  report: Report;
  isSelected: boolean;
  onClick: () => void;
}

export function ReportCard({ report, isSelected, onClick }: ReportCardProps) {
  const preview = report.summary.slice(0, 80).replace(/\n/g, " ").trim();

  return (
    <button
      onClick={onClick}
      className={cn(
        "sidebar-item w-full text-left px-3 py-2.5 border-b border-border-default",
        "transition-all active:scale-[0.98]",
        isSelected
          ? "bg-rooms/8 border-l-2 border-l-rooms"
          : "hover:bg-bg-elevated/30 hover:shadow-[0_0_12px_rgba(124,131,247,0.06)] border-l-2 border-l-transparent",
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-medium text-text-primary truncate">
          {report.automationName}
        </span>
        <StatusBadge status={report.status} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-text-tertiary truncate max-w-[70%]">
          {preview || "(empty report)"}
        </span>
        <span className="text-[9px] text-text-tertiary shrink-0">
          {formatRelativeTime(report.timestamp)}
        </span>
      </div>
      {report.suggestedActions.length > 0 && (
        <div className="mt-1">
          <span className="text-[9px] text-text-secondary">
            {report.suggestedActions.length} action{report.suggestedActions.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}
    </button>
  );
}
