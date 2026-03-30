"use client";

import { useSessionsStore } from "@/stores/sessions";

export function BottomBar() {
  const sessions = useSessionsStore((s) => s.sessions);

  const active = sessions.filter((s) => s.status === "active").length;

  return (
    <footer className="flex items-center justify-between px-4 h-7 border-t border-console-border bg-console-panel shrink-0 text-[10px] text-console-dim">
      {/* Left: session count */}
      <div className="flex items-center gap-3">
        {active > 0 ? (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-console-success" />
            {active} active
          </span>
        ) : (
          <span>No sessions</span>
        )}
      </div>

      {/* Right: keyboard hints */}
      <div className="flex items-center gap-3">
        <ShortcutHint mod keys="K" label="commands" />
        <ShortcutHint mod keys="N" label="new session" />
      </div>
    </footer>
  );
}

function ShortcutHint({
  keys,
  label,
  mod,
}: {
  keys: string;
  label: string;
  mod?: boolean;
}) {
  return (
    <span className="flex items-center gap-0.5">
      {mod && (
        <kbd className="px-0.5 py-0 rounded bg-console-border text-console-dim text-[8px] font-mono">
          Cmd
        </kbd>
      )}
      <kbd className="px-1 py-0 rounded bg-console-border text-console-dim text-[9px] font-mono">
        {keys}
      </kbd>
      <span className="text-[8px]">{label}</span>
    </span>
  );
}
