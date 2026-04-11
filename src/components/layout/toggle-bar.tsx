"use client";

import { useState, useEffect } from "react";
import {
  Monitor,
  Users,
  Brain,
  Settings,
  Maximize,
  Minimize,
  Cpu,
  MemoryStick,
  Gauge,
  ExternalLink,
  DollarSign,
} from "lucide-react";
import { useUIStore } from "@/stores/ui";
import { cn } from "@/lib/utils";
import type { ActiveMode } from "@/lib/types";
import { useUsage, formatCostDisplay } from "@/hooks/use-usage";
import { HelpPanel } from "./help-panel";

interface TabConfig {
  id: ActiveMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}

const ALL_TABS: TabConfig[] = [
  { id: "sessions", label: "Sessions", icon: Monitor },
  { id: "teams", label: "Teams", icon: Users },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "settings", label: "Settings", icon: Settings },
];

/**
 * Anthropic peak hours: 5am-11am PT (Pacific Time).
 * PT is America/Los_Angeles. We compute the current PT hour and show
 * the peak window in the user's local timezone so it's self-explanatory.
 */
function getPeakInfo(): {
  isPeak: boolean;
  localStart: string;
  localEnd: string;
} {
  const now = new Date();

  // Get current PT hour
  const ptFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    hour12: false,
  });
  const ptHour = parseInt(ptFormatter.format(now), 10);
  const isPeak = ptHour >= 5 && ptHour < 11;

  // Convert peak start/end (5:00 PT and 11:00 PT) to user's local time
  // Create dates for today's peak window in PT
  const todayPT = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now); // YYYY-MM-DD

  const peakStartUTC = new Date(`${todayPT}T05:00:00`);
  const peakEndUTC = new Date(`${todayPT}T11:00:00`);

  // Adjust from PT to UTC: find PT offset dynamically
  const ptOffsetMs =
    peakStartUTC.getTime() -
    new Date(
      peakStartUTC.toLocaleString("en-US", {
        timeZone: "America/Los_Angeles",
      }),
    ).getTime();
  const startLocal = new Date(peakStartUTC.getTime() - ptOffsetMs);
  const endLocal = new Date(peakEndUTC.getTime() - ptOffsetMs);

  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

  return { isPeak, localStart: fmt(startLocal), localEnd: fmt(endLocal) };
}

function PeakHoursIndicator() {
  const [info, setInfo] = useState({
    isPeak: false,
    localStart: "",
    localEnd: "",
  });

  useEffect(() => {
    const update = () => setInfo(getPeakInfo());
    update();
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, []);

  if (!info.localStart) return null;

  return (
    <div className="relative group">
      <div
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition-colors cursor-default",
          info.isPeak
            ? "bg-red-500/10 text-red-400 border border-red-500/20"
            : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
        )}
      >
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            info.isPeak ? "bg-red-400 animate-pulse" : "bg-emerald-400",
          )}
        />
        {info.isPeak ? "API: Peak" : "API: Off-Peak"}
      </div>

      {/* Tooltip */}
      <div className="absolute right-0 top-full mt-1.5 w-60 p-2.5 rounded-lg border border-console-border bg-console-panel shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
        <p className="text-[10px] text-console-text font-medium mb-1.5">
          {info.isPeak
            ? "Peak Hours — Slower Responses"
            : "Off-Peak — Normal Speed"}
        </p>
        <p className="text-[9px] text-console-muted leading-relaxed mb-2">
          Anthropic API rate limits are stricter during peak hours (5am-11am
          Pacific). Expect slower responses and more throttling during peak.
        </p>
        <div className="flex items-center justify-between text-[9px] mt-0.5">
          <span className="text-console-dim">Peak window (your time)</span>
          <span className="text-console-text font-mono">
            {info.localStart}-{info.localEnd}
          </span>
        </div>
      </div>
    </div>
  );
}

function SystemWidget() {
  const [stats, setStats] = useState<{
    cpu: number;
    memUsed: number;
    memTotal: number;
  } | null>(null);
  const setActiveMode = useUIStore((s) => s.setActiveMode);

  useEffect(() => {
    const fetchStats = () => {
      fetch("/api/system/stats")
        .then((r) => r.json())
        .then(
          (data: {
            cpu: { usage: number };
            memory: { used: number; total: number };
          }) => {
            setStats({
              cpu: data.cpu.usage,
              memUsed: data.memory.used,
              memTotal: data.memory.total,
            });
          },
        )
        .catch(() => {
          /* ignore */
        });
    };
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!stats) return null;

  return (
    <div className="relative group">
      <button
        onClick={() => setActiveMode("settings")}
        className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono text-console-dim hover:text-console-muted border border-console-border/50 hover:border-console-border transition-colors"
        title="System monitor — click for details"
      >
        <Cpu className="w-3 h-3" />
        <span>{stats.cpu.toFixed(0)}%</span>
        <span className="text-console-border">|</span>
        <MemoryStick className="w-3 h-3" />
        <span>
          {stats.memUsed.toFixed(1)}/{stats.memTotal.toFixed(0)}GB
        </span>
      </button>
    </div>
  );
}

function FullscreenButton() {
  const [isFs, setIsFs] = useState(false);

  useEffect(() => {
    const handler = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);

    // Cmd+Shift+F: fullscreen support
    const keyHandler = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "f"
      ) {
        e.preventDefault();
        if (document.fullscreenElement) {
          void document.exitFullscreen();
        } else {
          void document.documentElement.requestFullscreen();
        }
      }
    };
    document.addEventListener("keydown", keyHandler);

    return () => {
      document.removeEventListener("fullscreenchange", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, []);

  return (
    <button
      onClick={() => {
        if (document.fullscreenElement) {
          void document.exitFullscreen();
        } else {
          void document.documentElement.requestFullscreen();
        }
      }}
      className="p-1 text-console-dim hover:text-console-muted transition-colors rounded hover:bg-console-faint/50"
      title={
        isFs ? "Exit fullscreen (Cmd+Shift+F)" : "Fullscreen (Cmd+Shift+F)"
      }
    >
      {isFs ? (
        <Minimize className="w-3.5 h-3.5" />
      ) : (
        <Maximize className="w-3.5 h-3.5" />
      )}
    </button>
  );
}

// Theme toggle removed — IDENTITY.md: "The darkness isn't a CSS variable — it's the identity."
// The app is dark-only by design.

function TotalCostWidget() {
  const { all } = useUsage();
  const totalCost = all.reduce((sum, s) => sum + (s.totalCost ?? 0), 0);

  return (
    <div
      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono text-console-dim border border-console-border/50 cursor-default"
      title="Total cost across all active sessions today"
    >
      <DollarSign className="w-3 h-3" />
      <span>{formatCostDisplay(totalCost)}</span>
    </div>
  );
}

export function ToggleBar() {
  const activeMode = useUIStore((s) => s.activeMode);
  const setActiveMode = useUIStore((s) => s.setActiveMode);
  const [hasAgentSystem, setHasAgentSystem] = useState(true); // default true so tabs don't flash

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/config");
        if (res.ok) {
          const data = (await res.json()) as {
            config: { agentSystem?: unknown };
          };
          setHasAgentSystem(!!data.config?.agentSystem);
        }
      } catch {
        /* default to showing all tabs */
      }
    })();
  }, []);

  const tabs = hasAgentSystem
    ? ALL_TABS
    : ALL_TABS.filter((t) => t.id !== "teams" && t.id !== "memory");

  return (
    <header className="flex items-center justify-between px-4 h-10 border-b border-console-border console-panel-bg shrink-0">
      {/* Left: tabs */}
      <div className="flex items-center gap-0.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeMode === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => !tab.disabled && setActiveMode(tab.id)}
              disabled={tab.disabled}
              title={tab.disabled ? "Coming soon" : undefined}
              className={cn(
                "relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                isActive
                  ? "text-console-text"
                  : tab.disabled
                    ? "text-console-dim cursor-not-allowed opacity-40"
                    : "text-console-muted hover:text-console-text hover:bg-console-faint/50 active:bg-console-faint active:scale-95",
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {isActive && (
                <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-console-accent rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* Right: system + fullscreen + peak indicator + help + branding */}
      <div className="flex items-center gap-2">
        <TotalCostWidget />
        <SystemWidget />
        <a
          href="https://claude.ai/settings/usage"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-console-dim hover:text-console-muted transition-colors flex items-center gap-1"
          title="Check your usage limits on claude.ai"
        >
          <Gauge className="w-3 h-3" />
          <span>Limits</span>
          <ExternalLink className="w-2.5 h-2.5" />
        </a>
        <FullscreenButton />
        <PeakHoursIndicator />
        <HelpPanel />
        <span className="text-[10px] text-console-dim font-mono">
          agent-studio
        </span>
      </div>
    </header>
  );
}
