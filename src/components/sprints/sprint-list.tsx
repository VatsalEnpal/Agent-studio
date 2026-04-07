"use client";

import { CheckIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/hooks/use-relative-time";
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
      <div className="px-3 py-2.5 border-b border-border-default shrink-0 flex items-center justify-between">
        <h3 className="text-label text-text-ghost uppercase tracking-[0.06em]">
          Sprints
        </h3>
        {sprints.length > 0 && (
          <span className="text-2xs text-text-ghost tabular-nums">
            {active.length > 0 ? `${active.length} active` : `${sprints.length} total`}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-4 scrollbar-thin">
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
                    "w-full text-left px-2.5 py-2 rounded-md transition-all",
                    sprint.id === selectedSprintId
                      ? "bg-bg-elevated border-l-2 border-l-sprints shadow-[inset_0_0_0_1px_var(--accent-sprints-glow,rgba(251,191,36,0.08))]"
                      : "hover:bg-bg-elevated/30 hover:shadow-[0_0_12px_rgba(251,191,36,0.06)] border-l-2 border-transparent",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-[4px] h-[4px] rounded-full bg-sprints animate-pulse-dot shrink-0" />
                    <span className="text-xs font-medium text-text-primary truncate flex-1">
                      {sprint.name}
                    </span>
                    {/* UX #8: Headless run indicator */}
                    {sprint.agents.length === 0 && (
                      <span className="text-label px-1 py-0.5 rounded bg-sprints/10 text-sprints shrink-0" title="Headless run — no agents attached">
                        headless
                      </span>
                    )}
                  </div>
                  {/* Gate progress bar + elapsed time */}
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1 h-1 bg-border-default rounded-full overflow-hidden">
                      <div
                        className="h-full bg-sprints rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-label text-text-tertiary shrink-0">
                      {Math.round(pct)}%
                    </span>
                    {sprint.startedAt && (
                      <span className="text-label text-text-ghost shrink-0">
                        {formatRelative(new Date(sprint.startedAt).getTime())}
                      </span>
                    )}
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
                  "w-full text-left px-2.5 py-2 rounded-md transition-all",
                  sprint.id === selectedSprintId
                    ? "bg-bg-elevated border-l-2 border-l-sprints"
                    : "hover:bg-bg-elevated/30 hover:shadow-[0_0_12px_rgba(251,191,36,0.06)] border-l-2 border-transparent",
                )}
              >
                <div className="flex items-center gap-2">
                  <CheckIcon size={12} className="text-sessions shrink-0" />
                  <span className="text-xs font-medium text-text-secondary truncate flex-1">
                    {sprint.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 pl-[22px]">
                  {sprint.qaScore != null && (
                    <span
                      className={cn(
                        "text-label font-medium",
                        sprint.qaScore >= 95
                          ? "text-sessions"
                          : sprint.qaScore >= 80
                            ? "text-sprints"
                            : "text-error",
                      )}
                    >
                      QA {sprint.qaScore}%
                    </span>
                  )}
                  {sprint.completedAt && (
                    <span className="text-label text-text-tertiary">
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
                  "w-full text-left px-2.5 py-2 rounded-md transition-all",
                  sprint.id === selectedSprintId
                    ? "bg-bg-elevated border-l-2 border-l-sprints"
                    : "hover:bg-bg-elevated/30 hover:shadow-[0_0_12px_rgba(251,191,36,0.06)] border-l-2 border-transparent",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full border border-text-ghost shrink-0" />
                  <span className="text-xs text-text-tertiary truncate">
                    {sprint.name}
                  </span>
                </div>
              </button>
            ))}
          </SprintSection>
        )}

        {/* Empty state */}
        {sprints.length === 0 && (
          <div className="text-center py-6 px-4">
            <CheckIcon size={20} className="text-text-ghost mx-auto mb-2" />
            <p className="text-xs text-text-secondary font-medium">No sprints running</p>
            <p className="text-xs text-text-tertiary mt-1 leading-relaxed">
              Sprints are created automatically by the PMO agent, or you can start one manually from a plan.
            </p>
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
        <span className="text-label text-text-ghost uppercase tracking-[0.06em]">
          {title}
        </span>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
