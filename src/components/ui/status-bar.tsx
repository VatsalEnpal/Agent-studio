"use client";

import { GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { contextColor } from "@/lib/design-tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionInfo {
  agent: string;
  model: string;
  contextPercent: number | null;
  cost: number;
  lastActivity: string;
  branch?: string;
}

interface StatusBarProps {
  session: SessionInfo | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Dot divider between status items */
function Dot() {
  return <span className="text-text-tertiary select-none">&middot;</span>;
}

/** Shape indicator for context % (color-blind accessibility) */
function contextShape(percent: number): string {
  if (percent >= 80) return "\u203C"; // ‼
  if (percent >= 50) return "\u26A0"; // ⚠
  return "";
}

/** Tailwind text color class for context % */
function contextTextClass(percent: number): string {
  if (percent >= 80) return "text-error";
  if (percent >= 50) return "text-warning";
  return "text-success";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StatusBar({ session }: StatusBarProps) {
  return (
    <footer
      className={cn(
        "flex items-center gap-2 px-3 shrink-0",
        "h-8 bg-surface border-t border-border-subtle",
        "z-statusBar",
        "text-label-xs",
      )}
      aria-label="Status bar"
    >
      {!session ? (
        <span className="text-text-tertiary">No active session</span>
      ) : (
        <>
          {/* Agent name */}
          <span className="text-text-primary truncate max-w-[140px]">
            {session.agent}
          </span>

          <Dot />

          {/* Model badge */}
          <span
            className={cn(
              "inline-flex items-center",
              "px-1.5 py-0.5 rounded",
              "text-accent bg-accent-subtle",
            )}
          >
            {session.model}
          </span>

          <Dot />

          {/* Context % with traffic-light color + shape indicator */}
          {session.contextPercent != null ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5",
                contextTextClass(session.contextPercent),
              )}
            >
              {contextShape(session.contextPercent) && (
                <span aria-hidden="true">
                  {contextShape(session.contextPercent)}
                </span>
              )}
              {session.contextPercent}% ctx
            </span>
          ) : (
            <span className="text-text-tertiary">&mdash; ctx</span>
          )}

          <Dot />

          {/* Cost */}
          <span className="text-text-secondary">
            ${session.cost.toFixed(2)}
          </span>

          <Dot />

          {/* Last activity */}
          <span className="text-text-tertiary">{session.lastActivity}</span>

          {/* Branch (optional) */}
          {session.branch && (
            <>
              <Dot />
              <span className="inline-flex items-center gap-1 text-text-secondary">
                <GitBranch className="size-3" strokeWidth={1.5} />
                <span className="truncate max-w-[120px]">
                  {session.branch}
                </span>
              </span>
            </>
          )}
        </>
      )}
    </footer>
  );
}
