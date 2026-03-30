import { readFile, readdir, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import type { WorkflowFlow, WorkflowRun, WorkflowStep, StepRichContent, ScanLogEntry, HandoffEntry } from "./types.js";
import { parseScanLog } from "../file-watcher.js";
import { getAgentSystemPath } from "../config.js";

function getSprintsDir(): string {
  return getAgentSystemPath("sprints") ?? "";
}

function getHandoffsDir(): string {
  return getAgentSystemPath("sprints/handoffs") ?? "";
}

async function safeRead(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Parse handoff files into structured entries */
async function loadHandoffs(): Promise<HandoffEntry[]> {
  try {
    const files = await readdir(getHandoffsDir());
    const results: HandoffEntry[] = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const raw = await safeRead(join(getHandoffsDir(), f));
      if (!raw) continue;
      try {
        const data = JSON.parse(raw) as Record<string, unknown>;
        const agent = (data["agent"] as string) ?? "unknown";
        const toMatch = f.match(/_to_(\w+)\.json$/);
        const to = toMatch ? toMatch[1]! : "orchestrator";
        const detail =
          (data["test_scope"] as string) ??
          (data["notes"] as string) ??
          (Array.isArray(data["deliverables"])
            ? (data["deliverables"] as string[]).join(", ")
            : f);
        results.push({ from: agent, to, file: f, detail, content: data });
      } catch {
        // skip invalid
      }
    }
    return results;
  } catch {
    return [];
  }
}

/** Extract task counts from current.md content */
function parseTaskCounts(content: string): { total: number; safe: number; medium: number; high: number } {
  let safe = 0;
  let medium = 0;
  let high = 0;

  // Count Task S*, M*, H* headers
  const safeMatches = content.match(/### Task S\d+/g);
  const mediumMatches = content.match(/### Task M\d+/g);
  const highMatches = content.match(/### Task H\d+/g);

  if (safeMatches) safe = safeMatches.length;
  if (mediumMatches) medium = mediumMatches.length;
  if (highMatches) high = highMatches.length;

  return { total: safe + medium + high, safe, medium, high };
}

/** Extract headings from current.md for build summary */
function extractBuildSummary(content: string): string[] {
  const headings: string[] = [];
  for (const line of content.split("\n")) {
    const match = line.match(/^##\s+(.+)$/);
    if (match && !match[1]!.startsWith("Status") && !match[1]!.startsWith("Data Contract") && !match[1]!.startsWith("Rollback")) {
      headings.push(match[1]!.trim());
    }
  }
  return headings;
}

/** Build rich content for PMO Scan step */
async function buildPmoScanRichContent(): Promise<StepRichContent> {
  const scanLogRaw = await safeRead(join(getSprintsDir(), "scan_log.md"));
  const entries: ScanLogEntry[] = scanLogRaw ? parseScanLog(scanLogRaw) : [];

  // Get last 10 meaningful entries (skip noise like "PMO scan starting/complete")
  const meaningfulEntries = entries.filter((e) => {
    const lower = e.detail.toLowerCase();
    if (lower.includes("scan starting") || lower.includes("scan complete")) return false;
    if (e.status === "INFO" && lower.length < 30) return false;
    return true;
  });
  const last10 = meaningfulEntries.slice(-10);
  const latestEntry = meaningfulEntries[meaningfulEntries.length - 1];

  // Extract ticket count from latest entry detail
  let ticketsFound = 0;
  const domains: string[] = [];
  if (latestEntry) {
    // Match "17 To Do tickets", "17 tickets", or "17 To Do (..."
    const ticketMatch = latestEntry.detail.match(/(\d+)\s+(?:To Do\s+)?(?:tickets?|To Do)/i);
    if (ticketMatch) ticketsFound = parseInt(ticketMatch[1]!, 10);

    // Extract domains mentioned
    for (const domain of ["frontend", "backend", "infrastructure", "security", "data", "devops"]) {
      if (latestEntry.detail.toLowerCase().includes(domain)) {
        domains.push(domain);
      }
    }
  }

  // Determine readiness
  let readinessStatus = "UNKNOWN";
  if (latestEntry) {
    if (latestEntry.status.includes("READY") && !latestEntry.status.includes("NOT")) {
      readinessStatus = "READY";
    } else if (latestEntry.status.includes("NOT READY")) {
      readinessStatus = "NOT READY";
    } else if (latestEntry.status.includes("INCOMPLETE")) {
      readinessStatus = "INCOMPLETE";
    } else {
      readinessStatus = latestEntry.status;
    }
  }

  return {
    type: "pmo-scan",
    scanEntries: last10,
    ticketsFound,
    domains,
    readinessStatus,
    fullScanLog: scanLogRaw ?? undefined,
  };
}

/** Build rich content for Readiness Report step */
async function buildReadinessRichContent(): Promise<StepRichContent> {
  const readyContent = await safeRead(join(getSprintsDir(), "ready.md"));
  if (!readyContent) {
    return { type: "readiness-report" };
  }

  // Extract scan result line
  let readinessStatus = "UNKNOWN";
  const scanResult = readyContent.match(/Scan result:\s*\*\*(.+?)\*\*/);
  if (scanResult) {
    readinessStatus = scanResult[1]!.includes("READY") && !scanResult[1]!.includes("NOT")
      ? "READY"
      : "NOT READY";
  }

  // Extract ticket count from ready.md
  let ticketsFound = 0;
  const ticketMatch = readyContent.match(/(\d+)\s+To Do tickets?/i);
  if (ticketMatch) ticketsFound = parseInt(ticketMatch[1]!, 10);

  // Extract domains from section headers
  const domains: string[] = [];
  const sectionHeaders = readyContent.match(/### (.+?) \(/g);
  if (sectionHeaders) {
    for (const header of sectionHeaders) {
      const name = header.replace(/### /, "").replace(/ \($/, "").trim();
      domains.push(name);
    }
  }

  // Build summary from recommended sprints
  const buildSummary: string[] = [];
  const sprintMatches = readyContent.match(/### Sprint [A-Z]: .+/g);
  if (sprintMatches) {
    for (const s of sprintMatches) {
      buildSummary.push(s.replace(/### /, ""));
    }
  }

  return {
    type: "readiness-report",
    readinessStatus,
    ticketsFound,
    domains,
    buildSummary,
    specPreview: readyContent.slice(0, 600),
    fullSpec: readyContent,
  };
}

/** Build rich content for Sprint Spec step */
async function buildSprintSpecRichContent(): Promise<StepRichContent> {
  const content = await safeRead(join(getSprintsDir(), "current.md"));
  if (!content) {
    return { type: "sprint-spec" };
  }

  const titleMatch = content.match(/^#\s+(?:Sprint:\s*)?(.+)$/m);
  const statusMatch = content.match(/^Status:\s*(.+)$/m);
  const createdMatch = content.match(/^Created:\s*(.+)$/m);

  const taskCounts = parseTaskCounts(content);

  // Extract agent assignment
  const agents: string[] = [];
  if (/frontend/i.test(content)) agents.push("frontend-worker");
  if (/backend/i.test(content)) agents.push("backend-worker");
  if (/qa|test/i.test(content)) agents.push("qa-tester");
  if (/security/i.test(content)) agents.push("security-reviewer");
  if (/orchestrator/i.test(content)) agents.push("orchestrator");
  if (/pmo/i.test(content)) agents.push("pmo");

  // Build preview - first meaningful 30 lines (skip frontmatter)
  const lines = content.split("\n");
  const previewLines = lines.slice(0, 40);
  const specPreview = previewLines.join("\n");

  return {
    type: "sprint-spec",
    sprintTitle: titleMatch ? titleMatch[1]!.trim() : "Unknown Sprint",
    sprintStatus: statusMatch ? statusMatch[1]!.trim() : undefined,
    sprintCreated: createdMatch ? createdMatch[1]!.trim() : undefined,
    taskCount: taskCounts,
    assignedAgents: agents,
    specPreview,
    fullSpec: content,
  };
}

/** Build rich content for Approval step */
async function buildApprovalRichContent(): Promise<StepRichContent> {
  const content = await safeRead(join(getSprintsDir(), "current.md"));
  if (!content) {
    return { type: "approval" };
  }

  const buildSummary = extractBuildSummary(content);
  const taskCounts = parseTaskCounts(content);

  // Estimate scope
  let estimatedScope = "Unknown";
  if (taskCounts.total > 0) {
    const hours = taskCounts.safe * 0.5 + taskCounts.medium * 1.5 + taskCounts.high * 3;
    estimatedScope = `${taskCounts.total} tasks (~${Math.round(hours)}h agent time)`;
  }

  return {
    type: "approval",
    buildSummary,
    estimatedScope,
    taskCount: taskCounts,
  };
}

/** Build rich content for build gate steps */
async function buildGateRichContent(
  gateId: string,
  stepStatus: string,
): Promise<StepRichContent> {
  const handoffs = await loadHandoffs();

  const gateChecks: string[] = [];
  const gateResults: string[] = [];
  let agentNotes = "";
  let filesChanged: number | undefined;
  let qaHealth: number | undefined;

  switch (gateId) {
    case "backend-build":
      gateChecks.push(
        "Views created and queryable",
        "Edge functions deployed",
        "RLS policies applied",
        "Migrations run successfully",
      );
      // Look for backend handoff
      for (const h of handoffs) {
        if (h.from === "backend-worker" || h.file.includes("backend")) {
          agentNotes = h.detail;
          if (h.content?.["files_changed"]) {
            const fc = h.content["files_changed"];
            filesChanged = Array.isArray(fc) ? fc.length : undefined;
          }
        }
      }
      if (stepStatus === "completed") {
        gateResults.push("All checks passed");
      }
      break;

    case "frontend-build":
      gateChecks.push(
        "TypeScript compiles (npx tsc --noEmit)",
        "npm run build passes",
        "German labels correct",
        "Components under 150 lines",
        "Server vs Client components correct",
      );
      for (const h of handoffs) {
        if (h.from === "frontend-worker" || h.file.includes("frontend")) {
          agentNotes = h.detail;
          if (h.content?.["files_changed"]) {
            const fc = h.content["files_changed"];
            filesChanged = Array.isArray(fc) ? fc.length : undefined;
          }
        }
      }
      if (stepStatus === "completed") {
        gateResults.push("Build passed", "TypeScript clean");
      }
      break;

    case "qa-test":
      gateChecks.push(
        "Smoke tests pass",
        "E2E tests pass",
        "Health score >= 95",
        "No P0/P1 bugs",
        "Regression check",
      );
      // Look for QA report
      for (const h of handoffs) {
        if (h.file === "qa_report.json" && h.content) {
          qaHealth = h.content["health_score"] as number | undefined;
          agentNotes = h.detail;
          const bugs = h.content["bugs"] as Array<{ severity: string }> | undefined;
          if (bugs) {
            gateResults.push(`${bugs.length} bug(s) found`);
            for (const bug of bugs) {
              gateResults.push(`  ${bug.severity}: ${(bug as Record<string, string>)["title"] ?? "unknown"}`);
            }
          }
          if (qaHealth) {
            gateResults.push(`Health score: ${qaHealth}%`);
          }
        }
      }
      if (stepStatus === "completed" && gateResults.length === 0) {
        gateResults.push("All tests passed");
      }
      break;
  }

  return {
    type: "gate",
    gateChecks,
    gateResults: gateResults.length > 0 ? gateResults : undefined,
    filesChanged,
    handoffs: handoffs.filter(
      (h) =>
        h.from.includes(gateId.replace("-build", "").replace("-test", "")) ||
        h.to.includes(gateId.replace("-build", "").replace("-test", "")),
    ),
    agentNotes: agentNotes || undefined,
    qaHealth,
  };
}

/** Build rich content for Deploy step */
async function buildDeployRichContent(): Promise<StepRichContent> {
  const handoffs = await loadHandoffs();
  const qaHandoff = handoffs.find((h) => h.file === "qa_report.json");

  return {
    type: "deploy",
    qaHealth: qaHandoff?.content?.["health_score"] as number | undefined,
    handoffs,
    deploySummary: qaHandoff
      ? `QA health: ${qaHandoff.content?.["health_score"] ?? "N/A"}% | Tests: ${(qaHandoff.content?.["summary"] as Record<string, number> | undefined)?.["total_tests"] ?? "?"}`
      : undefined,
  };
}

/** The 8 canonical steps for a sprint planning workflow */
function makeSteps(overrides?: Partial<Record<string, Partial<WorkflowStep>>>): WorkflowStep[] {
  const defaults: WorkflowStep[] = [
    {
      id: "pmo-scan",
      name: "PMO Scan",
      status: "pending",
      agents: ["pmo"],
      details: "Scan Notion Tasks DB for ready tickets.",
    },
    {
      id: "readiness-report",
      name: "Readiness Report",
      status: "pending",
      agents: ["pmo"],
      details: "Generate ready.md with ticket grouping and sprint recommendations.",
    },
    {
      id: "user-approval",
      name: "Sprint Approval",
      status: "pending",
      agents: [],
      action: { label: "Approve", type: "approve" },
      details: "Review sprint plan and approve or request changes.",
    },
    {
      id: "spec-generation",
      name: "Phase 0: Design & Spec",
      status: "pending",
      agents: ["orchestrator", "backend-worker", "frontend-worker", "qa-tester", "security-reviewer"],
      details: "Full team discussion. Orchestrator spawns agent team, generates current.md with tasks, acceptance criteria, and data contracts.",
    },
    {
      id: "backend-build",
      name: "Gate 1: Backend Build",
      status: "pending",
      agents: ["backend-worker", "security-reviewer"],
      details: "Backend builds views, edge functions, RLS policies, migrations. Security reviews.",
    },
    {
      id: "frontend-build",
      name: "Gate 2: Frontend Build",
      status: "pending",
      agents: ["frontend-worker", "security-reviewer"],
      details: "Frontend builds pages, components, hooks, types. TypeScript must compile. Security reviews.",
    },
    {
      id: "qa-test",
      name: "Gate 3: QA Testing",
      status: "pending",
      agents: ["qa-tester"],
      details: "QA tests on localhost. Health score must be >= 90. Loop: QA finds bugs -> frontend/backend fix -> QA retests -> repeat until passing.",
    },
    {
      id: "deploy",
      name: "Ship: Deploy & Archive",
      status: "pending",
      agents: ["orchestrator"],
      details: "Orchestrator pushes PR, archives sprint, updates memory.",
    },
  ];

  if (overrides) {
    for (const step of defaults) {
      const patch = overrides[step.id];
      if (patch) {
        Object.assign(step, patch);
      }
    }
  }

  return defaults;
}

function extractDateFromFilename(filename: string): string {
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1]! : "unknown";
}

function extractNameFromFilename(filename: string): string {
  return filename
    .replace(/\.md$/, "")
    .replace(/^\d{4}-\d{2}-\d{2}_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Parse archived sprints into completed runs */
async function parseArchiveRuns(): Promise<WorkflowRun[]> {
  const archiveDir = join(getSprintsDir(), "archive");
  try {
    const files = await readdir(archiveDir);
    const mdFiles = files
      .filter((f) => f.endsWith(".md"))
      .sort((a, b) => b.localeCompare(a));

    const runs: WorkflowRun[] = [];

    for (const file of mdFiles) {
      const date = extractDateFromFilename(file);
      const name = extractNameFromFilename(file);
      const content = await safeRead(join(archiveDir, file));

      const completedStep: Partial<WorkflowStep> = {
        status: "completed",
        completedAt: `${date}T23:59:00Z`,
      };
      const allCompleted: Partial<Record<string, Partial<WorkflowStep>>> = {};

      // Build rich content from archive file for the spec-generation step
      const archiveRichContent: StepRichContent = {
        type: "sprint-spec",
        sprintTitle: name,
        sprintStatus: "COMPLETED",
        sprintCreated: date,
        fullSpec: content ?? undefined,
        specPreview: content ? content.slice(0, 600) : undefined,
      };

      // Extract task counts and build summary from archive content
      if (content) {
        const taskCounts = parseTaskCounts(content);
        archiveRichContent.taskCount = taskCounts;
        const buildSummary = extractBuildSummary(content);
        archiveRichContent.buildSummary = buildSummary;

        // Extract agent assignment from content
        const assignedAgents: string[] = [];
        if (/frontend/i.test(content)) assignedAgents.push("frontend-worker");
        if (/backend/i.test(content)) assignedAgents.push("backend-worker");
        if (/qa|test/i.test(content)) assignedAgents.push("qa-tester");
        if (/security/i.test(content)) assignedAgents.push("security-reviewer");
        assignedAgents.push("orchestrator");
        archiveRichContent.assignedAgents = assignedAgents;
      }

      for (const id of [
        "pmo-scan",
        "readiness-report",
        "user-approval",
        "spec-generation",
        "backend-build",
        "frontend-build",
        "qa-test",
        "deploy",
      ]) {
        allCompleted[id] = { ...completedStep };
        // Attach the archive content to the spec-generation step
        if (id === "spec-generation") {
          allCompleted[id]!.richContent = archiveRichContent;
          allCompleted[id]!.details = `Archived sprint: ${name}`;
        }
      }

      // Try to extract agents from content
      const agents = new Set<string>();
      if (content) {
        if (/backend/i.test(content)) agents.add("backend-worker");
        if (/frontend/i.test(content)) agents.add("frontend-worker");
        if (/qa|test/i.test(content)) agents.add("qa-tester");
        if (/security/i.test(content)) agents.add("security-reviewer");
        agents.add("orchestrator");
        agents.add("pmo");
      }

      runs.push({
        id: `archive-${file.replace(/\.md$/, "")}`,
        flowId: "sprint-planning",
        name,
        status: "completed",
        startedAt: `${date}T09:00:00Z`,
        completedAt: `${date}T23:59:00Z`,
        steps: makeSteps(allCompleted),
        stats: {
          agentsUsed: Array.from(agents),
        },
      });
    }

    return runs;
  } catch {
    return [];
  }
}

/** Parse current state into an active/waiting run */
async function parseCurrentRun(): Promise<WorkflowRun | null> {
  const hasReady = await fileExists(join(getSprintsDir(), "ready.md"));
  const hasCurrent = await fileExists(join(getSprintsDir(), "current.md"));

  if (!hasReady && !hasCurrent) return null;

  const scanLog = await safeRead(join(getSprintsDir(), "scan_log.md"));
  const currentContent = await safeRead(join(getSprintsDir(), "current.md"));

  // Extract sprint name from current.md title
  let sprintName = "Current Sprint";
  if (currentContent) {
    const titleMatch = currentContent.match(/^#\s+(?:Sprint:\s*)?(.+)$/m);
    if (titleMatch) sprintName = titleMatch[1]!.trim();
  } else if (hasReady) {
    sprintName = "Sprint Readiness";
  }

  // Extract status from current.md
  let currentStatus: string | null = null;
  if (currentContent) {
    const statusMatch = currentContent.match(/^Status:\s*(.+)$/m);
    if (statusMatch) currentStatus = statusMatch[1]!.trim().toUpperCase();
  }

  // Determine step states
  const stepOverrides: Partial<Record<string, Partial<WorkflowStep>>> = {};

  // Build rich content for all steps
  const pmoRich = await buildPmoScanRichContent();
  const readinessRich = await buildReadinessRichContent();
  const specRich = await buildSprintSpecRichContent();
  const approvalRich = await buildApprovalRichContent();
  const backendGateRich = await buildGateRichContent("backend-build", "pending");
  const frontendGateRich = await buildGateRichContent("frontend-build", "pending");
  const qaGateRich = await buildGateRichContent("qa-test", "pending");
  const deployRich = await buildDeployRichContent();

  // Step 1: PMO Scan -- completed if scan_log exists with entries
  if (scanLog && scanLog.trim().length > 0) {
    const lastLine = scanLog.trim().split("\n").pop() ?? "";
    stepOverrides["pmo-scan"] = {
      status: "completed",
      details: lastLine,
      richContent: pmoRich,
    };
  }

  // Step 2: Readiness Report -- completed if ready.md exists
  if (hasReady) {
    const readyContent = await safeRead(join(getSprintsDir(), "ready.md"));
    let summary = "Ready report generated.";
    if (readyContent) {
      const scanResult = readyContent.match(/Scan result:\s*\*\*(.+?)\*\*/);
      if (scanResult) summary = scanResult[1]!;
    }
    stepOverrides["readiness-report"] = {
      status: "completed",
      details: summary,
      richContent: readinessRich,
    };
  }

  // Step 3+: depends on current.md existence and status
  if (hasCurrent && currentContent) {
    if (
      currentStatus?.includes("PLANNING") ||
      currentStatus?.includes("AWAITING")
    ) {
      stepOverrides["user-approval"] = {
        status: "waiting",
        action: { label: "Approve Sprint", type: "approve" },
        details: "Review the sprint spec in current.md and approve to start execution.",
        richContent: approvalRich,
      };
      stepOverrides["spec-generation"] = {
        status: "completed",
        details: `Spec generated: ${sprintName}`,
        richContent: specRich,
      };
    } else if (currentStatus?.includes("RUNNING") || currentStatus?.includes("IN PROGRESS")) {
      stepOverrides["user-approval"] = { status: "completed", richContent: approvalRich };
      stepOverrides["spec-generation"] = { status: "completed", richContent: specRich };
      stepOverrides["backend-build"] = { status: "active", richContent: backendGateRich };
      stepOverrides["frontend-build"] = { status: "pending", richContent: frontendGateRich };
    } else if (currentStatus?.includes("COMPLETE") || currentStatus?.includes("DONE")) {
      for (const id of ["user-approval", "spec-generation"]) {
        stepOverrides[id] = { status: "completed" };
      }
      stepOverrides["backend-build"] = { status: "completed", richContent: await buildGateRichContent("backend-build", "completed") };
      stepOverrides["frontend-build"] = { status: "completed", richContent: await buildGateRichContent("frontend-build", "completed") };
      stepOverrides["qa-test"] = { status: "completed", richContent: await buildGateRichContent("qa-test", "completed") };
      stepOverrides["deploy"] = {
        status: "waiting",
        action: { label: "Deploy & Archive", type: "go" },
        richContent: deployRich,
      };
    }
  } else if (hasReady && !hasCurrent) {
    stepOverrides["user-approval"] = {
      status: "waiting",
      action: { label: "Start Sprint Planning", type: "go" },
      details: "Tickets are ready. Approve to generate sprint spec.",
      richContent: approvalRich,
    };
  }

  // Always attach rich content to pending steps too so expansion shows what to expect
  if (!stepOverrides["pmo-scan"]?.richContent) {
    stepOverrides["pmo-scan"] = { ...(stepOverrides["pmo-scan"] ?? {}), richContent: pmoRich };
  }
  if (!stepOverrides["readiness-report"]?.richContent) {
    stepOverrides["readiness-report"] = { ...(stepOverrides["readiness-report"] ?? {}), richContent: readinessRich };
  }
  if (!stepOverrides["spec-generation"]?.richContent) {
    stepOverrides["spec-generation"] = { ...(stepOverrides["spec-generation"] ?? {}), richContent: specRich };
  }
  if (!stepOverrides["backend-build"]?.richContent) {
    stepOverrides["backend-build"] = { ...(stepOverrides["backend-build"] ?? {}), richContent: backendGateRich };
  }
  if (!stepOverrides["frontend-build"]?.richContent) {
    stepOverrides["frontend-build"] = { ...(stepOverrides["frontend-build"] ?? {}), richContent: frontendGateRich };
  }
  if (!stepOverrides["qa-test"]?.richContent) {
    stepOverrides["qa-test"] = { ...(stepOverrides["qa-test"] ?? {}), richContent: qaGateRich };
  }
  if (!stepOverrides["deploy"]?.richContent) {
    stepOverrides["deploy"] = { ...(stepOverrides["deploy"] ?? {}), richContent: deployRich };
  }

  const runStatus: WorkflowRun["status"] = Object.values(stepOverrides).some(
    (s) => s?.status === "waiting",
  )
    ? "waiting"
    : Object.values(stepOverrides).some((s) => s?.status === "active")
      ? "running"
      : "completed";

  const agents = new Set<string>(["pmo", "orchestrator"]);
  if (currentContent) {
    if (/backend/i.test(currentContent)) agents.add("backend-worker");
    if (/frontend/i.test(currentContent)) agents.add("frontend-worker");
    if (/qa|test/i.test(currentContent)) agents.add("qa-tester");
    if (/security/i.test(currentContent)) agents.add("security-reviewer");
  }

  return {
    id: "current",
    flowId: "sprint-planning",
    name: sprintName,
    status: runStatus,
    startedAt: new Date().toISOString(),
    steps: makeSteps(stepOverrides),
    stats: {
      agentsUsed: Array.from(agents),
    },
  };
}

export async function getSprintPlanningFlow(): Promise<WorkflowFlow> {
  const archiveRuns = await parseArchiveRuns();
  const currentRun = await parseCurrentRun();

  const runs: WorkflowRun[] = [];
  if (currentRun) runs.push(currentRun);
  runs.push(...archiveRuns);

  return {
    id: "sprint-planning",
    name: "Sprint Planning",
    description: "PMO scan, readiness report, approval, spec, build, test, deploy",
    icon: "Rocket",
    runs,
  };
}
