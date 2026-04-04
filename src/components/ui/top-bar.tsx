"use client";

import { Bell, Moon, Sun, Cpu, Memory } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SprintInfo {
  name: string;
  gate: number;
}

interface SystemStats {
  cpuPercent: number;
  ramPercent: number;
}

interface TopBarProps {
  /** Page title shown on the left */
  title: string;
  /** Number of active sessions */
  activeSessionCount?: number;
  /** Sprint info — shown as a pill when provided */
  sprint?: SprintInfo | null;
  /** System resource usage */
  system?: SystemStats | null;
  /** Unread notification count */
  notificationCount?: number;
  /** Current theme */
  theme?: "dark" | "light";
  /** Theme toggle callback */
  onToggleTheme?: () => void;
  /** Notification bell click */
  onNotificationClick?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TopBar({
  title,
  activeSessionCount = 0,
  sprint,
  system,
  notificationCount = 0,
  theme = "dark",
  onToggleTheme,
  onNotificationClick,
}: TopBarProps) {
  return (
    <header
      className={cn(
        "flex items-center justify-between",
        "h-12 px-5 shrink-0",
        "bg-canvas border-b border-border-subtle",
        "z-topBar",
      )}
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* Left — page title */}
      <h1 className="text-display text-text-emphasis truncate">
        {title}
      </h1>

      {/* Right — status items (no-drag so buttons work) */}
      <div className="flex items-center gap-3" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        {/* Active sessions */}
        {activeSessionCount > 0 && (
          <span className="text-label-xs text-text-secondary">
            {activeSessionCount} active
          </span>
        )}

        {/* Sprint pill */}
        {sprint && (
          <span
            className={cn(
              "inline-flex items-center gap-1.5",
              "px-2 py-0.5 rounded-full",
              "text-label-xs text-accent",
              "bg-accent-subtle border border-accent/10",
            )}
          >
            <span className="size-1.5 rounded-full bg-accent animate-pulse-dot" />
            Sprint: {sprint.name} &middot; Gate {sprint.gate}
          </span>
        )}

        {/* System stats */}
        {system && (
          <div className="flex items-center gap-2 text-label-xs text-text-tertiary">
            <span className="inline-flex items-center gap-1">
              <Cpu size={14} weight="light" />
              {system.cpuPercent}%
            </span>
            <span className="inline-flex items-center gap-1">
              <Memory size={14} weight="light" />
              {system.ramPercent}%
            </span>
          </div>
        )}

        {/* Notification bell */}
        <button
          onClick={onNotificationClick}
          className={cn(
            "relative flex items-center justify-center",
            "size-7 rounded-md",
            "text-text-secondary hover:text-text-primary hover:bg-surface-hover",
            "transition-colors duration-[var(--duration-quick)] ease-out",
          )}
          aria-label={`Notifications${notificationCount > 0 ? ` (${notificationCount})` : ""}`}
        >
          <Bell size={16} weight="light" />
          {notificationCount > 0 && (
            <span
              className={cn(
                "absolute -top-0.5 -right-0.5",
                "flex items-center justify-center",
                "min-w-[14px] h-3.5 px-1 rounded-full",
                "bg-error text-label-xs font-medium text-white leading-none",
              )}
            >
              {notificationCount > 99 ? "99+" : notificationCount}
            </span>
          )}
        </button>

        {/* Theme toggle */}
        <button
          onClick={onToggleTheme}
          className={cn(
            "flex items-center justify-center",
            "size-7 rounded-md",
            "text-text-secondary hover:text-text-primary hover:bg-surface-hover",
            "transition-colors duration-[var(--duration-quick)] ease-out",
          )}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? (
            <Sun size={16} weight="light" />
          ) : (
            <Moon size={16} weight="light" />
          )}
        </button>
      </div>
    </header>
  );
}
