import { Router } from "express";
import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { stat, access } from "node:fs/promises";
import { constants } from "node:fs";
import type { GitWatcher } from "../git-status.js";
import { getConfig } from "../config.js";
import { createPR, getRepoBranches } from "../pr-creator.js";

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

  router.post("/pr", async (req, res) => {
    try {
      const { repo, sourceBranch, targetBranch, title, description } =
        req.body as {
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

  router.get("/changes", async (req, res) => {
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
      const { stdout } = await execAsync("git status --porcelain", {
        cwd: repoPath,
        encoding: "utf-8",
        timeout: 5000,
      });
      res.json({ changes: stdout.trim() || "(no changes)" });
    } catch {
      res.json({ changes: "(unavailable)" });
    }
  });

  router.get("/diff", async (req, res) => {
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
      const [stagedResult, unstagedResult] = await Promise.all([
        execAsync("git diff --cached --stat", { cwd: repoPath, encoding: "utf-8", timeout: 5000 }),
        execAsync("git diff --stat", { cwd: repoPath, encoding: "utf-8", timeout: 5000 }),
      ]);
      res.json({
        staged: stagedResult.stdout.trim() || "(none)",
        unstaged: unstagedResult.stdout.trim() || "(none)",
      });
    } catch {
      res.json({ staged: "(unavailable)", unstaged: "(unavailable)" });
    }
  });

  router.post("/commit", async (req, res) => {
    try {
      const { repo, message: commitMsg } = req.body as {
        repo?: string;
        message?: string;
      };
      if (!repo || !commitMsg) {
        res.status(400).json({ error: "Missing 'repo' or 'message'" });
        return;
      }
      if (!isValidRepoPath(repo)) {
        res.status(400).json({ error: "Repository path not in configured projects" });
        return;
      }

      const statuses = gitWatcher.getStatus();
      const repoInfo = statuses.find((r) => r.path === repo);
      if (repoInfo?.isProd) {
        res.status(403).json({
          error:
            "BLOCKED: Cannot commit directly to production repo. Changes require explicit approval.",
        });
        return;
      }

      await execAsync("git add -A", { cwd: repo, encoding: "utf-8", timeout: 10000 });
      const { stdout } = await execAsync(
        `git commit -m ${JSON.stringify(commitMsg)}`,
        { cwd: repo, encoding: "utf-8", timeout: 10000 },
      );
      res.json({ ok: true, output: stdout.trim() });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  router.post("/push", async (req, res) => {
    try {
      const { repo, confirmed } = req.body as {
        repo?: string;
        confirmed?: boolean;
      };
      if (!repo) {
        res.status(400).json({ error: "Missing 'repo'" });
        return;
      }
      if (!isValidRepoPath(repo)) {
        res.status(400).json({ error: "Repository path not in configured projects" });
        return;
      }

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

      const { stdout } = await execAsync("git push", { cwd: repo, encoding: "utf-8", timeout: 30000 });
      res.json({ ok: true, output: stdout.trim() });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  router.post("/open", async (req, res) => {
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
      try {
        await access(repo, constants.F_OK);
        const s = await stat(repo);
        if (!s.isDirectory()) {
          res.status(400).json({ error: "Invalid directory path" });
          return;
        }
      } catch {
        res.status(400).json({ error: "Invalid directory path" });
        return;
      }

      if (appChoice === "terminal") {
        execFile("open", ["-a", "Terminal", repo], (err) => {
          if (err) res.status(500).json({ error: "Failed to open terminal" });
          else res.json({ ok: true });
        });
      } else if (appChoice === "finder") {
        execFile("open", [repo], (err) => {
          if (err) res.status(500).json({ error: "Failed to open finder" });
          else res.json({ ok: true });
        });
      } else if (appChoice === "code") {
        execFile("code", [repo], (err) => {
          if (err) res.status(500).json({ error: "Failed to open VS Code" });
          else res.json({ ok: true });
        });
      } else {
        execFile("open", [repo], (err) => {
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
