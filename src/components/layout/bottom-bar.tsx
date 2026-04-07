"use client";

import { useMemo } from "react";
import { useSessionsStore } from "@/stores/sessions";
import { useRoomsStore } from "@/stores/rooms";
import { useUsage, formatCostDisplay, formatTokensDisplay } from "@/hooks/use-usage";

export function BottomBar() {
  const sessions = useSessionsStore((s) => s.sessions);
  const rooms = useRoomsStore((s) => s.rooms);
  const usage = useUsage();

  const active = sessions.filter((s) => s.status === "active" || s.status === "building").length;
  const idle = sessions.filter((s) => s.status === "idle" || s.status === "starting").length;
  const activeRooms = rooms.filter((r) => r.active).length;

  const { totalCost, totalTokens } = useMemo(() => {
    let cost = 0;
    let tokens = 0;
    for (const val of Object.values(usage.managed)) {
      cost += val.totalCost;
      tokens += val.totalTokens;
    }
    return { totalCost: cost, totalTokens: tokens };
  }, [usage.managed]);

  return (
    <footer className="flex items-center justify-between px-4 h-7 border-t border-border-default bg-bg-surface shrink-0 text-xs text-text-tertiary">
      {/* Left: session & room counts */}
      <div className="flex items-center gap-3">
        {active > 0 ? (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-sessions" />
            {active} active
          </span>
        ) : (
          <span>No sessions</span>
        )}
        {idle > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-sprints" />
            {idle} idle
          </span>
        )}
        {activeRooms > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-rooms" />
            {activeRooms} room{activeRooms !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Center: usage stats */}
      <div className="flex items-center gap-3">
        {totalTokens > 0 && (
          <span className="text-text-ghost tabular-nums">
            {formatTokensDisplay(totalTokens)} tokens
          </span>
        )}
        {totalCost > 0 && (
          <span className="text-sprints/70 tabular-nums">
            {formatCostDisplay(totalCost)}
          </span>
        )}
      </div>

      {/* Right: keyboard hints */}
      <div className="flex items-center gap-3">
        <ShortcutHint keys="K" label="commands" />
        <ShortcutHint keys="N" label="new session" />
      </div>
    </footer>
  );
}

function ShortcutHint({
  keys,
  label,
}: {
  keys: string;
  label: string;
}) {
  return (
    <span className="flex items-center gap-0.5">
      <kbd className="px-0.5 py-0 rounded bg-border-default text-text-tertiary text-[8px] font-mono">
        {"Cmd"}
      </kbd>
      <kbd className="px-0.5 py-0 rounded bg-border-default text-text-tertiary text-[8px] font-mono">
        {"Shift"}
      </kbd>
      <kbd className="px-1 py-0 rounded bg-border-default text-text-tertiary text-2xs font-mono">
        {keys}
      </kbd>
      <span className="text-[8px]">{label}</span>
    </span>
  );
}
