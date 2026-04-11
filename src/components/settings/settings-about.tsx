"use client";

import { Info } from "lucide-react";

export function SettingsAbout() {
  return (
    <section className="border border-console-border rounded-lg bg-console-panel">
      <div className="px-4 py-3 border-b border-console-border">
        <h3 className="text-xs font-medium text-console-text flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5" />
          About
        </h3>
      </div>
      <div className="px-4 py-3 space-y-1.5">
        <Row label="Version" value="0.1.0" />
        <Row label="Branch" value="AGENTS_SETUP" />
        <Row label="Server Port" value="8080" />
        <Row label="Runtime" value="Next.js + Express + WebSocket" />
        <Row label="UI" value="Tailwind CSS + Zustand + xterm.js" />
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-console-dim">{label}</span>
      <span className="text-[10px] text-console-text font-mono">{value}</span>
    </div>
  );
}
