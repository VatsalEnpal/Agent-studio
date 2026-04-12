"use client";

import { useState, useCallback } from "react";
import { Bell, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface NotificationToggle {
  id: string;
  label: string;
  description: string;
  mac: boolean;
  telegram: boolean;
}

const DEFAULT_TOGGLES: NotificationToggle[] = [
  {
    id: "session-exit",
    label: "Session exit",
    description: "Agent session finishes or crashes",
    mac: true,
    telegram: false,
  },
  {
    id: "sprint-complete",
    label: "Sprint complete",
    description: "Sprint run reaches final step",
    mac: true,
    telegram: false,
  },
  {
    id: "approval-needed",
    label: "Approval needed",
    description: "Agent requests permission to proceed",
    mac: true,
    telegram: true,
  },
  {
    id: "cost-threshold",
    label: "Cost threshold",
    description: "Session spend exceeds $10",
    mac: false,
    telegram: false,
  },
  {
    id: "error",
    label: "Error",
    description: "Server error or agent crash",
    mac: true,
    telegram: false,
  },
];

function Toggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "relative w-7 h-4 rounded-full transition-colors shrink-0",
        enabled ? "bg-console-accent" : "bg-console-border",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform",
          enabled && "translate-x-3",
        )}
      />
    </button>
  );
}

export function SettingsNotifications() {
  const [toggles, setToggles] = useState<NotificationToggle[]>(
    DEFAULT_TOGGLES.map((t) => ({ ...t })),
  );

  const update = useCallback((id: string, channel: "mac" | "telegram") => {
    setToggles((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [channel]: !t[channel] } : t)),
    );
  }, []);

  return (
    <section className="border border-console-border rounded-lg bg-console-panel">
      <div className="px-4 py-3 border-b border-console-border">
        <h3 className="text-xs font-medium text-console-text">Notifications</h3>
        <p className="text-[10px] text-console-dim mt-0.5">
          Choose which events trigger notifications per channel.
        </p>
      </div>
      <div className="px-4 py-3">
        {/* Column headers */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1" />
          <div className="flex items-center gap-1 w-14 justify-center">
            <Bell className="w-3 h-3 text-console-dim" />
            <span className="text-[9px] text-console-dim uppercase tracking-wider">
              Mac
            </span>
          </div>
          <div className="flex items-center gap-1 w-14 justify-center">
            <MessageSquare className="w-3 h-3 text-console-dim" />
            <span className="text-[9px] text-console-dim uppercase tracking-wider">
              TG
            </span>
          </div>
        </div>

        {/* Toggle rows */}
        <div className="space-y-2">
          {toggles.map((t) => (
            <div key={t.id} className="flex items-center gap-3 py-1.5">
              <div className="flex-1 min-w-0">
                <span className="text-[11px] text-console-text block">
                  {t.label}
                </span>
                <span className="text-[9px] text-console-dim block">
                  {t.description}
                </span>
              </div>
              <div className="w-14 flex justify-center">
                <Toggle enabled={t.mac} onToggle={() => update(t.id, "mac")} />
              </div>
              <div className="w-14 flex justify-center">
                <Toggle
                  enabled={t.telegram}
                  onToggle={() => update(t.id, "telegram")}
                />
              </div>
            </div>
          ))}
        </div>

        <p className="text-[9px] text-console-dim mt-4">
          Settings are local to this browser session. Server-side persistence
          coming soon.
        </p>
      </div>
    </section>
  );
}
