"use client";

import { useState, useEffect, useCallback } from "react";
import { InfoIcon, RefreshIcon } from "@/components/ui/icons";

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
  const [fetchError, setFetchError] = useState(false);

  const fetchInfo = useCallback(async () => {
    setFetchError(false);
    try {
      const res = await fetch("/api/system/info");
      if (res.ok) {
        setInfo(await res.json() as SystemInfo);
      } else {
        console.error("[about] /api/system/info returned", res.status);
        setFetchError(true);
      }
    } catch (err) {
      console.error("[about] Failed to fetch system info:", err);
      setFetchError(true);
    }
  }, []);

  useEffect(() => {
    void fetchInfo();
  }, [fetchInfo]);

  const formatUptime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const placeholder = fetchError ? "error" : "...";

  return (
    <section className="border border-border-default rounded bg-bg-surface">
      <div className="px-4 py-3 border-b border-border-default flex items-center justify-between">
        <h3 className="text-body font-medium text-text-primary flex items-center gap-1.5">
          <InfoIcon className="w-3.5 h-3.5" />
          About
        </h3>
        {fetchError && (
          <button
            onClick={() => void fetchInfo()}
            className="p-1 text-text-tertiary hover:text-text-secondary transition-all"
            title="Retry loading system info"
          >
            <RefreshIcon className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="px-4 py-3 space-y-1.5">
        <Row label="Version" value="0.2.0" />
        <Row label="Branch" value={info?.branch ?? placeholder} />
        <Row label="Commit" value={info?.commitHash ?? placeholder} />
        <Row label="License" value="MIT" />
        <Row label="Server Port" value="8080" />
        <Row label="Node" value={info?.nodeVersion ?? placeholder} />
        <Row label="Platform" value={info ? `${info.platform}/${info.arch}` : placeholder} />
        <Row label="Server PID" value={info?.pid?.toString() ?? placeholder} />
        <Row label="Uptime" value={info ? formatUptime(info.uptime) : placeholder} />
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
