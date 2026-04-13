import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, sep } from "node:path";
import os from "node:os";

// ---------- Schema ----------

export interface ProjectConfig {
  name: string;
  path: string;
  isProd: boolean;
  branch?: string;
  trackedBranches?: string[];
}

export interface AgentSystemConfig {
  path: string; // absolute, e.g. ~/Code/MyProject/ai-agents
  memoryIndex: string; // relative: tools/memory_index.json
  sprintDir: string; // relative: sprints/
  scanLog: string; // relative: sprints/scan_log.md
}

export interface DevServerConfig {
  name: string;
  path: string;
  command: string;
  port?: number;
  autoStart?: boolean;
}

export interface DefaultsConfig {
  model: "opus" | "sonnet" | "haiku";
  permissions: "bypass" | "default" | "plan" | "auto";
  workingDirectory: string;
}

export interface WorkflowStepConfig {
  id: string;
  name: string;
  description?: string;
  agents?: string[];
  dataSource?: string;
  /** Step type: agent, gate, loop, agent-group */
  type?: string;
  /** Single agent name (for agent steps) */
  agent?: string;
  /** Goal for agent steps */
  goal?: string;
  /** Max iterations for loop steps */
  maxIterations?: number;
  /** Nested step IDs for loop steps, or inline sub-steps for agent-group */
  steps?: (WorkflowStepConfig | string)[];
  /** Additional fields the client sends are preserved via index signature */
  [key: string]: unknown;
}

export interface WorkflowConfig {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  steps: WorkflowStepConfig[];
}

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  model?: "opus" | "sonnet" | "haiku";
  icon?: string;
}

export interface AutomationConfig {
  id: string;
  name: string;
  description: string;
  schedule: string;
  agent: string;
  model: "opus" | "sonnet" | "haiku";
  prompt: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
}

export interface AgentStudioConfig {
  projects: ProjectConfig[];
  agentSystem?: AgentSystemConfig;
  devServers: DevServerConfig[];
  defaults: DefaultsConfig;
  workflows?: WorkflowConfig[];
  agents?: AgentConfig[];
  automations?: AutomationConfig[];
  setupComplete: boolean;
  version: string;
}

// ---------- Paths ----------

const CONFIG_FILENAME = ".agent-studio.json";
const CONFIG_VERSION = "1.0.0";

/** Returns the absolute path to the config file.
 *  In production (packaged Electron), use ~/.agent-studio/ so the config
 *  survives app updates and doesn't live inside the read-only app bundle.
 *  In development, use cwd (the project directory). */
export function getConfigPath(): string {
  if (process.env["NODE_ENV"] === "production") {
    const homeDir = join(homedir(), ".agent-studio");
    if (!existsSync(homeDir)) mkdirSync(homeDir, { recursive: true });
    return join(homeDir, CONFIG_FILENAME);
  }
  return join(process.cwd(), CONFIG_FILENAME);
}

// ---------- Load / Save ----------

/** Read and parse the config file. Returns null if missing or invalid. */
export function loadConfig(): AgentStudioConfig | null {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) return null;

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as AgentStudioConfig;
    // Basic validation — accept partial configs, fill in defaults
    if (!Array.isArray(parsed.projects)) parsed.projects = [];
    if (!parsed.version) parsed.version = CONFIG_VERSION;
    if (!parsed.defaults) {
      parsed.defaults = { model: "sonnet", permissions: "bypass", workingDirectory: "~" };
    }
    if (!Array.isArray(parsed.devServers)) parsed.devServers = [];
    return parsed;
  } catch {
    return null;
  }
}

/** Write the config to disk. */
export function saveConfig(config: AgentStudioConfig): void {
  const configPath = getConfigPath();
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}

// ---------- Auto-Generation ----------

/**
 * Auto-generates a config by inspecting the filesystem.
 * Detects the current project and any git repos in the parent directory.
 */
export function generateDefaultConfig(): AgentStudioConfig {
  const rawCwd = process.cwd();
  // Electron packaged apps set cwd to the app bundle (e.g. /Applications/Agent Studio.app/...).
  // Detect this and fall back to home directory so sessions don't run inside the bundle.
  const isInsideAppBundle = rawCwd.includes(".app/Contents/");
  const cwd = isInsideAppBundle ? os.homedir() : rawCwd;
  const parentDir = join(cwd, "..");

  // ---------- Projects ----------
  const projects: ProjectConfig[] = [];

  // Parent directory as main project (if it's a git repo)
  if (existsSync(join(parentDir, ".git"))) {
    const parentName = parentDir.split(sep).pop() ?? "main-project";
    projects.push({
      name: parentName,
      path: parentDir,
      isProd: false,
      trackedBranches: detectTrackedBranches(parentDir),
    });
  }

  // Current directory as project (if it's a git repo and different from parent)
  if (existsSync(join(cwd, ".git")) && cwd !== parentDir) {
    const cwdName = cwd.split(sep).pop() ?? "project";
    if (!projects.some((p) => p.path === cwd)) {
      projects.push({
        name: cwdName,
        path: cwd,
        isProd: false,
        trackedBranches: detectTrackedBranches(cwd),
      });
    }
  }

  // ---------- Agent System ----------
  let agentSystem: AgentSystemConfig | undefined;
  const agentSystemPath = join(parentDir, "ai-agents");
  if (existsSync(agentSystemPath)) {
    agentSystem = {
      path: agentSystemPath,
      memoryIndex: "tools/memory_index.json",
      sprintDir: "sprints/",
      scanLog: "sprints/scan_log.md",
    };
  }

  // ---------- Dev Servers ----------
  const devServers: DevServerConfig[] = [];

  // Add detected projects as potential dev servers
  for (const proj of projects) {
    if (!proj.isProd && existsSync(join(proj.path, "package.json"))) {
      devServers.push({
        name: proj.name,
        path: proj.path,
        command: "npm run dev",
      });
    }
  }

  // ---------- Defaults ----------
  // Use ~ shorthand for display; resolved at runtime
  const home = os.homedir();
  const workingDirectory = (projects[0]?.path ?? parentDir).replace(home, "~");

  // Show setup wizard if nothing meaningful was auto-detected
  const hasProjects = projects.length > 0;
  const hasAgentSystem = !!agentSystem;
  const setupComplete = hasProjects || hasAgentSystem;

  return {
    projects,
    agentSystem,
    devServers,
    defaults: {
      model: "sonnet",
      permissions: "bypass",
      workingDirectory,
    },
    setupComplete,
    version: CONFIG_VERSION,
  };
}

// ---------- Helpers ----------

function detectTrackedBranches(repoPath: string): string[] {
  const branches = ["main"];
  try {
    const { execSync } = require("node:child_process") as typeof import("node:child_process");
    const raw = execSync("git branch --list --format='%(refname:short)'", {
      cwd: repoPath,
      encoding: "utf-8",
      timeout: 3000,
    }).trim();
    const all = raw
      .split("\n")
      .map((b: string) => b.trim().replace(/^'|'$/g, ""))
      .filter(Boolean);
    // Include all local branches
    for (const name of all) {
      if (!branches.includes(name)) branches.push(name);
    }
  } catch {
    // fallback: just main
  }
  return branches;
}

// ---------- Resolvers (used by other server modules) ----------

/**
 * Get the loaded config or generate + save a default.
 * This is the main entry point for all server modules.
 */
let _cachedConfig: AgentStudioConfig | null = null;

export function getConfig(): AgentStudioConfig {
  if (_cachedConfig) return _cachedConfig;

  let config = loadConfig();
  if (!config) {
    config = generateDefaultConfig();
    saveConfig(config);
  }
  _cachedConfig = config;
  return config;
}

/** Force reload from disk (after settings change). */
export function reloadConfig(): AgentStudioConfig {
  _cachedConfig = null;
  return getConfig();
}

/** Resolve ~ to the actual home directory. Returns "" for undefined/null input. */
export function resolvePath(p: string | undefined | null): string {
  if (!p) return "";
  if (p.startsWith("~")) {
    return p.replace("~", os.homedir());
  }
  return p;
}

/**
 * Get the absolute path to the agent system base, or null if not configured.
 */
export function getAgentSystemBase(): string | null {
  const config = getConfig();
  return config.agentSystem?.path ?? null;
}

/**
 * Get the absolute path to a file within the agent system.
 * @param relativePath - relative to agentSystem.path, e.g. "sprints/current.md"
 */
export function getAgentSystemPath(relativePath: string): string | null {
  const base = getAgentSystemBase();
  if (!base) return null;
  return join(base, relativePath);
}

/**
 * Get the main project directory (first non-prod project, or cwd parent).
 */
export function getMainProjectDir(): string {
  const config = getConfig();
  const projects = config.projects ?? [];
  const main = projects.find((p) => !p.isProd);
  if (main?.path) return main.path;
  // Fallback: home directory (not cwd, which may be an Electron app bundle)
  const rawCwd = process.cwd();
  if (rawCwd.includes(".app/Contents/")) return os.homedir();
  return join(rawCwd, "..");
}
