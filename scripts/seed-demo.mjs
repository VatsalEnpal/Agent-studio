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
import WebSocket from "ws";

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

    // Create substantial source files — Claude needs real code to read and modify
    if (proj.lang === "go") {
      writeFileSync(join(proj.path, "main.go"), [
        'package main',
        '',
        'import (',
        '\t"fmt"',
        '\t"log"',
        '\t"net/http"',
        '\t"os"',
        ')',
        '',
        'func main() {',
        '\tport := os.Getenv("PORT")',
        '\tif port == "" {',
        '\t\tport = "8080"',
        '\t}',
        '',
        '\tdb := &DB{users: make(map[string]User)}',
        '\thandler := &Handler{db: db}',
        '',
        '\tmux := http.NewServeMux()',
        '\tmux.HandleFunc("/api/users", handler.ListUsers)',
        '\tmux.HandleFunc("/api/users/create", handler.CreateUser)',
        '\tmux.HandleFunc("/api/users/search", handler.SearchUsers)',
        '\tmux.HandleFunc("/health", handler.Health)',
        '',
        '\tfmt.Printf("velocity-api v2.4.1 starting on :%s\\n", port)',
        '\tlog.Fatal(http.ListenAndServe(":"+port, mux))',
        '}',
      ].join('\n') + '\n');
      writeFileSync(join(proj.path, "go.mod"), 'module github.com/acme/velocity-api\n\ngo 1.22\n');
      writeFileSync(join(proj.path, "handlers.go"), [
        'package main',
        '',
        'import (',
        '\t"encoding/json"',
        '\t"fmt"',
        '\t"net/http"',
        ')',
        '',
        'type Handler struct {',
        '\tdb *DB',
        '}',
        '',
        'func (h *Handler) ListUsers(w http.ResponseWriter, r *http.Request) {',
        '\tusers := make([]User, 0)',
        '\tfor _, u := range h.db.users {',
        '\t\tusers = append(users, u)',
        '\t}',
        '\tjson.NewEncoder(w).Encode(users)',
        '}',
        '',
        'func (h *Handler) CreateUser(w http.ResponseWriter, r *http.Request) {',
        '\tvar input struct {',
        '\t\tEmail    string `json:"email"`',
        '\t\tPassword string `json:"password"`',
        '\t\tName     string `json:"name"`',
        '\t}',
        '\tjson.NewDecoder(r.Body).Decode(&input)',
        '\t// TODO: password stored in plaintext — needs hashing',
        '\tuser := User{',
        '\t\tID:       fmt.Sprintf("usr_%d", len(h.db.users)+1),',
        '\t\tEmail:    input.Email,',
        '\t\tPassword: input.Password,',
        '\t\tName:     input.Name,',
        '\t\tRole:     "user",',
        '\t}',
        '\th.db.users[user.ID] = user',
        '\tw.WriteHeader(201)',
        '\tjson.NewEncoder(w).Encode(user)',
        '}',
        '',
        'func (h *Handler) SearchUsers(w http.ResponseWriter, r *http.Request) {',
        '\tquery := r.URL.Query().Get("q")',
        '\t// BUG: vulnerable to injection — query used unsanitized',
        '\tresults := make([]User, 0)',
        '\tfor _, u := range h.db.users {',
        '\t\tif u.Name == query || u.Email == query {',
        '\t\t\tresults = append(results, u)',
        '\t\t}',
        '\t}',
        '\tjson.NewEncoder(w).Encode(results)',
        '}',
        '',
        'func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {',
        '\tjson.NewEncoder(w).Encode(map[string]string{"status": "ok", "version": "2.4.1"})',
        '}',
      ].join('\n') + '\n');
      writeFileSync(join(proj.path, "db.go"), [
        'package main',
        '',
        'type DB struct {',
        '\tusers map[string]User',
        '}',
        '',
        'type User struct {',
        '\tID       string `json:"id"`',
        '\tEmail    string `json:"email"`',
        '\tPassword string `json:"password"`',
        '\tName     string `json:"name"`',
        '\tRole     string `json:"role"`',
        '\tCreated  string `json:"created"`',
        '}',
      ].join('\n') + '\n');
    } else if (proj.lang === "react") {
      writeFileSync(join(proj.path, "package.json"), JSON.stringify({
        name: "nova-dashboard", version: "3.1.0",
        scripts: { dev: "next dev", build: "next build", test: "jest" },
        dependencies: { "next": "16.0.1", "react": "19.0.0", "tailwindcss": "4.0.0" },
      }, null, 2));
      mkdirSync(join(proj.path, "src", "components"), { recursive: true });
      mkdirSync(join(proj.path, "src", "lib"), { recursive: true });
      writeFileSync(join(proj.path, "src", "components", "Dashboard.tsx"), [
        'import { useState, useEffect } from "react";',
        '',
        'interface Metric {',
        '  label: string;',
        '  value: number;',
        '  change: number;',
        '}',
        '',
        'export function Dashboard() {',
        '  const [metrics, setMetrics] = useState<Metric[]>([]);',
        '  const [loading, setLoading] = useState(true);',
        '',
        '  useEffect(() => {',
        '    fetch("/api/metrics")',
        '      .then(r => r.json())',
        '      .then(data => { setMetrics(data); setLoading(false); });',
        '  }, []);',
        '',
        '  if (loading) return <div>Loading...</div>;',
        '',
        '  return (',
        '    <div className="p-6">',
        '      <h1 className="text-2xl font-bold mb-4">Nova Dashboard</h1>',
        '      <div className="grid grid-cols-3 gap-4">',
        '        {metrics.map(m => (',
        '          <div key={m.label} className="bg-white p-4 rounded shadow">',
        '            <p className="text-gray-500 text-sm">{m.label}</p>',
        '            <p className="text-2xl font-bold">{m.value}</p>',
        '            <p className={m.change > 0 ? "text-green-500" : "text-red-500"}>',
        '              {m.change > 0 ? "+" : ""}{m.change}%',
        '            </p>',
        '          </div>',
        '        ))}',
        '      </div>',
        '    </div>',
        '  );',
        '}',
      ].join('\n') + '\n');
      writeFileSync(join(proj.path, "src", "lib", "api.ts"), [
        'const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";',
        '',
        'export async function fetchMetrics() {',
        '  const res = await fetch(`${BASE_URL}/api/metrics`);',
        '  if (!res.ok) throw new Error("Failed to fetch metrics");',
        '  return res.json();',
        '}',
        '',
        'export async function fetchEvents(limit = 50) {',
        '  const res = await fetch(`${BASE_URL}/api/events?limit=${limit}`);',
        '  if (!res.ok) throw new Error("Failed to fetch events");',
        '  return res.json();',
        '}',
      ].join('\n') + '\n');
    } else {
      writeFileSync(join(proj.path, "pipeline.py"), [
        '"""Mercury data pipeline — ETL for analytics."""',
        'import pandas as pd',
        'from sqlalchemy import create_engine',
        '',
        'DB_URL = "postgresql://localhost:5432/analytics"',
        '',
        'def extract(source_path: str) -> pd.DataFrame:',
        '    """Read CSV data from source."""',
        '    df = pd.read_csv(source_path)',
        '    print(f"Extracted {len(df)} rows from {source_path}")',
        '    return df',
        '',
        'def transform(df: pd.DataFrame) -> pd.DataFrame:',
        '    """Clean and normalize data."""',
        '    df = df.dropna(subset=["user_id", "event_type"])',
        '    df["event_type"] = df["event_type"].str.lower().str.strip()',
        '    df["timestamp"] = pd.to_datetime(df["timestamp"])',
        '    df = df.drop_duplicates(subset=["user_id", "timestamp"])',
        '    print(f"Transformed: {len(df)} rows after cleaning")',
        '    return df',
        '',
        'def load(df: pd.DataFrame, table: str = "events") -> int:',
        '    """Load data into PostgreSQL."""',
        '    engine = create_engine(DB_URL)',
        '    rows = df.to_sql(table, engine, if_exists="append", index=False)',
        '    print(f"Loaded {rows} rows into {table}")',
        '    return rows',
        '',
        'def run(source_path: str = "data/events.csv"):',
        '    """Execute full ETL pipeline."""',
        '    df = extract(source_path)',
        '    df = transform(df)',
        '    loaded = load(df)',
        '    return loaded',
      ].join('\n') + '\n');
      writeFileSync(join(proj.path, "requirements.txt"), 'pandas==2.2.0\npyarrow==15.0.0\nsqlalchemy==2.0.27\npytest==8.0.0\npytest-cov==4.1.0\n');
      writeFileSync(join(proj.path, "config.py"), [
        '"""Pipeline configuration."""',
        'import os',
        '',
        'DB_URL = os.getenv("DATABASE_URL", "postgresql://localhost:5432/analytics")',
        'BATCH_SIZE = int(os.getenv("BATCH_SIZE", "1000"))',
        'MAX_RETRIES = int(os.getenv("MAX_RETRIES", "3"))',
        'RETRY_DELAY = float(os.getenv("RETRY_DELAY", "1.0"))',
      ].join('\n') + '\n');
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

// Verify claude CLI is available for real sessions
try {
  execSync('claude --version', { stdio: 'pipe' });
  log("✅", "Claude CLI available");
} catch {
  console.error("❌ Claude CLI not found. Install: npm install -g @anthropic-ai/claude-code");
  process.exit(1);
}

// Connect WebSocket for delivering prompts to interactive sessions
const ws = new WebSocket("ws://localhost:8080/ws");
await new Promise((resolve, reject) => {
  ws.on("open", resolve);
  ws.on("error", reject);
  setTimeout(() => reject(new Error("WebSocket timeout")), 5000);
});
log("🔌", "WebSocket connected for prompt delivery");

// Real Claude Code sessions — interactive mode with prompts sent as keyboard input.
// This produces the full Claude Code TUI experience: thinking indicators,
// tool use blocks, code diffs, and streaming output visible in real-time.
// (Note: -p mode buffers all output until completion, hiding the interactive UI)
const SESSION_DEFS = [
  {
    name: "backend · velocity-api",
    cwd: PROJECTS[0].path,
    model: "sonnet",
    agent: "backend",
    prompt: "Read all Go files in this project. Then add JWT-based authentication: create auth.go with /api/auth/login and /api/auth/signup handlers. Hash passwords with bcrypt, generate JWT tokens with HS256, and add middleware that validates the Authorization header. Also fix the security bugs you find in the existing handlers — especially the plaintext password storage and missing input validation. Do not ask questions — use reasonable defaults and write all the code.",
  },
  {
    name: "frontend · nova-dashboard",
    cwd: PROJECTS[1].path,
    model: "sonnet",
    agent: "frontend",
    prompt: "Read the existing React code in this project — especially Dashboard.tsx and api.ts. Then create a new AnalyticsDashboard.tsx component in src/components/ that replaces the basic Dashboard. Include: a 4-card stats summary row (total requests, avg latency, error rate, uptime), a data table showing recent API events with columns for timestamp/method/path/status/duration, and a service health section with colored status badges. Use TypeScript interfaces for all data shapes, React hooks for state and data fetching, and Tailwind CSS utility classes. Do not ask questions — make all design decisions yourself and write complete, production-ready code.",
  },
  {
    name: "qa · mercury-pipeline",
    cwd: PROJECTS[2].path,
    model: "sonnet",
    agent: "qa",
    prompt: "Read pipeline.py and config.py in this project. Then write a comprehensive pytest test suite: create tests/test_pipeline.py and tests/conftest.py. Cover extract() with tests for valid CSV, empty files, missing files, and malformed data. Cover transform() with tests for null handling, duplicate removal, type conversion, and edge cases. Cover load() with tests using a mocked database engine. Cover run() with an integration test. Use @pytest.fixture for shared data, @pytest.mark.parametrize for multiple inputs, and unittest.mock for external deps. Do not ask questions — write all tests directly.",
  },
  {
    name: "orchestrator · velocity-api",
    cwd: PROJECTS[0].path,
    model: "sonnet",
    agent: "orchestrator",
    prompt: "Read every file in this Go project: main.go, handlers.go, db.go, go.mod. Perform a thorough security audit. For each file, check for: plaintext password storage, missing input validation, unhandled errors from json.Decode, missing Content-Type headers, no authentication on endpoints, missing rate limiting, no CORS configuration, and the search endpoint injection risk. Write your findings as SECURITY-AUDIT.md with severity levels (CRITICAL/HIGH/MEDIUM/LOW), the specific vulnerable code, and complete fix code for each finding. Do not ask questions — audit everything and write the full report.",
  },
];

const createdSessions = [];
for (const sess of SESSION_DEFS) {
  // Launch Claude in interactive mode (no -p flag) — shows full TUI
  const result = await api("POST", "/api/sessions", {
    name: sess.name,
    command: "claude",
    args: [
      "--model", sess.model,
      "--dangerously-skip-permissions",
    ],
    cwd: sess.cwd,
    cols: 110,
    rows: 32,
    meta: {
      model: sess.model,
      agent: sess.agent,
      permissions: "bypass",
      channel: "none",
      group: "sprint",
    },
  });
  if (result?.id) {
    createdSessions.push(result.id);
    // Send prompt as keyboard input via WebSocket.
    // The terminal-manager queues writes until Claude's prompt is ready,
    // then flushes them — so this works even if sent immediately.
    ws.send(JSON.stringify({
      type: "terminal-input",
      sessionId: result.id,
      data: sess.prompt + "\r",
    }));
    log("🖥️", `Session ${sess.name} started + prompt queued`);
  } else {
    log("⚠️", `Failed to start session: ${sess.name}`);
  }
  // Stagger launches — server has a 4-concurrent-spawn limit
  await sleep(1500);
}

ws.close();
log("🖥️", `Started ${createdSessions.length} real Claude Code sessions (interactive mode)`);

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
log("⏳", "Waiting 20s for Claude sessions to start streaming output...");
await sleep(20000);

console.log("\n🎬 Demo seed complete!\n");
console.log("  Sessions:  " + createdSessions.length + " (real Claude Code)");
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
