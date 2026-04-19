import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { register as pollerRegister, unregister as pollerUnregister } from "./services/poller.js";

// ---------- Types ----------

export interface Automation {
  id: string;
  name: string;
  description: string;
  schedule: string; // "every 2h", "every 6h", "daily", "weekly", "on-push"
  agent: string;
  model: "opus" | "sonnet" | "haiku";
  prompt: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
}

export interface SuggestedAction {
  id: string;
  title: string;
  description: string;
  agent: string;
  prompt: string;
  approved: boolean;
}

export interface AutomationReport {
  id: string;
  automationId: string;
  automationName: string;
  timestamp: string;
  status: "pending" | "approved" | "dismissed";
  summary: string;
  suggestedActions: SuggestedAction[];
}

export interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  defaultSchedule: string;
  defaultModel: "opus" | "sonnet" | "haiku";
  defaultPrompt: string;
}

// ---------- Constants ----------

const REPORTS_DIR = join(process.cwd(), ".agent-studio", "reports");

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: "code-health",
    name: "Code Health",
    description: "Runs type-check, tests, and audit — reports failures",
    icon: "HeartPulse",
    defaultSchedule: "every 6h",
    defaultModel: "sonnet",
    defaultPrompt:
      "Run the following checks and produce a markdown report:\n1. `npx tsc --noEmit` — report any type errors\n2. `npm test` — report test failures\n3. `npm audit` — report vulnerabilities\n\nFormat the report with sections for each check. List specific issues found. End with a summary and suggested actions.",
  },
  {
    id: "pr-reviewer",
    name: "PR Reviewer",
    description: "Reviews open PRs and adds review comments",
    icon: "GitPullRequest",
    defaultSchedule: "every 2h",
    defaultModel: "opus",
    defaultPrompt:
      "Check for open pull requests using `gh pr list`. For each open PR:\n1. Read the diff with `gh pr diff <number>`\n2. Check for common issues: missing tests, security concerns, style violations\n3. Produce a markdown report with findings per PR\n\nSuggest specific actions for each PR that needs attention.",
  },
  {
    id: "security-scanner",
    name: "Security Scanner",
    description: "Audits dependencies and checks for secrets in code",
    icon: "Shield",
    defaultSchedule: "daily",
    defaultModel: "sonnet",
    defaultPrompt:
      "Run a security scan:\n1. `npm audit` — list vulnerabilities by severity\n2. Search for potential secrets: API keys, tokens, passwords in source files (skip node_modules)\n3. Check for .env files that might be committed\n\nProduce a markdown report with severity levels. Suggest specific fixes for each finding.",
  },
  {
    id: "dependency-updater",
    name: "Dependency Updater",
    description: "Checks for outdated packages and suggests updates",
    icon: "PackageCheck",
    defaultSchedule: "weekly",
    defaultModel: "sonnet",
    defaultPrompt:
      "Check for outdated dependencies:\n1. Run `npm outdated` and list all outdated packages\n2. For each major version bump, check the changelog for breaking changes\n3. Categorize updates as: safe (patch), review (minor), breaking (major)\n\nProduce a markdown report. Suggest which packages to update and in what order.",
  },
  {
    id: "custom",
    name: "Custom",
    description: "Write your own automation prompt",
    icon: "Wand2",
    defaultSchedule: "daily",
    defaultModel: "sonnet",
    defaultPrompt: "",
  },
];

// ---------- Helpers ----------

function parseScheduleMs(schedule: string): number | null {
  const lower = schedule.toLowerCase().trim();
  if (lower === "daily") return 86_400_000;
  if (lower === "weekly") return 604_800_000;
  if (lower === "on-push") return null; // Event-driven, not interval

  // "every N<unit>" where unit is h (hours), m (minutes), s (seconds).
  // Supports optional whitespace between number and unit.
  const everyMatch = lower.match(/^every\s+(\d+)\s*(h|m|s)$/);
  if (everyMatch) {
    const n = parseInt(everyMatch[1], 10);
    const unit = everyMatch[2];
    if (unit === "h") return n * 3_600_000;
    if (unit === "m") return n * 60_000;
    if (unit === "s") return n * 1_000;
  }

  // Fallback: bare "<N><unit>" (e.g. "2h", "5m", "30s")
  const bareMatch = lower.match(/^(\d+)\s*(h|m|s)$/);
  if (bareMatch) {
    const n = parseInt(bareMatch[1], 10);
    const unit = bareMatch[2];
    if (unit === "h") return n * 3_600_000;
    if (unit === "m") return n * 60_000;
    if (unit === "s") return n * 1_000;
  }

  return null;
}

function ensureReportsDir(): void {
  if (!existsSync(REPORTS_DIR)) {
    mkdirSync(REPORTS_DIR, { recursive: true });
  }
}

function loadReportsFromDisk(): AutomationReport[] {
  ensureReportsDir();
  const files = readdirSync(REPORTS_DIR).filter((f) => f.endsWith(".json"));
  const reports: AutomationReport[] = [];
  for (const file of files) {
    try {
      const raw = readFileSync(join(REPORTS_DIR, file), "utf-8");
      reports.push(JSON.parse(raw) as AutomationReport);
    } catch {
      // Skip invalid files
    }
  }
  // Sort newest first
  reports.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return reports;
}

function saveReportToDisk(report: AutomationReport): void {
  ensureReportsDir();
  const filename = `${report.id}.json`;
  writeFileSync(join(REPORTS_DIR, filename), JSON.stringify(report, null, 2), "utf-8");
}

// ---------- Engine ----------

type EventListener = (event: { type: string; payload: unknown }) => void;

export class AutomationEngine {
  private automations: Automation[] = [];
  private reports: AutomationReport[] = [];
  /** Set of automation ids currently registered with the poller. */
  private registered = new Set<string>();
  private listeners = new Set<EventListener>();
  private cwd: string;

  private pollerKey(id: string): string {
    return `automations.${id}`;
  }

  constructor(cwd?: string) {
    this.cwd = cwd ?? process.cwd();
    this.reports = loadReportsFromDisk();
  }

  /** Load automations from config array */
  loadAutomations(automations: Automation[]): void {
    // Stop all existing timers
    this.stopAll();
    this.automations = automations;

    // Start enabled automations
    for (const auto of this.automations) {
      if (auto.enabled) {
        this.scheduleAutomation(auto);
      }
    }
  }

  /** Get all automations */
  getAutomations(): Automation[] {
    return this.automations;
  }

  /** Get a single automation */
  getAutomation(id: string): Automation | undefined {
    return this.automations.find((a) => a.id === id);
  }

  /** Add a new automation */
  addAutomation(auto: Omit<Automation, "id">): Automation {
    const newAuto: Automation = { ...auto, id: randomUUID() };
    this.automations.push(newAuto);
    if (newAuto.enabled) {
      this.scheduleAutomation(newAuto);
    }
    return newAuto;
  }

  /** Update an existing automation */
  updateAutomation(id: string, updates: Partial<Automation>): Automation | null {
    const idx = this.automations.findIndex((a) => a.id === id);
    if (idx === -1) return null;

    const wasEnabled = this.automations[idx].enabled;
    this.automations[idx] = { ...this.automations[idx], ...updates };
    const auto = this.automations[idx];

    // Handle enable/disable transitions
    if (wasEnabled && !auto.enabled) {
      this.clearTimer(id);
    } else if (!wasEnabled && auto.enabled) {
      this.scheduleAutomation(auto);
    } else if (auto.enabled && updates.schedule) {
      // Reschedule if schedule changed
      this.clearTimer(id);
      this.scheduleAutomation(auto);
    }

    return auto;
  }

  /** Remove an automation */
  removeAutomation(id: string): boolean {
    const idx = this.automations.findIndex((a) => a.id === id);
    if (idx === -1) return false;
    this.clearTimer(id);
    this.automations.splice(idx, 1);
    return true;
  }

  /** Trigger a manual run */
  async runAutomation(id: string): Promise<AutomationReport | null> {
    const auto = this.automations.find((a) => a.id === id);
    if (!auto) return null;
    return this.executeAutomation(auto);
  }

  /** Get all reports */
  getReports(): AutomationReport[] {
    return this.reports;
  }

  /** Get a single report */
  getReport(id: string): AutomationReport | undefined {
    return this.reports.find((r) => r.id === id);
  }

  /** Approve a report (mark all actions as approved) */
  approveReport(id: string): AutomationReport | null {
    const report = this.reports.find((r) => r.id === id);
    if (!report) return null;
    report.status = "approved";
    for (const action of report.suggestedActions) {
      action.approved = true;
    }
    saveReportToDisk(report);
    return report;
  }

  /** Dismiss a report */
  dismissReport(id: string): AutomationReport | null {
    const report = this.reports.find((r) => r.id === id);
    if (!report) return null;
    report.status = "dismissed";
    saveReportToDisk(report);
    return report;
  }

  /** Approve a single action within a report */
  approveAction(reportId: string, actionId: string): AutomationReport | null {
    const report = this.reports.find((r) => r.id === reportId);
    if (!report) return null;
    const action = report.suggestedActions.find((a) => a.id === actionId);
    if (!action) return null;
    action.approved = true;
    saveReportToDisk(report);
    return report;
  }

  /** Subscribe to events */
  onEvent(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Stop all timers */
  stopAll(): void {
    for (const id of [...this.registered]) {
      this.clearTimer(id);
    }
  }

  /** Get config-serializable automations */
  toConfig(): Automation[] {
    return this.automations.map((a) => ({ ...a }));
  }

  // ---------- Private ----------

  private scheduleAutomation(auto: Automation): void {
    const intervalMs = parseScheduleMs(auto.schedule);
    if (!intervalMs) return; // on-push or unparseable

    // Calculate next run
    auto.nextRun = new Date(Date.now() + intervalMs).toISOString();

    // Route through the unified poller so this automation shows up in
    // /api/debug/poller-stats under the `automations.<id>` key (plan task 3b).
    pollerRegister(this.pollerKey(auto.id), intervalMs, () => this.executeAutomation(auto));
    this.registered.add(auto.id);
  }

  private clearTimer(id: string): void {
    if (this.registered.has(id)) {
      pollerUnregister(this.pollerKey(id));
      this.registered.delete(id);
    }
  }

  private async executeAutomation(auto: Automation): Promise<AutomationReport> {
    auto.lastRun = new Date().toISOString();

    // Calculate next run
    const intervalMs = parseScheduleMs(auto.schedule);
    if (intervalMs) {
      auto.nextRun = new Date(Date.now() + intervalMs).toISOString();
    }

    // Run Claude headlessly with --print
    const output = await this.runHeadless(auto);

    // Parse output into report
    const report = this.parseReport(auto, output);
    this.reports.unshift(report);
    saveReportToDisk(report);

    // Notify listeners
    this.emit({ type: "automation-report", payload: report });

    return report;
  }

  private runHeadless(auto: Automation): Promise<string> {
    return new Promise((resolve) => {
      const args = ["--print", "--model", auto.model];
      if (auto.agent && auto.agent !== "none") {
        args.push("--agent", auto.agent);
      }
      args.push(auto.prompt);

      try {
        const proc = spawn("claude", args, {
          cwd: this.cwd,
          env: { ...process.env },
          timeout: 300_000, // 5 min max
        });

        let stdout = "";
        let stderr = "";

        proc.stdout.on("data", (data: Buffer) => {
          stdout += data.toString("utf-8");
        });

        proc.stderr.on("data", (data: Buffer) => {
          stderr += data.toString("utf-8");
        });

        proc.on("close", () => {
          resolve(stdout || stderr || "(no output)");
        });

        proc.on("error", () => {
          resolve("(automation failed to start — is `claude` CLI installed?)");
        });
      } catch {
        resolve("(automation failed to spawn)");
      }
    });
  }

  private parseReport(auto: Automation, output: string): AutomationReport {
    // Try to extract suggested actions from the output
    const actions: SuggestedAction[] = [];
    const actionPattern = /(?:suggested action|recommendation|fix|todo)[\s:]*(.+)/gi;
    let match: RegExpExecArray | null;
    while ((match = actionPattern.exec(output)) !== null) {
      actions.push({
        id: randomUUID(),
        title: match[1].trim().slice(0, 100),
        description: match[1].trim(),
        agent: auto.agent || "none",
        prompt: `Fix: ${match[1].trim()}`,
        approved: false,
      });
    }

    return {
      id: randomUUID(),
      automationId: auto.id,
      automationName: auto.name,
      timestamp: new Date().toISOString(),
      status: "pending",
      summary: output,
      suggestedActions: actions,
    };
  }

  private emit(event: { type: string; payload: unknown }): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
