"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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
  Rocket,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LauncherPreset } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PastSession {
  id: string;
  project: string;
  modified: number;
  date: string;
}

interface AgentOption {
  id: string;
  name: string;
  description: string;
  model?: "opus" | "sonnet" | "haiku";
}

interface SessionLauncherV2Props {
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRESETS: (LauncherPreset & {
  icon: React.ComponentType<{ className?: string }>;
  description: string;
})[] = [
  {
    name: "Continue",
    icon: RotateCcw,
    description: "Resume last session",
    model: "sonnet",
    agent: "none",
    permissions: "bypass",
    channel: "none",
    cwd: "~",
  },
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SessionLauncherV2({
  open,
  onOpenChange,
  onLaunch,
}: SessionLauncherV2Props) {
  const [customName, setCustomName] = useState("");
  const [model, setModel] = useState<"opus" | "sonnet" | "haiku">("sonnet");
  const [agent, setAgent] = useState("none");
  const [permissions, setPermissions] =
    useState<"bypass" | "default" | "plan" | "auto">("default");
  const [channel, setChannel] = useState<"none" | "telegram">("none");
  const [cwd, setCwd] = useState("~");
  const [resume, setResume] = useState("");
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentOption[]>(DEFAULT_AGENTS);
  const [recentSessions, setRecentSessions] = useState<PastSession[]>([]);
  const [resumeDropdownOpen, setResumeDropdownOpen] = useState(false);
  const [resumeSearch, setResumeSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Reset form on open
  useEffect(() => {
    if (open) {
      setCustomName("");
      setModel("sonnet");
      setAgent("none");
      setPermissions("default");
      setChannel("none");
      setResume("");
      setError(null);
      setLaunching(false);
    }
  }, [open]);

  // Fetch default cwd
  const [defaultCwdLoaded, setDefaultCwdLoaded] = useState(false);
  useEffect(() => {
    if (defaultCwdLoaded) return;
    void (async () => {
      try {
        const res = await fetch("/api/config");
        if (res.ok) {
          const data = (await res.json()) as {
            config: { defaults: { workingDirectory: string } };
          };
          const configCwd = data.config?.defaults?.workingDirectory;
          if (configCwd) {
            setCwd(configCwd);
            for (const p of PRESETS) p.cwd = configCwd;
          }
          setDefaultCwdLoaded(true);
        }
      } catch {
        /* use default */
      }
    })();
  }, [defaultCwdLoaded]);

  // Fetch agents
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/agents");
        if (res.ok) {
          const data = (await res.json()) as AgentOption[];
          if (Array.isArray(data) && data.length > 0) setAgents(data);
        }
      } catch {
        /* use defaults */
      }
    })();
  }, []);

  // Fetch recent sessions when opened
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
        /* best effort */
      }
    })();
  }, [open]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!resumeDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setResumeDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [resumeDropdownOpen]);

  // Close panel on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  // Cmd+Enter to launch
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void handleLaunch();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredSessions = recentSessions.filter((s) => {
    if (!resumeSearch) return true;
    const q = resumeSearch.toLowerCase();
    return (
      s.id.toLowerCase().includes(q) ||
      s.project.toLowerCase().includes(q) ||
      shortProject(s.project).toLowerCase().includes(q)
    );
  });

  const applyPreset = useCallback(
    (preset: (typeof PRESETS)[number]) => {
      if (preset.name === "Continue") {
        // Instant launch — continue last session
        void handleLaunchContinue();
        return;
      }
      setModel(preset.model);
      setAgent(preset.agent);
      setPermissions(preset.permissions);
      setChannel(preset.channel);
      setCwd(preset.cwd);
      setResume("");
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleLaunch = useCallback(async () => {
    if (launching) return;
    setLaunching(true);
    setError(null);
    try {
      const sessionName =
        customName.trim() || (agent !== "none" ? agent : `claude-${model}`);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Launch failed");
    } finally {
      setLaunching(false);
    }
  }, [launching, customName, model, agent, permissions, channel, cwd, resume, onLaunch, onOpenChange]);

  const handleLaunchContinue = useCallback(async () => {
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

  // Native file picker via electronAPI
  const handlePickDirectory = useCallback(async () => {
    try {
      const electronAPI = (window as unknown as Record<string, unknown>).electronAPI as
        | { selectDirectory?: () => Promise<string | null> }
        | undefined;
      if (electronAPI?.selectDirectory) {
        const dir = await electronAPI.selectDirectory();
        if (dir) setCwd(dir);
      }
    } catch {
      // Not in Electron — ignore
    }
  }, []);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-modal bg-black/40 animate-fade-in"
        onClick={() => onOpenChange(false)}
      />

      {/* Slide-in panel from right */}
      <div
        ref={panelRef}
        className={cn(
          "fixed top-0 right-0 z-modal",
          "w-[420px] h-full",
          "glass border-l border-border",
          "shadow-modal",
          "animate-slide-in-right",
          "flex flex-col",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
          <h2 className="text-title-sm text-text-emphasis">New Session</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1 text-text-tertiary hover:text-text-secondary transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-5">
          {/* Resume previous */}
          {recentSessions.length > 0 && (
            <div>
              <label className="block text-label-xs uppercase text-text-tertiary mb-1.5">
                <History className="size-3 inline mr-1 -mt-0.5" />
                Resume Previous
              </label>
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setResumeDropdownOpen(!resumeDropdownOpen)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 text-body-sm",
                    "bg-canvas border rounded transition-colors",
                    resume
                      ? "border-accent text-text-primary"
                      : "border-border text-text-tertiary",
                    "hover:border-accent/50 focus:border-accent focus:outline-none",
                  )}
                >
                  {resume ? (
                    <>
                      <History className="size-3 text-accent shrink-0" />
                      <span className="truncate flex-1">
                        {shortProject(
                          recentSessions.find((s) => s.id === resume)?.project ??
                            resume,
                        )}
                      </span>
                      <span className="text-label-xs text-text-tertiary font-mono">
                        {resume.slice(0, 8)}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setResume("");
                        }}
                        className="p-0.5 text-text-tertiary hover:text-text-secondary"
                      >
                        <X className="size-3" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-left">
                        Select a previous session...
                      </span>
                      <ChevronDown className="size-3 text-text-tertiary" />
                    </>
                  )}
                </button>

                {resumeDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-md shadow-modal z-dropdown max-h-48 overflow-hidden flex flex-col">
                    <div className="p-1.5 border-b border-border-subtle">
                      <input
                        type="text"
                        value={resumeSearch}
                        onChange={(e) => setResumeSearch(e.target.value)}
                        placeholder="Search sessions..."
                        className="w-full px-2 py-1 text-body-sm bg-canvas border border-border rounded text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
                        autoFocus
                      />
                    </div>
                    <div className="overflow-y-auto max-h-36">
                      {filteredSessions.length === 0 ? (
                        <p className="px-3 py-2 text-label-xs text-text-tertiary">
                          No sessions found
                        </p>
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
                              "flex items-center gap-2 w-full px-3 py-1.5 text-left",
                              "hover:bg-surface-hover transition-colors",
                              resume === session.id && "bg-accent-subtle",
                            )}
                          >
                            <History className="size-3 text-text-tertiary shrink-0" />
                            <span className="text-label text-text-primary truncate flex-1">
                              {shortProject(session.project)}
                            </span>
                            <span className="text-label-xs text-text-tertiary shrink-0">
                              {formatRelativeTime(session.date)}
                            </span>
                            <span className="text-label-xs text-text-tertiary font-mono shrink-0">
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

          {/* Quick presets */}
          <div>
            <label className="block text-label-xs uppercase text-text-tertiary mb-2">
              Quick Start
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {PRESETS.map((preset) => {
                const Icon = preset.icon;
                return (
                  <button
                    key={preset.name}
                    onClick={() => applyPreset(preset)}
                    disabled={launching}
                    className={cn(
                      "flex flex-col items-center gap-1 p-2 rounded-lg border",
                      "transition-all duration-[var(--duration-quick)]",
                      launching
                        ? "border-border opacity-50 cursor-not-allowed"
                        : "border-border-subtle hover:border-accent/30 hover:bg-surface-hover active:scale-[0.97]",
                    )}
                  >
                    <Icon className="size-4 text-accent" />
                    <span className="text-label-xs text-text-primary leading-tight text-center">
                      {preset.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border-subtle" />
            <span className="text-label-xs text-text-tertiary">
              or customize
            </span>
            <div className="flex-1 h-px bg-border-subtle" />
          </div>

          {/* Custom config */}
          <div className="space-y-4">
            {/* Model radio group */}
            <div>
              <label className="block text-label-xs uppercase text-text-tertiary mb-1.5">
                Model
              </label>
              <div className="flex gap-2">
                {MODELS.map((m) => (
                  <button
                    key={m}
                    onClick={() => setModel(m)}
                    className={cn(
                      "flex-1 py-1.5 rounded-md text-body-sm font-medium text-center",
                      "border transition-colors duration-[var(--duration-quick)]",
                      model === m
                        ? "border-accent bg-accent-subtle text-accent"
                        : "border-border-subtle text-text-secondary hover:border-border hover:text-text-primary",
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Agent dropdown */}
            <div>
              <label className="block text-label-xs uppercase text-text-tertiary mb-1.5">
                Agent
              </label>
              <select
                value={agent}
                onChange={(e) => {
                  const selectedId = e.target.value;
                  setAgent(selectedId);
                  const selectedAgent = agents.find((a) => a.id === selectedId);
                  if (selectedAgent?.model) setModel(selectedAgent.model);
                }}
                className={cn(
                  "w-full px-2 py-1.5 text-body-sm",
                  "bg-canvas border border-border rounded-md",
                  "text-text-primary",
                  "focus:border-accent focus:outline-none",
                )}
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.description ? ` -- ${a.description}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Permissions */}
            <div>
              <label className="block text-label-xs uppercase text-text-tertiary mb-1.5">
                Permissions
              </label>
              <div className="flex gap-1.5">
                {PERMISSIONS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPermissions(p)}
                    className={cn(
                      "flex-1 py-1.5 rounded-md text-label text-center",
                      "border transition-colors duration-[var(--duration-quick)]",
                      permissions === p
                        ? "border-accent bg-accent-subtle text-accent"
                        : "border-border-subtle text-text-secondary hover:border-border",
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Working directory */}
            <div>
              <label className="block text-label-xs uppercase text-text-tertiary mb-1.5">
                Working Directory
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={cwd}
                  onChange={(e) => setCwd(e.target.value)}
                  className={cn(
                    "flex-1 px-2 py-1.5 text-body-sm font-mono",
                    "bg-canvas border border-border rounded-md",
                    "text-text-primary",
                    "focus:border-accent focus:outline-none",
                  )}
                />
                <button
                  onClick={handlePickDirectory}
                  className="p-1.5 rounded-md border border-border-subtle text-text-tertiary hover:text-text-secondary hover:bg-surface-hover transition-colors"
                  title="Browse"
                >
                  <Folder className="size-4" />
                </button>
              </div>
            </div>

            {/* Session name */}
            <div>
              <label className="block text-label-xs uppercase text-text-tertiary mb-1.5">
                Session Name
              </label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Auto-generated if empty"
                className={cn(
                  "w-full px-2 py-1.5 text-body-sm",
                  "bg-canvas border border-border rounded-md",
                  "text-text-primary placeholder:text-text-tertiary",
                  "focus:border-accent focus:outline-none",
                )}
              />
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 mb-2 px-3 py-2 bg-error-subtle border border-error/20 rounded-md text-body-sm text-error">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border-subtle">
          <span className="text-label-xs text-text-tertiary">
            {resume
              ? `resume: ${resume.slice(0, 16)}...`
              : `${model}${agent !== "none" ? ` + ${agent}` : ""}`}
          </span>
          <button
            onClick={() => void handleLaunch()}
            disabled={launching}
            className={cn(
              "inline-flex items-center gap-1.5 px-4 py-2",
              "text-body-sm font-medium rounded-lg",
              "bg-accent text-white hover:bg-accent-hover",
              "transition-all duration-[var(--duration-quick)]",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            <Rocket className="size-3.5" />
            {launching ? "Launching..." : resume ? "Resume" : "Launch"}
            {!launching && (
              <kbd className="ml-1 text-label-xs opacity-60">
                {navigator.platform?.includes("Mac") ? "Cmd" : "Ctrl"}+Enter
              </kbd>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
