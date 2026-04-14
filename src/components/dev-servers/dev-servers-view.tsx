"use client";

import { useState, useEffect, useCallback } from "react";
import {
  RefreshIcon,
  ExternalLinkIcon,
  StopIcon,
  SearchIcon,
  PlusIcon,
  CloseIcon,
} from "@/components/ui/icons";
import { AmberLoadingBar } from "@/components/ui/skeleton";
import { cn, shortenCwd } from "@/lib/utils";

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

function processLabel(cmd: string): string {
  // Capitalize first letter
  const name = cmd.split("/").pop() ?? cmd;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// ---------------------------------------------------------------------------
// Add Server Dialog
// ---------------------------------------------------------------------------

interface AddServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

function AddServerDialog({ open, onOpenChange, onCreated }: AddServerDialogProps) {
  const [name, setName] = useState("");
  const [port, setPort] = useState("");
  const [command, setCommand] = useState("");
  const [cwd, setCwd] = useState("");
  const [autoStart, setAutoStart] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setName("");
    setPort("");
    setCommand("");
    setCwd("");
    setAutoStart(false);
    setError(null);
    setSaving(false);
  }, []);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    setTimeout(reset, 200);
  }, [onOpenChange, reset]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, handleClose]);

  const handleSave = useCallback(async () => {
    if (!name.trim() || !command.trim() || !cwd.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/dev-servers/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          port: port ? parseInt(port, 10) : undefined,
          command: command.trim(),
          cwd: cwd.trim(),
          autoStart,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || `Failed to add server (${res.status})`);
      }
      onCreated();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }, [name, port, command, cwd, autoStart, onCreated, handleClose]);

  if (!open) return null;

  const canSave = name.trim() && command.trim() && cwd.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-bg-base/80 backdrop-blur-[2px]" onClick={handleClose} />

      {/* Dialog */}
      <div className="relative w-full max-w-md bg-bg-surface border border-border-default rounded-[4px] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <div className="flex items-center gap-2">
            <PlusIcon size={14} className="text-accent" />
            <h2 className="text-xs font-medium text-text-primary">Add Server</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1 text-text-ghost hover:text-text-secondary transition-all"
          >
            <CloseIcon size={12} />
          </button>
        </div>

        {/* Form */}
        <div className="px-4 py-4 space-y-3">
          {/* Name */}
          <div className="space-y-1">
            <label className="text-label font-medium text-text-secondary uppercase tracking-wider">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-api-server"
              className="w-full px-3 py-2 text-xs bg-bg-input border border-border-default rounded-[4px] text-text-primary placeholder:text-text-ghost focus:outline-none focus:border-accent transition-all"
              autoFocus
            />
          </div>

          {/* Port */}
          <div className="space-y-1">
            <label className="text-label font-medium text-text-secondary uppercase tracking-wider">
              Port
            </label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="3000"
              className="w-full px-3 py-2 text-xs bg-bg-input border border-border-default rounded-[4px] text-text-primary placeholder:text-text-ghost focus:outline-none focus:border-accent transition-all"
            />
          </div>

          {/* Command */}
          <div className="space-y-1">
            <label className="text-label font-medium text-text-secondary uppercase tracking-wider">
              Command
            </label>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="npm run dev"
              className="w-full px-3 py-2 text-xs font-mono bg-bg-input border border-border-default rounded-[4px] text-text-primary placeholder:text-text-ghost focus:outline-none focus:border-accent transition-all"
            />
          </div>

          {/* Working Directory */}
          <div className="space-y-1">
            <label className="text-label font-medium text-text-secondary uppercase tracking-wider">
              Working Directory
            </label>
            <input
              type="text"
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              placeholder="/Users/you/projects/my-app"
              className="w-full px-3 py-2 text-xs font-mono bg-bg-input border border-border-default rounded-[4px] text-text-primary placeholder:text-text-ghost focus:outline-none focus:border-accent transition-all"
            />
          </div>

          {/* Auto-start */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoStart}
              onChange={(e) => setAutoStart(e.target.checked)}
              className="w-3.5 h-3.5 rounded-[2px] border border-border-default bg-bg-input accent-accent cursor-pointer"
            />
            <span className="text-xs text-text-secondary">
              Start automatically when Agent Studio launches
            </span>
          </label>

          {error && <p className="text-xs text-error">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border-default">
          <button
            onClick={handleClose}
            className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={!canSave || saving}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-[4px] transition-all",
              canSave && !saving
                ? "bg-accent text-bg-base hover:bg-accent/90"
                : "bg-bg-elevated text-text-ghost cursor-not-allowed",
            )}
          >
            {saving ? "Adding..." : "Add Server"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DevServersView() {
  const [servers, setServers] = useState<DevServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stoppingPid, setStoppingPid] = useState<number | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const fetchServers = useCallback(async () => {
    try {
      const res = await fetch("/api/dev-servers");
      if (res.ok) {
        setServers((await res.json()) as DevServer[]);
      }
    } catch (e) {
      console.error("Failed to fetch dev servers:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchServers();
    const interval = setInterval(() => void fetchServers(), 15_000);
    return () => clearInterval(interval);
  }, [fetchServers]);

  const handleStop = useCallback(
    async (pid: number) => {
      setStoppingPid(pid);
      try {
        await fetch(`/api/dev-servers/${pid}/stop`, { method: "POST" });
        // Wait briefly then refresh
        setTimeout(() => void fetchServers(), 1500);
      } catch (e) {
        console.error("Failed to stop dev server:", e);
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
          <h2 className="text-xs font-medium text-text-primary">Dev Servers</h2>
          <span className="text-2xs text-text-ghost hidden sm:inline">
            Running processes and listening ports
          </span>
          <span className="text-label text-text-ghost ml-auto">{servers.length} listening</span>
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
          onClick={() => setAddDialogOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-accent text-bg-base hover:bg-accent/90 rounded-[4px] transition-all active:scale-[0.96]"
          title="Add Server"
        >
          <PlusIcon size={12} />
          Add Server
        </button>

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
                <span
                  className={cn(
                    "w-[5px] h-[5px] rounded-full shrink-0",
                    server.running ? "bg-sessions" : "bg-text-tertiary",
                  )}
                />
                <span
                  className={cn(
                    "text-xs font-mono font-medium",
                    server.running ? "text-sessions" : "text-text-ghost",
                  )}
                >
                  {server.running && server.port > 0 ? server.port : "--"}
                </span>
              </div>

              {/* Process name */}
              <div className="w-24 shrink-0">
                <span className="text-xs text-text-primary truncate block">
                  {processLabel(server.command)}
                </span>
                {!server.running && <span className="text-2xs text-text-ghost">Not running</span>}
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
                  {server.running && server.pid > 0 ? server.pid : "--"}
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

      {/* Add Server Dialog */}
      <AddServerDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onCreated={() => void fetchServers()}
      />
    </div>
  );
}
