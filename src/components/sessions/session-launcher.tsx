"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X,
  Zap,
  Shield,
  Search,
  MessageSquare,
  Folder,
  RotateCcw,
  History,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LauncherPreset } from "@/lib/types";

interface PastSession {
  id: string;
  project: string;
  modified: number;
  date: string;
}

const PRESETS: (LauncherPreset & { icon: React.ComponentType<{ className?: string }>; description: string })[] = [
  {
    name: "Quick Chat",
    icon: MessageSquare,
    description: "Sonnet, no agent",
    model: "sonnet",
    agent: "none",
    permissions: "bypass",
    channel: "none",
    cwd: "~",
  },
  {
    name: "Start Sprint",
    icon: Zap,
    description: "Opus + orchestrator",
    model: "opus",
    agent: "orchestrator",
    permissions: "bypass",
    channel: "none",
    cwd: "~",
  },
  {
    name: "Security Audit",
    icon: Shield,
    description: "Opus + security",
    model: "opus",
    agent: "security-reviewer",
    permissions: "plan",
    channel: "none",
    cwd: "~",
  },
  {
    name: "PMO Scan",
    icon: Search,
    description: "Sonnet + PMO",
    model: "sonnet",
    agent: "pmo",
    permissions: "bypass",
    channel: "none",
    cwd: "~",
  },
];

interface AgentOption {
  id: string;
  name: string;
  description: string;
  model?: "opus" | "sonnet" | "haiku";
}

// Fallback agents used until API responds
const DEFAULT_AGENTS: AgentOption[] = [
  { id: "none", name: "No Agent", description: "Plain Claude session" },
  { id: "orchestrator", name: "orchestrator", description: "Coordinates agent teams" },
  { id: "frontend", name: "frontend", description: "Builds UI code" },
  { id: "backend", name: "backend", description: "Builds APIs and server logic" },
  { id: "qa", name: "qa", description: "Tests the application" },
  { id: "security", name: "security", description: "Reviews code for vulnerabilities" },
  { id: "pmo", name: "pmo", description: "Scans for tasks" },
  { id: "documentation", name: "documentation", description: "Maintains docs" },
];

const MODELS: ("opus" | "sonnet" | "haiku")[] = ["opus", "sonnet", "haiku"];
const PERMISSIONS: ("bypass" | "default" | "plan" | "auto")[] = [
  "bypass",
  "default",
  "plan",
  "auto",
];
const CHANNELS: ("none" | "telegram")[] = ["none", "telegram"];

interface SessionLauncherProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLaunch: (config: {
    name: string;
    model: "opus" | "sonnet" | "haiku";
    agent: string;
    permissions: "bypass" | "default" | "plan" | "auto";
    channel: "none" | "telegram";
    cwd: string;
    resume?: string;
    continueSession?: boolean;
  }) => void;
}

function formatRelativeTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  } catch {
    return iso;
  }
}

function shortProject(project: string): string {
  return project.split("/").pop() ?? project;
}

export function SessionLauncher({
  open,
  onOpenChange,
  onLaunch,
}: SessionLauncherProps) {
  const [model, setModel] = useState<"opus" | "sonnet" | "haiku">("sonnet");
  const [agent, setAgent] = useState("none");
  const [permissions, setPermissions] =
    useState<"bypass" | "default" | "plan" | "auto">("default");
  const [channel, setChannel] = useState<"none" | "telegram">("none");
  const [cwd, setCwd] = useState("~");
  const [resume, setResume] = useState("");
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dynamic agents from API
  const [agents, setAgents] = useState<AgentOption[]>(DEFAULT_AGENTS);

  // Recent sessions for dropdown
  const [recentSessions, setRecentSessions] = useState<PastSession[]>([]);
  const [resumeDropdownOpen, setResumeDropdownOpen] = useState(false);
  const [resumeSearch, setResumeSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch default cwd from config on first open
  const [defaultCwdLoaded, setDefaultCwdLoaded] = useState(false);
  useEffect(() => {
    if (defaultCwdLoaded) return;
    void (async () => {
      try {
        const res = await fetch("/api/config");
        if (res.ok) {
          const data = await res.json() as { config: { defaults: { workingDirectory: string } } };
          const configCwd = data.config?.defaults?.workingDirectory;
          if (configCwd) {
            setCwd(configCwd);
            // Also update presets
            for (const p of PRESETS) { p.cwd = configCwd; }
          }
          setDefaultCwdLoaded(true);
        }
      } catch { /* use default */ }
    })();
  }, [defaultCwdLoaded]);

  // Fetch agents from API
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/agents");
        if (res.ok) {
          const data = (await res.json()) as AgentOption[];
          if (Array.isArray(data) && data.length > 0) {
            setAgents(data);
          }
        }
      } catch {
        // Use defaults
      }
    })();
  }, []);

  // Fetch recent sessions when dialog opens
  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const res = await fetch("/api/sessions/history");
        if (res.ok) {
          const sessions = (await res.json()) as PastSession[];
          setRecentSessions(sessions);
        }
      } catch {
        // Best effort
      }
    })();
  }, [open]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!resumeDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setResumeDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [resumeDropdownOpen]);

  const filteredSessions = recentSessions.filter((s) => {
    if (!resumeSearch) return true;
    const q = resumeSearch.toLowerCase();
    return (
      s.id.toLowerCase().includes(q) ||
      s.project.toLowerCase().includes(q) ||
      shortProject(s.project).toLowerCase().includes(q)
    );
  });

  const applyPreset = useCallback((preset: LauncherPreset) => {
    setModel(preset.model);
    setAgent(preset.agent);
    setPermissions(preset.permissions);
    setChannel(preset.channel);
    setCwd(preset.cwd);
    setResume("");
  }, []);

  const handleLaunch = useCallback(async () => {
    if (launching) return;
    setLaunching(true);
    setError(null);
    try {
      const sessionName =
        agent !== "none" ? agent : `claude-${model}`;
      await onLaunch({
        name: sessionName,
        model,
        agent,
        permissions,
        channel,
        cwd,
        resume: resume || undefined,
      });
      onOpenChange(false);
      setResume("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Launch failed");
    } finally {
      setLaunching(false);
    }
  }, [
    launching,
    model,
    agent,
    permissions,
    channel,
    cwd,
    resume,
    onLaunch,
    onOpenChange,
  ]);

  const handleContinueLast = useCallback(async () => {
    if (launching) return;
    setLaunching(true);
    setError(null);
    try {
      await onLaunch({
        name: "continue-last",
        model,
        agent: "none",
        permissions: "bypass",
        channel: "none",
        cwd,
        continueSession: true,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Launch failed");
    } finally {
      setLaunching(false);
    }
  }, [launching, model, cwd, onLaunch, onOpenChange]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[520px] max-h-[85vh] overflow-y-auto bg-console-panel border border-console-border rounded-lg shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-console-border">
            <Dialog.Description className="sr-only">Launch a new Claude Code session</Dialog.Description>
          <Dialog.Title className="text-sm font-semibold text-console-text">
              New Session
            </Dialog.Title>
            <Dialog.Close className="p-1 text-console-dim hover:text-console-muted transition-colors">
              <X className="w-4 h-4" />
            </Dialog.Close>
          </div>

          <div className="px-5 py-4 space-y-5">
            {/* Resume Previous Session — FIRST and prominent */}
            {recentSessions.length > 0 && (
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-console-dim mb-1.5">
                  <History className="w-3 h-3 inline mr-1 -mt-0.5" />
                  Resume Previous Session
                </label>
                <div className="relative" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setResumeDropdownOpen(!resumeDropdownOpen)}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-1.5 text-xs bg-console-bg border rounded text-left transition-colors",
                      resume
                        ? "border-console-accent text-console-text"
                        : "border-console-border text-console-dim",
                      "hover:border-console-accent/50 focus:border-console-accent focus:outline-none",
                    )}
                  >
                    {resume ? (
                      <>
                        <History className="w-3 h-3 text-console-accent shrink-0" />
                        <span className="truncate flex-1">{shortProject(recentSessions.find(s => s.id === resume)?.project ?? resume)}</span>
                        <span className="text-[9px] text-console-dim font-mono">{resume.slice(0, 8)}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setResume("");
                          }}
                          className="p-0.5 text-console-dim hover:text-console-muted"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1">Select a previous session...</span>
                        <ChevronDown className="w-3 h-3 text-console-dim" />
                      </>
                    )}
                  </button>

                  {/* Dropdown */}
                  {resumeDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-console-panel border border-console-border rounded-md shadow-lg z-10 max-h-48 overflow-hidden flex flex-col">
                      {/* Search input */}
                      <div className="p-1.5 border-b border-console-border">
                        <input
                          type="text"
                          value={resumeSearch}
                          onChange={(e) => setResumeSearch(e.target.value)}
                          placeholder="Search sessions..."
                          className="w-full px-2 py-1 text-xs bg-console-bg border border-console-border rounded text-console-text placeholder:text-console-dim focus:border-console-accent focus:outline-none"
                          autoFocus
                        />
                      </div>
                      {/* Session list */}
                      <div className="overflow-y-auto max-h-36">
                        {filteredSessions.length === 0 ? (
                          <p className="px-3 py-2 text-[10px] text-console-dim">No sessions found</p>
                        ) : (
                          filteredSessions.slice(0, 15).map((session) => (
                            <button
                              key={session.id}
                              onClick={() => {
                                setResume(session.id);
                                setResumeDropdownOpen(false);
                                setResumeSearch("");
                              }}
                              className={cn(
                                "flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-console-faint/50 transition-colors",
                                resume === session.id && "bg-console-accent/10",
                              )}
                            >
                              <History className="w-3 h-3 text-console-dim shrink-0" />
                              <span className="text-[10px] text-console-text truncate flex-1">
                                {shortProject(session.project)}
                              </span>
                              <span className="text-[9px] text-console-dim shrink-0">
                                {formatRelativeTime(session.date)}
                              </span>
                              <span className="text-[8px] text-console-dim font-mono shrink-0">
                                {session.id.slice(0, 8)}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Quick Actions: Continue Last + Presets */}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-console-dim mb-2">
                Quick Start
              </label>
              <div className="grid grid-cols-5 gap-2">
                {/* Continue Last button */}
                <button
                  onClick={handleContinueLast}
                  disabled={launching}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-2.5 rounded border transition-colors",
                    launching
                      ? "border-console-border bg-console-faint/30 opacity-50 cursor-not-allowed"
                      : "border-console-accent/30 bg-console-accent/5 hover:border-console-accent/60 hover:bg-console-accent/10 active:bg-console-accent/20",
                  )}
                >
                  <RotateCcw className={cn("w-4 h-4 text-console-accent", launching && "animate-spin")} />
                  <span className="text-[10px] font-medium text-console-text">
                    {launching ? "Starting..." : "Continue"}
                  </span>
                  <span className="text-[9px] text-console-dim">
                    last session
                  </span>
                </button>
                {PRESETS.map((preset) => {
                  const Icon = preset.icon;
                  return (
                    <button
                      key={preset.name}
                      onClick={() => applyPreset(preset)}
                      disabled={launching}
                      className={cn(
                        "flex flex-col items-center gap-1.5 p-2.5 rounded border transition-colors",
                        launching
                          ? "border-console-border opacity-50 cursor-not-allowed"
                          : "border-console-border hover:border-console-accent/50 hover:bg-console-faint/50 active:bg-console-faint",
                      )}
                    >
                      <Icon className="w-4 h-4 text-console-accent" />
                      <span className="text-[10px] font-medium text-console-text">
                        {preset.name}
                      </span>
                      <span className="text-[9px] text-console-dim">
                        {preset.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Options grid */}
            <div className="grid grid-cols-2 gap-4">
              {/* Model */}
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-console-dim mb-1.5">
                  Model
                </label>
                <select
                  value={model}
                  onChange={(e) =>
                    setModel(e.target.value as "opus" | "sonnet" | "haiku")
                  }
                  className="w-full px-2 py-1.5 text-xs bg-console-bg border border-console-border rounded text-console-text focus:border-console-accent focus:outline-none"
                >
                  {MODELS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              {/* Agent */}
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-console-dim mb-1.5">
                  Agent
                </label>
                <select
                  value={agent}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    setAgent(selectedId);
                    // Auto-select model if agent has a preferred one
                    const selectedAgent = agents.find((a) => a.id === selectedId);
                    if (selectedAgent?.model) {
                      setModel(selectedAgent.model);
                    }
                  }}
                  className="w-full px-2 py-1.5 text-xs bg-console-bg border border-console-border rounded text-console-text focus:border-console-accent focus:outline-none"
                >
                  {agents.map((a) => (
                    <option key={a.id} value={a.id} title={a.description}>
                      {a.name}{a.description ? ` — ${a.description}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Permissions */}
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-console-dim mb-1.5">
                  Permissions
                </label>
                <select
                  value={permissions}
                  onChange={(e) =>
                    setPermissions(
                      e.target.value as
                        | "bypass"
                        | "default"
                        | "plan"
                        | "auto",
                    )
                  }
                  className="w-full px-2 py-1.5 text-xs bg-console-bg border border-console-border rounded text-console-text focus:border-console-accent focus:outline-none"
                >
                  {PERMISSIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              {/* Channel */}
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-console-dim mb-1.5">
                  Channel
                </label>
                <select
                  value={channel}
                  onChange={(e) =>
                    setChannel(e.target.value as "none" | "telegram")
                  }
                  className="w-full px-2 py-1.5 text-xs bg-console-bg border border-console-border rounded text-console-text focus:border-console-accent focus:outline-none"
                >
                  {CHANNELS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Working Directory */}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-console-dim mb-1.5">
                Working Directory
              </label>
              <div className="flex items-center gap-2">
                <Folder className="w-3.5 h-3.5 text-console-dim shrink-0" />
                <input
                  type="text"
                  value={cwd}
                  onChange={(e) => setCwd(e.target.value)}
                  className="flex-1 px-2 py-1.5 text-xs bg-console-bg border border-console-border rounded text-console-text focus:border-console-accent focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Error display */}
          {error && (
            <div className="mx-5 mb-0 px-3 py-2 bg-console-error/10 border border-console-error/30 rounded text-xs text-console-error">
              {error}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-console-border">
            <span className="text-[10px] text-console-dim">
              {resume ? `resume: ${resume.slice(0, 20)}${resume.length > 20 ? "..." : ""}` : (
                <>
                  {model} {agent !== "none" ? `+ ${agent}` : ""}{" "}
                  {permissions !== "bypass" ? `(${permissions})` : ""}
                </>
              )}
            </span>
            <button
              onClick={handleLaunch}
              disabled={launching}
              className={cn(
                "px-4 py-1.5 text-xs font-medium rounded transition-all",
                "bg-console-accent text-black hover:bg-console-accent/90 active:scale-95",
                "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
              )}
            >
              {launching ? "Launching..." : resume ? "Resume" : "Launch"}
              {!launching && <span className="ml-2 text-[10px] opacity-70">Enter</span>}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
