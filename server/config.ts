import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
  agents: string[];
  dataSource?: string;
}

export interface WorkflowConfig {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  steps: WorkflowStepConfig[];
}

export interface AgentStudioConfig {
  projects: ProjectConfig[];
  agentSystem?: AgentSystemConfig;
  devServers: DevServerConfig[];
  defaults: DefaultsConfig;
  workflows?: WorkflowConfig[];
  setupComplete: boolean;
  version: string;
}

// ---------- Paths ----------

const CONFIG_FILENAME = ".agent-studio.json";
const CONFIG_VERSION = "1.0.0";

/** Returns the absolute path to the config file */
export function getConfigPath(): string {
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
    // Basic validation
    if (!parsed.version || !Array.isArray(parsed.projects)) return null;
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
 * Designed to produce the correct result for Vatsal's setup
 * while also working for any new user with a standard layout.
 */
export function generateDefaultConfig(): AgentStudioConfig {
  const cwd = process.cwd(); // agent-console dir
  const parentDir = join(cwd, ".."); // project root (e.g. InPipeline)
  const home = os.homedir();

  // ---------- Projects ----------
  const projects: ProjectConfig[] = [];

  // 1. Parent directory as main project (InPipeline)
  if (existsSync(join(parentDir, ".git"))) {
    const parentName = parentDir.split("/").pop() ?? "main-project";
    projects.push({
      name: parentName,
      path: parentDir,
      isProd: false,
      trackedBranches: detectTrackedBranches(parentDir),
    });
  }

  // 2. Sibling directories that are git repos (e.g. staging-frontend)
  const siblingCandidates = [
    join(parentDir, "..", "staging-frontend"),
    join(home, "Code", "staging-frontend"),
  ];
  for (const candidate of siblingCandidates) {
    if (
      existsSync(join(candidate, ".git")) &&
      !projects.some((p) => p.path === candidate)
    ) {
      const name = candidate.split("/").pop() ?? "sibling";
      projects.push({ name, path: candidate, isProd: false });
    }
  }

  // 3. Nested prod repo (e.g. InPipeline/enpal-energy-vnb-portal)
  const prodCandidates = [join(parentDir, "enpal-energy-vnb-portal")];
  for (const candidate of prodCandidates) {
    if (
      existsSync(join(candidate, ".git")) &&
      !projects.some((p) => p.path === candidate)
    ) {
      const name = candidate.split("/").pop() ?? "prod";
      projects.push({
        name: `${name} (PROD)`,
        path: candidate,
        isProd: true,
        trackedBranches: ["main"],
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

  // agent-studio itself
  devServers.push({
    name: "agent-studio",
    path: cwd,
    command: "npm run dev",
  });

  // staging-frontend
  for (const proj of projects) {
    if (proj.name === "staging-frontend") {
      devServers.push({
        name: "staging-frontend",
        path: proj.path,
        command: "npm run dev",
      });
    }
  }

  // nested vnb-portal
  for (const proj of projects) {
    if (proj.isProd && existsSync(join(proj.path, "package.json"))) {
      devServers.push({
        name: proj.name.replace(" (PROD)", "").replace(/\s+/g, "-"),
        path: proj.path,
        command: "npm run dev",
      });
    }
  }

  // ---------- Defaults ----------
  // Use ~ shorthand for display; resolved at runtime
  const workingDirectory = parentDir.replace(home, "~");

  // Show setup wizard if nothing meaningful was auto-detected
  const hasProjects = projects.length > 0;
  const hasAgentSystem = !!agentSystem;
  const setupComplete = hasProjects || hasAgentSystem;

  const config: AgentStudioConfig = {
    projects,
    devServers,
    defaults: {
      model: "sonnet",
      permissions: "bypass",
      workingDirectory,
    },
    setupComplete,
    version: CONFIG_VERSION,
  };
  if (agentSystem) {
    config.agentSystem = agentSystem;
  }
  return config;
}

// ---------- Helpers ----------

function detectTrackedBranches(repoPath: string): string[] {
  const branches = ["main"];
  try {
    const { execFileSync } =
      require("node:child_process") as typeof import("node:child_process");
    const raw = execFileSync(
      "git",
      ["branch", "--list", "--format=%(refname:short)"],
      { cwd: repoPath, encoding: "utf-8", timeout: 3000 },
    ).trim();
    const all = raw
      .split("\n")
      .map((b: string) => b.trim().replace(/^'|'$/g, ""))
      .filter(Boolean);
    // Include key branches
    for (const name of all) {
      if (
        name === "main" ||
        name === "AGENTS_SETUP" ||
        name.startsWith("staging/")
      ) {
        if (!branches.includes(name)) branches.push(name);
      }
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

/** Resolve ~ to the actual home directory. */
export function resolvePath(p: string): string {
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
  const main = config.projects.find((p) => !p.isProd);
  if (main) return main.path;
  // Fallback: parent of cwd
  return join(process.cwd(), "..");
}
