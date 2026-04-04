"use client";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Title Bar — Mac-native style with traffic light dots
// ---------------------------------------------------------------------------

interface TitleBarProps {
  /** Name of the focused session, shown after "Agent Studio" */
  sessionName?: string;
  /** Number of active sessions */
  sessionCount?: number;
}

export function TitleBar({ sessionName, sessionCount }: TitleBarProps = {}) {
  return (
    <header
      className={cn(
        "relative flex items-center justify-center shrink-0",
        "h-[38px] px-4",
        "bg-bg-base border-b border-border-default",
        "z-topBar select-none",
      )}
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* Traffic light dots */}
      <div
        className="absolute left-4 flex items-center gap-[7px]"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <span
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: "#ff5f57" }}
          aria-label="Close"
        />
        <span
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: "#febc2e" }}
          aria-label="Minimize"
        />
        <span
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: "#28c840" }}
          aria-label="Maximize"
        />
      </div>

      {/* Centered title */}
      <span
        className="text-text-ghost font-medium flex items-center gap-1.5"
        style={{ fontSize: "12px", letterSpacing: "-0.2px" }}
      >
        Agent Studio
        {sessionName && (
          <>
            <span className="text-text-ghost/40">&middot;</span>
            <span className="text-text-tertiary truncate max-w-[200px]">{sessionName}</span>
          </>
        )}
        {!sessionName && sessionCount != null && sessionCount > 0 && (
          <>
            <span className="text-text-ghost/40">&middot;</span>
            <span className="text-text-tertiary">{sessionCount} session{sessionCount !== 1 ? "s" : ""}</span>
          </>
        )}
      </span>
    </header>
  );
}

// Keep TopBar export as alias for backward compat during migration
export { TitleBar as TopBar };
