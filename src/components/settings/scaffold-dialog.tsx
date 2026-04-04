"use client";

import { useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { CloseIcon, CheckIcon, ChevronRightIcon, ChevronDownIcon, MemoryIcon, SprintsIcon, BellIcon } from "@/components/ui/icons";

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

  // Escape key to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={onCancel}
      />
      <div className="relative z-10 w-[480px] bg-bg-elevated border border-border-subtle rounded-[8px] shadow-modal overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-default">
          <div className="flex items-center gap-2">
            <MemoryIcon size={14} className="text-text-secondary" />
            <h2 className="text-xs font-semibold text-text-primary">
              Create Agent System
            </h2>
          </div>
          <button
            onClick={onCancel}
            className="p-1 text-text-ghost hover:text-text-secondary transition-colors rounded"
          >
            <CloseIcon size={14} />
          </button>
        </div>

        {/* Progress steps */}
        <div className="flex border-b border-border-default">
          {DIALOG_STEPS.map((s, i) => (
            <div
              key={s}
              className={cn(
                "flex-1 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.8px] border-b-2 transition-colors",
                i === dialogStep
                  ? "text-[#f59e0b] border-[#f59e0b]"
                  : i < dialogStep
                    ? "text-sessions border-sessions"
                    : "text-text-ghost border-transparent",
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
              <div className="w-12 h-12 rounded-xl bg-sessions/10 border border-sessions/20 flex items-center justify-center">
                <CheckIcon size={24} className="text-sessions" />
              </div>
              <p className="text-xs font-medium text-text-primary">
                Agent system created
              </p>
              <p className="text-[10px] text-text-ghost">
                {result.created.length} files generated in {projectPath}
              </p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center text-center pt-6 space-y-3">
              <p className="text-xs text-error">{error}</p>
              <button
                onClick={() => setError(null)}
                className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary border border-border-default rounded-md transition-colors"
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
          <div className="flex items-center justify-between px-5 py-3 border-t border-border-default">
            <button
              onClick={() => dialogStep === 0 ? onCancel() : setDialogStep((s) => s - 1)}
              className="flex items-center gap-1 px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors rounded-md"
            >
              {dialogStep === 0 ? "Cancel" : "Back"}
            </button>

            <span className="text-[10px] text-text-ghost font-mono">
              {projectPath}
            </span>

            {dialogStep < DIALOG_STEPS.length - 1 ? (
              <button
                onClick={() => setDialogStep((s) => s + 1)}
                disabled={dialogStep === 0 && selectedAgents.length === 0}
                className={cn(
                  "flex items-center gap-1 px-4 py-1.5 text-xs font-semibold rounded-md transition-all",
                  selectedAgents.length > 0 || dialogStep > 0
                    ? "bg-[#f59e0b] text-[#0a0a0a] hover:bg-[#fbbf24]"
                    : "bg-border-default text-text-ghost cursor-not-allowed",
                )}
              >
                Next
                <ChevronRightIcon size={12} />
              </button>
            ) : (
              <button
                onClick={() => void handleCreate()}
                disabled={creating}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-md bg-sessions text-bg-base hover:bg-sessions/90 transition-all disabled:opacity-50"
              >
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
        <h3 className="text-xs font-medium text-text-primary mb-0.5">
          Select agents
        </h3>
        <p className="text-[10px] text-text-ghost">
          Choose which agents to include in your system.
        </p>
      </div>
      <div className="space-y-1 max-h-[170px] overflow-y-auto scrollbar-thin">
        {AVAILABLE_AGENTS.map((agent) => (
          <label
            key={agent.id}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-md border cursor-pointer transition-all",
              selectedAgents.includes(agent.id)
                ? "bg-[#f59e0b]/5 border-[#f59e0b]/30"
                : "bg-transparent border-border-default hover:border-border-subtle",
            )}
          >
            <input
              type="checkbox"
              checked={selectedAgents.includes(agent.id)}
              onChange={() => toggleAgent(agent.id)}
              className="accent-[#f59e0b]"
            />
            <span className="text-xs font-mono text-text-primary w-24">
              {agent.label}
            </span>
            <span className="text-[10px] text-text-ghost flex-1">
              {agent.desc}
            </span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setSelectedAgents(AVAILABLE_AGENTS.map((a) => a.id))}
          className="px-2 py-1 text-[10px] text-text-secondary hover:text-text-primary border border-border-default rounded-md transition-colors"
        >
          All
        </button>
        <button
          onClick={() => setSelectedAgents([])}
          className="px-2 py-1 text-[10px] text-text-secondary hover:text-text-primary border border-border-default rounded-md transition-colors"
        >
          None
        </button>
        <span className="text-[10px] text-text-ghost ml-auto">
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
    { id: "sprint", label: "Sprint Planning", desc: "Scan, spec, approve, build, test, ship" },
    { id: "simple", label: "Simple Pipeline", desc: "Plan, build, test, deploy" },
    { id: "custom", label: "Custom", desc: "Define your own steps later" },
  ];

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-xs font-medium text-text-primary mb-0.5">
          Workflow
        </h3>
        <p className="text-[10px] text-text-ghost">
          How should your agent team work together?
        </p>
      </div>
      <div className="space-y-1.5">
        {options.map((opt) => (
          <label
            key={opt.id}
            className={cn(
              "flex items-start gap-2.5 px-3 py-2.5 rounded-md border cursor-pointer transition-all",
              workflow === opt.id
                ? "bg-[#f59e0b]/5 border-[#f59e0b]/30"
                : "bg-transparent border-border-default hover:border-border-subtle",
            )}
          >
            <input
              type="radio"
              checked={workflow === opt.id}
              onChange={() => setWorkflow(opt.id)}
              className="accent-[#f59e0b] mt-0.5"
            />
            <div>
              <span className="text-xs font-medium text-text-primary">{opt.label}</span>
              <p className="text-[10px] text-text-ghost mt-0.5">{opt.desc}</p>
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
        <h3 className="text-xs font-medium text-text-primary mb-0.5">
          Automation (optional)
        </h3>
        <p className="text-[10px] text-text-ghost">
          You can enable these later in Settings.
        </p>
      </div>
      <div className="space-y-2">
        <label
          className={cn(
            "flex items-start gap-2.5 px-3 py-2.5 rounded-md border cursor-pointer transition-all",
            telegramEnabled
              ? "bg-[#f59e0b]/5 border-[#f59e0b]/30"
              : "bg-transparent border-border-default hover:border-border-subtle",
          )}
        >
          <input
            type="checkbox"
            checked={telegramEnabled}
            onChange={(e) => setTelegramEnabled(e.target.checked)}
            className="accent-[#f59e0b] mt-0.5"
          />
          <div>
            <span className="text-xs font-medium text-text-primary">Telegram notifications</span>
            <p className="text-[10px] text-text-ghost mt-0.5">
              Get pinged when sprints are ready or gates pass.
            </p>
          </div>
        </label>
        <label
          className={cn(
            "flex items-start gap-2.5 px-3 py-2.5 rounded-md border cursor-pointer transition-all",
            schedulerEnabled
              ? "bg-[#f59e0b]/5 border-[#f59e0b]/30"
              : "bg-transparent border-border-default hover:border-border-subtle",
          )}
        >
          <input
            type="checkbox"
            checked={schedulerEnabled}
            onChange={(e) => setSchedulerEnabled(e.target.checked)}
            className="accent-[#f59e0b] mt-0.5"
          />
          <div>
            <span className="text-xs font-medium text-text-primary">PMO scheduler</span>
            <p className="text-[10px] text-text-ghost mt-0.5">
              Automatically scan for tasks every {schedulerInterval} hours.
            </p>
          </div>
        </label>
        {schedulerEnabled && (
          <div className="pl-8">
            <span className="text-[10px] font-semibold uppercase text-text-ghost tracking-[0.8px] block mb-1">
              Interval (hours)
            </span>
            <input
              type="number"
              min={1}
              max={24}
              value={schedulerInterval}
              onChange={(e) => setSchedulerInterval(parseInt(e.target.value, 10) || 2)}
              className="w-16 px-2 py-1 text-xs font-mono bg-bg-input border border-border-default rounded-md text-text-primary focus:border-[#f59e0b]/40 focus:outline-none"
            />
          </div>
        )}
      </div>
    </div>
  );
}
