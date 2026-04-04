"use client";

import { Check, Circle, Clock } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { Sprint } from "@/stores/sprints";

interface SprintListProps {
  sprints: Sprint[];
  selectedSprintId: string | null;
  onSelect: (id: string) => void;
}

function gateProgress(sprint: Sprint): { passed: number; total: number } {
  const total = sprint.gates.length;
  const passed = sprint.gates.filter((g) => g.status === "passed").length;
  return { passed, total };
}

function formatDate(iso?: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return "";
  }
}

export function SprintList({ sprints, selectedSprintId, onSelect }: SprintListProps) {
  const active = sprints.filter(
    (s) => s.status === "in_progress" || s.status === "launching" || s.status === "paused",
  );
  const completed = sprints.filter(
    (s) => s.status === "completed",
  );
  const planned = sprints.filter(
    (s) => s.status === "planned",
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2.5 border-b border-border shrink-0">
        <h3 className="text-label-xs font-medium text-text-secondary uppercase tracking-wider">
          Sprints
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-4">
        {/* ACTIVE */}
        {active.length > 0 && (
          <SprintSection title="Active">
            {active.map((sprint) => {
              const { passed, total } = gateProgress(sprint);
              const pct = total > 0 ? (passed / total) * 100 : 0;
              return (
                <button
                  key={sprint.id}
                  onClick={() => onSelect(sprint.id)}
                  className={cn(
                    "w-full text-left px-2.5 py-2 rounded transition-colors",
                    sprint.id === selectedSprintId
                      ? "bg-elevation-2 border-l-2 border-accent"
                      : "hover:bg-elevation-2/30 border-l-2 border-transparent",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" />
                    <span className="text-body-sm font-medium text-text-primary truncate flex-1">
                      {sprint.name}
                    </span>
                  </div>
                  {/* Gate progress bar */}
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-label-xs text-text-tertiary shrink-0">
                      {passed}/{total}
                    </span>
                  </div>
                </button>
              );
            })}
          </SprintSection>
        )}

        {/* COMPLETED */}
        {completed.length > 0 && (
          <SprintSection title="Completed">
            {completed.map((sprint) => (
              <button
                key={sprint.id}
                onClick={() => onSelect(sprint.id)}
                className={cn(
                  "w-full text-left px-2.5 py-2 rounded transition-colors",
                  sprint.id === selectedSprintId
                    ? "bg-elevation-2 border-l-2 border-accent"
                    : "hover:bg-elevation-2/30 border-l-2 border-transparent",
                )}
              >
                <div className="flex items-center gap-2">
                  <Check size={14} weight="light" className="text-emerald-400 shrink-0" />
                  <span className="text-body-sm font-medium text-text-secondary truncate flex-1">
                    {sprint.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 pl-[22px]">
                  {sprint.qaScore != null && (
                    <span
                      className={cn(
                        "text-label-xs font-medium",
                        sprint.qaScore >= 95
                          ? "text-emerald-400"
                          : sprint.qaScore >= 80
                            ? "text-amber-400"
                            : "text-red-400",
                      )}
                    >
                      QA {sprint.qaScore}%
                    </span>
                  )}
                  {sprint.completedAt && (
                    <span className="text-label-xs text-text-tertiary flex items-center gap-0.5">
                      <Clock size={12} weight="light" />
                      {formatDate(sprint.completedAt)}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </SprintSection>
        )}

        {/* PLANNED */}
        {planned.length > 0 && (
          <SprintSection title="Planned">
            {planned.map((sprint) => (
              <button
                key={sprint.id}
                onClick={() => onSelect(sprint.id)}
                className={cn(
                  "w-full text-left px-2.5 py-2 rounded transition-colors",
                  sprint.id === selectedSprintId
                    ? "bg-elevation-2 border-l-2 border-accent"
                    : "hover:bg-elevation-2/30 border-l-2 border-transparent",
                )}
              >
                <div className="flex items-center gap-2">
                  <Circle size={12} weight="light" className="text-text-tertiary shrink-0" />
                  <span className="text-body-sm font-medium text-text-tertiary truncate">
                    {sprint.name}
                  </span>
                </div>
              </button>
            ))}
          </SprintSection>
        )}

        {/* Empty state */}
        {sprints.length === 0 && (
          <div className="text-body-sm text-text-tertiary text-center py-8 px-4 leading-relaxed">
            No sprints found.
            <br />
            The PMO agent creates sprints automatically.
          </div>
        )}
      </div>
    </div>
  );
}

function SprintSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="px-2 pb-1.5">
        <span className="text-label-xs font-medium text-text-tertiary uppercase tracking-wider">
          {title}
        </span>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
