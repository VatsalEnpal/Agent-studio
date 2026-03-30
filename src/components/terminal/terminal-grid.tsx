"use client";

import { useSessionsStore } from "@/stores/sessions";
import { useUIStore } from "@/stores/ui";
import { TerminalPane } from "./terminal-pane";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { computeGridLayout, cn } from "@/lib/utils";
import type { Session } from "@/lib/types";

interface TerminalGridProps {
  onCreateSession: () => void;
  onKillSession: (id: string) => void;
  onQuickChat?: () => void;
  onStartSprint?: () => void;
  onContinueLast?: () => void;
  visible?: boolean;
}

export function TerminalGrid({
  onCreateSession,
  onKillSession,
  onQuickChat,
  onStartSprint,
  onContinueLast,
  visible = true,
}: TerminalGridProps) {
  const sessions = useSessionsStore((s) => s.sessions);
  const visibleIds = useSessionsStore((s) => s.visibleIds);
  const focusedId = useSessionsStore((s) => s.focusedId);
  const setFocused = useSessionsStore((s) => s.setFocused);
  const fullscreenId = useUIStore((s) => s.fullscreenId);
  const setFullscreen = useUIStore((s) => s.setFullscreen);

  // Determine if this is an agent team (sprint) — multiple sessions with group: "sprint"
  const sprintSessions = sessions.filter((s) => s.meta?.group === "sprint");
  const isAgentTeam = sprintSessions.length > 1;

  // In agent-team mode, show all sprint sessions in grid
  // In single mode, show only the focused session full-width
  const sessionsToRender: Session[] = isAgentTeam
    ? visibleIds
        .map((id) => sessions.find((s) => s.id === id))
        .filter((s): s is Session => s !== undefined)
    : (() => {
        const focused = sessions.find((s) => s.id === focusedId);
        return focused ? [focused] : sessions.length > 0 ? [sessions[0]] : [];
      })();

  const { gridClass, spanClasses } = computeGridLayout(
    isAgentTeam ? sessionsToRender.length : 1,
  );

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6">
        <div className="text-center space-y-2">
          <p className="text-console-muted text-sm font-medium">
            Launch a Claude Code session to get started
          </p>
          <p className="text-console-dim text-xs">
            Press{" "}
            <kbd className="px-1 py-0.5 rounded bg-console-border text-console-muted text-[10px]">
              Cmd+N
            </kbd>{" "}
            to launch or{" "}
            <kbd className="px-1 py-0.5 rounded bg-console-border text-console-muted text-[10px]">
              Cmd+K
            </kbd>{" "}
            for commands
          </p>
        </div>

        {/* Quick start buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={onQuickChat ?? onCreateSession}
            className="flex flex-col items-center gap-1.5 px-5 py-3 rounded-lg border border-console-border hover:border-console-accent/50 hover:bg-console-faint/50 active:bg-console-faint active:scale-95 transition-all"
          >
            <span className="text-[11px] font-medium text-console-text">Quick Chat</span>
            <span className="text-[9px] text-console-dim">Sonnet, no agent</span>
          </button>
          <button
            onClick={onStartSprint ?? onCreateSession}
            className="flex flex-col items-center gap-1.5 px-5 py-3 rounded-lg border border-console-accent/30 bg-console-accent/5 hover:border-console-accent/60 hover:bg-console-accent/10 active:bg-console-accent/20 active:scale-95 transition-all"
          >
            <span className="text-[11px] font-medium text-console-text">Start Sprint</span>
            <span className="text-[9px] text-console-dim">Opus + orchestrator</span>
          </button>
          <button
            onClick={onContinueLast ?? onCreateSession}
            className="flex flex-col items-center gap-1.5 px-5 py-3 rounded-lg border border-console-border hover:border-console-accent/50 hover:bg-console-faint/50 active:bg-console-faint active:scale-95 transition-all"
          >
            <span className="text-[11px] font-medium text-console-text">Continue Last</span>
            <span className="text-[9px] text-console-dim">Resume previous</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("grid gap-1 h-full p-1", isAgentTeam ? gridClass : "grid-cols-1 grid-rows-1")}>
      {sessionsToRender.map((session, i) => {
        const isFullscreen = session.id === fullscreenId;
        return (
          <div
            key={session.id}
            className={cn(
              isFullscreen
                ? "fixed inset-0 z-50 p-0"
                : isAgentTeam
                  ? spanClasses[i]
                  : "col-span-1 row-span-1",
              !isFullscreen && "min-h-0",
            )}
          >
            {/* Fullscreen backdrop */}
            {isFullscreen && (
              <div
                className="absolute inset-0 bg-black/80 animate-fade-in"
                onClick={() => setFullscreen(null)}
              />
            )}

            {/* Fullscreen header bar */}
            {isFullscreen && (
              <div className="relative z-10 flex items-center justify-between px-4 py-2 bg-console-panel border-b border-console-border">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-console-text">
                    {session.name}
                  </span>
                  {session.meta?.model && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-console-border text-console-dim">
                      {session.meta.model}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-console-dim">
                    <kbd className="px-1 py-0.5 rounded bg-console-border text-console-muted text-[9px] font-mono">
                      Esc
                    </kbd>{" "}
                    to exit
                  </span>
                  <button
                    onClick={() => setFullscreen(null)}
                    className="text-xs text-console-dim hover:text-console-muted transition-colors"
                  >
                    Exit
                  </button>
                </div>
              </div>
            )}

            {/* Terminal pane */}
            <div
              className={cn(
                isFullscreen
                  ? "relative z-10 h-[calc(100vh-41px)]"
                  : "h-full",
              )}
            >
              <ErrorBoundary fallbackLabel={`Session "${session.name}" crashed`}>
                <TerminalPane
                  sessionId={session.id}
                  name={session.name}
                  status={session.status}
                  meta={session.meta}
                  focused={isFullscreen || session.id === focusedId}
                  isFullscreen={isFullscreen}
                  visible={visible}
                  onFocus={() => setFocused(session.id)}
                  onKill={() => onKillSession(session.id)}
                  onDoubleClick={() =>
                    setFullscreen(isFullscreen ? null : session.id)
                  }
                />
              </ErrorBoundary>
            </div>
          </div>
        );
      })}
    </div>
  );
}
