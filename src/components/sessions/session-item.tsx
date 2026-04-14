"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { CloseIcon, EditIcon } from "@/components/ui/icons";
import { cn, shortenCwd } from "@/lib/utils";
import { useSessionUsage } from "@/hooks/use-usage";
import { useRelativeTime } from "@/hooks/use-relative-time";
import type { Session } from "@/lib/types";

// Local storage map for user-renamed sessions
const RENAME_KEY = "agent-studio-session-names";

function getCustomNames(): Record<string, string> {
  try {
    const raw = localStorage.getItem(RENAME_KEY);
    if (raw) return JSON.parse(raw) as Record<string, string>;
  } catch (e) {
    console.error("Failed to parse custom session names from localStorage:", e);
  }
  return {};
}

function setCustomName(sessionId: string, name: string): void {
  const names = getCustomNames();
  names[sessionId] = name;
  try {
    localStorage.setItem(RENAME_KEY, JSON.stringify(names));
  } catch (e) {
    console.error("Failed to save custom session name to localStorage:", e);
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

export function SessionItem({ session, focused, visible, onFocus, onKill }: SessionItemProps) {
  const [killing, setKilling] = useState(false);

  const handleKill = useCallback(async () => {
    if (killing) return;
    setKilling(true);
    try {
      await onKill();
    } finally {
      setTimeout(() => setKilling(false), 3000);
    }
  }, [killing, onKill]);

  const isExited = session.status === "exited";
  const isRunning =
    session.status === "active" || session.status === "building" || session.status === "starting";

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

  // Live uptime that auto-updates
  const liveUptime = useRelativeTime(session.createdAt);

  // Display name: custom rename > auto-detected from first message > session.name
  const [customNameState, setCustomNameState] = useState<string | null>(() => {
    return getCustomNames()[session.id] ?? null;
  });
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const displayName = customNameState || session.name;

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
      const names = getCustomNames();
      delete names[session.id];
      try {
        localStorage.setItem(RENAME_KEY, JSON.stringify(names));
      } catch (e) {
        console.error("Failed to clear custom session name in localStorage:", e);
      }
      setCustomNameState(null);
    }
    setEditing(false);
  }, [editValue, session.id, session.name]);

  const statusDot = (() => {
    switch (session.status) {
      case "active":
      case "building":
        return "bg-sessions";
      case "idle":
      case "starting":
        return "bg-sprints";
      case "exited":
        return "bg-text-tertiary";
      default:
        return "bg-text-tertiary";
    }
  })();

  return (
    <div
      onClick={onFocus}
      title={`${displayName}\nPath: ${session.cwd}\nID: ${session.id}\nModel: ${effectiveModel ?? "unknown"}\nStatus: ${session.status}${hasContext ? `\nContext: ${contextPercent}%` : ""}`}
      className={cn(
        "sidebar-item flex flex-col gap-0.5 px-2 py-2 rounded cursor-pointer group",
        focused
          ? "bg-bg-elevated text-text-primary border-l-2 border-l-sessions"
          : "text-text-secondary hover:bg-bg-elevated/40 hover:text-text-primary border-l-2 border-l-transparent",
        !visible && "opacity-60",
      )}
    >
      {/* Row 1: status dot + name + model + kill */}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "w-[5px] h-[5px] rounded-full shrink-0",
            statusDot,
            (session.status === "building" || session.status === "starting") && "animate-pulse-dot",
          )}
          style={
            session.status === "active" || session.status === "building"
              ? { boxShadow: "0 0 6px var(--accent-sessions-glow)" }
              : undefined
          }
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
            className="text-xs font-medium truncate flex-1 bg-bg-base border border-sessions/30 rounded px-1 py-0 text-text-primary focus:outline-none focus:border-sessions"
            autoFocus
          />
        ) : (
          <>
            <span className="text-xs font-medium truncate flex-1">{displayName}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                startEditing();
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-bg-elevated shrink-0"
              title="Rename session"
            >
              <EditIcon size={10} className="text-text-tertiary" />
            </button>
          </>
        )}
        {effectiveModel && effectiveModel !== "unknown" && (
          <span
            className={cn(
              "text-label px-1 py-0.5 rounded shrink-0 font-medium",
              effectiveModel === "opus"
                ? "bg-memory/10 text-memory"
                : effectiveModel === "haiku"
                  ? "bg-sessions/10 text-sessions"
                  : "bg-border-default text-text-tertiary",
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
              ? "text-error opacity-70 cursor-not-allowed"
              : "text-text-ghost hover:text-error hover:bg-error/10 active:bg-error/20",
            !killing &&
              (focused ? "opacity-70 hover:opacity-100" : "opacity-0 group-hover:opacity-100"),
          )}
          title={killing ? "Killing..." : "Kill session"}
        >
          <CloseIcon size={12} />
        </button>
      </div>

      {/* Row 2: uptime + cwd + cost + context */}
      <div className="flex items-center gap-2 pl-[13px]">
        {isRunning && (
          <span className="flex items-center gap-0.5 text-xs text-text-tertiary">{liveUptime}</span>
        )}
        {session.cwd && (
          <span className="text-xs text-text-tertiary truncate flex-1 min-w-0">
            {shortenCwd(session.cwd)}
          </span>
        )}
        {usage.totalCost > 0 && (
          <span className="text-label text-text-ghost tabular-nums shrink-0" title="Session cost">
            ${usage.totalCost < 0.01 ? "<0.01" : usage.totalCost.toFixed(2)}
          </span>
        )}
        {hasContext && (
          <span className="flex items-center gap-1 shrink-0">
            <span className="text-label text-text-tertiary">{contextPercent}%</span>
            <span className="w-10 h-1 rounded-full bg-border-default overflow-hidden">
              <span
                className={cn(
                  "h-full rounded-full block transition-all",
                  contextPercent >= 90
                    ? "bg-error"
                    : contextPercent >= 70
                      ? "bg-sprints"
                      : "bg-sessions",
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
