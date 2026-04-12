"use client";

import { useState, useEffect, useCallback } from "react";
import { StopIcon, PlayIcon, ExternalLinkIcon, TrashIcon, PlusCircleIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { useToastStore } from "@/stores/toast";
import { SessionGroup } from "@/components/sessions/session-group";
import type { DevServer } from "./types";

export function ServersSection() {
  const [devServers, setDevServers] = useState<DevServer[]>([]);

  const fetchDevServers = useCallback(async () => {
    try {
      const res = await fetch("/api/servers");
      if (res.ok) {
        setDevServers((await res.json()) as DevServer[]);
      }
    } catch {
      // Best effort
    }
  }, []);

  const handleStopServer = useCallback(
    async (pid: number) => {
      try {
        await fetch(`/api/servers/${pid}/stop`, { method: "POST" });
        setTimeout(() => void fetchDevServers(), 1500);
      } catch {
        // Best effort
      }
    },
    [fetchDevServers],
  );

  const handleStartServer = useCallback(
    async (cwd: string, command: string) => {
      try {
        const res = await fetch("/api/servers/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cwd, command }),
        });
        if (res.ok) {
          void fetchDevServers();
        } else {
          setTimeout(() => void fetchDevServers(), 3000);
        }
      } catch {
        // Best effort
      }
    },
    [fetchDevServers],
  );

  const handleAddCustomServer = useCallback(
    async (server: { name: string; cwd: string; command: string }) => {
      try {
        await fetch("/api/servers/custom", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(server),
        });
        void fetchDevServers();
      } catch {
        // Best effort
      }
    },
    [fetchDevServers],
  );

  const handleRemoveCustomServer = useCallback(
    async (name: string) => {
      try {
        await fetch(`/api/servers/custom/${encodeURIComponent(name)}`, {
          method: "DELETE",
        });
        void fetchDevServers();
      } catch {
        // Best effort
      }
    },
    [fetchDevServers],
  );

  const addToast = useToastStore((s) => s.addToast);

  const handleOpenPort = useCallback(
    (port: number) => {
      const url = `http://localhost:${port}`;
      window.open(url, "_blank");
      addToast(`Opened ${url}`, "success");
    },
    [addToast],
  );

  useEffect(() => {
    void fetchDevServers();
    const interval = setInterval(() => void fetchDevServers(), 10_000);
    return () => clearInterval(interval);
  }, [fetchDevServers]);

  return (
    <SessionGroup
      title="Servers"
      count={devServers.filter((s) => s.running).length}
      defaultOpen={true}
    >
      {devServers.map((server) => (
        <DevServerItem
          key={server.name + server.pid}
          server={server}
          onStop={handleStopServer}
          onStart={handleStartServer}
          onRemove={handleRemoveCustomServer}
          onOpenPort={handleOpenPort}
        />
      ))}
      <AddServerForm onAdd={handleAddCustomServer} />
    </SessionGroup>
  );
}

/* ---------- Dev Server Item ---------- */

function DevServerItem({
  server,
  onStop,
  onStart,
  onRemove,
  onOpenPort,
}: {
  server: DevServer;
  onStop: (pid: number) => void;
  onStart: (cwd: string, command: string) => void;
  onRemove?: (name: string) => void;
  onOpenPort: (port: number) => void;
}) {
  const [acting, setActing] = useState(false);

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1.5 text-xs group"
      title={`${server.cwd}${server.running ? `\nPort: ${server.port}\nPID: ${server.pid}` : ""}`}
    >
      <span
        className={cn(
          "w-2 h-2 rounded-full shrink-0",
          server.running ? "bg-emerald-400" : "bg-text-tertiary",
        )}
      />
      <span className="text-xs text-text-primary truncate flex-1">
        {server.name}
        {server.isSelf && (
          <span className="ml-1 text-[8px] px-1 py-0.5 rounded bg-rooms/15 text-rooms">
            this app
          </span>
        )}
      </span>
      {server.running && server.port > 0 && (
        <button
          onClick={() => onOpenPort(server.port)}
          className="flex items-center gap-0.5 text-2xs font-mono text-text-secondary hover:text-rooms transition-all shrink-0"
          title={`Open http://localhost:${server.port} in browser`}
        >
          :{server.port}
          <ExternalLinkIcon className="w-2.5 h-2.5" />
        </button>
      )}
      {server.running && !server.isSelf && (
        <button
          onClick={() => {
            setActing(true);
            onStop(server.pid);
            setTimeout(() => setActing(false), 2000);
          }}
          disabled={acting}
          className="p-0.5 text-text-tertiary hover:text-error opacity-0 group-hover:opacity-100 transition-all shrink-0"
          title="Stop server"
        >
          <StopIcon className="w-3 h-3" />
        </button>
      )}
      {!server.running && (
        <>
          <button
            onClick={() => {
              setActing(true);
              onStart(server.cwd, server.command);
              setTimeout(() => setActing(false), 5000);
            }}
            disabled={acting}
            className="flex items-center gap-0.5 px-1.5 py-0.5 text-[8px] font-medium text-sessions bg-sessions/10 hover:bg-sessions/20 rounded transition-all shrink-0"
            title="Start server"
          >
            <PlayIcon className="w-2 h-2" />
            {acting ? "Starting..." : "Start"}
          </button>
          {server.isCustom && onRemove && (
            <button
              onClick={() => onRemove(server.name)}
              className="p-0.5 text-text-tertiary hover:text-error opacity-0 group-hover:opacity-100 transition-all shrink-0"
              title="Remove server"
            >
              <TrashIcon className="w-3 h-3" />
            </button>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- Add Server Form ---------- */

function AddServerForm({
  onAdd,
}: {
  onAdd: (server: { name: string; cwd: string; command: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [cwd, setCwd] = useState("");
  const [command, setCommand] = useState("npm run dev");

  const handleSubmit = () => {
    if (!name.trim() || !cwd.trim()) return;
    onAdd({
      name: name.trim(),
      cwd: cwd.trim(),
      command: command.trim() || "npm run dev",
    });
    setName("");
    setCwd("");
    setCommand("npm run dev");
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 px-2 py-1 text-2xs text-text-tertiary hover:text-text-primary transition-all w-full"
      >
        <PlusCircleIcon className="w-3 h-3" />
        Add Server
      </button>
    );
  }

  return (
    <div className="px-2 py-1.5 space-y-1.5 border-t border-border-default/50">
      <input
        type="text"
        placeholder="Name (e.g. my-app)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full px-2 py-1 text-xs bg-bg-base border border-border-default rounded text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-rooms"
      />
      <input
        type="text"
        placeholder="Directory (e.g. ~/Code/my-app)"
        value={cwd}
        onChange={(e) => setCwd(e.target.value)}
        className="w-full px-2 py-1 text-xs bg-bg-base border border-border-default rounded text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-rooms"
      />
      <input
        type="text"
        placeholder="Command (default: npm run dev)"
        value={command}
        onChange={(e) => setCommand(e.target.value)}
        className="w-full px-2 py-1 text-xs bg-bg-base border border-border-default rounded text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-rooms"
      />
      <div className="flex gap-1">
        <button
          onClick={handleSubmit}
          disabled={!name.trim() || !cwd.trim()}
          className="flex-1 px-2 py-1 text-2xs font-medium text-bg-base bg-rooms hover:bg-rooms/90 disabled:opacity-40 disabled:cursor-not-allowed rounded transition-all"
        >
          Add
        </button>
        <button
          onClick={() => setOpen(false)}
          className="px-2 py-1 text-2xs text-text-tertiary hover:text-text-primary transition-all"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
