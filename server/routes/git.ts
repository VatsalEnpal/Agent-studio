import { Router } from "express";
import { exec, execFile, execSync } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs";
import { stat, access } from "node:fs/promises";
import { constants } from "node:fs";
import type { GitWatcher } from "../git-status.js";
import { getConfig } from "../config.js";
import { createPR, getRepoBranches } from "../pr-creator.js";
import { openInOS, openTerminal, openVSCode } from "../platform.js";

const execAsync = promisify(exec);

/**
 * Validate that a repo path is within one of the configured project directories.
 * Prevents arbitrary command execution in attacker-controlled directories.
 */
function isValidRepoPath(repoPath: string): boolean {
  const config = getConfig();
  const resolved = path.resolve(repoPath);
  return config.projects.some((p) => {
    const projectRoot = path.resolve(p.path);
    return resolved === projectRoot || resolved.startsWith(projectRoot + path.sep);
  });
}

export function gitRoutes(gitWatcher: GitWatcher): Router {
  const router = Router();

  router.get("/status", (_req, res) => {
    try {
      const statuses = gitWatcher.getStatus();
      res.json(statuses);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  router.get("/branches", (req, res) => {
    try {
      const repoPath = req.query["repo"] as string | undefined;
      if (!repoPath) {
        res.status(400).json({ error: "Missing 'repo' query parameter" });
        return;
      }
      if (!isValidRepoPath(repoPath)) {
        res.status(400).json({ error: "Repository path not in configured projects" });
        return;
      }
      const branches = getRepoBranches(repoPath);
      res.json(branches);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // Git details (commits, changed files, branches for a repo)
  router.get("/details", (req, res) => {
    try {
      const repoPath = req.query["path"] as string | undefined;
      if (!repoPath) {
        res.status(400).json({ error: "Missing 'path' query parameter" });
        return;
      }
      if (!fs.existsSync(repoPath) || !fs.statSync(repoPath).isDirectory()) {
        res.status(400).json({ error: "Invalid directory path" });
        return;
      }

      // Current branch
      let currentBranch = "unknown";
      try {
        currentBranch = execSync("git rev-parse --abbrev-ref HEAD", {
          cwd: repoPath,
          encoding: "utf-8",
          timeout: 5000,
        }).trim();
      } catch {
        // ignore
      }

      // Branches with ahead/behind relative to main/master
      let branchEntries: {
        name: string;
        isCurrent: boolean;
        lastCommit: string;
        ahead?: number;
        behind?: number;
      }[] = [];
      try {
        const branchOutput = execSync("git branch --format='%(refname:short)'", {
          cwd: repoPath,
          encoding: "utf-8",
          timeout: 5000,
        }).trim();
        if (branchOutput) {
          const branchNames = branchOutput
            .split("\n")
            .map((b) => b.trim().replace(/^'|'$/g, ""))
            .filter((b) => b.length > 0);

          // Detect main branch name (main or master)
          const mainBranch = branchNames.includes("main")
            ? "main"
            : branchNames.includes("master")
              ? "master"
              : null;

          branchEntries = branchNames.map((name) => {
            const isCurrent = name === currentBranch;
            let lastCommit = "";
            try {
              lastCommit = execSync(`git log -1 --format="%s" ${JSON.stringify(name)}`, {
                cwd: repoPath,
                encoding: "utf-8",
                timeout: 5000,
              }).trim();
            } catch {
              // ignore
            }

            let ahead: number | undefined;
            let behind: number | undefined;
            if (mainBranch && name !== mainBranch) {
              try {
                const aheadStr = execSync(
                  `git rev-list --count ${JSON.stringify(mainBranch)}..${JSON.stringify(name)}`,
                  { cwd: repoPath, encoding: "utf-8", timeout: 5000 },
                ).trim();
                ahead = parseInt(aheadStr, 10) || 0;
              } catch {
                // ignore
              }
              try {
                const behindStr = execSync(
                  `git rev-list --count ${JSON.stringify(name)}..${JSON.stringify(mainBranch)}`,
                  { cwd: repoPath, encoding: "utf-8", timeout: 5000 },
                ).trim();
                behind = parseInt(behindStr, 10) || 0;
              } catch {
                // ignore
              }
            }

            return { name, isCurrent, lastCommit, ahead, behind };
          });
        }
      } catch {
        // ignore
      }

      // Recent commits (last 20)
      let commits: { hash: string; message: string; author: string; date: string }[] = [];
      try {
        const logOutput = execSync('git log -20 --format="%H|||%s|||%an|||%ar"', {
          cwd: repoPath,
          encoding: "utf-8",
          timeout: 10000,
        }).trim();
        if (logOutput) {
          commits = logOutput.split("\n").map((line) => {
            const [hash = "", message = "", author = "", date = ""] = line.split("|||");
            return { hash, message, author, date };
          });
        }
      } catch {
        // ignore
      }

      // Changed files
      let changedFiles: { path: string; status: string }[] = [];
      try {
        const statusOutput = execSync("git status --porcelain", {
          cwd: repoPath,
          encoding: "utf-8",
          timeout: 5000,
        }).trim();
        if (statusOutput) {
          changedFiles = statusOutput.split("\n").map((line) => {
            const status = line.substring(0, 2).trim();
            const filePath = line.substring(3);
            return { path: filePath, status };
          });
        }
      } catch {
        // ignore
      }

      res.json({
        commits,
        changedFiles,
        branches: branchEntries,
        currentBranch,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // Create branch
  router.post("/branch", (req, res) => {
    try {
      const { path: repoPath, name } = req.body as {
        path?: string;
        name?: string;
      };
      if (!repoPath || !name) {
        res.status(400).json({ error: "Missing 'path' or 'name'" });
        return;
      }
      if (!fs.existsSync(repoPath) || !fs.statSync(repoPath).isDirectory()) {
        res.status(400).json({ error: "Invalid directory path" });
        return;
      }

      // Validate branch name (no spaces, no special chars except - _ / .)
      if (!/^[\w./-]+$/.test(name)) {
        res.status(400).json({ error: "Invalid branch name" });
        return;
      }

      execSync(`git checkout -b ${JSON.stringify(name)}`, {
        cwd: repoPath,
        encoding: "utf-8",
        timeout: 10000,
      });
      res.json({ ok: true, branch: name });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // Checkout (switch branch)
  router.post("/checkout", (req, res) => {
    try {
      const { path: repoPath, branch } = req.body as {
        path?: string;
        branch?: string;
      };
      if (!repoPath || !branch) {
        res.status(400).json({ error: "Missing 'path' or 'branch'" });
        return;
      }
      if (!fs.existsSync(repoPath) || !fs.statSync(repoPath).isDirectory()) {
        res.status(400).json({ error: "Invalid directory path" });
        return;
      }

      // Check for uncommitted changes first
      const statusOutput = execSync("git status --porcelain", {
        cwd: repoPath,
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
      if (statusOutput) {
        res.json({
          ok: false,
          error: "uncommitted changes",
          dirty: true,
        });
        return;
      }

      execSync(`git checkout ${JSON.stringify(branch)}`, {
        cwd: repoPath,
        encoding: "utf-8",
        timeout: 10000,
      });
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  router.post("/pr", async (req, res) => {
    try {
      const { repo, sourceBranch, targetBranch, title, description } = req.body as {
        repo?: string;
        sourceBranch?: string;
        targetBranch?: string;
        title?: string;
        description?: string;
      };

      if (!repo || !sourceBranch || !targetBranch || !title) {
        res.status(400).json({
          error: "Missing required fields: repo, sourceBranch, targetBranch, title",
        });
        return;
      }
      if (!isValidRepoPath(repo)) {
        res.status(400).json({ error: "Repository path not in configured projects" });
        return;
      }

      const result = await createPR({
        repo,
        sourceBranch,
        targetBranch,
        title,
        description: description ?? "",
      });

      res.status(201).json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  router.get("/changes", (req, res) => {
    try {
      const repoPath = req.query["repo"] as string | undefined;
      if (!repoPath) {
        res.status(400).json({ error: "Missing 'repo' query parameter" });
        return;
      }
      const output = execSync("git status --porcelain", {
        cwd: repoPath,
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
      res.json({ changes: output || "(no changes)" });
    } catch {
      res.json({ changes: "(unavailable)" });
    }
  });

  router.get("/diff", (req, res) => {
    try {
      const repoPath = req.query["repo"] as string | undefined;
      if (!repoPath) {
        res.status(400).json({ error: "Missing 'repo' query parameter" });
        return;
      }
      const staged = execSync("git diff --cached --stat", {
        cwd: repoPath,
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
      const unstaged = execSync("git diff --stat", {
        cwd: repoPath,
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
      res.json({ staged: staged || "(none)", unstaged: unstaged || "(none)" });
    } catch {
      res.json({ staged: "(unavailable)", unstaged: "(unavailable)" });
    }
  });

  router.post("/commit", (req, res) => {
    try {
      const { repo, message: commitMsg } = req.body as {
        repo?: string;
        message?: string;
      };
      if (!repo || !commitMsg) {
        res.status(400).json({ error: "Missing 'repo' or 'message'" });
        return;
      }

      // Safety: check if this is the prod repo
      const statuses = gitWatcher.getStatus();
      const repoInfo = statuses.find((r) => r.path === repo);
      if (repoInfo?.isProd) {
        res.status(403).json({
          error:
            "BLOCKED: Cannot commit directly to production repo. Changes require explicit confirmation.",
        });
        return;
      }

      execSync("git add -u", {
        cwd: repo,
        encoding: "utf-8",
        timeout: 10000,
      });
      const output = execSync(`git commit -m ${JSON.stringify(commitMsg)}`, {
        cwd: repo,
        encoding: "utf-8",
        timeout: 10000,
      }).trim();
      res.json({ ok: true, output });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  router.post("/push", (req, res) => {
    try {
      const { repo, confirmed } = req.body as {
        repo?: string;
        confirmed?: boolean;
      };
      if (!repo) {
        res.status(400).json({ error: "Missing 'repo'" });
        return;
      }

      // Safety: prod repo requires explicit confirmation
      const statuses = gitWatcher.getStatus();
      const repoInfo = statuses.find((r) => r.path === repo);
      if (repoInfo?.isProd && !confirmed) {
        res.status(403).json({
          error:
            "BLOCKED: Pushing to production repo requires explicit confirmation. Set confirmed=true after typing CONFIRM.",
          requiresConfirmation: true,
        });
        return;
      }

      const output = execSync("git push", {
        cwd: repo,
        encoding: "utf-8",
        timeout: 30000,
      }).trim();
      res.json({ ok: true, output });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  router.post("/open", (req, res) => {
    try {
      const { repo, app: appChoice } = req.body as {
        repo?: string;
        app?: string;
      };
      if (!repo || typeof repo !== "string") {
        res.status(400).json({ error: "Missing repo path" });
        return;
      }
      // Validate path exists and is a directory
      if (!fs.existsSync(repo) || !fs.statSync(repo).isDirectory()) {
        res.status(400).json({ error: "Invalid directory path" });
        return;
      }
      // Use cross-platform helpers to open directories
      if (appChoice === "terminal") {
        openTerminal(repo, (err) => {
          if (err) res.status(500).json({ error: "Failed to open terminal" });
          else res.json({ ok: true });
        });
      } else if (appChoice === "finder") {
        openInOS(repo, undefined, (err) => {
          if (err) res.status(500).json({ error: "Failed to open file manager" });
          else res.json({ ok: true });
        });
      } else if (appChoice === "code") {
        openVSCode(repo, (err) => {
          if (err) res.status(500).json({ error: "Failed to open VS Code" });
          else res.json({ ok: true });
        });
      } else {
        openInOS(repo, undefined, (err) => {
          if (err) res.status(500).json({ error: "Failed to open" });
          else res.json({ ok: true });
        });
      }
    } catch {
      res.status(500).json({ error: "Failed to open" });
    }
  });

  return router;
}
