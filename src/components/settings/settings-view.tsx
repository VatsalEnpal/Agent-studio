"use client";

import { useState, useEffect, useCallback } from "react";
import { useSettingsStore } from "@/stores/settings";
import { cn } from "@/lib/utils";
import {
  SettingsIcon,
  FolderIcon,
  UserIcon,
  MonitorIcon,
  SprintsIcon,
  BoltIcon,
  InfoIcon,
} from "@/components/ui/icons";
import { SettingsWorkspace } from "./settings-workspace";
import { SettingsGeneral } from "./settings-general";
import { SettingsPmo } from "./settings-pmo";
import { SettingsAutomations } from "./settings-automations";
import { SettingsMonitor } from "./settings-monitor";
import { SettingsShortcuts } from "./settings-shortcuts";
import { SettingsAbout } from "./settings-about";
import { SettingsNotifications } from "./settings-notifications";
import { CreateAgentDialog } from "@/components/agents/create-agent-dialog";
import { BrowseTemplatesDialog } from "@/components/agents/browse-templates-dialog";
import { PlusIcon, CloseIcon } from "@/components/ui/icons";
import { useToastStore } from "@/stores/toast";
import { invalidateConfigCache, useConfig } from "@/hooks/use-config";

type SettingsTab =
  | "general"
  | "projects"
  | "agents"
  | "dev-servers"
  | "sprint-protocol"
  | "shortcuts"
  | "about";

const TABS: {
  id: SettingsTab;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  desc: string;
}[] = [
  { id: "general", label: "General", icon: SettingsIcon, desc: "Model, theme, notifications" },
  { id: "projects", label: "Projects", icon: FolderIcon, desc: "Tracked repos and agent system" },
  { id: "agents", label: "Agents", icon: UserIcon, desc: "Discovered agent definitions" },
  {
    id: "dev-servers",
    label: "System Monitor",
    icon: MonitorIcon,
    desc: "CPU, memory, disk, active processes",
  },
  {
    id: "sprint-protocol",
    label: "Automations",
    icon: SprintsIcon,
    desc: "Sprint protocol, PMO scans, scheduled tasks",
  },
  { id: "shortcuts", label: "Shortcuts", icon: BoltIcon, desc: "Keyboard shortcuts reference" },
  { id: "about", label: "About", icon: InfoIcon, desc: "Version and system info" },
];

export function SettingsView() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const setSystemStats = useSettingsStore((s) => s.setSystemStats);
  const setStatsLoading = useSettingsStore((s) => s.setStatsLoading);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);

  // Poll system stats every 5 seconds
  useEffect(() => {
    let active = true;

    const fetchStats = () => {
      fetch("/api/system/stats")
        .then((r) => r.json())
        .then((data) => {
          if (active) setSystemStats(data);
        })
        .catch(() => {
          /* ignore */
        })
        .finally(() => {
          if (active) setStatsLoading(false);
        });
    };

    setStatsLoading(true);
    fetchStats();
    const interval = setInterval(fetchStats, 15_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [setSystemStats, setStatsLoading]);

  // Load saved settings on mount (fetches from server, applies config defaults)
  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  return (
    <div className="flex h-full">
      {/* Tab sidebar */}
      <div className="w-[200px] shrink-0 border-r border-border-default bg-bg-surface py-3 px-2 space-y-0.5">
        {TABS.map((tab) => {
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "w-full text-left px-3 py-2 rounded transition-all group",
                activeTab === tab.id
                  ? "bg-bg-elevated text-text-primary"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-elevated/50",
              )}
            >
              <div className="flex items-center gap-2">
                <TabIcon
                  size={12}
                  className={cn(
                    "shrink-0",
                    activeTab === tab.id ? "text-text-primary" : "text-text-ghost",
                  )}
                />
                <span className="text-xs font-medium">{tab.label}</span>
              </div>
              <p
                className={cn(
                  "text-2xs mt-0.5 pl-5 leading-snug",
                  activeTab === tab.id ? "text-text-tertiary" : "text-text-ghost",
                )}
              >
                {tab.desc}
              </p>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-3xl mx-auto px-5 py-6 space-y-6">
          {activeTab === "general" && (
            <>
              <SettingsGeneral />
              <SettingsNotifications />
            </>
          )}
          {activeTab === "projects" && <SettingsWorkspace />}
          {activeTab === "agents" && <SettingsAgentsDiscovery />}
          {activeTab === "dev-servers" && <SettingsMonitor />}
          {activeTab === "sprint-protocol" && (
            <>
              <SettingsPmo />
              <SettingsAutomations />
            </>
          )}
          {activeTab === "shortcuts" && <SettingsShortcuts />}
          {activeTab === "about" && <SettingsAbout />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agents tab — two sections: Sources (config.agentSources) + Agents (discovered)
// Plan task 11.
// ---------------------------------------------------------------------------

interface AgentRecord {
  id: string;
  name: string;
  description: string;
  model?: string;
  icon?: string;
  sourcePath?: string;
  scope?: "global" | { project: string };
}

interface SourceRecord {
  path: string;
  scope: "global" | { project: string };
  label?: string;
}

function SettingsAgentsDiscovery() {
  const { config } = useConfig();
  const addToast = useToastStore((s) => s.addToast);

  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<{
    id: string;
    name: string;
    description?: string;
    model?: "opus" | "sonnet" | "haiku" | "inherit";
    icon?: string;
    sourcePath: string;
  } | null>(null);

  const sources: SourceRecord[] = config?.config.agentSources ?? [];

  const loadAgents = useCallback((refresh = false) => {
    setLoading(true);
    const url = refresh ? "/api/agents?refresh=1" : "/api/agents";
    fetch(url)
      .then((r) => r.json())
      .then((data: AgentRecord[]) => {
        setAgents(Array.isArray(data) ? data : []);
      })
      .catch(() => setAgents([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  // Count agents per source, keyed by source path.
  const countBySource = new Map<string, number>();
  for (const a of agents) {
    if (a.sourcePath) {
      countBySource.set(a.sourcePath, (countBySource.get(a.sourcePath) ?? 0) + 1);
    }
  }

  const refreshConfigAndAgents = useCallback(async () => {
    // invalidateConfigCache() now re-fetches /api/config AND notifies every
    // useConfig() consumer via pub/sub, so the Sources list updates in place.
    invalidateConfigCache();
    loadAgents(true);
  }, [loadAgents]);

  const handleRemoveSource = async (source: SourceRecord) => {
    if (
      !window.confirm(
        `Remove source "${source.path}"?\n\nFiles on disk are NOT deleted. Agents from this source will no longer appear in the agent list.`,
      )
    ) {
      return;
    }
    try {
      // M4: signature-keyed delete (path + scope) instead of array index.
      const res = await fetch(`/api/config/agent-sources`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: source.path, scope: source.scope }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Failed to remove source (${res.status})`);
      }
      addToast("Source removed", "success");
      // M5: refresh in place — no full page reload.
      await refreshConfigAndAgents();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Unknown error", "error");
    }
  };

  const handleDeleteAgent = async (agent: AgentRecord) => {
    if (!agent.sourcePath) {
      addToast("Cannot delete: agent has no sourcePath", "error");
      return;
    }
    if (
      !window.confirm(`Delete agent "${agent.name}"?\n\nThe .md file will be removed from disk.`)
    ) {
      return;
    }
    try {
      const res = await fetch(
        `/api/agents/${encodeURIComponent(agent.id)}?sourcePath=${encodeURIComponent(agent.sourcePath)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Failed to delete agent (${res.status})`);
      }
      addToast(`Agent "${agent.name}" deleted`, "success");
      loadAgents(true);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Unknown error", "error");
    }
  };

  const handleEditAgent = (agent: AgentRecord) => {
    if (!agent.sourcePath) {
      addToast("Cannot edit: agent has no sourcePath", "error");
      return;
    }
    const model =
      agent.model === "opus" || agent.model === "sonnet" || agent.model === "haiku"
        ? agent.model
        : "inherit";
    setEditingAgent({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      model,
      icon: agent.icon,
      sourcePath: agent.sourcePath,
    });
  };

  return (
    <>
      {/* ---------- Sources section ---------- */}
      <section className="border border-border-default rounded bg-bg-surface">
        <div className="px-4 py-3 border-b border-border-default flex items-start justify-between">
          <div>
            <h3 className="text-xs font-medium text-text-primary">Sources</h3>
            <p className="text-label text-text-tertiary mt-0.5">
              Directories scanned for agent <code className="text-text-secondary">.md</code> files
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setAddSourceOpen(true)}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-accent text-bg-base rounded-[4px] hover:bg-accent/90 transition-all"
            >
              <PlusIcon size={10} />
              Add source
            </button>
          </div>
        </div>
        <div className="px-4 py-3">
          {sources.length === 0 ? (
            <p className="text-xs text-text-tertiary text-center py-4">
              No agent sources configured.
            </p>
          ) : (
            <div className="space-y-1.5">
              {sources.map((src, idx) => {
                const count = countBySource.get(src.path) ?? 0;
                const isGlobal = src.scope === "global";
                const scopeLabel = isGlobal
                  ? "Global"
                  : `Project: ${basename(typeof src.scope === "object" ? src.scope.project : "")}`;
                return (
                  <div
                    key={`${src.path}-${idx}`}
                    className="flex items-center gap-3 px-3 py-2 bg-bg-base border border-border-default rounded"
                  >
                    <span
                      className="text-label px-1.5 py-0.5 rounded bg-bg-elevated text-text-tertiary shrink-0"
                      title={scopeLabel}
                    >
                      {isGlobal ? "● Global" : `◆ ${scopeLabel}`}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-xs text-text-primary font-mono truncate"
                        title={src.path}
                        dir="rtl"
                        style={{ textAlign: "left" }}
                      >
                        {src.path}
                      </p>
                      {src.label && (
                        <p className="text-2xs text-text-ghost truncate">{src.label}</p>
                      )}
                    </div>
                    <span className="text-label text-text-tertiary shrink-0 tabular-nums">
                      {count} agent{count === 1 ? "" : "s"}
                    </span>
                    <button
                      onClick={() => void handleRemoveSource(src)}
                      className="p-1 text-text-ghost hover:text-error transition-all shrink-0"
                      title="Remove source"
                    >
                      <CloseIcon size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ---------- Agents section ---------- */}
      <section className="border border-border-default rounded bg-bg-surface">
        <div className="px-4 py-3 border-b border-border-default flex items-start justify-between">
          <div>
            <h3 className="text-xs font-medium text-text-primary">Agents</h3>
            <p className="text-label text-text-tertiary mt-0.5">
              Discovered across every configured source
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => loadAgents(true)}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-bg-elevated border border-border-default text-text-secondary rounded-[4px] hover:text-text-primary hover:border-border-subtle transition-all"
            >
              Refresh
            </button>
            <button
              onClick={() => setBrowseOpen(true)}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-bg-elevated border border-border-default text-text-secondary rounded-[4px] hover:text-text-primary hover:border-border-subtle transition-all"
            >
              Browse Templates
            </button>
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-accent text-bg-base rounded-[4px] hover:bg-accent/90 transition-all"
            >
              <PlusIcon size={10} />
              Create Agent
            </button>
          </div>
        </div>
        <div className="px-4 py-3">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="skeleton h-4 w-20" />
                  <div className="skeleton h-3 w-40" />
                </div>
              ))}
            </div>
          ) : agents.filter((a) => a.id !== "none").length === 0 ? (
            <p className="text-xs text-text-tertiary text-center py-4">No agents discovered.</p>
          ) : (
            <div className="space-y-1.5">
              {agents
                .filter((a) => a.id !== "none")
                .map((agent) => {
                  const isGlobal = agent.scope === "global";
                  const scopeBadge = agent.scope
                    ? isGlobal
                      ? "● Global"
                      : `◆ ${basename(typeof agent.scope === "object" ? agent.scope.project : "")}`
                    : null;
                  return (
                    <div
                      key={`${agent.sourcePath ?? "_"}/${agent.id}`}
                      className="flex items-center gap-3 px-3 py-2 bg-bg-base border border-border-default rounded"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium text-text-primary">
                            {agent.icon ? `${agent.icon} ` : ""}
                            {agent.name}
                          </span>
                          {agent.model && (
                            <span className="text-label px-1.5 py-0.5 rounded bg-bg-elevated text-text-tertiary font-mono">
                              {agent.model}
                            </span>
                          )}
                          {scopeBadge && (
                            <span className="text-label px-1.5 py-0.5 rounded bg-bg-elevated text-text-tertiary">
                              {scopeBadge}
                            </span>
                          )}
                          {agent.sourcePath && (
                            <span
                              className="text-2xs text-text-ghost font-mono truncate max-w-[240px]"
                              title={agent.sourcePath}
                            >
                              {agent.sourcePath}
                            </span>
                          )}
                        </div>
                        <p className="text-label text-text-secondary mt-0.5 truncate">
                          {agent.description}
                        </p>
                      </div>
                      {agent.sourcePath && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleEditAgent(agent)}
                            className="px-2 py-1 text-2xs text-text-secondary hover:text-text-primary bg-bg-elevated border border-border-default rounded-[4px] hover:border-border-subtle transition-all"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => void handleDeleteAgent(agent)}
                            className="px-2 py-1 text-2xs text-text-secondary hover:text-error bg-bg-elevated border border-border-default rounded-[4px] hover:border-error/40 transition-all"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </section>

      <CreateAgentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => loadAgents(true)}
      />
      <CreateAgentDialog
        open={!!editingAgent}
        onOpenChange={(o) => {
          if (!o) setEditingAgent(null);
        }}
        editingAgent={editingAgent ?? undefined}
        onCreated={() => loadAgents(true)}
      />
      <BrowseTemplatesDialog
        open={browseOpen}
        onOpenChange={setBrowseOpen}
        onImported={() => loadAgents(true)}
      />
      <AddSourceDialog
        open={addSourceOpen}
        onOpenChange={setAddSourceOpen}
        onAdded={() => {
          // M5: refresh in place — no full page reload.
          void refreshConfigAndAgents();
        }}
        projects={config?.config.projects ?? []}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Add Source dialog — small modal for plan task 11
// ---------------------------------------------------------------------------

function basename(p: string): string {
  if (!p) return "";
  const parts = p.split(/[/\\]/);
  return parts[parts.length - 1] || p;
}

interface AddSourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
  projects: Array<{ name: string; path: string }>;
}

function AddSourceDialog({ open, onOpenChange, onAdded, projects }: AddSourceDialogProps) {
  const addToast = useToastStore((s) => s.addToast);
  const [path, setPath] = useState("");
  const [scopeKind, setScopeKind] = useState<"global" | "project">("global");
  const [projectPath, setProjectPath] = useState<string>("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPath("");
    setScopeKind("global");
    setProjectPath(projects[0]?.path ?? "");
    setLabel("");
    setError(null);
    setSaving(false);
  }, [open, projects]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const canSubmit = !!path.trim() && !saving && (scopeKind === "global" || !!projectPath.trim());

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const scope = scopeKind === "global" ? "global" : { project: projectPath.trim() };
      const res = await fetch("/api/config/agent-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: path.trim(),
          scope,
          label: label.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Failed to add source (${res.status})`);
      }
      addToast(`Source added: ${path.trim()}`, "success");
      onAdded();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, handleClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-bg-base/80 backdrop-blur-[2px]" onClick={handleClose} />
      <div className="relative w-full max-w-md bg-bg-surface border border-border-default rounded-[4px] shadow-modal overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <h2 className="text-xs font-medium text-text-primary">Add agent source</h2>
          <button
            onClick={handleClose}
            className="p-1 text-text-ghost hover:text-text-secondary transition-all"
          >
            <CloseIcon size={12} />
          </button>
        </div>
        <div className="px-4 py-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-label font-medium text-text-secondary uppercase tracking-wider">
              Path
            </label>
            <input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/tmp/custom-agents or ~/my-agents"
              className="w-full px-3 py-2 text-xs font-mono bg-bg-input border border-border-default rounded-[4px] text-text-primary placeholder:text-text-ghost focus:outline-none focus:border-[#f59e0b]/40 transition-all"
              autoFocus
            />
            <p className="text-2xs text-text-ghost">
              Absolute path. <code>~</code> is resolved at read time.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-label font-medium text-text-secondary uppercase tracking-wider">
              Scope
            </label>
            <div className="space-y-1">
              <label
                className={cn(
                  "flex items-center gap-2 px-2.5 py-2 rounded-[4px] cursor-pointer border transition-all",
                  scopeKind === "global"
                    ? "bg-accent/10 border-accent/30"
                    : "bg-bg-input border-border-default hover:border-border-subtle",
                )}
              >
                <input
                  type="radio"
                  name="add-source-scope"
                  checked={scopeKind === "global"}
                  onChange={() => setScopeKind("global")}
                  className="accent-accent"
                />
                <span className="text-xs text-text-primary">Global (every project)</span>
              </label>
              <label
                className={cn(
                  "flex items-center gap-2 px-2.5 py-2 rounded-[4px] cursor-pointer border transition-all",
                  scopeKind === "project"
                    ? "bg-accent/10 border-accent/30"
                    : "bg-bg-input border-border-default hover:border-border-subtle",
                )}
              >
                <input
                  type="radio"
                  name="add-source-scope"
                  checked={scopeKind === "project"}
                  onChange={() => setScopeKind("project")}
                  className="accent-accent"
                />
                <span className="text-xs text-text-primary">Project</span>
              </label>
            </div>
            {scopeKind === "project" && (
              <input
                type="text"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                placeholder="Project path"
                list="settings-agents-project-paths"
                className="w-full mt-1 px-3 py-2 text-xs font-mono bg-bg-input border border-border-default rounded-[4px] text-text-primary placeholder:text-text-ghost focus:outline-none focus:border-[#f59e0b]/40 transition-all"
              />
            )}
            <datalist id="settings-agents-project-paths">
              {projects.map((p) => (
                <option key={p.path} value={p.path}>
                  {p.name}
                </option>
              ))}
            </datalist>
          </div>

          <div className="space-y-1.5">
            <label className="text-label font-medium text-text-secondary uppercase tracking-wider">
              Label (optional)
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="My custom agents"
              className="w-full px-3 py-2 text-xs bg-bg-input border border-border-default rounded-[4px] text-text-primary placeholder:text-text-ghost focus:outline-none focus:border-[#f59e0b]/40 transition-all"
            />
          </div>

          {error && (
            <p className="text-xs text-error bg-error/10 border border-error/30 rounded-[4px] px-3 py-2">
              {error}
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border-default">
          <button
            onClick={handleClose}
            className="px-3 py-1.5 text-xs font-medium rounded-[4px] text-text-secondary hover:text-text-primary transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={!canSubmit}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-[4px] transition-all",
              canSubmit
                ? "bg-accent text-bg-base hover:bg-accent/90"
                : "bg-bg-elevated text-text-ghost cursor-not-allowed",
            )}
          >
            {saving ? "Adding..." : "Add source"}
          </button>
        </div>
      </div>
    </div>
  );
}
