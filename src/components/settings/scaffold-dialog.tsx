"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { X, Check, SpinnerGap, Users, GitBranch, Bell, CaretRight, CaretLeft, Brain } from "@phosphor-icons/react";

const AVAILABLE_AGENTS = [
  { id: "orchestrator", label: "orchestrator", desc: "Coordinates the team, delegates work", defaultOn: true },
  { id: "frontend", label: "frontend", desc: "Builds UI and frontend code", defaultOn: true },
  { id: "backend", label: "backend", desc: "Builds APIs, database, server code", defaultOn: true },
  { id: "qa", label: "qa", desc: "Tests the application", defaultOn: true },
  { id: "security", label: "security", desc: "Reviews code for vulnerabilities", defaultOn: false },
  { id: "pmo", label: "pmo", desc: "Scans for tasks automatically", defaultOn: false },
  { id: "documentation", label: "documentation", desc: "Maintains docs", defaultOn: false },
  { id: "domain", label: "domain", desc: "Domain-specific business logic", defaultOn: false },
] as const;

type WorkflowType = "sprint" | "simple" | "custom";

interface ScaffoldDialogProps {
  projectPath: string;
  onComplete: (agentSystemPath: string) => void;
  onCancel: () => void;
}

export function ScaffoldDialog({ projectPath, onComplete, onCancel }: ScaffoldDialogProps) {
  const [dialogStep, setDialogStep] = useState(0);
  const [selectedAgents, setSelectedAgents] = useState<string[]>(
    AVAILABLE_AGENTS.filter((a) => a.defaultOn).map((a) => a.id),
  );
  const [workflow, setWorkflow] = useState<WorkflowType>("sprint");
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [schedulerEnabled, setSchedulerEnabled] = useState(false);
  const [schedulerInterval, setSchedulerInterval] = useState(2);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<{ created: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const DIALOG_STEPS = ["Agents", "Workflow", "Automation"] as const;

  const toggleAgent = useCallback((id: string) => {
    setSelectedAgents((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    );
  }, []);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/scaffold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectPath,
          agents: selectedAgents,
          workflow,
          notifications: { telegram: telegramEnabled },
          scheduler: { enabled: schedulerEnabled, intervalHours: schedulerInterval },
        }),
      });

      if (res.ok) {
        const data = await res.json() as { created: string[] };
        setResult(data);
        onComplete(`${projectPath}/ai-agents`);
      } else {
        const errData = await res.json() as { error: string };
        setError(errData.error ?? "Failed to create agent system");
      }
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setCreating(false);
    }
  }, [projectPath, selectedAgents, workflow, telegramEnabled, schedulerEnabled, schedulerInterval, onComplete]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[520px] bg-console-panel border border-console-border rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-console-border">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-console-accent" />
            <h2 className="text-xs font-semibold text-console-text">
              Create Agent System
            </h2>
          </div>
          <button
            onClick={onCancel}
            className="p-1 text-console-dim hover:text-console-text transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Progress */}
        <div className="flex border-b border-console-border">
          {DIALOG_STEPS.map((s, i) => (
            <div
              key={s}
              className={cn(
                "flex-1 py-1.5 text-center text-label-xs font-medium transition-colors border-b-2",
                i <= dialogStep
                  ? "text-console-accent border-console-accent"
                  : "text-console-dim border-transparent",
                i < dialogStep && "text-console-success border-console-success",
              )}
            >
              {s}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="px-5 py-4 min-h-[280px]">
          {result ? (
            <div className="flex flex-col items-center text-center pt-4 space-y-3">
              <div className="w-12 h-12 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                <Check className="w-6 h-6 text-green-400" />
              </div>
              <p className="text-sm font-medium text-console-text">
                Agent system created
              </p>
              <p className="text-label-xs text-console-muted">
                {result.created.length} files generated in {projectPath}
              </p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center text-center pt-6 space-y-3">
              <p className="text-xs text-red-400">{error}</p>
              <button
                onClick={() => setError(null)}
                className="px-3 py-1 text-label-xs text-console-muted hover:text-console-text border border-console-border rounded"
              >
                Try Again
              </button>
            </div>
          ) : (
            <>
              {dialogStep === 0 && (
                <DialogAgentsStep
                  selectedAgents={selectedAgents}
                  toggleAgent={toggleAgent}
                  setSelectedAgents={setSelectedAgents}
                />
              )}
              {dialogStep === 1 && (
                <DialogWorkflowStep workflow={workflow} setWorkflow={setWorkflow} />
              )}
              {dialogStep === 2 && (
                <DialogAutomationStep
                  telegramEnabled={telegramEnabled}
                  setTelegramEnabled={setTelegramEnabled}
                  schedulerEnabled={schedulerEnabled}
                  setSchedulerEnabled={setSchedulerEnabled}
                  schedulerInterval={schedulerInterval}
                  setSchedulerInterval={setSchedulerInterval}
                />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!result && !error && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-console-border">
            <button
              onClick={() => dialogStep === 0 ? onCancel() : setDialogStep((s) => s - 1)}
              className="flex items-center gap-1 px-2 py-1 text-label-xs text-console-muted hover:text-console-text transition-colors"
            >
              <CaretLeft className="w-3 h-3" />
              {dialogStep === 0 ? "Cancel" : "Back"}
            </button>

            <span className="text-label-xs text-console-dim font-mono">
              {projectPath}
            </span>

            {dialogStep < DIALOG_STEPS.length - 1 ? (
              <button
                onClick={() => setDialogStep((s) => s + 1)}
                disabled={dialogStep === 0 && selectedAgents.length === 0}
                className={cn(
                  "flex items-center gap-1 px-3 py-1 text-label-xs font-medium rounded transition-all",
                  selectedAgents.length > 0 || dialogStep > 0
                    ? "bg-console-accent text-black hover:bg-console-accent/90"
                    : "bg-console-faint text-console-dim cursor-not-allowed",
                )}
              >
                Next
                <CaretRight className="w-3 h-3" />
              </button>
            ) : (
              <button
                onClick={() => void handleCreate()}
                disabled={creating}
                className="flex items-center gap-1.5 px-3 py-1 text-label-xs font-medium rounded bg-console-success/80 text-black hover:bg-console-success transition-all disabled:opacity-50"
              >
                {creating ? (
                  <SpinnerGap className="w-3 h-3 animate-spin" />
                ) : (
                  <Check className="w-3 h-3" />
                )}
                {creating ? "Creating..." : "Create"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Dialog sub-steps ---

function DialogAgentsStep({
  selectedAgents,
  toggleAgent,
  setSelectedAgents,
}: {
  selectedAgents: string[];
  toggleAgent: (id: string) => void;
  setSelectedAgents: (agents: string[]) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-xs font-medium text-console-text mb-0.5">
          <Users className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
          Select agents
        </h3>
        <p className="text-label-xs text-console-dim">
          Choose which agents to include in your system.
        </p>
      </div>
      <div className="space-y-1 max-h-[170px] overflow-y-auto">
        {AVAILABLE_AGENTS.map((agent) => (
          <label
            key={agent.id}
            className={cn(
              "flex items-center gap-2.5 px-2.5 py-1.5 rounded border cursor-pointer transition-all",
              selectedAgents.includes(agent.id)
                ? "bg-console-accent/10 border-console-accent/30"
                : "bg-console-bg border-console-border hover:border-console-muted",
            )}
          >
            <input
              type="checkbox"
              checked={selectedAgents.includes(agent.id)}
              onChange={() => toggleAgent(agent.id)}
              className="accent-console-accent"
            />
            <span className="text-label-xs font-mono text-console-text w-24">
              {agent.label}
            </span>
            <span className="text-label-xs text-console-dim flex-1">
              {agent.desc}
            </span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setSelectedAgents(AVAILABLE_AGENTS.map((a) => a.id))}
          className="px-2 py-0.5 text-label-xs text-console-muted hover:text-console-accent border border-console-border rounded transition-colors"
        >
          All
        </button>
        <button
          onClick={() => setSelectedAgents([])}
          className="px-2 py-0.5 text-label-xs text-console-muted hover:text-console-accent border border-console-border rounded transition-colors"
        >
          None
        </button>
        <span className="text-label-xs text-console-dim ml-auto">
          {selectedAgents.length} selected
        </span>
      </div>
    </div>
  );
}

function DialogWorkflowStep({
  workflow,
  setWorkflow,
}: {
  workflow: WorkflowType;
  setWorkflow: (w: WorkflowType) => void;
}) {
  const options: { id: WorkflowType; label: string; desc: string }[] = [
    { id: "sprint", label: "Sprint Planning", desc: "Scan, spec, approve, build (phases + gates), test, ship" },
    { id: "simple", label: "Simple Pipeline", desc: "Plan, build, test, deploy" },
    { id: "custom", label: "Custom", desc: "Define your own steps later" },
  ];

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-xs font-medium text-console-text mb-0.5">
          <GitBranch className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
          Workflow
        </h3>
        <p className="text-label-xs text-console-dim">
          How should your agent team work together?
        </p>
      </div>
      <div className="space-y-1.5">
        {options.map((opt) => (
          <label
            key={opt.id}
            className={cn(
              "flex items-start gap-2.5 px-3 py-2.5 rounded border cursor-pointer transition-all",
              workflow === opt.id
                ? "bg-console-accent/10 border-console-accent/30"
                : "bg-console-bg border-console-border hover:border-console-muted",
            )}
          >
            <input
              type="radio"
              checked={workflow === opt.id}
              onChange={() => setWorkflow(opt.id)}
              className="accent-console-accent mt-0.5"
            />
            <div>
              <span className="text-label-xs font-medium text-console-text">{opt.label}</span>
              <p className="text-label-xs text-console-dim mt-0.5">{opt.desc}</p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

function DialogAutomationStep({
  telegramEnabled,
  setTelegramEnabled,
  schedulerEnabled,
  setSchedulerEnabled,
  schedulerInterval,
  setSchedulerInterval,
}: {
  telegramEnabled: boolean;
  setTelegramEnabled: (v: boolean) => void;
  schedulerEnabled: boolean;
  setSchedulerEnabled: (v: boolean) => void;
  schedulerInterval: number;
  setSchedulerInterval: (v: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-xs font-medium text-console-text mb-0.5">
          <Bell className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
          Automation (optional)
        </h3>
        <p className="text-label-xs text-console-dim">
          You can enable these later in Settings.
        </p>
      </div>
      <div className="space-y-2">
        <label
          className={cn(
            "flex items-start gap-2.5 px-3 py-2.5 rounded border cursor-pointer transition-all",
            telegramEnabled
              ? "bg-console-accent/10 border-console-accent/30"
              : "bg-console-bg border-console-border hover:border-console-muted",
          )}
        >
          <input
            type="checkbox"
            checked={telegramEnabled}
            onChange={(e) => setTelegramEnabled(e.target.checked)}
            className="accent-console-accent mt-0.5"
          />
          <div>
            <span className="text-label-xs font-medium text-console-text">Telegram notifications</span>
            <p className="text-label-xs text-console-dim mt-0.5">
              Get pinged when sprints are ready or gates pass.
            </p>
          </div>
        </label>
        <label
          className={cn(
            "flex items-start gap-2.5 px-3 py-2.5 rounded border cursor-pointer transition-all",
            schedulerEnabled
              ? "bg-console-accent/10 border-console-accent/30"
              : "bg-console-bg border-console-border hover:border-console-muted",
          )}
        >
          <input
            type="checkbox"
            checked={schedulerEnabled}
            onChange={(e) => setSchedulerEnabled(e.target.checked)}
            className="accent-console-accent mt-0.5"
          />
          <div>
            <span className="text-label-xs font-medium text-console-text">PMO scheduler</span>
            <p className="text-label-xs text-console-dim mt-0.5">
              Automatically scan for tasks every {schedulerInterval} hours.
            </p>
          </div>
        </label>
        {schedulerEnabled && (
          <div className="pl-8">
            <label className="text-label-xs text-console-muted block mb-1">Interval (hours)</label>
            <input
              type="number"
              min={1}
              max={24}
              value={schedulerInterval}
              onChange={(e) => setSchedulerInterval(parseInt(e.target.value, 10) || 2)}
              className="w-16 px-2 py-0.5 text-label-xs font-mono bg-console-bg border border-console-border rounded text-console-text focus:border-console-accent focus:outline-none"
            />
          </div>
        )}
      </div>
    </div>
  );
}
