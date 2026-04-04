"use client";

import { useCallback, useState } from "react";
import { CheckIcon, CloseIcon, PlayIcon, ClockIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { useReportsStore, type Report } from "@/stores/reports";

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

interface ReportDetailProps {
  report: Report;
}

export function ReportDetail({ report }: ReportDetailProps) {
  const approveReport = useReportsStore((s) => s.approveReport);
  const dismissReport = useReportsStore((s) => s.dismissReport);
  const approveAction = useReportsStore((s) => s.approveAction);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleApproveAll = useCallback(async () => {
    try {
      const res = await fetch(`/api/reports/${report.id}/approve`, { method: "POST" });
      if (res.ok) approveReport(report.id);
    } catch {
      // Best effort
    }
  }, [report.id, approveReport]);

  const handleDismiss = useCallback(async () => {
    try {
      const res = await fetch(`/api/reports/${report.id}/dismiss`, { method: "POST" });
      if (res.ok) dismissReport(report.id);
    } catch {
      // Best effort
    }
  }, [report.id, dismissReport]);

  const handleApproveAction = useCallback(
    async (actionId: string) => {
      setActionLoading(actionId);
      try {
        const res = await fetch(
          `/api/reports/${report.id}/actions/${actionId}/approve`,
          { method: "POST" },
        );
        if (res.ok) approveAction(report.id, actionId);
      } catch {
        // Best effort
      } finally {
        setActionLoading(null);
      }
    },
    [report.id, approveAction],
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-console-border shrink-0">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-console-text">
            {report.automationName}
          </h2>
          <span
            className={cn(
              "px-2 py-0.5 rounded text-[10px] font-medium",
              report.status === "pending" && "bg-yellow-500/15 text-yellow-400",
              report.status === "approved" && "bg-emerald-500/15 text-emerald-400",
              report.status === "dismissed" && "bg-console-faint text-console-dim",
            )}
          >
            {report.status}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-console-dim">
          <ClockIcon className="w-3 h-3" />
          {formatTimestamp(report.timestamp)}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Summary */}
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-console-dim mb-2">
            Summary
          </h3>
          <div className="px-3 py-2 bg-console-bg border border-console-border rounded text-xs text-console-text whitespace-pre-wrap font-mono leading-relaxed max-h-[400px] overflow-y-auto">
            {report.summary}
          </div>
        </div>

        {/* Suggested Actions */}
        {report.suggestedActions.length > 0 && (
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-console-dim mb-2">
              Suggested Actions ({report.suggestedActions.length})
            </h3>
            <div className="space-y-2">
              {report.suggestedActions.map((action) => (
                <div
                  key={action.id}
                  className={cn(
                    "px-3 py-2.5 rounded border transition-colors",
                    action.approved
                      ? "bg-emerald-500/5 border-emerald-500/20"
                      : "bg-console-bg border-console-border",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-console-text mb-0.5">
                        {action.title}
                      </p>
                      <p className="text-[10px] text-console-dim">
                        {action.description}
                      </p>
                      <p className="text-[9px] text-console-muted mt-1">
                        <PlayIcon className="w-2.5 h-2.5 inline mr-0.5 -mt-0.5" />
                        Agent: {action.agent}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {action.approved ? (
                        <span className="flex items-center gap-1 px-2 py-1 text-[10px] text-emerald-400 font-medium">
                          <CheckIcon className="w-3 h-3" />
                          Approved
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={() => void handleApproveAction(action.id)}
                            disabled={actionLoading === action.id || report.status !== "pending"}
                            className="px-2 py-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Approve
                          </button>
                          <button
                            disabled={report.status !== "pending"}
                            className="px-2 py-1 text-[10px] font-medium text-console-dim hover:text-console-muted rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Skip
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {report.status === "pending" && (
        <div className="px-4 py-3 border-t border-console-border shrink-0 flex items-center justify-end gap-2">
          <button
            onClick={() => void handleDismiss()}
            className="px-3 py-1.5 text-xs text-console-dim hover:text-console-muted border border-console-border rounded transition-colors"
          >
            <CloseIcon className="w-3 h-3 inline mr-1 -mt-0.5" />
            Dismiss
          </button>
          <button
            onClick={() => void handleApproveAll()}
            className="px-3 py-1.5 text-xs font-medium text-black bg-emerald-500 hover:bg-emerald-400 rounded transition-colors"
          >
            <CheckIcon className="w-3 h-3 inline mr-1 -mt-0.5" />
            Approve All
          </button>
        </div>
      )}
    </div>
  );
}
