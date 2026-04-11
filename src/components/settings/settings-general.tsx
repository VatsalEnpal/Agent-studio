"use client";

import { useState } from "react";
import { Save, Check } from "lucide-react";
import { useSettingsStore } from "@/stores/settings";
import { useToastStore } from "@/stores/toast";
import { cn } from "@/lib/utils";

export function SettingsGeneral() {
  const settings = useSettingsStore((s) => s.settings);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const addToast = useToastStore((s) => s.addToast);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
    <section className="border border-console-border rounded-lg bg-console-panel">
      <div className="px-4 py-3 border-b border-console-border">
        <h3 className="text-xs font-medium text-console-text">General</h3>
      </div>
      <div className="px-4 py-3 space-y-4">
        {/* Default Model */}
        <div>
          <label className="text-[10px] text-console-muted block mb-1.5">Default Model</label>
          <div className="flex items-center gap-2">
            {(["opus", "sonnet", "haiku"] as const).map((model) => (
              <button
                key={model}
                onClick={() => updateSetting("defaultModel", model)}
                className={cn(
                  "px-3 py-1.5 text-[10px] font-medium rounded transition-all",
                  settings.defaultModel === model
                    ? model === "opus"
                      ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                      : model === "haiku"
                        ? "bg-teal-500/20 text-teal-400 border border-teal-500/30"
                        : "bg-console-accent/20 text-console-accent border border-console-accent/30"
                    : "bg-console-faint text-console-dim hover:text-console-muted border border-transparent",
                )}
              >
                {model}
              </button>
            ))}
          </div>
        </div>

        {/* Default Permissions */}
        <div>
          <label className="text-[10px] text-console-muted block mb-1.5">Default Permissions</label>
          <select
            value={settings.defaultPermissions}
            onChange={(e) => updateSetting("defaultPermissions", e.target.value as "bypass" | "default" | "plan")}
            className="px-2 py-1.5 text-[10px] bg-console-bg border border-console-border rounded text-console-text focus:outline-none focus:border-console-accent"
          >
            <option value="bypass">Bypass (skip permissions)</option>
            <option value="default">Default</option>
            <option value="plan">Plan mode</option>
          </select>
        </div>

        {/* Default Working Directory */}
        <div>
          <label className="text-[10px] text-console-muted block mb-1.5">Default Working Directory</label>
          <input
            type="text"
            value={settings.defaultCwd}
            onChange={(e) => updateSetting("defaultCwd", e.target.value)}
            className="w-full px-2 py-1.5 text-[10px] font-mono bg-console-bg border border-console-border rounded text-console-text focus:outline-none focus:border-console-accent"
          />
        </div>

        {/* Save button */}
        <div className="flex justify-end">
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium rounded transition-all",
              saved
                ? "bg-console-success/20 text-console-success"
                : "bg-console-accent/20 text-console-accent hover:bg-console-accent/30",
            )}
          >
            {saved ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
            {saving ? "Saving..." : saved ? "Saved" : "Save Settings"}
          </button>
        </div>
      </div>
    </section>
  );
}
