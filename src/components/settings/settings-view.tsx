"use client";

import { useState, useEffect } from "react";
import { useSettingsStore, type AppSettings } from "@/stores/settings";
import { cn } from "@/lib/utils";
import { SettingsWorkspace } from "./settings-workspace";
import { SettingsGeneral } from "./settings-general";
import { SettingsPmo } from "./settings-pmo";
import { SettingsAutomations } from "./settings-automations";
import { SettingsMonitor } from "./settings-monitor";
import { SettingsShortcuts } from "./settings-shortcuts";
import { SettingsAbout } from "./settings-about";
import { SettingsNotifications } from "./settings-notifications";

type SettingsTab =
  | "general"
  | "projects"
  | "agents"
  | "dev-servers"
  | "sprint-protocol"
  | "shortcuts"
  | "about";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "projects", label: "Projects" },
  { id: "agents", label: "Agents" },
  { id: "dev-servers", label: "Dev Servers" },
  { id: "sprint-protocol", label: "Sprint Protocol" },
  { id: "shortcuts", label: "Shortcuts" },
  { id: "about", label: "About" },
];

export function SettingsView() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const setSystemStats = useSettingsStore((s) => s.setSystemStats);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const setStatsLoading = useSettingsStore((s) => s.setStatsLoading);

  // Poll system stats every 5 seconds
  useEffect(() => {
    let active = true;

    const fetchStats = () => {
      fetch("/api/system/stats")
        .then((r) => r.json())
        .then((data) => {
          if (active) setSystemStats(data);
        })
        .catch(() => { /* ignore */ })
        .finally(() => { if (active) setStatsLoading(false); });
    };

    setStatsLoading(true);
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => { active = false; clearInterval(interval); };
  }, [setSystemStats, setStatsLoading]);

  // Load saved settings on mount
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: AppSettings) => {
        if (data && data.defaultModel) {
          setSettings(data);
        }
      })
      .catch(() => { /* use defaults */ });
  }, [setSettings]);

  return (
    <div className="flex h-full">
      {/* Tab sidebar */}
      <div className="w-[180px] shrink-0 border-r border-border-default bg-bg-surface py-3 px-2 space-y-0.5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "w-full text-left px-3 py-1.5 text-[10px] font-medium rounded-md transition-colors",
              activeTab === tab.id
                ? "bg-bg-elevated text-text-primary"
                : "text-text-secondary hover:text-text-primary hover:bg-bg-elevated/50",
            )}
          >
            {tab.label}
          </button>
        ))}
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

/**
 * Auto-discovered agent list from .claude/agents/
 */
function SettingsAgentsDiscovery() {
  const [agents, setAgents] = useState<
    Array<{ id: string; name: string; description: string; model: string }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then(
        (
          data: Array<{
            id: string;
            name: string;
            description: string;
            model: string;
          }>,
        ) => {
          setAgents(Array.isArray(data) ? data : []);
        },
      )
      .catch(() => setAgents([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="border border-border-default rounded-lg bg-bg-surface">
      <div className="px-4 py-3 border-b border-border-default">
        <h3 className="text-[10px] font-medium text-text-primary">Agents</h3>
        <p className="text-label text-text-tertiary mt-0.5">
          Auto-discovered from <code className="text-text-secondary bg-bg-elevated px-1 py-0.5 rounded text-label">.claude/agents/</code>
        </p>
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
        ) : agents.length === 0 ? (
          <p className="text-[10px] text-text-tertiary text-center py-4">
            No agents discovered. Create agent definitions in <code className="text-text-secondary">.claude/agents/</code>.
          </p>
        ) : (
          <div className="space-y-2">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center gap-3 px-3 py-2 bg-bg-base border border-border-default rounded-md"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium text-text-primary">
                      {agent.name}
                    </span>
                    <span className="text-label px-1.5 py-0.5 rounded bg-bg-elevated text-text-tertiary font-mono">
                      {agent.model}
                    </span>
                  </div>
                  <p className="text-label text-text-secondary mt-0.5 truncate">
                    {agent.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
