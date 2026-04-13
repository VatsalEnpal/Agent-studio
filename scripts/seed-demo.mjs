#!/usr/bin/env node
/**
 * Demo Seed Script — Populates Agent Studio with realistic fake data.
 *
 * Creates:
 *   - 3 fake projects in config (velocity-api, nova-dashboard, mercury-pipeline)
 *   - 5 agents with .md files
 *   - 4-6 terminal sessions with streaming output
 *   - 1 sprint with mixed-state gates
 *   - 1 room with 12+ pre-seeded agent messages
 *   - 8+ memory entries across categories
 *   - Git repos with realistic status
 *
 * Usage:
 *   node scripts/seed-demo.mjs          # seed everything
 *   node scripts/seed-demo.mjs --dry    # preview what would be created
 *
 * The real config is backed up to .agent-studio.json.backup before any changes.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const BASE_URL = "http://localhost:8080";
const PROJECT_ROOT = process.cwd();
const DEMO_BASE = "/tmp/agent-studio-demo";
const DRY_RUN = process.argv.includes("--dry");

// ─── Helpers ────────────────────────────────────────────────────────────────

async function api(method, path, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${path}`, opts);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function log(emoji, msg) {
  console.log(`  ${emoji}  ${msg}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Step 0: Verify server is running ───────────────────────────────────────

console.log("\n🎬 Agent Studio Demo Seed\n");

try {
  const health = await api("GET", "/api/health");
  if (health.status !== "ok") throw new Error("unhealthy");
  log("✅", `Server healthy (uptime: ${health.uptime}s)`);
} catch {
  console.error("❌ Server not running on localhost:8080. Start with: npm run dev");
  process.exit(1);
}

if (DRY_RUN) {
  console.log("\n  [DRY RUN] Would create the following:\n");
  console.log("  - 3 fake git repos under /tmp/agent-studio-demo/");
  console.log("  - 5 agent .md files");
  console.log("  - 4-6 terminal sessions");
  console.log("  - 1 sprint with 5 pipeline steps");
  console.log("  - 1 room with 12 agent messages");
  console.log("  - 10 memory entries");
  console.log("  - Updated .agent-studio.json config\n");
  process.exit(0);
}

// ─── Step 1: Back up real config ────────────────────────────────────────────

const configPath = join(PROJECT_ROOT, ".agent-studio.json");
const backupPath = join(PROJECT_ROOT, ".agent-studio.json.backup");

if (existsSync(configPath) && !existsSync(backupPath)) {
  copyFileSync(configPath, backupPath);
  log("💾", "Backed up real config to .agent-studio.json.backup");
} else if (existsSync(backupPath)) {
  log("💾", "Backup already exists — skipping (teardown will restore it)");
}

// ─── Step 2: Create fake project directories with git repos ─────────────────

const PROJECTS = [
  {
    name: "velocity-api",
    path: join(DEMO_BASE, "velocity-api"),
    isProd: true,
    branch: "main",
    lang: "go",
  },
  {
    name: "nova-dashboard",
    path: join(DEMO_BASE, "nova-dashboard"),
    isProd: false,
    branch: "feat/auth-flow",
    lang: "react",
  },
  {
    name: "mercury-pipeline",
    path: join(DEMO_BASE, "mercury-pipeline"),
    isProd: false,
    branch: "fix/retry-logic",
    lang: "python",
  },
];

for (const proj of PROJECTS) {
  mkdirSync(proj.path, { recursive: true });

  // Init git repo with realistic commits
  if (!existsSync(join(proj.path, ".git"))) {
    execSync(`git init -q`, { cwd: proj.path });
    execSync(`git checkout -b main`, { cwd: proj.path, stdio: "ignore" });

    // Create some files based on project type
    if (proj.lang === "go") {
      writeFileSync(join(proj.path, "main.go"), `package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("velocity-api v2.4.1")\n}\n`);
      writeFileSync(join(proj.path, "go.mod"), `module github.com/acme/velocity-api\n\ngo 1.22\n`);
      writeFileSync(join(proj.path, "handlers.go"), `package main\n\ntype Handler struct {\n\tdb *DB\n}\n`);
    } else if (proj.lang === "react") {
      writeFileSync(join(proj.path, "package.json"), JSON.stringify({ name: "nova-dashboard", version: "3.1.0", scripts: { dev: "next dev", build: "next build" } }, null, 2));
      mkdirSync(join(proj.path, "src", "components"), { recursive: true });
      writeFileSync(join(proj.path, "src", "components", "Dashboard.tsx"), `export function Dashboard() {\n  return <div>Nova Dashboard</div>\n}\n`);
    } else {
      writeFileSync(join(proj.path, "pipeline.py"), `"""Mercury data pipeline — ETL for analytics."""\n\ndef run():\n    extract()\n    transform()\n    load()\n`);
      writeFileSync(join(proj.path, "requirements.txt"), `pandas==2.2.0\npyarrow==15.0.0\nsqlalchemy==2.0.27\n`);
    }

    execSync(`git add -A && git commit -q -m "Initial commit" --allow-empty`, {
      cwd: proj.path,
      env: { ...process.env, GIT_AUTHOR_NAME: "Demo", GIT_COMMITTER_NAME: "Demo", GIT_AUTHOR_EMAIL: "demo@example.com", GIT_COMMITTER_EMAIL: "demo@example.com" },
    });

    // Create branch if not main
    if (proj.branch !== "main") {
      execSync(`git checkout -b ${proj.branch}`, { cwd: proj.path, stdio: "ignore" });
      // Make a couple more commits on the branch
      writeFileSync(join(proj.path, "CHANGELOG.md"), `# Changelog\n\n## Unreleased\n- ${proj.branch}\n`);
      execSync(`git add -A && git commit -q -m "WIP: ${proj.branch}"`, {
        cwd: proj.path,
        env: { ...process.env, GIT_AUTHOR_NAME: "Demo", GIT_COMMITTER_NAME: "Demo", GIT_AUTHOR_EMAIL: "demo@example.com", GIT_COMMITTER_EMAIL: "demo@example.com" },
      });
    }

    // Add some uncommitted changes for dirty status
    writeFileSync(join(proj.path, "TODO.md"), `# TODO\n- [ ] Finish implementation\n- [ ] Add tests\n`);
  }

  log("📁", `Project: ${proj.name} (${proj.branch}) at ${proj.path}`);
}

// ─── Step 3: Create agent system with agents ────────────────────────────────

const AGENT_SYSTEM = join(DEMO_BASE, "ai-agents");
const AGENTS_DIR = join(AGENT_SYSTEM, "agents");
const MEMORY_DIR = join(AGENT_SYSTEM, "memory");
const TOOLS_DIR = join(AGENT_SYSTEM, "tools");
const SPRINTS_DIR = join(AGENT_SYSTEM, "sprints");

for (const d of [AGENTS_DIR, MEMORY_DIR, join(MEMORY_DIR, "learnings"), join(MEMORY_DIR, "corrections"), join(MEMORY_DIR, "decisions"), TOOLS_DIR, SPRINTS_DIR]) {
  mkdirSync(d, { recursive: true });
}

const AGENT_DEFS = [
  {
    id: "orchestrator",
    name: "Orchestrator",
    description: "Coordinates agent teams, delegates work, reviews before pushing",
    model: "opus",
    content: `You coordinate the engineering team. Break complex tasks into subtasks, assign to specialists, verify outputs, and merge when ready. Never ship without QA approval.`,
  },
  {
    id: "frontend",
    name: "Frontend",
    description: "Builds and maintains the React/Next.js frontend",
    model: "sonnet",
    content: `You own the frontend — React 19, Next.js 16, Tailwind CSS. Write accessible, responsive components. Follow the existing design system. Run the type checker before committing.`,
  },
  {
    id: "backend",
    name: "Backend",
    description: "APIs, database schemas, server logic, and data layer",
    model: "sonnet",
    content: `You own the backend — Express 5, PostgreSQL, Redis. Design clean API contracts. Write migrations carefully. Always handle errors at the boundary. Run tests before committing.`,
  },
  {
    id: "qa",
    name: "QA",
    description: "Testing, quality assurance, bug reporting",
    model: "haiku",
    content: `You test everything. Run smoke tests, E2E tests, and regression checks. File bugs with repro steps and screenshots. Block merges that break existing tests.`,
  },
  {
    id: "devops",
    name: "DevOps",
    description: "CI/CD, infrastructure, deployments, monitoring",
    model: "sonnet",
    content: `You own the infrastructure — Docker, GitHub Actions, AWS. Keep builds green, deploys safe, and monitoring sharp. Never skip health checks.`,
  },
];

for (const agent of AGENT_DEFS) {
  const md = `---\nname: ${agent.id}\ndescription: ${agent.description}\nmodel: ${agent.model}\n---\n\n# ${agent.name} Agent\n\n${agent.content}\n`;
  writeFileSync(join(AGENTS_DIR, `${agent.id}.md`), md);
}
log("🤖", `Created ${AGENT_DEFS.length} agent definitions`);

// ─── Step 4: Seed memory entries ────────────────────────────────────────────

const MEMORY_ENTRIES = [
  {
    file: "memory/learnings/20260412_api_pagination.json",
    title: "API pagination must use cursor-based approach",
    key_point: "Offset pagination breaks under concurrent writes — switched velocity-api to cursor-based. 40% faster for large datasets.",
    tags: ["api", "performance", "pagination"],
    category: "learnings",
    agent_type: "backend",
    content: {
      observation: "Offset pagination returned duplicate items when new records were inserted between page fetches",
      action: "Migrated all list endpoints to cursor-based pagination using created_at + id composite cursor",
      outcome: "Zero duplicate items in QA testing, p95 latency dropped from 340ms to 200ms",
      lesson: "Always use cursor-based pagination for real-time datasets",
    },
  },
  {
    file: "memory/learnings/20260411_react_suspense.json",
    title: "React Suspense boundaries prevent cascade failures",
    key_point: "Wrapping each dashboard widget in its own Suspense boundary prevents a single slow API from blocking the entire page.",
    tags: ["react", "performance", "suspense"],
    category: "learnings",
    agent_type: "frontend",
    content: {
      observation: "Nova dashboard froze for 8s when the analytics API was slow",
      action: "Added Suspense boundaries per widget with skeleton loaders",
      outcome: "Dashboard renders in 200ms, slow widgets load independently",
      lesson: "Never share Suspense boundaries across independent data sources",
    },
  },
  {
    file: "memory/corrections/20260410_retry_backoff.json",
    title: "Pipeline retry must use exponential backoff",
    key_point: "Linear retry hammered the warehouse API and triggered rate limiting. Switched to exponential backoff with jitter.",
    tags: ["pipeline", "retry", "reliability"],
    category: "corrections",
    agent_type: "backend",
    content: {
      observation: "Mercury pipeline retries with 1s fixed delay caused 429 responses from data warehouse",
      action: "Implemented exponential backoff (1s, 2s, 4s, 8s) with ±20% jitter",
      outcome: "Zero 429 errors in 72h monitoring window",
      lesson: "Always use exponential backoff with jitter for external API retries",
    },
  },
  {
    file: "memory/decisions/20260409_monorepo.json",
    title: "Decided against monorepo — keep projects separate",
    key_point: "Evaluated nx monorepo. Rejected: team velocity is higher with independent repos and clear API contracts between services.",
    tags: ["architecture", "monorepo", "decision"],
    category: "decisions",
    agent_type: "orchestrator",
    content: {
      observation: "Team suggested consolidating velocity-api, nova-dashboard, and mercury-pipeline into a monorepo",
      action: "Evaluated nx monorepo approach vs current multi-repo setup over 1 sprint",
      outcome: "Decided to keep separate repos — deploy independence and clearer ownership outweigh shared tooling benefits",
      lesson: "For teams under 10 engineers, independent repos with API contracts beat monorepos",
    },
  },
  {
    file: "memory/learnings/20260408_websocket_heartbeat.json",
    title: "WebSocket needs heartbeat to detect stale connections",
    key_point: "Without ping/pong, dead connections pile up and exhaust server memory. Added 30s heartbeat interval.",
    tags: ["websocket", "reliability", "infrastructure"],
    category: "learnings",
    agent_type: "devops",
    content: {
      observation: "Server memory grew unbounded — 3GB after 48h from zombie WebSocket connections",
      action: "Added 30s ping/pong heartbeat, terminate connections that miss 2 consecutive pongs",
      outcome: "Memory stable at 400MB, zero zombie connections",
      lesson: "Every WebSocket server needs a heartbeat mechanism",
    },
  },
  {
    file: "memory/corrections/20260407_sql_injection.json",
    title: "Raw SQL in search endpoint — parameterize all queries",
    key_point: "QA found SQL injection in velocity-api search. Switched to parameterized queries across all endpoints.",
    tags: ["security", "sql", "vulnerability"],
    category: "corrections",
    agent_type: "qa",
    content: {
      observation: "Security scan found unparameterized SQL in GET /api/search?q= endpoint",
      action: "Replaced all raw SQL string concatenation with parameterized queries using $1, $2 placeholders",
      outcome: "All 47 SQL queries now parameterized, security scan passes",
      lesson: "Never concatenate user input into SQL — always use parameterized queries",
    },
  },
  {
    file: "memory/decisions/20260406_testing_strategy.json",
    title: "Integration tests over unit tests for API layer",
    key_point: "Unit tests with mocked DB gave false confidence. Switched to integration tests with real Postgres via testcontainers.",
    tags: ["testing", "strategy", "decision"],
    category: "decisions",
    agent_type: "qa",
    content: {
      observation: "3 production bugs in the past month were in DB queries that unit tests with mocks couldn't catch",
      action: "Adopted testcontainers for integration tests — spin up real Postgres per test suite",
      outcome: "Caught 2 migration bugs in the first week that would have reached production",
      lesson: "For data layer code, integration tests with real databases catch bugs that mocks hide",
    },
  },
  {
    file: "memory/learnings/20260405_docker_layer_cache.json",
    title: "Docker build: copy dependency files before source code",
    key_point: "Moving COPY go.mod before COPY . cut CI build times from 4min to 45s by caching the dependency layer.",
    tags: ["docker", "ci", "performance"],
    category: "learnings",
    agent_type: "devops",
    content: {
      observation: "Every commit triggered a full Docker build (4 min) because source copy invalidated the dependency cache",
      action: "Reordered Dockerfile: COPY go.mod → RUN go mod download → COPY . → RUN go build",
      outcome: "CI builds dropped from 4min to 45s for code-only changes",
      lesson: "Always order Dockerfile layers from least to most frequently changing",
    },
  },
  {
    file: "memory/learnings/20260404_zod_api_validation.json",
    title: "Zod schemas at API boundaries catch malformed requests early",
    key_point: "Added Zod validation middleware to velocity-api. Caught 12 malformed request patterns from nova-dashboard in the first day.",
    tags: ["api", "validation", "zod", "typescript"],
    category: "learnings",
    agent_type: "backend",
    content: {
      observation: "API was silently accepting malformed requests and producing confusing 500 errors downstream",
      action: "Added Zod schema validation middleware at every API endpoint",
      outcome: "Clear 400 errors with field-level messages, caught 12 malformed request patterns from frontend",
      lesson: "Validate at the boundary — it's cheaper than debugging downstream failures",
    },
  },
  {
    file: "memory/decisions/20260403_feature_flags.json",
    title: "Use environment variables over feature flag service",
    key_point: "For a team our size, ENV vars are simpler than LaunchDarkly. Revisit when we hit 20 engineers or need gradual rollouts.",
    tags: ["feature-flags", "infrastructure", "decision"],
    category: "decisions",
    agent_type: "orchestrator",
    content: {
      observation: "Team debated adding LaunchDarkly for feature flags",
      action: "Analyzed cost/complexity vs team size. Decided ENV-based flags are sufficient for now.",
      outcome: "Saved $500/mo and avoided vendor lock-in. Simple .env management with dotenv.",
      lesson: "Right-size your tooling — don't over-engineer for problems you don't have yet",
    },
  },
];

// Write individual memory entry files
for (const entry of MEMORY_ENTRIES) {
  const entryPath = join(AGENT_SYSTEM, entry.file);
  mkdirSync(join(entryPath, ".."), { recursive: true });
  writeFileSync(
    entryPath,
    JSON.stringify(
      {
        agent_type: entry.agent_type,
        memory_type: entry.category === "learnings" ? "lesson" : entry.category === "corrections" ? "correction" : "decision",
        title: entry.title,
        content: entry.content,
        tags: entry.tags,
        created_by: entry.agent_type,
        created_at: new Date(Date.now() - Math.random() * 10 * 86400000).toISOString(),
      },
      null,
      2,
    ),
  );
}

// Write memory index
const memoryIndex = {
  entries: MEMORY_ENTRIES.map(({ content, ...rest }) => rest),
  total_entries: MEMORY_ENTRIES.length,
};
writeFileSync(join(TOOLS_DIR, "memory_index.json"), JSON.stringify(memoryIndex, null, 2));
log("🧠", `Seeded ${MEMORY_ENTRIES.length} memory entries`);

// ─── Step 5: Update config ──────────────────────────────────────────────────

const demoConfig = {
  setupComplete: true,
  version: "1.0.0",
  projects: PROJECTS.map((p) => ({
    name: p.name,
    path: p.path,
    isProd: p.isProd,
    branch: p.branch,
    trackedBranches: ["main", "staging"],
  })),
  agentSystem: {
    path: AGENT_SYSTEM,
    memoryIndex: "tools/memory_index.json",
    sprintDir: "sprints/",
    scanLog: "sprints/scan_log.md",
  },
  defaults: {
    model: "opus",
    permissions: "bypass",
    workingDirectory: PROJECTS[0].path,
  },
  devServers: [],
  agents: AGENT_DEFS.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    model: a.model,
  })),
};

writeFileSync(configPath, JSON.stringify(demoConfig, null, 2));
log("⚙️", "Wrote demo config to .agent-studio.json");

// Tell the server to reload config
await api("POST", "/api/config", demoConfig);
log("🔄", "Server config reloaded");

// ─── Step 6: Start demo sessions ────────────────────────────────────────────

// Kill any existing sessions first
const existingSessions = await api("GET", "/api/sessions");
if (Array.isArray(existingSessions)) {
  for (const s of existingSessions) {
    await api("DELETE", `/api/sessions/${s.id}`);
  }
  if (existingSessions.length > 0) {
    log("🧹", `Cleaned ${existingSessions.length} existing session(s)`);
    await sleep(500);
  }
}

// Session output scripts — these produce realistic, visually interesting terminal content
const SESSION_SCRIPTS = [
  {
    name: "velocity-api build",
    cwd: PROJECTS[0].path,
    model: "sonnet",
    agent: "backend",
    // Simulates a Go build + test cycle
    script: `
printf '\\033[1;36m━━━ velocity-api ━━━\\033[0m\\n\\n'
printf '\\033[90m$ go build ./...\\033[0m\\n'
sleep 0.3
printf '\\033[32m✓\\033[0m compiled \\033[1mapi/handlers\\033[0m\\n'
sleep 0.2
printf '\\033[32m✓\\033[0m compiled \\033[1mapi/middleware\\033[0m\\n'
sleep 0.2
printf '\\033[32m✓\\033[0m compiled \\033[1mapi/models\\033[0m\\n'
sleep 0.3
printf '\\n\\033[90m$ go test ./... -v\\033[0m\\n'
sleep 0.4
printf '=== RUN   TestUserCreate\\n'
sleep 0.3
printf '    --- \\033[32mPASS\\033[0m: TestUserCreate (0.04s)\\n'
sleep 0.2
printf '=== RUN   TestUserAuth\\n'
sleep 0.5
printf '    --- \\033[32mPASS\\033[0m: TestUserAuth (0.12s)\\n'
sleep 0.2
printf '=== RUN   TestPagination\\n'
sleep 0.4
printf '    --- \\033[32mPASS\\033[0m: TestPagination (0.08s)\\n'
sleep 0.2
printf '=== RUN   TestRateLimit\\n'
sleep 0.6
printf '    --- \\033[32mPASS\\033[0m: TestRateLimit (0.23s)\\n'
sleep 0.2
printf '=== RUN   TestWebSocket\\n'
sleep 0.4
printf '    --- \\033[32mPASS\\033[0m: TestWebSocket (0.15s)\\n'
sleep 0.2
printf '\\n\\033[32mok\\033[0m  github.com/acme/velocity-api  \\033[90m0.62s\\033[0m\\n'
printf '\\n\\033[1;32m✓ All 5 tests passed\\033[0m\\n\\n'
sleep 0.5
printf '\\033[90m$ go vet ./...\\033[0m\\n'
sleep 0.3
printf '\\033[32m✓\\033[0m No issues found\\n\\n'
printf '\\033[1;33m⚡ Build complete — ready to deploy\\033[0m\\n'
sleep 999
`,
  },
  {
    name: "nova-dashboard dev",
    cwd: PROJECTS[1].path,
    model: "sonnet",
    agent: "frontend",
    // Simulates Next.js dev server with HMR
    script: `
printf '\\033[1;35m━━━ nova-dashboard ━━━\\033[0m\\n\\n'
printf '  \\033[36m▲ Next.js 16.0.1\\033[0m\\n'
printf '  - Local:        \\033[36mhttp://localhost:3000\\033[0m\\n'
printf '  - Network:      \\033[36mhttp://192.168.1.42:3000\\033[0m\\n'
printf '  - Environments: .env.local\\n\\n'
sleep 0.5
printf ' \\033[32m✓\\033[0m Ready in 1.2s\\n\\n'
sleep 0.8
printf '\\033[90m ○ Compiling /dashboard ...\\033[0m\\n'
sleep 0.6
printf '\\033[32m ✓\\033[0m Compiled /dashboard in 340ms (428 modules)\\n'
sleep 1.0
printf '\\033[90m ○ Compiling /dashboard/analytics ...\\033[0m\\n'
sleep 0.4
printf '\\033[32m ✓\\033[0m Compiled /dashboard/analytics in 180ms (92 modules)\\n'
sleep 0.8
printf '\\033[90m ○ Compiling /settings ...\\033[0m\\n'
sleep 0.3
printf '\\033[32m ✓\\033[0m Compiled /settings in 120ms (64 modules)\\n'
sleep 0.6
printf '\\n\\033[33m ⚠\\033[0m Fast Refresh: 3 components updated\\n'
sleep 0.4
printf '\\033[90m ○ Compiling /api/auth/[...nextauth] ...\\033[0m\\n'
sleep 0.5
printf '\\033[32m ✓\\033[0m Compiled /api/auth/[...nextauth] in 90ms\\n'
sleep 0.5
printf '\\n\\033[1;32m⚡ HMR active — watching for changes\\033[0m\\n'
sleep 999
`,
  },
  {
    name: "mercury-pipeline tests",
    cwd: PROJECTS[2].path,
    model: "haiku",
    agent: "qa",
    // Simulates pytest with rich output
    script: `
printf '\\033[1;33m━━━ mercury-pipeline ━━━\\033[0m\\n\\n'
printf '\\033[90m$ pytest tests/ -v --tb=short\\033[0m\\n\\n'
sleep 0.3
printf '\\033[1mcollected 18 items\\033[0m\\n\\n'
sleep 0.2
printf 'tests/test_extract.py::test_csv_source \\033[32mPASSED\\033[0m\\n'
sleep 0.15
printf 'tests/test_extract.py::test_api_source \\033[32mPASSED\\033[0m\\n'
sleep 0.15
printf 'tests/test_extract.py::test_s3_source \\033[32mPASSED\\033[0m\\n'
sleep 0.15
printf 'tests/test_transform.py::test_clean_nulls \\033[32mPASSED\\033[0m\\n'
sleep 0.15
printf 'tests/test_transform.py::test_normalize \\033[32mPASSED\\033[0m\\n'
sleep 0.15
printf 'tests/test_transform.py::test_deduplicate \\033[32mPASSED\\033[0m\\n'
sleep 0.15
printf 'tests/test_transform.py::test_schema_validation \\033[32mPASSED\\033[0m\\n'
sleep 0.15
printf 'tests/test_load.py::test_postgres_insert \\033[32mPASSED\\033[0m\\n'
sleep 0.25
printf 'tests/test_load.py::test_upsert_conflict \\033[32mPASSED\\033[0m\\n'
sleep 0.15
printf 'tests/test_load.py::test_batch_size \\033[32mPASSED\\033[0m\\n'
sleep 0.15
printf 'tests/test_retry.py::test_exponential_backoff \\033[32mPASSED\\033[0m\\n'
sleep 0.2
printf 'tests/test_retry.py::test_jitter \\033[32mPASSED\\033[0m\\n'
sleep 0.15
printf 'tests/test_retry.py::test_max_retries \\033[32mPASSED\\033[0m\\n'
sleep 0.15
printf 'tests/test_integration.py::test_full_pipeline \\033[32mPASSED\\033[0m\\n'
sleep 0.5
printf 'tests/test_integration.py::test_incremental_load \\033[32mPASSED\\033[0m\\n'
sleep 0.3
printf 'tests/test_integration.py::test_error_recovery \\033[32mPASSED\\033[0m\\n'
sleep 0.2
printf 'tests/test_integration.py::test_concurrent_writes \\033[32mPASSED\\033[0m\\n'
sleep 0.15
printf 'tests/test_integration.py::test_idempotency \\033[32mPASSED\\033[0m\\n'
sleep 0.1
printf '\\n\\033[1;32m18 passed\\033[0m\\033[90m in 3.42s\\033[0m\\n\\n'
sleep 0.3
printf '\\033[90m---------- coverage: 87%% ----------\\033[0m\\n'
printf 'Name                      Stmts   Miss  Cover\\n'
printf '\\033[90m─────────────────────────────────────────\\033[0m\\n'
printf 'pipeline.py                  42      3    93%%\\n'
printf 'extract.py                   38      5    87%%\\n'
printf 'transform.py                 56      8    86%%\\n'
printf 'load.py                      44      7    84%%\\n'
printf 'retry.py                     18      2    89%%\\n'
printf '\\033[90m─────────────────────────────────────────\\033[0m\\n'
printf '\\033[1mTOTAL\\033[0m                       198     25    \\033[32m87%%\\033[0m\\n'
printf '\\n\\033[1;32m✓ All tests passed, coverage above threshold\\033[0m\\n'
sleep 999
`,
  },
  {
    name: "orchestrator planning",
    cwd: PROJECTS[0].path,
    model: "opus",
    agent: "orchestrator",
    // Simulates an orchestrator agent reasoning
    script: `
printf '\\033[1;34m━━━ Orchestrator ━━━\\033[0m\\n\\n'
printf '\\033[90m◆ Analyzing sprint goals...\\033[0m\\n\\n'
sleep 0.5
printf '\\033[1mSprint: Auth System Overhaul\\033[0m\\n'
printf '\\033[90m─────────────────────────────────\\033[0m\\n\\n'
sleep 0.3
printf '\\033[36m→ Phase 1:\\033[0m Backend API schema  \\033[32m[DONE]\\033[0m\\n'
printf '  \\033[90mAssigned: backend  |  PR #47 merged\\033[0m\\n\\n'
sleep 0.4
printf '\\033[36m→ Phase 2:\\033[0m Frontend auth flow  \\033[33m[ACTIVE]\\033[0m\\n'
printf '  \\033[90mAssigned: frontend  |  3 of 5 components done\\033[0m\\n\\n'
sleep 0.4
printf '\\033[36m→ Phase 3:\\033[0m Integration tests  \\033[33m[ACTIVE]\\033[0m\\n'
printf '  \\033[90mAssigned: qa  |  Running test suite...\\033[0m\\n\\n'
sleep 0.4
printf '\\033[36m→ Phase 4:\\033[0m Security review  \\033[90m[PENDING]\\033[0m\\n'
printf '  \\033[90mBlocked by: Phase 2, Phase 3\\033[0m\\n\\n'
sleep 0.4
printf '\\033[36m→ Phase 5:\\033[0m Deploy to staging  \\033[90m[PENDING]\\033[0m\\n'
printf '  \\033[90mBlocked by: Phase 4\\033[0m\\n\\n'
sleep 0.5
printf '\\033[90m─────────────────────────────────\\033[0m\\n'
printf '\\033[1mProgress:\\033[0m \\033[32m████████\\033[33m██████\\033[90m██████████\\033[0m 40%%\\n\\n'
sleep 0.3
printf '\\033[1;36m📋 Next actions:\\033[0m\\n'
printf '  1. Review frontend PR #52 (auth flow components)\\n'
printf '  2. Unblock QA on test fixtures\\n'
printf '  3. Schedule security review with devops\\n\\n'
sleep 0.5
printf '\\033[32m✓ Sprint plan updated\\033[0m\\n'
sleep 999
`,
  },
  {
    name: "devops deploy-check",
    cwd: PROJECTS[0].path,
    model: "sonnet",
    agent: "devops",
    // Simulates deployment health checks
    script: `
printf '\\033[1;31m━━━ DevOps: Staging Health ━━━\\033[0m\\n\\n'
printf '\\033[90m$ kubectl get pods -n staging\\033[0m\\n\\n'
sleep 0.3
printf 'NAME                            READY   STATUS    AGE\\n'
printf '\\033[90m────────────────────────────────────────────────────\\033[0m\\n'
printf 'velocity-api-7d4f8b9c6-\\033[32mwx2k1\\033[0m   1/1     \\033[32mRunning\\033[0m   4h\\n'
printf 'velocity-api-7d4f8b9c6-\\033[32mm9p3r\\033[0m   1/1     \\033[32mRunning\\033[0m   4h\\n'
printf 'velocity-api-7d4f8b9c6-\\033[32maj7s2\\033[0m   1/1     \\033[32mRunning\\033[0m   4h\\n'
printf 'nova-dash-5c8e1a3b2-\\033[32mhk4d8\\033[0m      1/1     \\033[32mRunning\\033[0m   2h\\n'
printf 'nova-dash-5c8e1a3b2-\\033[32mqr6f1\\033[0m      1/1     \\033[32mRunning\\033[0m   2h\\n'
printf 'mercury-pipe-9f2d7e4a1-\\033[32mzn5w3\\033[0m   1/1     \\033[32mRunning\\033[0m   6h\\n'
printf 'redis-master-0                  1/1     \\033[32mRunning\\033[0m   12d\\n'
printf 'postgres-0                      1/1     \\033[32mRunning\\033[0m   12d\\n'
sleep 0.5
printf '\\n\\033[90m$ curl -s staging.internal/health\\033[0m\\n'
sleep 0.3
printf '\\033[32m{\\033[0m "status": "healthy", "version": "2.4.1", "uptime": "4h12m" \\033[32m}\\033[0m\\n\\n'
sleep 0.3
printf '\\033[90m$ kubectl top pods -n staging\\033[0m\\n\\n'
sleep 0.3
printf 'NAME                            CPU    MEMORY\\n'
printf '\\033[90m────────────────────────────────────────────────────\\033[0m\\n'
printf 'velocity-api-7d4f8b9c6-wx2k1   24m    128Mi\\n'
printf 'velocity-api-7d4f8b9c6-m9p3r   18m    122Mi\\n'
printf 'velocity-api-7d4f8b9c6-aj7s2   21m    126Mi\\n'
printf 'nova-dash-5c8e1a3b2-hk4d8      12m    96Mi\\n'
printf 'nova-dash-5c8e1a3b2-qr6f1      14m    98Mi\\n'
printf 'mercury-pipe-9f2d7e4a1-zn5w3   45m    256Mi\\n'
sleep 0.3
printf '\\n\\033[1;32m✓ All systems healthy — staging is GO\\033[0m\\n'
sleep 999
`,
  },
];

const createdSessions = [];
for (const sess of SESSION_SCRIPTS) {
  const result = await api("POST", "/api/sessions", {
    name: sess.name,
    command: "bash",
    args: ["-c", sess.script],
    cwd: sess.cwd,
    cols: 100,
    rows: 30,
    meta: {
      model: sess.model,
      agent: sess.agent,
      permissions: "bypass",
      channel: "none",
      group: "standalone",
    },
  });
  if (result?.id) {
    createdSessions.push(result.id);
  }
  // Small delay between session starts so they stagger visually
  await sleep(200);
}
log("🖥️", `Started ${createdSessions.length} terminal sessions`);

// ─── Step 7: Create sprint via file-based system ────────────────────────────
// The sprint-planning flow reads from sprints/ directory files.
// Status: IN PROGRESS gives the best visual: PMO done, readiness done, approval done,
// spec done, backend ACTIVE, rest pending.

// scan_log.md — makes PMO Scan step completed
const scanLogMd = `## PMO Scan Log

| Time | Status | Detail |
|------|--------|--------|
| 2026-04-13 08:00 | INFO | PMO scan starting — checking Notion Tasks DB |
| 2026-04-13 08:01 | READY | 12 To Do tickets found across 3 domains (backend, frontend, infrastructure) |
| 2026-04-13 08:01 | INFO | Recommended sprint: Auth System Overhaul (8 tasks, ~12h agent time) |
`;
writeFileSync(join(SPRINTS_DIR, "scan_log.md"), scanLogMd);

// ready.md — makes Readiness Report step completed
const readyMd = `# Sprint Readiness Report

Scan result: **READY — 12 To Do tickets**

## Ticket Groups

### Backend (5 tickets)
- AUTH-101: Implement OAuth2 provider
- AUTH-102: Token rotation endpoint
- AUTH-103: Session management migration
- AUTH-104: Rate limiting for auth endpoints
- AUTH-105: Audit logging for auth events

### Frontend (4 tickets)
- AUTH-201: Login/signup flow redesign
- AUTH-202: Token refresh interceptor
- AUTH-203: Protected route wrapper
- AUTH-204: Error boundary for auth failures

### Infrastructure (3 tickets)
- AUTH-301: Update env vars for OAuth2 signing keys
- AUTH-302: Add monitoring for token refresh latency
- AUTH-303: Canary deploy configuration

## Recommended Sprint

### Sprint A: Auth System Overhaul
- **Scope:** 12 tasks across backend, frontend, infrastructure
- **Estimated:** ~12h agent time
- **Risk:** Medium — migration requires backward compatibility
- **Dependencies:** None — can start immediately
`;
writeFileSync(join(SPRINTS_DIR, "ready.md"), readyMd);

// current.md — Status: IN PROGRESS gives mixed gate states
const sprintCurrentMd = `# Sprint: Auth System Overhaul

Status: IN PROGRESS
Created: 2026-04-13

## Goal
Replace legacy JWT auth with OAuth2 + PKCE flow across all services.

## Agents
- orchestrator: Coordinating sprint execution
- backend-worker: Building OAuth2 provider, token endpoints, migrations
- frontend-worker: Login/signup UI, token refresh, protected routes
- qa-tester: E2E auth flow tests, security scanning
- security-reviewer: Reviewing auth implementation for vulnerabilities

## Tasks

### Task S1: OAuth2 Provider Schema
**Agent:** backend-worker
**Status:** DONE
Design the OAuth2 provider database schema with tables for clients, access tokens, and refresh tokens.

### Task S2: Token Rotation Endpoint
**Agent:** backend-worker
**Status:** DONE
Implement POST /auth/refresh with automatic token rotation and replay detection.

### Task M1: Login/Signup Flow
**Agent:** frontend-worker
**Status:** IN PROGRESS
Redesign login and signup pages to use OAuth2 flow with PKCE challenge.

### Task M2: Protected Route Wrapper
**Agent:** frontend-worker
**Status:** TODO
Create a higher-order component that checks auth state and redirects to login.

### Task H1: Session Migration
**Agent:** backend-worker
**Status:** IN PROGRESS
Migrate existing JWT sessions to OAuth2 tokens with zero downtime.

### Task S3: Rate Limiting
**Agent:** backend-worker
**Status:** TODO
Add rate limiting to auth endpoints (10 req/min for login, 30 req/min for refresh).

### Task M3: E2E Auth Tests
**Agent:** qa-tester
**Status:** TODO
Write end-to-end tests for the complete auth flow including error cases.

### Task S4: Monitoring Setup
**Agent:** security-reviewer
**Status:** TODO
Add monitoring for token refresh latency, failed auth attempts, and suspicious patterns.
`;
writeFileSync(join(SPRINTS_DIR, "current.md"), sprintCurrentMd);

// Handoff files — give backend gate rich data
mkdirSync(join(SPRINTS_DIR, "handoffs"), { recursive: true });

const backendHandoff = {
  agent: "backend-worker",
  status: "completed",
  deliverables: [
    "OAuth2 provider schema (3 tables)",
    "Token rotation endpoint with replay detection",
    "Session migration script (backward compatible)",
  ],
  files_changed: [
    "server/auth/provider.ts",
    "server/auth/tokens.ts",
    "server/auth/migration.ts",
    "server/routes/auth.ts",
    "migrations/20260413_oauth2_schema.sql",
  ],
  test_scope: "All auth endpoints passing — 15 tests, 100% coverage on token rotation",
  notes: "Migration script tested with 1M rows in staging. Zero downtime confirmed.",
};
writeFileSync(join(SPRINTS_DIR, "handoffs", "backend-worker_to_orchestrator.json"), JSON.stringify(backendHandoff, null, 2));

// Add an archived sprint for history richness
mkdirSync(join(SPRINTS_DIR, "archive"), { recursive: true });
const archivedSprint = `# Sprint: Dashboard Performance

Status: COMPLETED
Created: 2026-04-06

## Goal
Optimize nova-dashboard load time from 4.2s to under 1.5s.

## Tasks

### Task S1: React Suspense Boundaries
**Agent:** frontend-worker
**Status:** DONE
Wrap each dashboard widget in its own Suspense boundary with skeleton loaders.

### Task S2: API Response Caching
**Agent:** backend-worker
**Status:** DONE
Add Redis caching for dashboard aggregate queries (TTL: 60s).

### Task M1: Bundle Analysis
**Agent:** frontend-worker
**Status:** DONE
Analyze and reduce bundle size — removed 3 unused dependencies, code-split analytics.

### Task S3: Image Optimization
**Agent:** frontend-worker
**Status:** DONE
Convert hero images to WebP, add lazy loading for below-fold content.

## Results
- Page load: 4.2s → 1.1s (74% improvement)
- Bundle size: 1.8MB → 890KB (51% reduction)
- LCP: 3.8s → 0.9s
`;
writeFileSync(join(SPRINTS_DIR, "archive", "2026-04-06_dashboard_performance.md"), archivedSprint);

log("🏃", "Created sprint files (scan_log, ready, current IN PROGRESS, 1 archived)");

// ─── Step 8: Create room with seeded messages ───────────────────────────────

const roomResult = await api("POST", "/api/rooms", {
  name: "Sprint War Room",
  topic: "Auth system overhaul — coordinating across all agents",
  agents: [
    { id: "orchestrator", name: "Orchestrator", model: "opus" },
    { id: "backend", name: "Backend", model: "sonnet" },
    { id: "frontend", name: "Frontend", model: "sonnet" },
    { id: "qa", name: "QA", model: "haiku" },
    { id: "devops", name: "DevOps", model: "sonnet" },
  ],
});

const roomId = roomResult?.id;
if (roomId) {
  // Seed realistic conversation messages
  const MESSAGES = [
    { from: "orchestrator", text: "Sprint kickoff: Auth System Overhaul. Goal is replacing legacy JWT with OAuth2+PKCE. @backend you're up first — design the token endpoints and migration plan." },
    { from: "backend", text: "On it. I'll start with the OAuth2 provider schema. Questions: do we need refresh token rotation? And what's our session TTL target?" },
    { from: "orchestrator", text: "Yes, refresh token rotation is required (security team mandate). Session TTL: 15min access token, 7d refresh token. Same as the spec in docs/auth-rfc.md." },
    { from: "backend", text: "Got it. Schema design complete — 3 new tables: `oauth_clients`, `access_tokens`, `refresh_tokens`. PR #47 is up for review. Migration is backward-compatible, no downtime needed." },
    { from: "orchestrator", text: "Reviewed PR #47 — looks solid. Merging now. @frontend you can start on the auth flow UI. The new endpoints are:\n- `POST /auth/token` (grant)\n- `POST /auth/refresh` (rotation)\n- `DELETE /auth/session` (logout)" },
    { from: "frontend", text: "Starting on the login flow. I'll need the error response format — @backend can you share the error schema? Also, should the \"remember me\" checkbox extend the refresh token TTL?" },
    { from: "backend", text: "Error format: `{ error: string, code: string, details?: object }`. Codes are in `docs/error-codes.md`. For \"remember me\" — let's extend refresh TTL to 30d. I'll add a `persistent` flag to the token grant." },
    { from: "frontend", text: "Login, signup, and forgot-password flows are done. 3 of 5 components complete. Working on the token refresh interceptor and protected route wrapper now." },
    { from: "qa", text: "I've started writing E2E tests for the auth flow. Found an issue: the refresh endpoint returns 200 even when the refresh token is expired. Should be 401. @backend" },
    { from: "backend", text: "Good catch — fixed in commit `a3f7c2d`. Expired refresh tokens now return `401 { error: \"token_expired\", code: \"AUTH_003\" }`. Re-running your tests should pass now." },
    { from: "qa", text: "Confirmed fix works. 12 of 15 auth tests passing now. Remaining 3 are waiting on the frontend protected routes to be deployed to staging." },
    { from: "devops", text: "Staging environment is prepped. I've added the new OAuth env vars and rotated the signing keys. Ready to deploy whenever @orchestrator gives the green light." },
    { from: "orchestrator", text: "Good progress team. Current status:\n- ✅ Schema: Done\n- ✅ Backend: Done (PR #47 merged)\n- 🔄 Frontend: 3/5 components (ETA: today)\n- 🔄 QA: 12/15 tests passing\n- ⏳ Deploy: Staged, waiting on frontend\n\nLet's aim to have everything in staging by EOD." },
  ];

  for (const msg of MESSAGES) {
    await api("POST", `/api/rooms/${roomId}/messages`, {
      from: msg.from,
      text: msg.text,
    });
    await sleep(50); // Small delay for proper timestamp ordering
  }
  log("💬", `Created room with ${MESSAGES.length} messages`);
} else {
  log("⚠️", "Failed to create room — check server logs");
}

// ─── Done! ──────────────────────────────────────────────────────────────────

// Wait for sessions to produce some output
log("⏳", "Waiting 5s for sessions to produce output...");
await sleep(5000);

console.log("\n🎬 Demo seed complete!\n");
console.log("  Sessions:  " + createdSessions.length);
console.log("  Sprint:    1 active (IN PROGRESS) + 1 archived");
console.log("  Room:      1 (13 messages)");
console.log("  Memory:    " + MEMORY_ENTRIES.length + " entries");
console.log("  Projects:  " + PROJECTS.length);
console.log("  Agents:    " + AGENT_DEFS.length);
console.log("");
console.log("  ⚠️  Memory tab requires server restart to pick up the new agent system path.");
console.log("     Restart: kill the server, then DEMO_MODE=true npm run dev");
console.log("");
console.log("  Open http://localhost:8080 to see the seeded app.");
console.log("  Run `node scripts/teardown-demo.mjs` to restore real config.\n");
