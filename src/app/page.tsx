"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { wsClient } from "@/lib/ws-client";
import { useSessionsStore } from "@/stores/sessions";
import { useUIStore } from "@/stores/ui";
import { useGitStore } from "@/stores/git";
import { useRoomsStore } from "@/stores/rooms";
import type { RoomMessage, RoomAgent } from "@/stores/rooms";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard";
import { useNotifications } from "@/hooks/use-notifications";
import { useThemeSync } from "@/hooks/use-theme-sync";
import { useContextWarning } from "@/hooks/use-context-warning";
import { useUsage } from "@/hooks/use-usage";
import { useMemoryStore } from "@/stores/memory";
import { initNotificationManager } from "@/lib/notification-manager";
import { onBadgeUpdate } from "@/lib/notification-manager";

import { NavRail, type NavPage } from "@/components/ui/nav-rail";
import { TitleBar } from "@/components/ui/top-bar";
import { SidebarShell } from "@/components/ui/sidebar-shell";
import { ConnectionBanner } from "@/components/ui/connection-banner";
import { ToastContainer } from "@/components/ui/notification-toast";
import { CommandPalette, type CommandItem } from "@/components/ui/command-palette";
import { ErrorBoundary } from "@/components/ui/error-boundary";

import { SessionSidebar } from "@/components/sessions/session-sidebar";
import { SessionLauncherV2 } from "@/components/sessions/session-launcher-v2";
import { GitView } from "@/components/sessions/git-view";
import { TerminalPaneV2 } from "@/components/terminal/terminal-pane-v2";
import { SessionStatsBar } from "@/components/terminal/session-stats-bar";

import { TeamsView } from "@/components/teams/teams-view";
import { RoomList } from "@/components/teams/room-list";
import { CreateRoomDialog } from "@/components/teams/create-room-dialog";

import { SprintsView } from "@/components/sprints/sprints-view";
import { SprintList } from "@/components/sprints/sprint-list";
import { useSprintsStore } from "@/stores/sprints";

import { MemoryView } from "@/components/memory/memory-view";
import { ReportsView } from "@/components/reports/reports-view";
import { SettingsView } from "@/components/settings/settings-view";
import { DevServersView } from "@/components/dev-servers/dev-servers-view";

import { PRModal } from "@/components/git/pr-modal";
import { Onboarding } from "@/components/setup/onboarding";

import { cn } from "@/lib/utils";
import type { Session, WsMessage, RepoStatus, ActiveMode } from "@/lib/types";
import {
  SessionsIcon,
  SprintsIcon,
} from "@/components/ui/icons";

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
// ActiveMode ↔ NavPage mapping
// ---------------------------------------------------------------------------

const modeToNav: Record<ActiveMode, NavPage | null> = {
  sessions: "sessions",
  teams: "teams",
  sprints: "sprints",
  reports: null,
  memory: "knowledge",
  settings: "settings",
};

const navToMode: Record<NavPage, ActiveMode> = {
  sessions: "sessions",
  teams: "teams",
  sprints: "sprints",
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
  const [showDevServers, setShowDevServers] = useState(false);
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [navBadges, setNavBadges] = useState<Partial<Record<NavPage, number>>>({});

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
  const zoomLevels = useSessionsStore((s) => s.zoomLevels);

  const sprints = useSprintsStore((s) => s.sprints);
  const selectedSprintId = useSprintsStore((s) => s.selectedSprintId);
  const selectSprint = useSprintsStore((s) => s.selectSprint);

  const memoryEntryCount = useMemoryStore((s) =>
    s.entries.filter((e) => !e.superseded_by).length,
  );

  // Hooks
  useKeyboardShortcuts();
  useThemeSync();
  useNotifications();
  useContextWarning();
  const usageData = useUsage();

  // Active session count
  const activeSessionCount = useMemo(
    () => sessions.filter((s) => s.status !== "exited").length,
    [sessions],
  );

  // Total cost across all managed sessions
  const totalCost = useMemo(() => {
    let sum = 0;
    for (const u of Object.values(usageData.managed)) {
      sum += u.totalCost;
    }
    return sum;
  }, [usageData.managed]);

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
        // Memory entry count
        if (memoryEntryCount > 0) next.knowledge = memoryEntryCount;
        else delete next.knowledge;
        return next;
      });
    });
    return unsub;
  }, [activeSessionCount, memoryEntryCount]);

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

    const unsubRoomNeedsUser = wsClient.on(
      "room-needs-user",
      (msg: WsMessage) => {
        const payload = msg.payload as { roomId: string };
        if (payload?.roomId) {
          useRoomsStore.getState().setWaitingForUser(payload.roomId);
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
      unsubRoomNeedsUser();
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

      // Auto-name: combine agent + project directory for distinguishable names
      const cwdBasename = resolvedCwd.split("/").filter(Boolean).pop() ?? "session";
      let autoName: string;
      if (config.name) {
        autoName = config.name;
      } else if (config.agent !== "none") {
        autoName = `${config.agent} \u00b7 ${cwdBasename}`;
      } else {
        autoName = cwdBasename;
      }

      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: autoName,
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
      if (page !== "sessions") {
        setSelectedRepo(null);
        setShowDevServers(false);
      }
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
        icon: SessionsIcon,
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
        icon: SprintsIcon,
        keywords: [sprint.status],
        onSelect: () => {
          setActiveMode("sprints");
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
        <div className="text-center space-y-3">
          <p className="text-xs font-medium text-text-primary">
            Agent Studio needs Claude Code
          </p>
          <p className="text-xs text-text-secondary max-w-sm">
            Please install and authenticate Claude Code to continue.
          </p>
          <button
            onClick={() => {
              setPreflightLoading(true);
              void runPreflight().then(() => setPreflightLoading(false));
            }}
            className="px-2.5 py-1 bg-accent text-white rounded-md text-xs font-medium hover:bg-accent-hover transition-all"
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
  const currentNavPage: NavPage | null = modeToNav[activeMode];
  const nonRoomSessions = sessions.filter((s) => s.meta?.group !== "room");
  const showGitView = activeMode === "sessions" && selectedRepo != null;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-bg-base">
      {/* Connection status banner */}
      <ConnectionBanner />

      {/* Title bar — full width across top */}
      <TitleBar
        sessionName={focusedId ? sessions.find((s) => s.id === focusedId)?.name : undefined}
        sessionCount={activeSessionCount}
        totalCost={totalCost}
      />

      {/* Main 3-column layout below title bar */}
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
              onDevServers={(show) => setShowDevServers(show ?? false)}
            />
          )}
          {activeMode === "teams" && (
            <RoomList onCreateRoom={() => setCreateRoomOpen(true)} />
          )}
          {activeMode === "sprints" && (
            <SprintList
              sprints={sprints}
              selectedSprintId={selectedSprintId}
              onSelect={selectSprint}
            />
          )}
          {activeMode === "memory" && (
            <div className="px-3 py-2.5">
              <h3 className="text-label uppercase tracking-wider text-text-ghost">
                Memory
              </h3>
            </div>
          )}
          {activeMode === "reports" && (
            <div className="px-3 py-2.5">
              <h3 className="text-label uppercase tracking-wider text-text-ghost">
                Reports
              </h3>
              <p className="text-2xs text-text-tertiary mt-1 leading-snug">
                Automation output and approvals. Configure schedules in Settings.
              </p>
            </div>
          )}
          {activeMode === "settings" && (
            <div className="px-3 py-2.5">
              <h3 className="text-label uppercase tracking-wider text-text-ghost">
                Settings
              </h3>
            </div>
          )}
        </SidebarShell>

        {/* Main content area */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0 bg-bg-base">
          {/* Content area — all pages stay mounted, toggled via CSS.
              Sessions uses absolute positioning instead of display:none
              so the terminal container always has real dimensions (xterm
              needs a measurable container or it renders a black screen). */}
          <main className="flex-1 min-w-0 min-h-0 relative">
            {/* Sessions mode — terminal or git view. */}
            <div
              className={cn(
                "absolute inset-0",
                activeMode === "sessions"
                  ? "visible z-10"
                  : "invisible z-0 pointer-events-none",
              )}
            >
              {/* Dev servers overlay — shown above terminal, doesn't unmount it */}
              {showDevServers && (
                <div className="absolute inset-0 z-20">
                  <ErrorBoundary fallbackLabel="Dev Servers error">
                    <DevServersView />
                  </ErrorBoundary>
                </div>
              )}

              {/* Git view overlay */}
              {showGitView && selectedRepo && (
                <div className="absolute inset-0 z-20">
                  <ErrorBoundary fallbackLabel="Git view error">
                    <GitView
                      repo={selectedRepo}
                      onBack={() => setSelectedRepo(null)}
                    />
                  </ErrorBoundary>
                </div>
              )}

              {/* Terminal or empty state.
                  The empty state only renders when sessions mode is active —
                  it has no xterm container that needs to stay mounted, so
                  hiding it via conditional render prevents it from bleeding
                  through to other tabs (the wrapper uses visibility:hidden
                  instead of display:none to keep xterm measurable, but the
                  empty state has no such requirement). */}
              {nonRoomSessions.length === 0 ? (
                activeMode === "sessions" ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4">
                    <div className="text-center space-y-2">
                      <p className="text-xs font-medium text-text-secondary">
                        Ready to go.
                      </p>
                      <p className="text-xs text-text-tertiary max-w-sm">
                        Launch a session to start working with Claude. Press{" "}
                        <kbd className="px-1 py-0.5 rounded-[3px] bg-bg-input text-text-ghost text-2xs border border-border-default">
                          Cmd+N
                        </kbd>{" "}
                        for the launcher.
                      </p>
                    </div>
                    <button
                      onClick={() => setLauncherOpen(true)}
                      className={cn(
                        "px-4 py-1.5 rounded-[4px]",
                        "text-xs font-medium",
                        "bg-text-primary text-bg-base",
                        "hover:bg-text-secondary",
                        "transition-all duration-150",
                      )}
                    >
                      New Session
                    </button>
                  </div>
                ) : null
              ) : (
                <ErrorBoundary fallbackLabel="Terminal error">
                  <div className="flex flex-col h-full">
                    <SessionStatsBar sessionId={focusedId ?? nonRoomSessions[0].id} />
                    <TerminalPaneV2
                      sessionId={focusedId ?? nonRoomSessions[0].id}
                      visible={activeMode === "sessions" && !showGitView && !showDevServers}
                      fontSize={
                        focusedId ? zoomLevels[focusedId] ?? 13 : 13
                      }
                    />
                  </div>
                </ErrorBoundary>
              )}
            </div>

            {/* Teams */}
            <div className={activeMode === "teams" ? "absolute inset-0 z-10 animate-page-crossfade" : "hidden"}>
              <ErrorBoundary fallbackLabel="Teams view error">
                <TeamsView />
              </ErrorBoundary>
            </div>

            {/* Sprints */}
            <div className={activeMode === "sprints" ? "absolute inset-0 z-10 animate-page-crossfade" : "hidden"}>
              <ErrorBoundary fallbackLabel="Sprints view error">
                <SprintsView />
              </ErrorBoundary>
            </div>

            {/* Memory */}
            <div className={activeMode === "memory" ? "absolute inset-0 z-10 animate-page-crossfade" : "hidden"}>
              <ErrorBoundary fallbackLabel="Memory view error">
                <MemoryView />
              </ErrorBoundary>
            </div>

            {/* Reports (scheduled automations) */}
            <div className={activeMode === "reports" ? "absolute inset-0 z-10 animate-page-crossfade" : "hidden"}>
              <ErrorBoundary fallbackLabel="Reports view error">
                <ReportsView />
              </ErrorBoundary>
            </div>

            {/* Settings */}
            <div className={activeMode === "settings" ? "absolute inset-0 z-10 animate-page-crossfade" : "hidden"}>
              <ErrorBoundary fallbackLabel="Settings view error">
                <SettingsView />
              </ErrorBoundary>
            </div>
          </main>
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
