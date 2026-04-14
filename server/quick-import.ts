// ---------- Quick Import: Template-based single agent generator ----------
//
// Generates ONE well-configured agent .md file for a project based on its
// detected stack. No LLM call -- purely template-driven, completes in <1s.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ProjectProfile } from "./project-analyzer.js";

// ---------- Types ----------

export interface QuickImportAgent {
  id: string;
  name: string;
  description: string;
  path: string;
}

export interface QuickImportResult {
  agent: QuickImportAgent;
  claudeMdPath: string;
  profile: {
    name: string;
    languages: string[];
    frameworks: string[];
    packageManager: string;
    hasTests: boolean;
    hasDocker: boolean;
    database?: string;
  };
}

// ---------- Stack-to-agent mapping ----------

interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  tools: string[];
  rules: string[];
  domainKnowledge: string[];
}

function resolveAgentTemplate(profile: ProjectProfile): AgentTemplate {
  const langs = profile.languages.map((l) => l.toLowerCase());
  const fws = profile.frameworks.map((f) => f.toLowerCase());

  // Next.js / React
  if (fws.some((f) => f.includes("next"))) {
    return {
      id: "nextjs-dev",
      name: "Next.js Developer",
      description: `Full-stack Next.js developer for ${profile.name}`,
      tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep"],
      rules: [
        "Use the App Router pattern (app/ directory) unless the project uses Pages Router",
        "Prefer Server Components by default; add 'use client' only when needed",
        "Use TypeScript strict mode for all new files",
        `Use ${profile.packageManager} as the package manager`,
        profile.styling
          ? `Follow ${profile.styling} conventions for styling`
          : "Use Tailwind CSS utility classes for styling",
        profile.stateManagement
          ? `Use ${profile.stateManagement} for client state management`
          : "Keep state close to where it is used",
        profile.database ? `Database: ${profile.database}` : "No database detected",
        profile.testFramework
          ? `Run tests with ${profile.testFramework} before committing`
          : "Write tests for new features",
      ],
      domainKnowledge: [
        `Project: ${profile.name}`,
        `Languages: ${profile.languages.join(", ")}`,
        `Frameworks: ${profile.frameworks.join(", ")}`,
        `Package manager: ${profile.packageManager}`,
        `Key files: ${profile.keyFiles.slice(0, 10).join(", ")}`,
        `Structure: ${profile.projectStructure.join(", ")}`,
      ],
    };
  }

  // React (non-Next)
  if (fws.some((f) => f === "react" || f === "react native" || f === "expo")) {
    const isNative = fws.some((f) => f.includes("native") || f.includes("expo"));
    return {
      id: isNative ? "react-native-dev" : "react-dev",
      name: isNative ? "React Native Developer" : "React Developer",
      description: `${isNative ? "React Native" : "React"} developer for ${profile.name}`,
      tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep"],
      rules: [
        "Use functional components with hooks",
        "Follow the existing component structure and naming conventions",
        `Use ${profile.packageManager} as the package manager`,
        profile.styling
          ? `Follow ${profile.styling} conventions`
          : "Match existing styling approach",
        profile.stateManagement
          ? `Use ${profile.stateManagement} for state management`
          : "Keep state local unless shared across components",
        profile.testFramework
          ? `Run tests with ${profile.testFramework}`
          : "Write tests for new features",
      ],
      domainKnowledge: [
        `Project: ${profile.name}`,
        `Languages: ${profile.languages.join(", ")}`,
        `Frameworks: ${profile.frameworks.join(", ")}`,
        `Package manager: ${profile.packageManager}`,
        `Structure: ${profile.projectStructure.join(", ")}`,
      ],
    };
  }

  // Vue / Nuxt
  if (fws.some((f) => f.includes("vue") || f.includes("nuxt"))) {
    const isNuxt = fws.some((f) => f.includes("nuxt"));
    return {
      id: isNuxt ? "nuxt-dev" : "vue-dev",
      name: isNuxt ? "Nuxt Developer" : "Vue Developer",
      description: `${isNuxt ? "Nuxt" : "Vue"} developer for ${profile.name}`,
      tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep"],
      rules: [
        "Use Composition API with <script setup>",
        `Use ${profile.packageManager} as the package manager`,
        profile.styling
          ? `Follow ${profile.styling} conventions`
          : "Match existing styling approach",
        profile.testFramework
          ? `Run tests with ${profile.testFramework}`
          : "Write tests for new features",
      ],
      domainKnowledge: [
        `Project: ${profile.name}`,
        `Languages: ${profile.languages.join(", ")}`,
        `Frameworks: ${profile.frameworks.join(", ")}`,
        `Structure: ${profile.projectStructure.join(", ")}`,
      ],
    };
  }

  // SvelteKit
  if (fws.some((f) => f.includes("svelte"))) {
    return {
      id: "svelte-dev",
      name: "SvelteKit Developer",
      description: `SvelteKit developer for ${profile.name}`,
      tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep"],
      rules: [
        "Use SvelteKit routing conventions",
        `Use ${profile.packageManager} as the package manager`,
        profile.testFramework
          ? `Run tests with ${profile.testFramework}`
          : "Write tests for new features",
      ],
      domainKnowledge: [
        `Project: ${profile.name}`,
        `Frameworks: ${profile.frameworks.join(", ")}`,
        `Structure: ${profile.projectStructure.join(", ")}`,
      ],
    };
  }

  // Python: Django
  if (fws.some((f) => f.includes("django"))) {
    return {
      id: "django-dev",
      name: "Django Developer",
      description: `Django developer for ${profile.name}`,
      tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep"],
      rules: [
        "Follow Django conventions (apps, models, views, serializers)",
        "Use Django ORM for database access -- no raw SQL unless necessary",
        "Write migrations for model changes",
        `Use ${profile.packageManager} as the package manager`,
        profile.database
          ? `Database: ${profile.database}`
          : "Check settings.py for database config",
        profile.testFramework
          ? `Run tests with ${profile.testFramework}`
          : "Write tests using Django TestCase",
      ],
      domainKnowledge: [
        `Project: ${profile.name}`,
        `Languages: ${profile.languages.join(", ")}`,
        `Frameworks: ${profile.frameworks.join(", ")}`,
        `Structure: ${profile.projectStructure.join(", ")}`,
      ],
    };
  }

  // Python: FastAPI
  if (fws.some((f) => f.includes("fastapi"))) {
    return {
      id: "fastapi-dev",
      name: "FastAPI Developer",
      description: `FastAPI developer for ${profile.name}`,
      tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep"],
      rules: [
        "Use Pydantic models for request/response validation",
        "Use dependency injection for shared services",
        "Add type annotations to all function signatures",
        `Use ${profile.packageManager} as the package manager`,
        profile.database ? `Database: ${profile.database}` : "Check for database configuration",
        profile.testFramework
          ? `Run tests with ${profile.testFramework}`
          : "Write tests using pytest",
      ],
      domainKnowledge: [
        `Project: ${profile.name}`,
        `Languages: ${profile.languages.join(", ")}`,
        `Frameworks: ${profile.frameworks.join(", ")}`,
        `Structure: ${profile.projectStructure.join(", ")}`,
      ],
    };
  }

  // Python: Flask
  if (fws.some((f) => f.includes("flask"))) {
    return {
      id: "flask-dev",
      name: "Flask Developer",
      description: `Flask developer for ${profile.name}`,
      tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep"],
      rules: [
        "Follow Flask application factory pattern if used",
        `Use ${profile.packageManager} as the package manager`,
        profile.testFramework
          ? `Run tests with ${profile.testFramework}`
          : "Write tests using pytest",
      ],
      domainKnowledge: [
        `Project: ${profile.name}`,
        `Languages: ${profile.languages.join(", ")}`,
        `Frameworks: ${profile.frameworks.join(", ")}`,
        `Structure: ${profile.projectStructure.join(", ")}`,
      ],
    };
  }

  // Generic Python
  if (langs.includes("python")) {
    return {
      id: "python-dev",
      name: "Python Developer",
      description: `Python developer for ${profile.name}`,
      tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep"],
      rules: [
        "Follow PEP 8 style guidelines",
        "Add type annotations to all function signatures",
        `Use ${profile.packageManager} as the package manager`,
        profile.testFramework
          ? `Run tests with ${profile.testFramework}`
          : "Write tests using pytest",
      ],
      domainKnowledge: [
        `Project: ${profile.name}`,
        `Languages: ${profile.languages.join(", ")}`,
        `Frameworks: ${profile.frameworks.join(", ")}`,
        `Structure: ${profile.projectStructure.join(", ")}`,
      ],
    };
  }

  // Go
  if (langs.includes("go")) {
    const goFw = profile.frameworks.find((f) =>
      ["gin", "fiber", "echo", "chi"].some((g) => f.toLowerCase().includes(g)),
    );
    return {
      id: "go-dev",
      name: "Go Developer",
      description: `Go developer for ${profile.name}`,
      tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep"],
      rules: [
        "Follow standard Go project layout conventions",
        "Use go fmt and go vet before committing",
        "Handle all errors explicitly -- do not use _ for error returns",
        goFw ? `Use ${goFw} framework conventions` : "Follow standard net/http patterns",
        profile.database ? `Database: ${profile.database}` : "Check go.mod for database drivers",
        "Write table-driven tests",
      ],
      domainKnowledge: [
        `Project: ${profile.name}`,
        `Languages: ${profile.languages.join(", ")}`,
        `Frameworks: ${profile.frameworks.join(", ")}`,
        `Structure: ${profile.projectStructure.join(", ")}`,
      ],
    };
  }

  // Rust
  if (langs.includes("rust")) {
    return {
      id: "rust-dev",
      name: "Rust Developer",
      description: `Rust developer for ${profile.name}`,
      tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep"],
      rules: [
        "Run cargo clippy and cargo fmt before committing",
        "Use Result<T, E> for error handling -- avoid unwrap() in production code",
        "Follow Rust API Guidelines for public APIs",
        profile.frameworks.length > 0
          ? `Frameworks: ${profile.frameworks.join(", ")}`
          : "Check Cargo.toml for framework details",
      ],
      domainKnowledge: [
        `Project: ${profile.name}`,
        `Languages: ${profile.languages.join(", ")}`,
        `Frameworks: ${profile.frameworks.join(", ")}`,
        `Structure: ${profile.projectStructure.join(", ")}`,
      ],
    };
  }

  // Java / Kotlin / Spring
  if (langs.includes("java") || langs.includes("kotlin")) {
    const isSpring = fws.some((f) => f.includes("spring"));
    return {
      id: isSpring ? "spring-dev" : langs.includes("kotlin") ? "kotlin-dev" : "java-dev",
      name: isSpring
        ? "Spring Boot Developer"
        : langs.includes("kotlin")
          ? "Kotlin Developer"
          : "Java Developer",
      description: `${isSpring ? "Spring Boot" : langs.includes("kotlin") ? "Kotlin" : "Java"} developer for ${profile.name}`,
      tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep"],
      rules: [
        `Use ${profile.packageManager} as the build tool`,
        isSpring
          ? "Follow Spring Boot conventions (controllers, services, repositories)"
          : "Follow standard project conventions",
        "Write unit tests for new code",
      ],
      domainKnowledge: [
        `Project: ${profile.name}`,
        `Languages: ${profile.languages.join(", ")}`,
        `Frameworks: ${profile.frameworks.join(", ")}`,
        `Structure: ${profile.projectStructure.join(", ")}`,
      ],
    };
  }

  // Ruby / Rails
  if (langs.includes("ruby")) {
    const isRails = fws.some((f) => f.includes("rails"));
    return {
      id: isRails ? "rails-dev" : "ruby-dev",
      name: isRails ? "Rails Developer" : "Ruby Developer",
      description: `${isRails ? "Ruby on Rails" : "Ruby"} developer for ${profile.name}`,
      tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep"],
      rules: [
        isRails
          ? "Follow Rails conventions (MVC, REST routes, ActiveRecord)"
          : "Follow Ruby style guide",
        `Use ${profile.packageManager} as the package manager`,
        profile.testFramework
          ? `Run tests with ${profile.testFramework}`
          : "Write tests using RSpec or Minitest",
      ],
      domainKnowledge: [
        `Project: ${profile.name}`,
        `Languages: ${profile.languages.join(", ")}`,
        `Frameworks: ${profile.frameworks.join(", ")}`,
        `Structure: ${profile.projectStructure.join(", ")}`,
      ],
    };
  }

  // TypeScript / JavaScript (generic -- Node, Express, etc.)
  if (langs.includes("typescript") || langs.includes("javascript")) {
    const hasExpress = fws.some((f) => f.includes("express"));
    const hasFastify = fws.some((f) => f.includes("fastify"));
    const hasNest = fws.some((f) => f.includes("nest"));
    const serverFw = hasNest ? "NestJS" : hasExpress ? "Express" : hasFastify ? "Fastify" : null;
    return {
      id: serverFw ? `${serverFw.toLowerCase().replace(/[^a-z]/g, "")}-dev` : "ts-dev",
      name: serverFw ? `${serverFw} Developer` : "TypeScript Developer",
      description: `${serverFw ?? "TypeScript"} developer for ${profile.name}`,
      tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep"],
      rules: [
        langs.includes("typescript")
          ? "Use TypeScript strict mode for all new files"
          : "Use JSDoc types where possible",
        `Use ${profile.packageManager} as the package manager`,
        serverFw
          ? `Follow ${serverFw} patterns and conventions`
          : "Follow existing project conventions",
        profile.testFramework
          ? `Run tests with ${profile.testFramework}`
          : "Write tests for new features",
        profile.database ? `Database: ${profile.database}` : "",
      ].filter(Boolean),
      domainKnowledge: [
        `Project: ${profile.name}`,
        `Languages: ${profile.languages.join(", ")}`,
        `Frameworks: ${profile.frameworks.join(", ")}`,
        `Package manager: ${profile.packageManager}`,
        `Structure: ${profile.projectStructure.join(", ")}`,
      ],
    };
  }

  // Fallback: generic assistant
  return {
    id: "assistant",
    name: "Project Assistant",
    description: `Development assistant for ${profile.name}`,
    tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep"],
    rules: [
      "Read existing code before making changes",
      "Follow the existing code style and conventions",
      "Write tests for new features when a test framework is available",
      profile.packageManager !== "unknown"
        ? `Use ${profile.packageManager} as the package manager`
        : "",
    ].filter(Boolean),
    domainKnowledge: [
      `Project: ${profile.name}`,
      `Languages: ${profile.languages.length > 0 ? profile.languages.join(", ") : "Not detected"}`,
      `Frameworks: ${profile.frameworks.length > 0 ? profile.frameworks.join(", ") : "Not detected"}`,
      `Structure: ${profile.projectStructure.join(", ") || "flat"}`,
    ],
  };
}

// ---------- Agent .md content generator ----------

function generateAgentMd(template: AgentTemplate, profile: ProjectProfile): string {
  const toolsYaml = template.tools.map((t) => `  - ${t}`).join("\n");

  const rulesBlock = template.rules.map((r, i) => `${i + 1}. ${r}`).join("\n");

  const domainBlock = template.domainKnowledge.map((d) => `- ${d}`).join("\n");

  const testSection =
    profile.hasTests && profile.testFramework
      ? `\n## Testing\n\nThis project uses ${profile.testFramework}. Run tests before committing to make sure nothing is broken.\n`
      : "";

  const ciSection =
    profile.hasCI && profile.ciPlatform
      ? `\n## CI/CD\n\nThis project uses ${profile.ciPlatform}. Make sure your changes pass CI checks.\n`
      : "";

  const dockerSection = profile.hasDocker
    ? "\n## Docker\n\nThis project has Docker configuration. Update Dockerfile or docker-compose if your changes affect the build or runtime environment.\n"
    : "";

  return `---
name: ${template.id}
description: ${template.description}
tools:
${toolsYaml}
---

# ${template.name}

You are the ${template.id} agent for **${profile.name}**. ${template.description}.

## ABSOLUTE RULES

1. NEVER run git push -- commit locally, the orchestrator handles pushing
2. NEVER modify files outside the project directory
3. Read existing code before making changes -- understand the patterns first
4. When uncertain, explain your reasoning and ask for confirmation

## ENVIRONMENT

- Project: ${profile.name}
- Path: ${profile.path}
- Languages: ${profile.languages.join(", ") || "Not detected"}
- Frameworks: ${profile.frameworks.join(", ") || "Not detected"}
- Package manager: ${profile.packageManager}

## HOW YOU THINK -- Reasoning Protocol

When you receive a task:

1. **Scope check** -- is this my responsibility?
2. **Existing code check** -- read before modifying
3. **Spec/pattern check** -- follow established conventions
4. **Implement** -- use the project's actual patterns
5. **Self-verify** -- does it compile? does it match conventions?

### Confidence Signals

- "I am certain" = verified in codebase
- "I believe" = reasonable but should verify
- "I need to check" = will read files first

## PROJECT RULES

${rulesBlock}

## DOMAIN KNOWLEDGE

${domainBlock}
${testSection}${ciSection}${dockerSection}
## MEMORY PROTOCOL

Read \`ai-agents/tools/memory_index.json\` before any task.
After significant work, write a memory file to \`ai-agents/memory/\`.

## WHAT TO DO WHEN STUCK

1. Check memory index for similar past issues
2. Re-read the relevant source files for patterns
3. If blocked after 2 attempts, stop and explain the blocker
`;
}

// ---------- Public API ----------

/**
 * Generate a single agent .md file for a project, template-based (no LLM).
 * Returns the agent metadata and the .md content ready to write.
 */
export function generateSingleAgent(profile: ProjectProfile): {
  agent: { id: string; name: string; description: string };
  mdContent: string;
} {
  const template = resolveAgentTemplate(profile);
  const mdContent = generateAgentMd(template, profile);
  return {
    agent: {
      id: template.id,
      name: template.name,
      description: template.description,
    },
    mdContent,
  };
}

/**
 * Write the quick-import agent to disk.
 * Creates .claude/agents/{id}.md in the target project.
 */
export function writeQuickImportAgent(
  projectPath: string,
  agentId: string,
  mdContent: string,
): string {
  const agentsDir = join(projectPath, ".claude", "agents");
  if (!existsSync(agentsDir)) {
    mkdirSync(agentsDir, { recursive: true });
  }
  const filePath = join(agentsDir, `${agentId}.md`);
  writeFileSync(filePath, mdContent, "utf-8");
  return filePath;
}
