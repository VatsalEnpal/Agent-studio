import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------- Types ----------

export interface ScaffoldOptions {
  projectPath: string;
  agents: string[];
  workflow: "sprint" | "simple" | "custom";
  notifications: {
    telegram: boolean;
  };
  scheduler: {
    enabled: boolean;
    intervalHours: number;
  };
}

export interface ScaffoldResult {
  created: string[];
  skipped: string[];
  alreadyExists: boolean;
}

// ---------- Agent Templates ----------

const AGENT_TEMPLATES: Record<string, { description: string; tools: string[]; rules: string[] }> = {
  orchestrator: {
    description: "Coordinates agent teams. Delegates work, manages dependencies, reviews before pushing.",
    tools: ["Bash", "Read", "Glob", "Grep"],
    rules: [
      "Classify tasks: QUICK (do it) / STANDARD (plan + delegate) / ARCHITECTURE (design first)",
      "NEVER write code yourself — delegate to specialized agents",
      "Always review diffs before pushing",
      "Ask for human approval before deploying to production",
      "Load memory index before every task",
    ],
  },
  frontend: {
    description: "Builds and maintains the frontend. Follows project patterns and conventions.",
    tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep"],
    rules: [
      "Never push directly — commit locally, report to orchestrator",
      "Run type-check after every change",
      "Follow the project's coding style and component patterns",
      "Server components fetch data, client components render interactivity",
      "Self-verify: TypeScript compiles, labels correct, component under 150 lines",
    ],
  },
  backend: {
    description: "Builds APIs, database schemas, server logic, and data layer.",
    tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep"],
    rules: [
      "Never modify production directly — use migrations",
      "Always use parameterized queries, never string interpolation",
      "Write RLS policies for every new table",
      "Test locally before reporting done",
      "Document breaking changes in handoff files",
    ],
  },
  qa: {
    description: "Tests the application. Runs smoke tests, E2E tests, and regression checks.",
    tools: ["Bash", "Read", "Glob", "Grep"],
    rules: [
      "Read the frontend handoff file before testing",
      "Report bugs with severity (P0-P3), steps to reproduce, expected vs actual",
      "Calculate health score: 100 - (P0*25) - (P1*15) - (P2*5) - (P3*1)",
      "Never mark a bug as fixed without retesting",
      "Write QA report after every test run",
    ],
  },
  security: {
    description: "Reviews code for vulnerabilities. Has VETO power on deployments.",
    tools: ["Bash", "Read", "Glob", "Grep"],
    rules: [
      "Check for exposed secrets, hardcoded credentials, and env var leaks",
      "Verify RLS policies on every data-access path",
      "VETO any change that exposes production data to unauthorized users",
      "Review auth flows for session fixation, CSRF, and token leakage",
      "Never approve a PR without reading the full diff",
    ],
  },
  pmo: {
    description: "Scans for tasks, manages sprints, tracks scope and timelines.",
    tools: ["Bash", "Read", "Write", "Glob", "Grep"],
    rules: [
      "Scan task boards for items ready to be worked on",
      "Write sprint specs with acceptance criteria before building starts",
      "Track scope boundaries — flag scope creep early",
      "Maintain the scan log with timestamps and outcomes",
      "Never start a sprint without orchestrator approval",
    ],
  },
  documentation: {
    description: "Maintains documentation, knowledge base, and READMEs.",
    tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep"],
    rules: [
      "Keep docs accurate and up to date with the codebase",
      "Use clear, concise language — no jargon without explanation",
      "Document decisions in memory files, not just in code comments",
      "Update README files when features change",
      "Cross-reference related docs with links",
    ],
  },
  clearing: {
    description: "Domain-specific agent for clearing processes (energy, finance, etc).",
    tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep"],
    rules: [
      "Follow the config-driven pattern: new process = new config row, zero code changes",
      "Every clearing follows identical structure, parameterized by process_type",
      "Validate against the ground truth source (Notion, spec docs) before implementing",
      "Include all documented status options — missing options cause silent failures",
      "Always include else clauses for unmatched conditions",
    ],
  },
};

function generateAgentMd(name: string): string {
  const template = AGENT_TEMPLATES[name];
  if (!template) {
    return `# ${name} Agent\n\nCustom agent — define your rules here.\n`;
  }

  const toolsYaml = template.tools.map((t) => `  - ${t}`).join("\n");
  const rulesBlock = template.rules.map((r, i) => `${i + 1}. ${r}`).join("\n");

  return `---
name: ${name}
description: ${template.description}
tools:
${toolsYaml}
---

# ${capitalize(name)} Agent

${template.description}

## Rules
${rulesBlock}

## Memory Protocol
- Before starting: read \`ai-agents/tools/memory_index.json\`
- After significant work: write a memory file to \`ai-agents/memory/\`
- Update the index after writing

## Communication
- Report completion to orchestrator with list of changed files
- Message teammates directly for questions in your domain
- Escalate to orchestrator if blocked after 3 attempts
`;
}

function generateClaudeAgentMd(name: string): string {
  const template = AGENT_TEMPLATES[name];
  if (!template) {
    return `# ${capitalize(name)} Agent\n\nLoad your full context from \`ai-agents/agents/${name}/agent.md\`.\n`;
  }

  const toolsList = template.tools.map((t) => `  - ${t}`).join("\n");

  return `---
name: ${name}
description: ${template.description}
tools:
${toolsList}
---

# ${capitalize(name)} Agent

You are the ${name} agent. Load your full context from \`ai-agents/agents/${name}/agent.md\` at the start of every conversation.

## Quick Reference
${template.rules.slice(0, 3).map((r, i) => `${i + 1}. ${r}`).join("\n")}

## Memory
Read \`ai-agents/tools/memory_index.json\` before any task.
`;
}

function generateReadme(agents: string[], workflow: string): string {
  return `# Agent System

This directory contains your AI agent system — agent definitions, shared memory, sprint management, and tools.

## Structure

\`\`\`
ai-agents/
├── agents/          # Agent definitions (one folder per agent)
├── memory/          # Shared memory (learnings, corrections, decisions)
├── sprints/         # Sprint specs, handoffs, scan logs
├── tools/           # Shared tools (memory index, scripts)
└── context/         # Shared context files (schemas, specs)
\`\`\`

## Agents

${agents.map((a) => `- **${a}**: ${AGENT_TEMPLATES[a]?.description ?? "Custom agent"}`).join("\n")}

## Workflow

**${workflow}** workflow is configured.

${workflow === "sprint" ? "PMO scans for tasks, writes specs, orchestrator approves, agents build in phases with gates, QA tests, then ship." : workflow === "simple" ? "Plan, build, test, deploy — straightforward pipeline." : "Custom workflow — define your steps in the config."}

## Memory Protocol

1. Before any task: read \`tools/memory_index.json\`
2. After significant work: write to \`memory/\` and update the index
3. Memories are JSON files with tags for searchability

## Getting Started

1. Start a Claude Code session
2. Use \`--agent orchestrator\` to coordinate work
3. The orchestrator will delegate to specialized agents
`;
}

function generateNotifyScript(): string {
  return `#!/bin/bash
# Telegram notification script
# Usage: ./notify.sh "Your message here"

TELEGRAM_BOT_TOKEN="your-token-here"
TELEGRAM_CHAT_ID="your-chat-id-here"

MESSAGE="\$1"

if [ -z "\$MESSAGE" ]; then
  echo "Usage: ./notify.sh \\"message\\""
  exit 1
fi

if [ "\$TELEGRAM_BOT_TOKEN" = "your-token-here" ]; then
  echo "Warning: Set TELEGRAM_BOT_TOKEN in this script first"
  exit 1
fi

curl -s -X POST "https://api.telegram.org/bot\${TELEGRAM_BOT_TOKEN}/sendMessage" \\
  -d chat_id="\${TELEGRAM_CHAT_ID}" \\
  -d text="\${MESSAGE}" \\
  -d parse_mode="Markdown" > /dev/null

echo "Notification sent."
`;
}

function generatePmoScanScript(projectPath: string): string {
  return `#!/bin/bash
# PMO Scan Script — runs periodically to check for new tasks
# Called by launchd/cron scheduler

SCAN_LOG="${projectPath}/ai-agents/sprints/scan_log.md"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "" >> "\$SCAN_LOG"
echo "## Scan: \$TIMESTAMP" >> "\$SCAN_LOG"
echo "" >> "\$SCAN_LOG"

# Run the PMO agent in headless mode
claude --agent pmo -p "Check if there are any tasks ready for a sprint. Update scan_log.md with findings." --cwd "${projectPath}" 2>&1 | tail -5 >> "\$SCAN_LOG"

echo "Status: completed" >> "\$SCAN_LOG"
echo "---" >> "\$SCAN_LOG"
`;
}

// ---------- Main Scaffolder ----------

export function scaffoldAgentSystem(options: ScaffoldOptions): ScaffoldResult {
  const { projectPath, agents, workflow, notifications, scheduler } = options;
  const aiAgentsPath = join(projectPath, "ai-agents");
  const claudeAgentsPath = join(projectPath, ".claude", "agents");

  const created: string[] = [];
  const skipped: string[] = [];

  // Check if agent system already exists
  const alreadyExists = existsSync(aiAgentsPath);
  if (alreadyExists) {
    return { created: [], skipped: ["ai-agents/ already exists"], alreadyExists: true };
  }

  // --- Create directory structure ---
  const dirs = [
    aiAgentsPath,
    join(aiAgentsPath, "tools"),
    join(aiAgentsPath, "memory"),
    join(aiAgentsPath, "memory", "learnings"),
    join(aiAgentsPath, "memory", "corrections"),
    join(aiAgentsPath, "memory", "decisions"),
    join(aiAgentsPath, "memory", "human-inputs"),
    join(aiAgentsPath, "sprints"),
    join(aiAgentsPath, "sprints", "handoffs"),
    join(aiAgentsPath, "sprints", "archive"),
    join(aiAgentsPath, "agents"),
    join(aiAgentsPath, "context"),
    claudeAgentsPath,
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      created.push(relative(projectPath, dir) + "/");
    }
  }

  // --- Create agent directories and files ---
  for (const agent of agents) {
    const agentDir = join(aiAgentsPath, "agents", agent);
    if (!existsSync(agentDir)) {
      mkdirSync(agentDir, { recursive: true });
    }

    // ai-agents/agents/<agent>/agent.md
    const agentMdPath = join(agentDir, "agent.md");
    writeFileSync(agentMdPath, generateAgentMd(agent), "utf-8");
    created.push(relative(projectPath, agentMdPath));

    // .claude/agents/<agent>.md
    const claudeMdPath = join(claudeAgentsPath, `${agent}.md`);
    writeFileSync(claudeMdPath, generateClaudeAgentMd(agent), "utf-8");
    created.push(relative(projectPath, claudeMdPath));
  }

  // --- Create core files ---

  // README
  const readmePath = join(aiAgentsPath, "README.md");
  writeFileSync(readmePath, generateReadme(agents, workflow), "utf-8");
  created.push("ai-agents/README.md");

  // Memory index
  const memoryIndexPath = join(aiAgentsPath, "tools", "memory_index.json");
  writeFileSync(memoryIndexPath, JSON.stringify({
    rebuilt_at: new Date().toISOString(),
    total_entries: 0,
    total_files: 0,
    entries: [],
  }, null, 2), "utf-8");
  created.push("ai-agents/tools/memory_index.json");

  // Sprint files
  const currentSprintPath = join(aiAgentsPath, "sprints", "current.md");
  writeFileSync(currentSprintPath, "# Current Sprint\n\nNo active sprint.\n", "utf-8");
  created.push("ai-agents/sprints/current.md");

  const scanLogPath = join(aiAgentsPath, "sprints", "scan_log.md");
  writeFileSync(scanLogPath, "# Scan Log\n\nNo scans yet.\n", "utf-8");
  created.push("ai-agents/sprints/scan_log.md");

  // .gitkeep files
  const gitkeeps = [
    join(aiAgentsPath, "sprints", "handoffs", ".gitkeep"),
    join(aiAgentsPath, "sprints", "archive", ".gitkeep"),
    join(aiAgentsPath, "context", ".gitkeep"),
  ];
  for (const gk of gitkeeps) {
    writeFileSync(gk, "", "utf-8");
    created.push(relative(projectPath, gk));
  }

  // --- Optional: Telegram notify script ---
  if (notifications.telegram) {
    const notifyPath = join(aiAgentsPath, "tools", "notify.sh");
    writeFileSync(notifyPath, generateNotifyScript(), { mode: 0o755 });
    created.push("ai-agents/tools/notify.sh");
  }

  // --- Optional: PMO scan script ---
  if (scheduler.enabled) {
    const scanScriptPath = join(aiAgentsPath, "tools", "pmo-scan.sh");
    writeFileSync(scanScriptPath, generatePmoScanScript(projectPath), { mode: 0o755 });
    created.push("ai-agents/tools/pmo-scan.sh");
  }

  return { created, skipped, alreadyExists: false };
}

// ---------- Preview (dry run) ----------

export function previewScaffold(options: ScaffoldOptions): string[] {
  const { projectPath, agents, notifications, scheduler } = options;
  const files: string[] = [];

  // Directories
  files.push("ai-agents/");
  files.push("ai-agents/tools/");
  files.push("ai-agents/memory/");
  files.push("ai-agents/memory/learnings/");
  files.push("ai-agents/memory/corrections/");
  files.push("ai-agents/memory/decisions/");
  files.push("ai-agents/memory/human-inputs/");
  files.push("ai-agents/sprints/");
  files.push("ai-agents/sprints/handoffs/");
  files.push("ai-agents/sprints/archive/");
  files.push("ai-agents/agents/");
  files.push("ai-agents/context/");
  files.push(".claude/agents/");

  // Agent files
  for (const agent of agents) {
    files.push(`ai-agents/agents/${agent}/agent.md`);
    files.push(`.claude/agents/${agent}.md`);
  }

  // Core files
  files.push("ai-agents/README.md");
  files.push("ai-agents/tools/memory_index.json");
  files.push("ai-agents/sprints/current.md");
  files.push("ai-agents/sprints/scan_log.md");
  files.push("ai-agents/sprints/handoffs/.gitkeep");
  files.push("ai-agents/sprints/archive/.gitkeep");
  files.push("ai-agents/context/.gitkeep");

  if (notifications.telegram) {
    files.push("ai-agents/tools/notify.sh");
  }

  if (scheduler.enabled) {
    files.push("ai-agents/tools/pmo-scan.sh");
  }

  return files;
}

// ---------- Helpers ----------

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function relative(base: string, target: string): string {
  if (target.startsWith(base)) {
    const rel = target.slice(base.length);
    return rel.startsWith("/") ? rel.slice(1) : rel;
  }
  return target;
}
