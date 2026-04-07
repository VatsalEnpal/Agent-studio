"use client";

import { useState } from "react";
import { ChevronRightIcon, CheckIcon, SpinnerIcon, ClockIcon, CircleIcon, CloseIcon, FileIcon, ArrowRightIcon, ShieldIcon, ChevronDownIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import type { WorkflowStep, StepRichContent, ScanLogEntry, HandoffEntry } from "@/stores/workflows";

const STATUS_CONFIG: Record<
  WorkflowStep["status"],
  { icon: typeof CheckIcon; color: string; bg: string; borderColor: string }
> = {
  completed: {
    icon: CheckIcon,
    color: "text-sessions",
    bg: "bg-sessions/10",
    borderColor: "border-l-sessions",
  },
  active: {
    icon: SpinnerIcon,
    color: "text-rooms",
    bg: "bg-rooms/10",
    borderColor: "border-l-rooms",
  },
  waiting: {
    icon: ClockIcon,
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    borderColor: "border-l-amber-400",
  },
  pending: {
    icon: CircleIcon,
    color: "text-text-tertiary",
    bg: "bg-bg-elevated/50",
    borderColor: "border-l-text-tertiary",
  },
  failed: {
    icon: CloseIcon,
    color: "text-error",
    bg: "bg-error/10",
    borderColor: "border-l-error",
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
            ? "border-border-default border-l-sessions bg-transparent"
            : step.status === "active"
              ? "border-rooms/40 border-l-rooms bg-rooms/[0.03] shadow-sm shadow-rooms/10"
              : step.status === "failed"
                ? "border-error/40 border-l-error bg-error/[0.03]"
                : "border-border-default border-l-text-tertiary/40 bg-transparent opacity-50",
      )}
    >
      {/* Collapsed row */}
      <button
        onClick={() => canExpand && setExpanded(!expanded)}
        disabled={!canExpand}
        className={cn(
          "flex items-center gap-2.5 w-full px-3 py-2.5 text-left transition-all",
          canExpand && "hover:bg-bg-elevated/30 hover:shadow-[0_0_12px_rgba(124,131,247,0.04)] cursor-pointer",
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
            "text-xs font-medium flex-1 min-w-0 truncate",
            step.status === "waiting"
              ? "text-amber-300"
              : step.status === "pending"
                ? "text-text-tertiary"
                : step.status === "completed"
                  ? "text-text-secondary"
                  : "text-text-primary",
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
                  ? "bg-bg-elevated/50 text-text-tertiary"
                  : (AGENT_COLORS[agent] ?? "bg-bg-elevated text-text-secondary"),
              )}
            >
              {agent.replace("-worker", "").replace("-tester", "").replace("-reviewer", "")}
            </span>
          ))}
        </div>

        {/* Duration for completed steps */}
        {step.durationMs != null && (
          <span className="text-2xs text-text-tertiary font-mono shrink-0">
            {formatDuration(step.durationMs)}
          </span>
        )}
        {step.status === "completed" && step.completedAt && step.startedAt && step.durationMs == null && (
          <span className="text-2xs text-text-tertiary/60 font-mono shrink-0">
            done
          </span>
        )}

        {/* Expand chevron -- hidden for pending */}
        {canExpand && (
          <ChevronRightIcon
            className={cn(
              "w-3 h-3 text-text-tertiary transition-transform duration-150 shrink-0",
              expanded && "rotate-90",
            )}
          />
        )}
      </button>

      {/* Expanded rich content */}
      {expanded && canExpand && (
        <div className="px-3 pb-3 pt-0 border-t border-border-default/50">
          {step.richContent ? (
            <RichContentRenderer content={step.richContent} stepStatus={step.status} />
          ) : step.details ? (
            <p className="text-xs text-text-secondary leading-relaxed mt-2 whitespace-pre-wrap">
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
                    : "px-3 py-1.5 text-xs bg-rooms text-black hover:bg-rooms/80",
                )}
              >
                {step.action.label}
              </button>
              {step.status === "waiting" && (
                <p className="text-2xs text-amber-400/60 mt-1.5">
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
            <span className="text-xs text-text-secondary">
              {content.ticketsFound} tickets found
            </span>
          )}
          {content.domains && content.domains.length > 0 && (
            <span className="text-xs text-text-tertiary">
              in {content.domains.join(", ")}
            </span>
          )}
        </div>
      )}

      {/* Latest scan entries */}
      {content.scanEntries && content.scanEntries.length > 0 && (
        <div className="space-y-1">
          <span className="text-2xs text-text-tertiary uppercase tracking-wider font-medium">
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
          className="text-2xs text-rooms hover:text-rooms/80 transition-all flex items-center gap-1"
        >
          {showFull ? (
            <>
              <ChevronDownIcon className="w-2.5 h-2.5 rotate-180" />
              Show less
            </>
          ) : (
            <>
              <ChevronDownIcon className="w-2.5 h-2.5" />
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
    <div className="flex items-start gap-2 py-1 px-2 rounded bg-bg-elevated/30">
      <span
        className={cn(
          "shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full",
          isReady ? "bg-sessions" : isNotReady ? "bg-error" : "bg-text-tertiary",
        )}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-2xs text-text-tertiary font-mono shrink-0">
            {formatTimestamp(entry.timestamp)}
          </span>
          <span
            className={cn(
              "text-[8px] px-1 py-0.5 rounded font-medium",
              isReady
                ? "bg-sessions/15 text-sessions"
                : isNotReady
                  ? "bg-error/15 text-error"
                  : "bg-bg-elevated text-text-tertiary",
            )}
          >
            {entry.status}
          </span>
        </div>
        <p className="text-2xs text-text-secondary leading-relaxed mt-0.5 break-words">
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
            <span className="text-xs text-text-secondary">
              {content.ticketsFound} To Do tickets across {content.domains?.length ?? 0} domains
            </span>
          )}
        </div>
      )}

      {/* Sprint recommendations */}
      {content.buildSummary && content.buildSummary.length > 0 && (
        <div className="space-y-1">
          <span className="text-2xs text-text-tertiary uppercase tracking-wider font-medium">
            Recommended Sprints
          </span>
          {content.buildSummary.map((item, i) => (
            <div key={i} className="flex items-start gap-1.5 py-0.5">
              <ArrowRightIcon className="w-2.5 h-2.5 text-rooms shrink-0 mt-0.5" />
              <span className="text-xs text-text-secondary">{item}</span>
            </div>
          ))}
        </div>
      )}

      {/* Preview / Full */}
      {content.specPreview && !showFull && (
        <div className="bg-bg-elevated/30 rounded p-2 max-h-32 overflow-y-auto">
          <p className="text-2xs text-text-tertiary font-mono whitespace-pre-wrap leading-relaxed">
            {content.specPreview}
          </p>
        </div>
      )}

      {showFull && content.fullSpec && (
        <div className="bg-bg-elevated/30 rounded p-2.5 max-h-64 overflow-y-auto">
          <MarkdownRenderer text={content.fullSpec} />
        </div>
      )}

      {content.fullSpec && (
        <button
          onClick={() => setShowFull(!showFull)}
          className="text-2xs text-rooms hover:text-rooms/80 transition-all flex items-center gap-1"
        >
          <FileIcon className="w-2.5 h-2.5" />
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
          <span className="text-xs font-medium text-text-primary">
            {content.sprintTitle}
          </span>
        )}
        {content.sprintStatus && (
          <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-400 font-medium">
            {content.sprintStatus}
          </span>
        )}
        {content.sprintCreated && (
          <span className="text-2xs text-text-tertiary">
            Created {content.sprintCreated}
          </span>
        )}
      </div>

      {/* Task counts */}
      {content.taskCount && content.taskCount.total > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-secondary font-medium">
            {content.taskCount.total} tasks
          </span>
          <div className="flex items-center gap-2 text-2xs">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-sessions" />
              {content.taskCount.safe} safe
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              {content.taskCount.medium} medium
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-error" />
              {content.taskCount.high} high risk
            </span>
          </div>
        </div>
      )}

      {/* Assigned agents */}
      {content.assignedAgents && content.assignedAgents.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-2xs text-text-tertiary">Agents:</span>
          {content.assignedAgents.map((agent) => (
            <span
              key={agent}
              className={cn(
                "text-[8px] px-1.5 py-0.5 rounded font-mono",
                AGENT_COLORS[agent] ?? "bg-bg-elevated text-text-secondary",
              )}
            >
              {agent.replace("-worker", "").replace("-tester", "").replace("-reviewer", "")}
            </span>
          ))}
        </div>
      )}

      {/* Spec preview */}
      {!showFull && content.specPreview && (
        <div className="bg-bg-elevated/30 rounded p-2 max-h-40 overflow-y-auto">
          <MarkdownRenderer text={content.specPreview} />
        </div>
      )}

      {showFull && content.fullSpec && (
        <div className="bg-bg-elevated/30 rounded p-2.5 max-h-[400px] overflow-y-auto">
          <MarkdownRenderer text={content.fullSpec} />
        </div>
      )}

      {content.fullSpec && (
        <button
          onClick={() => setShowFull(!showFull)}
          className="text-2xs text-rooms hover:text-rooms/80 transition-all flex items-center gap-1"
        >
          <FileIcon className="w-2.5 h-2.5" />
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
          <span className="text-2xs text-text-tertiary uppercase tracking-wider font-medium">
            What Will Be Built
          </span>
          <div className="bg-bg-elevated/30 rounded p-2 space-y-1">
            {content.buildSummary.map((item, i) => (
              <div key={i} className="flex items-start gap-1.5 py-0.5">
                <ArrowRightIcon className="w-2.5 h-2.5 text-rooms shrink-0 mt-0.5" />
                <span className="text-xs text-text-secondary">{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Estimated scope */}
      {content.estimatedScope && (
        <div className="flex items-center gap-2 px-2.5 py-2 bg-bg-elevated/30 rounded border border-border-default/50">
          <ClockIcon className="w-3.5 h-3.5 text-text-tertiary" />
          <span className="text-xs text-text-secondary font-medium">
            Estimated: {content.estimatedScope}
          </span>
        </div>
      )}

      {/* Task breakdown */}
      {content.taskCount && content.taskCount.total > 0 && (
        <div className="flex items-center gap-3 text-2xs">
          <span className="flex items-center gap-1 text-sessions">
            <ShieldIcon className="w-2.5 h-2.5" /> {content.taskCount.safe} safe
          </span>
          <span className="text-amber-400">{content.taskCount.medium} medium risk</span>
          <span className="text-error">{content.taskCount.high} high risk</span>
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
        <div className="flex items-center gap-2 px-2 py-1.5 bg-sessions/10 rounded">
          <CheckIcon className="w-3.5 h-3.5 text-sessions shrink-0" />
          <span className="text-xs text-sessions font-medium">All checks passed</span>
        </div>
      )}

      {/* Gate checks */}
      {content.gateChecks && content.gateChecks.length > 0 && (
        <div className="space-y-1">
          <span className="text-2xs text-text-tertiary uppercase tracking-wider font-medium">
            Gate Checks
          </span>
          {content.gateChecks.map((check, i) => (
            <div key={i} className="flex items-center gap-1.5 py-0.5">
              {stepStatus === "completed" ? (
                <CheckIcon className="w-2.5 h-2.5 text-sessions shrink-0" />
              ) : (
                <CircleIcon className="w-2.5 h-2.5 text-text-tertiary shrink-0" />
              )}
              <span className="text-xs text-text-secondary">{check}</span>
            </div>
          ))}
        </div>
      )}

      {/* Gate results */}
      {content.gateResults && content.gateResults.length > 0 && (
        <div className="space-y-1">
          <span className="text-2xs text-text-tertiary uppercase tracking-wider font-medium">
            Results
          </span>
          <div className="bg-bg-elevated/30 rounded p-2 space-y-0.5">
            {content.gateResults.map((result, i) => (
              <p key={i} className="text-2xs text-text-secondary font-mono">
                {result}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Files changed */}
      {content.filesChanged != null && (
        <span className="text-2xs text-text-tertiary">
          {content.filesChanged} files changed
        </span>
      )}

      {/* QA health */}
      {content.qaHealth != null && (
        <div className="flex items-center gap-2">
          <span className="text-2xs text-text-tertiary">Health:</span>
          <HealthBadge score={content.qaHealth} />
        </div>
      )}

      {/* Handoffs toggle */}
      {content.handoffs && content.handoffs.length > 0 && (
        <div className="space-y-1">
          <button
            onClick={() => setShowHandoffs(!showHandoffs)}
            className="text-2xs text-rooms hover:text-rooms/80 transition-all flex items-center gap-1"
          >
            <ChevronDownIcon className={cn("w-2.5 h-2.5 transition-transform", !showHandoffs && "-rotate-90")} />
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
        <div className="bg-bg-elevated/30 rounded p-2">
          <span className="text-[8px] text-text-tertiary uppercase tracking-wider">Agent Notes</span>
          <p className="text-2xs text-text-secondary mt-0.5 leading-relaxed">
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
        <div className="flex items-center gap-2 px-2.5 py-2 bg-bg-elevated/30 rounded border border-border-default/50">
          <CheckIcon className="w-3.5 h-3.5 text-sessions shrink-0" />
          <span className="text-xs text-text-secondary font-medium">{content.deploySummary}</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        {content.qaHealth != null && (
          <div className="flex items-center gap-1.5">
            <span className="text-2xs text-text-tertiary">QA Health:</span>
            <HealthBadge score={content.qaHealth} />
          </div>
        )}
        {content.filesChanged != null && (
          <span className="text-2xs text-text-tertiary">
            {content.filesChanged} files changed
          </span>
        )}
      </div>

      {content.prLink && (
        <a
          href={content.prLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-rooms hover:underline font-medium"
        >
          <ArrowRightIcon className="w-2.5 h-2.5" />
          View Pull Request
        </a>
      )}

      {content.handoffs && content.handoffs.length > 0 && (
        <div className="space-y-1">
          <button
            onClick={() => setShowHandoffs(!showHandoffs)}
            className="text-2xs text-rooms hover:text-rooms/80 transition-all flex items-center gap-1"
          >
            <ChevronDownIcon className={cn("w-2.5 h-2.5 transition-transform", !showHandoffs && "-rotate-90")} />
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
        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-medium",
        isReady
          ? "bg-sessions/15 text-sessions"
          : isNotReady
            ? "bg-error/15 text-error"
            : "bg-amber-400/15 text-amber-400",
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          isReady ? "bg-sessions" : isNotReady ? "bg-error" : "bg-amber-400",
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
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-mono font-medium",
        score >= 95
          ? "bg-sessions/15 text-sessions"
          : score >= 80
            ? "bg-amber-400/15 text-amber-400"
            : "bg-error/15 text-error",
      )}
    >
      {score}%
    </span>
  );
}

function HandoffCard({ handoff }: { handoff: HandoffEntry }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1 bg-bg-elevated/20 rounded">
      <span className="text-[8px] font-mono text-rooms shrink-0">{handoff.from}</span>
      <ArrowRightIcon className="w-2.5 h-2.5 text-text-tertiary shrink-0" />
      <span className="text-[8px] font-mono text-rooms shrink-0">{handoff.to}</span>
      <span className="text-2xs text-text-tertiary truncate flex-1 min-w-0">
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
            <h3 key={i} className="text-xs font-semibold text-text-primary mt-2 mb-0.5">
              {trimmed.slice(2)}
            </h3>
          );
        }
        // H2
        if (trimmed.startsWith("## ")) {
          return (
            <h4 key={i} className="text-xs font-semibold text-text-secondary mt-1.5 mb-0.5">
              {trimmed.slice(3)}
            </h4>
          );
        }
        // H3
        if (trimmed.startsWith("### ")) {
          return (
            <h5 key={i} className="text-2xs font-semibold text-text-secondary mt-1">
              {trimmed.slice(4)}
            </h5>
          );
        }
        // List items
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          return (
            <div key={i} className="flex items-start gap-1.5 pl-1">
              <span className="text-rooms mt-[3px] text-[6px]">&#x25CF;</span>
              <span className="text-2xs text-text-tertiary leading-relaxed">{trimmed.slice(2)}</span>
            </div>
          );
        }
        // Bold metadata lines like "Status: PLANNING"
        if (trimmed.match(/^[A-Z][a-z]+:/) || trimmed.match(/^\*\*.+\*\*/)) {
          return (
            <p key={i} className="text-2xs text-text-secondary font-medium leading-relaxed">
              {trimmed.replace(/\*\*/g, "")}
            </p>
          );
        }
        // Empty lines
        if (trimmed === "") return <div key={i} className="h-1" />;
        // Normal text
        return (
          <p key={i} className="text-2xs text-text-tertiary leading-relaxed">
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
