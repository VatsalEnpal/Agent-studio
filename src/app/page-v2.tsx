"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { wsClient, type ConnectionState } from "@/lib/ws-client";
import { useSessionsStore } from "@/stores/sessions";
import { useUIStore } from "@/stores/ui";
import { useGitStore } from "@/stores/git";
import { useRoomsStore } from "@/stores/rooms";
import type { RoomMessage, RoomAgent } from "@/stores/rooms";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard";
import { useNotifications } from "@/hooks/use-notifications";
import { useThemeSync } from "@/hooks/use-theme-sync";
import { useSessionUsage } from "@/hooks/use-usage";

import { NavRail, type NavPage } from "@/components/ui/nav-rail";
import { TopBar } from "@/components/ui/top-bar";
import { StatusBar } from "@/components/ui/status-bar";
import { SidebarShell } from "@/components/ui/sidebar-shell";

import { SessionSidebar } from "@/components/sessions/session-sidebar";
import { SessionLauncherV2 } from "@/components/sessions/session-launcher-v2";
import { GitView } from "@/components/sessions/git-view";
import { TerminalPaneV2 } from "@/components/terminal/terminal-pane-v2";

import { TeamsView } from "@/components/teams/teams-view";
import { SprintsView } from "@/components/sprints/sprints-view";
import { SprintList } from "@/components/sprints/sprint-list";
import { useSprintsStore } from "@/stores/sprints";
import { MemoryView } from "@/components/memory/memory-view";
import { SettingsView } from "@/components/settings/settings-view";
import { ReportsView } from "@/components/reports/reports-view";
import { CommandPalette } from "@/components/layout/command-palette";
import { PRModal } from "@/components/git/pr-modal";
import { ToastContainer } from "@/components/ui/toast";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { Onboarding } from "@/components/setup/onboarding";

import { cn } from "@/lib/utils";
import type { Session, WsMessage, RepoStatus } from "@/lib/types";

// ---------------------------------------------------------------------------
// Connection banner
// ---------------------------------------------------------------------------

function ConnectionBanner() {
  const [connState, setConnState] = useState<ConnectionState>("connecting");
  const [showConnected, setShowConnected] = useState(false);

  useEffect(() => {
    setConnState(wsClient.getConnectionState());
    return wsClient.onConnectionChange((state) => {
      setConnState(state);
      if (state === "connected") {
        setShowConnected(true);
        const timer = setTimeout(() => setShowConnected(false), 2000);
        return () => clearTimeout(timer);
      }
    });
  }, []);

  if (connState === "reconnecting") {
    return (
      <div className="bg-warning/20 border-b border-warning/40 px-4 py-1.5 text-center text-label-xs text-warning animate-pulse shrink-0">
        Reconnecting to server...
      </div>
    );
  }

  if (showConnected) {
    return (
      <div className="bg-success/10 border-b border-success/20 px-4 py-1.5 text-center text-label-xs text-success shrink-0 transition-opacity duration-500">
        Connected
      </div>
    );
  }

  return null;
}

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
// Main page
// ---------------------------------------------------------------------------

export default function PageV2() {
  const [hydrated, setHydrated] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [defaultCwd, setDefaultCwd] = useState("~");
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(true);
  const [selectedRepo, setSelectedRepo] = useState<RepoStatus | null>(null);

  useEffect(() => {
    setHydrated(true);
  }, []);

  // --- Stores ---
  const setSessions = useSessionsStore((s) => s.setSessions);
  const sessions = useSessionsStore((s) => s.sessions);
  const focusedId = useSessionsStore((s) => s.focusedId);
  const setFocused = useSessionsStore((s) => s.setFocused);
  const setRepos = useGitStore((s) => s.setRepos);
  const openPrModal = useGitStore((s) => s.openPrModal);

  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const launcherOpen = useUIStore((s) => s.launcherOpen);
  const setLauncherOpen = useUIStore((s) => s.setLauncherOpen);
  const commandPaletteOpen = useUIStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);
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
        if (!res.ok) throw new Error(`Failed to continue session (${res.status})`);
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
        if (!res.ok) throw new Error(`Failed to resume session (${res.status})`);
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
          name: config.agent !== "none" ? config.agent : `claude-${config.model}`,
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

      if (!res.ok) throw new Error(`Failed to create session (${res.status})`);
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

  // Map NavPage to ActiveMode
  const handleNavigate = useCallback(
    (page: NavPage) => {
      const modeMap: Record<NavPage, string> = {
        sessions: "sessions",
        teams: "teams",
        sprints: "sprints",
        knowledge: "memory",
        settings: "settings",
      };
      setActiveMode(
        (modeMap[page] ?? "sessions") as Parameters<typeof setActiveMode>[0],
      );
      // Clear git view when switching modes
      if (page !== "sessions") setSelectedRepo(null);
    },
    [setActiveMode],
  );

  // When a session card is clicked, clear git view
  const handleSessionSelect = useCallback(() => {
    setSelectedRepo(null);
  }, []);

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
    // Use the existing v1 preflight blocker for now — other agent may replace
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
            className="px-4 py-2 bg-accent text-white rounded-lg text-body-sm font-medium hover:bg-accent-hover transition-all"
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

  // --- Current nav page from activeMode ---
  const currentNavPage: NavPage | null =
    activeMode === "reports"
      ? null
      : activeMode === "memory"
        ? "knowledge"
        : activeMode === "sessions" ||
            activeMode === "teams" ||
            activeMode === "sprints" ||
            activeMode === "settings"
          ? (activeMode as NavPage)
          : null;

  // Find the focused session for terminal
  const focusedSession = sessions.find((s) => s.id === focusedId);
  const nonRoomSessions = sessions.filter(
    (s) => s.meta?.group !== "room",
  );
  const showTerminal = activeMode === "sessions" && !selectedRepo;
  const showGitView = activeMode === "sessions" && selectedRepo != null;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <ConnectionBanner />

      <div className="flex flex-1 min-h-0">
        {/* Nav rail */}
        <NavRail
          activePage={currentNavPage}
          onNavigate={handleNavigate}
          badges={{
            sessions: activeSessionCount > 0 ? activeSessionCount : undefined,
          }}
        />

        {/* Sidebar */}
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
          {activeMode === "sprints" && (
            <SprintList
              sprints={sprints}
              selectedSprintId={selectedSprintId}
              onSelect={selectSprint}
            />
          )}
        </SidebarShell>

        {/* Main content area */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          {/* Top bar */}
          <TopBar />

          {/* Content */}
          <main className="flex-1 min-w-0 min-h-0">
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
                  <div className="flex flex-col items-center justify-center h-full gap-6 animate-tab-enter">
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
                        "transition-all duration-[var(--duration-quick)]",
                      )}
                    >
                      New Session
                    </button>
                  </div>
                ) : (
                  <ErrorBoundary fallbackLabel="Terminal error">
                    <TerminalPaneV2
                      sessionId={focusedId ?? nonRoomSessions[0].id}
                      visible={showTerminal}
                      fontSize={
                        focusedId
                          ? zoomLevels[focusedId] ?? 13
                          : 13
                      }
                    />
                  </ErrorBoundary>
                )}
              </div>
            )}

            {/* Other modes — use hidden/block for persistence */}
            <div className={activeMode === "teams" ? "h-full" : "hidden"}>
              <ErrorBoundary fallbackLabel="Teams view error">
                <TeamsView />
              </ErrorBoundary>
            </div>
            <div className={activeMode === "sprints" ? "h-full" : "hidden"}>
              <ErrorBoundary fallbackLabel="Sprints view error">
                <SprintsView />
              </ErrorBoundary>
            </div>
            <div className={activeMode === "memory" ? "h-full" : "hidden"}>
              <ErrorBoundary fallbackLabel="Memory view error">
                <MemoryView />
              </ErrorBoundary>
            </div>
            <div className={activeMode === "reports" ? "h-full" : "hidden"}>
              <ErrorBoundary fallbackLabel="Reports view error">
                <ReportsView />
              </ErrorBoundary>
            </div>
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

      {/* Launcher */}
      <SessionLauncherV2
        open={launcherOpen}
        onOpenChange={setLauncherOpen}
        onLaunch={handleCreateSession}
      />

      {/* Command palette */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onNewSession={() => setLauncherOpen(true)}
        onKillSession={handleKillSession}
      />

      {/* PR Modal */}
      <PRModal />

      {/* Toasts */}
      <ToastContainer />
    </div>
  );
}
