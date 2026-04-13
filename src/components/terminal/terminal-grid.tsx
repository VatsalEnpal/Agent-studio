"use client";

import { useEffect } from "react";
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

  // Filter out room-managed sessions — those only appear in Team Chat
  const nonRoomSessions = sessions.filter((s) => s.meta?.group !== "room");

  // Determine if this is an agent team (sprint) — multiple sessions with group: "sprint"
  const sprintSessions = nonRoomSessions.filter((s) => s.meta?.group === "sprint");
  const isAgentTeam = sprintSessions.length > 1;

  // In agent-team mode, show all sprint sessions in grid
  // In single mode, show only the focused session full-width
  const sessionsToRender: Session[] = isAgentTeam
    ? visibleIds
        .map((id) => nonRoomSessions.find((s) => s.id === id))
        .filter((s): s is Session => s !== undefined)
    : (() => {
        const focused = nonRoomSessions.find((s) => s.id === focusedId);
        return focused ? [focused] : nonRoomSessions.length > 0 ? [nonRoomSessions[0]] : [];
      })();

  const { gridClass, spanClasses } = computeGridLayout(isAgentTeam ? sessionsToRender.length : 1);

  // When session count or fullscreen state changes, refit all terminals after layout settles
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event("terminal-refit"));
    }, 200);
    return () => clearTimeout(timer);
  }, [sessionsToRender.length, fullscreenId]);

  if (nonRoomSessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-8 animate-tab-enter">
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded bg-bg-elevated/50 flex items-center justify-center mx-auto mb-2">
            <span className="text-2xl">&#9889;</span>
          </div>
          <p className="text-text-primary text-sm font-medium tracking-tight">Ready to go.</p>
          <p className="text-text-tertiary text-xs max-w-sm leading-relaxed">
            Launch a session to start working with Claude. Press{" "}
            <kbd className="px-1 py-0.5 rounded bg-border-default text-text-secondary text-xs">
              Cmd+Shift+N
            </kbd>{" "}
            anytime for the full launcher.
          </p>
        </div>

        {/* Quick start buttons */}
        <div className="flex flex-col items-center gap-3 w-full max-w-xs">
          <button
            onClick={onQuickChat ?? onCreateSession}
            className="btn-lift w-full flex flex-col items-center gap-1.5 px-5 py-4 rounded border border-rooms/30 bg-rooms/5 hover:border-rooms/50 hover:bg-rooms/8 hover:shadow-glow-sm active:scale-[0.98] transition-all"
          >
            <span className="text-sm font-medium text-text-primary">Start a Quick Chat</span>
            <span className="text-xs text-text-tertiary">
              Ask Claude anything — uses Sonnet, no agent needed.
            </span>
          </button>
          <button
            onClick={onStartSprint ?? onCreateSession}
            className="btn-lift w-full flex flex-col items-center gap-1.5 px-5 py-4 rounded border border-border-default hover:border-rooms/40 hover:bg-bg-elevated/40 hover:shadow-card active:scale-[0.98] transition-all"
          >
            <span className="text-sm font-medium text-text-primary">Start a Sprint</span>
            <span className="text-xs text-text-tertiary">
              Launch a full agent team to work on your project.
            </span>
          </button>
          <button
            onClick={onContinueLast ?? onCreateSession}
            className="w-full flex flex-col items-center gap-1 px-5 py-3 rounded border border-border-default hover:border-rooms/40 hover:bg-bg-elevated/40 active:scale-[0.98] transition-all"
          >
            <span className="text-xs font-medium text-text-primary">Continue Last Session</span>
            <span className="text-2xs text-text-tertiary">Pick up where you left off.</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("grid gap-1 h-full p-1", isAgentTeam ? gridClass : "grid-cols-1 grid-rows-1")}
    >
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
              <div className="relative z-10 flex items-center justify-between px-4 py-2 bg-bg-surface border-b border-border-default">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-text-primary">{session.name}</span>
                  {session.meta?.model && (
                    <span className="text-2xs px-1 py-0.5 rounded bg-border-default text-text-tertiary">
                      {session.meta.model}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-text-tertiary">
                    <kbd className="px-1 py-0.5 rounded bg-border-default text-text-secondary text-2xs font-mono">
                      Esc
                    </kbd>{" "}
                    to exit
                  </span>
                  <button
                    onClick={() => setFullscreen(null)}
                    className="text-xs text-text-tertiary hover:text-text-secondary transition-all"
                  >
                    Exit
                  </button>
                </div>
              </div>
            )}

            {/* Terminal pane */}
            <div className={cn(isFullscreen ? "relative z-10 h-[calc(100vh-41px)]" : "h-full")}>
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
                  onDoubleClick={() => setFullscreen(isFullscreen ? null : session.id)}
                />
              </ErrorBoundary>
            </div>
          </div>
        );
      })}
    </div>
  );
}
