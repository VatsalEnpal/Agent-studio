"use client";

import { useState, useEffect } from "react";
import { Bell } from "lucide-react";
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
    desc: "When a session hits 90% context",
  },
];

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-console-text flex items-center gap-2">
          <Bell className="w-4 h-4" /> Notifications
        </h3>
        <button
          onClick={handleTest}
          className="text-[10px] text-console-dim hover:text-console-muted transition-colors"
        >
          Test
        </button>
      </div>

      {NOTIFICATION_OPTIONS.map(({ key, label, desc }) => (
        <label key={key} className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={prefs[key]}
            onChange={() => toggle(key)}
            className="mt-0.5 accent-amber-500"
          />
          <div>
            <span className="text-xs text-console-text group-hover:text-console-accent transition-colors">
              {label}
            </span>
            <p className="text-[10px] text-console-dim">{desc}</p>
          </div>
        </label>
      ))}
    </div>
  );
}
