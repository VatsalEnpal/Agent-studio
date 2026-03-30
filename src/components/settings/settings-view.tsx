"use client";

import { useEffect, useCallback } from "react";
import { useSettingsStore, type AppSettings } from "@/stores/settings";
import { SettingsWorkspace } from "./settings-workspace";
import { SettingsGeneral } from "./settings-general";
import { SettingsPmo } from "./settings-pmo";
import { SettingsAutomations } from "./settings-automations";
import { SettingsMonitor } from "./settings-monitor";
import { SettingsShortcuts } from "./settings-shortcuts";
import { SettingsAbout } from "./settings-about";

export function SettingsView() {
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
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        <SettingsWorkspace />
        <SettingsGeneral />
        <SettingsPmo />
        <SettingsAutomations />
        <SettingsMonitor />
        <SettingsShortcuts />
        <SettingsAbout />
      </div>
    </div>
  );
}
