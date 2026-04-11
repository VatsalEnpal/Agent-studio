import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { getConfig } from "./config.js";

const execFileAsync = promisify(execFile);

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
  return config.projects.map((p) => {
    const repo: RepoConfig = {
      name: p.name,
      path: p.path,
      isProd: p.isProd,
    };
    if (p.trackedBranches) {
      repo.trackedBranches = p.trackedBranches;
    }
    return repo;
  });
}

async function execGit(cmd: string, cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("bash", ["-c", cmd], {
      cwd,
      encoding: "utf-8",
      timeout: 5000,
    });
    return stdout.trim();
  } catch {
    return "";
  }
}

async function getBranchInfo(
  repoPath: string,
  branchName: string,
  currentBranch: string,
): Promise<BranchInfo | null> {
  const exists = await execGit(
    `git rev-parse --verify ${branchName}`,
    repoPath,
  );
  if (!exists) return null;

  const lastCommit =
    (await execGit(`git log --oneline -1 ${branchName}`, repoPath)) ||
    "no commits";
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

  const branch =
    (await execGit("git branch --show-current", repo.path)) || "detached";
  const porcelain = await execGit("git status --porcelain", repo.path);
  const changedFiles = porcelain
    ? porcelain.split("\n").filter((line) => line.trim().length > 0).length
    : 0;
  const dirty = changedFiles > 0;
  const lastCommit =
    (await execGit("git log --oneline -1", repo.path)) || "no commits";

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
  private interval: ReturnType<typeof setInterval> | null = null;
  private callbacks = new Set<GitUpdateCallback>();
  private lastSnapshot = "";

  constructor(repos?: RepoConfig[]) {
    this.repos = repos ?? getDefaultRepos();
  }

  async getStatus(): Promise<RepoStatus[]> {
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

  start(intervalMs = 10_000): void {
    // Initial poll
    void this.poll();

    // Poll every intervalMs
    this.interval = setInterval(() => {
      void this.poll();
    }, intervalMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.callbacks.clear();
  }

  private async poll(): Promise<void> {
    const statuses = await this.getStatus();
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
