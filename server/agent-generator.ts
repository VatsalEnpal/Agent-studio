import { spawn } from "node:child_process";
import { whichCommand } from "./platform.js";
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import type { ProjectProfile } from "./project-analyzer.js";

// Re-export ProjectProfile so existing imports still work
export type { ProjectProfile };

// ---------- Legacy type alias for backward compatibility ----------
export type ProjectAnalysis = ProjectProfile;

// ---------- Types ----------

export interface GeneratedAgent {
  id: string;
  name: string;
  description: string;
  model: "opus" | "sonnet" | "haiku";
  mdContent: string;
  rulesFiles?: Array<{
    filename: string;
    content: string;
  }>;
}

export interface GenerationResult {
  agents: GeneratedAgent[];
  claudeMd?: string;
}

export interface AgentGenerationRequest {
  projectProfile: ProjectProfile;
  userDescription: string;
  teamSize?: number;
  preferences?: {
    workflowType?: string;
    automations?: string[];
  };
}

// ---------- Status tracking ----------

type GenerationStatus = "idle" | "analyzing" | "generating" | "done" | "error";

interface GenerationState {
  status: GenerationStatus;
  progress?: string;
  result?: GenerationResult;
  error?: string;
  startedAt?: number;
}

const generationState: GenerationState = { status: "idle" };

export function getGenerationStatus(): GenerationState {
  return { ...generationState };
}

function setStatus(status: GenerationStatus, extra?: Partial<GenerationState>) {
  generationState.status = status;
  if (extra) Object.assign(generationState, extra);
}

// ---------- Claude CLI check (cached at startup) ----------

let _claudeCliAvailable: boolean | null = null;

export function isClaudeCliAvailable(): boolean {
  if (_claudeCliAvailable === null) {
    _claudeCliAvailable = whichCommand("claude") !== null;
  }
  return _claudeCliAvailable;
}

/** Re-check CLI availability (e.g. after user installs it) */
export function refreshClaudeCliCheck(): boolean {
  _claudeCliAvailable = null;
  return isClaudeCliAvailable();
}

// ---------- Prompt builder ----------

export function buildAgentGenerationPrompt(request: AgentGenerationRequest): string {
  const { projectProfile, userDescription, teamSize } = request;

  const profileSummary = [
    `Project: ${projectProfile.name}`,
    `Languages: ${projectProfile.languages.join(", ") || "unknown"}`,
    `Frameworks: ${projectProfile.frameworks.join(", ") || "none detected"}`,
    `Package Manager: ${projectProfile.packageManager}`,
    projectProfile.database ? `Database: ${projectProfile.database}` : null,
    projectProfile.stateManagement ? `State Management: ${projectProfile.stateManagement}` : null,
    projectProfile.styling ? `Styling: ${projectProfile.styling}` : null,
    projectProfile.apiPattern ? `API Pattern: ${projectProfile.apiPattern}` : null,
    projectProfile.testFramework ? `Testing: ${projectProfile.testFramework}` : null,
    projectProfile.ciPlatform ? `CI/CD: ${projectProfile.ciPlatform}` : null,
    projectProfile.hasDocker ? "Has Docker: yes" : null,
    projectProfile.repoInfo?.platform ? `Hosting: ${projectProfile.repoInfo.platform}` : null,
    `Top-level dirs: ${projectProfile.projectStructure.join(", ") || "flat"}`,
    `Key config files: ${projectProfile.keyFiles.join(", ") || "none"}`,
    projectProfile.existingAgents.length > 0
      ? `Existing agents: ${projectProfile.existingAgents.join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const readmeSection = projectProfile.readme
    ? `\nREADME (first 2000 chars):\n${projectProfile.readme}`
    : "";

  return `You are generating a custom AI agent system for a real software project. Each agent is a .md file that tells Claude Code how to behave as a specialist.

CRITICAL: Generate agents that are SPECIFIC to THIS project. Do NOT use generic names like "frontend" or "backend" unless the project actually has those domains. The agent names, responsibilities, and domain knowledge must reflect what this project actually needs.

Examples of project-specific agents:
- Data engineering team: orchestrator, pipeline-builder, dbt-modeler, data-quality-checker
- Mobile app: orchestrator, ios-dev, android-dev, api-builder, app-tester
- Go microservices: orchestrator, service-builder, grpc-designer, k8s-deployer, load-tester
- Solo dev: assistant, reviewer
- ML project: orchestrator, model-trainer, data-engineer, evaluation-runner, api-deployer
- Game dev: orchestrator, game-logic, rendering-engineer, level-designer, playtester

## Project Profile
${profileSummary}
${readmeSection}

## User's Description
${userDescription || "(no description provided)"}

## Team Size
${teamSize ? `${teamSize} developer(s)` : "unknown"}

## Agent .md File Format (MANDATORY)

Every agent MUST have this structure:

\`\`\`markdown
---
name: agent-id
description: One paragraph describing when to use this agent and what it does
tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - SendMessage
---

# Agent Name -- Domain Description

You are the [role] for [project name]. You [core responsibility].

## ABSOLUTE RULES
1. NEVER run git push -- commit locally, the orchestrator handles pushing
2. [Safety boundary specific to this agent's domain]
3. [What to do when uncertain -- ask or stop]

## ENVIRONMENT
- Project path and relevant directories
- Tools and services this agent can access
- What it CANNOT access (explicit boundaries)

## HOW YOU THINK -- Reasoning Protocol
When you receive a task:
1. Scope check -- is this my responsibility?
2. Existing code check -- read before modifying
3. Spec/pattern check -- follow established conventions
4. Implement -- use the project's actual patterns
5. Self-verify -- does it compile? does it match conventions?

### Confidence Signals
- "I am certain" = verified in codebase
- "I believe" = reasonable but should verify
- "I need to check" = will read files first

## DOMAIN KNOWLEDGE
[Specific knowledge about the tech stack, libraries, conventions for THIS project]
[Reference the actual frameworks, versions, and patterns detected]

## PATTERNS TO FOLLOW
[Code style, file naming, architecture patterns from THIS project]

## MEMORY PROTOCOL
Read \`ai-agents/tools/memory_index.json\` before any task.
After significant work, write a memory file to \`ai-agents/memory/\`.

## HANDOFF PROTOCOL
Write structured handoff files to \`ai-agents/sprints/handoffs/\` when your work is done and another agent needs the output.

## WHAT TO DO WHEN STUCK
1. Check memory index for similar past issues
2. Message a teammate via SendMessage
3. If blocked after 2 attempts, message the orchestrator
\`\`\`

## Generation Rules

1. Generate ONLY agents that make sense for THIS specific project
2. Every agent's mdContent MUST reference the actual tech stack (${projectProfile.frameworks.join(", ") || "the detected stack"})
3. The orchestrator (or coordinator) agent MUST list the other agents it coordinates
4. ${teamSize && teamSize <= 2 ? "For small teams, generate fewer agents (2-4 total). A solo dev might just need 'assistant' + 'reviewer'" : "Generate enough agents to cover the project's domains (typically 3-6)"}
5. Keep each agent's mdContent between 80-150 lines
6. Agent ids must be lowercase with hyphens (e.g., "api-builder", "data-modeler")
7. Include domain-specific knowledge: if the project uses Next.js, the relevant agent should know App Router patterns. If it uses FastAPI, the agent should know Pydantic models.
8. Each agent should have at least one rulesFile with deep domain knowledge

## Output Format

Return ONLY a valid JSON object (no markdown fences, no explanation before or after).

{
  "agents": [
    {
      "id": "agent-id",
      "name": "Human Readable Name",
      "description": "One line -- when to use this agent",
      "model": "sonnet",
      "mdContent": "the full .md file content including YAML frontmatter",
      "rulesFiles": [
        {
          "filename": "tech_stack.md",
          "content": "# Tech Stack\\n\\nDetailed knowledge about..."
        }
      ]
    }
  ],
  "claudeMd": "# Project Name -- Claude Code Instructions\\n\\n## Project Overview\\n...\\n## Code Style\\n...\\n## Agent System\\n..."
}

The claudeMd should be a CLAUDE.md file for the project root containing:
- Project overview (from the analysis + user description)
- Core architecture rules (inferred from the stack)
- Code style conventions (language-appropriate)
- Key directories
- Agent system description (listing the generated agents)
- Memory protocol (read/write to ai-agents/memory/)
- Git commit format convention`;
}

// ---------- Generate agents ----------

export async function generateAgents(
  analysis: ProjectProfile,
  _projectPath: string,
  userDescription?: string,
  teamSize?: number,
): Promise<GeneratedAgent[]> {
  const result = await generateAgentsWithClaudeMd(
    analysis,
    _projectPath,
    userDescription,
    teamSize,
  );
  return result.agents;
}

export async function generateAgentsWithClaudeMd(
  analysis: ProjectProfile,
  _projectPath: string,
  userDescription?: string,
  teamSize?: number,
): Promise<GenerationResult> {
  if (!isClaudeCliAvailable()) {
    throw new Error("Claude CLI not found. Install Claude Code to use AI agent generation.");
  }

  setStatus("generating", { startedAt: Date.now(), progress: "Building prompt..." });

  const prompt = buildAgentGenerationPrompt({
    projectProfile: analysis,
    userDescription: userDescription ?? "",
    teamSize,
  });

  setStatus("generating", { progress: "Calling Claude..." });

  const output = await runClaudeHeadless(prompt);
  const result = parseGenerationOutput(output);

  setStatus("done", { result });
  return result;
}

// ---------- Preview (no file writes) ----------

export async function previewAgents(
  analysis: ProjectProfile,
  userDescription?: string,
  teamSize?: number,
): Promise<GenerationResult> {
  return generateAgentsWithClaudeMd(analysis, "", userDescription, teamSize);
}

// ---------- Claude CLI runner ----------

function runClaudeHeadless(prompt: string, model = "sonnet", timeoutMs = 30_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ["--model", model, "--print", prompt];
    const proc = spawn("claude", args, {
      stdio: ["ignore", "pipe", "pipe"],
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
      setStatus("error", { error: "Claude CLI timed out" });
      reject(new Error(`Claude CLI timed out after ${timeoutMs / 1000} seconds`));
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout.trim()) {
        setStatus("error", { error: `Claude exited with code ${code}` });
        reject(new Error(`Claude CLI exited with code ${code}: ${stderr.slice(0, 500)}`));
        return;
      }
      resolve(stdout);
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      setStatus("error", { error: err.message });
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
    });
  });
}

// ---------- Output parsing ----------

function parseGenerationOutput(raw: string): GenerationResult {
  let cleaned = raw.trim();

  // Strip markdown fences
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  // Try to find a JSON object (new format with claudeMd)
  const objStart = cleaned.indexOf("{");
  const objEnd = cleaned.lastIndexOf("}");
  const arrStart = cleaned.indexOf("[");

  // If the output is an object (new format), parse it
  if (objStart !== -1 && objEnd > objStart && (arrStart === -1 || objStart < arrStart)) {
    try {
      const parsed = JSON.parse(cleaned.slice(objStart, objEnd + 1)) as Record<string, unknown>;
      if (parsed.agents && Array.isArray(parsed.agents)) {
        return {
          agents: parseAgentArray(parsed.agents as unknown[]),
          claudeMd: typeof parsed.claudeMd === "string" ? parsed.claudeMd : undefined,
        };
      }
    } catch {
      // Fall through to array parsing
    }
  }

  // Fallback: try to find a JSON array (old format)
  const arrayEnd = cleaned.lastIndexOf("]");
  if (arrStart !== -1 && arrayEnd > arrStart) {
    cleaned = cleaned.slice(arrStart, arrayEnd + 1);
  }

  const parsed = JSON.parse(cleaned) as unknown[];
  if (!Array.isArray(parsed)) {
    throw new Error("Expected JSON array or object with agents array");
  }

  return { agents: parseAgentArray(parsed) };
}

function parseAgentArray(arr: unknown[]): GeneratedAgent[] {
  return arr.map((item) => {
    const obj = item as Record<string, unknown>;
    if (!obj.id || !obj.mdContent) {
      throw new Error("Agent missing required fields: id, mdContent");
    }
    const model = obj.model as string;
    const rulesFiles = Array.isArray(obj.rulesFiles)
      ? (obj.rulesFiles as Array<Record<string, unknown>>).map((rf) => ({
          filename: String(rf.filename ?? "rules.md"),
          content: String(rf.content ?? ""),
        }))
      : undefined;

    return {
      id: String(obj.id),
      name: String(obj.name ?? obj.id),
      description: String(obj.description ?? ""),
      model: model === "opus" || model === "sonnet" || model === "haiku" ? model : "sonnet",
      mdContent: String(obj.mdContent),
      rulesFiles,
    };
  });
}

// ---------- Write agent files to disk ----------

export function writeAgentFiles(
  agents: GeneratedAgent[],
  projectPath: string,
  claudeMd?: string,
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

    // Write rules files if present
    if (agent.rulesFiles && agent.rulesFiles.length > 0) {
      const rulesDir = join(agentDir, "rules");
      if (!existsSync(rulesDir)) {
        mkdirSync(rulesDir, { recursive: true });
      }
      for (const rf of agent.rulesFiles) {
        const rfPath = join(rulesDir, rf.filename);
        writeFileSync(rfPath, rf.content, "utf-8");
        created.push(`ai-agents/agents/${agent.id}/rules/${rf.filename}`);
      }
    }

    // Write a short .claude/agents/<id>.md that references the full one
    const claudeMdContent = generateClaudeAgentStub(agent);
    const claudeMdFilePath = join(claudeAgentsPath, `${agent.id}.md`);
    writeFileSync(claudeMdFilePath, claudeMdContent, "utf-8");
    created.push(`.claude/agents/${agent.id}.md`);
  }

  // Write CLAUDE.md if provided
  if (claudeMd) {
    const claudeMdPath = join(projectPath, "CLAUDE.md");
    writeFileSync(claudeMdPath, claudeMd, "utf-8");
    created.push("CLAUDE.md");
  }

  // Write memory index scaffold
  const memoryIndexPath = join(projectPath, "ai-agents", "tools", "memory_index.json");
  if (!existsSync(memoryIndexPath)) {
    const toolsDir = join(projectPath, "ai-agents", "tools");
    if (!existsSync(toolsDir)) {
      mkdirSync(toolsDir, { recursive: true });
    }
    writeFileSync(
      memoryIndexPath,
      JSON.stringify(
        {
          rebuilt_at: new Date().toISOString(),
          entries: [],
        },
        null,
        2,
      ),
      "utf-8",
    );
    created.push("ai-agents/tools/memory_index.json");
  }

  // Ensure memory directories exist
  const memoryDirs = ["learnings", "corrections", "decisions", "human-inputs", "knowledge"];
  for (const dir of memoryDirs) {
    const dirPath = join(projectPath, "ai-agents", "memory", dir);
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
      // Write a .gitkeep to preserve empty dir
      writeFileSync(join(dirPath, ".gitkeep"), "", "utf-8");
    }
  }

  // Ensure handoffs directory exists
  const handoffsDir = join(projectPath, "ai-agents", "sprints", "handoffs");
  if (!existsSync(handoffsDir)) {
    mkdirSync(handoffsDir, { recursive: true });
    writeFileSync(join(handoffsDir, ".gitkeep"), "", "utf-8");
  }

  return { created };
}

function generateClaudeAgentStub(agent: GeneratedAgent): string {
  // Extract tools from mdContent frontmatter if present
  let tools = "  - Bash\n  - Read\n  - Write\n  - Edit\n  - Glob\n  - Grep\n  - SendMessage";
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
After significant work, write a memory file to \`ai-agents/memory/\`.

## Communication
Use SendMessage to communicate with teammates. Check \`ai-agents/sprints/handoffs/\` for context from other agents.
`;
}
