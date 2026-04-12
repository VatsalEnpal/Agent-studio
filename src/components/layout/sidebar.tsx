"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  PanelLeftClose,
  FolderOpen,
  GitBranch,
  GitPullRequest,
  Circle,
  Cpu,
  Clock,
  History,
  Play,
  X,
  Upload,
  FileCheck,
  AlertTriangle,
  Eye,
  GitCommit,
  Server,
  Square,
  ExternalLink,
  Trash2,
  PlusCircle,
} from "lucide-react";
import { useSessionsStore } from "@/stores/sessions";
import { useUIStore } from "@/stores/ui";
import { useGitStore } from "@/stores/git";
import { SessionItem } from "@/components/sessions/session-item";
import { SessionGroup } from "@/components/sessions/session-group";
import { cn } from "@/lib/utils";
import { formatCostDisplay } from "@/hooks/use-usage";
import type { RepoStatus } from "@/lib/types";

interface DiscoveredProcess {
  pid: number;
  command: string;
  args: string;
  cwd: string;
  startTime: string;
  user: string;
  model?: string;
  modelShort?: "opus" | "sonnet" | "haiku" | "unknown";
  cost?: string;
  tokens?: string;
  totalCost?: number;
  totalTokens?: number;
  sessionId?: string;
}

interface PastSession {
  id: string;
  project: string;
  projectShort?: string;
  modified: number;
  date: string;
  agent?: string;
  preview?: string;
}

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

interface SidebarProps {
  onNewSession: () => void;
  onKillSession: (id: string) => void;
}

function openFolder(repoPath: string, app?: string) {
  fetch("/api/git/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo: repoPath, app }),
  }).catch(() => {
    // Best effort
  });
}

function FolderItem({ repo }: { repo: RepoStatus }) {
  return (
    <button
      onClick={() => openFolder(repo.path)}
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          openFolder(repo.path, "Cursor");
        }
      }}
      title={`${repo.path}\nClick: Finder | Middle-click: Cursor`}
      className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-console-muted hover:text-console-text hover:bg-console-faint/50 rounded transition-colors"
    >
      <FolderOpen className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate flex-1 text-left">{repo.name}</span>
      {repo.isProd && (
        <span className="text-[8px] px-1 py-0.5 rounded bg-red-500/20 text-red-400 font-bold shrink-0">
          PROD
        </span>
      )}
      {repo.dirty && (
        <Circle className="w-2 h-2 fill-console-error text-console-error shrink-0" />
      )}
    </button>
  );
}

/* ---------- Changes Popup ---------- */
function ChangesPopup({
  repo,
  onClose,
}: {
  repo: RepoStatus;
  onClose: () => void;
}) {
  const [changes, setChanges] = useState<string>("Loading...");

  useEffect(() => {
    fetch(`/api/git/changes?repo=${encodeURIComponent(repo.path)}`)
      .then((r) => r.json())
      .then((d: { changes: string }) => {
        const val = d.changes;
        if (!val || val === "(no changes)") {
          setChanges("Working tree clean");
        } else {
          setChanges(val);
        }
      })
      .catch(() => setChanges("Failed to load changes"));
  }, [repo.path]);

  const isClean = changes === "Working tree clean";
  const lines = isClean ? [] : changes.split("\n").filter(Boolean);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-console-bg border border-console-border rounded shadow-2xl w-full max-w-md p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-console-border">
          <span className="text-xs font-medium text-console-text flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5" />
            Changes: {repo.name}
          </span>
          <button
            onClick={onClose}
            className="p-0.5 text-console-dim hover:text-console-text"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="px-3 py-2 max-h-72 overflow-auto">
          {changes === "Loading..." ? (
            <p className="text-[10px] text-console-dim animate-pulse py-2">
              Loading...
            </p>
          ) : isClean ? (
            <div className="flex items-center gap-2 py-3 justify-center">
              <FileCheck className="w-4 h-4 text-console-success" />
              <span className="text-[11px] text-console-success font-medium">
                Working tree clean
              </span>
            </div>
          ) : (
            <div className="space-y-0.5">
              <p className="text-[9px] text-console-dim mb-1.5">
                {lines.length} changed file{lines.length !== 1 ? "s" : ""}
              </p>
              {lines.map((line, i) => {
                const status = line.slice(0, 2).trim();
                const file = line.slice(3);
                let statusColor = "text-console-muted";
                let statusLabel = status;
                if (status === "M") {
                  statusColor = "text-console-accent";
                  statusLabel = "M";
                } else if (status === "A") {
                  statusColor = "text-console-success";
                  statusLabel = "A";
                } else if (status === "D") {
                  statusColor = "text-console-error";
                  statusLabel = "D";
                } else if (status === "??") {
                  statusColor = "text-blue-400";
                  statusLabel = "?";
                } else if (status === "R") {
                  statusColor = "text-purple-400";
                  statusLabel = "R";
                }
                return (
                  <div key={i} className="flex items-center gap-2 py-0.5">
                    <span
                      className={cn(
                        "text-[10px] font-mono font-bold w-4 text-center shrink-0",
                        statusColor,
                      )}
                    >
                      {statusLabel}
                    </span>
                    <span className="text-[10px] font-mono text-console-muted truncate">
                      {file}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Commit Modal ---------- */
function CommitModal({
  repo,
  onClose,
}: {
  repo: RepoStatus;
  onClose: () => void;
}) {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<
    "idle" | "committing" | "success" | "error"
  >("idle");
  const [output, setOutput] = useState("");

  const handleCommit = async () => {
    if (!message.trim()) return;
    setStatus("committing");
    try {
      const res = await fetch("/api/git/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: repo.path, message: message.trim() }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        output?: string;
        error?: string;
      };
      if (!res.ok) {
        setStatus("error");
        setOutput(data.error ?? "Unknown error");
      } else {
        setStatus("success");
        setOutput(data.output ?? "Committed");
      }
    } catch (err) {
      setStatus("error");
      setOutput(err instanceof Error ? err.message : "Unknown error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-console-bg border border-console-border rounded shadow-2xl w-full max-w-sm p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-console-border">
          <span className="text-xs font-medium text-console-text flex items-center gap-1.5">
            <GitCommit className="w-3.5 h-3.5" />
            Commit: {repo.name}
          </span>
          <button
            onClick={onClose}
            className="p-0.5 text-console-dim hover:text-console-text"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="px-3 py-2 space-y-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Commit message..."
            disabled={status === "committing" || status === "success"}
            className="w-full px-2 py-1.5 text-xs bg-console-panel border border-console-border rounded text-console-text placeholder:text-console-dim focus:outline-none focus:border-console-accent"
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCommit();
            }}
          />
          {status === "error" && (
            <div className="text-[10px] text-console-error bg-console-error/10 px-2 py-1 rounded">
              {output}
            </div>
          )}
          {status === "success" && (
            <div className="text-[10px] text-console-success bg-console-success/10 px-2 py-1 rounded">
              {output}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-3 py-2 border-t border-console-border">
          <button
            onClick={onClose}
            className="px-2 py-1 text-[10px] text-console-muted hover:text-console-text"
          >
            {status === "success" ? "Close" : "Cancel"}
          </button>
          {status !== "success" && (
            <button
              onClick={() => void handleCommit()}
              disabled={!message.trim() || status === "committing"}
              className={cn(
                "px-2 py-1 text-[10px] font-medium rounded transition-colors",
                !message.trim() || status === "committing"
                  ? "bg-console-border text-console-dim cursor-not-allowed"
                  : "bg-console-accent text-white hover:bg-console-accent/80",
              )}
            >
              {status === "committing" ? "Committing..." : "Commit"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Push Confirm Modal (with prod safety) ---------- */
function PushModal({
  repo,
  onClose,
}: {
  repo: RepoStatus;
  onClose: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [status, setStatus] = useState<
    "idle" | "pushing" | "success" | "error"
  >("idle");
  const [output, setOutput] = useState("");

  const isProd = repo.isProd;
  const canPush = isProd ? confirmText === "CONFIRM" : true;

  const handlePush = async () => {
    if (!canPush) return;
    setStatus("pushing");
    try {
      const res = await fetch("/api/git/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: repo.path,
          confirmed: isProd ? true : undefined,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        output?: string;
        error?: string;
      };
      if (!res.ok) {
        setStatus("error");
        setOutput(data.error ?? "Unknown error");
      } else {
        setStatus("success");
        setOutput(data.output || "Pushed successfully");
      }
    } catch (err) {
      setStatus("error");
      setOutput(err instanceof Error ? err.message : "Unknown error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-console-bg border border-console-border rounded shadow-2xl w-full max-w-sm p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-console-border">
          <span className="text-xs font-medium text-console-text flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5" />
            Push: {repo.name}
          </span>
          <button
            onClick={onClose}
            className="p-0.5 text-console-dim hover:text-console-text"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="px-3 py-2 space-y-2">
          {isProd && (
            <div className="flex items-start gap-2 px-2 py-2 bg-red-500/10 border border-red-500/30 rounded text-red-400">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-[10px] font-bold">
                  WARNING: PRODUCTION REPO
                </p>
                <p className="text-[9px]">
                  You are pushing to the production repository. This will be
                  reviewed by the team. Are you absolutely sure?
                </p>
                <p className="text-[9px]">
                  Type <span className="font-mono font-bold">CONFIRM</span> to
                  proceed:
                </p>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="Type CONFIRM"
                  className="w-full px-2 py-1 text-xs bg-console-bg border border-red-500/40 rounded text-console-text placeholder:text-console-dim focus:outline-none focus:border-red-400"
                />
              </div>
            </div>
          )}
          {!isProd && (
            <p className="text-[10px] text-console-muted">
              Push current branch to origin?
            </p>
          )}
          {status === "error" && (
            <div className="text-[10px] text-console-error bg-console-error/10 px-2 py-1 rounded">
              {output}
            </div>
          )}
          {status === "success" && (
            <div className="text-[10px] text-console-success bg-console-success/10 px-2 py-1 rounded">
              {output}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-3 py-2 border-t border-console-border">
          <button
            onClick={onClose}
            className="px-2 py-1 text-[10px] text-console-muted hover:text-console-text"
          >
            {status === "success" ? "Close" : "Cancel"}
          </button>
          {status !== "success" && (
            <button
              onClick={() => void handlePush()}
              disabled={!canPush || status === "pushing"}
              className={cn(
                "px-2 py-1 text-[10px] font-medium rounded transition-colors",
                !canPush || status === "pushing"
                  ? "bg-console-border text-console-dim cursor-not-allowed"
                  : isProd
                    ? "bg-red-500 text-white hover:bg-red-600"
                    : "bg-console-accent text-white hover:bg-console-accent/80",
              )}
            >
              {status === "pushing" ? "Pushing..." : "Push"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Merged Repo Item (name + branch + dirty + actions) ---------- */
function RepoItem({
  repo,
  onCreatePR,
  onViewChanges,
  onCommit,
  onPush,
}: {
  repo: RepoStatus;
  onCreatePR: (repo: RepoStatus) => void;
  onViewChanges: (repo: RepoStatus) => void;
  onCommit: (repo: RepoStatus) => void;
  onPush: (repo: RepoStatus) => void;
}) {
  const isProd = repo.isProd;

  return (
    <div
      className="px-2 py-1.5 group cursor-pointer"
      onClick={() => openFolder(repo.path)}
      title={repo.path}
    >
      <div className="flex items-center gap-2">
        <FolderOpen className="w-3.5 h-3.5 shrink-0 text-console-muted" />
        <span className="text-[10px] text-console-text font-medium truncate flex-1">
          {repo.name}
        </span>
        {isProd && (
          <span className="text-[8px] px-1 py-0.5 rounded bg-red-500/20 text-red-400 font-bold shrink-0">
            PROD
          </span>
        )}
        <span className="text-[9px] px-1 py-0.5 rounded bg-console-accent/10 text-console-accent font-mono shrink-0 max-w-[80px] truncate">
          {repo.branch}
        </span>
        <span
          className={cn(
            "w-2 h-2 rounded-full shrink-0",
            repo.dirty ? "bg-console-error" : "bg-console-success",
          )}
          title={repo.dirty ? `${repo.changedFiles} changed files` : "Clean"}
        />
      </div>
      {/* Other tracked branches */}
      {repo.branches &&
        repo.branches.filter((b) => !b.isCurrent).length > 0 && (
          <div className="mt-1 pl-5 space-y-0.5">
            {repo.branches
              .filter((b) => !b.isCurrent)
              .map((b) => {
                // Extract just the commit message (after the hash)
                const commitMsg = b.lastCommit.replace(/^[a-f0-9]+ /, "");
                const commitHash = b.lastCommit.split(" ")[0] ?? "";
                return (
                  <div
                    key={b.name}
                    className="flex items-center gap-1.5 text-[9px] text-console-dim"
                    title={b.lastCommit}
                  >
                    <GitBranch className="w-2.5 h-2.5 shrink-0" />
                    <span className="font-mono text-console-muted shrink-0">
                      {b.name}
                    </span>
                    <span className="truncate opacity-60">
                      {commitHash.slice(0, 7)} {commitMsg}
                    </span>
                  </div>
                );
              })}
          </div>
        )}
      {/* Action buttons row — show on hover */}
      <div
        className="flex items-center gap-1 mt-1 pl-5 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => onViewChanges(repo)}
          className="p-0.5 text-console-dim hover:text-console-accent transition-all"
          title="View Changes"
        >
          <Eye className="w-3 h-3" />
        </button>
        {!isProd && (
          <button
            onClick={() => onCommit(repo)}
            className="p-0.5 text-console-dim hover:text-console-accent transition-all"
            title="Commit"
          >
            <GitCommit className="w-3 h-3" />
          </button>
        )}
        <button
          onClick={() => onPush(repo)}
          className={cn(
            "p-0.5 transition-all",
            isProd
              ? "text-red-400/60 hover:text-red-400"
              : "text-console-dim hover:text-console-accent",
          )}
          title={isProd ? "Push (PROD - requires confirmation)" : "Push"}
        >
          <Upload className="w-3 h-3" />
        </button>
        <button
          onClick={() => onCreatePR(repo)}
          className={cn(
            "p-0.5 transition-all",
            isProd
              ? "text-red-400/60 hover:text-red-400"
              : "text-console-dim hover:text-console-accent",
          )}
          title="Create Pull Request"
        >
          <GitPullRequest className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

/* ---------- Git Repo Item (legacy, kept for reference) ---------- */
function GitRepoItem({
  repo,
  onCreatePR,
  onViewChanges,
  onCommit,
  onPush,
}: {
  repo: RepoStatus;
  onCreatePR: (repo: RepoStatus) => void;
  onViewChanges: (repo: RepoStatus) => void;
  onCommit: (repo: RepoStatus) => void;
  onPush: (repo: RepoStatus) => void;
}) {
  const isProd = repo.isProd;

  return (
    <div className="px-2 py-1.5 group">
      <div className="flex items-center gap-2">
        <GitBranch className="w-3.5 h-3.5 shrink-0 text-console-accent" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-console-muted truncate">
              {repo.name}
            </span>
            {isProd && (
              <span className="text-[8px] px-1 py-0.5 rounded bg-red-500/20 text-red-400 font-bold shrink-0">
                PROD
              </span>
            )}
          </div>
          <span className="text-[10px] text-console-text font-mono truncate block">
            {repo.branch}
          </span>
        </div>
        <span
          className={cn(
            "text-[9px] px-1 py-0.5 rounded shrink-0",
            repo.dirty
              ? "bg-console-error/15 text-console-error"
              : "bg-console-success/15 text-console-success",
          )}
        >
          {repo.dirty ? `${repo.changedFiles}` : "ok"}
        </span>
      </div>
      {/* Action buttons row */}
      <div className="flex items-center gap-1 mt-1 pl-5 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* View Changes */}
        <button
          onClick={() => onViewChanges(repo)}
          className="p-0.5 text-console-dim hover:text-console-accent transition-all"
          title="View Changes"
        >
          <Eye className="w-3 h-3" />
        </button>
        {/* Commit — hidden for prod */}
        {!isProd && (
          <button
            onClick={() => onCommit(repo)}
            className="p-0.5 text-console-dim hover:text-console-accent transition-all"
            title="Commit"
          >
            <GitCommit className="w-3 h-3" />
          </button>
        )}
        {/* Push */}
        <button
          onClick={() => onPush(repo)}
          className={cn(
            "p-0.5 transition-all",
            isProd
              ? "text-red-400/60 hover:text-red-400"
              : "text-console-dim hover:text-console-accent",
          )}
          title={isProd ? "Push (PROD - requires confirmation)" : "Push"}
        >
          <Upload className="w-3 h-3" />
        </button>
        {/* Create PR */}
        {!isProd ? (
          <button
            onClick={() => onCreatePR(repo)}
            className="p-0.5 text-console-dim hover:text-console-accent transition-all"
            title="Create Pull Request"
          >
            <GitPullRequest className="w-3 h-3" />
          </button>
        ) : (
          <button
            onClick={() => onCreatePR(repo)}
            className="p-0.5 text-red-400/60 hover:text-red-400 transition-all"
            title="Create PR (PROD - requires confirmation)"
          >
            <GitPullRequest className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

function DevServerItem({
  server,
  onStop,
  onStart,
  onRemove,
}: {
  server: DevServer;
  onStop: (pid: number) => void;
  onStart: (cwd: string, command: string) => void;
  onRemove?: (name: string) => void;
}) {
  const [acting, setActing] = useState(false);

  const openInBrowser = () => {
    if (server.port > 0) {
      window.open(`http://localhost:${server.port}`, "_blank");
    }
  };

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1.5 text-xs group"
      title={`${server.cwd}${server.running ? `\nPort: ${server.port}\nPID: ${server.pid}` : ""}`}
    >
      <span
        className={cn(
          "w-2 h-2 rounded-full shrink-0",
          server.running ? "bg-emerald-400" : "bg-console-dim",
        )}
      />
      <span className="text-[10px] text-console-text truncate flex-1">
        {server.name}
        {server.isSelf && (
          <span className="ml-1 text-[8px] px-1 py-0.5 rounded bg-console-accent/15 text-console-accent">
            this app
          </span>
        )}
      </span>
      {server.running && server.port > 0 && (
        <button
          onClick={openInBrowser}
          className="flex items-center gap-0.5 text-[9px] font-mono text-console-muted hover:text-console-accent transition-colors shrink-0"
          title={`Open http://localhost:${server.port}`}
        >
          :{server.port}
          <ExternalLink className="w-2.5 h-2.5" />
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
          className="p-0.5 text-console-dim hover:text-console-error opacity-0 group-hover:opacity-100 transition-all shrink-0"
          title="Stop server"
        >
          <Square className="w-3 h-3" />
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
            className="flex items-center gap-0.5 px-1.5 py-0.5 text-[8px] font-medium text-console-success bg-console-success/10 hover:bg-console-success/20 rounded transition-all shrink-0"
            title="Start server"
          >
            <Play className="w-2 h-2" />
            {acting ? "Starting..." : "Start"}
          </button>
          {server.isCustom && onRemove && (
            <button
              onClick={() => onRemove(server.name)}
              className="p-0.5 text-console-dim hover:text-console-error opacity-0 group-hover:opacity-100 transition-all shrink-0"
              title="Remove server"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </>
      )}
    </div>
  );
}

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
        className="flex items-center gap-1 px-2 py-1 text-[9px] text-console-dim hover:text-console-text transition-colors w-full"
      >
        <PlusCircle className="w-3 h-3" />
        Add Server
      </button>
    );
  }

  return (
    <div className="px-2 py-1.5 space-y-1.5 border-t border-console-border/50">
      <input
        type="text"
        placeholder="Name (e.g. my-app)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full px-2 py-1 text-[10px] bg-console-bg border border-console-border rounded text-console-text placeholder:text-console-dim focus:outline-none focus:border-console-accent"
      />
      <input
        type="text"
        placeholder="Directory (e.g. ~/Code/my-app)"
        value={cwd}
        onChange={(e) => setCwd(e.target.value)}
        className="w-full px-2 py-1 text-[10px] bg-console-bg border border-console-border rounded text-console-text placeholder:text-console-dim focus:outline-none focus:border-console-accent"
      />
      <input
        type="text"
        placeholder="Command (default: npm run dev)"
        value={command}
        onChange={(e) => setCommand(e.target.value)}
        className="w-full px-2 py-1 text-[10px] bg-console-bg border border-console-border rounded text-console-text placeholder:text-console-dim focus:outline-none focus:border-console-accent"
      />
      <div className="flex gap-1">
        <button
          onClick={handleSubmit}
          disabled={!name.trim() || !cwd.trim()}
          className="flex-1 px-2 py-1 text-[9px] font-medium text-console-bg bg-console-accent hover:bg-console-accent/90 disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors"
        >
          Add
        </button>
        <button
          onClick={() => setOpen(false)}
          className="px-2 py-1 text-[9px] text-console-dim hover:text-console-text transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function formatUptime(startTime: string): string {
  try {
    const start = new Date(startTime);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) return `${diffMin}m`;
    const diffHr = Math.floor(diffMin / 60);
    const remainMin = diffMin % 60;
    return `${diffHr}h${remainMin > 0 ? ` ${remainMin}m` : ""}`;
  } catch {
    return "?";
  }
}

function shortenCwd(cwd: string): string {
  if (cwd === "unknown") return "unknown";
  const homeMatch = cwd.match(/^\/(?:Users|home)\/[^/]+/);
  if (homeMatch) return "~" + cwd.slice(homeMatch[0].length);
  return cwd;
}

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

  // Check if this process belongs to a managed session
  const managedSession = sessions.find((s) => s.pid === proc.pid);
  const roomSession =
    managedSession?.meta?.group === "room" ? managedSession : undefined;
  const roomName = roomSession?.meta?.roomName;

  // Derive human-readable label: managed session name > project dir > fallback
  const projectName =
    proc.cwd !== "unknown" ? (proc.cwd.split("/").pop() ?? "Claude") : "Claude";
  const displayLabel = roomName
    ? (roomSession?.meta?.agent ?? "Agent")
    : (managedSession?.name ?? projectName);
  const uptime = formatUptime(proc.startTime);

  return (
    <div
      className="px-2 py-1.5 space-y-0.5 group"
      title={`PID ${proc.pid}\nCommand: ${proc.command} ${proc.args}\nCwd: ${proc.cwd}\nStarted: ${proc.startTime}`}
    >
      <div className="flex items-center gap-2">
        <Cpu className="w-3 h-3 text-console-muted shrink-0" />
        <span className="text-[10px] text-console-text flex-1 truncate">
          {displayLabel}
        </span>
        {roomName && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-console-accent/20 text-console-accent font-mono shrink-0">
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
                  : "bg-console-border text-console-dim",
            )}
          >
            {proc.modelShort}
          </span>
        )}
        <span className="flex items-center gap-0.5 text-[9px] text-console-dim shrink-0">
          <Clock className="w-2.5 h-2.5" />
          {uptime}
        </span>
        {/* Kill button with 2-click confirmation */}
        {confirmKill ? (
          <button
            onClick={() => {
              setKilling(true);
              setConfirmKill(false);
              onKillProcess(proc.pid);
              setTimeout(() => setKilling(false), 3000);
            }}
            disabled={killing}
            className="text-[8px] px-1.5 py-0.5 rounded bg-console-error/20 text-console-error hover:bg-console-error/30 font-medium shrink-0 transition-colors"
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
                ? "text-console-error cursor-not-allowed"
                : "text-console-dim hover:text-console-error opacity-0 group-hover:opacity-100",
            )}
            title={`Kill process ${proc.pid}`}
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="pl-5 flex items-center gap-2">
        <span className="text-[9px] text-console-muted truncate flex-1 min-w-0">
          {managedSession ? shortenCwd(proc.cwd) : projectName}
        </span>
        {proc.totalCost != null && proc.totalCost > 0 && (
          <span className="text-[9px] text-console-accent font-mono shrink-0">
            {formatCostDisplay(proc.totalCost)}
          </span>
        )}
        <span className="text-[9px] text-console-dim shrink-0">
          running {uptime}
        </span>
      </div>
    </div>
  );
}

function RecentSessionItem({
  session,
  onResume,
  resumingId,
}: {
  session: PastSession;
  onResume: (session: PastSession) => void;
  resumingId: string | null;
}) {
  const projectShort =
    session.projectShort ?? session.project.split("/").pop() ?? session.project;
  const dateStr = formatHistoryDate(session.date);

  // Show: preview text (first user message) as the main display
  const displayName = session.preview
    ? session.preview.length > 50
      ? session.preview.slice(0, 50) + "..."
      : session.preview
    : projectShort;

  // Subtitle: agent (if any) + project + time
  const subtitle = [session.agent, projectShort, dateStr]
    .filter(Boolean)
    .join(" \u00b7 ");

  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 group"
      title={`${session.preview ?? ""}\n${session.agent ? `Agent: ${session.agent}\n` : ""}${session.project}\nSession: ${session.id}`}
    >
      <History className="w-3 h-3 text-console-dim shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-[10px] text-console-muted truncate block">
          {displayName}
        </span>
        <span className="text-[9px] text-console-dim truncate block">
          {subtitle}
        </span>
      </div>
      <button
        onClick={() => onResume(session)}
        disabled={resumingId === session.id}
        className={cn(
          "flex items-center gap-0.5 px-1.5 py-0.5 text-[8px] font-medium rounded transition-all shrink-0",
          resumingId === session.id
            ? "text-console-dim bg-console-border cursor-not-allowed opacity-100"
            : "opacity-0 group-hover:opacity-100 text-console-accent bg-console-accent/10 hover:bg-console-accent/20 active:bg-console-accent/30",
        )}
        title={`Resume session ${session.id.slice(0, 8)}`}
      >
        <Play className="w-2 h-2" />
        {resumingId === session.id ? "Resuming..." : "Resume"}
      </button>
    </div>
  );
}

function formatHistoryDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  } catch {
    return iso;
  }
}

export function Sidebar({ onNewSession, onKillSession }: SidebarProps) {
  const sessions = useSessionsStore((s) => s.sessions);
  const focusedId = useSessionsStore((s) => s.focusedId);
  const visibleIds = useSessionsStore((s) => s.visibleIds);
  const swapIn = useSessionsStore((s) => s.swapIn);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const repos = useGitStore((s) => s.repos);
  const openPrModal = useGitStore((s) => s.openPrModal);

  const [runningProcesses, setRunningProcesses] = useState<DiscoveredProcess[]>(
    [],
  );
  const [recentSessions, setRecentSessions] = useState<PastSession[]>([]);
  const [devServers, setDevServers] = useState<DevServer[]>([]);
  const setLauncherOpen = useUIStore((s) => s.setLauncherOpen);

  // Resume state — prevents duplicate clicks
  const [resumingId, setResumingId] = useState<string | null>(null);

  // Modal states
  const [changesRepo, setChangesRepo] = useState<RepoStatus | null>(null);
  const [commitRepo, setCommitRepo] = useState<RepoStatus | null>(null);
  const [pushRepo, setPushRepo] = useState<RepoStatus | null>(null);

  const fetchProcesses = useCallback(async () => {
    try {
      const res = await fetch("/api/processes");
      if (res.ok) {
        const procs = (await res.json()) as DiscoveredProcess[];
        setRunningProcesses(procs);
      }
    } catch (e) {
      console.error("Failed to fetch processes:", e);
    }
  }, []);

  const handleKillProcess = useCallback(
    async (pid: number) => {
      try {
        await fetch(`/api/processes/${pid}/kill`, { method: "POST" });
        // Refresh process list after a short delay
        setTimeout(() => void fetchProcesses(), 1000);
      } catch (e) {
        console.error("Failed to kill process:", e);
      }
    },
    [fetchProcesses],
  );

  const fetchDevServers = useCallback(async () => {
    try {
      const res = await fetch("/api/servers");
      if (res.ok) {
        const servers = (await res.json()) as DevServer[];
        setDevServers(servers);
      }
    } catch (e) {
      console.error("Failed to fetch dev servers:", e);
    }
  }, []);

  const handleStopServer = useCallback(
    async (pid: number) => {
      try {
        await fetch(`/api/servers/${pid}/stop`, { method: "POST" });
        setTimeout(() => void fetchDevServers(), 1500);
      } catch (e) {
        console.error("Failed to stop server:", e);
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
          // Server start returns immediately after port detection
          void fetchDevServers();
        } else {
          // Still refresh after delay in case of slow start
          setTimeout(() => void fetchDevServers(), 3000);
        }
      } catch (e) {
        console.error("Failed to start server:", e);
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
      } catch (e) {
        console.error("Failed to add dev server:", e);
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
      } catch (e) {
        console.error("Failed to remove dev server:", e);
      }
    },
    [fetchDevServers],
  );

  const fetchRecentSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions/history");
      if (res.ok) {
        const sessions = (await res.json()) as PastSession[];
        setRecentSessions(sessions);
      }
    } catch (e) {
      console.error("Failed to fetch recent sessions:", e);
    }
  }, []);

  useEffect(() => {
    void fetchProcesses();
    void fetchRecentSessions();
    void fetchDevServers();
    const interval = setInterval(() => void fetchProcesses(), 15_000);
    const serverInterval = setInterval(() => void fetchDevServers(), 10_000);
    return () => {
      clearInterval(interval);
      clearInterval(serverInterval);
    };
  }, [fetchProcesses, fetchRecentSessions, fetchDevServers]);

  // Filter out room-managed sessions — those only appear in Team Chat
  const managedSessions = sessions.filter((s) => s.meta?.group !== "room");

  return (
    <aside className="w-56 border-r border-console-border console-panel-bg shrink-0 flex flex-col h-full">
      {/* New Session button + collapse */}
      <div className="flex items-center gap-2 px-2 py-2 border-b border-console-border">
        <button
          onClick={onNewSession}
          className="flex items-center gap-1.5 flex-1 px-2 py-1.5 text-xs font-medium rounded bg-console-accent/15 text-console-accent hover:bg-console-accent/25 active:bg-console-accent/35 active:scale-95 transition-all btn-lift"
        >
          <Plus className="w-3.5 h-3.5" />
          New Session
        </button>
        <button
          onClick={toggleSidebar}
          className="p-1 text-console-dim hover:text-console-muted transition-colors"
          title="Collapse sidebar"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin py-2 px-1 space-y-4">
        {/* SESSIONS */}
        <SessionGroup title="Sessions" count={managedSessions.length}>
          {managedSessions.length === 0 ? (
            <p className="text-[10px] text-console-dim px-2 py-2">
              Click + New Session to start
            </p>
          ) : (
            managedSessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                focused={session.id === focusedId}
                visible={visibleIds.includes(session.id)}
                onFocus={() => swapIn(session.id)}
                onKill={() => onKillSession(session.id)}
              />
            ))
          )}
        </SessionGroup>

        {/* SERVERS */}
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
            />
          ))}
          <AddServerForm onAdd={handleAddCustomServer} />
        </SessionGroup>

        {/* RUNNING ON THIS MACHINE */}
        {runningProcesses.length > 0 && (
          <SessionGroup
            title="Running on Machine"
            count={runningProcesses.length}
            defaultOpen={false}
          >
            {runningProcesses.map((proc) => (
              <RunningProcessItem
                key={proc.pid}
                proc={proc}
                onKillProcess={handleKillProcess}
              />
            ))}
          </SessionGroup>
        )}

        {/* RECENT SESSIONS */}
        {recentSessions.length > 0 && (
          <SessionGroup
            title="Recent Sessions"
            count={recentSessions.length}
            defaultOpen={false}
          >
            {recentSessions.slice(0, 10).map((session) => (
              <RecentSessionItem
                key={session.id}
                session={session}
                resumingId={resumingId}
                onResume={(s) => {
                  if (resumingId) return; // Prevent duplicate
                  setResumingId(s.id);
                  void (async () => {
                    try {
                      // Use the session's project path as CWD (prepend / since it's missing)
                      const cwd = "/" + s.project;

                      // Use preview as session name, truncated to 30 chars
                      const name = s.preview
                        ? s.preview.length > 30
                          ? s.preview.slice(0, 30) + "..."
                          : s.preview
                        : `resume-${s.id.slice(0, 8)}`;

                      await fetch("/api/sessions", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          name,
                          command: "claude",
                          args: [
                            "--resume",
                            s.id,
                            "--dangerously-skip-permissions",
                          ],
                          cwd,
                          meta: {
                            model: "sonnet",
                            agent: "resumed",
                            permissions: "bypass",
                            channel: "none",
                            group: "standalone",
                          },
                        }),
                      });
                    } finally {
                      // Clear after 5s so user can retry if needed
                      setTimeout(() => setResumingId(null), 5000);
                    }
                  })();
                }}
              />
            ))}
          </SessionGroup>
        )}

        {/* REPOS (merged Folders + Git) */}
        <SessionGroup title="Repos" count={repos.length} defaultOpen={true}>
          {repos.map((repo) => (
            <RepoItem
              key={repo.path + repo.name}
              repo={repo}
              onCreatePR={openPrModal}
              onViewChanges={setChangesRepo}
              onCommit={setCommitRepo}
              onPush={setPushRepo}
            />
          ))}
        </SessionGroup>
      </div>

      {/* Modals */}
      {changesRepo && (
        <ChangesPopup repo={changesRepo} onClose={() => setChangesRepo(null)} />
      )}
      {commitRepo && (
        <CommitModal repo={commitRepo} onClose={() => setCommitRepo(null)} />
      )}
      {pushRepo && (
        <PushModal repo={pushRepo} onClose={() => setPushRepo(null)} />
      )}
    </aside>
  );
}
