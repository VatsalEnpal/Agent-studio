import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { getConfig } from "./config.js";
import { register as registerPoller, unregister as unregisterPoller } from "./services/poller.js";
import { ttlCache } from "./services/ttl-cache.js";

const POLLER_KEY = "git-status";
const execAsync = promisify(exec);

/** 5s TTL per ShipLoop plan task 4. */
const GIT_STATUS_TTL_MS = 5_000;
const statusCache = ttlCache<RepoStatus | null>(GIT_STATUS_TTL_MS);

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

async function execGit(cmd: string, cwd: string): Promise<string> {
  try {
    const { stdout } = await execAsync(cmd, {
      cwd,
      encoding: "utf-8",
      timeout: 5000,
    });
    return stdout.toString().trim();
  } catch {
    return "";
  }
}

async function getBranchInfo(
  repoPath: string,
  branchName: string,
  currentBranch: string,
): Promise<BranchInfo | null> {
  // Check if branch exists locally
  const exists = await execGit(`git rev-parse --verify ${branchName}`, repoPath);
  if (!exists) return null;

  const lastCommit =
    (await execGit(`git log --oneline -1 ${branchName}`, repoPath)) || "no commits";
  return {
    name: branchName,
    lastCommit,
    isCurrent: branchName === currentBranch,
  };
}

async function getRepoStatus(repo: RepoConfig): Promise<RepoStatus | null> {
  if (!existsSync(repo.path)) {
    return null;
  }

  // Honor per-repo TTL cache. Key by absolute path.
  const cached = statusCache.get(repo.path);
  if (cached !== undefined) return cached;

  const branch = (await execGit("git branch --show-current", repo.path)) || "detached";
  const porcelain = await execGit("git status --porcelain", repo.path);
  const changedFiles = porcelain
    ? porcelain.split("\n").filter((line) => line.trim().length > 0).length
    : 0;
  const dirty = changedFiles > 0;
  const lastCommit = (await execGit("git log --oneline -1", repo.path)) || "no commits";

  // Collect tracked branches info
  const branches: BranchInfo[] = [];
  const trackedNames = new Set(repo.trackedBranches ?? []);
  // Always include current branch
  trackedNames.add(branch);

  for (const name of trackedNames) {
    const info = await getBranchInfo(repo.path, name, branch);
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

  const status: RepoStatus = {
    path: repo.path,
    name: repo.name,
    branch,
    dirty,
    lastCommit,
    changedFiles,
    isProd: repo.isProd,
    branches,
  };
  statusCache.set(repo.path, status);
  return status;
}

export class GitWatcher {
  private repos: RepoConfig[];
  private callbacks = new Set<GitUpdateCallback>();
  private lastSnapshot = "";
  /**
   * Last computed snapshot. Populated by `poll()` and returned by `getStatus()`
   * synchronously so existing callers (WS connect handler, express routes) can
   * stay synchronous while the actual git shellouts happen async.
   */
  private cachedStatuses: RepoStatus[] = [];

  constructor(repos?: RepoConfig[]) {
    this.repos = repos ?? getDefaultRepos();
  }

  /**
   * Synchronous snapshot accessor. Returns the most recent status computed by
   * the poller. If the poller has not yet run, this returns an empty array —
   * the WS `git-update` event will fire as soon as the first poll completes.
   */
  getStatus(): RepoStatus[] {
    return this.cachedStatuses;
  }

  /** Async path for callers that want a fresh-right-now result (respects TTL). */
  async getStatusAsync(): Promise<RepoStatus[]> {
    const results: RepoStatus[] = [];
    for (const repo of this.repos) {
      const status = await getRepoStatus(repo);
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

  private async poll(): Promise<void> {
    const statuses = await this.getStatusAsync();
    this.cachedStatuses = statuses;
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
