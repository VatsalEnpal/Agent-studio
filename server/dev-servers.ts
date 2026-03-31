import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getConfig } from "./config.js";
import { findNodeListeningPorts, findPortsForPid, getProcessCwd, killProcessGroup } from "./platform.js";

export interface DevServer {
  pid: number;
  port: number;
  command: string;
  cwd: string;
  name: string;
  running: boolean;
  isSelf: boolean;
  isCustom?: boolean;
}

export interface KnownProject {
  name: string;
  cwd: string;
  command: string;
  isCustom?: boolean;
}

function getBuiltInProjects(): KnownProject[] {
  const config = getConfig();
  return config.devServers.map((s) => ({
    name: s.name,
    cwd: s.path,
    command: s.command,
  }));
}

const SETTINGS_PATH = path.join(process.cwd(), ".settings.json");

function readSettings(): Record<string, unknown> {
  try {
    const raw = readFileSync(SETTINGS_PATH, "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeSettings(settings: Record<string, unknown>): void {
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
}

export function getCustomServers(): KnownProject[] {
  const settings = readSettings();
  const custom = settings["customServers"] as KnownProject[] | undefined;
  return (custom ?? []).map((s) => ({ ...s, isCustom: true }));
}

export function addCustomServer(server: { name: string; cwd: string; command: string }): void {
  const settings = readSettings();
  const custom = (settings["customServers"] as KnownProject[] | undefined) ?? [];
  custom.push({ name: server.name, cwd: server.cwd, command: server.command });
  settings["customServers"] = custom;
  writeSettings(settings);
}

export function removeCustomServer(name: string): boolean {
  const settings = readSettings();
  const custom = (settings["customServers"] as KnownProject[] | undefined) ?? [];
  const filtered = custom.filter((s) => s.name !== name);
  if (filtered.length === custom.length) return false;
  settings["customServers"] = filtered;
  writeSettings(settings);
  return true;
}

function getAllKnownProjects(): KnownProject[] {
  return [...getBuiltInProjects(), ...getCustomServers()];
}

// Track servers we have started ourselves
const managedProcesses = new Map<string, ChildProcess>();

/**
 * Detect running Node.js dev servers by checking listening TCP ports.
 */
function detectRunningServers(): DevServer[] {
  const servers: DevServer[] = [];
  const selfPid = process.pid;
  const selfPort = parseInt(process.env["PORT"] ?? "8080", 10);

  try {
    const listening = findNodeListeningPorts();
    if (listening.length === 0) return servers;

    const seen = new Set<number>();
    for (const entry of listening) {
      if (seen.has(entry.pid)) continue;
      seen.add(entry.pid);

      // Get the cwd of the process
      const cwd = getProcessCwd(entry.pid) ?? "unknown";

      // Derive a name from the cwd
      const sep = path.sep;
      const dirName =
        cwd !== "unknown"
          ? cwd.split(sep).pop() ?? "dev-server"
          : "dev-server";
      const isSelf = entry.pid === selfPid || entry.port === selfPort;

      servers.push({
        pid: entry.pid,
        port: entry.port,
        command: entry.command ?? "node",
        cwd,
        name: `${dirName}:${entry.port}`,
        running: true,
        isSelf,
      });
    }
  } catch {
    // Detection failed
  }

  return servers;
}

/**
 * Get all dev servers: running ones + known projects that aren't running.
 */
export function getDevServers(): DevServer[] {
  const running = detectRunningServers();

  // Match known projects to running servers
  const result: DevServer[] = [...running];
  const selfPort = parseInt(process.env["PORT"] ?? "8080", 10);
  const knownProjects = getAllKnownProjects();

  for (const project of knownProjects) {
    if (!existsSync(project.cwd)) continue;

    const match = running.find(
      (s) => s.cwd === project.cwd || s.name.startsWith(project.name),
    );

    if (match) {
      // Update the name to use our known project name
      match.name = project.name;
      match.isCustom = project.isCustom;
      // Mark agent-studio as self
      if (project.name === "agent-studio") {
        match.isSelf = true;
      }
    } else {
      // Project exists but not running
      result.push({
        pid: 0,
        port: 0,
        command: project.command,
        cwd: project.cwd,
        name: project.name,
        running: false,
        isSelf: false,
        isCustom: project.isCustom,
      });
    }
  }

  // Ensure agent-studio is always in the list and marked as self
  const agentStudio = result.find(
    (s) => s.name === "agent-studio" || s.port === selfPort,
  );
  if (agentStudio) {
    agentStudio.isSelf = true;
    agentStudio.name = "agent-studio";
  }

  return result;
}

/**
 * Detect which port a newly started server is listening on.
 * Scans common dev server ports and checks if a process with the given PID owns any.
 */
function detectPortForPid(pid: number): number {
  const ports = findPortsForPid(pid);
  if (ports.length > 0) return ports[0]!;

  // Fallback: scan all node listeners and find a match
  const allListeners = findNodeListeningPorts();
  const match = allListeners.find((l) => l.pid === pid);
  return match?.port ?? 0;
}

/**
 * Check if a process is still alive.
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Start a dev server in a given directory.
 * Returns a promise that resolves after detecting the port.
 */
export async function startDevServer(
  cwd: string,
  command: string,
): Promise<{ pid: number; port: number; status: string }> {
  // Parse command into parts
  const parts = command.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);

  const child = spawn(cmd!, args, {
    cwd,
    stdio: "ignore",
    detached: true,
    env: { ...process.env, FORCE_COLOR: "1" },
    shell: true,
  });

  child.unref();

  const pid = child.pid ?? 0;
  const projectName = cwd.split(path.sep).pop() ?? "unknown";
  if (pid) {
    managedProcesses.set(projectName, child);
  }

  if (!pid) {
    return { pid: 0, port: 0, status: "failed" };
  }

  // Wait for the server to start and detect its port
  // Check at 1s, 2s, 3s intervals
  for (let attempt = 0; attempt < 3; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1500));

    if (!isProcessAlive(pid)) {
      return { pid, port: 0, status: "crashed" };
    }

    const port = detectPortForPid(pid);
    if (port > 0) {
      return { pid, port, status: "running" };
    }
  }

  // Process is alive but port not detected yet — return what we have
  if (isProcessAlive(pid)) {
    return { pid, port: 0, status: "starting" };
  }

  return { pid, port: 0, status: "failed" };
}

/**
 * Stop a dev server by PID.
 */
export function stopDevServer(pid: number): boolean {
  return killProcessGroup(pid);
}
