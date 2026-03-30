// ---------- CLAUDE.md Generator ----------
//
// Generates a CLAUDE.md project instructions file based on
// project analysis and generated agents.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ProjectAnalysis, GeneratedAgent } from "./agent-generator.js";

interface ClaudeMdOptions {
  analysis: ProjectAnalysis;
  agents: GeneratedAgent[];
  projectPath: string;
  /** If true, won't overwrite an existing CLAUDE.md */
  preserveExisting?: boolean;
}

/**
 * Generate CLAUDE.md content from project analysis and agents.
 */
export function generateClaudeMd(options: ClaudeMdOptions): string {
  const { analysis, agents, projectPath } = options;

  const agentTable = agents.length > 0
    ? agents
        .map((a) => `| **${a.id}** | ${a.description} | ${a.model} |`)
        .join("\n")
    : "| (none configured) | Run setup wizard to generate agents | - |";

  const languageList = analysis.languages.length > 0
    ? analysis.languages.join(", ")
    : "Not detected";

  const frameworkList = analysis.frameworks.length > 0
    ? analysis.frameworks.join(", ")
    : "Not detected";

  const codeStyleSection = detectCodeStyle(projectPath);

  return `# ${analysis.name} — Claude Code Instructions

## Project Overview

${analysis.description || `A ${frameworkList} project.`}

- **Languages**: ${languageList}
- **Frameworks**: ${frameworkList}
- **Package Manager**: ${analysis.packageManager || "Not detected"}
- **Tests**: ${analysis.hasTests ? "Configured" : "Not configured"}
- **CI/CD**: ${analysis.hasCI ? "Configured" : "Not configured"}
- **Docker**: ${analysis.hasDocker ? "Yes" : "No"}

## Agent System

This project uses a multi-agent architecture managed by Agent Studio.
Agents are defined in \`.claude/agents/\`.

### Available Agents

| Agent | Description | Model |
|-------|-------------|-------|
${agentTable}

## Core Rules

- Follow the reasoning protocol in each agent's .md file
- Never commit secrets, API keys, or credentials
- Run the type checker before committing (\`npx tsc --noEmit\` or equivalent)
- All agents report completion to the orchestrator
- Test changes before marking tasks complete

## Memory Protocol

After completing any significant task, write a memory file:

| What happened | Folder |
|---------------|--------|
| Discovered a pattern | \`ai-agents/memory/learnings/\` |
| Fixed a bug | \`ai-agents/memory/corrections/\` |
| Made a decision | \`ai-agents/memory/decisions/\` |

File format: \`YYYYMMDD_HHMMSS_{agent}_{type}.json\`

${codeStyleSection}
## Project Structure

\`\`\`
${analysis.projectStructure?.join("\n") || "Run project analysis to detect structure"}
\`\`\`
`;
}

/**
 * Write CLAUDE.md to the project root.
 * Returns the path written and whether it was a new file or update.
 */
export function writeClaudeMd(options: ClaudeMdOptions): {
  path: string;
  created: boolean;
  skipped: boolean;
} {
  const filePath = join(options.projectPath, "CLAUDE.md");
  const exists = existsSync(filePath);

  if (exists && options.preserveExisting) {
    return { path: filePath, created: false, skipped: true };
  }

  const content = generateClaudeMd(options);
  writeFileSync(filePath, content, "utf-8");

  return { path: filePath, created: !exists, skipped: false };
}

// ---------- Helpers ----------

/**
 * Detect code style configuration from project files.
 */
function detectCodeStyle(projectPath: string): string {
  const sections: string[] = ["## Code Style\n"];
  let hasAnyConfig = false;

  // Check for ESLint
  const eslintFiles = [
    ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json", ".eslintrc.yml",
    "eslint.config.js", "eslint.config.mjs", "eslint.config.ts",
  ];
  for (const f of eslintFiles) {
    if (existsSync(join(projectPath, f))) {
      sections.push(`- **ESLint**: Configured (\`${f}\`) — run \`npx eslint .\` to check`);
      hasAnyConfig = true;
      break;
    }
  }

  // Check for Prettier
  const prettierFiles = [
    ".prettierrc", ".prettierrc.js", ".prettierrc.json", ".prettierrc.yml",
    "prettier.config.js", "prettier.config.mjs",
  ];
  for (const f of prettierFiles) {
    if (existsSync(join(projectPath, f))) {
      sections.push(`- **Prettier**: Configured (\`${f}\`) — run \`npx prettier --check .\` to verify`);
      hasAnyConfig = true;
      break;
    }
  }

  // Check for EditorConfig
  if (existsSync(join(projectPath, ".editorconfig"))) {
    sections.push("- **EditorConfig**: Present — IDE should respect indentation and line endings");
    hasAnyConfig = true;
  }

  // Check for TypeScript
  if (existsSync(join(projectPath, "tsconfig.json"))) {
    try {
      const raw = readFileSync(join(projectPath, "tsconfig.json"), "utf-8");
      const tsconfig = JSON.parse(raw) as { compilerOptions?: { strict?: boolean } };
      const strict = tsconfig.compilerOptions?.strict ? "strict mode enabled" : "strict mode not enabled";
      sections.push(`- **TypeScript**: Configured (\`tsconfig.json\`, ${strict})`);
      hasAnyConfig = true;
    } catch {
      sections.push("- **TypeScript**: Configured (`tsconfig.json`)");
      hasAnyConfig = true;
    }
  }

  if (!hasAnyConfig) {
    sections.push("No linter or formatter configuration detected. Consider adding ESLint and Prettier.");
  }

  return sections.join("\n") + "\n";
}
