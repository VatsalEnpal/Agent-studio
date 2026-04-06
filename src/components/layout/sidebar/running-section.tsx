"use client";

import { useState, useEffect, useCallback } from "react";
import { CpuIcon, ClockIcon, CloseIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { useSessionsStore } from "@/stores/sessions";
import { SessionGroup } from "@/components/sessions/session-group";
import type { DiscoveredProcess } from "./types";
import { formatUptime } from "./utils";

export function RunningSection() {
  const [processes, setProcesses] = useState<DiscoveredProcess[]>([]);

  const fetchProcesses = useCallback(async () => {
    try {
      const res = await fetch("/api/processes");
      if (res.ok) {
        setProcesses((await res.json()) as DiscoveredProcess[]);
      }
    } catch {
      // Best effort
    }
  }, []);

  const handleKillProcess = useCallback(
    async (pid: number) => {
      try {
        await fetch(`/api/processes/${pid}/kill`, { method: "POST" });
        setTimeout(() => void fetchProcesses(), 1000);
      } catch {
        // Best effort
      }
    },
    [fetchProcesses],
  );

  useEffect(() => {
    void fetchProcesses();
    const interval = setInterval(() => void fetchProcesses(), 15_000);
    return () => clearInterval(interval);
  }, [fetchProcesses]);

  if (processes.length === 0) return null;

  return (
    <SessionGroup
      title="Running on Machine"
      count={processes.length}
      defaultOpen={false}
    >
      {processes.map((proc) => (
        <RunningProcessItem
          key={proc.pid}
          proc={proc}
          onKillProcess={handleKillProcess}
        />
      ))}
    </SessionGroup>
  );
}

/* ---------- Running Process Item ---------- */

function RunningProcessItem({
  proc,
  onKillProcess,
}: {
  proc: DiscoveredProcess;
  onKillProcess: (pid: number) => void;
}) {
  const [killing, setKilling] = useState(false);
  const [confirmKill, setConfirmKill] = useState(false);
  const sessions = useSessionsStore((s) => s.sessions);

  const roomSession = sessions.find(
    (s) => s.pid === proc.pid && s.meta?.group === "room",
  );
  const roomName = roomSession?.meta?.roomName;
  const projectName =
    proc.cwd !== "unknown"
      ? (proc.cwd.split("/").pop() ?? "Claude")
      : "Claude";
  const uptime = formatUptime(proc.startTime);

  return (
    <div
      className="px-2 py-1.5 space-y-0.5 group"
      title={`PID ${proc.pid}\nCommand: ${proc.command} ${proc.args}\nCwd: ${proc.cwd}\nStarted: ${proc.startTime}`}
    >
      <div className="flex items-center gap-2">
        <CpuIcon className="w-3 h-3 text-text-secondary shrink-0" />
        <span className="text-[10px] text-text-primary flex-1 truncate">
          {roomName
            ? `${roomSession?.meta?.agent ?? "Agent"}`
            : "Claude Session"}
        </span>
        {roomName && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-rooms/20 text-rooms font-mono shrink-0">
            #{roomName}
          </span>
        )}
        {proc.modelShort && proc.modelShort !== "unknown" && (
          <span
            className={cn(
              "text-[9px] px-1 py-0.5 rounded shrink-0 font-medium",
              proc.modelShort === "opus"
                ? "bg-purple-500/20 text-purple-400"
                : proc.modelShort === "haiku"
                  ? "bg-teal-500/20 text-teal-400"
                  : "bg-border-default text-text-tertiary",
            )}
          >
            {proc.modelShort}
          </span>
        )}
        <span className="flex items-center gap-0.5 text-[9px] text-text-tertiary shrink-0">
          <ClockIcon className="w-2.5 h-2.5" />
          {uptime}
        </span>

        {confirmKill ? (
          <button
            onClick={() => {
              setKilling(true);
              setConfirmKill(false);
              onKillProcess(proc.pid);
              setTimeout(() => setKilling(false), 3000);
            }}
            disabled={killing}
            className="text-[8px] px-1.5 py-0.5 rounded bg-error/20 text-error hover:bg-error/30 font-medium shrink-0 transition-all"
          >
            Kill?
          </button>
        ) : (
          <button
            onClick={() => {
              setConfirmKill(true);
              setTimeout(() => setConfirmKill(false), 2000);
            }}
            disabled={killing}
            className={cn(
              "p-0.5 shrink-0 rounded transition-all",
              killing
                ? "text-error cursor-not-allowed"
                : "text-text-tertiary hover:text-error opacity-0 group-hover:opacity-100",
            )}
            title={`Kill process ${proc.pid}`}
          >
            <CloseIcon className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="pl-5 flex items-center gap-2">
        <span className="text-[9px] text-text-secondary truncate flex-1 min-w-0">
          {projectName}
        </span>
        <span className="text-[9px] text-text-tertiary">running {uptime}</span>
      </div>
    </div>
  );
}
