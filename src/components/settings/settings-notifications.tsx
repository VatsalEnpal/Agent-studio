"use client";

import { useState, useEffect } from "react";
import { BellIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import {
  notify,
  getNotificationPrefs,
  saveNotificationPrefs,
  type NotificationPrefs,
} from "@/lib/notifications";

const NOTIFICATION_OPTIONS: {
  key: keyof NotificationPrefs;
  label: string;
  desc: string;
}[] = [
  {
    key: "approvals",
    label: "Sprint gate approvals",
    desc: "When a sprint phase needs your sign-off",
  },
  {
    key: "dangerous",
    label: "Dangerous action alerts",
    desc: "When an agent wants to run destructive commands",
  },
  {
    key: "completion",
    label: "Agent task completion",
    desc: "When an agent finishes a task",
  },
  {
    key: "sessionExit",
    label: "Session exit",
    desc: "When a Claude session ends",
  },
  {
    key: "contextWarning",
    label: "Context window warnings",
    desc: "When a session hits 80%+ context usage",
  },
];

/** Toggle switch component */
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-4 w-8 items-center rounded-full transition-all shrink-0",
        checked ? "bg-sprints" : "bg-border-default",
      )}
    >
      <span
        className={cn(
          "inline-block h-3 w-3 rounded-full bg-white transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-[2px]",
        )}
      />
    </button>
  );
}

export function SettingsNotifications() {
  const [prefs, setPrefs] = useState<NotificationPrefs>(getNotificationPrefs);

  // Sync from localStorage on mount (in case another tab changed it)
  useEffect(() => {
    setPrefs(getNotificationPrefs());
  }, []);

  const toggle = (key: keyof NotificationPrefs) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    saveNotificationPrefs(updated);
  };

  const handleTest = () => {
    notify({ title: "Agent Studio", body: "Notifications are working!" });
  };

  return (
    <section className="border border-border-default rounded-lg bg-bg-surface">
      <div className="px-4 py-3 border-b border-border-default flex items-center justify-between">
        <h3 className="text-xs font-medium text-text-primary flex items-center gap-2">
          <BellIcon size={14} className="text-text-secondary" />
          Notifications
        </h3>
        <button
          onClick={handleTest}
          className="text-label text-text-ghost hover:text-text-tertiary transition-all"
        >
          Send Test
        </button>
      </div>

      <div className="px-4 py-3 space-y-4">
        <p className="text-2xs text-text-ghost border-l-2 border-border-default pl-2 leading-snug">
          Stored in this browser only. Settings will not sync across devices or browsers.
        </p>
        {NOTIFICATION_OPTIONS.map(({ key, label, desc }) => (
          <div key={key} className="flex items-start gap-2">
            <Toggle checked={prefs[key]} onChange={() => toggle(key)} label={label} />
            <div className="flex-1 min-w-0">
              <span className="text-xs text-text-primary block">
                {label}
              </span>
              <p className="text-2xs text-text-tertiary mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
