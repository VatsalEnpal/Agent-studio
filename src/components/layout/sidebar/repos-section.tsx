"use client";

import { useState } from "react";
import { FolderIcon, GitBranchIcon, GitPRIcon, GitCommitIcon, EyeIcon, UploadIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { useGitStore } from "@/stores/git";
import { SessionGroup } from "@/components/sessions/session-group";
import type { RepoStatus } from "@/lib/types";
import { openFolder } from "./utils";
import { ChangesPopup, CommitModal, PushModal } from "./git-modals";

export function ReposSection() {
  const repos = useGitStore((s) => s.repos);
  const openPrModal = useGitStore((s) => s.openPrModal);

  const [changesRepo, setChangesRepo] = useState<RepoStatus | null>(null);
  const [commitRepo, setCommitRepo] = useState<RepoStatus | null>(null);
  const [pushRepo, setPushRepo] = useState<RepoStatus | null>(null);

  return (
    <>
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

      {changesRepo && (
        <ChangesPopup
          repo={changesRepo}
          onClose={() => setChangesRepo(null)}
        />
      )}
      {commitRepo && (
        <CommitModal repo={commitRepo} onClose={() => setCommitRepo(null)} />
      )}
      {pushRepo && (
        <PushModal repo={pushRepo} onClose={() => setPushRepo(null)} />
      )}
    </>
  );
}

/* ---------- Repo Item ---------- */

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
        <FolderIcon className="w-3.5 h-3.5 shrink-0 text-text-secondary" />
        <span className="text-[10px] text-text-primary font-medium truncate flex-1">
          {repo.name}
        </span>
        {isProd && (
          <span className="text-[8px] px-1 py-0.5 rounded bg-red-500/20 text-red-400 font-bold shrink-0">
            PROD
          </span>
        )}
        <span className="text-[9px] px-1 py-0.5 rounded bg-rooms/10 text-rooms font-mono shrink-0 max-w-[80px] truncate">
          {repo.branch}
        </span>
        <span
          className={cn(
            "w-2 h-2 rounded-full shrink-0",
            repo.dirty ? "bg-error" : "bg-sessions",
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
                const commitMsg = b.lastCommit.replace(/^[a-f0-9]+ /, "");
                const commitHash = b.lastCommit.split(" ")[0] ?? "";
                return (
                  <div
                    key={b.name}
                    className="flex items-center gap-1.5 text-[9px] text-text-tertiary"
                    title={b.lastCommit}
                  >
                    <GitBranchIcon className="w-2.5 h-2.5 shrink-0" />
                    <span className="font-mono text-text-secondary shrink-0">
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

      {/* Action buttons on hover */}
      <div
        className="flex items-center gap-1 mt-1 pl-5 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => onViewChanges(repo)}
          className="p-0.5 text-text-tertiary hover:text-rooms transition-all"
          title="View Changes"
        >
          <EyeIcon className="w-3 h-3" />
        </button>
        {!isProd && (
          <button
            onClick={() => onCommit(repo)}
            className="p-0.5 text-text-tertiary hover:text-rooms transition-all"
            title="Commit"
          >
            <GitCommitIcon className="w-3 h-3" />
          </button>
        )}
        <button
          onClick={() => onPush(repo)}
          className={cn(
            "p-0.5 transition-all",
            isProd
              ? "text-red-400/60 hover:text-red-400"
              : "text-text-tertiary hover:text-rooms",
          )}
          title={isProd ? "Push (PROD - requires confirmation)" : "Push"}
        >
          <UploadIcon className="w-3 h-3" />
        </button>
        <button
          onClick={() => onCreatePR(repo)}
          className={cn(
            "p-0.5 transition-all",
            isProd
              ? "text-red-400/60 hover:text-red-400"
              : "text-text-tertiary hover:text-rooms",
          )}
          title="Create Pull Request"
        >
          <GitPRIcon className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
