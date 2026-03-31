import os from "node:os";
import { execSync } from "node:child_process";
import path from "node:path";

export const IS_WINDOWS = os.platform() === "win32";
export const IS_MAC = os.platform() === "darwin";
export const IS_LINUX = os.platform() === "linux";

/**
 * Find the full path of a command (like `which` on Unix, `where` on Windows)
 */
export function whichCommand(cmd: string): string | null {
  // Validate input - no shell metacharacters
  if (!/^[a-zA-Z0-9._-]+$/.test(cmd)) return null;
  try {
    const whichCmd = IS_WINDOWS ? "where" : "which";
    return execSync(`${whichCmd} ${cmd}`, { encoding: "utf-8", timeout: 3000 })
      .trim()
      .split("\n")[0]!;
  } catch {
    return null;
  }
}

/**
 * Get default shell for terminal sessions
 */
export function getDefaultShell(): string {
  if (IS_WINDOWS) return "powershell.exe";
  return process.env.SHELL || "/bin/bash";
}

/**
 * Find processes listening on TCP ports.
 * Returns array of { pid, port, command? }
 */
export function findListeningPorts(): Array<{
  pid: number;
  port: number;
  command?: string;
}> {
  try {
    if (IS_WINDOWS) {
      // netstat -ano | findstr LISTENING
      const raw = execSync("netstat -ano | findstr LISTENING", {
        encoding: "utf-8",
        timeout: 5000,
      });
      const results: Array<{ pid: number; port: number }> = [];
      for (const line of raw.split("\n")) {
        const match = line.match(/:(\d+)\s+\S+\s+LISTENING\s+(\d+)/);
        if (match) {
          results.push({
            pid: parseInt(match[2]!, 10),
            port: parseInt(match[1]!, 10),
          });
        }
      }
      return results;
    } else {
      // lsof -iTCP -sTCP:LISTEN -P -n
      const raw = execSync(
        "lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null || true",
        { encoding: "utf-8", timeout: 5000 },
      );
      const results: Array<{
        pid: number;
        port: number;
        command?: string;
      }> = [];
      for (const line of raw.split("\n").slice(1)) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 9) {
          const portMatch = parts[8]?.match(/:(\d+)$/);
          if (portMatch) {
            results.push({
              command: parts[0],
              pid: parseInt(parts[1]!, 10),
              port: parseInt(portMatch[1]!, 10),
            });
          }
        }
      }
      return results;
    }
  } catch {
    return [];
  }
}

/**
 * Find Node.js processes listening on TCP ports (for dev server detection).
 * Returns array of { pid, port, command }
 */
export function findNodeListeningPorts(): Array<{
  pid: number;
  port: number;
  command: string;
}> {
  try {
    if (IS_WINDOWS) {
      // On Windows, get all listening ports, then match against node processes
      const netstatRaw = execSync("netstat -ano | findstr LISTENING", {
        encoding: "utf-8",
        timeout: 5000,
      });
      const tasklistRaw = execSync('tasklist /fi "imagename eq node.exe" /fo csv /nh', {
        encoding: "utf-8",
        timeout: 5000,
      });
      const nodePids = new Set<number>();
      for (const line of tasklistRaw.split("\n")) {
        const parts = line.split('","');
        if (parts.length >= 2) {
          const pid = parseInt(parts[1]?.replace(/"/g, "") ?? "0", 10);
          if (pid > 0) nodePids.add(pid);
        }
      }
      const results: Array<{ pid: number; port: number; command: string }> = [];
      for (const line of netstatRaw.split("\n")) {
        const match = line.match(/:(\d+)\s+\S+\s+LISTENING\s+(\d+)/);
        if (match) {
          const pid = parseInt(match[2]!, 10);
          if (nodePids.has(pid)) {
            results.push({ pid, port: parseInt(match[1]!, 10), command: "node" });
          }
        }
      }
      return results;
    } else {
      const raw = execSync(
        "lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null | grep -i node || true",
        { encoding: "utf-8", timeout: 5000 },
      ).trim();
      if (!raw) return [];
      const results: Array<{ pid: number; port: number; command: string }> = [];
      const seen = new Set<number>();
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        const parts = line.split(/\s+/);
        const pid = parseInt(parts[1]!, 10);
        if (isNaN(pid) || seen.has(pid)) continue;
        const portMatch =
          line.match(/:(\d+)\s+\(LISTEN\)/) ?? line.match(/:(\d+)$/);
        if (!portMatch) continue;
        const port = parseInt(portMatch[1]!, 10);
        if (isNaN(port)) continue;
        seen.add(pid);
        results.push({ pid, port, command: parts[0] ?? "node" });
      }
      return results;
    }
  } catch {
    return [];
  }
}

/**
 * Find listening ports for a specific PID.
 */
export function findPortsForPid(pid: number): number[] {
  try {
    if (IS_WINDOWS) {
      const raw = execSync(`netstat -ano | findstr LISTENING | findstr ${pid}`, {
        encoding: "utf-8",
        timeout: 5000,
      });
      const ports: number[] = [];
      for (const line of raw.split("\n")) {
        const match = line.match(/:(\d+)\s+\S+\s+LISTENING\s+(\d+)/);
        if (match && parseInt(match[2]!, 10) === pid) {
          ports.push(parseInt(match[1]!, 10));
        }
      }
      return ports;
    } else {
      const raw = execSync(
        `lsof -p ${pid} -iTCP -sTCP:LISTEN -P -n 2>/dev/null || true`,
        { encoding: "utf-8", timeout: 5000 },
      ).trim();
      const ports: number[] = [];
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        const portMatch =
          line.match(/:(\d+)\s+\(LISTEN\)/) ?? line.match(/:(\d+)\s*$/);
        if (portMatch) {
          ports.push(parseInt(portMatch[1]!, 10));
        }
      }
      return ports;
    }
  } catch {
    return [];
  }
}

/**
 * Get the working directory of a running process.
 */
export function getProcessCwd(pid: number): string | null {
  try {
    if (IS_WINDOWS) {
      // wmic is deprecated but widely available; PowerShell alternative is slower
      const raw = execSync(
        `wmic process where ProcessId=${pid} get ExecutablePath /format:list 2>nul || echo ""`,
        { encoding: "utf-8", timeout: 3000 },
      );
      const match = raw.match(/ExecutablePath=(.+)/);
      return match ? path.dirname(match[1]!.trim()) : null;
    } else {
      const raw = execSync(
        `lsof -p ${pid} -Fn 2>/dev/null | grep "^ncwd" || lsof -p ${pid} -d cwd -Fn 2>/dev/null | tail -1 | sed 's/^n//'`,
        { encoding: "utf-8", timeout: 3000 },
      );
      const cwd = raw
        .trim()
        .replace(/^ncwd/, "")
        .replace(/^n/, "");
      return cwd || null;
    }
  } catch {
    return null;
  }
}

/**
 * Find running processes matching a filter string.
 */
export function findProcesses(
  filter: string,
): Array<{ pid: number; user: string; command: string; startTime?: string }> {
  try {
    if (IS_WINDOWS) {
      const raw = execSync(
        `tasklist /v /fo csv | findstr /i "${filter}"`,
        { encoding: "utf-8", timeout: 5000 },
      );
      const results: Array<{ pid: number; user: string; command: string }> = [];
      for (const line of raw.split("\n")) {
        const parts = line.split('","');
        if (parts.length >= 2) {
          const name = parts[0]?.replace(/^"/, "") ?? "";
          const pid = parseInt(parts[1] ?? "0", 10);
          if (pid > 0) {
            results.push({ pid, user: "", command: name });
          }
        }
      }
      return results;
    } else {
      const raw = execSync(
        `ps -eo pid,user,lstart,command | grep -i "[${filter[0]}]${filter.slice(1)}"`,
        { encoding: "utf-8", timeout: 5000 },
      );
      const results: Array<{
        pid: number;
        user: string;
        command: string;
        startTime?: string;
      }> = [];
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const match = trimmed.match(
          /^\s*(\d+)\s+(\S+)\s+(.+?\d{4})\s+(.+)$/,
        );
        if (match) {
          results.push({
            pid: parseInt(match[1]!, 10),
            user: match[2]!,
            startTime: match[3]!,
            command: match[4]!,
          });
        }
      }
      return results;
    }
  } catch {
    return [];
  }
}

/**
 * Find child process PIDs of a given parent PID.
 */
export function findChildPids(parentPid: number): number[] {
  try {
    if (IS_WINDOWS) {
      const raw = execSync(
        `wmic process where (ParentProcessId=${parentPid}) get ProcessId /format:list 2>nul || echo ""`,
        { encoding: "utf-8", timeout: 3000 },
      );
      const pids: number[] = [];
      for (const line of raw.split("\n")) {
        const match = line.match(/ProcessId=(\d+)/);
        if (match) {
          pids.push(parseInt(match[1]!, 10));
        }
      }
      return pids;
    } else {
      const raw = execSync(
        `pgrep -P ${parentPid} 2>/dev/null || true`,
        { encoding: "utf-8", timeout: 2000 },
      );
      return raw
        .trim()
        .split("\n")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n) && n > 0);
    }
  } catch {
    return [];
  }
}

/**
 * Open a file or directory in the OS default handler.
 */
export function openInOS(
  target: string,
  app?: string,
  callback?: (err: Error | null) => void,
): void {
  const { execFile: ef } = require("node:child_process") as typeof import("node:child_process");
  const cb = callback ?? (() => {});
  if (IS_WINDOWS) {
    ef("cmd", ["/c", "start", "", target], cb);
  } else if (IS_MAC) {
    if (app) {
      ef("open", ["-a", app, target], cb);
    } else {
      ef("open", [target], cb);
    }
  } else {
    ef("xdg-open", [target], cb);
  }
}

/**
 * Open a terminal at a given directory.
 */
export function openTerminal(
  dir: string,
  callback?: (err: Error | null) => void,
): void {
  const { execFile: ef } = require("node:child_process") as typeof import("node:child_process");
  const cb = callback ?? (() => {});
  if (IS_WINDOWS) {
    ef("cmd", ["/c", "start", "cmd", "/K", `cd /d "${dir}"`], cb);
  } else if (IS_MAC) {
    ef("open", ["-a", "Terminal", dir], cb);
  } else {
    // Try common Linux terminals
    ef("xdg-open", [dir], cb);
  }
}

/**
 * Open VS Code at a given directory.
 */
export function openVSCode(
  dir: string,
  callback?: (err: Error | null) => void,
): void {
  const { execFile: ef } = require("node:child_process") as typeof import("node:child_process");
  const cb = callback ?? (() => {});
  ef("code", [dir], cb);
}

/**
 * Kill a process by PID.
 */
export function killProcess(pid: number): boolean {
  try {
    if (IS_WINDOWS) {
      execSync(`taskkill /F /PID ${pid} 2>nul`, { timeout: 3000 });
    } else {
      process.kill(pid, "SIGTERM");
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Kill a process group (for stopping dev servers).
 * On Unix, sends signal to -pid (process group).
 * On Windows, uses taskkill /T to kill the tree.
 */
export function killProcessGroup(pid: number): boolean {
  try {
    if (IS_WINDOWS) {
      execSync(`taskkill /F /T /PID ${pid} 2>nul`, { timeout: 3000 });
      return true;
    } else {
      try {
        // Kill the process group (negative PID kills the group)
        process.kill(-pid, "SIGTERM");
        return true;
      } catch {
        // Fallback: kill just the process
        try {
          process.kill(pid, "SIGTERM");
          return true;
        } catch {
          return false;
        }
      }
    }
  } catch {
    return false;
  }
}

/**
 * Get the temp directory.
 */
export function getTempDir(): string {
  return os.tmpdir();
}

/**
 * Resolve path for validateProjectPath -- allow home dir and temp dir.
 */
export function isAllowedPath(resolved: string): boolean {
  const home = os.homedir();
  const tmp = os.tmpdir();
  if (IS_WINDOWS) {
    // On Windows, paths use backslashes; normalize for comparison
    const normalizedResolved = resolved.toLowerCase();
    const normalizedHome = home.toLowerCase();
    const normalizedTmp = tmp.toLowerCase();
    return (
      normalizedResolved.startsWith(normalizedHome) ||
      normalizedResolved.startsWith(normalizedTmp)
    );
  }
  return (
    resolved.startsWith(home) ||
    resolved.startsWith(tmp) ||
    resolved.startsWith("/tmp")
  );
}

/**
 * Get disk usage stats.
 * Returns { used: GB, total: GB, percentage: number } or null.
 */
export function getDiskUsage(): { used: number; total: number; percentage: number } | null {
  try {
    if (IS_WINDOWS) {
      const raw = execSync("wmic logicaldisk where DeviceID='C:' get FreeSpace,Size /format:list 2>nul", {
        encoding: "utf-8",
        timeout: 3000,
      });
      const freeMatch = raw.match(/FreeSpace=(\d+)/);
      const sizeMatch = raw.match(/Size=(\d+)/);
      if (freeMatch && sizeMatch) {
        const free = parseInt(freeMatch[1]!, 10);
        const total = parseInt(sizeMatch[1]!, 10);
        const used = total - free;
        const totalGB = total / (1024 * 1024 * 1024);
        const usedGB = used / (1024 * 1024 * 1024);
        return {
          used: Math.round(usedGB * 100) / 100,
          total: Math.round(totalGB * 100) / 100,
          percentage: totalGB > 0 ? Math.round((usedGB / totalGB) * 1000) / 10 : 0,
        };
      }
      return null;
    } else {
      const dfOutput = execSync("df -k /", { encoding: "utf-8", timeout: 3000 });
      const lines = dfOutput.trim().split("\n");
      if (lines.length >= 2) {
        const parts = lines[1]!.split(/\s+/);
        const totalBlocks = parseInt(parts[1]!, 10) || 0;
        const usedBlocks = parseInt(parts[2]!, 10) || 0;
        const totalGB = totalBlocks / (1024 * 1024);
        const usedGB = usedBlocks / (1024 * 1024);
        return {
          used: Math.round(usedGB * 100) / 100,
          total: Math.round(totalGB * 100) / 100,
          percentage: totalGB > 0 ? Math.round((usedGB / totalGB) * 1000) / 10 : 0,
        };
      }
      return null;
    }
  } catch {
    return null;
  }
}

/**
 * Check if a launchd/scheduler service is loaded (macOS only).
 * On non-macOS, returns false.
 */
export function isSchedulerLoaded(serviceLabel: string): boolean {
  if (!IS_MAC) return false;
  try {
    const result = execSync("launchctl list 2>/dev/null", {
      encoding: "utf-8",
      timeout: 5000,
    }).toString();
    return result.includes(serviceLabel);
  } catch {
    return false;
  }
}

/**
 * Load/unload a launchd plist (macOS only).
 * On non-macOS, these are no-ops.
 */
export function loadScheduler(plistPath: string): boolean {
  if (!IS_MAC) return false;
  try {
    execSync(`launchctl load "${plistPath}" 2>/dev/null || true`, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export function unloadScheduler(plistPath: string): boolean {
  if (!IS_MAC) return false;
  try {
    execSync(`launchctl unload "${plistPath}" 2>/dev/null || true`, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the shell to use when spawning processes.
 * On Windows, use true (lets Node pick the default).
 * On Unix, use the detected shell.
 */
export function getSpawnShell(): string | boolean {
  if (IS_WINDOWS) return true;
  return getDefaultShell();
}

/**
 * Get the appropriate shell for exec operations.
 * Returns either a shell path (Unix) or true (Windows, lets Node pick default).
 */
export function getExecShell(): string | true {
  if (IS_WINDOWS) return true;
  return "/bin/bash";
}
