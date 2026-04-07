"use client";

import { InfoIcon } from "@/components/ui/icons";

export function SettingsAbout() {
  return (
    <section className="border border-border-default rounded-lg bg-bg-surface">
      <div className="px-4 py-3 border-b border-border-default">
        <h3 className="text-body font-medium text-text-primary flex items-center gap-1.5">
          <InfoIcon className="w-3.5 h-3.5" />
          About
        </h3>
      </div>
      <div className="px-4 py-3 space-y-1.5">
        <Row label="Version" value="0.1.0" />
        <Row label="License" value="MIT" />
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
      <span className="text-body text-text-tertiary">{label}</span>
      <span className="text-body text-text-primary">{value}</span>
    </div>
  );
}
