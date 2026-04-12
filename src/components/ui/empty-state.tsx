"use client";

import { SessionsIcon, RoomsIcon, PlayIcon, MemoryIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Generic Empty State
// ---------------------------------------------------------------------------

interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-16 px-6 text-center",
        className,
      )}
    >
      <Icon
        className="size-6 text-text-ghost"
      />
      <h3 className="text-xs font-medium text-text-secondary">{title}</h3>
      <p className="text-xs text-text-tertiary max-w-[300px]">
        {description}
      </p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className={cn(
            "mt-1 inline-flex items-center justify-center",
            "px-3 py-1.5 rounded",
            "text-xs font-medium",
            "text-bg-base bg-text-primary hover:bg-text-secondary",
            "transition-all",
          )}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export function EmptySessionsState({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon={SessionsIcon}
      title="No active sessions"
      description="Launch an interactive Claude Code terminal to start coding with AI. Each session runs in its own workspace."
      actionLabel="New Session"
      onAction={onAction}
    />
  );
}

export function EmptyRoomsState({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon={RoomsIcon}
      title="No active rooms"
      description="Rooms let multiple AI agents collaborate on a task together in a shared chat thread."
      actionLabel="Create Room"
      onAction={onAction}
    />
  );
}

export function EmptySprintsState({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon={PlayIcon}
      title="No sprints running"
      description="Sprints are multi-step automated workflows. The PMO agent creates them when it detects pending work, or you can start one manually."
      actionLabel="New Sprint"
      onAction={onAction}
    />
  );
}

export function EmptyMemoryState() {
  return (
    <EmptyState
      icon={MemoryIcon}
      title="No memories stored"
      description="Agents automatically save learnings, corrections, and decisions here as they work. This builds institutional knowledge over time."
    />
  );
}
