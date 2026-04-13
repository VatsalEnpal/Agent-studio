"use client";

import {
  CpuIcon,
  DiskIcon,
  MemoryChipIcon,
  MonitorIcon,
  SessionsIcon,
  ClockIcon,
} from "@/components/ui/icons";
import { useSettingsStore } from "@/stores/settings";
import { cn } from "@/lib/utils";

function formatBytes(gb: number): string {
  if (gb < 1) return `${(gb * 1024).toFixed(0)} MB`;
  return `${gb.toFixed(1)} GB`;
}

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function UsageBar({ percentage, color }: { percentage: number; color: string }) {
  return (
    <div className="h-1.5 bg-bg-base rounded-full overflow-hidden">
      <div
        className={cn("h-full rounded-full transition-all duration-500", color)}
        style={{ width: `${Math.min(percentage, 100)}%` }}
      />
    </div>
  );
}

export function SettingsMonitor() {
  const stats = useSettingsStore((s) => s.systemStats);
  const loading = useSettingsStore((s) => s.statsLoading);

  if (loading && !stats) {
    return (
      <section className="border border-border-default rounded bg-bg-surface">
        <div className="px-4 py-3 border-b border-border-default">
          <h3 className="text-body font-medium text-text-primary">System Monitor</h3>
        </div>
        <div className="px-4 py-6 text-center text-text-tertiary text-xs animate-pulse">
          Loading system stats...
        </div>
      </section>
    );
  }

  if (!stats) return null;

  return (
    <section className="border border-border-default rounded bg-bg-surface">
      <div className="px-4 py-3 border-b border-border-default flex items-center justify-between">
        <div>
          <h3 className="text-xs font-medium text-text-primary">System Monitor</h3>
          <p className="text-2xs text-text-tertiary mt-0.5">System resources and health</p>
        </div>
        <span className="text-label text-text-tertiary">Updates every 5s</span>
      </div>
      <div className="px-4 py-3 grid grid-cols-2 gap-3">
        {/* CPU */}
        <div className="bg-bg-base rounded px-3 py-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-label text-text-tertiary flex items-center gap-1">
              <CpuIcon className="w-3 h-3" />
              CPU
            </span>
            <span
              className={cn(
                "text-body font-mono font-medium",
                stats.cpu.usage > 80
                  ? "text-error"
                  : stats.cpu.usage > 50
                    ? "text-rooms"
                    : "text-sessions",
              )}
            >
              {stats.cpu.usage.toFixed(1)}%
            </span>
          </div>
          <UsageBar
            percentage={stats.cpu.usage}
            color={
              stats.cpu.usage > 80 ? "bg-error" : stats.cpu.usage > 50 ? "bg-rooms" : "bg-sessions"
            }
          />
          <span className="text-label text-text-tertiary">{stats.cpu.cores} cores</span>
        </div>

        {/* Memory */}
        <div className="bg-bg-base rounded px-3 py-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-label text-text-tertiary flex items-center gap-1">
              <MemoryChipIcon className="w-3 h-3" />
              Memory
            </span>
            <span
              className={cn(
                "text-body font-mono font-medium",
                stats.memory.percentage > 80
                  ? "text-error"
                  : stats.memory.percentage > 60
                    ? "text-rooms"
                    : "text-sessions",
              )}
            >
              {stats.memory.percentage.toFixed(0)}%
            </span>
          </div>
          <UsageBar
            percentage={stats.memory.percentage}
            color={
              stats.memory.percentage > 80
                ? "bg-error"
                : stats.memory.percentage > 60
                  ? "bg-rooms"
                  : "bg-sessions"
            }
          />
          <span className="text-label text-text-tertiary">
            {formatBytes(stats.memory.used)} / {formatBytes(stats.memory.total)}
          </span>
        </div>

        {/* Disk */}
        <div className="bg-bg-base rounded px-3 py-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-label text-text-tertiary flex items-center gap-1">
              <DiskIcon className="w-3 h-3" />
              Disk
            </span>
            <span
              className={cn(
                "text-body font-mono font-medium",
                stats.disk.percentage > 90
                  ? "text-error"
                  : stats.disk.percentage > 70
                    ? "text-rooms"
                    : "text-text-primary",
              )}
            >
              {stats.disk.percentage.toFixed(0)}%
            </span>
          </div>
          <UsageBar
            percentage={stats.disk.percentage}
            color={
              stats.disk.percentage > 90
                ? "bg-error"
                : stats.disk.percentage > 70
                  ? "bg-rooms"
                  : "bg-bg-elevated"
            }
          />
          <span className="text-label text-text-tertiary">
            {formatBytes(stats.disk.used)} / {formatBytes(stats.disk.total)}
          </span>
        </div>

        {/* Active Counts */}
        <div className="bg-bg-base rounded px-3 py-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-label text-text-tertiary flex items-center gap-1">
              <MonitorIcon className="w-3 h-3" />
              Active Servers
            </span>
            <span className="text-xs font-mono font-medium text-text-primary">
              {stats.activeServers}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-label text-text-tertiary flex items-center gap-1">
              <SessionsIcon className="w-3 h-3" />
              Claude Sessions
            </span>
            <span className="text-xs font-mono font-medium text-text-primary">
              {stats.activeSessions}
            </span>
          </div>
        </div>

        {/* Uptime & WS */}
        <div className="bg-bg-base rounded px-3 py-2.5 col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-label text-text-tertiary flex items-center gap-1">
                <ClockIcon className="w-3 h-3" />
                Uptime:{" "}
                <span className="text-text-primary font-mono">{formatUptime(stats.uptime)}</span>
              </span>
              <span className="text-label text-text-tertiary">
                WebSocket:{" "}
                <span className="text-sessions font-mono">{stats.wsConnections} connected</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
