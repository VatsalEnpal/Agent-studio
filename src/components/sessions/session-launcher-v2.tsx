"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CloseIcon, ChevronDownIcon, SearchIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import type { LauncherPreset } from "@/lib/types";
import { QuickImport } from "./quick-import";

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

const PRESETS: (LauncherPreset & { description: string })[] = [
  {
    name: "Continue",
    description: "Resume last session",
    model: "sonnet",
    agent: "none",
    permissions: "bypass",
    channel: "none",
    cwd: "~",
  },
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

export function SessionLauncherV2({ open, onOpenChange, onLaunch }: SessionLauncherV2Props) {
  const [customName, setCustomName] = useState("");
  const [model, setModel] = useState<"opus" | "sonnet" | "haiku">("sonnet");
  const [agent, setAgent] = useState("none");
  const [permissions, setPermissions] = useState<"bypass" | "default" | "plan" | "auto">("default");
  const [channel, setChannel] = useState<"none" | "telegram">("none");
  const [defaultCwd, setDefaultCwd] = useState("~");
  const [cwd, setCwd] = useState("~");
  const [resume, setResume] = useState("");
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentOption[]>(DEFAULT_AGENTS);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [recentSessions, setRecentSessions] = useState<PastSession[]>([]);
  const [resumeDropdownOpen, setResumeDropdownOpen] = useState(false);
  const [resumeSearch, setResumeSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Defaults loaded from server config
  const [configDefaults, setConfigDefaults] = useState<{
    model: "opus" | "sonnet" | "haiku";
    permissions: "bypass" | "default" | "plan" | "auto";
  } | null>(null);

  // Reset form on open — always re-read saved settings so user sees latest configured values
  useEffect(() => {
    if (open) {
      setCustomName("");
      setAgent("none");
      setChannel("none");
      setCwd(defaultCwd);
      setResume("");
      setError(null);
      setLaunching(false);

      // Fetch latest saved settings each time dialog opens
      void (async () => {
        try {
          const res = await fetch("/api/settings");
          if (res.ok) {
            const settings = (await res.json()) as {
              defaultModel?: "opus" | "sonnet" | "haiku";
              defaultPermissions?: "bypass" | "default" | "plan" | "auto";
            };
            setModel(settings.defaultModel ?? configDefaults?.model ?? "sonnet");
            setPermissions(settings.defaultPermissions ?? configDefaults?.permissions ?? "default");
            return;
          }
        } catch {
          // Settings endpoint unavailable
        }
        // Fallback to config defaults
        setModel(configDefaults?.model ?? "sonnet");
        setPermissions(configDefaults?.permissions ?? "default");
      })();
    }
  }, [open, defaultCwd, configDefaults]);

  // Fetch default cwd + model + permissions once
  const [defaultCwdLoaded, setDefaultCwdLoaded] = useState(false);
  useEffect(() => {
    if (defaultCwdLoaded) return;
    void (async () => {
      try {
        const res = await fetch("/api/config");
        if (res.ok) {
          const data = (await res.json()) as Record<string, unknown>;
          const config = data.config as Record<string, unknown> | undefined;

          // Check projects first (same logic as Create Sprint dialog)
          const projects = (config?.projects ?? data.projects) as
            | Array<{ path: string; isProd?: boolean }>
            | undefined;
          if (projects && projects.length > 0) {
            const main = projects.find((p) => !p.isProd);
            const projectPath = main?.path ?? projects[0]?.path ?? "";
            if (projectPath) {
              setDefaultCwd(projectPath);
              setCwd(projectPath);
            }
          } else {
            // Fallback to defaults.workingDirectory
            const defaults = (config?.defaults ?? data.defaults) as
              | { workingDirectory?: string }
              | undefined;
            if (defaults?.workingDirectory) {
              setDefaultCwd(defaults.workingDirectory);
              setCwd(defaults.workingDirectory);
            }
          }

          const defaults = (config?.defaults ?? data.defaults) as
            | {
                model?: "opus" | "sonnet" | "haiku";
                permissions?: "bypass" | "default" | "plan" | "auto";
              }
            | undefined;

          // User-saved settings override config defaults
          let savedModel = defaults?.model ?? "sonnet";
          let savedPermissions = defaults?.permissions ?? "default";
          try {
            const settingsRes = await fetch("/api/settings");
            if (settingsRes.ok) {
              const settings = (await settingsRes.json()) as {
                defaultModel?: "opus" | "sonnet" | "haiku";
                defaultPermissions?: "bypass" | "default" | "plan" | "auto";
              };
              if (settings.defaultModel) savedModel = settings.defaultModel;
              if (settings.defaultPermissions) savedPermissions = settings.defaultPermissions;
            }
          } catch {
            // Settings endpoint unavailable, use config defaults
          }

          setConfigDefaults({
            model: savedModel,
            permissions: savedPermissions,
          });
          setDefaultCwdLoaded(true);
        }
      } catch (e) {
        console.error("Caught error:", e);
      }
    })();
  }, [defaultCwdLoaded]);

  // Fetch agents — refetch every time the dialog opens so agents created via
  // Settings (or any other surface) appear immediately, without a page reload.
  useEffect(() => {
    if (!open) return;
    setAgentsLoading(true);
    setAgentsError(null);
    void (async () => {
      try {
        const res = await fetch("/api/agents", { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load agents (${String(res.status)})`);
        const data = (await res.json()) as AgentOption[];
        if (Array.isArray(data) && data.length > 0) setAgents(data);
      } catch (e) {
        console.error("Caught error:", e);
        setAgentsError(e instanceof Error ? e.message : "Failed to load agents");
      } finally {
        setAgentsLoading(false);
      }
    })();
  }, [open]);

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
      } catch (e) {
        console.error("Caught error:", e);
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

  const handleLaunch = useCallback(async () => {
    if (launching) return;
    setLaunching(true);
    setError(null);
    try {
      const sessionName = customName.trim() || (agent !== "none" ? agent : `claude-${model}`);
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
  }, [open, handleLaunch]);

  const applyPreset = useCallback(
    (preset: (typeof PRESETS)[number]) => {
      if (preset.name === "Continue") {
        void handleLaunchContinue();
        return;
      }
      setModel(preset.model);
      setAgent(preset.agent);
      setPermissions(preset.permissions);
      setChannel(preset.channel);
      // Use current cwd (already set from /api/config), not the preset's hardcoded "~"
      // This ensures Quick Chat etc. use the user's configured working directory
      setResume("");
    },
    [handleLaunchContinue],
  );

  const handlePresetLaunch = useCallback(
    async (preset: (typeof PRESETS)[number]) => {
      if (launching) return;
      if (preset.name === "Continue") {
        void handleLaunchContinue();
        return;
      }
      setLaunching(true);
      setError(null);
      applyPreset(preset);
      try {
        const sessionName = preset.agent !== "none" ? preset.agent : `claude-${preset.model}`;
        await onLaunch({
          name: sessionName,
          model: preset.model,
          agent: preset.agent,
          permissions: preset.permissions,
          channel: preset.channel,
          cwd,
        });
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Launch failed");
      } finally {
        setLaunching(false);
      }
    },
    [launching, cwd, applyPreset, handleLaunchContinue, onLaunch, onOpenChange],
  );

  // Quick Import: refresh agents list after a successful import
  const refreshAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/agents");
      if (res.ok) {
        const data = (await res.json()) as AgentOption[];
        if (Array.isArray(data) && data.length > 0) setAgents(data);
      }
    } catch {
      // Ignore -- agent list will refresh on next dialog open
    }
  }, []);

  // Quick Import: launch session with the newly imported agent
  const handleQuickImportLaunch = useCallback(
    (config: { name: string; agent: string; cwd: string }) => {
      void (async () => {
        if (launching) return;
        setLaunching(true);
        setError(null);
        try {
          await onLaunch({
            name: config.name,
            model,
            agent: config.agent,
            permissions,
            channel: "none",
            cwd: config.cwd,
          });
          onOpenChange(false);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Launch failed");
        } finally {
          setLaunching(false);
        }
      })();
    },
    [launching, model, permissions, onLaunch, onOpenChange],
  );

  const inputCls =
    "w-full px-2 py-1 text-xs bg-bg-input border border-border-default rounded text-text-primary placeholder:text-text-ghost focus:outline-none focus:border-[#f59e0b]/40 transition-all";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[420px] max-h-[85vh] overflow-y-auto bg-bg-elevated border border-border-subtle rounded shadow-modal scrollbar-thin outline-none">
          <Dialog.Description className="sr-only">
            Launch a new Claude Code session
          </Dialog.Description>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-border-default">
            <Dialog.Title className="text-xs font-semibold text-text-primary tracking-[-0.2px]">
              New Session
            </Dialog.Title>
            <Dialog.Close className="p-0.5 text-text-ghost hover:text-text-secondary transition-all rounded">
              <CloseIcon size={10} />
            </Dialog.Close>
          </div>

          <div className="px-4 py-3 space-y-3">
            {/* Quick Start — clean text buttons in a row */}
            <div>
              <span className="block text-2xs font-medium uppercase text-text-ghost tracking-[0.5px] mb-1.5">
                Quick Start
              </span>
              <div className="flex gap-1 flex-wrap">
                {PRESETS.map((preset) => {
                  // For the Continue preset, show which session will be resumed
                  const isContinue = preset.name === "Continue";
                  const lastSession =
                    isContinue && recentSessions.length > 0 ? recentSessions[0] : null;
                  const continueLabel = lastSession
                    ? `Continue ${shortProject(lastSession.project)}`
                    : preset.name;
                  const continueHint = lastSession
                    ? formatRelativeTime(lastSession.date)
                    : undefined;

                  return (
                    <button
                      key={preset.name}
                      onClick={() => handlePresetLaunch(preset)}
                      disabled={launching || (isContinue && recentSessions.length === 0)}
                      title={
                        isContinue && lastSession
                          ? `Resume last session in ${lastSession.project} (${formatRelativeTime(lastSession.date)})`
                          : preset.description
                      }
                      className={cn(
                        "px-2 py-1 rounded text-xs font-medium transition-all",
                        "border",
                        isContinue && lastSession
                          ? "border-[#f59e0b]/30 bg-[#f59e0b]/5"
                          : "border-border-default",
                        launching || (isContinue && recentSessions.length === 0)
                          ? "opacity-50 cursor-not-allowed"
                          : "hover:border-[#f59e0b]/40 hover:bg-[#f59e0b]/5 active:bg-[#f59e0b]/10 active:scale-[0.98]",
                      )}
                    >
                      <span className="text-text-primary">{continueLabel}</span>
                      {continueHint && <span className="text-text-ghost ml-1">{continueHint}</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick Import -- shows unimported projects */}
            <QuickImport
              onLaunchSession={handleQuickImportLaunch}
              onImportComplete={() => void refreshAgents()}
            />

            {/* Resume previous */}
            {recentSessions.length > 0 && (
              <div>
                <span className="block text-2xs font-medium uppercase text-text-ghost tracking-[0.5px] mb-1">
                  Resume Previous
                </span>
                <div className="relative" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setResumeDropdownOpen(!resumeDropdownOpen)}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-1 text-xs bg-bg-input border rounded text-left transition-all",
                      resume
                        ? "border-[#f59e0b]/40 text-text-primary"
                        : "border-border-default text-text-ghost",
                      "hover:border-border-subtle focus:outline-none",
                    )}
                  >
                    {resume ? (
                      <>
                        <span className="truncate flex-1">
                          {shortProject(
                            recentSessions.find((s) => s.id === resume)?.project ?? resume,
                          )}
                        </span>
                        <span className="text-xs text-text-ghost font-mono">
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
                        <span className="flex-1">Select a previous session...</span>
                        <ChevronDownIcon size={12} className="text-text-ghost" />
                      </>
                    )}
                  </button>

                  {resumeDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-bg-elevated border border-border-subtle rounded shadow-modal z-10 max-h-48 overflow-hidden flex flex-col">
                      <div className="p-1.5 border-b border-border-default">
                        <div className="relative">
                          <SearchIcon
                            size={10}
                            className="absolute left-2 top-1/2 -translate-y-1/2 text-text-ghost"
                          />
                          <input
                            type="text"
                            value={resumeSearch}
                            onChange={(e) => setResumeSearch(e.target.value)}
                            placeholder="Search..."
                            className="w-full pl-6 pr-2 py-1 text-xs bg-bg-input border border-border-default rounded text-text-primary placeholder:text-text-ghost focus:outline-none focus:border-border-subtle"
                            autoFocus
                          />
                        </div>
                      </div>
                      <div className="overflow-y-auto max-h-36 scrollbar-thin">
                        {filteredSessions.length === 0 ? (
                          <p className="px-3 py-2 text-xs text-text-ghost">No sessions found</p>
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
                                "flex items-center gap-2 w-full px-2.5 py-1 text-left transition-all",
                                "hover:bg-bg-input",
                                resume === session.id && "bg-[#f59e0b]/10",
                              )}
                            >
                              <span className="text-xs text-text-primary truncate flex-1">
                                {shortProject(session.project)}
                              </span>
                              <span className="text-xs text-text-ghost shrink-0">
                                {formatRelativeTime(session.date)}
                              </span>
                              <span className="text-xs text-text-ghost font-mono shrink-0">
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

            {/* Divider */}
            <div className="flex items-center gap-3 py-0.5">
              <div className="flex-1 h-px bg-border-default" />
              <span className="text-2xs text-text-ghost/60 uppercase tracking-[1px]">
                customize
              </span>
              <div className="flex-1 h-px bg-border-default" />
            </div>

            {/* Model — pills */}
            <div>
              <span className="block text-2xs font-medium uppercase text-text-ghost tracking-[0.5px] mb-1">
                Model
              </span>
              <div className="flex gap-1">
                {MODELS.map((m) => (
                  <button
                    key={m}
                    onClick={() => setModel(m)}
                    className={cn(
                      "px-2.5 py-1 rounded text-xs font-medium text-center transition-all",
                      "border",
                      model === m
                        ? "border-[#f59e0b]/50 bg-[#f59e0b]/10 text-[#f59e0b]"
                        : "border-border-default text-text-secondary hover:border-border-subtle hover:text-text-primary",
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Agent */}
            <div>
              <span className="block text-2xs font-medium uppercase text-text-ghost tracking-[0.5px] mb-1">
                Agent
              </span>
              <select
                value={agent}
                onChange={(e) => {
                  const selectedId = e.target.value;
                  setAgent(selectedId);
                  const selectedAgent = agents.find((a) => a.id === selectedId);
                  if (selectedAgent?.model) setModel(selectedAgent.model);
                }}
                className={inputCls}
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id} title={a.description}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Permissions — subtle pills */}
            <div>
              <span className="block text-2xs font-medium uppercase text-text-ghost tracking-[0.5px] mb-1">
                Permissions
              </span>
              <div className="flex gap-1">
                {PERMISSIONS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPermissions(p)}
                    className={cn(
                      "px-2 py-0.5 rounded text-2xs font-medium uppercase tracking-[0.5px] text-center transition-all",
                      "border",
                      permissions === p
                        ? "border-[#f59e0b]/50 bg-[#f59e0b]/10 text-[#f59e0b]"
                        : "border-border-default text-text-ghost hover:text-text-tertiary hover:border-border-subtle",
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Working directory */}
            <div>
              <span className="block text-2xs font-medium uppercase text-text-ghost tracking-[0.5px] mb-1">
                Working Directory
              </span>
              <input
                type="text"
                value={cwd}
                onChange={(e) => setCwd(e.target.value)}
                className={cn(inputCls, "font-mono")}
              />
            </div>

            {/* Session name */}
            <div>
              <span className="block text-2xs font-medium uppercase text-text-ghost tracking-[0.5px] mb-1">
                Session Name
              </span>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Auto-generated if empty"
                className={inputCls}
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mx-4 mb-2 px-2.5 py-1.5 bg-error/10 border border-error/20 rounded text-xs text-error">
              {error}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border-default">
            <span className="text-xs text-text-ghost font-mono">
              {resume
                ? `resume: ${resume.slice(0, 16)}...`
                : `${model}${agent !== "none" ? ` + ${agent}` : ""}`}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void handleLaunch()}
                disabled={launching}
                className={cn(
                  "px-3 py-1 rounded text-xs font-semibold transition-all",
                  "bg-[#f59e0b] text-[#0a0a0a]",
                  "hover:bg-[#fbbf24] active:scale-[0.98]",
                  "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
                )}
              >
                {launching ? "Launching..." : resume ? "Resume" : "Launch"}
              </button>
              {!launching && (
                <kbd className="text-xs text-text-ghost bg-bg-input border border-border-default rounded px-1.5 py-0.5">
                  {typeof navigator !== "undefined" && navigator.platform?.includes("Mac")
                    ? "Cmd"
                    : "Ctrl"}
                  +Enter
                </kbd>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
