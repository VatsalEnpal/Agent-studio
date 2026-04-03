"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { wsClient } from "@/lib/ws-client";
import { useSessionsStore } from "@/stores/sessions";
import { useUIStore } from "@/stores/ui";
import { useGitStore } from "@/stores/git";
import { useRoomsStore } from "@/stores/rooms";
import type { RoomMessage, RoomAgent } from "@/stores/rooms";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard";
import { useNotifications } from "@/hooks/use-notifications";
import { useThemeSync } from "@/hooks/use-theme-sync";
import { useSessionUsage } from "@/hooks/use-usage";
import { initNotificationManager } from "@/lib/notification-manager";
import { onBadgeUpdate } from "@/lib/notification-manager";

import { NavRail, type NavPage } from "@/components/ui/nav-rail";
import { TopBar } from "@/components/ui/top-bar";
import { StatusBar } from "@/components/ui/status-bar";
import { SidebarShell } from "@/components/ui/sidebar-shell";
import { ConnectionBanner } from "@/components/ui/connection-banner";
import { ToastContainer } from "@/components/ui/notification-toast";
import { CommandPalette, type CommandItem } from "@/components/ui/command-palette";
import { ErrorBoundary } from "@/components/ui/error-boundary";

import { SessionSidebar } from "@/components/sessions/session-sidebar";
import { SessionLauncherV2 } from "@/components/sessions/session-launcher-v2";
import { GitView } from "@/components/sessions/git-view";
import { TerminalPaneV2 } from "@/components/terminal/terminal-pane-v2";

import { TeamsView } from "@/components/teams/teams-view";
import { RoomList } from "@/components/teams/room-list";
import { CreateRoomDialog } from "@/components/teams/create-room-dialog";

import { SprintsView } from "@/components/sprints/sprints-view";
import { SprintList } from "@/components/sprints/sprint-list";
import { useSprintsStore } from "@/stores/sprints";

import { MemoryView } from "@/components/memory/memory-view";
import { SettingsView } from "@/components/settings/settings-view";

import { PRModal } from "@/components/git/pr-modal";
import { Onboarding } from "@/components/setup/onboarding";

import { cn } from "@/lib/utils";
import type { Session, WsMessage, RepoStatus, ActiveMode } from "@/lib/types";
import { Terminal, MessageCircle, Play, Brain, Settings } from "lucide-react";

// ---------------------------------------------------------------------------
// Preflight types
// ---------------------------------------------------------------------------

interface PreflightCheck {
  claudeCode: {
    installed: boolean;
    version?: string;
    path?: string;
    authenticated?: boolean;
  };
  node: { installed: boolean; version: string };
  git: { installed: boolean; version?: string };
}

interface PreflightResult {
  ready: boolean;
  checks: PreflightCheck;
  blockers: string[];
}

// ---------------------------------------------------------------------------
// Focused session status bar adapter
// ---------------------------------------------------------------------------

function useFocusedSessionStatus() {
  const sessions = useSessionsStore((s) => s.sessions);
  const focusedId = useSessionsStore((s) => s.focusedId);
  const focused = sessions.find((s) => s.id === focusedId);
  const usage = useSessionUsage(focusedId);
  const repos = useGitStore((s) => s.repos);

  if (!focused) return null;

  const branch = repos.find((r) => focused.cwd.startsWith(r.path))?.branch;

  return {
    agent: focused.meta?.agent ?? focused.name,
    model: usage.modelShort ?? focused.meta?.model ?? "unknown",
    contextPercent: usage.contextPercent ?? focused.meta?.contextPercent ?? null,
    cost: usage.totalCost,
    lastActivity: focused.status,
    branch,
  };
}

// ---------------------------------------------------------------------------
// Page title map
// ---------------------------------------------------------------------------

const pageTitles: Record<ActiveMode, string> = {
  sessions: "Sessions",
  teams: "Teams",
  sprints: "Sprints",
  memory: "Knowledge",
  reports: "Sprints",
  settings: "Settings",
};

// ---------------------------------------------------------------------------
// ActiveMode ↔ NavPage mapping
// ---------------------------------------------------------------------------

const modeToNav: Record<ActiveMode, NavPage> = {
  sessions: "sessions",
  teams: "teams",
  sprints: "sprints",
  reports: "sprints",
  memory: "knowledge",
  settings: "settings",
};

const navToMode: Record<NavPage, ActiveMode> = {
  sessions: "sessions",
  teams: "teams",
  sprints: "reports",
  knowledge: "memory",
  settings: "settings",
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Home() {
  const [hydrated, setHydrated] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [defaultCwd, setDefaultCwd] = useState("~");
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(true);
  const [selectedRepo, setSelectedRepo] = useState<RepoStatus | null>(null);
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [navBadges, setNavBadges] = useState<Partial<Record<NavPage, number>>>({});
  const prevModeRef = useRef<ActiveMode | null>(null);

  useEffect(() => {
    setHydrated(true);
  }, []);

  // --- Stores ---
  const setSessions = useSessionsStore((s) => s.setSessions);
  const sessions = useSessionsStore((s) => s.sessions);
  const focusedId = useSessionsStore((s) => s.focusedId);
  const setRepos = useGitStore((s) => s.setRepos);
  const openPrModal = useGitStore((s) => s.openPrModal);

  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const launcherOpen = useUIStore((s) => s.launcherOpen);
  const setLauncherOpen = useUIStore((s) => s.setLauncherOpen);
  const activeMode = useUIStore((s) => s.activeMode);
  const setActiveMode = useUIStore((s) => s.setActiveMode);
  const theme = useUIStore((s) => s.theme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);
  const zoomLevels = useSessionsStore((s) => s.zoomLevels);

  const sprints = useSprintsStore((s) => s.sprints);
  const selectedSprintId = useSprintsStore((s) => s.selectedSprintId);
  const selectSprint = useSprintsStore((s) => s.selectSprint);

  // Hooks
  useKeyboardShortcuts();
  useThemeSync();
  useNotifications();

  // Status bar data
  const focusedStatus = useFocusedSessionStatus();

  // Active session count
  const activeSessionCount = useMemo(
    () => sessions.filter((s) => s.status !== "exited").length,
    [sessions],
  );

  // Track mode changes for crossfade animation
  const modeChanged = prevModeRef.current !== null && prevModeRef.current !== activeMode;
  useEffect(() => {
    prevModeRef.current = activeMode;
  }, [activeMode]);

  // --- Notification manager ---
  useEffect(() => {
    const cleanup = initNotificationManager();
    return cleanup;
  }, []);

  // --- Badge counts from notification manager ---
  useEffect(() => {
    const unsub = onBadgeUpdate((counts) => {
      setNavBadges((prev) => {
        const next: Partial<Record<NavPage, number>> = { ...prev };
        if (counts.rooms > 0) next.teams = counts.rooms;
        else delete next.teams;
        if (counts.sprints > 0) next.sprints = counts.sprints;
        else delete next.sprints;
        // Always show active session count
        if (activeSessionCount > 0) next.sessions = activeSessionCount;
        else delete next.sessions;
        return next;
      });
    });
    return unsub;
  }, [activeSessionCount]);

  // --- Preflight ---
  const runPreflight = useCallback(async () => {
    try {
      const res = await fetch("/api/system/preflight");
      if (res.ok) {
        const data = (await res.json()) as PreflightResult;
        setPreflight(data);
        return data.ready;
      }
    } catch {
      /* server not ready */
    }
    setPreflightLoading(false);
    return false;
  }, []);

  useEffect(() => {
    void (async () => {
      const ready = await runPreflight();
      if (ready) {
        try {
          const res = await fetch("/api/config");
          if (res.ok) {
            const data = (await res.json()) as {
              defaultCwd: string;
              config: {
                setupComplete: boolean;
                defaults: { workingDirectory: string };
              };
            };
            const cwd =
              data.config?.defaults?.workingDirectory ?? data.defaultCwd ?? "~";
            setDefaultCwd(cwd);
            if (data.config && !data.config.setupComplete) {
              setShowSetupWizard(true);
            }
          }
        } catch {
          /* use defaults */
        }
      }
      setPreflightLoading(false);
    })();
  }, [runPreflight]);

  // --- WebSocket ---
  useEffect(() => {
    const unsubSessions = wsClient.on("sessions-update", (msg: WsMessage) => {
      if (Array.isArray(msg.payload)) {
        setSessions(msg.payload as Session[]);
      }
    });

    const unsubGit = wsClient.on("git-update", (msg: WsMessage) => {
      if (Array.isArray(msg.payload)) {
        setRepos(msg.payload as RepoStatus[]);
      }
    });

    const unsubRoomMsg = wsClient.on("room-message", (msg: WsMessage) => {
      const roomMsg = msg.payload as RoomMessage;
      if (roomMsg?.roomId) {
        useRoomsStore.getState().addMessage(roomMsg.roomId, roomMsg);
      }
    });

    const unsubRoomStatus = wsClient.on(
      "room-agent-status",
      (msg: WsMessage) => {
        const payload = msg.payload as {
          roomId: string;
          agentId: string;
          status: RoomAgent["status"];
        };
        if (payload?.roomId) {
          useRoomsStore
            .getState()
            .updateAgentStatus(payload.roomId, payload.agentId, payload.status);
        }
      },
    );

    const unsubRoomApproval = wsClient.on("room-approval", (msg: WsMessage) => {
      const payload = msg.payload as {
        roomId: string;
        messageId: string;
        approved: boolean;
      };
      if (payload?.roomId) {
        useRoomsStore
          .getState()
          .updateApproval(payload.roomId, payload.messageId, payload.approved);
      }
    });

    const unsubRoomTyping = wsClient.on(
      "room-agent-typing",
      (msg: WsMessage) => {
        const payload = msg.payload as {
          roomId: string;
          agentId: string;
        };
        if (payload?.roomId) {
          useRoomsStore
            .getState()
            .setAgentTyping(payload.roomId, payload.agentId);
        }
      },
    );

    const unsubRoomStreaming = wsClient.on(
      "room-agent-streaming",
      (msg: WsMessage) => {
        const payload = msg.payload as {
          roomId: string;
          agentId: string;
          delta: string;
        };
        if (payload?.roomId) {
          useRoomsStore
            .getState()
            .appendStreamingDelta(
              payload.roomId,
              payload.agentId,
              payload.delta,
            );
        }
      },
    );

    wsClient.connect(`ws://${window.location.host}/ws`);

    return () => {
      unsubSessions();
      unsubGit();
      unsubRoomMsg();
      unsubRoomStatus();
      unsubRoomApproval();
      unsubRoomTyping();
      unsubRoomStreaming();
    };
  }, [setSessions, setRepos]);

  // --- Session creation ---
  const handleCreateSession = useCallback(
    async (config: {
      name: string;
      model: "opus" | "sonnet" | "haiku";
      agent: string;
      permissions: "bypass" | "default" | "plan" | "auto";
      channel: "none" | "telegram";
      cwd: string;
      resume?: string;
      continueSession?: boolean;
    }) => {
      let resolvedCwd = config.cwd;
      if (resolvedCwd.startsWith("~")) {
        try {
          const cfgRes = await fetch("/api/config");
          if (cfgRes.ok) {
            const cfg = (await cfgRes.json()) as {
              homeDir: string;
              cwd: string;
            };
            resolvedCwd = resolvedCwd.replace("~", cfg.homeDir);
          }
        } catch {
          // Fall through
        }
      }

      const args: string[] = [];

      if (config.continueSession) {
        args.push("--continue", "--dangerously-skip-permissions");
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "continue-last",
            command: "claude",
            args,
            cwd: resolvedCwd,
            meta: {
              model: config.model,
              agent: "continued",
              permissions: "bypass",
              channel: "none",
              group: "standalone",
            },
          }),
        });
        if (!res.ok)
          throw new Error(`Failed to continue session (${res.status})`);
        return;
      }

      if (config.resume) {
        args.push("--resume", config.resume, "--dangerously-skip-permissions");
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: config.name || `resume-${config.resume.slice(0, 8)}`,
            command: "claude",
            args,
            cwd: resolvedCwd,
            meta: {
              model: config.model,
              agent: "resumed",
              permissions: "bypass",
              channel: "none",
              group: "standalone",
            },
          }),
        });
        if (!res.ok)
          throw new Error(`Failed to resume session (${res.status})`);
        return;
      }

      if (config.permissions === "bypass") {
        args.push("--dangerously-skip-permissions");
      }
      args.push("--model", config.model);
      if (config.agent !== "none") {
        args.push("--agent", config.agent);
      }

      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:
            config.agent !== "none"
              ? config.agent
              : `claude-${config.model}`,
          command: "claude",
          args: args.length > 0 ? args : ["--dangerously-skip-permissions"],
          cwd: resolvedCwd,
          meta: {
            model: config.model,
            agent: config.agent,
            permissions: config.permissions,
            channel: config.channel,
            group:
              config.agent === "orchestrator" ? "sprint" : "standalone",
          },
        }),
      });

      if (!res.ok)
        throw new Error(`Failed to create session (${res.status})`);
    },
    [],
  );

  const handleKillSession = useCallback(async (sessionId: string) => {
    await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
  }, []);

  const handlePush = useCallback(async (repo: RepoStatus) => {
    await fetch("/api/git/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: repo.path }),
    });
  }, []);

  // --- Navigation ---
  const handleNavigate = useCallback(
    (page: NavPage) => {
      setActiveMode(navToMode[page]);
      if (page !== "sessions") setSelectedRepo(null);
    },
    [setActiveMode],
  );

  // --- Command palette items ---
  const commandItems: CommandItem[] = useMemo(() => {
    const items: CommandItem[] = [];

    // Add sessions as searchable items
    for (const session of sessions) {
      items.push({
        id: `session-${session.id}`,
        label: session.name,
        category: "sessions",
        icon: Terminal,
        keywords: [session.meta?.agent ?? "", session.meta?.model ?? "", session.cwd],
        onSelect: () => {
          setActiveMode("sessions");
          useSessionsStore.getState().setFocused(session.id);
          useUIStore.getState().setCommandPaletteOpen(false);
        },
      });
    }

    // Add sprints
    for (const sprint of sprints) {
      items.push({
        id: `sprint-${sprint.id}`,
        label: sprint.name,
        category: "sprints",
        icon: Play,
        keywords: [sprint.status],
        onSelect: () => {
          setActiveMode("reports");
          selectSprint(sprint.id);
          useUIStore.getState().setCommandPaletteOpen(false);
        },
      });
    }

    return items;
  }, [sessions, sprints, setActiveMode, selectSprint]);

  // --- Loading / Preflight / Setup ---
  if (!hydrated || preflightLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-canvas">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 border-2 border-text-tertiary/30 border-t-accent rounded-full animate-spin" />
          <span className="text-label-xs text-text-tertiary">
            Loading Agent Studio...
          </span>
        </div>
      </div>
    );
  }

  if (preflight && !preflight.ready) {
    return (
      <div className="h-screen flex items-center justify-center bg-canvas">
        <div className="text-center space-y-4">
          <p className="text-title-md text-text-emphasis">
            Agent Studio needs Claude Code
          </p>
          <p className="text-body-sm text-text-secondary max-w-sm">
            Please install and authenticate Claude Code to continue.
          </p>
          <button
            onClick={() => {
              setPreflightLoading(true);
              void runPreflight().then(() => setPreflightLoading(false));
            }}
            className="px-4 py-2 bg-accent text-white rounded-lg text-body-sm font-medium hover:bg-accent-hover transition-colors"
          >
            Check Again
          </button>
        </div>
      </div>
    );
  }

  if (showSetupWizard) {
    return (
      <Onboarding
        onComplete={() => {
          setShowSetupWizard(false);
          void (async () => {
            try {
              const res = await fetch("/api/config");
              if (res.ok) {
                const data = (await res.json()) as {
                  defaultCwd: string;
                  config: { defaults: { workingDirectory: string } };
                };
                setDefaultCwd(
                  data.config?.defaults?.workingDirectory ??
                    data.defaultCwd ??
                    "~",
                );
              }
            } catch {
              /* ignore */
            }
          })();
        }}
      />
    );
  }

  // --- Derived state ---
  const currentNavPage: NavPage = modeToNav[activeMode];
  const nonRoomSessions = sessions.filter((s) => s.meta?.group !== "room");
  const showGitView = activeMode === "sessions" && selectedRepo != null;

  // Crossfade class for mode transitions
  const crossfadeClass = modeChanged ? "animate-page-crossfade" : "";

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Connection status banner */}
      <ConnectionBanner />

      <div className="flex flex-1 min-h-0">
        {/* Nav rail */}
        <NavRail
          activePage={currentNavPage}
          onNavigate={handleNavigate}
          badges={navBadges}
        />

        {/* Sidebar — content switches based on active mode */}
        <SidebarShell collapsed={!sidebarOpen}>
          {activeMode === "sessions" && (
            <SessionSidebar
              onNewSession={() => setLauncherOpen(true)}
              onKillSession={handleKillSession}
              onRepoClick={(repo) => setSelectedRepo(repo)}
              onPR={(repo) => openPrModal(repo)}
              onPush={handlePush}
            />
          )}
          {activeMode === "teams" && (
            <RoomList onCreateRoom={() => setCreateRoomOpen(true)} />
          )}
          {activeMode === "reports" && (
            <SprintList
              sprints={sprints}
              selectedSprintId={selectedSprintId}
              onSelect={selectSprint}
            />
          )}
          {activeMode === "settings" && (
            <div className="px-3 py-2.5">
              <h3 className="text-label-xs text-text-secondary uppercase tracking-wider">
                Settings
              </h3>
            </div>
          )}
        </SidebarShell>

        {/* Main content area */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          {/* Top bar */}
          <TopBar
            title={pageTitles[activeMode]}
            activeSessionCount={activeSessionCount}
            theme={theme}
            onToggleTheme={toggleTheme}
          />

          {/* Content area with page crossfade */}
          <main className={cn("flex-1 min-w-0 min-h-0", crossfadeClass)} key={activeMode}>
            {/* Sessions mode — terminal or git view */}
            {activeMode === "sessions" && (
              <div className="h-full">
                {showGitView && selectedRepo ? (
                  <ErrorBoundary fallbackLabel="Git view error">
                    <GitView
                      repo={selectedRepo}
                      onBack={() => setSelectedRepo(null)}
                    />
                  </ErrorBoundary>
                ) : nonRoomSessions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-6">
                    <div className="text-center space-y-3">
                      <p className="text-title-md text-text-emphasis">
                        Ready to go.
                      </p>
                      <p className="text-body-sm text-text-tertiary max-w-sm">
                        Launch a session to start working with Claude. Press{" "}
                        <kbd className="px-1.5 py-0.5 rounded bg-surface text-text-secondary text-label-xs border border-border-subtle">
                          Cmd+N
                        </kbd>{" "}
                        for the launcher.
                      </p>
                    </div>
                    <button
                      onClick={() => setLauncherOpen(true)}
                      className={cn(
                        "px-5 py-3 rounded-lg",
                        "text-body-sm font-medium",
                        "bg-accent text-white hover:bg-accent-hover",
                        "transition-colors duration-[var(--duration-quick)]",
                      )}
                    >
                      New Session
                    </button>
                  </div>
                ) : (
                  <ErrorBoundary fallbackLabel="Terminal error">
                    <TerminalPaneV2
                      sessionId={focusedId ?? nonRoomSessions[0].id}
                      visible={activeMode === "sessions" && !showGitView}
                      fontSize={
                        focusedId ? zoomLevels[focusedId] ?? 13 : 13
                      }
                    />
                  </ErrorBoundary>
                )}
              </div>
            )}

            {/* Teams */}
            <div className={activeMode === "teams" ? "h-full" : "hidden"}>
              <ErrorBoundary fallbackLabel="Teams view error">
                <TeamsView />
              </ErrorBoundary>
            </div>

            {/* Sprints */}
            <div className={activeMode === "reports" ? "h-full" : "hidden"}>
              <ErrorBoundary fallbackLabel="Sprints view error">
                <SprintsView />
              </ErrorBoundary>
            </div>

            {/* Memory / Knowledge */}
            <div className={activeMode === "memory" ? "h-full" : "hidden"}>
              <ErrorBoundary fallbackLabel="Memory view error">
                <MemoryView />
              </ErrorBoundary>
            </div>

            {/* Settings */}
            <div className={activeMode === "settings" ? "h-full" : "hidden"}>
              <ErrorBoundary fallbackLabel="Settings view error">
                <SettingsView />
              </ErrorBoundary>
            </div>
          </main>

          {/* Status bar */}
          <StatusBar session={focusedStatus} />
        </div>
      </div>

      {/* Session launcher */}
      <SessionLauncherV2
        open={launcherOpen}
        onOpenChange={setLauncherOpen}
        onLaunch={handleCreateSession}
      />

      {/* Command palette */}
      <CommandPalette items={commandItems} />

      {/* Create room dialog */}
      {createRoomOpen && (
        <CreateRoomDialog
          open={createRoomOpen}
          onOpenChange={setCreateRoomOpen}
        />
      )}

      {/* PR Modal */}
      <PRModal />

      {/* Toast notifications */}
      <ToastContainer />
    </div>
  );
}
