import { Router } from "express";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import type { TerminalManager } from "../terminal-manager.js";
import { discoverClaudeProcesses } from "../process-discovery.js";
import { getAllSessionUsage, getSessionUsage, findSessionIdForPtyPid, getUsageBySessionId, formatCost, formatTokens, getDisplayNameForPtyPid } from "../session-usage.js";
import { getDevServers, startDevServer, stopDevServer, addCustomServer, removeCustomServer } from "../dev-servers.js";
import { readScanLog } from "../file-watcher.js";
import { getAgentSystemPath } from "../config.js";
import type { WorkflowManager } from "../workflows/index.js";

const execAsync = promisify(exec);

export function systemRoutes(terminalManager: TerminalManager, workflowManager: WorkflowManager): Router {
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

  // Process kill
  router.post("/processes/:pid/kill", (req, res) => {
    try {
      const pid = parseInt(req.params["pid"]!, 10);
      if (isNaN(pid) || pid <= 0) {
        res.status(400).json({ error: "Invalid PID" });
        return;
      }
      if (pid === 1 || pid === process.pid) {
        res.status(403).json({ error: "Cannot kill this process" });
        return;
      }
      process.kill(pid, "SIGTERM");
      res.json({ ok: true, pid });
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

  // System stats
  router.get("/system/stats", async (_req, res) => {
    try {
      const cpus = os.cpus();
      let totalIdle = 0;
      let totalTick = 0;
      for (const cpu of cpus) {
        totalIdle += cpu.times.idle;
        totalTick += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
      }
      const cpuUsage = totalTick > 0 ? ((1 - totalIdle / totalTick) * 100) : 0;

      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;

      // On macOS, os.freemem() only reports "free" pages, not "available"
      // memory. The OS keeps most RAM as disk cache, so raw usage looks ~99%.
      // Use vm_stat to compute app memory (active + wired) for a realistic
      // "memory pressure" figure that won't alarm users.
      let pressureUsedGB = Math.round((usedMem / (1024 * 1024 * 1024)) * 100) / 100;
      let pressurePercent = Math.round((usedMem / totalMem) * 1000) / 10;
      let pressureLevel: "normal" | "warn" | "critical" = "normal";

      if (process.platform === "darwin") {
        try {
          const { stdout: vmOutput } = await execAsync("vm_stat", { encoding: "utf-8", timeout: 3000 });
          const pageSize = 16384; // default on Apple Silicon; fallback
          const pageSizeMatch = vmOutput.match(/page size of (\d+) bytes/);
          const ps = pageSizeMatch ? parseInt(pageSizeMatch[1]!, 10) : pageSize;

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

      let diskUsed = 0;
      let diskTotal = 0;
      let diskPercentage = 0;
      try {
        const { stdout: dfOutput } = await execAsync("df -k /", { encoding: "utf-8", timeout: 3000 });
        const lines = dfOutput.trim().split("\n");
        if (lines.length >= 2) {
          const parts = lines[1]!.split(/\s+/);
          const totalBlocks = parseInt(parts[1]!, 10) || 0;
          const usedBlocks = parseInt(parts[2]!, 10) || 0;
          diskTotal = totalBlocks / (1024 * 1024);
          diskUsed = usedBlocks / (1024 * 1024);
          diskPercentage = diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0;
        }
      } catch {
        // Disk stats unavailable
      }

      let activeServers = 0;
      try {
        const servers = getDevServers();
        activeServers = servers.filter((s) => s.running).length;
      } catch {
        // ignore
      }

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
        wsConnections: 0,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // PMO (background scan service)
  router.get("/pmo/status", async (_req, res) => {
    try {
      let isLoaded = false;
      try {
        const { stdout } = await execAsync("launchctl list 2>/dev/null", { timeout: 5000 });
        isLoaded = stdout.includes("agent-studio");
      } catch {
        isLoaded = false;
      }

      res.json({ loaded: isLoaded, lastScan: null, lastStatus: null, checking: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  router.get("/pmo/status-full", async (_req, res) => {
    try {
      let isLoaded = false;
      try {
        const { stdout } = await execAsync("launchctl list 2>/dev/null", { timeout: 5000 });
        isLoaded = stdout.includes("agent-studio");
      } catch {
        isLoaded = false;
      }

      const scanEntries = await readScanLog();
      const lastEntry = scanEntries.length > 0 ? scanEntries[scanEntries.length - 1] : null;

      let nextScanIn: string | null = null;
      if (isLoaded && lastEntry) {
        const lastTime = new Date(lastEntry.timestamp).getTime();
        const nextTime = lastTime + 2 * 60 * 60 * 1000;
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

  router.post("/pmo/start", async (_req, res) => {
    try {
      await execAsync(`launchctl load "${PMO_PLIST}" 2>/dev/null || true`, { timeout: 5000 });
      res.json({ ok: true, status: "started" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  router.post("/pmo/stop", async (_req, res) => {
    try {
      await execAsync(`launchctl unload "${PMO_PLIST}" 2>/dev/null || true`, { timeout: 5000 });
      res.json({ ok: true, status: "stopped" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  router.post("/pmo/scan", (_req, res) => {
    try {
      exec(`bash "${PMO_SCAN_SCRIPT}"`, { timeout: 120000 }, () => {
        // fire and forget
      });
      res.json({ ok: true, status: "scan-started" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // Workflows
  router.get("/workflows", async (_req, res) => {
    try {
      const flows = await workflowManager.getFlows();
      res.json(flows);
    } catch {
      res.json([]);
    }
  });

  router.get("/workflows/:flowId/runs/:runId", async (req, res) => {
    try {
      const run = await workflowManager.getRun(
        req.params["flowId"]!,
        req.params["runId"]!,
      );
      if (!run) {
        res.status(404).json({ error: "Run not found" });
        return;
      }
      res.json(run);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  return router;
}
