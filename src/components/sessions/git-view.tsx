"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowLeftIcon, GitBranchIcon, GitCommitIcon, ChevronDownIcon, PlusIcon, UploadIcon, GitMergeIcon, FileIcon, FilePlusIcon, FileMinusIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { useGitStore } from "@/stores/git";
import type { RepoStatus, BranchInfo } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommitInfo {
  hash: string;
  message: string;
  author: string;
  date: string;
}

interface ChangedFile {
  path: string;
  status: "M" | "A" | "D" | "?" | string;
}

// ---------------------------------------------------------------------------
// File status indicator
// ---------------------------------------------------------------------------

function FileStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "M":
      return (
        <span className="text-label-xs px-1 rounded bg-warning-subtle text-warning">
          M
        </span>
      );
    case "A":
    case "?":
      return (
        <span className="text-label-xs px-1 rounded bg-success-subtle text-success">
          A
        </span>
      );
    case "D":
      return (
        <span className="text-label-xs px-1 rounded bg-error-subtle text-error">
          D
        </span>
      );
    default:
      return (
        <span className="text-label-xs px-1 rounded bg-accent-subtle text-accent">
          {status}
        </span>
      );
  }
}

// ---------------------------------------------------------------------------
// GitView
// ---------------------------------------------------------------------------

interface GitViewProps {
  repo: RepoStatus;
  onBack: () => void;
}

export function GitView({ repo, onBack }: GitViewProps) {
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [changedFiles, setChangedFiles] = useState<ChangedFile[]>([]);
  const [branches, setBranches] = useState<BranchInfo[]>(repo.branches ?? []);
  const [currentBranch, setCurrentBranch] = useState(repo.branch);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [prTitle, setPrTitle] = useState("");
  const [prBody, setPrBody] = useState("");
  const [showPrForm, setShowPrForm] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [creatingPr, setCreatingPr] = useState(false);

  const openPrModal = useGitStore((s) => s.openPrModal);

  // Fetch git details for the repo
  const fetchDetails = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/git/details?path=${encodeURIComponent(repo.path)}`,
      );
      if (res.ok) {
        const data = (await res.json()) as {
          commits: CommitInfo[];
          changedFiles: ChangedFile[];
          branches: BranchInfo[];
          currentBranch: string;
        };
        setCommits(data.commits ?? []);
        setChangedFiles(data.changedFiles ?? []);
        if (data.branches?.length) setBranches(data.branches);
        if (data.currentBranch) setCurrentBranch(data.currentBranch);
      }
    } catch (e) {
      console.error("Caught error:", e);
    }
  }, [repo.path]);

  useEffect(() => {
    void fetchDetails();
  }, [fetchDetails]);

  const handlePush = useCallback(async () => {
    setPushing(true);
    try {
      const res = await fetch("/api/git/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: repo.path }),
      });
      if (!res.ok) throw new Error("Push failed");
      void fetchDetails();
    } catch (e) {
      console.error("Caught error:", e);
    } finally {
      setPushing(false);
    }
  }, [repo.path, fetchDetails]);

  const handleSwitchBranch = useCallback(
    async (branchName: string) => {
      setBranchDropdownOpen(false);
      try {
        const res = await fetch("/api/git/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: repo.path, branch: branchName }),
        });
        if (res.ok) {
          setCurrentBranch(branchName);
          void fetchDetails();
        }
      } catch (e) {
        console.error("Caught error:", e);
      }
    },
    [repo.path, fetchDetails],
  );

  return (
    <div className="flex flex-col h-full bg-canvas">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle shrink-0">
        <button
          onClick={onBack}
          className="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-all"
          title="Back to terminal"
        >
          <ArrowLeftIcon className="size-4" />
        </button>
        <GitBranchIcon className="size-4 text-text-secondary" />
        <h2 className="text-title-sm text-text-emphasis truncate">{repo.name}</h2>

        {/* Branch switcher */}
        <div className="relative ml-auto">
          <button
            onClick={() => setBranchDropdownOpen((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 px-2 py-1 rounded",
              "text-body-sm text-accent border border-accent/20 bg-accent-subtle",
              "hover:bg-accent/10 transition-all",
            )}
          >
            <GitBranchIcon className="size-3" />
            {currentBranch}
            <ChevronDownIcon className="size-3" />
          </button>
          {branchDropdownOpen && branches.length > 0 && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-surface border border-border rounded shadow-modal z-dropdown max-h-48 overflow-y-auto">
              {branches.map((b) => (
                <button
                  key={b.name}
                  onClick={() => handleSwitchBranch(b.name)}
                  className={cn(
                    "flex items-center gap-2 w-full px-3 py-1.5 text-left",
                    "text-body-sm hover:bg-surface-hover transition-all",
                    b.name === currentBranch
                      ? "text-accent bg-accent-subtle"
                      : "text-text-primary",
                  )}
                >
                  {b.isCurrent && (
                    <span className="size-1.5 rounded-full bg-success shrink-0" />
                  )}
                  <span className="truncate">{b.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* Actions bar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border-subtle">
          <button
            onClick={handlePush}
            disabled={pushing}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded",
              "text-body-sm font-medium",
              "border border-border hover:border-accent/30 hover:bg-surface-hover",
              "transition-all disabled:opacity-50",
            )}
          >
            <UploadIcon className="size-3.5" />
            {pushing ? "Pushing..." : "Push"}
          </button>
          <button
            onClick={() => openPrModal(repo)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded",
              "text-body-sm font-medium",
              "border border-border hover:border-accent/30 hover:bg-surface-hover",
              "transition-all",
            )}
          >
            <PlusIcon className="size-3.5" />
            Create PR
          </button>
          <button
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded",
              "text-body-sm font-medium text-text-secondary",
              "border border-border hover:border-accent/30 hover:bg-surface-hover",
              "transition-all",
            )}
          >
            <GitMergeIcon className="size-3.5" />
            Merge
          </button>
        </div>

        {/* Changed files */}
        {changedFiles.length > 0 && (
          <div className="px-4 py-3">
            <h3 className="text-label-xs uppercase text-text-tertiary mb-2">
              Changed Files ({changedFiles.length})
            </h3>
            <div className="space-y-0.5">
              {changedFiles.map((file) => (
                <div
                  key={file.path}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-hover transition-all"
                >
                  <FileStatusBadge status={file.status} />
                  <span className="text-body-sm text-text-primary truncate font-mono">
                    {file.path}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent commits */}
        <div className="px-4 py-3">
          <h3 className="text-label-xs uppercase text-text-tertiary mb-2">
            Recent Commits
          </h3>
          {commits.length === 0 ? (
            <p className="text-body-sm text-text-tertiary">Loading commits...</p>
          ) : (
            <div className="space-y-0.5">
              {commits.map((commit) => (
                <div
                  key={commit.hash}
                  className="flex items-start gap-2 px-2 py-2 rounded hover:bg-surface-hover transition-all"
                >
                  <GitCommitIcon className="size-3.5 text-text-tertiary mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm text-text-primary truncate">
                      {commit.message}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-label-xs text-text-tertiary font-mono">
                        {commit.hash.slice(0, 7)}
                      </span>
                      <span className="text-label-xs text-text-tertiary">
                        {commit.author}
                      </span>
                      <span className="text-label-xs text-text-tertiary">
                        {commit.date}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
