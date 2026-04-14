"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CloseIcon,
  CheckIcon,
  SprintsIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateSprintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

type Step = "define" | "agents" | "pipeline" | "done";

interface AgentOption {
  id: string;
  name: string;
  description: string;
}

interface PipelineStep {
  id: string;
  agent: string;
  name: string;
  description: string;
  gateRequired: boolean;
  qaLoop: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Auto-order agents into a pipeline based on common patterns. */
function buildPipeline(agents: string[], agentMap: Map<string, AgentOption>): PipelineStep[] {
  const steps: PipelineStep[] = [];
  const remaining = new Set(agents);

  // Orchestrator goes first for planning
  if (remaining.has("orchestrator")) {
    remaining.delete("orchestrator");
    steps.push({
      id: "planning",
      agent: "orchestrator",
      name: "Planning",
      description: "Orchestrator reviews goal and creates task breakdown",
      gateRequired: false,
      qaLoop: false,
    });
  }

  // Backend before frontend
  if (remaining.has("backend")) {
    remaining.delete("backend");
    steps.push({
      id: "backend-build",
      agent: "backend",
      name: "Backend Build",
      description: "Build APIs, database schemas, server logic",
      gateRequired: false,
      qaLoop: false,
    });
  }

  if (remaining.has("frontend")) {
    remaining.delete("frontend");
    steps.push({
      id: "frontend-build",
      agent: "frontend",
      name: "Frontend Build",
      description: "Build UI components, pages, and client logic",
      gateRequired: false,
      qaLoop: false,
    });
  }

  // Security review after builds
  if (remaining.has("security")) {
    remaining.delete("security");
    steps.push({
      id: "security-review",
      agent: "security",
      name: "Security Review",
      description: "Review code for vulnerabilities and security issues",
      gateRequired: false,
      qaLoop: false,
    });
  }

  // Any remaining agents in the middle
  for (const agentId of remaining) {
    if (agentId === "qa" || agentId === "pmo") continue;
    const agent = agentMap.get(agentId);
    steps.push({
      id: `${agentId}-work`,
      agent: agentId,
      name: `${agent?.name ?? agentId} Work`,
      description: agent?.description ?? `${agentId} agent tasks`,
      gateRequired: false,
      qaLoop: false,
    });
  }

  // PMO before QA
  if (remaining.has("pmo")) {
    remaining.delete("pmo");
    steps.push({
      id: "pmo-review",
      agent: "pmo",
      name: "PMO Review",
      description: "Project management review and task tracking",
      gateRequired: false,
      qaLoop: false,
    });
  }

  // QA always last before deploy
  if (agents.includes("qa")) {
    steps.push({
      id: "qa-test",
      agent: "qa",
      name: "QA Testing",
      description: "Run tests, verify quality, report bugs",
      gateRequired: false,
      qaLoop: false,
    });
  }

  // Final review/deploy step
  const deployer = agents.includes("orchestrator") ? "orchestrator" : (agents[0] ?? "system");
  steps.push({
    id: "review-deploy",
    agent: deployer,
    name: "Review and Deploy",
    description: "Final review, create PR, archive sprint",
    gateRequired: false,
    qaLoop: false,
  });

  return steps;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateSprintDialog({ open, onOpenChange, onCreated }: CreateSprintDialogProps) {
  const [step, setStep] = useState<Step>("define");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Define
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [cwd, setCwd] = useState("");

  // Step 2: Select Agents
  const [availableAgents, setAvailableAgents] = useState<AgentOption[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [agentsLoading, setAgentsLoading] = useState(false);

  // Step 3: Pipeline
  const [pipeline, setPipeline] = useState<PipelineStep[]>([]);

  // Scheduling
  const [schedule, setSchedule] = useState<"once" | "recurring">("once");
  const [interval, setInterval] = useState<string>("4h");

  // Budget
  const [budgetCapUsd, setBudgetCapUsd] = useState<string>("");
  const [stepBudgetCapUsd, setStepBudgetCapUsd] = useState<string>("");

  // Step 4: Done
  const [createdSprint, setCreatedSprint] = useState<{
    id: string;
    name: string;
    gateCount: number;
  } | null>(null);

  // Load default cwd
  useEffect(() => {
    if (!open) return;
    fetch("/api/config")
      .then((res) => res.json())
      .then((data: Record<string, unknown>) => {
        const config = data.config as Record<string, unknown> | undefined;
        const projects = (config?.projects ?? data.projects) as
          | Array<{ path: string; isProd?: boolean }>
          | undefined;
        if (projects && projects.length > 0) {
          const main = projects.find((p) => !p.isProd);
          setCwd(main?.path ?? projects[0]?.path ?? "");
        } else {
          const defaults = (config?.defaults ?? data.defaults) as
            | { workingDirectory?: string }
            | undefined;
          if (defaults?.workingDirectory) {
            setCwd(defaults.workingDirectory);
          }
        }
      })
      .catch(() => {
        // Fallback: leave empty
      });
  }, [open]);

  // Load agents when entering step 2
  useEffect(() => {
    if (step !== "agents") return;
    setAgentsLoading(true);
    fetch("/api/agents")
      .then((res) => res.json())
      .then((data: AgentOption[]) => {
        // Filter out "No Agent" placeholder
        const filtered = data.filter((a) => a.id !== "none");
        setAvailableAgents(filtered);
      })
      .catch(() => {
        setError("Failed to load agents");
      })
      .finally(() => {
        setAgentsLoading(false);
      });
  }, [step]);

  const reset = useCallback(() => {
    setStep("define");
    setName("");
    setGoal("");
    setCwd("");
    setSelectedAgents(new Set());
    setPipeline([]);
    setSchedule("once");
    setInterval("4h");
    setBudgetCapUsd("");
    setStepBudgetCapUsd("");
    setError(null);
    setSaving(false);
    setCreatedSprint(null);
  }, []);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    setTimeout(reset, 200);
  }, [onOpenChange, reset]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, handleClose]);

  const handleToggleAgent = useCallback((agentId: string) => {
    setSelectedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  }, []);

  const goToPipeline = useCallback(() => {
    const agentMap = new Map(availableAgents.map((a) => [a.id, a]));
    const ordered = buildPipeline(Array.from(selectedAgents), agentMap);
    setPipeline(ordered);
    setStep("pipeline");
  }, [selectedAgents, availableAgents]);

  const handleMoveStep = useCallback((index: number, direction: "up" | "down") => {
    setPipeline((prev) => {
      const next = [...prev];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= next.length) return prev;
      const temp = next[index]!;
      next[index] = next[targetIndex]!;
      next[targetIndex] = temp;
      return next;
    });
  }, []);

  const handleToggleGate = useCallback((index: number) => {
    setPipeline((prev) =>
      prev.map((s, i) => (i === index ? { ...s, gateRequired: !s.gateRequired } : s)),
    );
  }, []);

  const handleToggleQaLoop = useCallback((index: number) => {
    setPipeline((prev) => prev.map((s, i) => (i === index ? { ...s, qaLoop: !s.qaLoop } : s)));
  }, []);

  const handleCreate = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const parsedBudget = budgetCapUsd ? parseFloat(budgetCapUsd) : undefined;
      const parsedStepBudget = stepBudgetCapUsd ? parseFloat(stepBudgetCapUsd) : undefined;
      const res = await fetch("/api/sprints/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          goal,
          agents: Array.from(selectedAgents),
          cwd: cwd || undefined,
          pipeline: pipeline.map((p) => ({
            id: p.id,
            agent: p.agent,
            name: p.name,
            description: p.description,
            gateRequired: p.gateRequired,
            qaLoop: p.qaLoop,
          })),
          schedule: schedule === "recurring" ? { recurring: true, interval } : undefined,
          budgetCapUsd: parsedBudget && parsedBudget > 0 ? parsedBudget : undefined,
          stepBudgetCapUsd: parsedStepBudget && parsedStepBudget > 0 ? parsedStepBudget : undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || `Failed to create sprint (${res.status})`);
      }
      const data = (await res.json()) as {
        id: string;
        name: string;
        gateCount: number;
      };
      setCreatedSprint(data);
      setStep("done");
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }, [
    name,
    goal,
    selectedAgents,
    cwd,
    pipeline,
    schedule,
    interval,
    budgetCapUsd,
    stepBudgetCapUsd,
    onCreated,
  ]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-bg-base/80 backdrop-blur-[2px]" onClick={handleClose} />

      {/* Dialog */}
      <div className="relative w-full max-w-lg bg-bg-surface border border-border-default rounded-[4px] shadow-modal overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <div className="flex items-center gap-2">
            <SprintsIcon size={14} className="text-sprints" />
            <h2 className="text-xs font-medium text-text-primary">Create Sprint</h2>
            <StepIndicator current={step} />
          </div>
          <button
            onClick={handleClose}
            className="p-1 text-text-ghost hover:text-text-secondary transition-all"
          >
            <CloseIcon size={12} />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 py-4 space-y-4 max-h-[60vh] overflow-y-auto scrollbar-thin">
          {step === "define" && (
            <StepDefine
              name={name}
              goal={goal}
              cwd={cwd}
              onNameChange={setName}
              onGoalChange={setGoal}
              onCwdChange={setCwd}
            />
          )}

          {step === "agents" && (
            <StepAgents
              available={availableAgents}
              selected={selectedAgents}
              onToggle={handleToggleAgent}
              loading={agentsLoading}
            />
          )}

          {step === "pipeline" && (
            <StepPipeline
              steps={pipeline}
              onMove={handleMoveStep}
              onToggleGate={handleToggleGate}
              onToggleQaLoop={handleToggleQaLoop}
              schedule={schedule}
              onScheduleChange={setSchedule}
              interval={interval}
              onIntervalChange={setInterval}
              budgetCapUsd={budgetCapUsd}
              onBudgetCapChange={setBudgetCapUsd}
              stepBudgetCapUsd={stepBudgetCapUsd}
              onStepBudgetCapChange={setStepBudgetCapUsd}
              error={error}
            />
          )}

          {step === "done" && <StepDone sprint={createdSprint} />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border-default">
          <div>
            {step !== "define" && step !== "done" && (
              <button
                onClick={() => setStep(step === "pipeline" ? "agents" : "define")}
                className="text-xs text-text-secondary hover:text-text-primary transition-all"
              >
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step === "define" && (
              <button
                onClick={() => setStep("agents")}
                disabled={!name.trim() || !goal.trim()}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-[4px] transition-all",
                  name.trim() && goal.trim()
                    ? "bg-text-primary text-bg-base hover:bg-text-secondary"
                    : "bg-bg-elevated text-text-ghost cursor-not-allowed",
                )}
              >
                Next
              </button>
            )}
            {step === "agents" && (
              <button
                onClick={goToPipeline}
                disabled={selectedAgents.size === 0}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-[4px] transition-all",
                  selectedAgents.size > 0
                    ? "bg-text-primary text-bg-base hover:bg-text-secondary"
                    : "bg-bg-elevated text-text-ghost cursor-not-allowed",
                )}
              >
                Preview Pipeline
              </button>
            )}
            {step === "pipeline" && (
              <button
                onClick={() => void handleCreate()}
                disabled={saving}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-[4px] transition-all",
                  saving
                    ? "bg-bg-elevated text-text-ghost cursor-not-allowed"
                    : "bg-sprints text-bg-base hover:bg-sprints/90",
                )}
              >
                {saving ? "Creating..." : "Create Sprint"}
              </button>
            )}
            {step === "done" && (
              <button
                onClick={handleClose}
                className="px-3 py-1.5 text-xs font-medium rounded-[4px] bg-text-primary text-bg-base hover:bg-text-secondary transition-all"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step Indicator
// ---------------------------------------------------------------------------

function StepIndicator({ current }: { current: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: "define", label: "Define" },
    { id: "agents", label: "Agents" },
    { id: "pipeline", label: "Pipeline" },
  ];

  const currentIdx = steps.findIndex((s) => s.id === current);

  return (
    <div className="flex items-center gap-1 ml-3">
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center gap-1">
          <span
            className={cn(
              "text-2xs",
              current === "done" || i < currentIdx
                ? "text-sprints"
                : i === currentIdx
                  ? "text-text-primary"
                  : "text-text-ghost",
            )}
          >
            {current === "done" || i < currentIdx ? <CheckIcon size={10} /> : `${i + 1}`}
          </span>
          <span
            className={cn(
              "text-2xs",
              i === currentIdx && current !== "done" ? "text-text-secondary" : "text-text-ghost",
            )}
          >
            {s.label}
          </span>
          {i < steps.length - 1 && (
            <span className="text-text-ghost/40 text-[8px] mx-0.5">&middot;</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1: Define Sprint
// ---------------------------------------------------------------------------

function StepDefine({
  name,
  goal,
  cwd,
  onNameChange,
  onGoalChange,
  onCwdChange,
}: {
  name: string;
  goal: string;
  cwd: string;
  onNameChange: (v: string) => void;
  onGoalChange: (v: string) => void;
  onCwdChange: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-text-secondary leading-relaxed">
          Define the sprint goal. Sprints are automated multi-agent pipelines that build, test, and
          fix code without manual intervention.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-label font-medium text-text-secondary uppercase tracking-wider">
          Sprint Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. Add user authentication"
          className="w-full px-3 py-2 text-xs bg-bg-input border border-border-default rounded-[4px] text-text-primary placeholder:text-text-ghost focus:outline-none focus:border-sprints transition-all"
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-label font-medium text-text-secondary uppercase tracking-wider">
          Goal
        </label>
        <textarea
          value={goal}
          onChange={(e) => onGoalChange(e.target.value)}
          placeholder="Describe what this sprint should accomplish. Be specific about deliverables, acceptance criteria, and constraints."
          rows={4}
          className="w-full px-3 py-2 text-xs bg-bg-input border border-border-default rounded-[4px] text-text-primary placeholder:text-text-ghost focus:outline-none focus:border-sprints transition-all resize-none"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-label font-medium text-text-secondary uppercase tracking-wider">
          Working Directory
        </label>
        <input
          type="text"
          value={cwd}
          onChange={(e) => onCwdChange(e.target.value)}
          placeholder="/path/to/project"
          className="w-full px-3 py-2 text-xs font-mono bg-bg-input border border-border-default rounded-[4px] text-text-primary placeholder:text-text-ghost focus:outline-none focus:border-sprints transition-all"
        />
        <p className="text-2xs text-text-ghost">The project directory where agents will work.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Select Agents
// ---------------------------------------------------------------------------

function StepAgents({
  available,
  selected,
  onToggle,
  loading,
}: {
  available: AgentOption[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  loading: boolean;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-label font-medium text-text-secondary uppercase tracking-wider">
          Select Agents
        </label>
        <p className="text-2xs text-text-tertiary mt-1">
          Choose which agents participate in this sprint. Select at least one.
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-[4px] bg-bg-elevated animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {available.map((agent) => (
            <button
              key={agent.id}
              onClick={() => onToggle(agent.id)}
              className={cn(
                "flex flex-col items-start px-2.5 py-2 rounded-[4px] text-left transition-all border",
                selected.has(agent.id)
                  ? "bg-sprints/10 border-sprints/30 text-text-primary"
                  : "bg-bg-input border-border-default text-text-tertiary hover:border-border-subtle",
              )}
            >
              <span className="text-xs font-medium font-mono">{agent.name}</span>
              <span className="text-2xs text-text-ghost mt-0.5 line-clamp-2">
                {agent.description}
              </span>
            </button>
          ))}
        </div>
      )}

      {selected.size > 0 && (
        <p className="text-2xs text-sprints">
          {selected.size} agent{selected.size !== 1 ? "s" : ""} selected
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Preview Pipeline
// ---------------------------------------------------------------------------

function StepPipeline({
  steps,
  onMove,
  onToggleGate,
  onToggleQaLoop,
  schedule,
  onScheduleChange,
  interval: intervalValue,
  onIntervalChange,
  budgetCapUsd,
  onBudgetCapChange,
  stepBudgetCapUsd,
  onStepBudgetCapChange,
  error,
}: {
  steps: PipelineStep[];
  onMove: (index: number, direction: "up" | "down") => void;
  onToggleGate: (index: number) => void;
  onToggleQaLoop: (index: number) => void;
  schedule: "once" | "recurring";
  onScheduleChange: (v: "once" | "recurring") => void;
  interval: string;
  onIntervalChange: (v: string) => void;
  budgetCapUsd: string;
  onBudgetCapChange: (v: string) => void;
  stepBudgetCapUsd: string;
  onStepBudgetCapChange: (v: string) => void;
  error: string | null;
}) {
  const [budgetOpen, setBudgetOpen] = useState(false);
  const isQaAgent = (agent: string) => agent === "qa" || agent.includes("qa");

  return (
    <div className="space-y-3">
      <div>
        <label className="text-label font-medium text-text-secondary uppercase tracking-wider">
          Pipeline Steps
        </label>
        <p className="text-2xs text-text-tertiary mt-1">
          Review the execution order. Toggle gates and QA loops per step.
        </p>
      </div>

      <div className="space-y-1">
        {steps.map((pStep, i) => (
          <div
            key={pStep.id}
            className="flex items-center gap-2 px-2.5 py-2 bg-bg-input border border-border-default rounded-[4px] group"
          >
            {/* Step number */}
            <span className="text-2xs text-text-ghost w-5 text-right shrink-0 tabular-nums">
              {i + 1}.
            </span>

            {/* Step info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-medium text-text-primary truncate">{pStep.name}</span>
                <span className="text-label px-1 py-0.5 rounded bg-sprints/10 text-sprints shrink-0">
                  {pStep.agent}
                </span>
                {pStep.gateRequired && (
                  <span className="text-label px-1 py-0.5 rounded bg-warning/15 text-warning shrink-0">
                    gate
                  </span>
                )}
                {pStep.qaLoop && (
                  <span className="text-label px-1 py-0.5 rounded bg-error/15 text-error shrink-0">
                    loop
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pStep.gateRequired}
                    onChange={() => onToggleGate(i)}
                    className="w-3 h-3 rounded accent-warning"
                  />
                  <span className="text-2xs text-text-tertiary">Approval</span>
                </label>
                {isQaAgent(pStep.agent) && (
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pStep.qaLoop}
                      onChange={() => onToggleQaLoop(i)}
                      className="w-3 h-3 rounded accent-error"
                    />
                    <span className="text-2xs text-text-tertiary">QA Loop</span>
                  </label>
                )}
              </div>
            </div>

            {/* Reorder buttons */}
            <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button
                onClick={() => onMove(i, "up")}
                disabled={i === 0}
                className={cn(
                  "p-0.5 rounded transition-all",
                  i === 0
                    ? "text-text-ghost/30 cursor-not-allowed"
                    : "text-text-ghost hover:text-text-primary hover:bg-bg-elevated",
                )}
              >
                <ChevronUpIcon size={10} />
              </button>
              <button
                onClick={() => onMove(i, "down")}
                disabled={i === steps.length - 1}
                className={cn(
                  "p-0.5 rounded transition-all",
                  i === steps.length - 1
                    ? "text-text-ghost/30 cursor-not-allowed"
                    : "text-text-ghost hover:text-text-primary hover:bg-bg-elevated",
                )}
              >
                <ChevronDownIcon size={10} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Scheduling */}
      <div className="pt-2 border-t border-border-default">
        <label className="text-label font-medium text-text-secondary uppercase tracking-wider">
          Scheduling
        </label>
        <div className="flex items-center gap-2 mt-1.5">
          <button
            onClick={() => onScheduleChange("once")}
            className={cn(
              "px-2 py-1 text-2xs rounded-[4px] border transition-all",
              schedule === "once"
                ? "border-sprints bg-sprints/10 text-sprints"
                : "border-border-default text-text-tertiary hover:text-text-secondary",
            )}
          >
            Run once (now)
          </button>
          <button
            onClick={() => onScheduleChange("recurring")}
            className={cn(
              "px-2 py-1 text-2xs rounded-[4px] border transition-all",
              schedule === "recurring"
                ? "border-sprints bg-sprints/10 text-sprints"
                : "border-border-default text-text-tertiary hover:text-text-secondary",
            )}
          >
            Recurring
          </button>
          {schedule === "recurring" && (
            <select
              value={intervalValue}
              onChange={(e) => onIntervalChange(e.target.value)}
              className="bg-bg-base border border-border-default rounded px-2 py-1 text-2xs text-text-secondary focus:outline-none"
            >
              <option value="1h">Every 1h</option>
              <option value="2h">Every 2h</option>
              <option value="4h">Every 4h</option>
              <option value="8h">Every 8h</option>
              <option value="12h">Every 12h</option>
              <option value="24h">Every 24h</option>
            </select>
          )}
        </div>
      </div>

      {/* Budget (collapsible) */}
      <div className="pt-2 border-t border-border-default">
        <button
          onClick={() => setBudgetOpen(!budgetOpen)}
          className="flex items-center gap-1.5 w-full text-left"
        >
          <span className="text-label font-medium text-text-secondary uppercase tracking-wider">
            Budget
          </span>
          {budgetOpen ? (
            <ChevronDownIcon size={10} className="text-text-ghost" />
          ) : (
            <ChevronRightIcon size={10} className="text-text-ghost" />
          )}
          {!budgetOpen && (budgetCapUsd || stepBudgetCapUsd) && (
            <span className="text-2xs text-sprints ml-1">
              {budgetCapUsd ? `$${budgetCapUsd} total` : ""}
              {budgetCapUsd && stepBudgetCapUsd ? " / " : ""}
              {stepBudgetCapUsd ? `$${stepBudgetCapUsd}/step` : ""}
            </span>
          )}
        </button>
        {budgetOpen && (
          <div className="mt-2 space-y-2">
            <div className="space-y-1">
              <label className="text-2xs text-text-tertiary">Total budget cap</label>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-text-ghost">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.50"
                  value={budgetCapUsd}
                  onChange={(e) => onBudgetCapChange(e.target.value)}
                  placeholder="No limit"
                  className="w-28 px-2 py-1 text-xs bg-bg-input border border-border-default rounded-[4px] text-text-primary placeholder:text-text-ghost focus:outline-none focus:border-sprints transition-all"
                />
              </div>
              <p className="text-2xs text-text-ghost">Leave empty for no limit.</p>
            </div>
            <div className="space-y-1">
              <label className="text-2xs text-text-tertiary">Per-step budget</label>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-text-ghost">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.50"
                  value={stepBudgetCapUsd}
                  onChange={(e) => onStepBudgetCapChange(e.target.value)}
                  placeholder="No limit"
                  className="w-28 px-2 py-1 text-xs bg-bg-input border border-border-default rounded-[4px] text-text-primary placeholder:text-text-ghost focus:outline-none focus:border-sprints transition-all"
                />
              </div>
              <p className="text-2xs text-text-ghost">Leave empty for no limit.</p>
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4: Done
// ---------------------------------------------------------------------------

function StepDone({ sprint }: { sprint: { id: string; name: string; gateCount: number } | null }) {
  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <div className="w-10 h-10 rounded-full bg-sprints/20 flex items-center justify-center">
        <CheckIcon size={16} className="text-sprints" />
      </div>
      <p className="text-xs font-medium text-text-primary">{sprint?.name ?? "Sprint"} created</p>
      <p className="text-xs text-text-tertiary text-center max-w-[280px]">
        The sprint has been created with {sprint?.gateCount ?? 0} pipeline gates. It will appear in
        the sprints list as &quot;planned&quot;.
      </p>
      {sprint?.id && (
        <div className="w-full bg-bg-base rounded-[4px] border border-border-default px-3 py-2 space-y-1">
          <p className="text-2xs text-text-ghost uppercase tracking-wider">Sprint ID</p>
          <p className="text-xs text-text-secondary font-mono">{sprint.id}</p>
        </div>
      )}
    </div>
  );
}
