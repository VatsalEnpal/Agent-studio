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
      <h3 className="text-[10px] font-medium text-text-secondary">{title}</h3>
      <p className="text-[10px] text-text-tertiary max-w-[300px]">
        {description}
      </p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className={cn(
            "mt-1 inline-flex items-center justify-center",
            "px-3 py-1.5 rounded-md",
            "text-[10px] font-medium",
            "text-bg-base bg-text-primary hover:bg-text-secondary",
            "transition-colors",
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
      title="No sessions yet"
      description="Launch a new Claude Code session to get started. Sessions give you interactive terminals with AI agents."
      actionLabel="New Session"
      onAction={onAction}
    />
  );
}

export function EmptyRoomsState({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon={RoomsIcon}
      title="No rooms yet"
      description="Create a team room to collaborate with multiple AI agents in a shared chat."
      actionLabel="New Room"
      onAction={onAction}
    />
  );
}

export function EmptySprintsState({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon={PlayIcon}
      title="No sprints yet"
      description="Sprints are automated multi-step workflows. Define a plan and let agents execute it."
      actionLabel="New Sprint"
      onAction={onAction}
    />
  );
}

export function EmptyMemoryState() {
  return (
    <EmptyState
      icon={MemoryIcon}
      title="No memories yet"
      description="As agents work, they store learnings, corrections, and decisions here for future reference."
    />
  );
}
