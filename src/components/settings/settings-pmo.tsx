"use client";

import { useState, useEffect } from "react";
import { Play, Pause, ArrowClockwise, Clock } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface PmoStatus {
  loaded: boolean;
  lastScan: string | null;
  lastStatus: string | null;
  lastDetail: string | null;
  nextScanIn: string | null;
}

export function SettingsPmo() {
  const [status, setStatus] = useState<PmoStatus | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchStatus = () => {
    fetch("/api/pmo/status-full")
      .then((r) => r.json())
      .then((data: PmoStatus) => setStatus(data))
      .catch(() => { /* ignore */ });
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleAction = async (action: "start" | "stop" | "scan") => {
    setActionLoading(action);
    try {
      await fetch(`/api/pmo/${action}`, { method: "POST" });
      setTimeout(fetchStatus, 1000);
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  };

  const isRunning = status?.loaded ?? false;

  return (
    <section className="border border-console-border rounded-lg bg-console-panel">
      <div className="px-4 py-3 border-b border-console-border">
        <h3 className="text-body-sm font-medium text-console-text">PMO Scheduler</h3>
      </div>
      <div className="px-4 py-3 space-y-3">
        {/* Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "w-2 h-2 rounded-full",
                isRunning ? "bg-console-success animate-pulse" : "bg-console-dim",
              )}
            />
            <span className="text-body-sm text-console-text font-medium">
              {isRunning ? "Running" : "Paused"}
            </span>
          </div>
          {status?.nextScanIn && (
            <span className="text-label-xs text-console-dim flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Next scan in {status.nextScanIn}
            </span>
          )}
        </div>

        {/* Last scan info */}
        {status?.lastScan && (
          <div className="bg-console-bg rounded px-3 py-2 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-label-xs text-console-dim">Last scan</span>
              <span className="text-label-xs text-console-muted font-mono">
                {new Date(status.lastScan).toLocaleString("de-DE", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            {status.lastStatus && (
              <div className="flex items-center justify-between">
                <span className="text-label-xs text-console-dim">Status</span>
                <span className={cn(
                  "text-label-xs font-medium",
                  status.lastStatus === "ok" ? "text-console-success" : "text-console-error",
                )}>
                  {status.lastStatus}
                </span>
              </div>
            )}
            {status.lastDetail && (
              <p className="text-label-xs text-console-muted mt-1">{status.lastDetail}</p>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {isRunning ? (
            <button
              onClick={() => void handleAction("stop")}
              disabled={actionLoading !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 text-label-xs font-medium rounded bg-console-error/15 text-console-error hover:bg-console-error/25 transition-all"
            >
              <Pause className="w-3 h-3" />
              {actionLoading === "stop" ? "Stopping..." : "Stop"}
            </button>
          ) : (
            <button
              onClick={() => void handleAction("start")}
              disabled={actionLoading !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 text-label-xs font-medium rounded bg-console-success/15 text-console-success hover:bg-console-success/25 transition-all"
            >
              <Play className="w-3 h-3" />
              {actionLoading === "start" ? "Starting..." : "Start"}
            </button>
          )}
          <button
            onClick={() => void handleAction("scan")}
            disabled={actionLoading !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 text-label-xs font-medium rounded bg-console-accent/15 text-console-accent hover:bg-console-accent/25 transition-all"
          >
            <ArrowClockwise className={cn("w-3 h-3", actionLoading === "scan" && "animate-spin")} />
            {actionLoading === "scan" ? "Scanning..." : "Run Scan Now"}
          </button>
        </div>
      </div>
    </section>
  );
}
