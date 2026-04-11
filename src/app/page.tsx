"use client";

import { useState, useEffect, useCallback } from "react";
import { wsClient, type ConnectionState } from "@/lib/ws-client";
import { useSessionsStore } from "@/stores/sessions";
import { useUIStore } from "@/stores/ui";
import { useGitStore } from "@/stores/git";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard";
import { useNotifications } from "@/hooks/use-notifications";
import { useThemeSync } from "@/hooks/use-theme-sync";
import { ToggleBar } from "@/components/layout/toggle-bar";
import { Sidebar } from "@/components/layout/sidebar";
import { BottomBar } from "@/components/layout/bottom-bar";
import { TerminalGrid } from "@/components/terminal/terminal-grid";
import { SessionLauncher } from "@/components/sessions/session-launcher";
import { CommandPalette } from "@/components/layout/command-palette";
import { TeamsView } from "@/components/teams/teams-view";
import { MemoryView } from "@/components/memory/memory-view";
import { SettingsView } from "@/components/settings/settings-view";
import { PRModal } from "@/components/git/pr-modal";
import { ToastContainer } from "@/components/ui/toast";

import { ErrorBoundary } from "@/components/ui/error-boundary";
import { SetupWizard } from "@/components/setup/setup-wizard";
import { useRoomsStore } from "@/stores/rooms";
import type { RoomMessage, RoomAgent } from "@/stores/rooms";
import type { Session, WsMessage, RepoStatus } from "@/lib/types";
import { PanelLeftOpen } from "lucide-react";

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
      <div className="bg-yellow-500/20 border-b border-yellow-500/40 px-4 py-1.5 text-center text-xs text-yellow-400 animate-pulse shrink-0">
        Reconnecting to server...
      </div>
    );
  }

  if (showConnected) {
    return (
      <div className="bg-console-success/15 border-b border-console-success/30 px-4 py-1.5 text-center text-xs text-console-success shrink-0 transition-opacity duration-500">
        Connected
      </div>
    );
  }

  return null;
}

export default function Home() {
  const [hydrated, setHydrated] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [defaultCwd, setDefaultCwd] = useState("~");
  useEffect(() => { setHydrated(true); }, []);
  useThemeSync();

  // Fetch config from server to get default cwd and setup status
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/config");
        if (!res.ok) return;
        const data = await res.json() as { defaultCwd: string; config: { setupComplete: boolean; defaults: { workingDirectory: string } } };
        const cwd = data.config?.defaults?.workingDirectory ?? data.defaultCwd ?? "~";
        setDefaultCwd(cwd);
        if (data.config && !data.config.setupComplete) {
          setShowSetupWizard(true);
        }
      } catch { /* use defaults */ }
    })();
  }, []);

  const setSessions = useSessionsStore((s) => s.setSessions);
  const setRepos = useGitStore((s) => s.setRepos);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const launcherOpen = useUIStore((s) => s.launcherOpen);
  const setLauncherOpen = useUIStore((s) => s.setLauncherOpen);
  const commandPaletteOpen = useUIStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const activeMode = useUIStore((s) => s.activeMode);

  // Keyboard shortcuts
  useKeyboardShortcuts();

  // Dynamic favicon + tab title + exit toasts
  useNotifications();

  // WebSocket connection
  useEffect(() => {
    const unsubSessions = wsClient.on(
      "sessions-update",
      (msg: WsMessage) => {
        if (Array.isArray(msg.payload)) {
          setSessions(msg.payload as Session[]);
        }
      },
    );

    const unsubGit = wsClient.on(
      "git-update",
      (msg: WsMessage) => {
        if (Array.isArray(msg.payload)) {
          setRepos(msg.payload as RepoStatus[]);
        }
      },
    );

    const addRoomMessage = useRoomsStore.getState().addMessage;
    const updateAgentStatus = useRoomsStore.getState().updateAgentStatus;
    const updateApproval = useRoomsStore.getState().updateApproval;

    const unsubRoomMsg = wsClient.on("room-message", (msg: WsMessage) => {
      const payload = msg.payload as RoomMessage;
      if (payload?.roomId) {
        addRoomMessage(payload.roomId, payload);
      }
    });

    const unsubRoomStatus = wsClient.on("room-agent-status", (msg: WsMessage) => {
      const payload = msg.payload as { roomId: string; agentId: string; status: RoomAgent["status"] };
      if (payload?.roomId) {
        updateAgentStatus(payload.roomId, payload.agentId, payload.status);
      }
    });

    const unsubRoomApproval = wsClient.on("room-approval", (msg: WsMessage) => {
      const payload = msg.payload as { roomId: string; messageId: string; approved: boolean };
      if (payload?.roomId) {
        updateApproval(payload.roomId, payload.messageId, payload.approved);
      }
    });

    wsClient.connect(`ws://${window.location.host}/ws`);

    return () => {
      unsubSessions();
      unsubGit();
      unsubRoomMsg();
      unsubRoomStatus();
      unsubRoomApproval();
    };
  }, [setSessions, setRepos]);

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
      // Expand ~ in cwd using dynamic home dir from server
      let resolvedCwd = config.cwd;
      if (resolvedCwd.startsWith("~")) {
        try {
          const cfgRes = await fetch("/api/config");
          if (cfgRes.ok) {
            const cfg = (await cfgRes.json()) as { homeDir: string; cwd: string };
            resolvedCwd = resolvedCwd.replace("~", cfg.homeDir);
          }
        } catch {
          // Fall through with ~ intact — server will resolve
        }
      }

      // Build CLI args based on config
      const args: string[] = [];

      // Handle --continue (continue most recent session)
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

      // Handle --resume <id> (resume specific session)
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

      // Normal launch
      // Permissions
      if (config.permissions === "bypass") {
        args.push("--dangerously-skip-permissions");
      }

      // Model
      args.push("--model", config.model);

      // When agent is selected, add --agent flag to args
      if (config.agent !== "none") {
        args.push("--agent", config.agent);
      }

      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: config.name || (config.agent !== "none" ? config.agent : `claude-${config.model}`),
          command: "claude",
          args: args.length > 0 ? args : ["--dangerously-skip-permissions"],
          cwd: resolvedCwd,
          meta: {
            model: config.model,
            agent: config.agent,
            permissions: config.permissions,
            channel: config.channel,
            group: config.agent === "orchestrator" ? "sprint" : "standalone",
          },
        }),
      });

      if (!res.ok) throw new Error(`Failed to create session (${res.status})`);
    },
    [],
  );

  const handleQuickCreate = useCallback(() => {
    setLauncherOpen(true);
  }, [setLauncherOpen]);

  // Instant preset launchers (no modal)
  const handleQuickChat = useCallback(() => {
    void handleCreateSession({
      name: "claude-sonnet",
      model: "sonnet",
      agent: "none",
      permissions: "bypass",
      channel: "none",
      cwd: defaultCwd,
    });
  }, [handleCreateSession, defaultCwd]);

  const handleStartSprint = useCallback(() => {
    void handleCreateSession({
      name: "orchestrator",
      model: "opus",
      agent: "orchestrator",
      permissions: "bypass",
      channel: "none",
      cwd: defaultCwd,
    });
  }, [handleCreateSession, defaultCwd]);

  const handleContinueLast = useCallback(() => {
    void handleCreateSession({
      name: "continue-last",
      model: "sonnet",
      agent: "none",
      permissions: "bypass",
      channel: "none",
      cwd: defaultCwd,
      continueSession: true,
    });
  }, [handleCreateSession, defaultCwd]);

  const handleKillSession = useCallback(async (sessionId: string) => {
    await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
  }, []);

  if (!hydrated) {
    return (
      <div className="h-screen flex items-center justify-center bg-console-bg">
        <div className="text-console-dim text-sm animate-pulse">Loading Agent Studio...</div>
      </div>
    );
  }

  if (showSetupWizard) {
    return (
      <SetupWizard
        onComplete={() => {
          setShowSetupWizard(false);
          // Re-fetch config to pick up new defaults
          void (async () => {
            try {
              const res = await fetch("/api/config");
              if (res.ok) {
                const data = await res.json() as { defaultCwd: string; config: { defaults: { workingDirectory: string } } };
                setDefaultCwd(data.config?.defaults?.workingDirectory ?? data.defaultCwd ?? "~");
              }
            } catch { /* ignore */ }
          })();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* WebSocket connection status */}
      <ConnectionBanner />

      {/* Toggle bar */}
      <ToggleBar />

      {/* Main area */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        {sidebarOpen ? (
          <ErrorBoundary fallbackLabel="Sidebar error">
            <Sidebar
              onNewSession={handleQuickCreate}
              onKillSession={handleKillSession}
            />
          </ErrorBoundary>
        ) : (
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-8 border-r border-console-border bg-console-panel flex items-center justify-center shrink-0 text-console-dim hover:text-console-muted transition-colors"
            title="Open sidebar"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        )}

        {/* Main content — use hidden/block to keep terminals alive across tab switches */}
        <main className="flex-1 min-w-0 min-h-0">
          <div className={activeMode === "sessions" ? "h-full" : "hidden"}>
            <ErrorBoundary fallbackLabel="Terminal grid error">
              <TerminalGrid
                onCreateSession={handleQuickCreate}
                onKillSession={handleKillSession}
                onQuickChat={handleQuickChat}
                onStartSprint={handleStartSprint}
                onContinueLast={handleContinueLast}
                visible={activeMode === "sessions"}
              />
            </ErrorBoundary>
          </div>
          <div className={activeMode === "teams" ? "h-full" : "hidden"}>
            <ErrorBoundary fallbackLabel="Teams view error">
              <TeamsView />
            </ErrorBoundary>
          </div>
          <div className={activeMode === "memory" ? "h-full" : "hidden"}>
            <ErrorBoundary fallbackLabel="Memory view error">
              <MemoryView />
            </ErrorBoundary>
          </div>
          <div className={activeMode === "settings" ? "h-full" : "hidden"}>
            <ErrorBoundary fallbackLabel="Settings view error">
              <SettingsView />
            </ErrorBoundary>
          </div>
        </main>
      </div>

      {/* Bottom bar */}
      <BottomBar />

      {/* Launcher modal */}
      <SessionLauncher
        open={launcherOpen}
        onOpenChange={setLauncherOpen}
        onLaunch={handleCreateSession}
      />

      {/* Command palette */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onNewSession={handleQuickCreate}
        onKillSession={handleKillSession}
      />

      {/* PR creation modal */}
      <PRModal />

      {/* Toast notifications */}
      <ToastContainer />

      {/* First-visit hint pointing at "+ New Session" */}
      
    </div>
  );
}
