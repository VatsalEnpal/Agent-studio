"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { HistoryIcon, PlayIcon, SearchIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { SessionGroup } from "@/components/sessions/session-group";
import type { PastSession } from "./types";
import { formatHistoryDate } from "./utils";

export function RecentSection() {
  const [sessions, setSessions] = useState<PastSession[]>([]);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchRecentSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions/history");
      if (res.ok) {
        setSessions((await res.json()) as PastSession[]);
      }
    } catch {
      // Best effort
    }
  }, []);

  useEffect(() => {
    void fetchRecentSessions();
  }, [fetchRecentSessions]);

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter((s) => {
      const project = s.project.toLowerCase();
      const projectShort = (s.projectShort ?? s.project.split("/").pop() ?? "").toLowerCase();
      const preview = (s.preview ?? "").toLowerCase();
      const agent = (s.agent ?? "").toLowerCase();
      return project.includes(q) || projectShort.includes(q) || preview.includes(q) || agent.includes(q);
    });
  }, [sessions, searchQuery]);

  const handleResume = useCallback(
    (s: PastSession) => {
      if (resumingId) return;
      setResumingId(s.id);

      void (async () => {
        try {
          const cwd = "/" + s.project;
          const name = s.preview
            ? s.preview.length > 30
              ? s.preview.slice(0, 30) + "..."
              : s.preview
            : `resume-${s.id.slice(0, 8)}`;

          await fetch("/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
              command: "claude",
              args: ["--resume", s.id, "--dangerously-skip-permissions"],
              cwd,
              meta: {
                model: "sonnet",
                agent: "resumed",
                permissions: "bypass",
                channel: "none",
                group: "standalone",
              },
            }),
          });
        } finally {
          setTimeout(() => setResumingId(null), 5000);
        }
      })();
    },
    [resumingId],
  );

  if (sessions.length === 0) return null;

  return (
    <SessionGroup
      title="Recent Sessions"
      count={sessions.length}
      defaultOpen={false}
    >
      {sessions.length > 3 && (
        <div className="px-2 pb-1.5">
          <div className="relative">
            <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-ghost" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter sessions..."
              className="w-full pl-6 pr-2 py-1 text-xs bg-bg-input border border-border-default rounded text-text-primary placeholder:text-text-ghost focus:outline-none focus:border-border-subtle transition-all"
            />
          </div>
        </div>
      )}
      {filteredSessions.length === 0 && searchQuery.trim() ? (
        <p className="text-xs text-text-ghost px-2 py-2">No matching sessions</p>
      ) : (
        filteredSessions.slice(0, 10).map((session) => (
          <RecentSessionItem
            key={session.id}
            session={session}
            resumingId={resumingId}
            onResume={handleResume}
          />
        ))
      )}
    </SessionGroup>
  );
}

/* ---------- Recent Session Item ---------- */

function RecentSessionItem({
  session,
  onResume,
  resumingId,
}: {
  session: PastSession;
  onResume: (session: PastSession) => void;
  resumingId: string | null;
}) {
  const projectShort =
    session.projectShort ??
    session.project.split("/").pop() ??
    session.project;
  const dateStr = formatHistoryDate(session.date);

  const displayName = session.preview
    ? session.preview.length > 50
      ? session.preview.slice(0, 50) + "..."
      : session.preview
    : projectShort;

  const subtitle = [session.agent, projectShort, dateStr]
    .filter(Boolean)
    .join(" \u00b7 ");

  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 group"
      title={`${session.preview ?? ""}\n${session.agent ? `Agent: ${session.agent}\n` : ""}${session.project}\nSession: ${session.id}`}
    >
      <HistoryIcon className="w-3 h-3 text-text-tertiary shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-xs text-text-secondary truncate block">
          {displayName}
        </span>
        <span className="text-2xs text-text-tertiary truncate block">
          {subtitle}
        </span>
      </div>
      <button
        onClick={() => onResume(session)}
        disabled={resumingId === session.id}
        className={cn(
          "flex items-center gap-0.5 px-1.5 py-0.5 text-[8px] font-medium rounded transition-all shrink-0",
          resumingId === session.id
            ? "text-text-tertiary bg-border-default cursor-not-allowed opacity-100"
            : "opacity-0 group-hover:opacity-100 text-rooms bg-rooms/10 hover:bg-rooms/20 active:bg-rooms/30",
        )}
        title={`Resume session ${session.id.slice(0, 8)}`}
      >
        <PlayIcon className="w-2 h-2" />
        {resumingId === session.id ? "Resuming..." : "Resume"}
      </button>
    </div>
  );
}
