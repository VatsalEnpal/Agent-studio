"use client";

import { useState, useCallback, useRef } from "react";
import { Pencil, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { contextColor } from "@/lib/design-tokens";
import { useSessionUsage } from "@/hooks/use-usage";
import type { Session } from "@/lib/types";

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

function statusDotClass(status: string): string {
  switch (status) {
    case "active":
    case "building":
      return "bg-success";
    case "idle":
    case "starting":
      return "bg-warning";
    case "exited":
      return "bg-text-tertiary";
    default:
      return "bg-text-tertiary";
  }
}

function statusPulse(status: string): boolean {
  return status === "building" || status === "starting";
}

interface SessionCardProps {
  session: Session;
  selected: boolean;
  onSelect: () => void;
  onKill: () => void;
}

export function SessionCard({
  session,
  selected,
  onSelect,
  onKill,
}: SessionCardProps) {
  const [killing, setKilling] = useState(false);
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
  const agentName = session.meta?.agent && session.meta.agent !== "none"
    ? session.meta.agent
    : null;
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

  return (
    <div
      onClick={onSelect}
      className={cn(
        "group relative flex flex-col gap-1 px-3 py-2 rounded-lg cursor-pointer",
        "transition-colors duration-[var(--duration-quick)] ease-out",
        selected
          ? "bg-accent-subtle border border-accent/20"
          : "hover:bg-surface-hover border border-transparent",
      )}
    >
      {/* Row 1: status dot + name + pencil + kill */}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "size-2 rounded-full shrink-0",
            statusDotClass(session.status),
            statusPulse(session.status) && "animate-pulse-dot",
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
            className={cn(
              "text-body-sm font-medium truncate flex-1 min-w-0",
              "bg-canvas border border-accent/40 rounded px-1 py-0",
              "text-text-primary focus:outline-none focus:border-accent",
            )}
            autoFocus
          />
        ) : (
          <span className="text-body-sm font-medium text-text-primary truncate flex-1 min-w-0">
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
              "text-text-tertiary hover:text-text-secondary",
              "transition-opacity duration-[var(--duration-instant)]",
            )}
            title="Rename session"
          >
            <Pencil className="size-3" />
          </button>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            handleKill();
          }}
          disabled={killing}
          className={cn(
            "p-0.5 rounded shrink-0",
            "transition-all duration-[var(--duration-instant)]",
            killing
              ? "text-error opacity-70 cursor-not-allowed"
              : cn(
                  "text-text-tertiary hover:text-error",
                  selected
                    ? "opacity-70 hover:opacity-100"
                    : "opacity-0 group-hover:opacity-100",
                ),
          )}
          title={killing ? "Killing..." : "Kill session"}
        >
          {killing ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <X className="size-3" />
          )}
        </button>
      </div>

      {/* Row 2: agent name + context bar + model + cost */}
      <div className="flex items-center gap-2 pl-4">
        {agentName && (
          <span className="text-label-xs text-text-secondary truncate max-w-[80px]">
            {agentName}
          </span>
        )}

        {/* Context % bar — 3px tall, color-coded */}
        {contextPercent > 0 && (
          <span className="flex items-center gap-1 shrink-0">
            <span className="w-10 h-[3px] rounded-full bg-border overflow-hidden">
              <span
                className="h-full rounded-full block transition-all duration-[var(--duration-smooth)]"
                style={{
                  width: `${Math.min(100, contextPercent)}%`,
                  backgroundColor: contextColor(contextPercent),
                }}
              />
            </span>
            <span className="text-label-xs text-text-tertiary">
              {contextPercent}%
            </span>
          </span>
        )}

        <span className="flex-1" />

        {effectiveModel && effectiveModel !== "unknown" && (
          <span
            className={cn(
              "text-label-xs px-1 py-0.5 rounded shrink-0",
              effectiveModel === "opus"
                ? "bg-[rgba(167,139,250,0.12)] text-[#A78BFA]"
                : effectiveModel === "haiku"
                  ? "bg-success-subtle text-success"
                  : "bg-accent-subtle text-accent",
            )}
          >
            {effectiveModel}
          </span>
        )}

        {costDisplay && (
          <span className="text-label-xs text-text-tertiary shrink-0">
            {costDisplay}
          </span>
        )}
      </div>
    </div>
  );
}
