"use client";

import { useState, useEffect } from "react";
import { SaveIcon, CheckIcon } from "@/components/ui/icons";
import { useSettingsStore } from "@/stores/settings";
import { useToastStore } from "@/stores/toast";
import { cn } from "@/lib/utils";

export function SettingsGeneral() {
  const settings = useSettingsStore((s) => s.settings);
  const settingsLoaded = useSettingsStore((s) => s.settingsLoaded);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const addToast = useToastStore((s) => s.addToast);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Sync default model from /api/config (the canonical source used by session
  // launcher) so the Settings page displays the same value sessions actually use.
  const [configSynced, setConfigSynced] = useState(false);
  useEffect(() => {
    if (configSynced) return;
    void (async () => {
      try {
        const res = await fetch("/api/config");
        if (res.ok) {
          const data = (await res.json()) as Record<string, unknown>;
          const config = data.config as Record<string, unknown> | undefined;
          const defaults = (config?.defaults ?? data.defaults) as
            | {
                model?: "opus" | "sonnet" | "haiku";
                permissions?: "bypass" | "default" | "plan";
                workingDirectory?: string;
              }
            | undefined;
          if (defaults?.model) {
            updateSetting("defaultModel", defaults.model);
          }
          if (defaults?.permissions) {
            updateSetting(
              "defaultPermissions",
              defaults.permissions as "bypass" | "default" | "plan",
            );
          }
          if (defaults?.workingDirectory) {
            updateSetting("defaultCwd", defaults.workingDirectory);
          }
        }
      } catch {
        // Fall back to whatever the store already has
      }
      setConfigSynced(true);
    })();
  }, [configSynced, updateSetting]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setSaved(true);
        addToast("Settings saved", "success");
        setTimeout(() => setSaved(false), 2000);
      } else {
        addToast("Failed to save settings", "error");
      }
    } catch {
      addToast("Failed to save settings", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="border border-border-default rounded bg-bg-surface">
      <div className="px-4 py-3 border-b border-border-default">
        <h3 className="text-body font-medium text-text-primary">General</h3>
      </div>
      <div className="px-4 py-3 space-y-4">
        {!settingsLoaded ? (
          <div className="space-y-4">
            <div>
              <div className="skeleton h-3 w-24 mb-1.5" />
              <div className="flex items-center gap-2">
                <div className="skeleton h-6 w-14 rounded" />
                <div className="skeleton h-6 w-14 rounded" />
                <div className="skeleton h-6 w-14 rounded" />
              </div>
            </div>
            <div>
              <div className="skeleton h-3 w-32 mb-1.5" />
              <div className="skeleton h-8 w-48 rounded" />
            </div>
            <div>
              <div className="skeleton h-3 w-40 mb-1.5" />
              <div className="skeleton h-8 w-full rounded" />
            </div>
          </div>
        ) : (
          <>
            {/* Default Model */}
            <div>
              <label className="text-label text-text-secondary block mb-1.5">Default Model</label>
              <div className="flex items-center gap-2">
                {(["opus", "sonnet", "haiku"] as const).map((model) => (
                  <button
                    key={model}
                    onClick={() => updateSetting("defaultModel", model)}
                    className={cn(
                      "px-1.5 py-0.5 text-label font-medium rounded transition-all active:scale-[0.98]",
                      settings.defaultModel === model
                        ? model === "opus"
                          ? "bg-memory/15 text-memory border border-memory/30"
                          : model === "haiku"
                            ? "bg-sessions/15 text-sessions border border-sessions/30"
                            : "bg-rooms/15 text-rooms border border-rooms/30"
                        : "bg-bg-elevated text-text-tertiary hover:text-text-secondary border border-border-default",
                    )}
                  >
                    {model}
                  </button>
                ))}
              </div>
            </div>

            {/* Default Permissions */}
            <div>
              <label className="text-label text-text-secondary block mb-1.5">
                Default Permissions
              </label>
              <select
                value={settings.defaultPermissions}
                onChange={(e) =>
                  updateSetting(
                    "defaultPermissions",
                    e.target.value as "bypass" | "default" | "plan",
                  )
                }
                className="px-2 py-1.5 text-label bg-bg-base border border-border-default rounded text-text-primary focus:outline-none focus:border-border-subtle"
              >
                <option value="bypass">Bypass (skip permissions)</option>
                <option value="default">Default</option>
                <option value="plan">Plan mode</option>
              </select>
            </div>

            {/* Default Working Directory */}
            <div>
              <label className="text-label text-text-secondary block mb-1.5">
                Default Working Directory
              </label>
              <input
                type="text"
                value={settings.defaultCwd}
                onChange={(e) => updateSetting("defaultCwd", e.target.value)}
                className="w-full px-2 py-1.5 text-body font-mono bg-bg-base border border-border-default rounded text-text-primary focus:outline-none focus:border-border-subtle"
              />
            </div>

            {/* Save button */}
            <div className="flex justify-end">
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-label font-medium rounded transition-all active:scale-[0.98]",
                  saved
                    ? "bg-sessions/20 text-sessions"
                    : "bg-rooms/20 text-rooms hover:bg-rooms/30",
                )}
              >
                {saved ? <CheckIcon className="w-3 h-3" /> : <SaveIcon className="w-3 h-3" />}
                {saving ? "Saving..." : saved ? "Saved" : "Save Settings"}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
