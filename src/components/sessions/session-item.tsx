"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { X, Clock, Loader2, Pencil } from "lucide-react";
import { cn, statusDotColor } from "@/lib/utils";
import { useSessionUsage, formatCostDisplay } from "@/hooks/use-usage";
import type { Session } from "@/lib/types";

// Local storage map for user-renamed sessions
const RENAME_KEY = "agent-studio-session-names";

function getCustomNames(): Record<string, string> {
  try {
    const raw = localStorage.getItem(RENAME_KEY);
    if (raw) return JSON.parse(raw) as Record<string, string>;
  } catch {
    /* ignore */
  }
  return {};
}

function setCustomName(sessionId: string, name: string): void {
  const names = getCustomNames();
  names[sessionId] = name;
  try {
    localStorage.setItem(RENAME_KEY, JSON.stringify(names));
  } catch {
    /* ignore */
  }
}

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
  const isRunning =
    session.status === "active" ||
    session.status === "building" ||
    session.status === "starting";

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

  // Display name: custom rename > auto-detected from first message > session.name
  const [customName, setCustomNameState] = useState<string | null>(() => {
    return getCustomNames()[session.id] ?? null;
  });
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Display name priority: custom rename > session.name (from creation)
  // usage.displayName (auto-detected from JSONL) is unreliable for active sessions
  // because PIDs can be reused and resumed sessions create new IDs
  const displayName = customName || session.name;

  const startEditing = useCallback(() => {
    setEditValue(displayName);
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.select());
  }, [displayName]);

  const commitRename = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== session.name) {
      setCustomName(session.id, trimmed);
      setCustomNameState(trimmed);
    } else if (!trimmed) {
      // Clear custom name — revert to auto-detected or default
      const names = getCustomNames();
      delete names[session.id];
      try {
        localStorage.setItem(RENAME_KEY, JSON.stringify(names));
      } catch {
        /* ignore */
      }
      setCustomNameState(null);
    }
    setEditing(false);
  }, [editValue, session.id, session.name]);

  return (
    <div
      onClick={onFocus}
      title={`${displayName}${usage.displayName && usage.displayName !== displayName ? `\nTask: ${usage.displayName}` : ""}\nPath: ${session.cwd}\nID: ${session.id}\nModel: ${effectiveModel ?? "unknown"}\nStatus: ${session.status}${hasContext ? `\nContext: ${contextPercent}%` : ""}`}
      className={cn(
        "flex flex-col gap-0.5 px-2 py-1.5 rounded cursor-pointer group sidebar-item border-l-2",
        focused
          ? "bg-console-faint text-console-text border-l-console-accent"
          : "text-console-muted hover:bg-console-faint/50 hover:text-console-text border-l-transparent",
        !visible && "opacity-60",
      )}
    >
      {/* Row 1: status dot + name + model + kill */}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "w-2 h-2 rounded-full shrink-0",
            statusDotColor(session.status),
          )}
        />
        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setEditing(false);
            }}
            onClick={(e) => e.stopPropagation()}
            className="text-xs font-medium truncate flex-1 bg-console-bg border border-console-accent/50 rounded px-1 py-0 text-console-text focus:outline-none focus:border-console-accent"
            autoFocus
          />
        ) : (
          <>
            <span className="text-xs font-medium truncate flex-1">
              {displayName}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                startEditing();
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-white/10 shrink-0"
              title="Rename session"
            >
              <Pencil className="w-3 h-3 text-console-dim" />
            </button>
          </>
        )}
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
            !killing &&
              (focused
                ? "opacity-70 hover:opacity-100"
                : "opacity-0 group-hover:opacity-100"),
          )}
          title={killing ? "Killing..." : "Kill session"}
        >
          {killing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <X className="w-3.5 h-3.5" />
          )}
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
                  contextPercent >= 90
                    ? "bg-red-400"
                    : contextPercent >= 70
                      ? "bg-yellow-400"
                      : "bg-emerald-400",
                )}
                style={{ width: `${Math.min(100, contextPercent)}%` }}
              />
            </span>
          </span>
        )}
        {usage.totalCost > 0 && (
          <span className="text-[8px] text-console-dim shrink-0">
            {formatCostDisplay(usage.totalCost)}
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
