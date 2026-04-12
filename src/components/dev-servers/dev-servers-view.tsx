"use client";

import { useState, useEffect, useCallback } from "react";
import {
  RefreshIcon,
  ExternalLinkIcon,
  StopIcon,
  SearchIcon,
} from "@/components/ui/icons";
import { AmberLoadingBar } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DevServer {
  pid: number;
  port: number;
  command: string;
  cwd: string;
  name: string;
  running: boolean;
  isSelf: boolean;
  isCustom?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shortenCwd(cwd: string): string {
  if (cwd === "unknown") return "--";
  const homeMatch = cwd.match(/^\/(?:Users|home)\/[^/]+/);
  if (homeMatch) return "~" + cwd.slice(homeMatch[0].length);
  return cwd;
}

function processLabel(cmd: string): string {
  // Capitalize first letter
  const name = cmd.split("/").pop() ?? cmd;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DevServersView() {
  const [servers, setServers] = useState<DevServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stoppingPid, setStoppingPid] = useState<number | null>(null);

  const fetchServers = useCallback(async () => {
    try {
      const res = await fetch("/api/dev-servers");
      if (res.ok) {
        setServers((await res.json()) as DevServer[]);
      }
    } catch {
      // best effort
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchServers();
    const interval = setInterval(() => void fetchServers(), 5000);
    return () => clearInterval(interval);
  }, [fetchServers]);

  const handleStop = useCallback(
    async (pid: number) => {
      setStoppingPid(pid);
      try {
        await fetch(`/api/dev-servers/${pid}/stop`, { method: "POST" });
        // Wait briefly then refresh
        setTimeout(() => void fetchServers(), 1500);
      } catch {
        // best effort
      } finally {
        setTimeout(() => setStoppingPid(null), 2000);
      }
    },
    [fetchServers],
  );

  const filtered = search.trim()
    ? servers.filter(
        (s) =>
          s.command.toLowerCase().includes(search.toLowerCase()) ||
          s.cwd.toLowerCase().includes(search.toLowerCase()) ||
          String(s.port).includes(search),
      )
    : servers;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-3 border-b border-border-default shrink-0 flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="w-[5px] h-[5px] rounded-full bg-sessions shrink-0" />
          <h2 className="text-xs font-medium text-text-primary">
            Dev Servers
          </h2>
          <span className="text-label text-text-ghost">
            {servers.length} listening
          </span>
        </div>

        {/* Search */}
        <div className="relative w-48">
          <SearchIcon
            size={12}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-text-ghost"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter..."
            className="w-full pl-6 pr-2 py-1 text-xs bg-bg-input border border-border-default rounded text-text-primary placeholder:text-text-ghost focus:outline-none focus:border-border-subtle transition-all"
          />
        </div>

        <button
          onClick={() => {
            setLoading(true);
            void fetchServers();
          }}
          className="p-1.5 text-text-tertiary hover:text-text-primary rounded transition-all active:scale-[0.92]"
          title="Refresh"
        >
          <RefreshIcon size={14} />
        </button>
      </div>

      {(loading || stoppingPid !== null) && <AmberLoadingBar />}

      {/* Table */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* Table header */}
        <div className="sticky top-0 bg-bg-surface border-b border-border-default px-5 py-2 flex items-center gap-3 text-label text-text-ghost uppercase">
          <span className="w-14 shrink-0">Port</span>
          <span className="w-24 shrink-0">Process</span>
          <span className="flex-1 min-w-0">Directory</span>
          <span className="w-16 shrink-0 text-right">PID</span>
          <span className="w-20 shrink-0 text-right">Actions</span>
        </div>

        {loading && servers.length === 0 ? (
          <div className="px-5 py-8 space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 h-8">
                <div className="skeleton h-3 w-12" />
                <div className="skeleton h-3 w-20" />
                <div className="skeleton h-3 flex-1" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <p className="text-xs font-medium text-text-secondary">
              {search ? "No matching services" : "No services detected"}
            </p>
            <p className="text-xs text-text-tertiary max-w-[280px] text-center leading-relaxed">
              {search
                ? "Try a different search term."
                : "Start a dev server (npm run dev, etc.) and it will appear here."}
            </p>
          </div>
        ) : (
          filtered.map((server) => (
            <div
              key={`${server.pid}-${server.port}`}
              className={cn(
                "flex items-center gap-3 px-5 py-2 border-b border-border-subtle/50 transition-all group",
                "hover:bg-bg-elevated/30 hover:shadow-[0_0_12px_rgba(52,211,153,0.04)]",
                server.isSelf && "bg-sessions/[0.02]",
              )}
            >
              {/* Port */}
              <div className="w-14 shrink-0 flex items-center gap-1.5">
                <span className="w-[5px] h-[5px] rounded-full bg-sessions shrink-0" />
                <span className="text-xs font-mono text-sessions font-medium">
                  {server.port}
                </span>
              </div>

              {/* Process name */}
              <div className="w-24 shrink-0">
                <span className="text-xs text-text-primary truncate block">
                  {processLabel(server.command)}
                </span>
              </div>

              {/* Directory */}
              <div className="flex-1 min-w-0">
                <span className="text-xs text-text-tertiary font-mono truncate block">
                  {shortenCwd(server.cwd)}
                </span>
              </div>

              {/* PID */}
              <div className="w-16 shrink-0 text-right">
                <span className="text-label text-text-ghost font-mono">
                  {server.pid}
                </span>
              </div>

              {/* Actions */}
              <div className="w-20 shrink-0 flex items-center justify-end gap-1">
                {server.port > 0 && (
                  <a
                    href={`http://localhost:${server.port}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 text-text-tertiary hover:text-sessions rounded transition-all"
                    title={`Open http://localhost:${server.port}`}
                  >
                    <ExternalLinkIcon size={12} />
                  </a>
                )}
                {!server.isSelf && (
                  <button
                    onClick={() => void handleStop(server.pid)}
                    disabled={stoppingPid === server.pid}
                    className={cn(
                      "p-1 rounded transition-all",
                      stoppingPid === server.pid
                        ? "text-error/50 cursor-not-allowed"
                        : "text-text-ghost hover:text-error opacity-0 group-hover:opacity-100",
                    )}
                    title="Stop process"
                  >
                    <StopIcon size={12} />
                  </button>
                )}
                {server.isSelf && (
                  <span className="text-2xs px-1.5 py-0.5 rounded bg-sessions/10 text-sessions font-medium">
                    self
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
