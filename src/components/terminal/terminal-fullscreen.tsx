"use client";

import { useEffect } from "react";
import { useUIStore } from "@/stores/ui";
import { useSessionsStore } from "@/stores/sessions";
import { TerminalPane } from "./terminal-pane";

interface TerminalFullscreenProps {
  onKillSession: (id: string) => void;
}

/**
 * Fullscreen overlay for a single terminal pane.
 * Shown when fullscreenId is set in the UI store.
 * Exits on Escape key (handled by use-keyboard hook) or close button.
 */
export function TerminalFullscreen({ onKillSession }: TerminalFullscreenProps) {
  const fullscreenId = useUIStore((s) => s.fullscreenId);
  const setFullscreen = useUIStore((s) => s.setFullscreen);
  const sessions = useSessionsStore((s) => s.sessions);
  const setFocused = useSessionsStore((s) => s.setFocused);

  // Lock body scroll when fullscreen is active
  useEffect(() => {
    if (fullscreenId) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [fullscreenId]);

  if (!fullscreenId) return null;

  const session = sessions.find((s) => s.id === fullscreenId);
  if (!session) return null;

  return (
    <div className="fixed inset-0 z-50 animate-fade-in">
      {/* Dark overlay */}
      <div
        className="absolute inset-0 bg-black/80"
        onClick={() => setFullscreen(null)}
      />

      {/* Fullscreen header */}
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
            Press{" "}
            <kbd className="px-1 py-0.5 rounded bg-console-border text-console-muted text-[9px] font-mono">
              Esc
            </kbd>{" "}
            to exit
          </span>
          <button
            onClick={() => setFullscreen(null)}
            className="text-xs text-console-dim hover:text-console-muted transition-colors"
          >
            Exit Fullscreen
          </button>
        </div>
      </div>

      {/* Terminal content */}
      <div className="relative z-10 h-[calc(100vh-41px)]">
        <TerminalPane
          sessionId={session.id}
          name={session.name}
          status={session.status}
          meta={session.meta}
          focused
          isFullscreen
          onFocus={() => setFocused(session.id)}
          onKill={() => {
            onKillSession(session.id);
            setFullscreen(null);
          }}
          onDoubleClick={() => setFullscreen(null)}
        />
      </div>
    </div>
  );
}
