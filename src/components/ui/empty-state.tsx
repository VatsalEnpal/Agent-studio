"use client";

import { Terminal, ChatCircle, Play, Brain, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Generic Empty State
// ---------------------------------------------------------------------------

interface EmptyStateProps {
  icon: PhosphorIcon;
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
        className="size-12 text-text-tertiary"
      />
      <h3 className="text-title-md text-text-emphasis">{title}</h3>
      <p className="text-body-sm text-text-secondary max-w-[320px]">
        {description}
      </p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className={cn(
            "mt-2 inline-flex items-center justify-center",
            "px-4 py-2 rounded-lg",
            "text-body-sm font-medium",
            "text-canvas bg-accent hover:bg-accent-hover",
            "transition-colors duration-[var(--duration-instant)] ease-out",
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
      icon={Terminal}
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
      icon={ChatCircle}
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
      icon={Play}
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
      icon={Brain}
      title="No memories yet"
      description="As agents work, they store learnings, corrections, and decisions here for future reference."
    />
  );
}
