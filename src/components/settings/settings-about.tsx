"use client";

import { useState, useEffect } from "react";
import { InfoIcon } from "@/components/ui/icons";

interface SystemInfo {
  branch: string;
  commitHash: string;
  nodeVersion: string;
  platform: string;
  arch: string;
  pid: number;
  uptime: number;
}

export function SettingsAbout() {
  const [info, setInfo] = useState<SystemInfo | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/system/info");
        if (res.ok) {
          setInfo(await res.json() as SystemInfo);
        }
      } catch {
        // Best effort — static values still shown
      }
    })();
  }, []);

  const formatUptime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

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
        <Row label="Branch" value={info?.branch ?? "..."} />
        <Row label="Commit" value={info?.commitHash ?? "..."} />
        <Row label="License" value="MIT" />
        <Row label="Server Port" value="8080" />
        <Row label="Node" value={info?.nodeVersion ?? "..."} />
        <Row label="Platform" value={info ? `${info.platform}/${info.arch}` : "..."} />
        <Row label="Server PID" value={info?.pid?.toString() ?? "..."} />
        <Row label="Uptime" value={info ? formatUptime(info.uptime) : "..."} />
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
