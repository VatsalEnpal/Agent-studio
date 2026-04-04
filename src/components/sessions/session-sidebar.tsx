"use client";

import { useState, useMemo, useCallback } from "react";
import {
  CaretDown,
  CaretRight,
  GitBranch,
  Globe,
  Play,
  Square,
  ArrowSquareOut,
  Plus,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useSessionsStore } from "@/stores/sessions";
import { useGitStore } from "@/stores/git";
import { SessionCard } from "./session-card";
import type { Session, RepoStatus } from "@/lib/types";

// ---------------------------------------------------------------------------
// Section header — labelXs style
// ---------------------------------------------------------------------------

function SectionHeader({
  label,
  count,
  collapsible,
  collapsed,
  onToggle,
}: {
  label: string;
  count?: number;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  return (
    <button
      onClick={collapsible ? onToggle : undefined}
      className={cn(
        "flex items-center gap-1.5 w-full px-3 py-1.5",
        "text-label-xs uppercase text-text-tertiary",
        collapsible && "cursor-pointer hover:text-text-secondary",
        !collapsible && "cursor-default",
      )}
    >
      {collapsible &&
        (collapsed ? (
          <CaretRight size={12} weight="light" />
        ) : (
          <CaretDown size={12} weight="light" />
        ))}
      <span>{label}</span>
      {count != null && count > 0 && (
        <span className="text-label-xs text-text-tertiary ml-auto">{count}</span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Repo card
// ---------------------------------------------------------------------------

function RepoCard({
  repo,
  onPR,
  onPush,
  onClick,
}: {
  repo: RepoStatus;
  onPR?: (repo: RepoStatus) => void;
  onPush?: (repo: RepoStatus) => void;
  onClick?: (repo: RepoStatus) => void;
}) {
  return (
    <div
      onClick={() => onClick?.(repo)}
      className={cn(
        "flex flex-col gap-1 px-3 py-2 rounded-lg cursor-pointer",
        "hover:bg-surface-hover",
        "transition-colors duration-[var(--duration-quick)]",
      )}
    >
      <div className="flex items-center gap-2">
        <GitBranch size={14} weight="light" className="text-text-secondary shrink-0" />
        <span className="text-body-sm font-medium text-text-primary truncate flex-1">
          {repo.name}
        </span>
        <span
          className={cn(
            "size-1.5 rounded-full shrink-0",
            repo.dirty ? "bg-warning" : "bg-success",
          )}
          title={repo.dirty ? "Dirty" : "Clean"}
        />
      </div>
      <div className="flex items-center gap-2 pl-[22px]">
        <span className="text-label-xs text-text-tertiary truncate">
          {repo.branch}
        </span>
        {repo.changedFiles > 0 && (
          <span className="text-label-xs text-warning">
            {repo.changedFiles} changed
          </span>
        )}
        <span className="flex-1" />
        {onPR && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPR(repo);
            }}
            className="text-label-xs text-accent hover:text-accent-hover transition-colors"
            title="Create PR"
          >
            PR
          </button>
        )}
        {onPush && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPush(repo);
            }}
            className="text-label-xs text-text-secondary hover:text-text-primary transition-colors"
            title="Push"
          >
            Push
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Server card (dev servers)
// ---------------------------------------------------------------------------

interface DevServer {
  id: string;
  name: string;
  port: number;
  status: "running" | "stopped";
}

function ServerCard({
  server,
  onToggle,
  onOpen,
}: {
  server: DevServer;
  onToggle?: () => void;
  onOpen?: () => void;
}) {
  const isRunning = server.status === "running";
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg",
        "hover:bg-surface-hover",
        "transition-colors duration-[var(--duration-quick)]",
      )}
    >
      <Globe size={14} weight="light" className="text-text-secondary shrink-0" />
      <span className="text-body-sm text-text-primary truncate flex-1">
        {server.name}
      </span>
      <span className="text-label-xs text-text-tertiary">:{server.port}</span>
      <span
        className={cn(
          "size-1.5 rounded-full shrink-0",
          isRunning ? "bg-success" : "bg-text-tertiary",
        )}
      />
      <button
        onClick={onToggle}
        className="p-0.5 text-text-tertiary hover:text-text-secondary transition-colors"
        title={isRunning ? "Stop" : "Start"}
      >
        {isRunning ? <Square size={12} weight="light" /> : <Play size={12} weight="light" />}
      </button>
      {isRunning && (
        <button
          onClick={onOpen}
          className="p-0.5 text-text-tertiary hover:text-text-secondary transition-colors"
          title="Open in browser"
        >
          <ArrowSquareOut size={12} weight="light" />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// History grouping helpers
// ---------------------------------------------------------------------------

function groupSessionsByDate(sessions: Session[]): {
  label: string;
  sessions: Session[];
}[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const weekStart = todayStart - 6 * 86400000;

  const groups: Record<string, Session[]> = {
    Today: [],
    Yesterday: [],
    "This Week": [],
    Older: [],
  };

  for (const s of sessions) {
    const t = s.updatedAt || s.createdAt;
    if (t >= todayStart) groups["Today"].push(s);
    else if (t >= yesterdayStart) groups["Yesterday"].push(s);
    else if (t >= weekStart) groups["This Week"].push(s);
    else groups["Older"].push(s);
  }

  return Object.entries(groups)
    .filter(([, arr]) => arr.length > 0)
    .map(([label, arr]) => ({ label, sessions: arr }));
}

// ---------------------------------------------------------------------------
// Main sidebar
// ---------------------------------------------------------------------------

interface SessionSidebarProps {
  onNewSession: () => void;
  onKillSession: (id: string) => void;
  onResumeSession?: (session: Session) => void;
  onRepoClick?: (repo: RepoStatus) => void;
  onPR?: (repo: RepoStatus) => void;
  onPush?: (repo: RepoStatus) => void;
}

export function SessionSidebar({
  onNewSession,
  onKillSession,
  onResumeSession,
  onRepoClick,
  onPR,
  onPush,
}: SessionSidebarProps) {
  const sessions = useSessionsStore((s) => s.sessions);
  const focusedId = useSessionsStore((s) => s.focusedId);
  const setFocused = useSessionsStore((s) => s.setFocused);
  const repos = useGitStore((s) => s.repos);

  const [reposCollapsed, setReposCollapsed] = useState(false);
  const [serversCollapsed, setServersCollapsed] = useState(true);

  // Separate active vs exited sessions
  const activeSessions = useMemo(
    () => sessions.filter((s) => s.status !== "exited" && s.meta?.group !== "room"),
    [sessions],
  );
  const exitedSessions = useMemo(
    () =>
      sessions
        .filter((s) => s.status === "exited" && s.meta?.group !== "room")
        .sort((a, b) => b.createdAt - a.createdAt),
    [sessions],
  );
  const historyGroups = useMemo(
    () => groupSessionsByDate(exitedSessions),
    [exitedSessions],
  );

  const handleResume = useCallback(
    async (session: Session) => {
      if (onResumeSession) {
        onResumeSession(session);
        return;
      }
      // Default: create a new session with --resume flag
      const basename = session.cwd.split("/").filter(Boolean).pop() ?? session.name;
      try {
        await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `${basename} (resumed)`,
            command: "claude",
            args: ["--resume", session.id, "--dangerously-skip-permissions"],
            cwd: session.cwd,
            meta: {
              model: session.meta?.model ?? "sonnet",
              agent: session.meta?.agent ?? "none",
              permissions: "bypass",
              channel: "none",
              group: "standalone",
            },
          }),
        });
      } catch {
        // Best effort
      }
    },
    [onResumeSession],
  );

  // Placeholder dev servers — will be wired via WS later
  const devServers: DevServer[] = [];

  return (
    <div className="flex flex-col h-full">
      {/* New session button */}
      <div className="px-3 py-2 border-b border-border-subtle">
        <button
          onClick={onNewSession}
          className={cn(
            "flex items-center justify-center gap-1.5 w-full",
            "px-3 py-1.5 rounded-lg",
            "text-body-sm font-medium text-accent",
            "bg-accent-subtle hover:bg-accent/10",
            "transition-colors duration-[var(--duration-quick)]",
          )}
        >
          <Plus size={14} weight="light" />
          New Session
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* ACTIVE */}
        <SectionHeader label="Active" count={activeSessions.length} />
        <div className="px-1 pb-2 space-y-0.5">
          {activeSessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              selected={session.id === focusedId}
              onSelect={() => setFocused(session.id)}
              onKill={() => onKillSession(session.id)}
            />
          ))}
          {activeSessions.length === 0 && (
            <p className="px-3 py-2 text-label-xs text-text-tertiary">
              No active sessions
            </p>
          )}
        </div>

        {/* REPOS */}
        {repos.length > 0 && (
          <>
            <SectionHeader
              label="Repos"
              count={repos.length}
              collapsible
              collapsed={reposCollapsed}
              onToggle={() => setReposCollapsed((v) => !v)}
            />
            {!reposCollapsed && (
              <div className="px-1 pb-2 space-y-0.5">
                {repos.map((repo) => (
                  <RepoCard
                    key={repo.path}
                    repo={repo}
                    onClick={onRepoClick}
                    onPR={onPR}
                    onPush={onPush}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* SERVERS */}
        {devServers.length > 0 && (
          <>
            <SectionHeader
              label="Servers"
              count={devServers.length}
              collapsible
              collapsed={serversCollapsed}
              onToggle={() => setServersCollapsed((v) => !v)}
            />
            {!serversCollapsed && (
              <div className="px-1 pb-2 space-y-0.5">
                {devServers.map((server) => (
                  <ServerCard key={server.id} server={server} />
                ))}
              </div>
            )}
          </>
        )}

        {/* HISTORY */}
        {historyGroups.length > 0 && (
          <>
            <SectionHeader label="History" />
            {historyGroups.map((group) => (
              <div key={group.label} className="px-1 pb-1">
                <span className="block px-3 py-1 text-label-xs text-text-tertiary">
                  {group.label}
                </span>
                <div className="space-y-0.5">
                  {group.sessions.map((session) => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      selected={session.id === focusedId}
                      onSelect={() => setFocused(session.id)}
                      onKill={() => onKillSession(session.id)}
                      onResume={() => handleResume(session)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
