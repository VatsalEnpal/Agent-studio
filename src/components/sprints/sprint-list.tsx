"use client";

import { Check, Circle, Clock } from "lucide-react";
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
      <div className="px-3 py-2.5 border-b border-console-border shrink-0">
        <h3 className="text-[10px] font-medium text-console-muted uppercase tracking-wider">
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
                      ? "bg-console-faint border-l-2 border-console-accent"
                      : "hover:bg-console-faint/30 border-l-2 border-transparent",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-console-accent animate-pulse shrink-0" />
                    <span className="text-[11px] font-medium text-console-text truncate flex-1">
                      {sprint.name}
                    </span>
                  </div>
                  {/* Gate progress bar */}
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1 h-1 bg-console-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-console-accent rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[8px] text-console-dim shrink-0">
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
                    ? "bg-console-faint border-l-2 border-console-accent"
                    : "hover:bg-console-faint/30 border-l-2 border-transparent",
                )}
              >
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="text-[11px] font-medium text-console-muted truncate flex-1">
                    {sprint.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 pl-[22px]">
                  {sprint.qaScore != null && (
                    <span
                      className={cn(
                        "text-[9px] font-medium",
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
                    <span className="text-[8px] text-console-dim flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5" />
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
                    ? "bg-console-faint border-l-2 border-console-accent"
                    : "hover:bg-console-faint/30 border-l-2 border-transparent",
                )}
              >
                <div className="flex items-center gap-2">
                  <Circle className="w-3 h-3 text-console-dim shrink-0" />
                  <span className="text-[11px] font-medium text-console-dim truncate">
                    {sprint.name}
                  </span>
                </div>
              </button>
            ))}
          </SprintSection>
        )}

        {/* Empty state */}
        {sprints.length === 0 && (
          <div className="text-[10px] text-console-dim text-center py-6 px-2 leading-relaxed">
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
      <div className="px-2 pb-1">
        <span className="text-[8px] font-medium text-console-dim uppercase tracking-wider">
          {title}
        </span>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
