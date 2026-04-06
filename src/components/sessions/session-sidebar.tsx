"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  PlusIcon,
  SearchIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { useSessionsStore } from "@/stores/sessions";
import { useGitStore } from "@/stores/git";
import { SessionCard } from "./session-card";
import type { Session, RepoStatus } from "@/lib/types";

// ---------------------------------------------------------------------------
// Pin persistence (localStorage)
// ---------------------------------------------------------------------------

const PIN_KEY = "agent-studio-pinned-sessions";

function getPinnedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* ignore */ }
  return new Set();
}

function savePinnedIds(ids: Set<string>): void {
  try {
    localStorage.setItem(PIN_KEY, JSON.stringify([...ids]));
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Section header — 10px uppercase label
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
        "text-label uppercase text-text-ghost",
        collapsible && "cursor-pointer hover:text-text-tertiary",
        !collapsible && "cursor-default",
      )}
    >
      {collapsible &&
        (collapsed ? (
          <ChevronRightIcon size={10} className="text-text-ghost" />
        ) : (
          <ChevronDownIcon size={10} className="text-text-ghost" />
        ))}
      <span>{label}</span>
      {count != null && count > 0 && (
        <span className="text-label text-text-ghost ml-auto">{count}</span>
      )}
    </button>
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
// Tab control
// ---------------------------------------------------------------------------

type SidebarTab = "sessions" | "history" | "servers";

// ---------------------------------------------------------------------------
// Compact server list for sidebar (full view is in main content)
// ---------------------------------------------------------------------------

function SidebarServerList() {
  const [servers, setServers] = useState<{ pid: number; port: number; command: string; running: boolean }[]>([]);

  useEffect(() => {
    let active = true;
    const fetchServers = async () => {
      try {
        const res = await fetch("/api/dev-servers");
        if (res.ok && active) {
          setServers(await res.json());
        }
      } catch { /* best effort */ }
    };
    void fetchServers();
    const interval = setInterval(() => void fetchServers(), 5000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  if (servers.length === 0) {
    return (
      <div className="px-3 py-6 text-center">
        <p className="text-[10px] text-text-tertiary">No services detected</p>
        <p className="text-[10px] text-text-ghost mt-1">Start a dev server to see it here</p>
      </div>
    );
  }

  return (
    <div className="px-1 py-1 space-y-0.5">
      {servers.map((s) => (
        <div
          key={`${s.pid}-${s.port}`}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-bg-elevated/50 transition-all"
        >
          <span className="w-[5px] h-[5px] rounded-full bg-sessions shrink-0" />
          <span className="text-[10px] font-mono text-sessions font-medium shrink-0">
            :{s.port}
          </span>
          <span className="text-[10px] text-text-tertiary truncate flex-1 min-w-0">
            {s.command.split("/").pop() ?? s.command}
          </span>
        </div>
      ))}
    </div>
  );
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
  onDevServers?: (show?: boolean) => void;
}

export function SessionSidebar({
  onNewSession,
  onKillSession,
  onResumeSession,
  onRepoClick,
  onPR,
  onPush,
  onDevServers,
}: SessionSidebarProps) {
  const sessions = useSessionsStore((s) => s.sessions);
  const focusedId = useSessionsStore((s) => s.focusedId);
  const setFocused = useSessionsStore((s) => s.setFocused);

  const [activeTab, setActiveTab] = useState<SidebarTab>("sessions");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "idle">("all");
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => getPinnedIds());

  const togglePin = useCallback((id: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      savePinnedIds(next);
      return next;
    });
  }, []);

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

  // Paused sessions (idle status)
  const pausedSessions = useMemo(
    () => sessions.filter((s) => s.status === "idle" && s.meta?.group !== "room"),
    [sessions],
  );

  // Running sessions (active, building, starting)
  const runningSessions = useMemo(
    () =>
      activeSessions.filter(
        (s) => s.status === "active" || s.status === "building" || s.status === "starting",
      ),
    [activeSessions],
  );

  const handleResume = useCallback(
    async (session: Session) => {
      if (onResumeSession) {
        onResumeSession(session);
        return;
      }
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

  // Filter sessions by search + status filter, sort pinned to top
  const filteredRunning = useMemo(() => {
    if (statusFilter === "idle") return [];
    let list = runningSessions;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s) => s.name.toLowerCase().includes(q) || s.cwd.toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => {
      const ap = pinnedIds.has(a.id) ? 0 : 1;
      const bp = pinnedIds.has(b.id) ? 0 : 1;
      return ap - bp;
    });
  }, [runningSessions, searchQuery, pinnedIds, statusFilter]);

  const filteredPaused = useMemo(() => {
    if (statusFilter === "active") return [];
    let list = pausedSessions;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s) => s.name.toLowerCase().includes(q) || s.cwd.toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => {
      const ap = pinnedIds.has(a.id) ? 0 : 1;
      const bp = pinnedIds.has(b.id) ? 0 : 1;
      return ap - bp;
    });
  }, [pausedSessions, searchQuery, pinnedIds, statusFilter]);

  return (
    <div className="flex flex-col h-full">
      {/* Segmented tab nav */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex rounded-md bg-bg-input p-0.5">
          {(["sessions", "history", "servers"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                // Tell parent whether dev servers view should be shown
                onDevServers?.(tab === "servers");
              }}
              className={cn(
                "flex-1 px-2 py-1 text-[10px] font-medium rounded-[3px] transition-all",
                activeTab === tab
                  ? "bg-bg-elevated text-text-primary"
                  : "text-text-ghost hover:text-text-tertiary",
              )}
            >
              {tab === "sessions" ? "Sessions" : tab === "history" ? "History" : "Servers"}
            </button>
          ))}
        </div>
      </div>

      {/* Search bar */}
      <div className="px-3 pb-2">
        <div className="relative">
          <SearchIcon size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-ghost" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="w-full pl-7 pr-2 py-1.5 text-[10px] bg-bg-input border border-border-default rounded-md text-text-primary placeholder:text-text-ghost focus:outline-none focus:border-border-subtle transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-ghost hover:text-text-secondary transition-all"
              aria-label="Clear search"
            >
              <CloseIcon size={10} />
            </button>
          )}
        </div>
      </div>

      {/* Status filter chips — only show when there are both running and paused sessions */}
      {activeTab === "sessions" && (runningSessions.length > 0 && pausedSessions.length > 0) && (
        <div className="px-3 pb-2 flex items-center gap-1">
          {(["all", "active", "idle"] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={cn(
                "px-2 py-0.5 text-[9px] font-medium rounded-full transition-all",
                statusFilter === filter
                  ? "bg-sessions/15 text-sessions"
                  : "text-text-ghost hover:text-text-tertiary hover:bg-bg-elevated/50",
              )}
            >
              {filter === "all" ? "All" : filter === "active" ? "Running" : "Paused"}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {activeTab === "sessions" && (
          <>
            {/* RUNNING */}
            {(statusFilter === "all" || statusFilter === "active") && (
              <SectionHeader label="Running" count={filteredRunning.length} />
            )}
            {statusFilter !== "idle" && (
              <div className="px-1 pb-2 space-y-0.5">
                {filteredRunning.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    selected={session.id === focusedId}
                    onSelect={() => setFocused(session.id)}
                    onKill={() => onKillSession(session.id)}
                    pinned={pinnedIds.has(session.id)}
                    onTogglePin={() => togglePin(session.id)}
                  />
                ))}
                {filteredRunning.length === 0 && (
                  <div className="px-3 py-4 text-center">
                    <p className="text-[10px] text-text-tertiary">
                      No running sessions
                    </p>
                    <p className="text-[10px] text-text-ghost mt-1">
                      Click &ldquo;New Session&rdquo; below to get started
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* PAUSED */}
            {filteredPaused.length > 0 && (
              <>
                <SectionHeader label="Paused" count={filteredPaused.length} />
                <div className="px-1 pb-2 space-y-0.5">
                  {filteredPaused.map((session) => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      selected={session.id === focusedId}
                      onSelect={() => setFocused(session.id)}
                      onKill={() => onKillSession(session.id)}
                      onResume={() => handleResume(session)}
                      pinned={pinnedIds.has(session.id)}
                      onTogglePin={() => togglePin(session.id)}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
        {activeTab === "history" && (
          <>
            {historyGroups.length > 0 ? (
              historyGroups.map((group) => (
                <div key={group.label} className="px-1 pb-1">
                  <span className="block px-3 py-1 text-label uppercase text-text-ghost">
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
              ))
            ) : (
              <div className="px-3 py-8 text-center">
                <p className="text-[10px] text-text-secondary font-medium">No session history</p>
                <p className="text-[10px] text-text-tertiary mt-1">
                  Past sessions will appear here after they end
                </p>
              </div>
            )}
          </>
        )}
        {activeTab === "servers" && <SidebarServerList />}
      </div>

      {/* Bottom: Servers link + New Session button */}
      <div className="px-3 py-2 border-t border-border-default space-y-1.5">
        {onDevServers && (
          <button
            onClick={() => { setActiveTab("servers"); onDevServers(true); }}
            className="flex items-center gap-1.5 w-full px-2 py-1 text-[10px] text-text-tertiary hover:text-sessions transition-all rounded"
          >
            <span className="w-[5px] h-[5px] rounded-full bg-sessions shrink-0" />
            Dev Servers
          </button>
        )}
        <button
          onClick={onNewSession}
          className={cn(
            "flex items-center justify-center gap-1.5 w-full",
            "px-3 py-1.5 rounded-md",
            "text-[10px] font-medium",
            "bg-text-primary text-bg-base",
            "hover:bg-text-secondary active:scale-[0.98]",
            "transition-all",
          )}
          title="New Session (Cmd+Shift+N)"
        >
          <PlusIcon size={12} />
          New Session
          <kbd className="ml-auto text-[9px] font-mono opacity-40">
            {"\u21E7\u2318N"}
          </kbd>
        </button>
      </div>
    </div>
  );
}
