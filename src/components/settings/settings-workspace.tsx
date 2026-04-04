"use client";

import { useState, useEffect, useCallback } from "react";
import { FolderOpen, Plus, X, ArrowClockwise, Warning, Check, Brain, SpinnerGap, Sparkle } from "@phosphor-icons/react";
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
          const data = await res.json() as { config: WorkspaceConfig };
          setConfig(data.config);
        }
      } catch {
        // ignore
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
      } catch {
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
        projects: config.projects.map((p, i) =>
          i === idx ? { ...p, isProd: !p.isProd } : p,
        ),
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
        const err = await genRes.json() as { error?: string };
        throw new Error(err.error ?? "Generation failed");
      }
      const genData = await genRes.json() as {
        agents: Array<{ id: string; name: string; description: string; model: string; mdContent: string }>;
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
      const result = await applyRes.json() as { created: string[] };

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
      <section className="border border-console-border/60 rounded-xl console-panel-bg shadow-card">
        <div className="px-5 py-3.5 border-b border-console-border/60">
          <h3 className="text-xs font-medium text-console-text">Workspace</h3>
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
      <section className="border border-console-border/60 rounded-xl console-panel-bg shadow-card">
        <div className="px-5 py-3.5 border-b border-console-border/60 flex items-center justify-between">
          <h3 className="text-body-sm font-medium text-console-text">Workspace</h3>
          <span className="text-label-xs text-console-dim font-mono">
            .agent-studio.json v{config.version}
          </span>
        </div>
        <div className="px-5 py-4 space-y-5">
          {/* Projects */}
          <div>
            <label className="text-label-xs text-console-muted block mb-1.5">
              <FolderOpen className="w-3 h-3 inline mr-1 -mt-0.5" />
              Tracked Projects
            </label>
            <div className="space-y-1.5">
              {config.projects.map((p, i) => (
                <div
                  key={`${p.path}-${i}`}
                  className="flex items-center gap-2 px-2 py-1.5 bg-console-bg border border-console-border rounded text-body-sm"
                >
                  <span className="flex-1 font-mono text-console-text truncate">
                    {p.path}
                  </span>
                  <button
                    onClick={() => toggleProd(i)}
                    className={cn(
                      "px-1.5 py-0.5 text-label-xs font-medium rounded border transition-colors",
                      p.isProd
                        ? "bg-red-500/15 text-red-400 border-red-500/30"
                        : "bg-console-faint text-console-dim border-transparent hover:border-console-border",
                    )}
                  >
                    {p.isProd ? "PROD" : "dev"}
                  </button>
                  <button
                    onClick={() => removeProject(i)}
                    className="p-0.5 text-console-dim hover:text-console-error transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
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
                className="flex-1 px-2 py-1 text-body-sm font-mono bg-console-bg border border-console-border rounded text-console-text placeholder:text-console-dim focus:border-console-accent focus:outline-none"
              />
              <button
                onClick={addProject}
                disabled={!newPath.trim()}
                className="flex items-center gap-1 px-2 py-1 text-label-xs bg-console-faint text-console-dim hover:text-console-accent rounded transition-colors disabled:opacity-50"
              >
                <Plus className="w-3 h-3" />
                Add
              </button>
            </div>
          </div>

          {/* Agent System */}
          <div>
            <label className="text-label-xs text-console-muted block mb-1.5">
              <Brain className="w-3 h-3 inline mr-1 -mt-0.5" />
              Agent System
            </label>
            {config.agentSystem ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-2 py-1.5 bg-console-bg border border-console-border rounded text-body-sm">
                  <Check className="w-3 h-3 text-console-success shrink-0" />
                  <span className="flex-1 font-mono text-console-text truncate">
                    {config.agentSystem.path}
                  </span>
                </div>
                {config.projects.length > 0 && (
                  <button
                    onClick={() => void regenerateAgents()}
                    disabled={regenerating}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-label-xs font-medium text-console-accent bg-console-accent/10 hover:bg-console-accent/20 rounded border border-console-accent/20 transition-colors disabled:opacity-50"
                  >
                    {regenerating ? (
                      <SpinnerGap className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkle className="w-3 h-3" />
                    )}
                    {regenerating ? "Generating..." : "Regenerate Agents with AI"}
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-500/5 border border-amber-500/20 rounded text-body-sm">
                  <Warning className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1.5">
                    <p className="text-console-text font-medium">No agent system detected</p>
                    <p className="text-console-muted leading-relaxed">
                      Teams, Memory, and Workflows need an <code className="text-console-accent bg-console-faint px-1 py-0.5 rounded text-label-xs">ai-agents/</code> folder in your project.
                    </p>
                  </div>
                </div>
                {config.projects.length > 0 && (
                  <button
                    onClick={() => setShowScaffold(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-label-xs font-medium text-console-accent bg-console-accent/10 hover:bg-console-accent/20 rounded border border-console-accent/20 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Create Agent System
                  </button>
                )}
                <p className="text-label-xs text-console-dim leading-relaxed pl-0.5">
                  This creates: <code className="text-console-muted">ai-agents/memory/</code>, <code className="text-console-muted">ai-agents/sprints/</code>, <code className="text-console-muted">ai-agents/tools/</code>, and <code className="text-console-muted">.claude/agents/</code> with your custom agent definitions.
                </p>
              </div>
            )}
          </div>

          {/* Working Directory */}
          <div>
            <label className="text-label-xs text-console-muted block mb-1">
              Default Working Directory
            </label>
            <span className="text-body-sm font-mono text-console-text">
              {config.defaults.workingDirectory}
            </span>
          </div>

          {/* Reset */}
          <div className="flex justify-end pt-1">
            <button
              onClick={resetSetup}
              className="flex items-center gap-1.5 px-3 py-1.5 text-label-xs font-medium text-console-dim hover:text-console-muted rounded border border-console-border hover:border-console-muted transition-colors"
            >
              <ArrowClockwise className="w-3 h-3" />
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
