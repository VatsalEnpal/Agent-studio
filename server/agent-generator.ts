import { spawn, execSync } from "node:child_process";
import {
  readFileSync,
  readdirSync,
  statSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { join, basename, extname } from "node:path";

// ---------- Types ----------

export interface ProjectAnalysis {
  name: string;
  languages: string[];
  frameworks: string[];
  hasTests: boolean;
  hasCi: boolean;
  hasDocker: boolean;
  packageManager: string;
  structure: string;
  readme: string;
  description: string;
}

export interface GeneratedAgent {
  id: string;
  name: string;
  description: string;
  model: "opus" | "sonnet" | "haiku";
  mdContent: string;
}

// ---------- File extension to language mapping ----------

const EXT_LANG_MAP: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".py": "Python",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".kt": "Kotlin",
  ".swift": "Swift",
  ".rb": "Ruby",
  ".php": "PHP",
  ".cs": "C#",
  ".cpp": "C++",
  ".c": "C",
  ".dart": "Dart",
  ".ex": "Elixir",
  ".exs": "Elixir",
  ".scala": "Scala",
  ".sql": "SQL",
  ".sh": "Shell",
};

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "__pycache__",
  ".venv",
  "venv",
  "env",
  "dist",
  "build",
  "target",
  ".turbo",
  ".cache",
  "coverage",
  ".idea",
  ".vscode",
]);

// ---------- Step 1: Analyze Project ----------

export function analyzeProject(projectPath: string): ProjectAnalysis {
  const name = basename(projectPath);
  const languages = new Set<string>();
  const frameworks: string[] = [];
  let hasTests = false;
  let hasCi = false;
  let hasDocker = false;
  let packageManager = "unknown";
  let readme = "";
  let description = "";

  // Detect package manager and frameworks from config files
  if (existsSync(join(projectPath, "package.json"))) {
    packageManager = existsSync(join(projectPath, "yarn.lock"))
      ? "yarn"
      : existsSync(join(projectPath, "pnpm-lock.yaml"))
        ? "pnpm"
        : existsSync(join(projectPath, "bun.lockb"))
          ? "bun"
          : "npm";

    try {
      const pkg = JSON.parse(
        readFileSync(join(projectPath, "package.json"), "utf-8"),
      );
      const allDeps = {
        ...((pkg.dependencies as Record<string, string>) ?? {}),
        ...((pkg.devDependencies as Record<string, string>) ?? {}),
      };
      if (allDeps["next"]) frameworks.push("Next.js");
      if (allDeps["react"]) frameworks.push("React");
      if (allDeps["vue"]) frameworks.push("Vue");
      if (allDeps["svelte"] || allDeps["@sveltejs/kit"]) frameworks.push("Svelte");
      if (allDeps["angular"] || allDeps["@angular/core"]) frameworks.push("Angular");
      if (allDeps["express"]) frameworks.push("Express");
      if (allDeps["fastify"]) frameworks.push("Fastify");
      if (allDeps["nest"] || allDeps["@nestjs/core"]) frameworks.push("NestJS");
      if (allDeps["tailwindcss"]) frameworks.push("Tailwind CSS");
      if (allDeps["prisma"] || allDeps["@prisma/client"]) frameworks.push("Prisma");
      if (allDeps["drizzle-orm"]) frameworks.push("Drizzle");
      if (allDeps["supabase"] || allDeps["@supabase/supabase-js"]) frameworks.push("Supabase");
      if (allDeps["react-native"]) frameworks.push("React Native");
      if (allDeps["expo"]) frameworks.push("Expo");
      if (allDeps["electron"]) frameworks.push("Electron");
      if (allDeps["vitest"]) { frameworks.push("Vitest"); hasTests = true; }
      if (allDeps["jest"]) { frameworks.push("Jest"); hasTests = true; }
      if (allDeps["@playwright/test"]) { frameworks.push("Playwright"); hasTests = true; }
      if (allDeps["cypress"]) { frameworks.push("Cypress"); hasTests = true; }
      if (allDeps["mocha"]) { hasTests = true; }

      if (pkg.description) description = String(pkg.description);
    } catch {
      // Ignore parse errors
    }
  }

  if (existsSync(join(projectPath, "requirements.txt")) || existsSync(join(projectPath, "pyproject.toml"))) {
    packageManager = packageManager === "unknown" ? "pip" : packageManager;
    try {
      const pyproject = existsSync(join(projectPath, "pyproject.toml"))
        ? readFileSync(join(projectPath, "pyproject.toml"), "utf-8")
        : "";
      if (pyproject.includes("django")) frameworks.push("Django");
      if (pyproject.includes("fastapi")) frameworks.push("FastAPI");
      if (pyproject.includes("flask")) frameworks.push("Flask");
      if (pyproject.includes("pytest")) hasTests = true;
    } catch {
      // Ignore
    }
  }

  if (existsSync(join(projectPath, "go.mod"))) {
    packageManager = packageManager === "unknown" ? "go modules" : packageManager;
    try {
      const gomod = readFileSync(join(projectPath, "go.mod"), "utf-8");
      if (gomod.includes("gin-gonic")) frameworks.push("Gin");
      if (gomod.includes("fiber")) frameworks.push("Fiber");
      if (gomod.includes("echo")) frameworks.push("Echo");
    } catch {
      // Ignore
    }
  }

  if (existsSync(join(projectPath, "Cargo.toml"))) {
    packageManager = packageManager === "unknown" ? "cargo" : packageManager;
    try {
      const cargo = readFileSync(join(projectPath, "Cargo.toml"), "utf-8");
      if (cargo.includes("actix")) frameworks.push("Actix");
      if (cargo.includes("axum")) frameworks.push("Axum");
      if (cargo.includes("rocket")) frameworks.push("Rocket");
    } catch {
      // Ignore
    }
  }

  // Detect CI
  hasCi =
    existsSync(join(projectPath, ".github", "workflows")) ||
    existsSync(join(projectPath, ".gitlab-ci.yml")) ||
    existsSync(join(projectPath, "azure-pipelines.yml")) ||
    existsSync(join(projectPath, ".circleci")) ||
    existsSync(join(projectPath, "Jenkinsfile"));

  // Detect Docker
  hasDocker =
    existsSync(join(projectPath, "Dockerfile")) ||
    existsSync(join(projectPath, "docker-compose.yml")) ||
    existsSync(join(projectPath, "docker-compose.yaml"));

  // Detect test directories
  if (!hasTests) {
    hasTests =
      existsSync(join(projectPath, "tests")) ||
      existsSync(join(projectPath, "test")) ||
      existsSync(join(projectPath, "__tests__")) ||
      existsSync(join(projectPath, "spec"));
  }

  // Scan for languages and build tree (top 3 levels)
  const structure = buildTree(projectPath, 3);
  scanLanguages(projectPath, languages, 3);

  // Read README
  const readmeFiles = ["README.md", "readme.md", "README.rst", "README.txt", "README"];
  for (const rf of readmeFiles) {
    const rp = join(projectPath, rf);
    if (existsSync(rp)) {
      try {
        readme = readFileSync(rp, "utf-8").slice(0, 1000);
      } catch {
        // Ignore
      }
      break;
    }
  }

  return {
    name,
    languages: [...languages],
    frameworks: [...new Set(frameworks)],
    hasTests,
    hasCi,
    hasDocker,
    packageManager,
    structure,
    readme,
    description,
  };
}

function scanLanguages(dir: string, languages: Set<string>, maxDepth: number, depth = 0): void {
  if (depth >= maxDepth) return;
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry) || entry.startsWith(".")) continue;
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          scanLanguages(fullPath, languages, maxDepth, depth + 1);
        } else {
          const ext = extname(entry).toLowerCase();
          const lang = EXT_LANG_MAP[ext];
          if (lang) languages.add(lang);
        }
      } catch {
        // Skip inaccessible files
      }
    }
  } catch {
    // Skip inaccessible directories
  }
}

function buildTree(dir: string, maxDepth: number, prefix = "", depth = 0): string {
  if (depth >= maxDepth) return "";
  const lines: string[] = [];
  try {
    const entries = readdirSync(dir)
      .filter((e) => !SKIP_DIRS.has(e) && !e.startsWith("."))
      .sort((a, b) => {
        // Directories first
        const aIsDir = statSync(join(dir, a)).isDirectory();
        const bIsDir = statSync(join(dir, b)).isDirectory();
        if (aIsDir && !bIsDir) return -1;
        if (!aIsDir && bIsDir) return 1;
        return a.localeCompare(b);
      });

    // Cap at 15 entries per level to avoid huge output
    const capped = entries.slice(0, 15);
    const hasMore = entries.length > 15;

    for (let i = 0; i < capped.length; i++) {
      const entry = capped[i];
      const fullPath = join(dir, entry);
      const isLast = i === capped.length - 1 && !hasMore;
      const connector = isLast ? "└── " : "├── ";
      const childPrefix = isLast ? "    " : "│   ";

      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          lines.push(`${prefix}${connector}${entry}/`);
          const sub = buildTree(fullPath, maxDepth, prefix + childPrefix, depth + 1);
          if (sub) lines.push(sub);
        } else {
          lines.push(`${prefix}${connector}${entry}`);
        }
      } catch {
        lines.push(`${prefix}${connector}${entry}`);
      }
    }

    if (hasMore) {
      lines.push(`${prefix}└── ... (${entries.length - 15} more)`);
    }
  } catch {
    // Skip unreadable
  }
  return lines.join("\n");
}

// ---------- Step 2: Check Claude CLI availability ----------

export function isClaudeCliAvailable(): boolean {
  try {
    execSync("which claude", { encoding: "utf-8", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

// ---------- Step 3: Generate agents using Claude CLI ----------

const GENERATION_PROMPT = `You are generating agent definitions for a software project. Each agent is a .md file that tells Claude Code how to behave as a specialist.

PROJECT ANALYSIS:
{ANALYSIS}

AGENT .MD FILE FORMAT:

Every agent .md file MUST include:
1. YAML frontmatter with: name, description, tools list
2. A "How You Think" section with numbered reasoning steps specific to this agent's role
3. Confidence Signals: "I am certain" / "I believe" / "I need to check"
4. Environment Rules: what the agent CAN and CANNOT access
5. "First — Read Context" section: which files to load before working
6. Memory Protocol: read memory index before work, write memory after
7. Handoff Protocol: write structured handoff files for next agent
8. Self-Verification: verify own work before reporting done
9. "NEVER run git push — commit locally, orchestrator handles pushing"

Based on the project analysis, generate the appropriate agents. Common agents:
- orchestrator (ALWAYS include — coordinates the team, never writes code itself)
- frontend (if project has frontend code — builds UI)
- backend (if project has backend/API code — builds APIs and data layer)
- qa (ALWAYS include — tests the application)
- security (ALWAYS include — reviews code for vulnerabilities)
- devops (if project has CI/CD, Docker, Terraform — manages infrastructure)
- data (if project has data pipelines, ML, analytics)
- mobile (if React Native, Flutter, Swift, Kotlin)
- documentation (if documentation is important for the project)

IMPORTANT RULES:
- Generate ONLY agents that make sense for this specific project
- The mdContent must reference the actual tech stack detected (frameworks, languages, tools)
- The orchestrator agent must list the other agents it coordinates
- Each agent should have rules specific to the detected frameworks
- Keep each agent's mdContent under 150 lines
- Use the project name and detected tools in the rules

Output ONLY a valid JSON array (no markdown fences, no explanation). Each element:
{
  "id": "agent-id",
  "name": "Human Readable Name",
  "description": "one line description",
  "model": "sonnet",
  "mdContent": "the full .md file content including YAML frontmatter"
}`;

export async function generateAgents(
  analysis: ProjectAnalysis,
  _projectPath: string,
): Promise<GeneratedAgent[]> {
  if (!isClaudeCliAvailable()) {
    throw new Error("Claude CLI not found. Install Claude Code to use AI agent generation.");
  }

  const prompt = GENERATION_PROMPT.replace(
    "{ANALYSIS}",
    JSON.stringify(analysis, null, 2),
  );

  return new Promise((resolve, reject) => {
    const args = ["--model", "sonnet", "--print", prompt];
    const proc = spawn("claude", args, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 90_000,
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error("Claude CLI timed out after 90 seconds"));
    }, 90_000);

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(`Claude CLI exited with code ${code}: ${stderr.slice(0, 500)}`));
        return;
      }

      try {
        const agents = parseAgentJson(stdout);
        resolve(agents);
      } catch (err) {
        reject(
          new Error(
            `Failed to parse Claude output: ${err instanceof Error ? err.message : "unknown"}`,
          ),
        );
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
    });
  });
}

function parseAgentJson(raw: string): GeneratedAgent[] {
  // Claude might wrap JSON in markdown fences — strip them
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  // Try to find the JSON array in the output
  const arrayStart = cleaned.indexOf("[");
  const arrayEnd = cleaned.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    cleaned = cleaned.slice(arrayStart, arrayEnd + 1);
  }

  const parsed = JSON.parse(cleaned) as unknown[];
  if (!Array.isArray(parsed)) {
    throw new Error("Expected JSON array");
  }

  return parsed.map((item) => {
    const obj = item as Record<string, unknown>;
    if (!obj.id || !obj.mdContent) {
      throw new Error("Agent missing required fields: id, mdContent");
    }
    const model = obj.model as string;
    return {
      id: String(obj.id),
      name: String(obj.name ?? obj.id),
      description: String(obj.description ?? ""),
      model: (model === "opus" || model === "sonnet" || model === "haiku") ? model : "sonnet",
      mdContent: String(obj.mdContent),
    };
  });
}

// ---------- Step 4: Write agent files to disk ----------

export function writeAgentFiles(
  agents: GeneratedAgent[],
  projectPath: string,
): { created: string[] } {
  const aiAgentsPath = join(projectPath, "ai-agents", "agents");
  const claudeAgentsPath = join(projectPath, ".claude", "agents");
  const created: string[] = [];

  // Ensure directories exist
  if (!existsSync(aiAgentsPath)) {
    mkdirSync(aiAgentsPath, { recursive: true });
  }
  if (!existsSync(claudeAgentsPath)) {
    mkdirSync(claudeAgentsPath, { recursive: true });
  }

  for (const agent of agents) {
    // Write the full agent.md to ai-agents/agents/<id>/agent.md
    const agentDir = join(aiAgentsPath, agent.id);
    if (!existsSync(agentDir)) {
      mkdirSync(agentDir, { recursive: true });
    }
    const agentMdPath = join(agentDir, "agent.md");
    writeFileSync(agentMdPath, agent.mdContent, "utf-8");
    created.push(`ai-agents/agents/${agent.id}/agent.md`);

    // Write a short .claude/agents/<id>.md that references the full one
    const claudeMdContent = generateClaudeAgentStub(agent);
    const claudeMdPath = join(claudeAgentsPath, `${agent.id}.md`);
    writeFileSync(claudeMdPath, claudeMdContent, "utf-8");
    created.push(`.claude/agents/${agent.id}.md`);
  }

  return { created };
}

function generateClaudeAgentStub(agent: GeneratedAgent): string {
  // Extract tools from mdContent frontmatter if present
  let tools = "  - Bash\n  - Read\n  - Write\n  - Edit\n  - Glob\n  - Grep";
  const fmMatch = agent.mdContent.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const toolsMatch = fmMatch[1].match(/tools:\n((?:\s+-\s+.+\n?)+)/);
    if (toolsMatch) {
      tools = toolsMatch[1].trimEnd();
    }
  }

  return `---
name: ${agent.id}
description: ${agent.description}
tools:
${tools}
---

# ${agent.name}

You are the ${agent.id} agent. Load your full context from \`ai-agents/agents/${agent.id}/agent.md\` at the start of every conversation.

## Memory
Read \`ai-agents/tools/memory_index.json\` before any task.
`;
}
