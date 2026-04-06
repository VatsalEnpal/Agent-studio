"use client";

import { useSessionsStore } from "@/stores/sessions";
import { SessionItem } from "@/components/sessions/session-item";
import { SessionGroup } from "@/components/sessions/session-group";

interface SessionsSectionProps {
  onKillSession: (id: string) => void;
}

export function SessionsSection({ onKillSession }: SessionsSectionProps) {
  const sessions = useSessionsStore((s) => s.sessions);
  const focusedId = useSessionsStore((s) => s.focusedId);
  const visibleIds = useSessionsStore((s) => s.visibleIds);
  const swapIn = useSessionsStore((s) => s.swapIn);

  // Filter out room-managed sessions
  const managedSessions = sessions.filter((s) => s.meta?.group !== "room");

  return (
    <SessionGroup title="Sessions" count={managedSessions.length}>
      {managedSessions.length === 0 ? (
        <p className="text-[10px] text-text-tertiary px-2 py-2">
          Click + New Session to start
        </p>
      ) : (
        managedSessions.map((session) => (
          <SessionItem
            key={session.id}
            session={session}
            focused={session.id === focusedId}
            visible={visibleIds.includes(session.id)}
            onFocus={() => swapIn(session.id)}
            onKill={() => onKillSession(session.id)}
          />
        ))
      )}
    </SessionGroup>
  );
}
