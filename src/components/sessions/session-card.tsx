"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { EditIcon, CloseIcon, CopyIcon } from "@/components/ui/icons";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
  } catch (e) {
    console.error("Caught error:", e);
  }
  return {};
}

function setCustomName(sessionId: string, name: string): void {
  const names = getCustomNames();
  names[sessionId] = name;
  try {
    localStorage.setItem(RENAME_KEY, JSON.stringify(names));
  } catch (e) {
    console.error("Caught error:", e);
  }
}

function clearCustomName(sessionId: string): void {
  const names = getCustomNames();
  delete names[sessionId];
  try {
    localStorage.setItem(RENAME_KEY, JSON.stringify(names));
  } catch (e) {
    console.error("Caught error:", e);
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
  const agent = session.meta?.agent;
  const model = session.meta?.model;
  const basename = session.cwd.split("/").filter(Boolean).pop() ?? "";

  // If the name is a generic model/tool name, build a better one
  const genericNames = new Set([
    "claude", "claude-opus", "claude-sonnet", "claude-haiku",
    "opus", "sonnet", "haiku", "session", "new-session",
    "continue-last",
  ]);

  const isGeneric = genericNames.has(name.toLowerCase());

  if (isGeneric) {
    // Best: agent + project
    if (agent && agent !== "none" && basename) {
      return `${agent} \u00b7 ${basename}`;
    }
    // Good: just the project directory
    if (basename) return basename;
  }

  // If name equals the agent name exactly and we have a project, enrich it
  if (agent && name === agent && basename) {
    return `${agent} \u00b7 ${basename}`;
  }

  // If name matches a resume pattern, make it clearer
  const resumeMatch = name.match(/^resume-([a-f0-9]{8})$/);
  if (resumeMatch) {
    if (agent && agent !== "none" && agent !== "resumed") {
      return `${agent} (resumed)`;
    }
    if (basename) return `${basename} (resumed)`;
    return `session ${resumeMatch[1]}`;
  }

  // If the name is just a model name, try to build something better
  if (model && name.toLowerCase() === model.toLowerCase()) {
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
  const [confirmKill, setConfirmKill] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [copied, setCopied] = useState(false);
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

  const isExited = session.status === "exited";
  const isRunning =
    session.status === "active" ||
    session.status === "building" ||
    session.status === "starting";

  const handleKill = useCallback(() => {
    if (killing) return;
    // Running sessions require confirmation
    if (isRunning) {
      setConfirmKill(true);
      return;
    }
    setKilling(true);
    onKill();
    setTimeout(() => setKilling(false), 3000);
  }, [killing, isRunning, onKill]);

  const confirmKillAction = useCallback(() => {
    setConfirmKill(false);
    setKilling(true);
    onKill();
    setTimeout(() => setKilling(false), 3000);
  }, [onKill]);

  const handleResume = useCallback(() => {
    if (resuming || !onResume) return;
    setResuming(true);
    onResume();
    setTimeout(() => setResuming(false), 5000);
  }, [resuming, onResume]);

  // UX #3: Live elapsed timer
  const elapsed = useElapsedTimer(session.createdAt, isRunning);

  // UX #1: Token count border indicator
  const borderColor = tokenBorderColor(usage.totalTokens);

  // Build a detailed hover tooltip
  const tooltipParts: string[] = [displayName];
  tooltipParts.push(`Status: ${session.status}`);
  if (session.cwd) tooltipParts.push(`Path: ${session.cwd}`);
  if (effectiveModel) tooltipParts.push(`Model: ${effectiveModel}`);
  if (usage.totalTokens > 0) tooltipParts.push(`Tokens: ${usage.totalTokens.toLocaleString()}`);
  if (usage.totalCost > 0) tooltipParts.push(`Cost: $${usage.totalCost.toFixed(2)}`);
  if (contextPercent > 0) tooltipParts.push(`Context: ${contextPercent}%`);
  if (session.createdAt > 0)
    tooltipParts.push(`Created: ${new Date(session.createdAt).toLocaleString()}`);

  return (
    <div
      onClick={onSelect}
      title={tooltipParts.join("\n")}
      className={cn(
        "group relative flex flex-col gap-1 px-3 py-2 rounded cursor-pointer overflow-hidden",
        "transition-all",
        selected
          ? "bg-bg-elevated border border-border-subtle"
          : "hover:bg-bg-elevated/50 hover:shadow-[0_0_12px_rgba(52,211,153,0.05)] border border-transparent",
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
              "text-xs font-medium truncate flex-1 min-w-0",
              "bg-bg-base border border-border-subtle rounded px-1 py-0",
              "text-text-primary focus:outline-none focus:border-sessions/40",
            )}
            autoFocus
          />
        ) : (
          <span className="text-xs font-medium text-text-primary truncate group-hover:whitespace-normal group-hover:line-clamp-2 flex-1 min-w-0">
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

        {/* Copy session ID */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            void navigator.clipboard.writeText(session.id).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className={cn(
            "p-0.5 rounded shrink-0 transition-opacity",
            copied
              ? "text-sessions opacity-100"
              : "text-text-ghost hover:text-text-tertiary opacity-0 group-hover:opacity-100",
          )}
          title={copied ? "Copied!" : "Copy session ID"}
        >
          <CopyIcon size={10} />
        </button>

        {isExited && onResume ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleResume();
            }}
            disabled={resuming}
            className={cn(
              "px-2 py-0.5 rounded shrink-0",
              "text-2xs font-medium",
              "border transition-all",
              resuming
                ? "text-text-ghost border-border-default cursor-not-allowed"
                : cn(
                    "text-text-ghost border-border-default",
                    "hover:text-sessions hover:border-sessions/30",
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

      {/* Row 2: preview/cwd + live timer + model + time */}
      <div className="flex items-center gap-2 pl-[13px]">
        {(session.preview || session.cwd) && (
          <span className="text-xs text-text-tertiary truncate flex-1 min-w-0">
            {session.preview ?? shortenCwd(session.cwd)}
          </span>
        )}

        {/* UX #3: Live elapsed timer */}
        {elapsed && (
          <span className="text-xs text-text-tertiary tabular-nums shrink-0">
            {elapsed}
          </span>
        )}

        <span className="flex-1" />

        {effectiveModel && effectiveModel !== "unknown" && (
          <span className="text-[8px] font-mono font-normal text-text-tertiary uppercase tracking-[0.3px] shrink-0">
            {effectiveModel}
          </span>
        )}

        {costDisplay && (
          <span className="text-[8px] font-mono text-sprints/70 shrink-0">
            {costDisplay}
          </span>
        )}

        {!elapsed && session.updatedAt > 0 && (
          <span className="text-label text-text-tertiary shrink-0">
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

      {/* Kill confirmation dialog */}
      <ConfirmDialog
        open={confirmKill}
        onOpenChange={setConfirmKill}
        title="Kill Session"
        description="This will terminate the running session. Any unsaved work may be lost."
        detail={displayName}
        confirmLabel="Kill"
        variant="danger"
        onConfirm={confirmKillAction}
      />
    </div>
  );
}
