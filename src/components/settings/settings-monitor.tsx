"use client";

import { Cpu, HardDrive, Memory, Desktop, Terminal, Clock } from "@phosphor-icons/react";
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
    <div className="h-1.5 bg-console-bg rounded-full overflow-hidden">
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
      <section className="border border-console-border rounded-lg bg-console-panel">
        <div className="px-4 py-3 border-b border-console-border">
          <h3 className="text-body-sm font-medium text-console-text">System Monitor</h3>
        </div>
        <div className="px-4 py-6 text-center text-console-dim text-xs animate-pulse">
          Loading system stats...
        </div>
      </section>
    );
  }

  if (!stats) return null;

  return (
    <section className="border border-console-border rounded-lg bg-console-panel">
      <div className="px-4 py-3 border-b border-console-border flex items-center justify-between">
        <h3 className="text-xs font-medium text-console-text">System Monitor</h3>
        <span className="text-label-xs text-console-dim">Updates every 5s</span>
      </div>
      <div className="px-4 py-3 grid grid-cols-2 gap-3">
        {/* CPU */}
        <div className="bg-console-bg rounded-md px-3 py-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-label-xs text-console-dim flex items-center gap-1">
              <Cpu className="w-3 h-3" />
              CPU
            </span>
            <span className={cn(
              "text-body-sm font-mono font-medium",
              stats.cpu.usage > 80 ? "text-console-error" : stats.cpu.usage > 50 ? "text-console-accent" : "text-console-success",
            )}>
              {stats.cpu.usage.toFixed(1)}%
            </span>
          </div>
          <UsageBar
            percentage={stats.cpu.usage}
            color={stats.cpu.usage > 80 ? "bg-console-error" : stats.cpu.usage > 50 ? "bg-console-accent" : "bg-console-success"}
          />
          <span className="text-label-xs text-console-dim">{stats.cpu.cores} cores</span>
        </div>

        {/* Memory */}
        <div className="bg-console-bg rounded-md px-3 py-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-label-xs text-console-dim flex items-center gap-1">
              <Memory className="w-3 h-3" />
              Memory
            </span>
            <span className={cn(
              "text-body-sm font-mono font-medium",
              stats.memory.percentage > 80 ? "text-console-error" : stats.memory.percentage > 60 ? "text-console-accent" : "text-console-success",
            )}>
              {stats.memory.percentage.toFixed(0)}%
            </span>
          </div>
          <UsageBar
            percentage={stats.memory.percentage}
            color={stats.memory.percentage > 80 ? "bg-console-error" : stats.memory.percentage > 60 ? "bg-console-accent" : "bg-console-success"}
          />
          <span className="text-label-xs text-console-dim">
            {formatBytes(stats.memory.used)} / {formatBytes(stats.memory.total)}
          </span>
        </div>

        {/* Disk */}
        <div className="bg-console-bg rounded-md px-3 py-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-label-xs text-console-dim flex items-center gap-1">
              <HardDrive className="w-3 h-3" />
              Disk
            </span>
            <span className={cn(
              "text-body-sm font-mono font-medium",
              stats.disk.percentage > 90 ? "text-console-error" : stats.disk.percentage > 70 ? "text-console-accent" : "text-console-text",
            )}>
              {stats.disk.percentage.toFixed(0)}%
            </span>
          </div>
          <UsageBar
            percentage={stats.disk.percentage}
            color={stats.disk.percentage > 90 ? "bg-console-error" : stats.disk.percentage > 70 ? "bg-console-accent" : "bg-console-faint"}
          />
          <span className="text-label-xs text-console-dim">
            {formatBytes(stats.disk.used)} / {formatBytes(stats.disk.total)}
          </span>
        </div>

        {/* Active Counts */}
        <div className="bg-console-bg rounded-md px-3 py-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-label-xs text-console-dim flex items-center gap-1">
              <Desktop className="w-3 h-3" />
              Active Servers
            </span>
            <span className="text-[11px] font-mono font-medium text-console-text">
              {stats.activeServers}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-label-xs text-console-dim flex items-center gap-1">
              <Terminal className="w-3 h-3" />
              Claude Sessions
            </span>
            <span className="text-[11px] font-mono font-medium text-console-text">
              {stats.activeSessions}
            </span>
          </div>
        </div>

        {/* Uptime & WS */}
        <div className="bg-console-bg rounded-md px-3 py-2.5 col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-label-xs text-console-dim flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Uptime: <span className="text-console-text font-mono">{formatUptime(stats.uptime)}</span>
              </span>
              <span className="text-label-xs text-console-dim">
                WebSocket: <span className="text-console-success font-mono">{stats.wsConnections} connected</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
