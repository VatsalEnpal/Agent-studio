"use client";

import { useState, useEffect, useCallback } from "react";
import { wsClient, type ConnectionState } from "@/lib/ws-client";
import { useSessionsStore } from "@/stores/sessions";
import { useUIStore } from "@/stores/ui";
import { useGitStore } from "@/stores/git";
import { useRoomsStore } from "@/stores/rooms";
import type { RoomMessage, RoomAgent } from "@/stores/rooms";
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
import { ReportsView } from "@/components/reports/reports-view";
import { PRModal } from "@/components/git/pr-modal";
import { ToastContainer } from "@/components/ui/toast";

import { ErrorBoundary } from "@/components/ui/error-boundary";
import { Onboarding } from "@/components/setup/onboarding";
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

// --- Preflight types ---
interface PreflightCheck {
  claudeCode: { installed: boolean; version?: string; path?: string; authenticated?: boolean };
  node: { installed: boolean; version: string };
  git: { installed: boolean; version?: string };
}

interface PreflightResult {
  ready: boolean;
  checks: PreflightCheck;
  blockers: string[];
}

// --- Preflight blocker screen ---
function PreflightBlocker({ result, onRecheck }: { result: PreflightResult; onRecheck: () => void }) {
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installResult, setInstallResult] = useState<{
    success?: boolean;
    version?: string;
    error?: string;
  } | null>(null);

  const handleRecheck = () => {
    setChecking(true);
    onRecheck();
    setTimeout(() => setChecking(false), 1500);
  };

  const handleInstall = async () => {
    setInstalling(true);
    setInstallResult(null);
    try {
      const res = await fetch("/api/system/install-claude", { method: "POST" });
      const data = await res.json() as { success?: boolean; version?: string; error?: string };
      if (res.ok && data.success) {
        setInstallResult({ success: true, version: data.version });
        // Auto-recheck after successful install
        setTimeout(() => onRecheck(), 2000);
      } else {
        setInstallResult({ success: false, error: data.error ?? "Installation failed" });
      }
    } catch {
      setInstallResult({ success: false, error: "Network error. Is the server running?" });
    } finally {
      setInstalling(false);
    }
  };

  const claudeNotInstalled = !result.checks.claudeCode.installed;
  const claudeNotAuthenticated = result.checks.claudeCode.installed && !result.checks.claudeCode.authenticated;

  // Non-Claude blockers (e.g. Git missing)
  const otherBlockers = result.blockers.filter(
    (msg) => !msg.includes("Claude Code") && !msg.includes("claude")
  );

  const passed: string[] = [];
  if (result.checks.node.installed) passed.push(`Node.js ${result.checks.node.version}`);
  if (result.checks.git.installed) passed.push(`Git ${result.checks.git.version ?? ""}`);
  if (result.checks.claudeCode.installed) passed.push(`Claude Code ${result.checks.claudeCode.version ?? ""}`);
  if (result.checks.claudeCode.authenticated) passed.push("Claude Code authenticated");

  // --- Auth-only blocker ---
  if (claudeNotAuthenticated && otherBlockers.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center bg-zinc-950">
        <div className="max-w-md text-center space-y-6 px-6">
          <div className="text-5xl">&#128273;</div>
          <h1 className="text-2xl font-bold text-white">Almost there — authenticate Claude Code</h1>
          <p className="text-zinc-400 text-sm">
            Claude Code is installed but not authenticated yet.
            Open a terminal and run the command below to complete setup.
          </p>

          <code className="bg-zinc-900 px-4 py-3 rounded-lg text-amber-400 text-sm block font-mono">
            claude
          </code>

          <div className="space-y-2">
            {passed.map((p, i) => (
              <div key={i} className="bg-zinc-900 rounded-lg p-3 text-left">
                <div className="flex items-center gap-2">
                  <span className="text-green-400">&#10003;</span>
                  <span className="text-zinc-300 text-sm">{p}</span>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleRecheck}
            disabled={checking}
            className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {checking ? "Checking..." : "Check Again"}
          </button>
        </div>
      </div>
    );
  }

  // --- Install blocker (Claude not installed, or other blockers) ---
  return (
    <div className="h-screen flex items-center justify-center bg-zinc-950">
      <div className="max-w-md text-center space-y-6 px-6">
        <div className="text-5xl">&#9889;</div>
        <h1 className="text-2xl font-bold text-white">Agent Studio needs Claude Code</h1>
        <p className="text-zinc-400 text-sm">
          Agent Studio manages Claude Code sessions. To get started,
          you need the Claude Code CLI installed and authenticated.
        </p>

        {/* Status list */}
        <div className="space-y-2">
          {otherBlockers.map((msg, i) => (
            <div key={i} className="bg-red-950/50 border border-red-800 rounded-lg p-3 text-left">
              <div className="flex items-start gap-2">
                <span className="text-red-400 shrink-0">&#10005;</span>
                <span className="text-red-300 text-sm">{msg}</span>
              </div>
            </div>
          ))}

          {claudeNotInstalled && (
            <div className="bg-red-950/50 border border-red-800 rounded-lg p-3 text-left">
              <div className="flex items-start gap-2">
                <span className="text-red-400 shrink-0">&#10005;</span>
                <span className="text-red-300 text-sm">Claude Code CLI is not installed.</span>
              </div>
            </div>
          )}

          {passed.map((p, i) => (
            <div key={i} className="bg-zinc-900 rounded-lg p-3 text-left">
              <div className="flex items-center gap-2">
                <span className="text-green-400">&#10003;</span>
                <span className="text-zinc-300 text-sm">{p}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Install button + result */}
        {claudeNotInstalled && (
          <div className="space-y-4">
            {installResult?.success ? (
              <div className="bg-green-950/50 border border-green-800 rounded-lg p-4 space-y-1">
                <div className="flex items-center justify-center gap-2 text-green-400 font-medium text-sm">
                  <span>&#10003;</span> Installed successfully
                </div>
                {installResult.version && (
                  <p className="text-green-300/70 text-xs">Version: {installResult.version}</p>
                )}
                <p className="text-zinc-500 text-xs">Rechecking automatically...</p>
              </div>
            ) : (
              <>
                <button
                  onClick={handleInstall}
                  disabled={installing}
                  className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-60 text-white px-6 py-3 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  {installing ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Installing...
                    </>
                  ) : (
                    "Install Claude Code"
                  )}
                </button>
                <p className="text-zinc-600 text-xs">
                  Runs <code className="text-zinc-500">npm install -g @anthropic-ai/claude-code</code> on your machine
                </p>
              </>
            )}

            {installResult && !installResult.success && installResult.error && (
              <div className="bg-red-950/50 border border-red-800 rounded-lg p-3 text-left space-y-2">
                <p className="text-red-300 text-sm whitespace-pre-wrap">{installResult.error}</p>
              </div>
            )}

            {/* Manual fallback */}
            <div className="border-t border-zinc-800 pt-4 space-y-2">
              <p className="text-zinc-600 text-xs">Or install manually:</p>
              <code className="bg-zinc-900 px-4 py-2 rounded text-amber-400 text-xs block font-mono">
                npm install -g @anthropic-ai/claude-code
              </code>
            </div>
          </div>
        )}

        <button
          onClick={handleRecheck}
          disabled={checking}
          className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {checking ? "Checking..." : "Check Again"}
        </button>
      </div>
    </div>
  );
}

export default function Home() {
  const [hydrated, setHydrated] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [defaultCwd, setDefaultCwd] = useState("~");
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(true);
  useEffect(() => { setHydrated(true); }, []);

  // Preflight check — runs before anything else
  const runPreflight = useCallback(async () => {
    try {
      const res = await fetch("/api/system/preflight");
      if (res.ok) {
        const data = await res.json() as PreflightResult;
        setPreflight(data);
        return data.ready;
      }
    } catch { /* server not ready */ }
    setPreflightLoading(false);
    return false;
  }, []);

  useEffect(() => {
    void (async () => {
      const ready = await runPreflight();
      if (ready) {
        // Only fetch config if preflight passes
        try {
          const res = await fetch("/api/config");
          if (res.ok) {
            const data = await res.json() as { defaultCwd: string; config: { setupComplete: boolean; defaults: { workingDirectory: string } } };
            const cwd = data.config?.defaults?.workingDirectory ?? data.defaultCwd ?? "~";
            setDefaultCwd(cwd);
            if (data.config && !data.config.setupComplete) {
              setShowSetupWizard(true);
            }
          }
        } catch { /* use defaults */ }
      }
      setPreflightLoading(false);
    })();
  }, [runPreflight]);

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

  // Theme sync
  useThemeSync();

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

    // Room events
    const unsubRoomMsg = wsClient.on("room-message", (msg: WsMessage) => {
      const roomMsg = msg.payload as RoomMessage;
      if (roomMsg?.roomId) {
        useRoomsStore.getState().addMessage(roomMsg.roomId, roomMsg);
      }
    });

    const unsubRoomStatus = wsClient.on("room-agent-status", (msg: WsMessage) => {
      const payload = msg.payload as { roomId: string; agentId: string; status: RoomAgent["status"] };
      if (payload?.roomId) {
        useRoomsStore.getState().updateAgentStatus(payload.roomId, payload.agentId, payload.status);
      }
    });

    const unsubRoomApproval = wsClient.on("room-approval", (msg: WsMessage) => {
      const payload = msg.payload as { roomId: string; messageId: string; approved: boolean };
      if (payload?.roomId) {
        useRoomsStore.getState().updateApproval(payload.roomId, payload.messageId, payload.approved);
      }
    });

    const unsubRoomTyping = wsClient.on("room-agent-typing", (msg: WsMessage) => {
      const payload = msg.payload as { roomId: string; agentId: string };
      if (payload?.roomId) {
        useRoomsStore.getState().setAgentTyping(payload.roomId, payload.agentId);
      }
    });

    const unsubRoomStreaming = wsClient.on("room-agent-streaming", (msg: WsMessage) => {
      const payload = msg.payload as { roomId: string; agentId: string; delta: string };
      if (payload?.roomId) {
        useRoomsStore.getState().appendStreamingDelta(payload.roomId, payload.agentId, payload.delta);
      }
    });

    const unsubRoomActivity = wsClient.on("room-agent-activity", (msg: WsMessage) => {
      const payload = msg.payload as { roomId: string; agentId: string; activity: string };
      if (payload?.roomId) {
        useRoomsStore.getState().updateAgentActivity(payload.roomId, payload.agentId, payload.activity);
      }
    });

    wsClient.connect(`ws://${window.location.host}/ws`);

    return () => {
      unsubSessions();
      unsubGit();
      unsubRoomMsg();
      unsubRoomStatus();
      unsubRoomApproval();
      unsubRoomTyping();
      unsubRoomStreaming();
      unsubRoomActivity();
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
          name: config.agent !== "none" ? config.agent : `claude-${config.model}`,
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

  if (!hydrated || preflightLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-console-bg">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-console-dim/30 border-t-console-accent rounded-full animate-spin" />
          <span className="text-console-dim text-xs">Loading Agent Studio...</span>
        </div>
      </div>
    );
  }

  // Preflight gate: block the entire app if Claude Code is missing
  if (preflight && !preflight.ready) {
    return (
      <PreflightBlocker
        result={preflight}
        onRecheck={() => {
          setPreflightLoading(true);
          void (async () => {
            const ready = await runPreflight();
            if (ready) {
              // Preflight now passes — fetch config
              try {
                const res = await fetch("/api/config");
                if (res.ok) {
                  const data = await res.json() as { defaultCwd: string; config: { setupComplete: boolean; defaults: { workingDirectory: string } } };
                  const cwd = data.config?.defaults?.workingDirectory ?? data.defaultCwd ?? "~";
                  setDefaultCwd(cwd);
                  if (data.config && !data.config.setupComplete) {
                    setShowSetupWizard(true);
                  }
                }
              } catch { /* use defaults */ }
            }
            setPreflightLoading(false);
          })();
        }}
      />
    );
  }

  if (showSetupWizard) {
    return (
      <Onboarding
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
