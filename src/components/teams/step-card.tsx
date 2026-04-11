"use client";

import { useState } from "react";
import {
  ChevronRight,
  Check,
  Loader2,
  Clock,
  Circle,
  X,
  FileText,
  ArrowRight,
  Shield,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkflowStep, StepRichContent, ScanLogEntry, HandoffEntry } from "@/stores/workflows";

const STATUS_CONFIG: Record<
  WorkflowStep["status"],
  { icon: typeof Check; color: string; bg: string; borderColor: string }
> = {
  completed: {
    icon: Check,
    color: "text-console-success",
    bg: "bg-console-success/10",
    borderColor: "border-l-console-success",
  },
  active: {
    icon: Loader2,
    color: "text-console-accent",
    bg: "bg-console-accent/10",
    borderColor: "border-l-console-accent",
  },
  waiting: {
    icon: Clock,
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    borderColor: "border-l-amber-400",
  },
  pending: {
    icon: Circle,
    color: "text-console-dim",
    bg: "bg-console-faint/50",
    borderColor: "border-l-console-dim",
  },
  failed: {
    icon: X,
    color: "text-console-error",
    bg: "bg-console-error/10",
    borderColor: "border-l-console-error",
  },
};

const AGENT_COLORS: Record<string, string> = {
  pmo: "bg-blue-500/20 text-blue-400",
  orchestrator: "bg-purple-500/20 text-purple-400",
  "backend-worker": "bg-emerald-500/20 text-emerald-400",
  "frontend-worker": "bg-orange-500/20 text-orange-400",
  "qa-tester": "bg-cyan-500/20 text-cyan-400",
  "security-reviewer": "bg-red-500/20 text-red-400",
};

export function StepCard({ step }: { step: WorkflowStep }) {
  const [expanded, setExpanded] = useState(false);
  const config = STATUS_CONFIG[step.status];
  const Icon = config.icon;

  // Pending steps never expand (nothing to show yet)
  const hasContent = !!(step.richContent || step.details || step.action);
  const canExpand = step.status !== "pending" && hasContent;

  return (
    <div
      className={cn(
        "rounded-md border border-l-[3px] transition-all",
        // Status-specific card styling
        step.status === "waiting"
          ? "border-amber-400/40 border-l-amber-400 bg-amber-400/[0.04] shadow-sm shadow-amber-400/10"
          : step.status === "completed"
            ? "border-console-border border-l-console-success bg-transparent"
            : step.status === "active"
              ? "border-console-accent/40 border-l-console-accent bg-console-accent/[0.03] shadow-sm shadow-console-accent/10"
              : step.status === "failed"
                ? "border-console-error/40 border-l-console-error bg-console-error/[0.03]"
                : "border-console-border/60 border-l-console-dim/40 bg-transparent opacity-50",
      )}
    >
      {/* Collapsed row */}
      <button
        onClick={() => canExpand && setExpanded(!expanded)}
        disabled={!canExpand}
        className={cn(
          "flex items-center gap-2.5 w-full px-3 py-2.5 text-left transition-colors",
          canExpand && "hover:bg-console-faint/30 cursor-pointer",
          !canExpand && "cursor-default",
        )}
      >
        {/* Status icon */}
        <div className={cn("shrink-0 w-5 h-5 flex items-center justify-center rounded-full", config.bg)}>
          <Icon
            className={cn(
              "w-3 h-3",
              config.color,
              step.status === "active" && "animate-spin",
            )}
          />
        </div>

        {/* Step name */}
        <span
          className={cn(
            "text-[11px] font-medium flex-1 min-w-0 truncate",
            step.status === "waiting"
              ? "text-amber-300"
              : step.status === "pending"
                ? "text-console-dim"
                : step.status === "completed"
                  ? "text-console-muted"
                  : "text-console-text",
          )}
        >
          {step.name}
        </span>

        {/* Agent badges */}
        <div className="flex items-center gap-1 shrink-0">
          {step.agents.map((agent) => (
            <span
              key={agent}
              className={cn(
                "inline-flex px-1.5 py-0.5 rounded text-[8px] font-mono",
                step.status === "pending"
                  ? "bg-console-faint/50 text-console-dim"
                  : (AGENT_COLORS[agent] ?? "bg-console-faint text-console-muted"),
              )}
            >
              {agent.replace("-worker", "").replace("-tester", "").replace("-reviewer", "")}
            </span>
          ))}
        </div>

        {/* Duration for completed steps */}
        {step.durationMs != null && (
          <span className="text-[9px] text-console-dim font-mono shrink-0">
            {formatDuration(step.durationMs)}
          </span>
        )}
        {step.status === "completed" && step.completedAt && step.startedAt && step.durationMs == null && (
          <span className="text-[9px] text-console-dim/60 font-mono shrink-0">
            done
          </span>
        )}

        {/* Expand chevron -- hidden for pending */}
        {canExpand && (
          <ChevronRight
            className={cn(
              "w-3 h-3 text-console-dim transition-transform duration-150 shrink-0",
              expanded && "rotate-90",
            )}
          />
        )}
      </button>

      {/* Expanded rich content */}
      {expanded && canExpand && (
        <div className="px-3 pb-3 pt-0 border-t border-console-border/50">
          {step.richContent ? (
            <RichContentRenderer content={step.richContent} stepStatus={step.status} />
          ) : step.details ? (
            <p className="text-[10px] text-console-muted leading-relaxed mt-2 whitespace-pre-wrap">
              {step.details}
            </p>
          ) : null}

          {step.action && (
            <div className="mt-3">
              <button
                onClick={() => {
                  // Fetch home dir from config, then create orchestrator session
                  void (async () => {
                    let cwd = "~";
                    try {
                      const cfgRes = await fetch("/api/config");
                      if (cfgRes.ok) {
                        const cfg = await cfgRes.json() as { homeDir: string; cwd: string };
                        cwd = cfg.cwd;
                      }
                    } catch { /* use default */ }
                    await fetch("/api/sessions", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        name: "orchestrator",
                        command: "claude",
                        args: ["--dangerously-skip-permissions", "--model", "opus", "--agent", "orchestrator"],
                        cwd,
                        meta: {
                          model: "opus",
                          agent: "orchestrator",
                          permissions: "bypass",
                          channel: "none",
                          group: "sprint",
                        },
                      }),
                    });
                  })();
                }}
                className={cn(
                  "rounded font-medium transition-all",
                  step.status === "waiting"
                    ? "px-5 py-2.5 text-xs bg-amber-500 text-black hover:bg-amber-400 animate-pulse shadow-lg shadow-amber-500/25"
                    : "px-3 py-1.5 text-[10px] bg-console-accent text-black hover:bg-console-accent/80",
                )}
              >
                {step.action.label}
              </button>
              {step.status === "waiting" && (
                <p className="text-[9px] text-amber-400/60 mt-1.5">
                  Creates an orchestrator session to handle this step.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RichContentRenderer({ content, stepStatus }: { content: StepRichContent; stepStatus: string }) {
  switch (content.type) {
    case "pmo-scan":
      return <PmoScanContent content={content} />;
    case "readiness-report":
      return <ReadinessContent content={content} />;
    case "sprint-spec":
      return <SprintSpecContent content={content} />;
    case "approval":
      return <ApprovalContent content={content} />;
    case "gate":
      return <GateContent content={content} stepStatus={stepStatus} />;
    case "deploy":
      return <DeployContent content={content} />;
    default:
      return null;
  }
}

// ---- PMO Scan Expanded Content ----
function PmoScanContent({ content }: { content: StepRichContent }) {
  const [showFull, setShowFull] = useState(false);

  return (
    <div className="mt-2 space-y-2.5">
      {/* Readiness Badge */}
      {content.readinessStatus && (
        <div className="flex items-center gap-2">
          <StatusBadge status={content.readinessStatus} />
          {content.ticketsFound != null && content.ticketsFound > 0 && (
            <span className="text-[10px] text-console-muted">
              {content.ticketsFound} tickets found
            </span>
          )}
          {content.domains && content.domains.length > 0 && (
            <span className="text-[10px] text-console-dim">
              in {content.domains.join(", ")}
            </span>
          )}
        </div>
      )}

      {/* Latest scan entries */}
      {content.scanEntries && content.scanEntries.length > 0 && (
        <div className="space-y-1">
          <span className="text-[9px] text-console-dim uppercase tracking-wider font-medium">
            Recent Scans
          </span>
          <div className="space-y-0.5 max-h-40 overflow-y-auto">
            {(showFull ? content.scanEntries : content.scanEntries.slice(-3)).map((entry, i) => (
              <ScanEntry key={i} entry={entry} />
            ))}
          </div>
        </div>
      )}

      {/* View full toggle */}
      {content.scanEntries && content.scanEntries.length > 3 && (
        <button
          onClick={() => setShowFull(!showFull)}
          className="text-[9px] text-console-accent hover:text-console-accent/80 transition-colors flex items-center gap-1"
        >
          {showFull ? (
            <>
              <ChevronDown className="w-2.5 h-2.5 rotate-180" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="w-2.5 h-2.5" />
              View all {content.scanEntries.length} entries
            </>
          )}
        </button>
      )}
    </div>
  );
}

function ScanEntry({ entry }: { entry: ScanLogEntry }) {
  const isReady = entry.status.includes("READY") && !entry.status.includes("NOT");
  const isNotReady = entry.status.includes("NOT READY");

  return (
    <div className="flex items-start gap-2 py-1 px-2 rounded bg-console-faint/30">
      <span
        className={cn(
          "shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full",
          isReady ? "bg-console-success" : isNotReady ? "bg-console-error" : "bg-console-dim",
        )}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-console-dim font-mono shrink-0">
            {formatTimestamp(entry.timestamp)}
          </span>
          <span
            className={cn(
              "text-[8px] px-1 py-0.5 rounded font-medium",
              isReady
                ? "bg-console-success/15 text-console-success"
                : isNotReady
                  ? "bg-console-error/15 text-console-error"
                  : "bg-console-faint text-console-dim",
            )}
          >
            {entry.status}
          </span>
        </div>
        <p className="text-[9px] text-console-muted leading-relaxed mt-0.5 break-words">
          {entry.detail.length > 200 ? entry.detail.slice(0, 200) + "..." : entry.detail}
        </p>
      </div>
    </div>
  );
}

// ---- Readiness Report Content ----
function ReadinessContent({ content }: { content: StepRichContent }) {
  const [showFull, setShowFull] = useState(false);

  return (
    <div className="mt-2 space-y-2.5">
      {content.readinessStatus && (
        <div className="flex items-center gap-2">
          <StatusBadge status={content.readinessStatus} />
          {content.ticketsFound != null && content.ticketsFound > 0 && (
            <span className="text-[10px] text-console-muted">
              {content.ticketsFound} To Do tickets across {content.domains?.length ?? 0} domains
            </span>
          )}
        </div>
      )}

      {/* Sprint recommendations */}
      {content.buildSummary && content.buildSummary.length > 0 && (
        <div className="space-y-1">
          <span className="text-[9px] text-console-dim uppercase tracking-wider font-medium">
            Recommended Sprints
          </span>
          {content.buildSummary.map((item, i) => (
            <div key={i} className="flex items-start gap-1.5 py-0.5">
              <ArrowRight className="w-2.5 h-2.5 text-console-accent shrink-0 mt-0.5" />
              <span className="text-[10px] text-console-muted">{item}</span>
            </div>
          ))}
        </div>
      )}

      {/* Preview / Full */}
      {content.specPreview && !showFull && (
        <div className="bg-console-faint/30 rounded p-2 max-h-32 overflow-y-auto">
          <p className="text-[9px] text-console-dim font-mono whitespace-pre-wrap leading-relaxed">
            {content.specPreview}
          </p>
        </div>
      )}

      {showFull && content.fullSpec && (
        <div className="bg-console-faint/30 rounded p-2.5 max-h-64 overflow-y-auto">
          <MarkdownRenderer text={content.fullSpec} />
        </div>
      )}

      {content.fullSpec && (
        <button
          onClick={() => setShowFull(!showFull)}
          className="text-[9px] text-console-accent hover:text-console-accent/80 transition-colors flex items-center gap-1"
        >
          <FileText className="w-2.5 h-2.5" />
          {showFull ? "Hide full report" : "View full report"}
        </button>
      )}
    </div>
  );
}

// ---- Sprint Spec Content ----
function SprintSpecContent({ content }: { content: StepRichContent }) {
  const [showFull, setShowFull] = useState(false);

  return (
    <div className="mt-2 space-y-2.5">
      {/* Sprint info header */}
      <div className="flex flex-wrap items-center gap-2">
        {content.sprintTitle && (
          <span className="text-[10px] font-medium text-console-text">
            {content.sprintTitle}
          </span>
        )}
        {content.sprintStatus && (
          <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-400 font-medium">
            {content.sprintStatus}
          </span>
        )}
        {content.sprintCreated && (
          <span className="text-[9px] text-console-dim">
            Created {content.sprintCreated}
          </span>
        )}
      </div>

      {/* Task counts */}
      {content.taskCount && content.taskCount.total > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-console-muted font-medium">
            {content.taskCount.total} tasks
          </span>
          <div className="flex items-center gap-2 text-[9px]">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-console-success" />
              {content.taskCount.safe} safe
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              {content.taskCount.medium} medium
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-console-error" />
              {content.taskCount.high} high risk
            </span>
          </div>
        </div>
      )}

      {/* Assigned agents */}
      {content.assignedAgents && content.assignedAgents.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[9px] text-console-dim">Agents:</span>
          {content.assignedAgents.map((agent) => (
            <span
              key={agent}
              className={cn(
                "text-[8px] px-1.5 py-0.5 rounded font-mono",
                AGENT_COLORS[agent] ?? "bg-console-faint text-console-muted",
              )}
            >
              {agent.replace("-worker", "").replace("-tester", "").replace("-reviewer", "")}
            </span>
          ))}
        </div>
      )}

      {/* Spec preview */}
      {!showFull && content.specPreview && (
        <div className="bg-console-faint/30 rounded p-2 max-h-40 overflow-y-auto">
          <MarkdownRenderer text={content.specPreview} />
        </div>
      )}

      {showFull && content.fullSpec && (
        <div className="bg-console-faint/30 rounded p-2.5 max-h-[400px] overflow-y-auto">
          <MarkdownRenderer text={content.fullSpec} />
        </div>
      )}

      {content.fullSpec && (
        <button
          onClick={() => setShowFull(!showFull)}
          className="text-[9px] text-console-accent hover:text-console-accent/80 transition-colors flex items-center gap-1"
        >
          <FileText className="w-2.5 h-2.5" />
          {showFull ? "Hide full spec" : "View full spec"}
        </button>
      )}
    </div>
  );
}

// ---- Approval Content ----
function ApprovalContent({ content }: { content: StepRichContent }) {
  return (
    <div className="mt-2 space-y-3">
      {/* What will be built */}
      {content.buildSummary && content.buildSummary.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[9px] text-console-dim uppercase tracking-wider font-medium">
            What Will Be Built
          </span>
          <div className="bg-console-faint/30 rounded p-2 space-y-1">
            {content.buildSummary.map((item, i) => (
              <div key={i} className="flex items-start gap-1.5 py-0.5">
                <ArrowRight className="w-2.5 h-2.5 text-console-accent shrink-0 mt-0.5" />
                <span className="text-[10px] text-console-muted">{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Estimated scope */}
      {content.estimatedScope && (
        <div className="flex items-center gap-2 px-2.5 py-2 bg-console-faint/30 rounded border border-console-border/50">
          <Clock className="w-3.5 h-3.5 text-console-dim" />
          <span className="text-[10px] text-console-muted font-medium">
            Estimated: {content.estimatedScope}
          </span>
        </div>
      )}

      {/* Task breakdown */}
      {content.taskCount && content.taskCount.total > 0 && (
        <div className="flex items-center gap-3 text-[9px]">
          <span className="flex items-center gap-1 text-console-success">
            <Shield className="w-2.5 h-2.5" /> {content.taskCount.safe} safe
          </span>
          <span className="text-amber-400">{content.taskCount.medium} medium risk</span>
          <span className="text-console-error">{content.taskCount.high} high risk</span>
        </div>
      )}
    </div>
  );
}

// ---- Gate Content (Backend Build, Frontend Build, QA) ----
function GateContent({ content, stepStatus }: { content: StepRichContent; stepStatus: string }) {
  const [showHandoffs, setShowHandoffs] = useState(false);

  return (
    <div className="mt-2 space-y-2.5">
      {/* Completed banner */}
      {stepStatus === "completed" && (
        <div className="flex items-center gap-2 px-2 py-1.5 bg-console-success/10 rounded">
          <Check className="w-3.5 h-3.5 text-console-success shrink-0" />
          <span className="text-[10px] text-console-success font-medium">All checks passed</span>
        </div>
      )}

      {/* Gate checks */}
      {content.gateChecks && content.gateChecks.length > 0 && (
        <div className="space-y-1">
          <span className="text-[9px] text-console-dim uppercase tracking-wider font-medium">
            Gate Checks
          </span>
          {content.gateChecks.map((check, i) => (
            <div key={i} className="flex items-center gap-1.5 py-0.5">
              {stepStatus === "completed" ? (
                <Check className="w-2.5 h-2.5 text-console-success shrink-0" />
              ) : (
                <Circle className="w-2.5 h-2.5 text-console-dim shrink-0" />
              )}
              <span className="text-[10px] text-console-muted">{check}</span>
            </div>
          ))}
        </div>
      )}

      {/* Gate results */}
      {content.gateResults && content.gateResults.length > 0 && (
        <div className="space-y-1">
          <span className="text-[9px] text-console-dim uppercase tracking-wider font-medium">
            Results
          </span>
          <div className="bg-console-faint/30 rounded p-2 space-y-0.5">
            {content.gateResults.map((result, i) => (
              <p key={i} className="text-[9px] text-console-muted font-mono">
                {result}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Files changed */}
      {content.filesChanged != null && (
        <span className="text-[9px] text-console-dim">
          {content.filesChanged} files changed
        </span>
      )}

      {/* QA health */}
      {content.qaHealth != null && (
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-console-dim">Health:</span>
          <HealthBadge score={content.qaHealth} />
        </div>
      )}

      {/* Handoffs toggle */}
      {content.handoffs && content.handoffs.length > 0 && (
        <div className="space-y-1">
          <button
            onClick={() => setShowHandoffs(!showHandoffs)}
            className="text-[9px] text-console-accent hover:text-console-accent/80 transition-colors flex items-center gap-1"
          >
            <ChevronDown className={cn("w-2.5 h-2.5 transition-transform", !showHandoffs && "-rotate-90")} />
            View Handoffs ({content.handoffs.length})
          </button>
          {showHandoffs && (
            <div className="space-y-1">
              {content.handoffs.map((h, i) => (
                <HandoffCard key={i} handoff={h} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Agent notes */}
      {content.agentNotes && (
        <div className="bg-console-faint/30 rounded p-2">
          <span className="text-[8px] text-console-dim uppercase tracking-wider">Agent Notes</span>
          <p className="text-[9px] text-console-muted mt-0.5 leading-relaxed">
            {content.agentNotes.length > 300 ? content.agentNotes.slice(0, 300) + "..." : content.agentNotes}
          </p>
        </div>
      )}
    </div>
  );
}

// ---- Deploy Content ----
function DeployContent({ content }: { content: StepRichContent }) {
  const [showHandoffs, setShowHandoffs] = useState(false);

  return (
    <div className="mt-2 space-y-2.5">
      {content.deploySummary && (
        <div className="flex items-center gap-2 px-2.5 py-2 bg-console-faint/30 rounded border border-console-border/50">
          <Check className="w-3.5 h-3.5 text-console-success shrink-0" />
          <span className="text-[10px] text-console-muted font-medium">{content.deploySummary}</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        {content.qaHealth != null && (
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-console-dim">QA Health:</span>
            <HealthBadge score={content.qaHealth} />
          </div>
        )}
        {content.filesChanged != null && (
          <span className="text-[9px] text-console-dim">
            {content.filesChanged} files changed
          </span>
        )}
      </div>

      {content.prLink && (
        <a
          href={content.prLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[10px] text-console-accent hover:underline font-medium"
        >
          <ArrowRight className="w-2.5 h-2.5" />
          View Pull Request
        </a>
      )}

      {content.handoffs && content.handoffs.length > 0 && (
        <div className="space-y-1">
          <button
            onClick={() => setShowHandoffs(!showHandoffs)}
            className="text-[9px] text-console-accent hover:text-console-accent/80 transition-colors flex items-center gap-1"
          >
            <ChevronDown className={cn("w-2.5 h-2.5 transition-transform", !showHandoffs && "-rotate-90")} />
            All Handoffs ({content.handoffs.length})
          </button>
          {showHandoffs && (
            <div className="space-y-1">
              {content.handoffs.map((h, i) => (
                <HandoffCard key={i} handoff={h} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Shared Components ----

function StatusBadge({ status }: { status: string }) {
  const isReady = status === "READY";
  const isNotReady = status === "NOT READY";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium",
        isReady
          ? "bg-console-success/15 text-console-success"
          : isNotReady
            ? "bg-console-error/15 text-console-error"
            : "bg-amber-400/15 text-amber-400",
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          isReady ? "bg-console-success" : isNotReady ? "bg-console-error" : "bg-amber-400",
        )}
      />
      {status}
    </span>
  );
}

function HealthBadge({ score }: { score: number }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-medium",
        score >= 95
          ? "bg-console-success/15 text-console-success"
          : score >= 80
            ? "bg-amber-400/15 text-amber-400"
            : "bg-console-error/15 text-console-error",
      )}
    >
      {score}%
    </span>
  );
}

function HandoffCard({ handoff }: { handoff: HandoffEntry }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1 bg-console-faint/20 rounded">
      <span className="text-[8px] font-mono text-console-accent shrink-0">{handoff.from}</span>
      <ArrowRight className="w-2.5 h-2.5 text-console-dim shrink-0" />
      <span className="text-[8px] font-mono text-console-accent shrink-0">{handoff.to}</span>
      <span className="text-[9px] text-console-dim truncate flex-1 min-w-0">
        {handoff.detail.length > 80 ? handoff.detail.slice(0, 80) + "..." : handoff.detail}
      </span>
    </div>
  );
}

/** Lightweight markdown-to-JSX renderer for spec content */
function MarkdownRenderer({ text }: { text: string }) {
  const lines = text.split("\n");

  return (
    <div className="space-y-0.5">
      {lines.map((line, i) => {
        const trimmed = line.trimStart();
        // H1
        if (trimmed.startsWith("# ")) {
          return (
            <h3 key={i} className="text-[11px] font-semibold text-console-text mt-2 mb-0.5">
              {trimmed.slice(2)}
            </h3>
          );
        }
        // H2
        if (trimmed.startsWith("## ")) {
          return (
            <h4 key={i} className="text-[10px] font-semibold text-console-muted mt-1.5 mb-0.5">
              {trimmed.slice(3)}
            </h4>
          );
        }
        // H3
        if (trimmed.startsWith("### ")) {
          return (
            <h5 key={i} className="text-[9px] font-semibold text-console-muted mt-1">
              {trimmed.slice(4)}
            </h5>
          );
        }
        // List items
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          return (
            <div key={i} className="flex items-start gap-1.5 pl-1">
              <span className="text-console-accent mt-[3px] text-[6px]">&#x25CF;</span>
              <span className="text-[9px] text-console-dim leading-relaxed">{trimmed.slice(2)}</span>
            </div>
          );
        }
        // Bold metadata lines like "Status: PLANNING"
        if (trimmed.match(/^[A-Z][a-z]+:/) || trimmed.match(/^\*\*.+\*\*/)) {
          return (
            <p key={i} className="text-[9px] text-console-muted font-medium leading-relaxed">
              {trimmed.replace(/\*\*/g, "")}
            </p>
          );
        }
        // Empty lines
        if (trimmed === "") return <div key={i} className="h-1" />;
        // Normal text
        return (
          <p key={i} className="text-[9px] text-console-dim leading-relaxed">
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  if (minutes < 60) return `${minutes}m ${rem}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}
