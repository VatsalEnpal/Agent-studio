import { execSync } from "node:child_process";
import { getSessionUsage, formatCost, formatTokens } from "./session-usage.js";

export interface DiscoveredProcess {
  pid: number;
  command: string;
  args: string;
  cwd: string;
  startTime: string;
  user: string;
  model?: string;
  modelShort?: "opus" | "sonnet" | "haiku" | "unknown";
  cost?: string;
  tokens?: string;
  totalCost?: number;
  totalTokens?: number;
  sessionId?: string;
}

/**
 * Discover running Claude Code processes on the machine.
 * Parses `ps` output to find processes whose command contains "claude".
 * Excludes the current process and any grep/ps artifacts.
 */
export function discoverClaudeProcesses(): DiscoveredProcess[] {
  try {
    // Use ps with custom format to get relevant info
    const raw = execSync(
      'ps -eo pid,user,lstart,command | grep -i "[c]laude"',
      { encoding: "utf-8", timeout: 5000 },
    );

    const processes: DiscoveredProcess[] = [];
    const myPid = process.pid;
    const parentPid = process.ppid;

    for (const line of raw.trim().split("\n")) {
      if (!line.trim()) continue;

      // ps output format: PID USER LSTART(day mon dd hh:mm:ss yyyy) COMMAND
      // Example: 16623 user  Sat Mar 29 11:16:00 2026 claude --dangerously-skip-permissions
      const match = line
        .trim()
        .match(
          /^\s*(\d+)\s+(\S+)\s+(\w+\s+\w+\s+\d+\s+[\d:]+\s+\d+)\s+(.+)$/,
        );
      if (!match) continue;

      const pid = parseInt(match[1], 10);
      const user = match[2];
      const startTime = match[3];
      const fullCommand = match[4];

      // Skip our own process tree and non-claude things
      if (pid === myPid || pid === parentPid) continue;

      // Skip helper processes and shell wrappers
      if (
        fullCommand.includes("chrome-native-host") ||
        fullCommand.includes("bun run") ||
        fullCommand.includes("grep") ||
        fullCommand.includes("Claude.app/Contents") ||
        fullCommand.includes(".claude/shell-snapshots") ||
        fullCommand.includes(".claude/plugins")
      ) {
        continue;
      }

      // Must be a direct claude CLI invocation (not just mentioned in args)
      const cmdBase = fullCommand.split(/\s+/)[0];
      if (
        !cmdBase.endsWith("claude") &&
        !cmdBase.endsWith("claude-code")
      ) {
        continue;
      }

      // Try to get the cwd of the process
      let cwd = "";
      try {
        cwd = execSync(`lsof -p ${pid} -Fn 2>/dev/null | grep '^n/' | grep 'cwd' || lsof -p ${pid} -d cwd -Fn 2>/dev/null | tail -1 | sed 's/^n//'`, {
          encoding: "utf-8",
          timeout: 3000,
        }).trim();
        // Clean up lsof output - get just the path
        if (cwd.startsWith("n")) cwd = cwd.slice(1);
      } catch {
        cwd = "unknown";
      }

      // Split command and args
      const parts = fullCommand.split(/\s+/);
      const command = parts[0];
      const args = parts.slice(1).join(" ");

      const proc: DiscoveredProcess = {
        pid,
        command,
        args,
        cwd,
        startTime,
        user,
      };

      // Enrich with usage data from Claude session files
      const usage = getSessionUsage(pid);
      if (usage) {
        proc.model = usage.model;
        proc.modelShort = usage.modelShort;
        proc.cost = formatCost(usage.totalCost);
        proc.tokens = formatTokens(usage.totalTokens);
        proc.totalCost = usage.totalCost;
        proc.totalTokens = usage.totalTokens;
        proc.sessionId = usage.sessionId;
      }

      processes.push(proc);
    }

    return processes;
  } catch {
    // ps/grep returned nothing or errored
    return [];
  }
}
