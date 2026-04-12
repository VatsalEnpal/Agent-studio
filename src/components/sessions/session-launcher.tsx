"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  CloseIcon,
  SearchIcon,
  ChevronDownIcon,
  SessionsIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import type { LauncherPreset } from "@/lib/types";

interface PastSession {
  id: string;
  project: string;
  modified: number;
  date: string;
}

const PRESETS: (LauncherPreset & { description: string })[] = [
  {
    name: "Quick Chat",
    description: "Sonnet, no agent",
    model: "sonnet",
    agent: "none",
    permissions: "bypass",
    channel: "none",
    cwd: "~",
  },
  {
    name: "Start Sprint",
    description: "Opus + orchestrator",
    model: "opus",
    agent: "orchestrator",
    permissions: "bypass",
    channel: "none",
    cwd: "~",
  },
  {
    name: "Security Audit",
    description: "Opus + security",
    model: "opus",
    agent: "security-reviewer",
    permissions: "plan",
    channel: "none",
    cwd: "~",
  },
  {
    name: "PMO Scan",
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

const DEFAULT_AGENTS: AgentOption[] = [
  { id: "none", name: "No Agent", description: "Plain Claude session" },
  {
    id: "orchestrator",
    name: "orchestrator",
    description: "Coordinates agent teams",
  },
  { id: "frontend", name: "frontend", description: "Builds UI code" },
  {
    id: "backend",
    name: "backend",
    description: "Builds APIs and server logic",
  },
  { id: "qa", name: "qa", description: "Tests the application" },
  {
    id: "security",
    name: "security",
    description: "Reviews code for vulnerabilities",
  },
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

// Amber accent for launcher
const AMBER = "#f59e0b";
const AMBER_HOVER = "#fbbf24";

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
  const [customName, setCustomName] = useState("");
  const [model, setModel] = useState<"opus" | "sonnet" | "haiku">("sonnet");
  const [agent, setAgent] = useState("none");
  const [permissions, setPermissions] = useState<
    "bypass" | "default" | "plan" | "auto"
  >("default");
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

  const [defaultsFromConfig, setDefaultsFromConfig] = useState<{
    model: "opus" | "sonnet" | "haiku";
    permissions: "bypass" | "default" | "plan" | "auto";
  } | null>(null);

  useEffect(() => {
    if (open) {
      setCustomName("");
      setModel(defaultsFromConfig?.model ?? "sonnet");
      setAgent("none");
      setPermissions(defaultsFromConfig?.permissions ?? "default");
      setChannel("none");
      setResume("");
      setError(null);
      setLaunching(false);
    }
  }, [open, defaultsFromConfig]);

  const [defaultCwdLoaded, setDefaultCwdLoaded] = useState(false);
  useEffect(() => {
    if (defaultCwdLoaded) return;
    void (async () => {
      try {
        const res = await fetch("/api/config");
        if (res.ok) {
          const data = (await res.json()) as {
            config: {
              defaults: {
                workingDirectory: string;
                model?: "opus" | "sonnet" | "haiku";
                permissions?: "bypass" | "default" | "plan" | "auto";
              };
            };
          };
          const defaults = data.config?.defaults;
          if (defaults?.workingDirectory) {
            setCwd(defaults.workingDirectory);
            for (const p of PRESETS) {
              p.cwd = defaults.workingDirectory;
            }
          }
          setDefaultsFromConfig({
            model: defaults?.model ?? "sonnet",
            permissions: defaults?.permissions ?? "default",
          });
          setDefaultCwdLoaded(true);
        }
      } catch {
        /* use default */
      }
    })();
  }, [defaultCwdLoaded]);

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

  const handlePresetLaunch = useCallback(
    async (preset: LauncherPreset) => {
      if (launching) return;
      setLaunching(true);
      setError(null);
      applyPreset(preset);
      try {
        const sessionName =
          preset.agent !== "none" ? preset.agent : `claude-${preset.model}`;
        await onLaunch({
          name: sessionName,
          model: preset.model,
          agent: preset.agent,
          permissions: preset.permissions,
          channel: preset.channel,
          cwd: preset.cwd,
        });
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Launch failed");
      } finally {
        setLaunching(false);
      }
    },
    [launching, applyPreset, onLaunch, onOpenChange],
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
      setResume("");
      setCustomName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Launch failed");
    } finally {
      setLaunching(false);
    }
  }, [
    launching,
    customName,
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

  // Helper for input/select styling
  const inputCls =
    "w-full px-2.5 py-1.5 text-xs bg-bg-input border border-border-default rounded text-text-primary placeholder:text-text-ghost focus:border-border-subtle focus:outline-none transition-all";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[480px] max-h-[85vh] overflow-y-auto bg-bg-elevated border border-border-subtle rounded shadow-modal scrollbar-thin outline-none">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border-default">
            <Dialog.Description className="sr-only">
              Launch a new Claude Code session
            </Dialog.Description>
            <Dialog.Title className="text-section-heading text-text-primary">
              New Session
            </Dialog.Title>
            <Dialog.Close className="p-1 text-text-ghost hover:text-text-secondary transition-all">
              <CloseIcon size={14} />
            </Dialog.Close>
          </div>

          <div className="px-5 py-4 space-y-5">
            {/* Resume Previous Session */}
            {recentSessions.length > 0 && (
              <div>
                <label className="block text-xs font-semibold uppercase text-text-ghost tracking-[0.8px] mb-1.5">
                  Resume Previous Session
                </label>
                <div className="relative" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setResumeDropdownOpen(!resumeDropdownOpen)}
                    className={cn(
                      "w-full flex items-center gap-2 px-2.5 py-1.5 text-xs bg-bg-input border rounded text-left transition-all",
                      resume
                        ? "border-[#f59e0b]/40 text-text-primary"
                        : "border-border-default text-text-ghost",
                      "hover:border-border-subtle focus:border-border-subtle focus:outline-none",
                    )}
                  >
                    {resume ? (
                      <>
                        <span className="truncate flex-1">
                          {shortProject(
                            recentSessions.find((s) => s.id === resume)
                              ?.project ?? resume,
                          )}
                        </span>
                        <span className="text-label text-text-ghost font-mono">
                          {resume.slice(0, 8)}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setResume("");
                          }}
                          className="p-0.5 text-text-ghost hover:text-text-secondary"
                        >
                          <CloseIcon size={10} />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1">
                          Select a previous session...
                        </span>
                        <ChevronDownIcon
                          size={12}
                          className="text-text-ghost"
                        />
                      </>
                    )}
                  </button>

                  {resumeDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-bg-elevated border border-border-subtle rounded shadow-modal z-10 max-h-48 overflow-hidden flex flex-col">
                      <div className="p-1.5 border-b border-border-default">
                        <input
                          type="text"
                          value={resumeSearch}
                          onChange={(e) => setResumeSearch(e.target.value)}
                          placeholder="Search sessions..."
                          className="w-full px-2 py-1 text-xs bg-bg-input border border-border-default rounded text-text-primary placeholder:text-text-ghost focus:border-border-subtle focus:outline-none"
                          autoFocus
                        />
                      </div>
                      <div className="overflow-y-auto max-h-36">
                        {filteredSessions.length === 0 ? (
                          <p className="px-3 py-2 text-label text-text-ghost">
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
                                "flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-bg-input transition-all",
                                resume === session.id && "bg-[#f59e0b]/10",
                              )}
                            >
                              <span className="text-label text-text-primary truncate flex-1">
                                {shortProject(session.project)}
                              </span>
                              <span className="text-label text-text-ghost shrink-0">
                                {formatRelativeTime(session.date)}
                              </span>
                              <span className="text-label text-text-ghost font-mono shrink-0">
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

            {/* Quick Actions */}
            <div>
              <label className="block text-xs font-semibold uppercase text-text-ghost tracking-[0.8px] mb-2">
                Quick Start
              </label>
              <div className="grid grid-cols-5 gap-2">
                <button
                  onClick={handleContinueLast}
                  disabled={launching}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-2.5 rounded border transition-all",
                    launching
                      ? "border-border-default bg-bg-input opacity-50 cursor-not-allowed"
                      : "border-[#f59e0b]/30 bg-[#f59e0b]/5 hover:border-[#f59e0b]/60 hover:bg-[#f59e0b]/10 active:bg-[#f59e0b]/20",
                  )}
                >
                  <SessionsIcon size={16} className="text-[#f59e0b]" />
                  <span className="text-label font-medium text-text-primary">
                    {launching ? "Starting..." : "Continue"}
                  </span>
                  <span className="text-label text-text-ghost">
                    last session
                  </span>
                </button>
                {PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => handlePresetLaunch(preset)}
                    disabled={launching}
                    className={cn(
                      "flex flex-col items-center gap-1.5 p-2.5 rounded border transition-all",
                      launching
                        ? "border-border-default opacity-50 cursor-not-allowed"
                        : "border-border-default hover:border-border-subtle hover:bg-bg-input active:bg-bg-elevated active:scale-[0.98]",
                    )}
                  >
                    <SessionsIcon size={16} className="text-[#f59e0b]" />
                    <span className="text-label font-medium text-text-primary">
                      {preset.name}
                    </span>
                    <span className="text-label text-text-ghost">
                      {preset.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-border-default" />
              <span className="text-label text-text-ghost">
                or customize below
              </span>
              <div className="flex-1 h-px bg-border-default" />
            </div>

            {/* Session Name */}
            <div>
              <label className="block text-xs font-semibold uppercase text-text-ghost tracking-[0.8px] mb-1.5">
                Session Name
              </label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Name this session (optional)"
                className={inputCls}
              />
            </div>

            {/* Options grid */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-text-ghost tracking-[0.8px] mb-1.5">
                  Model
                </label>
                <select
                  value={model}
                  onChange={(e) =>
                    setModel(e.target.value as "opus" | "sonnet" | "haiku")
                  }
                  className={inputCls}
                >
                  {MODELS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-text-ghost tracking-[0.8px] mb-1.5">
                  Agent
                </label>
                <select
                  value={agent}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    setAgent(selectedId);
                    const selectedAgent = agents.find(
                      (a) => a.id === selectedId,
                    );
                    if (selectedAgent?.model) {
                      setModel(selectedAgent.model);
                    }
                  }}
                  className={inputCls}
                >
                  {agents.map((a) => (
                    <option key={a.id} value={a.id} title={a.description}>
                      {a.name}
                      {a.description ? ` — ${a.description}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-text-ghost tracking-[0.8px] mb-1.5">
                  Permissions
                </label>
                <select
                  value={permissions}
                  onChange={(e) =>
                    setPermissions(
                      e.target.value as "bypass" | "default" | "plan" | "auto",
                    )
                  }
                  className={inputCls}
                >
                  {PERMISSIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-text-ghost tracking-[0.8px] mb-1.5">
                  Channel
                </label>
                <select
                  value={channel}
                  onChange={(e) =>
                    setChannel(e.target.value as "none" | "telegram")
                  }
                  className={inputCls}
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
              <label className="block text-xs font-semibold uppercase text-text-ghost tracking-[0.8px] mb-1.5">
                Working Directory
              </label>
              <input
                type="text"
                value={cwd}
                onChange={(e) => setCwd(e.target.value)}
                className={cn(inputCls, "font-mono")}
              />
            </div>
          </div>

          {/* Error display */}
          {error && (
            <div className="mx-5 mb-0 px-3 py-2 bg-error/10 border border-error/30 rounded text-xs text-error">
              {error}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-border-default">
            <span className="text-label text-text-ghost">
              {resume ? (
                `resume: ${resume.slice(0, 20)}${resume.length > 20 ? "..." : ""}`
              ) : (
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
                "px-5 py-2 text-xs font-medium rounded transition-all",
                "bg-[#f59e0b] text-[#0a0a0a] hover:bg-[#fbbf24] active:scale-[0.98]",
                "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
              )}
            >
              {launching ? "Launching..." : resume ? "Resume" : "Launch"}
              {!launching && (
                <span className="ml-2 text-label opacity-60">Enter</span>
              )}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
