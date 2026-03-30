"use client";

import { useState, useEffect } from "react";
import {
  Monitor,
  Users,
  Brain,
  FileText,
  Settings,
  Maximize,
  Minimize,
  Cpu,
  MemoryStick,
} from "lucide-react";
import { useUIStore } from "@/stores/ui";
import { cn } from "@/lib/utils";
import type { ActiveMode } from "@/lib/types";
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
  { id: "reports", label: "Reports", icon: FileText },
  { id: "settings", label: "Settings", icon: Settings },
];

/**
 * Peak hours: 5am-11am PT = 14:00-20:00 CEST (summer) / 13:00-19:00 CET (winter).
 * We compute in Berlin time to show Berlin-relevant info only.
 */
function getBerlinPeakInfo(): { isPeak: boolean; berlinTime: string; peakStart: string; peakEnd: string } {
  const now = new Date();

  // Get Berlin hour
  const berlinFormatter = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const berlinTime = berlinFormatter.format(now);

  // Determine UTC offset for Berlin to derive peak window
  // Berlin is UTC+1 (CET) or UTC+2 (CEST)
  // Peak in PT: 5:00-11:00 (PT is UTC-7 summer, UTC-8 winter)
  // So peak in UTC: 12:00-18:00 (summer) or 13:00-19:00 (winter)
  // In Berlin: 14:00-20:00 (CEST) or 14:00-20:00 (CET)
  // Actually: PT+9h = Berlin in summer (PDT+9=CEST), PT+9h in winter (PST+9=CET)
  // 5 PT + 9 = 14 Berlin, 11 PT + 9 = 20 Berlin (both seasons)
  const peakStart = "14:00";
  const peakEnd = "20:00";

  // Parse Berlin hour for comparison
  const berlinParts = berlinTime.split(":");
  const berlinHour = parseInt(berlinParts[0], 10);
  const isPeak = berlinHour >= 14 && berlinHour < 20;

  return { isPeak, berlinTime, peakStart, peakEnd };
}

function PeakHoursIndicator() {
  const [info, setInfo] = useState({ isPeak: false, berlinTime: "", peakStart: "14:00", peakEnd: "20:00" });

  useEffect(() => {
    const update = () => setInfo(getBerlinPeakInfo());
    update();
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, []);

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
        {info.isPeak
          ? `Peak until ${info.peakEnd}`
          : `Off-Peak \u00b7 Peak starts at ${info.peakStart}`}
      </div>

      {/* Tooltip */}
      <div className="absolute right-0 top-full mt-1.5 w-56 p-2.5 rounded-lg border border-console-border bg-console-panel shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
        <p className="text-[10px] text-console-text font-medium mb-1.5">
          {info.isPeak ? "Peak Hours Active" : "Off-Peak Hours"}
        </p>
        <p className="text-[9px] text-console-muted leading-relaxed mb-2">
          Anthropic throttles during peak (14:00-20:00 Berlin). Expect slower responses.
        </p>
        <div className="flex items-center justify-between text-[9px]">
          <span className="text-console-dim">Berlin time</span>
          <span className="text-console-text font-mono">{info.berlinTime}</span>
        </div>
        <div className="flex items-center justify-between text-[9px] mt-0.5">
          <span className="text-console-dim">Peak window</span>
          <span className="text-console-text font-mono">{info.peakStart}-{info.peakEnd}</span>
        </div>
      </div>
    </div>
  );
}

function SystemWidget() {
  const [stats, setStats] = useState<{ cpu: number; memUsed: number; memTotal: number } | null>(null);
  const setActiveMode = useUIStore((s) => s.setActiveMode);

  useEffect(() => {
    const fetchStats = () => {
      fetch("/api/system/stats")
        .then((r) => r.json())
        .then((data: { cpu: { usage: number }; memory: { used: number; total: number } }) => {
          setStats({ cpu: data.cpu.usage, memUsed: data.memory.used, memTotal: data.memory.total });
        })
        .catch(() => { /* ignore */ });
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
        <span>{stats.memUsed.toFixed(1)}/{stats.memTotal.toFixed(0)}GB</span>
      </button>
    </div>
  );
}

function FullscreenButton() {
  const [isFs, setIsFs] = useState(false);

  useEffect(() => {
    const handler = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);

    // F11 key support
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "F11") {
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
      title={isFs ? "Exit fullscreen (F11)" : "Fullscreen (F11)"}
    >
      {isFs ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
    </button>
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
          const data = await res.json() as { config: { agentSystem?: unknown } };
          setHasAgentSystem(!!data.config?.agentSystem);
        }
      } catch { /* default to showing all tabs */ }
    })();
  }, []);

  const tabs = hasAgentSystem
    ? ALL_TABS
    : ALL_TABS.filter((t) => t.id !== "teams" && t.id !== "memory");

  return (
    <header className="flex items-center justify-between px-4 h-10 border-b border-console-border bg-console-panel shrink-0">
      {/* Left: tabs */}
      <div className="flex items-center gap-1">
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
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-all",
                isActive
                  ? "bg-console-faint text-console-text"
                  : tab.disabled
                    ? "text-console-dim cursor-not-allowed opacity-40"
                    : "text-console-muted hover:text-console-text hover:bg-console-faint/50 active:bg-console-faint active:scale-95",
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Right: system + fullscreen + peak indicator + help + branding */}
      <div className="flex items-center gap-2">
        <SystemWidget />
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
