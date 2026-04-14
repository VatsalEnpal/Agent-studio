import { Router } from "express";
import { exec, execSync } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import type { TerminalManager } from "../terminal-manager.js";
import type { WebSocketServer } from "ws";
import { discoverClaudeProcesses } from "../process-discovery.js";
import { analyzeProject } from "../project-analyzer.js";
import { generateSingleAgent, writeQuickImportAgent } from "../quick-import.js";
import { writeClaudeMd } from "../claudemd-generator.js";
import {
  getAllSessionUsage,
  getSessionUsage,
  findSessionIdForPtyPid,
  getUsageBySessionId,
  formatCost,
  formatTokens,
  getDisplayNameForPtyPid,
} from "../session-usage.js";
import {
  getDevServers,
  startDevServer,
  stopDevServer,
  addCustomServer,
  removeCustomServer,
} from "../dev-servers.js";
import { readScanLog } from "../file-watcher.js";
import { getAgentSystemPath } from "../config.js";
import type { WorkflowManager } from "../workflows/index.js";
import {
  whichCommand,
  killProcess as platformKill,
  getDiskUsage,
  isSchedulerLoaded,
  loadScheduler,
  unloadScheduler,
  IS_MAC,
  findListeningPorts,
  getProcessCwd,
} from "../platform.js";

const execAsync = promisify(exec);

export function systemRoutes(
  terminalManager: TerminalManager,
  workflowManager: WorkflowManager,
  deps: {
    validateProjectPath: (p: string) => string | null;
    wss: WebSocketServer;
  },
): Router {
  const router = Router();
  const PMO_PLIST = `${os.homedir()}/Library/LaunchAgents/com.agent-studio.pmo-scan.plist`;
  const PMO_SCAN_SCRIPT = getAgentSystemPath("tools/pmo-scan.sh") ?? "";

  // Process discovery
  router.get("/processes", (_req, res) => {
    try {
      const processes = discoverClaudeProcesses();
      res.json(processes);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // Process kill
  router.post("/processes/:pid/kill", (req, res) => {
    try {
      const pid = parseInt(req.params["pid"]!, 10);
      if (isNaN(pid) || pid <= 0) {
        res.status(400).json({ error: "Invalid PID" });
        return;
      }
      // Safety: don't allow killing PID 1 or the current process
      if (pid === 1 || pid === process.pid) {
        res.status(403).json({ error: "Cannot kill this process" });
        return;
      }
      const killed = platformKill(pid);
      if (!killed) {
        res.status(500).json({ error: "Failed to kill process" });
        return;
      }
      res.json({ ok: true, pid });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // Usage
  router.get("/usage", (_req, res) => {
    try {
      const usage = getAllSessionUsage();
      res.json(usage);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  router.get("/usage/:pid", (req, res) => {
    try {
      const pid = parseInt(req.params["pid"]!, 10);
      if (isNaN(pid)) {
        res.status(400).json({ error: "Invalid PID" });
        return;
      }
      const usage = getSessionUsage(pid);
      if (!usage) {
        res.status(404).json({ error: "No usage data for PID" });
        return;
      }
      res.json(usage);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // All listening ports (for Dev Servers view)
  router.get("/servers/all", (_req, res) => {
    try {
      const selfPid = process.pid;
      const selfPort = parseInt(process.env["PORT"] ?? "8080", 10);
      const raw = findListeningPorts();
      const seen = new Map<
        number,
        { pid: number; port: number; command: string; cwd: string; isSelf: boolean }
      >();

      for (const entry of raw) {
        // Deduplicate by pid -- take the first (lowest) port
        if (seen.has(entry.pid)) continue;
        const cwd = getProcessCwd(entry.pid) ?? "unknown";
        const isSelf = entry.pid === selfPid || entry.port === selfPort;
        seen.set(entry.pid, {
          pid: entry.pid,
          port: entry.port,
          command: entry.command ?? "unknown",
          cwd,
          isSelf,
        });
      }

      res.json(Array.from(seen.values()).sort((a, b) => a.port - b.port));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // Dev servers
  router.get("/servers", (_req, res) => {
    try {
      const servers = getDevServers();
      res.json(servers);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  router.post("/servers/start", async (req, res) => {
    try {
      const { cwd, command } = req.body as { cwd?: string; command?: string };
      if (!cwd) {
        res.status(400).json({ error: "Missing 'cwd'" });
        return;
      }
      const result = await startDevServer(cwd, command ?? "npm run dev");
      res.status(201).json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  router.post("/servers/:pid/stop", (req, res) => {
    try {
      const pid = parseInt(req.params["pid"]!, 10);
      if (isNaN(pid) || pid <= 0) {
        res.status(400).json({ error: "Invalid PID" });
        return;
      }
      // Safety: don't allow stopping the agent-studio server itself
      if (pid === process.pid) {
        res.status(403).json({ error: "Cannot stop the agent-studio server" });
        return;
      }
      const ok = stopDevServer(pid);
      res.json({ ok, pid });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // Custom servers
  router.post("/servers/custom", (req, res) => {
    try {
      const { name, cwd, command } = req.body as { name?: string; cwd?: string; command?: string };
      if (!name || !cwd) {
        res.status(400).json({ error: "Missing 'name' or 'cwd'" });
        return;
      }
      addCustomServer({ name, cwd, command: command ?? "npm run dev" });
      res.status(201).json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  router.delete("/servers/custom/:name", (req, res) => {
    try {
      const name = req.params["name"];
      if (!name) {
        res.status(400).json({ error: "Missing server name" });
        return;
      }
      const removed = removeCustomServer(name);
      res.json({ ok: removed });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // Dev servers (alternate path /api/dev-servers/*)
  router.get("/dev-servers", (_req, res) => {
    try {
      const servers = getDevServers();
      res.json(servers);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  router.post("/dev-servers/start", async (req, res) => {
    try {
      const { cwd, command } = req.body as { cwd: string; command: string };
      if (!cwd || !command) {
        res.status(400).json({ error: "cwd and command are required" });
        return;
      }
      const validPath = deps.validateProjectPath(cwd);
      if (!validPath) {
        res.status(403).json({ error: "Path not allowed" });
        return;
      }
      const result = await startDevServer(validPath, command);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  router.post("/dev-servers/:pid/stop", (req, res) => {
    try {
      const pid = parseInt(req.params["pid"]!, 10);
      if (isNaN(pid) || pid <= 0) {
        res.status(400).json({ error: "Invalid PID" });
        return;
      }
      const success = stopDevServer(pid);
      res.json({ ok: success });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  router.post("/dev-servers/custom", (req, res) => {
    try {
      const { name, port, command, cwd, autoStart } = req.body as {
        name?: string;
        port?: number;
        command?: string;
        cwd?: string;
        autoStart?: boolean;
      };
      if (!name || !command || !cwd) {
        res.status(400).json({ error: "name, command, and cwd are required" });
        return;
      }
      addCustomServer({
        name,
        cwd,
        command,
        port: port ?? undefined,
        autoStart: autoStart ?? false,
      });
      const servers = getDevServers();
      res.json(servers);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // System stats
  router.get("/system/stats", async (_req, res) => {
    try {
      const cpus = os.cpus();
      let totalIdle = 0;
      let totalTick = 0;
      for (const cpu of cpus) {
        totalIdle += cpu.times.idle;
        totalTick +=
          cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
      }
      const cpuUsage = totalTick > 0 ? (1 - totalIdle / totalTick) * 100 : 0;

      // Memory -- on macOS, show memory pressure (active + wired + compressed)
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;

      let pressureUsedGB = Math.round((usedMem / (1024 * 1024 * 1024)) * 100) / 100;
      let pressurePercent = Math.round((usedMem / totalMem) * 1000) / 10;
      let pressureLevel: "normal" | "warn" | "critical" = "normal";

      if (IS_MAC) {
        try {
          const { stdout: vmOutput } = await execAsync("vm_stat", {
            encoding: "utf-8",
            timeout: 3000,
          });
          const pageSizeMatch = vmOutput.match(/page size of (\d+) bytes/);
          const ps = pageSizeMatch ? parseInt(pageSizeMatch[1]!, 10) : 16384;

          const getPages = (label: string): number => {
            const m = vmOutput.match(new RegExp(`${label}:\\s+(\\d+)`));
            return m ? parseInt(m[1]!, 10) : 0;
          };

          const activePages = getPages("Pages active");
          const wiredPages = getPages("Pages wired down");
          const compressedPages = getPages("Pages occupied by compressor");

          const appMemBytes = (activePages + wiredPages + compressedPages) * ps;
          pressureUsedGB = Math.round((appMemBytes / (1024 * 1024 * 1024)) * 100) / 100;
          pressurePercent = Math.round((appMemBytes / totalMem) * 1000) / 10;

          if (pressurePercent > 80) pressureLevel = "critical";
          else if (pressurePercent > 60) pressureLevel = "warn";
        } catch {
          // Fall back to raw os.freemem values
        }
      } else {
        if (pressurePercent > 90) pressureLevel = "critical";
        else if (pressurePercent > 75) pressureLevel = "warn";
      }

      // Disk
      let diskUsed = 0;
      let diskTotal = 0;
      let diskPercentage = 0;
      const diskInfo = getDiskUsage();
      if (diskInfo) {
        diskUsed = diskInfo.used;
        diskTotal = diskInfo.total;
        diskPercentage = diskInfo.percentage;
      }

      // Active server count
      let activeServers = 0;
      try {
        const servers = getDevServers();
        activeServers = servers.filter((s) => s.running).length;
      } catch {
        // ignore
      }

      // Active Claude session count
      const activeSessions = terminalManager.listSessions().length;

      res.json({
        cpu: { usage: Math.round(cpuUsage * 10) / 10, cores: cpus.length },
        memory: {
          used: pressureUsedGB,
          total: Math.round((totalMem / (1024 * 1024 * 1024)) * 100) / 100,
          percentage: pressurePercent,
          pressure: pressureLevel,
        },
        disk: {
          used: Math.round(diskUsed * 100) / 100,
          total: Math.round(diskTotal * 100) / 100,
          percentage: Math.round(diskPercentage * 10) / 10,
        },
        activeServers,
        activeSessions,
        uptime: Math.round(process.uptime()),
        wsConnections: deps.wss.clients.size,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // System info (git branch, node version, etc.)
  router.get("/system/info", (_req, res) => {
    try {
      let branch = "unknown";
      let commitHash = "unknown";
      let version = "0.0.0";
      try {
        branch = execSync("git rev-parse --abbrev-ref HEAD", {
          encoding: "utf-8",
          timeout: 3000,
          cwd: process.cwd(),
        }).trim();
        commitHash = execSync("git rev-parse --short HEAD", {
          encoding: "utf-8",
          timeout: 3000,
          cwd: process.cwd(),
        }).trim();
      } catch {
        // Not a git repo or git not available
      }
      try {
        const pkgPath = path.join(process.cwd(), "package.json");
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { version?: string };
        version = pkg.version ?? "0.0.0";
      } catch {
        // package.json not found
      }

      res.json({
        version,
        branch,
        commitHash,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
        uptime: Math.round(process.uptime()),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // System preflight
  router.get("/system/preflight", (_req, res) => {
    try {
      const checks = {
        claudeCode: { installed: false } as {
          installed: boolean;
          version?: string;
          path?: string;
          authenticated?: boolean;
        },
        node: { installed: true, version: process.version },
        git: { installed: false } as { installed: boolean; version?: string },
      };
      const blockers: string[] = [];

      // Check Claude Code CLI
      try {
        const claudePath = whichCommand("claude");
        if (!claudePath) throw new Error("not found");
        checks.claudeCode.installed = true;
        checks.claudeCode.path = claudePath;
        try {
          const versionOutput = execSync("claude --version", {
            encoding: "utf-8",
            timeout: 5000,
          }).trim();
          checks.claudeCode.version = versionOutput;
        } catch {
          // version check failed but CLI exists
        }
        const { join: joinPre } = require("node:path") as typeof import("node:path");
        const claudeDir = joinPre(os.homedir(), ".claude");
        const { existsSync: fsExistsPre } = require("node:fs") as typeof import("node:fs");
        checks.claudeCode.authenticated = fsExistsPre(claudeDir);
        if (!checks.claudeCode.authenticated) {
          blockers.push(
            "Claude Code is not authenticated. Run `claude` in your terminal and complete setup first.",
          );
        }
      } catch {
        checks.claudeCode.installed = false;
        blockers.push("Claude Code CLI is not installed.");
      }

      // Check git
      try {
        const gitVersion = execSync("git --version", { encoding: "utf-8", timeout: 5000 }).trim();
        checks.git.installed = true;
        checks.git.version = gitVersion.replace("git version ", "");
      } catch {
        checks.git.installed = false;
        blockers.push("Git is not installed.");
      }

      res.json({ ready: blockers.length === 0, checks, blockers });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // Install Claude Code CLI
  router.post("/system/install-claude", async (_req, res) => {
    try {
      // Check if npm is available
      const npmPath = whichCommand("npm");
      if (!npmPath) {
        res.status(400).json({ error: "npm is not installed. Install Node.js first." });
        return;
      }

      // Run the install
      const result = execSync("npm install -g @anthropic-ai/claude-code 2>&1", {
        encoding: "utf-8",
        timeout: 120000,
      });

      // Verify it installed
      try {
        const version = execSync("claude --version 2>&1", {
          encoding: "utf-8",
          timeout: 5000,
        }).trim();
        res.json({ success: true, version, output: result });
      } catch {
        res.json({
          success: false,
          error: "Installed but claude command not found. You may need to restart your terminal.",
          output: result,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Installation failed";
      if (message.includes("EACCES") || message.includes("permission")) {
        res.status(403).json({
          error:
            "Permission denied. Try running Agent Studio with sudo, or install Claude Code manually:\n\nsudo npm install -g @anthropic-ai/claude-code",
          output: message,
        });
      } else {
        res.status(500).json({ error: message, output: message });
      }
    }
  });

  // System detect (discover projects)
  router.post("/system/detect", (_req, res) => {
    try {
      const {
        existsSync: fse,
        readdirSync: fsr,
        statSync: fss,
        readFileSync: fsrf,
        realpathSync: fsrp,
      } = require("node:fs") as typeof import("node:fs");
      const { join: pj } = require("node:path") as typeof import("node:path");
      const home = os.homedir();

      const searchDirs = [
        pj(home, "Code"),
        pj(home, "code"),
        pj(home, "Projects"),
        pj(home, "Documents"),
        pj(home, "Desktop"),
        pj(home, "repos"),
        pj(home, "dev"),
        pj(home, "workspace"),
        pj(home, "src"),
        pj(home, "work"),
      ];

      interface DetectedProject {
        name: string;
        path: string;
        techStack: string[];
        languages: string[];
        packageManager: string;
        devCommand?: string;
        hasAgentSystem: boolean;
        gitBranch: string;
        lastCommit: string;
        lastModified: number;
      }

      const projects: DetectedProject[] = [];
      const seenPaths = new Set<string>();

      for (const dir of searchDirs) {
        if (!fse(dir)) continue;
        try {
          const entries = fsr(dir);
          for (const entry of entries) {
            if (entry.startsWith(".")) continue;
            const fullPath = pj(dir, entry);
            try {
              const stat = fss(fullPath);
              if (!stat.isDirectory()) continue;
              const resolved = fsrp(fullPath).toLowerCase();
              if (seenPaths.has(resolved)) continue;
              if (!fse(pj(fullPath, ".git"))) continue;
              seenPaths.add(resolved);

              const techStack: string[] = [];
              const languages: string[] = [];
              let packageManager = "unknown";
              let devCommand: string | undefined;

              // package.json detection
              if (fse(pj(fullPath, "package.json"))) {
                try {
                  const pkg = JSON.parse(fsrf(pj(fullPath, "package.json"), "utf-8")) as {
                    dependencies?: Record<string, string>;
                    devDependencies?: Record<string, string>;
                    scripts?: Record<string, string>;
                  };
                  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
                  if (allDeps["next"]) techStack.push("Next.js");
                  else if (allDeps["react"]) techStack.push("React");
                  if (allDeps["vue"]) techStack.push("Vue");
                  if (allDeps["svelte"] || allDeps["@sveltejs/kit"]) techStack.push("Svelte");
                  if (allDeps["@angular/core"]) techStack.push("Angular");
                  if (allDeps["express"]) techStack.push("Express");
                  if (allDeps["fastify"]) techStack.push("Fastify");
                  if (allDeps["tailwindcss"]) techStack.push("Tailwind");
                  if (allDeps["electron"]) techStack.push("Electron");
                  if (allDeps["react-native"]) techStack.push("React Native");
                  if (allDeps["typescript"]) languages.push("TypeScript");
                  else languages.push("JavaScript");

                  if (fse(pj(fullPath, "pnpm-lock.yaml"))) packageManager = "pnpm";
                  else if (fse(pj(fullPath, "yarn.lock"))) packageManager = "yarn";
                  else if (fse(pj(fullPath, "bun.lockb"))) packageManager = "bun";
                  else packageManager = "npm";

                  if (pkg.scripts?.["dev"]) devCommand = `${packageManager} run dev`;
                  else if (pkg.scripts?.["start"]) devCommand = `${packageManager} run start`;
                } catch {
                  /* bad package.json */
                }
              }

              if (fse(pj(fullPath, "requirements.txt")) || fse(pj(fullPath, "pyproject.toml"))) {
                languages.push("Python");
                if (packageManager === "unknown")
                  packageManager = fse(pj(fullPath, "pyproject.toml")) ? "poetry" : "pip";
                if (fse(pj(fullPath, "manage.py"))) {
                  techStack.push("Django");
                  devCommand = devCommand ?? "python manage.py runserver";
                }
              }
              if (fse(pj(fullPath, "go.mod"))) {
                languages.push("Go");
                if (packageManager === "unknown") packageManager = "go";
                devCommand = devCommand ?? "go run .";
              }
              if (fse(pj(fullPath, "Cargo.toml"))) {
                languages.push("Rust");
                if (packageManager === "unknown") packageManager = "cargo";
                devCommand = devCommand ?? "cargo run";
              }
              if (fse(pj(fullPath, "pom.xml")) || fse(pj(fullPath, "build.gradle"))) {
                languages.push("Java");
                if (packageManager === "unknown")
                  packageManager = fse(pj(fullPath, "build.gradle")) ? "gradle" : "maven";
              }

              const hasAgentSystem =
                fse(pj(fullPath, "ai-agents")) || fse(pj(fullPath, ".claude", "agents"));

              let gitBranch = "main";
              try {
                gitBranch = execSync("git rev-parse --abbrev-ref HEAD", {
                  cwd: fullPath,
                  encoding: "utf-8",
                  timeout: 3000,
                }).trim();
              } catch {
                /* default */
              }

              let lastCommit = "";
              let lastModified = 0;
              try {
                const ct = execSync("git log -1 --format=%ci", {
                  cwd: fullPath,
                  encoding: "utf-8",
                  timeout: 3000,
                }).trim();
                lastModified = new Date(ct).getTime();
                const dm = Math.floor((Date.now() - lastModified) / 60000);
                if (dm < 60) lastCommit = `${dm}m ago`;
                else if (dm < 1440) lastCommit = `${Math.floor(dm / 60)}h ago`;
                else lastCommit = `${Math.floor(dm / 1440)}d ago`;
              } catch {
                lastCommit = "unknown";
              }

              projects.push({
                name: entry,
                path: fullPath,
                techStack,
                languages: languages.length > 0 ? languages : ["Unknown"],
                packageManager,
                devCommand,
                hasAgentSystem,
                gitBranch,
                lastCommit,
                lastModified,
              });
            } catch {
              /* skip */
            }
          }
        } catch {
          /* skip */
        }
      }

      projects.sort((a, b) => b.lastModified - a.lastModified);
      res.json({ projects });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // PMO Scheduler
  router.get("/pmo/status", (_req, res) => {
    try {
      const isLoaded = isSchedulerLoaded("agent-studio");
      res.json({ loaded: isLoaded, lastScan: null, lastStatus: null, checking: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  router.get("/pmo/status-full", async (_req, res) => {
    try {
      const isLoaded = isSchedulerLoaded("agent-studio");

      const scanEntries = await readScanLog();
      const lastEntry = scanEntries.length > 0 ? scanEntries[scanEntries.length - 1] : null;

      let nextScanIn: string | null = null;
      if (isLoaded && lastEntry) {
        const lastTime = new Date(lastEntry.timestamp).getTime();
        const nextTime = lastTime + 2 * 60 * 60 * 1000; // 2 hours
        const remainMs = nextTime - Date.now();
        if (remainMs > 0) {
          const mins = Math.floor(remainMs / 60000);
          const hrs = Math.floor(mins / 60);
          nextScanIn = hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`;
        } else {
          nextScanIn = "overdue";
        }
      }

      res.json({
        loaded: isLoaded,
        lastScan: lastEntry?.timestamp ?? null,
        lastStatus: lastEntry?.status ?? null,
        lastDetail: lastEntry?.detail ?? null,
        nextScanIn,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  router.post("/pmo/start", (_req, res) => {
    try {
      if (!IS_MAC) {
        res.status(501).json({ error: "PMO scheduler is only supported on macOS (launchd)" });
        return;
      }
      loadScheduler(PMO_PLIST);
      res.json({ ok: true, status: "started" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  router.post("/pmo/stop", (_req, res) => {
    try {
      if (!IS_MAC) {
        res.status(501).json({ error: "PMO scheduler is only supported on macOS (launchd)" });
        return;
      }
      unloadScheduler(PMO_PLIST);
      res.json({ ok: true, status: "stopped" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  router.post("/pmo/scan", (_req, res) => {
    try {
      // Run scan in background
      exec(`bash "${PMO_SCAN_SCRIPT}"`, { timeout: 120000 }, () => {
        // fire and forget -- result lands in scan_log.md
      });
      res.json({ ok: true, status: "scan-started" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // Quick Import: analyze project, generate one agent, write CLAUDE.md
  router.post("/quick-import", (req, res) => {
    try {
      const { projectPath } = req.body as { projectPath?: string };
      if (!projectPath) {
        res.status(400).json({ error: "Missing projectPath" });
        return;
      }

      const validPath = deps.validateProjectPath(projectPath);
      if (!validPath) {
        res.status(400).json({ error: "Invalid project path" });
        return;
      }

      // Abort if analysis takes too long (5s guard)
      const start = Date.now();
      const profile = analyzeProject(validPath);
      if (Date.now() - start > 5000) {
        res.status(504).json({ error: "Project analysis took too long" });
        return;
      }

      // Generate a single agent (template-based, no LLM)
      const { agent, mdContent } = generateSingleAgent(profile);

      // Write agent .md file
      const agentFilePath = writeQuickImportAgent(validPath, agent.id, mdContent);

      // Generate/update CLAUDE.md using the standard generator
      const claudeMdResult = writeClaudeMd({
        analysis: profile,
        agents: [
          {
            id: agent.id,
            name: agent.name,
            description: agent.description,
            model: "sonnet" as const,
            mdContent,
          },
        ],
        projectPath: validPath,
        preserveExisting: true,
      });

      res.status(201).json({
        agent: {
          id: agent.id,
          name: agent.name,
          path: agentFilePath,
        },
        claudeMd: claudeMdResult.path,
        profile: {
          name: profile.name,
          languages: profile.languages,
          frameworks: profile.frameworks,
          packageManager: profile.packageManager,
          hasTests: profile.hasTests,
          hasDocker: profile.hasDocker,
          database: profile.database,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  return router;
}
