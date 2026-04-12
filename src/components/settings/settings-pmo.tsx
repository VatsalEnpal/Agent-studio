"use client";

import { useState, useEffect } from "react";
import { PlayIcon, PauseIcon, RefreshIcon, ClockIcon } from "@/components/ui/icons";
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
    <section className="border border-border-default rounded bg-bg-surface">
      <div className="px-4 py-3 border-b border-border-default">
        <h3 className="text-body font-medium text-text-primary">PMO Scheduler</h3>
        <p className="text-label text-text-tertiary mt-0.5">
          Periodic project health scans. The PMO agent reviews code quality, test coverage, and open issues on a schedule.
        </p>
      </div>
      <div className="px-4 py-3 space-y-3">
        {/* Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "w-2 h-2 rounded-full",
                isRunning ? "bg-sessions animate-pulse" : "bg-text-tertiary",
              )}
            />
            <span className="text-body text-text-primary font-medium">
              {isRunning ? "Running" : "Paused"}
            </span>
          </div>
          {status?.nextScanIn && (
            <span className="text-label text-text-tertiary flex items-center gap-1">
              <ClockIcon className="w-3 h-3" />
              Next scan in {status.nextScanIn}
            </span>
          )}
        </div>

        {/* Last scan info */}
        {status?.lastScan && (
          <div className="bg-bg-base rounded px-3 py-2 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-label text-text-tertiary">Last scan</span>
              <span className="text-label text-text-secondary font-mono">
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
                <span className="text-label text-text-tertiary">Status</span>
                <span className={cn(
                  "text-label font-medium",
                  status.lastStatus === "ok" ? "text-sessions" : "text-error",
                )}>
                  {status.lastStatus}
                </span>
              </div>
            )}
            {status.lastDetail && (
              <p className="text-label text-text-secondary mt-1">{status.lastDetail}</p>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {isRunning ? (
            <button
              onClick={() => void handleAction("stop")}
              disabled={actionLoading !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 text-label font-medium rounded bg-error/15 text-error hover:bg-error/25 transition-all"
            >
              <PauseIcon className="w-3 h-3" />
              {actionLoading === "stop" ? "Stopping..." : "Stop"}
            </button>
          ) : (
            <button
              onClick={() => void handleAction("start")}
              disabled={actionLoading !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 text-label font-medium rounded bg-sessions/15 text-sessions hover:bg-sessions/25 transition-all"
            >
              <PlayIcon className="w-3 h-3" />
              {actionLoading === "start" ? "Starting..." : "Start"}
            </button>
          )}
          <button
            onClick={() => void handleAction("scan")}
            disabled={actionLoading !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 text-label font-medium rounded bg-rooms/15 text-rooms hover:bg-rooms/25 transition-all"
          >
            <RefreshIcon className={cn("w-3 h-3", actionLoading === "scan" && "animate-spin")} />
            {actionLoading === "scan" ? "Scanning..." : "Run Scan Now"}
          </button>
        </div>
      </div>
    </section>
  );
}
