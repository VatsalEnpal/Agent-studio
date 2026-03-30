import { execSync } from "node:child_process";
import {
  readFileSync,
  readdirSync,
  statSync,
  existsSync,
} from "node:fs";
import { join, basename, extname } from "node:path";

// ---------- Types ----------

export interface ProjectProfile {
  name: string;
  path: string;
  languages: string[];
  frameworks: string[];
  packageManager: string;
  hasTests: boolean;
  testFramework?: string;
  hasCI: boolean;
  ciPlatform?: string;
  hasDocker: boolean;
  database?: string;
  stateManagement?: string;
  styling?: string;
  apiPattern?: string;
  projectStructure: string[];
  keyFiles: string[];
  existingAgents: string[];
  repoInfo?: {
    remote?: string;
    branch?: string;
    platform?: string;
  };
  readme: string;
  description: string;
}

// ---------- Detection maps ----------

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
  ".lua": "Lua",
  ".r": "R",
  ".R": "R",
  ".zig": "Zig",
  ".nim": "Nim",
  ".ml": "OCaml",
  ".hs": "Haskell",
  ".clj": "Clojure",
  ".erl": "Erlang",
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
  ".svelte-kit",
  ".nuxt",
  ".output",
  ".vercel",
  ".netlify",
]);

const KEY_CONFIG_FILES = [
  "package.json",
  "tsconfig.json",
  "pyproject.toml",
  "requirements.txt",
  "go.mod",
  "Cargo.toml",
  "Gemfile",
  "composer.json",
  "build.gradle",
  "pom.xml",
  "Makefile",
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  ".env.example",
  ".env.local",
  "tailwind.config.ts",
  "tailwind.config.js",
  "next.config.ts",
  "next.config.js",
  "next.config.mjs",
  "vite.config.ts",
  "vite.config.js",
  "webpack.config.js",
  "rollup.config.js",
  "esbuild.config.js",
  "prisma/schema.prisma",
  "drizzle.config.ts",
  ".eslintrc.js",
  ".eslintrc.json",
  "eslint.config.js",
  "eslint.config.mjs",
  ".prettierrc",
  "jest.config.ts",
  "jest.config.js",
  "vitest.config.ts",
  "playwright.config.ts",
  "cypress.config.ts",
  "CLAUDE.md",
  ".claude/agents",
  "supabase/config.toml",
  "firebase.json",
  "serverless.yml",
  "terraform/main.tf",
  "pulumi/Pulumi.yaml",
  "k8s/",
  "helm/",
];

// ---------- Main analyzer ----------

export function analyzeProject(projectPath: string): ProjectProfile {
  const name = basename(projectPath);
  const languages = new Set<string>();
  const frameworks: string[] = [];
  const keyFiles: string[] = [];
  let hasTests = false;
  let testFramework: string | undefined;
  let hasCI = false;
  let ciPlatform: string | undefined;
  let hasDocker = false;
  let packageManager = "unknown";
  let database: string | undefined;
  let stateManagement: string | undefined;
  let styling: string | undefined;
  let apiPattern: string | undefined;
  let readme = "";
  let description = "";

  // Collect key config files that exist
  for (const kf of KEY_CONFIG_FILES) {
    const fullPath = join(projectPath, kf);
    if (existsSync(fullPath)) {
      keyFiles.push(kf);
    }
  }

  // ---------- package.json detection ----------
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
      const allDeps: Record<string, string> = {
        ...((pkg.dependencies as Record<string, string>) ?? {}),
        ...((pkg.devDependencies as Record<string, string>) ?? {}),
      };

      // Frameworks
      if (allDeps["next"]) frameworks.push("Next.js");
      if (allDeps["react"]) frameworks.push("React");
      if (allDeps["react-native"]) frameworks.push("React Native");
      if (allDeps["expo"]) frameworks.push("Expo");
      if (allDeps["vue"]) frameworks.push("Vue");
      if (allDeps["nuxt"]) frameworks.push("Nuxt");
      if (allDeps["svelte"] || allDeps["@sveltejs/kit"]) frameworks.push("SvelteKit");
      if (allDeps["angular"] || allDeps["@angular/core"]) frameworks.push("Angular");
      if (allDeps["express"]) frameworks.push("Express");
      if (allDeps["fastify"]) frameworks.push("Fastify");
      if (allDeps["hono"]) frameworks.push("Hono");
      if (allDeps["nest"] || allDeps["@nestjs/core"]) frameworks.push("NestJS");
      if (allDeps["electron"]) frameworks.push("Electron");
      if (allDeps["tauri"] || allDeps["@tauri-apps/api"]) frameworks.push("Tauri");
      if (allDeps["astro"]) frameworks.push("Astro");
      if (allDeps["remix"] || allDeps["@remix-run/react"]) frameworks.push("Remix");
      if (allDeps["gatsby"]) frameworks.push("Gatsby");
      if (allDeps["solid-js"]) frameworks.push("SolidJS");
      if (allDeps["qwik"] || allDeps["@builder.io/qwik"]) frameworks.push("Qwik");

      // Database / ORM
      if (allDeps["prisma"] || allDeps["@prisma/client"]) { frameworks.push("Prisma"); database = database ?? "PostgreSQL (Prisma)"; }
      if (allDeps["drizzle-orm"]) { frameworks.push("Drizzle"); database = database ?? "PostgreSQL (Drizzle)"; }
      if (allDeps["typeorm"]) { frameworks.push("TypeORM"); database = database ?? "SQL (TypeORM)"; }
      if (allDeps["mongoose"]) { database = database ?? "MongoDB"; }
      if (allDeps["@supabase/supabase-js"]) { frameworks.push("Supabase"); database = database ?? "Supabase (PostgreSQL)"; }
      if (allDeps["firebase"] || allDeps["firebase-admin"]) { frameworks.push("Firebase"); database = database ?? "Firebase"; }
      if (allDeps["@planetscale/database"]) { database = database ?? "PlanetScale (MySQL)"; }
      if (allDeps["redis"] || allDeps["ioredis"]) { database = (database ? database + " + Redis" : "Redis"); }
      if (allDeps["pg"] || allDeps["postgres"]) { database = database ?? "PostgreSQL"; }
      if (allDeps["mysql2"]) { database = database ?? "MySQL"; }
      if (allDeps["better-sqlite3"]) { database = database ?? "SQLite"; }

      // State management
      if (allDeps["zustand"]) stateManagement = "Zustand";
      if (allDeps["redux"] || allDeps["@reduxjs/toolkit"]) stateManagement = "Redux";
      if (allDeps["mobx"]) stateManagement = "MobX";
      if (allDeps["jotai"]) stateManagement = "Jotai";
      if (allDeps["recoil"]) stateManagement = "Recoil";
      if (allDeps["valtio"]) stateManagement = "Valtio";
      if (allDeps["pinia"]) stateManagement = "Pinia";
      if (allDeps["@tanstack/react-query"]) stateManagement = (stateManagement ? stateManagement + " + TanStack Query" : "TanStack Query");

      // Styling
      if (allDeps["tailwindcss"]) { frameworks.push("Tailwind CSS"); styling = "Tailwind CSS"; }
      if (allDeps["styled-components"]) styling = styling ?? "styled-components";
      if (allDeps["@emotion/react"]) styling = styling ?? "Emotion";
      if (allDeps["sass"]) styling = styling ?? "Sass";
      if (allDeps["@mui/material"]) { frameworks.push("Material UI"); styling = styling ?? "Material UI"; }
      if (allDeps["@chakra-ui/react"]) { frameworks.push("Chakra UI"); styling = styling ?? "Chakra UI"; }
      if (allDeps["@mantine/core"]) { frameworks.push("Mantine"); styling = styling ?? "Mantine"; }
      if (allDeps["shadcn-ui"] || allDeps["@radix-ui/react-dialog"]) styling = styling ?? "shadcn/ui";

      // API pattern
      if (allDeps["@trpc/server"] || allDeps["@trpc/client"]) apiPattern = "tRPC";
      if (allDeps["graphql"] || allDeps["@apollo/client"] || allDeps["urql"]) apiPattern = apiPattern ?? "GraphQL";
      if (allDeps["@tanstack/react-query"] && !apiPattern) apiPattern = "REST (TanStack Query)";
      if (allDeps["axios"] || allDeps["ky"] || allDeps["got"]) apiPattern = apiPattern ?? "REST";
      if (allDeps["socket.io"] || allDeps["ws"]) apiPattern = (apiPattern ? apiPattern + " + WebSocket" : "WebSocket");

      // Testing
      if (allDeps["vitest"]) { hasTests = true; testFramework = "Vitest"; }
      if (allDeps["jest"]) { hasTests = true; testFramework = testFramework ?? "Jest"; }
      if (allDeps["@playwright/test"]) { hasTests = true; testFramework = testFramework ? testFramework + " + Playwright" : "Playwright"; }
      if (allDeps["cypress"]) { hasTests = true; testFramework = testFramework ? testFramework + " + Cypress" : "Cypress"; }
      if (allDeps["mocha"]) { hasTests = true; testFramework = testFramework ?? "Mocha"; }
      if (allDeps["@testing-library/react"]) { hasTests = true; testFramework = testFramework ? testFramework + " + Testing Library" : "Testing Library"; }

      if (pkg.description) description = String(pkg.description);
    } catch {
      // Ignore parse errors
    }
  }

  // ---------- Python detection ----------
  if (existsSync(join(projectPath, "requirements.txt")) || existsSync(join(projectPath, "pyproject.toml"))) {
    if (packageManager === "unknown") packageManager = "pip";
    try {
      const pyContent = existsSync(join(projectPath, "pyproject.toml"))
        ? readFileSync(join(projectPath, "pyproject.toml"), "utf-8")
        : existsSync(join(projectPath, "requirements.txt"))
          ? readFileSync(join(projectPath, "requirements.txt"), "utf-8")
          : "";
      if (pyContent.includes("django")) frameworks.push("Django");
      if (pyContent.includes("fastapi")) frameworks.push("FastAPI");
      if (pyContent.includes("flask")) frameworks.push("Flask");
      if (pyContent.includes("starlette")) frameworks.push("Starlette");
      if (pyContent.includes("celery")) frameworks.push("Celery");
      if (pyContent.includes("airflow")) frameworks.push("Airflow");
      if (pyContent.includes("dbt")) frameworks.push("dbt");
      if (pyContent.includes("pandas") || pyContent.includes("numpy")) frameworks.push("Data Science (pandas/numpy)");
      if (pyContent.includes("pytorch") || pyContent.includes("torch")) frameworks.push("PyTorch");
      if (pyContent.includes("tensorflow")) frameworks.push("TensorFlow");
      if (pyContent.includes("langchain")) frameworks.push("LangChain");
      if (pyContent.includes("sqlalchemy")) { database = database ?? "SQL (SQLAlchemy)"; }
      if (pyContent.includes("psycopg")) { database = database ?? "PostgreSQL"; }
      if (pyContent.includes("pymongo")) { database = database ?? "MongoDB"; }
      if (pyContent.includes("pytest")) { hasTests = true; testFramework = testFramework ?? "pytest"; }
      if (pyContent.includes("unittest")) { hasTests = true; testFramework = testFramework ?? "unittest"; }

      // Check for poetry
      if (existsSync(join(projectPath, "poetry.lock"))) packageManager = "poetry";
      if (existsSync(join(projectPath, "pdm.lock"))) packageManager = "pdm";
      if (existsSync(join(projectPath, "uv.lock"))) packageManager = "uv";
    } catch {
      // Ignore
    }
  }

  // ---------- Go detection ----------
  if (existsSync(join(projectPath, "go.mod"))) {
    if (packageManager === "unknown") packageManager = "go modules";
    try {
      const gomod = readFileSync(join(projectPath, "go.mod"), "utf-8");
      if (gomod.includes("gin-gonic")) frameworks.push("Gin");
      if (gomod.includes("fiber")) frameworks.push("Fiber");
      if (gomod.includes("echo")) frameworks.push("Echo");
      if (gomod.includes("chi")) frameworks.push("Chi");
      if (gomod.includes("grpc")) { frameworks.push("gRPC"); apiPattern = apiPattern ?? "gRPC"; }
      if (gomod.includes("ent")) frameworks.push("Ent ORM");
      if (gomod.includes("sqlx") || gomod.includes("pgx")) database = database ?? "PostgreSQL";
      if (gomod.includes("mongo-driver")) database = database ?? "MongoDB";
    } catch {
      // Ignore
    }
  }

  // ---------- Rust detection ----------
  if (existsSync(join(projectPath, "Cargo.toml"))) {
    if (packageManager === "unknown") packageManager = "cargo";
    try {
      const cargo = readFileSync(join(projectPath, "Cargo.toml"), "utf-8");
      if (cargo.includes("actix")) frameworks.push("Actix");
      if (cargo.includes("axum")) frameworks.push("Axum");
      if (cargo.includes("rocket")) frameworks.push("Rocket");
      if (cargo.includes("tokio")) frameworks.push("Tokio");
      if (cargo.includes("diesel")) { frameworks.push("Diesel ORM"); database = database ?? "PostgreSQL"; }
      if (cargo.includes("sqlx")) database = database ?? "PostgreSQL";
      if (cargo.includes("tonic")) { frameworks.push("Tonic (gRPC)"); apiPattern = apiPattern ?? "gRPC"; }
    } catch {
      // Ignore
    }
  }

  // ---------- Ruby detection ----------
  if (existsSync(join(projectPath, "Gemfile"))) {
    if (packageManager === "unknown") packageManager = "bundler";
    try {
      const gemfile = readFileSync(join(projectPath, "Gemfile"), "utf-8");
      if (gemfile.includes("rails")) frameworks.push("Ruby on Rails");
      if (gemfile.includes("sinatra")) frameworks.push("Sinatra");
      if (gemfile.includes("rspec")) { hasTests = true; testFramework = testFramework ?? "RSpec"; }
    } catch {
      // Ignore
    }
  }

  // ---------- Java/Kotlin detection ----------
  if (existsSync(join(projectPath, "build.gradle")) || existsSync(join(projectPath, "build.gradle.kts")) || existsSync(join(projectPath, "pom.xml"))) {
    if (packageManager === "unknown") {
      packageManager = existsSync(join(projectPath, "pom.xml")) ? "maven" : "gradle";
    }
    try {
      const buildFile = existsSync(join(projectPath, "build.gradle"))
        ? readFileSync(join(projectPath, "build.gradle"), "utf-8")
        : existsSync(join(projectPath, "build.gradle.kts"))
          ? readFileSync(join(projectPath, "build.gradle.kts"), "utf-8")
          : existsSync(join(projectPath, "pom.xml"))
            ? readFileSync(join(projectPath, "pom.xml"), "utf-8")
            : "";
      if (buildFile.includes("spring")) frameworks.push("Spring Boot");
      if (buildFile.includes("android")) frameworks.push("Android");
      if (buildFile.includes("ktor")) frameworks.push("Ktor");
    } catch {
      // Ignore
    }
  }

  // ---------- CI detection ----------
  if (existsSync(join(projectPath, ".github", "workflows"))) {
    hasCI = true;
    ciPlatform = "GitHub Actions";
  } else if (existsSync(join(projectPath, ".gitlab-ci.yml"))) {
    hasCI = true;
    ciPlatform = "GitLab CI";
  } else if (existsSync(join(projectPath, "azure-pipelines.yml"))) {
    hasCI = true;
    ciPlatform = "Azure Pipelines";
  } else if (existsSync(join(projectPath, ".circleci"))) {
    hasCI = true;
    ciPlatform = "CircleCI";
  } else if (existsSync(join(projectPath, "Jenkinsfile"))) {
    hasCI = true;
    ciPlatform = "Jenkins";
  } else if (existsSync(join(projectPath, "bitbucket-pipelines.yml"))) {
    hasCI = true;
    ciPlatform = "Bitbucket Pipelines";
  }

  // ---------- Docker detection ----------
  hasDocker =
    existsSync(join(projectPath, "Dockerfile")) ||
    existsSync(join(projectPath, "docker-compose.yml")) ||
    existsSync(join(projectPath, "docker-compose.yaml"));

  // ---------- Test directory detection (fallback) ----------
  if (!hasTests) {
    hasTests =
      existsSync(join(projectPath, "tests")) ||
      existsSync(join(projectPath, "test")) ||
      existsSync(join(projectPath, "__tests__")) ||
      existsSync(join(projectPath, "spec")) ||
      existsSync(join(projectPath, "e2e"));
  }

  // ---------- Existing agents detection ----------
  const existingAgents: string[] = [];
  const claudeAgentsDir = join(projectPath, ".claude", "agents");
  if (existsSync(claudeAgentsDir)) {
    try {
      const agentFiles = readdirSync(claudeAgentsDir).filter((f) => f.endsWith(".md"));
      for (const f of agentFiles) {
        existingAgents.push(basename(f, ".md"));
      }
    } catch {
      // Ignore
    }
  }

  // ---------- Git repo info ----------
  let repoInfo: ProjectProfile["repoInfo"];
  try {
    const remote = execSync("git remote get-url origin", {
      cwd: projectPath,
      encoding: "utf-8",
      timeout: 5000,
    }).trim();

    const branch = execSync("git branch --show-current", {
      cwd: projectPath,
      encoding: "utf-8",
      timeout: 5000,
    }).trim();

    let platform: string | undefined;
    if (remote.includes("github.com")) platform = "GitHub";
    else if (remote.includes("gitlab.com") || remote.includes("gitlab")) platform = "GitLab";
    else if (remote.includes("dev.azure.com") || remote.includes("visualstudio.com")) platform = "Azure DevOps";
    else if (remote.includes("bitbucket.org")) platform = "Bitbucket";

    repoInfo = { remote, branch, platform };
  } catch {
    // Not a git repo or git not available
  }

  // ---------- Language scanning ----------
  scanLanguages(projectPath, languages, 4);

  // ---------- Project structure (top-level dirs) ----------
  const projectStructure: string[] = [];
  try {
    const entries = readdirSync(projectPath);
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry) || entry.startsWith(".")) continue;
      const fullPath = join(projectPath, entry);
      try {
        if (statSync(fullPath).isDirectory()) {
          projectStructure.push(entry + "/");
        }
      } catch {
        // Skip
      }
    }
  } catch {
    // Ignore
  }

  // ---------- README ----------
  const readmeFiles = ["README.md", "readme.md", "README.rst", "README.txt", "README"];
  for (const rf of readmeFiles) {
    const rp = join(projectPath, rf);
    if (existsSync(rp)) {
      try {
        readme = readFileSync(rp, "utf-8").slice(0, 2000);
      } catch {
        // Ignore
      }
      break;
    }
  }

  return {
    name,
    path: projectPath,
    languages: [...languages],
    frameworks: [...new Set(frameworks)],
    packageManager,
    hasTests,
    testFramework,
    hasCI,
    ciPlatform,
    hasDocker,
    database,
    stateManagement,
    styling,
    apiPattern,
    projectStructure,
    keyFiles,
    existingAgents,
    repoInfo,
    readme,
    description,
  };
}

// ---------- Helpers ----------

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
