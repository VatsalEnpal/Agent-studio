import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { getConfig } from "./config.js";
import { register as registerPoller, unregister as unregisterPoller } from "./services/poller.js";

const POLLER_KEY = "git-status";

export interface RepoConfig {
  name: string;
  path: string;
  isProd: boolean;
  /** Important branches to always show (besides current) */
  trackedBranches?: string[];
}

export interface BranchInfo {
  name: string;
  lastCommit: string;
  isCurrent: boolean;
}

export interface RepoStatus {
  path: string;
  name: string;
  branch: string;
  dirty: boolean;
  lastCommit: string;
  changedFiles: number;
  isProd: boolean;
  branches: BranchInfo[];
}

export type GitUpdateCallback = (repos: RepoStatus[]) => void;

function getDefaultRepos(): RepoConfig[] {
  const config = getConfig();
  return config.projects.map((p) => ({
    name: p.name,
    path: p.path,
    isProd: p.isProd,
    trackedBranches: p.trackedBranches,
  }));
}

function execGit(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, {
      cwd,
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

function getBranchInfo(
  repoPath: string,
  branchName: string,
  currentBranch: string,
): BranchInfo | null {
  // Check if branch exists locally
  const exists = execGit(`git rev-parse --verify ${branchName}`, repoPath);
  if (!exists) return null;

  const lastCommit = execGit(`git log --oneline -1 ${branchName}`, repoPath) || "no commits";
  return {
    name: branchName,
    lastCommit,
    isCurrent: branchName === currentBranch,
  };
}

function getRepoStatus(repo: RepoConfig): RepoStatus | null {
  if (!existsSync(repo.path)) {
    return null;
  }

  const branch = execGit("git branch --show-current", repo.path) || "detached";
  const porcelain = execGit("git status --porcelain", repo.path);
  const changedFiles = porcelain
    ? porcelain.split("\n").filter((line) => line.trim().length > 0).length
    : 0;
  const dirty = changedFiles > 0;
  const lastCommit = execGit("git log --oneline -1", repo.path) || "no commits";

  // Collect tracked branches info
  const branches: BranchInfo[] = [];
  const trackedNames = new Set(repo.trackedBranches ?? []);
  // Always include current branch
  trackedNames.add(branch);

  for (const name of trackedNames) {
    const info = getBranchInfo(repo.path, name, branch);
    if (info) {
      branches.push(info);
    }
  }

  // Sort: current branch first, then alphabetically
  branches.sort((a, b) => {
    if (a.isCurrent && !b.isCurrent) return -1;
    if (!a.isCurrent && b.isCurrent) return 1;
    return a.name.localeCompare(b.name);
  });

  return {
    path: repo.path,
    name: repo.name,
    branch,
    dirty,
    lastCommit,
    changedFiles,
    isProd: repo.isProd,
    branches,
  };
}

export class GitWatcher {
  private repos: RepoConfig[];
  private callbacks = new Set<GitUpdateCallback>();
  private lastSnapshot = "";

  constructor(repos?: RepoConfig[]) {
    this.repos = repos ?? getDefaultRepos();
  }

  getStatus(): RepoStatus[] {
    const results: RepoStatus[] = [];
    for (const repo of this.repos) {
      const status = getRepoStatus(repo);
      if (status) {
        results.push(status);
      }
    }
    return results;
  }

  onUpdate(callback: GitUpdateCallback): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * Start polling. As of plan task 3a, this registers with the unified
   * poller service (`server/services/poller.ts`) rather than owning its
   * own setInterval. Behavior is unchanged — `git-update` WS events still
   * only fire on a changed snapshot.
   */
  start(intervalMs = 10_000): void {
    registerPoller(POLLER_KEY, intervalMs, () => this.poll());
  }

  stop(): void {
    unregisterPoller(POLLER_KEY);
    this.callbacks.clear();
  }

  private poll(): void {
    const statuses = this.getStatus();
    const snapshot = JSON.stringify(statuses);

    // Only emit if something changed
    if (snapshot !== this.lastSnapshot) {
      this.lastSnapshot = snapshot;
      for (const cb of this.callbacks) {
        cb(statuses);
      }
    }
  }
}
