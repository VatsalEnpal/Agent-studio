"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FolderIcon,
  PlusIcon,
  CloseIcon,
  RefreshIcon,
  WarningIcon,
  CheckIcon,
  BrainIcon,
  SpinnerIcon,
  SparkleIcon,
} from "@/components/ui/icons";
import { useToastStore } from "@/stores/toast";
import { cn } from "@/lib/utils";
import { ScaffoldDialog } from "./scaffold-dialog";

interface ProjectConfig {
  name: string;
  path: string;
  isProd: boolean;
  trackedBranches?: string[];
}

interface WorkspaceConfig {
  projects: ProjectConfig[];
  agentSystem?: {
    path: string;
    memoryIndex: string;
    sprintDir: string;
    scanLog: string;
  };
  devServers: Array<{ name: string; path: string; command: string }>;
  defaults: {
    model: string;
    permissions: string;
    workingDirectory: string;
  };
  setupComplete: boolean;
  version: string;
}

export function SettingsWorkspace() {
  const addToast = useToastStore((s) => s.addToast);
  const [config, setConfig] = useState<WorkspaceConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [newPath, setNewPath] = useState("");
  const [showScaffold, setShowScaffold] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/config");
        if (res.ok) {
          const data = (await res.json()) as { config: WorkspaceConfig };
          setConfig(data.config);
        }
      } catch (err) {
        console.error("[workspace] Failed to load config:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const saveConfig = useCallback(
    async (updated: WorkspaceConfig) => {
      try {
        const res = await fetch("/api/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated),
        });
        if (res.ok) {
          setConfig(updated);
          addToast("Workspace config saved", "success");
        } else {
          addToast("Failed to save config", "error");
        }
      } catch (err) {
        console.error("[workspace] Failed to save config:", err);
        addToast("Failed to save config", "error");
      }
    },
    [addToast],
  );

  const addProject = useCallback(() => {
    if (!config || !newPath.trim()) return;
    const name = newPath.trim().split("/").pop() ?? "project";
    const updated = {
      ...config,
      projects: [...config.projects, { name, path: newPath.trim(), isProd: false }],
    };
    void saveConfig(updated);
    setNewPath("");
  }, [config, newPath, saveConfig]);

  const removeProject = useCallback(
    (idx: number) => {
      if (!config) return;
      const updated = {
        ...config,
        projects: config.projects.filter((_, i) => i !== idx),
      };
      void saveConfig(updated);
    },
    [config, saveConfig],
  );

  const toggleProd = useCallback(
    (idx: number) => {
      if (!config) return;
      const updated = {
        ...config,
        projects: config.projects.map((p, i) => (i === idx ? { ...p, isProd: !p.isProd } : p)),
      };
      void saveConfig(updated);
    },
    [config, saveConfig],
  );

  const resetSetup = useCallback(() => {
    if (!config) return;
    const updated = { ...config, setupComplete: false };
    void saveConfig(updated);
    window.location.reload();
  }, [config, saveConfig]);

  const handleScaffoldComplete = useCallback(
    (agentSystemPath: string) => {
      if (!config) return;
      const updated = {
        ...config,
        agentSystem: {
          path: agentSystemPath,
          memoryIndex: "tools/memory_index.json",
          sprintDir: "sprints/",
          scanLog: "sprints/scan_log.md",
        },
      };
      void saveConfig(updated);
      setShowScaffold(false);
      addToast("Agent system created and configured", "success");
    },
    [config, saveConfig, addToast],
  );

  const regenerateAgents = useCallback(async () => {
    if (!config || !config.projects.length) return;
    const projectPath = config.projects[0].path;
    setRegenerating(true);
    try {
      // Step 1: Analyze
      const analyzeRes = await fetch("/api/agents/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectPath }),
      });
      if (!analyzeRes.ok) throw new Error("Analysis failed");
      const analysis = await analyzeRes.json();

      // Step 2: Generate (with CLAUDE.md)
      const genRes = await fetch("/api/agents/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis, projectPath }),
      });
      if (!genRes.ok) {
        const err = (await genRes.json()) as { error?: string };
        throw new Error(err.error ?? "Generation failed");
      }
      const genData = (await genRes.json()) as {
        agents: Array<{
          id: string;
          name: string;
          description: string;
          model: string;
          mdContent: string;
        }>;
        claudeMd?: string;
      };
      const agents = genData.agents ?? [];

      // Step 3: Apply (including CLAUDE.md if generated)
      const applyRes = await fetch("/api/agents/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agents, projectPath, claudeMd: genData.claudeMd }),
      });
      if (!applyRes.ok) throw new Error("Failed to write agent files");
      const result = (await applyRes.json()) as { created: string[] };

      addToast(`Regenerated ${agents.length} agents (${result.created.length} files)`, "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      addToast(`Agent generation failed: ${msg}`, "error");
    } finally {
      setRegenerating(false);
    }
  }, [config, addToast]);

  if (loading) {
    return (
      <section className="border border-border-default rounded bg-bg-surface shadow-card">
        <div className="px-5 py-3.5 border-b border-border-default">
          <h3 className="text-xs font-medium text-text-primary">Workspace</h3>
        </div>
        <div className="px-5 py-8 flex flex-col items-center gap-2">
          <div className="skeleton h-4 w-48" />
          <div className="skeleton h-3 w-32" />
        </div>
      </section>
    );
  }

  if (!config) {
    return null;
  }

  return (
    <>
      <section className="border border-border-default rounded bg-bg-surface shadow-card">
        <div className="px-5 py-3.5 border-b border-border-default flex items-center justify-between">
          <h3 className="text-body font-medium text-text-primary">Workspace</h3>
          <span className="text-label text-text-tertiary font-mono">
            .agent-studio.json v{config.version}
          </span>
        </div>
        <div className="px-5 py-4 space-y-5">
          {/* Projects */}
          <div>
            <label className="text-label text-text-secondary block mb-1.5">
              <FolderIcon className="w-3 h-3 inline mr-1 -mt-0.5" />
              Tracked Projects
            </label>
            <div className="space-y-1.5">
              {config.projects.length === 0 ? (
                <div className="px-3 py-3 bg-bg-base border border-border-default rounded text-center">
                  <p className="text-body text-text-tertiary">
                    No projects tracked. Add a project path below to get started.
                  </p>
                  <p className="text-label text-text-ghost mt-1">
                    Projects let Agent Studio discover agents, sprints, and memory for your
                    codebase.
                  </p>
                </div>
              ) : (
                config.projects.map((p, i) => (
                  <div
                    key={`${p.path}-${i}`}
                    className="flex items-center gap-2 px-2 py-1.5 bg-bg-base border border-border-default rounded text-body"
                  >
                    <span className="flex-1 font-mono text-text-primary truncate">{p.path}</span>
                    <button
                      onClick={() => toggleProd(i)}
                      className={cn(
                        "px-1.5 py-0.5 text-label font-medium rounded border transition-all",
                        p.isProd
                          ? "bg-error/15 text-error border-error/30"
                          : "bg-bg-elevated text-text-tertiary border-transparent hover:border-border-default",
                      )}
                    >
                      {p.isProd ? "PROD" : "dev"}
                    </button>
                    <button
                      onClick={() => removeProject(i)}
                      className="p-0.5 text-text-tertiary hover:text-error transition-all"
                    >
                      <CloseIcon className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Add project */}
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addProject();
                }}
                placeholder="/path/to/project"
                className="flex-1 px-2 py-1 text-body font-mono bg-bg-base border border-border-default rounded text-text-primary placeholder:text-text-tertiary focus:border-[#f59e0b]/40 focus:outline-none"
              />
              <button
                onClick={addProject}
                disabled={!newPath.trim()}
                className="flex items-center gap-1 px-2 py-1 text-label bg-bg-elevated text-text-tertiary hover:text-rooms rounded transition-all disabled:opacity-50"
              >
                <PlusIcon className="w-3 h-3" />
                Add
              </button>
            </div>
          </div>

          {/* Agent System */}
          <div>
            <label className="text-label text-text-secondary block mb-1.5">
              <BrainIcon className="w-3 h-3 inline mr-1 -mt-0.5" />
              Agent System
            </label>
            {config.agentSystem ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-2 py-1.5 bg-bg-base border border-border-default rounded text-body">
                  <CheckIcon className="w-3 h-3 text-sessions shrink-0" />
                  <span className="flex-1 font-mono text-text-primary truncate">
                    {config.agentSystem.path}
                  </span>
                </div>
                {config.projects.length > 0 && (
                  <button
                    onClick={() => void regenerateAgents()}
                    disabled={regenerating}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-label font-medium text-rooms bg-rooms/10 hover:bg-rooms/20 rounded border border-rooms/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100"
                  >
                    {regenerating ? (
                      <SpinnerIcon className="w-3 h-3 animate-spin" />
                    ) : (
                      <SparkleIcon className="w-3 h-3" />
                    )}
                    {regenerating ? "Generating..." : "Regenerate Agents with AI"}
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-start gap-2 px-3 py-2.5 bg-sprints/5 border border-sprints/20 rounded text-body">
                  <WarningIcon className="w-3.5 h-3.5 text-sprints shrink-0 mt-0.5" />
                  <div className="space-y-1.5">
                    <p className="text-text-primary font-medium">No agent system detected</p>
                    <p className="text-text-secondary leading-relaxed">
                      Teams, Memory, and Workflows need an{" "}
                      <code className="text-rooms bg-bg-elevated px-1 py-0.5 rounded text-label">
                        ai-agents/
                      </code>{" "}
                      folder in your project.
                    </p>
                  </div>
                </div>
                {config.projects.length > 0 && (
                  <button
                    onClick={() => setShowScaffold(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-label font-medium text-rooms bg-rooms/10 hover:bg-rooms/20 rounded border border-rooms/20 active:scale-[0.98] transition-all"
                  >
                    <PlusIcon className="w-3 h-3" />
                    Create Agent System
                  </button>
                )}
                <p className="text-label text-text-tertiary leading-relaxed pl-0.5">
                  This creates: <code className="text-text-secondary">ai-agents/memory/</code>,{" "}
                  <code className="text-text-secondary">ai-agents/sprints/</code>,{" "}
                  <code className="text-text-secondary">ai-agents/tools/</code>, and{" "}
                  <code className="text-text-secondary">.claude/agents/</code> with your custom
                  agent definitions.
                </p>
              </div>
            )}
          </div>

          {/* Working Directory */}
          <div>
            <label className="text-label text-text-secondary block mb-1">
              Default Working Directory
            </label>
            <span className="text-body font-mono text-text-primary">
              {config.defaults.workingDirectory}
            </span>
          </div>

          {/* Reset */}
          <div className="flex justify-end pt-1">
            <button
              onClick={resetSetup}
              className="flex items-center gap-1.5 px-3 py-1.5 text-label font-medium text-text-tertiary hover:text-text-secondary rounded border border-border-default hover:border-text-secondary active:scale-[0.98] transition-all"
            >
              <RefreshIcon className="w-3 h-3" />
              Re-run Setup Wizard
            </button>
          </div>
        </div>
      </section>

      {showScaffold && config.projects.length > 0 && (
        <ScaffoldDialog
          projectPath={config.projects[0].path}
          onComplete={handleScaffoldComplete}
          onCancel={() => setShowScaffold(false)}
        />
      )}
    </>
  );
}
