"use client";

import { useEffect, useCallback } from "react";
import { FileText, RefreshCw } from "lucide-react";
import { useReportsStore, type Report } from "@/stores/reports";
import { ReportCard } from "./report-card";
import { ReportDetail } from "./report-detail";
import { wsClient } from "@/lib/ws-client";
import type { WsMessage } from "@/lib/types";

export function ReportsView() {
  const reports = useReportsStore((s) => s.reports);
  const selectedReport = useReportsStore((s) => s.selectedReport);
  const setReports = useReportsStore((s) => s.setReports);
  const addReport = useReportsStore((s) => s.addReport);
  const selectReport = useReportsStore((s) => s.selectReport);
  const loading = useReportsStore((s) => s.loading);
  const setLoading = useReportsStore((s) => s.setLoading);

  // Fetch reports on mount
  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reports");
      if (res.ok) {
        const data = (await res.json()) as Report[];
        setReports(data);
      }
    } catch {
      // Best effort
    } finally {
      setLoading(false);
    }
  }, [setReports, setLoading]);

  useEffect(() => {
    void fetchReports();
  }, [fetchReports]);

  // Listen for new automation reports via WebSocket
  useEffect(() => {
    const unsub = wsClient.on("automation-report", (msg: WsMessage) => {
      if (msg.payload) {
        addReport(msg.payload as Report);
      }
    });
    return unsub;
  }, [addReport]);

  if (loading && reports.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="space-y-3 w-64">
          <div className="skeleton h-4 w-3/4 mx-auto" />
          <div className="skeleton h-3 w-1/2 mx-auto" />
          <div className="skeleton h-3 w-2/3 mx-auto" />
        </div>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-12 h-12 rounded-xl bg-console-faint/60 flex items-center justify-center mx-auto">
            <FileText className="w-6 h-6 text-console-dim" />
          </div>
          <div>
            <p className="text-sm font-medium text-console-muted mb-1.5">No reports yet</p>
            <p className="text-xs text-console-dim leading-relaxed">
              Set up automations in Settings to get started. Automations run on a
              schedule and produce reports for your review.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* Left panel: report list */}
      <div className="w-80 shrink-0 border-r border-console-border flex flex-col">
        <div className="px-3 py-2.5 border-b border-console-border flex items-center justify-between">
          <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-console-dim">
            Reports ({reports.length})
          </span>
          <button
            onClick={() => void fetchReports()}
            className="p-1 text-console-dim hover:text-console-muted transition-colors"
            title="Refresh reports"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {reports.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              isSelected={selectedReport?.id === report.id}
              onClick={() => selectReport(report)}
            />
          ))}
        </div>
      </div>

      {/* Right panel: report detail */}
      <div className="flex-1 min-w-0">
        {selectedReport ? (
          <ReportDetail report={selectedReport} />
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-xs text-console-dim">
              Select a report to view details
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
