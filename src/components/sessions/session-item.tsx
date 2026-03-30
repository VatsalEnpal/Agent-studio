"use client";

import { useState, useCallback, useEffect } from "react";
import { X, Clock, Loader2 } from "lucide-react";
import { cn, statusDotColor } from "@/lib/utils";
import { useSessionUsage } from "@/hooks/use-usage";
import type { Session } from "@/lib/types";

interface SessionItemProps {
  session: Session;
  focused: boolean;
  visible: boolean;
  onFocus: () => void;
  onKill: () => void;
}

function formatUptime(createdAt: number): string {
  const diffMs = Date.now() - createdAt;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "< 1m";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  const remainMin = diffMin % 60;
  if (diffHr < 24) return `${diffHr}h ${remainMin}m`;
  const days = Math.floor(diffHr / 24);
  return `${days}d ${diffHr % 24}h`;
}

export function SessionItem({
  session,
  focused,
  visible,
  onFocus,
  onKill,
}: SessionItemProps) {
  const [killing, setKilling] = useState(false);

  const handleKill = useCallback(async () => {
    if (killing) return;
    setKilling(true);
    try {
      await onKill();
    } finally {
      // Keep killing state — session will disappear from list via WS update
      setTimeout(() => setKilling(false), 3000);
    }
  }, [killing, onKill]);

  const isExited = session.status === "exited";
  const isRunning = session.status === "active" || session.status === "building" || session.status === "starting";

  // Auto-remove exited sessions after 10 seconds
  useEffect(() => {
    if (!isExited) return;
    const timer = setTimeout(() => {
      onKill();
    }, 10_000);
    return () => clearTimeout(timer);
  }, [isExited, onKill]);

  // Real usage data from Claude session files
  const usage = useSessionUsage(session.id);
  const effectiveModel = usage.modelShort ?? session.meta?.model ?? null;
  const contextPercent = usage.contextPercent ?? 0;
  const hasContext = contextPercent > 0 && !usage.loading;

  return (
    <div
      onClick={onFocus}
      title={`${session.name}\nPath: ${session.cwd}\nID: ${session.id}\nModel: ${effectiveModel ?? "unknown"}\nStatus: ${session.status}${hasContext ? `\nContext: ${contextPercent}%` : ""}`}
      className={cn(
        "sidebar-item flex flex-col gap-0.5 px-2 py-2 rounded-md cursor-pointer group",
        focused
          ? "bg-console-faint text-console-text border-l-2 border-l-console-accent"
          : "text-console-muted hover:bg-console-faint/40 hover:text-console-text border-l-2 border-l-transparent",
        !visible && "opacity-60",
      )}
    >
      {/* Row 1: status dot + name + model + kill */}
      <div className="flex items-center gap-2">
        <span
          className={cn("w-2 h-2 rounded-full shrink-0", statusDotColor(session.status))}
        />
        <span className="text-xs font-medium truncate flex-1">{session.name}</span>
        {effectiveModel && effectiveModel !== "unknown" && (
          <span
            className={cn(
              "text-[9px] px-1 py-0.5 rounded shrink-0 font-medium",
              effectiveModel === "opus"
                ? "bg-purple-500/20 text-purple-400"
                : effectiveModel === "haiku"
                  ? "bg-teal-500/20 text-teal-400"
                  : "bg-console-border text-console-dim",
            )}
          >
            {effectiveModel}
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            void handleKill();
          }}
          disabled={killing}
          className={cn(
            "p-0.5 transition-all shrink-0 rounded",
            killing
              ? "text-console-error opacity-70 cursor-not-allowed"
              : "text-console-dim hover:text-console-error hover:bg-console-error/10 active:bg-console-error/20",
            !killing && (focused ? "opacity-70 hover:opacity-100" : "opacity-0 group-hover:opacity-100"),
          )}
          title={killing ? "Killing..." : "Kill session"}
        >
          {killing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Row 2: uptime + cwd + cost */}
      <div className="flex items-center gap-2 pl-4">
        {isRunning && (
          <span className="flex items-center gap-0.5 text-[8px] text-console-dim">
            <Clock className="w-2.5 h-2.5" />
            {formatUptime(session.createdAt)}
          </span>
        )}
        {session.cwd && (
          <span className="text-[8px] text-console-dim truncate flex-1 min-w-0">
            {shortenCwd(session.cwd)}
          </span>
        )}
        {hasContext && (
          <span className="flex items-center gap-1 shrink-0">
            <span className="text-[8px] text-console-dim">
              {contextPercent}%
            </span>
            <span className="w-10 h-1 rounded-full bg-console-border overflow-hidden">
              <span
                className={cn(
                  "h-full rounded-full block transition-all",
                  contextPercent >= 90 ? "bg-red-400" : contextPercent >= 70 ? "bg-yellow-400" : "bg-emerald-400",
                )}
                style={{ width: `${Math.min(100, contextPercent)}%` }}
              />
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

/** Shorten cwd for display — strips common home prefixes */
function shortenCwd(cwd: string): string {
  // Match /Users/<username> or /home/<username> patterns
  const homeMatch = cwd.match(/^\/(?:Users|home)\/[^/]+/);
  if (homeMatch) return "~" + cwd.slice(homeMatch[0].length);
  return cwd;
}
