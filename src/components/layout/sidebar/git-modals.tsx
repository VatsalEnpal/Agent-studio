"use client";

import { useState, useEffect } from "react";
import { GitCommitIcon, EyeIcon, UploadIcon, WarningIcon, CheckIcon, CloseIcon } from "@/components/ui/icons";
import { AmberLoadingBar } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { RepoStatus } from "@/lib/types";

/* ---------- Changes Popup ---------- */

export function ChangesPopup({
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
        className="bg-bg-base border border-border-default rounded shadow-2xl w-full max-w-md p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-border-default">
          <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
            <EyeIcon className="w-3.5 h-3.5" />
            Changes: {repo.name}
          </span>
          <button
            onClick={onClose}
            className="p-0.5 text-text-tertiary hover:text-text-primary"
          >
            <CloseIcon className="w-3.5 h-3.5" />
          </button>
        </div>
        {changes === "Loading..." && <AmberLoadingBar />}
        <div className="px-3 py-2 max-h-72 overflow-auto">
          {changes === "Loading..." ? (
            <p className="text-xs text-text-tertiary py-2">
              Loading changes...
            </p>
          ) : isClean ? (
            <div className="flex items-center gap-2 py-3 justify-center">
              <CheckIcon className="w-4 h-4 text-sessions" />
              <span className="text-xs text-sessions font-medium">
                Working tree clean
              </span>
            </div>
          ) : (
            <div className="space-y-0.5">
              <p className="text-2xs text-text-tertiary mb-1.5">
                {lines.length} changed file{lines.length !== 1 ? "s" : ""}
              </p>
              {lines.map((line, i) => {
                const status = line.slice(0, 2).trim();
                const file = line.slice(3);
                let statusColor = "text-text-secondary";
                let statusLabel = status;
                if (status === "M") {
                  statusColor = "text-rooms";
                  statusLabel = "M";
                } else if (status === "A") {
                  statusColor = "text-sessions";
                  statusLabel = "A";
                } else if (status === "D") {
                  statusColor = "text-error";
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
                        "text-xs font-mono font-bold w-4 text-center shrink-0",
                        statusColor,
                      )}
                    >
                      {statusLabel}
                    </span>
                    <span className="text-xs font-mono text-text-secondary truncate">
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

export function CommitModal({
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
      <div className="bg-bg-base border border-border-default rounded shadow-2xl w-full max-w-sm p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border-default">
          <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
            <GitCommitIcon className="w-3.5 h-3.5" />
            Commit: {repo.name}
          </span>
          <button
            onClick={onClose}
            className="p-0.5 text-text-tertiary hover:text-text-primary"
          >
            <CloseIcon className="w-3.5 h-3.5" />
          </button>
        </div>
        {status === "committing" && <AmberLoadingBar />}
        <div className="px-3 py-2 space-y-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Commit message..."
            disabled={status === "committing" || status === "success"}
            className="w-full px-2 py-1.5 text-xs bg-bg-surface border border-border-default rounded text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-rooms"
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCommit();
            }}
          />
          {status === "error" && (
            <div className="text-xs text-error bg-error/10 px-2 py-1 rounded">
              {output}
            </div>
          )}
          {status === "success" && (
            <div className="text-xs text-sessions bg-sessions/10 px-2 py-1 rounded">
              {output}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-3 py-2 border-t border-border-default">
          <button
            onClick={onClose}
            className="px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
          >
            {status === "success" ? "Close" : "Cancel"}
          </button>
          {status !== "success" && (
            <button
              onClick={() => void handleCommit()}
              disabled={!message.trim() || status === "committing"}
              className={cn(
                "px-2 py-1 text-xs font-medium rounded transition-all",
                !message.trim() || status === "committing"
                  ? "bg-border-default text-text-tertiary cursor-not-allowed"
                  : "bg-rooms text-white hover:bg-rooms/80",
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

/* ---------- Push Modal ---------- */

export function PushModal({
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
      <div className="bg-bg-base border border-border-default rounded shadow-2xl w-full max-w-sm p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border-default">
          <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
            <UploadIcon className="w-3.5 h-3.5" />
            Push: {repo.name}
          </span>
          <button
            onClick={onClose}
            className="p-0.5 text-text-tertiary hover:text-text-primary"
          >
            <CloseIcon className="w-3.5 h-3.5" />
          </button>
        </div>
        {status === "pushing" && <AmberLoadingBar />}
        <div className="px-3 py-2 space-y-2">
          {isProd && (
            <div className="flex items-start gap-2 px-2 py-2 bg-red-500/10 border border-red-500/30 rounded text-red-400">
              <WarningIcon className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-bold">
                  WARNING: PRODUCTION REPO
                </p>
                <p className="text-2xs">
                  You are pushing to the production repository. Are you absolutely sure?
                </p>
                <p className="text-2xs">
                  Type{" "}
                  <span className="font-mono font-bold">CONFIRM</span> to
                  proceed:
                </p>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="Type CONFIRM"
                  className="w-full px-2 py-1 text-xs bg-bg-base border border-red-500/40 rounded text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-red-400"
                />
              </div>
            </div>
          )}
          {!isProd && (
            <p className="text-xs text-text-secondary">
              Push current branch to origin?
            </p>
          )}
          {status === "error" && (
            <div className="text-xs text-error bg-error/10 px-2 py-1 rounded">
              {output}
            </div>
          )}
          {status === "success" && (
            <div className="text-xs text-sessions bg-sessions/10 px-2 py-1 rounded">
              {output}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-3 py-2 border-t border-border-default">
          <button
            onClick={onClose}
            className="px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
          >
            {status === "success" ? "Close" : "Cancel"}
          </button>
          {status !== "success" && (
            <button
              onClick={() => void handlePush()}
              disabled={!canPush || status === "pushing"}
              className={cn(
                "px-2 py-1 text-xs font-medium rounded transition-all",
                !canPush || status === "pushing"
                  ? "bg-border-default text-text-tertiary cursor-not-allowed"
                  : isProd
                    ? "bg-red-500 text-white hover:bg-red-600"
                    : "bg-rooms text-white hover:bg-rooms/80",
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
