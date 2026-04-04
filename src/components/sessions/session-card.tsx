"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { EditIcon, CloseIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { contextColor } from "@/lib/design-tokens";
import { useSessionUsage } from "@/hooks/use-usage";
import type { Session } from "@/lib/types";

/** Pin icon — small thumbtack */
function PinIcon({ size = 12, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M5 2.5h6l-1 4h2l-1 2.5H5L4 6.5h2z" />
      <line x1="8" y1="9" x2="8" y2="14" />
    </svg>
  );
}

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

function clearCustomName(sessionId: string): void {
  const names = getCustomNames();
  delete names[sessionId];
  try {
    localStorage.setItem(RENAME_KEY, JSON.stringify(names));
  } catch {
    /* ignore */
  }
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  if (diff < 172800_000) return "Yesterday";
  if (diff < 604800_000) return `${Math.floor(diff / 86400_000)}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function readableName(session: Session): string {
  const name = session.name;
  const genericNames = new Set([
    "claude", "claude-opus", "claude-sonnet", "claude-haiku",
    "opus", "sonnet", "haiku",
  ]);
  if (genericNames.has(name.toLowerCase())) {
    const basename = session.cwd.split("/").filter(Boolean).pop();
    if (basename) return basename;
  }
  return name;
}

function statusDotClass(status: string): string {
  switch (status) {
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
}

function statusGlow(status: string): boolean {
  return status === "active" || status === "building";
}

function statusPulse(status: string): boolean {
  return status === "building" || status === "starting";
}

/** Shorten cwd for display */
function shortenCwd(cwd: string): string {
  const homeMatch = cwd.match(/^\/(?:Users|home)\/[^/]+/);
  if (homeMatch) return "~" + cwd.slice(homeMatch[0].length);
  return cwd;
}

/** Live elapsed timer hook — ticks every second for running sessions */
function useElapsedTimer(createdAt: number, isRunning: boolean): string {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  if (!isRunning) return "";
  const diffSec = Math.floor((now - createdAt) / 1000);
  if (diffSec < 60) return `${diffSec}s`;
  const min = Math.floor(diffSec / 60);
  const sec = diffSec % 60;
  if (min < 60) return `${min}m ${sec}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

/** Token border color — yellow at >50k, red at >100k */
function tokenBorderColor(totalTokens: number): string | undefined {
  if (totalTokens > 100_000) return "var(--accent-error, #F87171)";
  if (totalTokens > 50_000) return "var(--accent-sprints, #FBBF24)";
  return undefined;
}

interface SessionCardProps {
  session: Session;
  selected: boolean;
  onSelect: () => void;
  onKill: () => void;
  onResume?: () => void;
  pinned?: boolean;
  onTogglePin?: () => void;
}

export function SessionCard({
  session,
  selected,
  onSelect,
  onKill,
  onResume,
  pinned,
  onTogglePin,
}: SessionCardProps) {
  const [killing, setKilling] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [customNameState, setCustomNameState] = useState<string | null>(
    () => getCustomNames()[session.id] ?? null,
  );
  const inputRef = useRef<HTMLInputElement>(null);

  const usage = useSessionUsage(session.id);
  const effectiveModel = usage.modelShort ?? session.meta?.model ?? null;
  const contextPercent = usage.contextPercent ?? session.meta?.contextPercent ?? 0;
  const costDisplay =
    usage.totalCost > 0
      ? `$${usage.totalCost.toFixed(2)}`
      : session.meta?.cost ?? null;
  const displayName = customNameState || readableName(session);

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
      clearCustomName(session.id);
      setCustomNameState(null);
    }
    setEditing(false);
  }, [editValue, session.id, session.name]);

  const handleKill = useCallback(() => {
    if (killing) return;
    setKilling(true);
    onKill();
    setTimeout(() => setKilling(false), 3000);
  }, [killing, onKill]);

  const handleResume = useCallback(() => {
    if (resuming || !onResume) return;
    setResuming(true);
    onResume();
    setTimeout(() => setResuming(false), 5000);
  }, [resuming, onResume]);

  const isExited = session.status === "exited";
  const isRunning =
    session.status === "active" ||
    session.status === "building" ||
    session.status === "starting";

  // UX #3: Live elapsed timer
  const elapsed = useElapsedTimer(session.createdAt, isRunning);

  // UX #1: Token count border indicator
  const borderColor = tokenBorderColor(usage.totalTokens);

  return (
    <div
      onClick={onSelect}
      className={cn(
        "group relative flex flex-col gap-1 px-3 py-2 rounded-md cursor-pointer overflow-hidden",
        "transition-colors",
        selected
          ? "bg-bg-elevated border border-border-subtle"
          : "hover:bg-bg-elevated/50 border border-transparent",
      )}
      style={borderColor ? { borderLeftColor: borderColor, borderLeftWidth: 2 } : undefined}
    >
      {/* Row 1: status dot + name + pencil + kill */}
      <div className="flex items-center gap-2">
        {/* Status dot — 5px with glow for active */}
        <span
          className={cn(
            "w-[5px] h-[5px] rounded-full shrink-0",
            statusDotClass(session.status),
            statusPulse(session.status) && "animate-pulse-dot",
            // Hollow dot for paused/exited
            (session.status === "exited" || session.status === "idle") &&
              "bg-transparent border border-text-tertiary",
          )}
          style={
            statusGlow(session.status)
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
            className={cn(
              "text-[10px] font-medium truncate flex-1 min-w-0",
              "bg-bg-base border border-border-subtle rounded px-1 py-0",
              "text-text-primary focus:outline-none focus:border-sessions/40",
            )}
            autoFocus
          />
        ) : (
          <span className="text-[10px] font-medium text-text-primary truncate flex-1 min-w-0">
            {displayName}
          </span>
        )}

        {!editing && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              startEditing();
            }}
            className={cn(
              "p-0.5 rounded shrink-0",
              "opacity-0 group-hover:opacity-100",
              "text-text-ghost hover:text-text-tertiary",
              "transition-opacity",
            )}
            title="Rename session"
          >
            <EditIcon size={10} />
          </button>
        )}

        {/* UX #4: Pin button */}
        {onTogglePin && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
            className={cn(
              "p-0.5 rounded shrink-0 transition-opacity",
              pinned
                ? "text-sprints opacity-100"
                : "text-text-ghost hover:text-text-tertiary opacity-0 group-hover:opacity-100",
            )}
            title={pinned ? "Unpin session" : "Pin session"}
          >
            <PinIcon size={10} />
          </button>
        )}

        {isExited && onResume ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleResume();
            }}
            disabled={resuming}
            className={cn(
              "flex items-center gap-0.5 px-1.5 py-0.5 rounded shrink-0",
              "text-label font-medium",
              "transition-all",
              resuming
                ? "text-text-ghost cursor-not-allowed"
                : cn(
                    "text-sessions hover:bg-sessions/10",
                    selected
                      ? "opacity-80"
                      : "opacity-0 group-hover:opacity-100",
                  ),
            )}
            title="Resume session"
          >
            {resuming ? "Resuming..." : "Resume"}
          </button>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleKill();
            }}
            disabled={killing}
            className={cn(
              "p-0.5 rounded shrink-0",
              "transition-all",
              killing
                ? "text-error opacity-70 cursor-not-allowed"
                : cn(
                    "text-text-ghost hover:text-error",
                    selected
                      ? "opacity-70 hover:opacity-100"
                      : "opacity-0 group-hover:opacity-100",
                  ),
            )}
            title={killing ? "Killing..." : "Kill session"}
          >
            <CloseIcon size={10} />
          </button>
        )}
      </div>

      {/* Row 2: cwd + live timer + model + time */}
      <div className="flex items-center gap-2 pl-[13px]">
        {session.cwd && (
          <span className="text-[10px] text-text-ghost truncate flex-1 min-w-0">
            {shortenCwd(session.cwd)}
          </span>
        )}

        {/* UX #3: Live elapsed timer */}
        {elapsed && (
          <span className="text-[10px] text-text-ghost tabular-nums shrink-0">
            {elapsed}
          </span>
        )}

        <span className="flex-1" />

        {effectiveModel && effectiveModel !== "unknown" && (
          <span
            className={cn(
              "text-label px-1 py-0.5 rounded shrink-0",
              effectiveModel === "opus"
                ? "bg-memory/10 text-memory"
                : effectiveModel === "haiku"
                  ? "bg-sessions/10 text-sessions"
                  : "bg-rooms/10 text-rooms",
            )}
          >
            {effectiveModel}
          </span>
        )}

        {!elapsed && session.updatedAt > 0 && (
          <span className="text-label text-text-ghost shrink-0">
            {relativeTime(session.updatedAt)}
          </span>
        )}
      </div>

      {/* UX #2: Context window 2px progress bar at bottom of card */}
      {contextPercent > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-border-default">
          <div
            className="h-full transition-all"
            style={{
              width: `${Math.min(100, contextPercent)}%`,
              backgroundColor: contextColor(contextPercent),
            }}
          />
        </div>
      )}
    </div>
  );
}
