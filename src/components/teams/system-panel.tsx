"use client";

import { useEffect, useState, useCallback } from "react";
import { MemoryIcon, SessionsIcon, HashIcon, ChevronRightIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { useUsage, formatTokensDisplay } from "@/hooks/use-usage";
import { useToastStore } from "@/stores/toast";

interface SystemStats {
  memoryEntries: number;
  memoryCategories: Record<string, number>;
  sessionCount: number;
  lastScan: string | null;
  lastScanStatus: string | null;
  lastScanDetail: string | null;
  pmoStatus: "running" | "paused" | "unknown";
  schedulerNote: string;
}

interface PmoFullStatus {
  loaded: boolean;
  lastScan: string | null;
  lastStatus: string | null;
  lastDetail: string | null;
  nextScanIn: string | null;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function SystemPanel() {
  const [stats, setStats] = useState<SystemStats>({
    memoryEntries: 0,
    memoryCategories: {},
    sessionCount: 0,
    lastScan: null,
    lastScanStatus: null,
    lastScanDetail: null,
    pmoStatus: "unknown",
    schedulerNote: "",
  });
  const [hoveredStat, setHoveredStat] = useState<string | null>(null);
  const [pmoFull, setPmoFull] = useState<PmoFullStatus | null>(null);
  const [pmoAction, setPmoAction] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  // Real usage data from Claude session files
  const usageData = useUsage();
  const totalTokens = usageData.all.reduce((sum, s) => sum + s.totalTokens, 0);

  const loadPmoStatus = useCallback(async () => {
    const data = await fetchJson<PmoFullStatus>("/api/pmo/status-full");
    if (data) setPmoFull(data);
  }, []);

  const load = useCallback(async () => {
    const [memoryRes, sessionsRes, scansRes] = await Promise.all([
      fetchJson<{ total: number; categories: Record<string, number> }>(
        "/api/memory/stats",
      ),
      fetchJson<Array<{ id: string }>>("/api/sessions"),
      fetchJson<Array<{ timestamp: string; status: string; detail: string }>>(
        "/api/sprint/scans",
      ),
    ]);

    const lastScanEntry = scansRes?.length
      ? scansRes[scansRes.length - 1]
      : null;

    // Determine scheduler status (weekend/weekday)
    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();
    let schedulerNote = "";
    if (day === 0 || day === 6) {
      schedulerNote = "Paused (weekend)";
    } else if (hour < 8 || hour > 22) {
      schedulerNote = "Paused (off-hours)";
    } else {
      schedulerNote = "Active";
    }

    // Determine PMO status from scan timing
    let pmoStatus: "running" | "paused" | "unknown" = "unknown";
    if (lastScanEntry) {
      const lastScanTime = new Date(lastScanEntry.timestamp);
      const diffMinutes = (now.getTime() - lastScanTime.getTime()) / 60000;
      if (diffMinutes < 150) {
        pmoStatus = "running";
      } else {
        pmoStatus = "paused";
      }
    }

    setStats({
      memoryEntries: memoryRes?.total ?? 0,
      memoryCategories: memoryRes?.categories ?? {},
      sessionCount: Array.isArray(sessionsRes) ? sessionsRes.length : 0,
      lastScan: lastScanEntry?.timestamp ?? null,
      lastScanStatus: lastScanEntry?.status ?? null,
      lastScanDetail: lastScanEntry?.detail ?? null,
      pmoStatus,
      schedulerNote,
    });
  }, []);

  useEffect(() => {
    void load();
    void loadPmoStatus();
    const interval = setInterval(() => {
      void load();
      void loadPmoStatus();
    }, 30_000);
    return () => clearInterval(interval);
  }, [load, loadPmoStatus]);

  const addToast = useToastStore((s) => s.addToast);

  const handlePmoToggle = useCallback(async () => {
    if (pmoAction) return;
    const isRunning = pmoFull?.loaded;
    const endpoint = isRunning ? "/api/pmo/stop" : "/api/pmo/start";
    const label = isRunning ? "Stopping..." : "Starting...";
    setPmoAction(label);
    try {
      await fetch(endpoint, { method: "POST" });
      await loadPmoStatus();
      addToast(isRunning ? "PMO scheduler paused" : "PMO scheduler started", "success");
    } finally {
      setPmoAction(null);
    }
  }, [pmoFull?.loaded, pmoAction, loadPmoStatus, addToast]);

  const handlePmoScan = useCallback(async () => {
    if (scanning) return;
    setScanning(true);
    addToast("PMO scan started", "info");
    try {
      await fetch("/api/pmo/scan", { method: "POST" });
      // Wait a bit then refresh status
      setTimeout(() => {
        void loadPmoStatus();
        void load();
        setScanning(false);
      }, 5000);
    } catch {
      setScanning(false);
    }
  }, [scanning, loadPmoStatus, load, addToast]);

  // Build memory categories summary for tooltip
  const categoryEntries = Object.entries(stats.memoryCategories).sort(
    (a, b) => b[1] - a[1],
  );

  return (
    <div className="space-y-1.5 pt-2 border-t border-border-default mt-2">
      <h4 className="text-[8px] font-medium text-text-ghost uppercase tracking-widest px-1">
        System
      </h4>

      {/* Avg Context Usage */}
      <StatRow
        icon={<SprintsIconInline />}
        label="Avg Context"
        value={usageData.all.length > 0
          ? `${Math.round(usageData.all.reduce((sum, s) => sum + (s.contextPercent ?? 0), 0) / usageData.all.length)}%`
          : "0%"}
        valueColor={
          usageData.all.length > 0 &&
          usageData.all.reduce((sum, s) => sum + (s.contextPercent ?? 0), 0) / usageData.all.length >= 90
            ? "text-error"
            : usageData.all.length > 0 &&
              usageData.all.reduce((sum, s) => sum + (s.contextPercent ?? 0), 0) / usageData.all.length >= 70
              ? "text-sprints"
              : "text-sessions"
        }
      />

      {/* Total Tokens */}
      <StatRow
        icon={<HashIcon size={12} className="text-text-ghost" />}
        label="Tokens"
        value={formatTokensDisplay(totalTokens)}
      />

      {/* Memory */}
      <div
        className="relative"
        onMouseEnter={() => setHoveredStat("memory")}
        onMouseLeave={() => setHoveredStat(null)}
      >
        <StatRow
          icon={<MemoryIcon size={12} className="text-text-ghost" />}
          label="Memory"
          value={`${stats.memoryEntries} entries`}
        />
        {hoveredStat === "memory" && categoryEntries.length > 0 && (
          <div className="absolute bottom-full left-0 mb-1 w-48 p-2 bg-bg-elevated border border-border-subtle rounded shadow-lg z-20">
            <span className="text-[8px] text-text-ghost uppercase tracking-wider block mb-1">
              Categories
            </span>
            {categoryEntries.map(([cat, count]) => (
              <div key={cat} className="flex items-center justify-between py-0.5">
                <span className="text-[9px] text-text-secondary capitalize">{cat}</span>
                <span className="text-[9px] text-text-ghost font-mono">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sessions */}
      <StatRow
        icon={<SessionsIcon size={12} className="text-text-ghost" />}
        label="Sessions"
        value={`${stats.sessionCount} active`}
      />

      {/* PMO Scheduler Control */}
      <div className="pt-1.5 mt-1.5 border-t border-border-default/50 space-y-1">
        <h4 className="text-[8px] font-medium text-text-ghost uppercase tracking-widest px-1">
          PMO Scheduler
        </h4>

        {/* Status */}
        <div className="flex items-center gap-2 px-1 py-0.5">
          <span className="text-text-ghost shrink-0">
            <SprintsIconInline />
          </span>
          <span className="text-[9px] text-text-ghost flex-1">Status</span>
          <span className={cn(
            "flex items-center gap-1 text-[9px] font-mono shrink-0",
            pmoFull?.loaded ? "text-sessions" : "text-text-ghost",
          )}>
            <span className={cn(
              "w-1.5 h-1.5 rounded-full shrink-0",
              pmoFull?.loaded ? "bg-sessions" : "bg-text-ghost",
            )} />
            {pmoFull?.loaded ? "Running (every 2h)" : "Paused"}
          </span>
        </div>

        {/* Last scan */}
        {pmoFull?.lastScan && (
          <div className="flex items-center gap-2 px-1 py-0.5">
            <span className="text-text-ghost shrink-0 w-3" />
            <span className="text-[9px] text-text-ghost flex-1">Last Scan</span>
            <span className={cn(
              "text-[9px] font-mono shrink-0 max-w-[120px] truncate",
              pmoFull.lastStatus?.includes("NOT READY") ? "text-error" :
              pmoFull.lastStatus?.includes("READY") ? "text-sessions" : "text-text-secondary",
            )}>
              {formatScanTime(pmoFull.lastScan)} — {pmoFull.lastStatus ?? "?"}
            </span>
          </div>
        )}

        {/* Next scan countdown */}
        {pmoFull?.loaded && pmoFull?.nextScanIn && (
          <div className="flex items-center gap-2 px-1 py-0.5">
            <span className="w-3 shrink-0" />
            <span className="text-[9px] text-text-ghost flex-1">Next Scan</span>
            <span className="text-[9px] text-text-secondary font-mono shrink-0">
              in {pmoFull.nextScanIn}
            </span>
          </div>
        )}

        {/* Control buttons */}
        <div className="flex items-center gap-1.5 px-1 pt-0.5">
          <button
            onClick={() => void handlePmoToggle()}
            disabled={!!pmoAction}
            className={cn(
              "flex items-center gap-1 px-2 py-1 text-[9px] font-medium rounded transition-all",
              pmoAction
                ? "bg-bg-input text-text-ghost cursor-not-allowed"
                : pmoFull?.loaded
                  ? "bg-error/15 text-error hover:bg-error/25"
                  : "bg-sessions/15 text-sessions hover:bg-sessions/25",
            )}
          >
            <ChevronRightIcon size={10} />
            {pmoAction ?? (pmoFull?.loaded ? "Pause" : "Start")}
          </button>

          <button
            onClick={() => void handlePmoScan()}
            disabled={scanning}
            className={cn(
              "flex items-center gap-1 px-2 py-1 text-[9px] font-medium rounded transition-all",
              scanning
                ? "bg-bg-input text-text-ghost cursor-not-allowed"
                : "bg-rooms/15 text-rooms hover:bg-rooms/25",
            )}
          >
            <ChevronRightIcon size={10} className={cn(scanning && "animate-spin")} />
            {scanning ? "Scanning..." : "Scan Now"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Inline sprints-style icon at small size */
function SprintsIconInline() {
  return (
    <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" className="text-text-ghost">
      <circle cx="8" cy="8" r="6" />
      <polyline points="5.5 8 7.2 9.8 10.5 6.2" />
    </svg>
  );
}

function StatRow({
  icon,
  label,
  value,
  valueColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="flex items-center gap-2 px-1 py-0.5">
      <span className="shrink-0">{icon}</span>
      <span className="text-[9px] text-text-ghost flex-1">{label}</span>
      <span
        className={cn(
          "text-[9px] font-mono shrink-0 max-w-[120px] truncate",
          valueColor ?? "text-text-secondary",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function formatScanTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  } catch {
    return iso;
  }
}
