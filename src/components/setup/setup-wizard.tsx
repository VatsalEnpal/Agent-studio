"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Rocket,
  FolderOpen,
  Brain,
  Settings,
  ChevronRight,
  ChevronLeft,
  Plus,
  X,
  Check,
  AlertTriangle,
  Loader2,
  Users,
  GitBranch,
  Bell,
} from "lucide-react";

interface ProjectEntry {
  name: string;
  path: string;
  isProd: boolean;
  trackedBranches?: string[];
}

interface AgentSystemState {
  enabled: boolean;
  createNew: boolean;
  path: string;
  found: {
    memoryIndex: boolean;
    currentSprint: boolean;
    scanLog: boolean;
    memoryCount: number;
  };
}

interface SetupWizardProps {
  onComplete: () => void;
}

// Available agent definitions
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

function getAllSteps(agentSystem: AgentSystemState) {
  const base = ["Welcome", "Projects", "Agent System", "Preferences"] as const;
  if (agentSystem.enabled && agentSystem.createNew) {
    return [...base.slice(0, 3), "Agent Team", "Workflow", "Automation", ...base.slice(3)] as const;
  }
  return base;
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 2: Projects
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [newProjectPath, setNewProjectPath] = useState("");

  // Step 3: Agent System
  const [agentSystem, setAgentSystem] = useState<AgentSystemState>({
    enabled: false,
    createNew: false,
    path: "",
    found: { memoryIndex: false, currentSprint: false, scanLog: false, memoryCount: 0 },
  });

  // Step 4 (conditional): Agent Team
  const [selectedAgents, setSelectedAgents] = useState<string[]>(
    AVAILABLE_AGENTS.filter((a) => a.defaultOn).map((a) => a.id),
  );

  // Step 5 (conditional): Workflow
  const [workflow, setWorkflow] = useState<WorkflowType>("sprint");

  // Step 6 (conditional): Automation
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [schedulerEnabled, setSchedulerEnabled] = useState(false);
  const [schedulerInterval, setSchedulerInterval] = useState(2);

  // Final: Preferences
  const [model, setModel] = useState<"opus" | "sonnet" | "haiku">("sonnet");
  const [permissions, setPermissions] = useState<"bypass" | "default" | "plan">("bypass");

  // Scaffolding state
  const [scaffolding, setScaffolding] = useState(false);
  const [scaffoldResult, setScaffoldResult] = useState<{ created: string[] } | null>(null);

  const STEPS = getAllSteps(agentSystem);

  // Auto-detect on mount
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/config");
        if (!res.ok) return;
        const data = await res.json() as {
          homeDir: string;
          mainProjectDir: string;
          config: {
            projects: ProjectEntry[];
            agentSystem?: { path: string };
            defaults: { model: string; permissions: string };
          };
        };

        if (data.config?.projects?.length) {
          setProjects(data.config.projects);
        }

        if (data.config?.agentSystem) {
          setAgentSystem((prev) => ({
            ...prev,
            enabled: true,
            createNew: false,
            path: data.config.agentSystem!.path,
          }));
        }

        if (data.config?.defaults) {
          const d = data.config.defaults;
          if (d.model === "opus" || d.model === "sonnet" || d.model === "haiku") {
            setModel(d.model);
          }
        }
      } catch {
        // Server not ready yet
      }
    })();
  }, []);

  // Validate agent system path
  useEffect(() => {
    if (!agentSystem.enabled || !agentSystem.path || agentSystem.createNew) {
      setAgentSystem((prev) => ({
        ...prev,
        found: { memoryIndex: false, currentSprint: false, scanLog: false, memoryCount: 0 },
      }));
      return;
    }

    void (async () => {
      try {
        const res = await fetch(
          `/api/setup/validate-agent-system?path=${encodeURIComponent(agentSystem.path)}`,
        );
        if (res.ok) {
          const data = await res.json() as {
            memoryIndex: boolean;
            currentSprint: boolean;
            scanLog: boolean;
            memoryCount: number;
          };
          setAgentSystem((prev) => ({ ...prev, found: data }));
        }
      } catch {
        // Leave found as false
      }
    })();
  }, [agentSystem.enabled, agentSystem.path, agentSystem.createNew]);

  const addProject = useCallback(() => {
    if (!newProjectPath.trim()) return;
    const name = newProjectPath.trim().split("/").pop() ?? "project";
    setProjects((prev) => [
      ...prev,
      { name, path: newProjectPath.trim(), isProd: false },
    ]);
    setNewProjectPath("");
  }, [newProjectPath]);

  const removeProject = useCallback((idx: number) => {
    setProjects((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const toggleProd = useCallback((idx: number) => {
    setProjects((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, isProd: !p.isProd } : p)),
    );
  }, []);

  const toggleAgent = useCallback((id: string) => {
    setSelectedAgents((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    );
  }, []);

  const handleFinish = useCallback(async () => {
    setSaving(true);
    try {
      // If creating new agent system, scaffold first
      if (agentSystem.enabled && agentSystem.createNew && projects.length > 0) {
        setScaffolding(true);
        const projectPath = projects[0].path;
        const scaffoldRes = await fetch("/api/scaffold", {
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

        if (scaffoldRes.ok) {
          const result = await scaffoldRes.json() as { created: string[] };
          setScaffoldResult(result);
          // Update agent system path to the newly created one
          agentSystem.path = `${projectPath}/ai-agents`;
        }
        setScaffolding(false);
      }

      // Build the config
      const config = {
        projects,
        agentSystem: agentSystem.enabled && agentSystem.path
          ? {
              path: agentSystem.path,
              memoryIndex: "tools/memory_index.json",
              sprintDir: "sprints/",
              scanLog: "sprints/scan_log.md",
            }
          : undefined,
        devServers: projects
          .filter((p) => !p.isProd)
          .map((p) => ({
            name: p.name,
            path: p.path,
            command: "npm run dev",
          })),
        defaults: {
          model,
          permissions,
          workingDirectory: projects[0]?.path?.replace(
            new RegExp(`^${await getHomeDir()}`),
            "~",
          ) ?? "~",
        },
        setupComplete: true,
        version: "1.0.0",
      };

      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (res.ok) {
        onComplete();
      }
    } catch {
      // Show error state if needed
    } finally {
      setSaving(false);
    }
  }, [projects, agentSystem, model, permissions, selectedAgents, workflow, telegramEnabled, schedulerEnabled, schedulerInterval, onComplete]);

  const canAdvance = (): boolean => {
    const currentStep = STEPS[step];
    if (currentStep === "Projects") return projects.length > 0;
    if (currentStep === "Agent Team") return selectedAgents.length > 0;
    return true;
  };

  const currentStep = STEPS[step];

  return (
    <div className="h-screen flex items-center justify-center bg-console-bg">
      <div className="w-[560px] bg-console-panel border border-console-border rounded-xl shadow-2xl overflow-hidden">
        {/* Progress bar */}
        <div className="flex border-b border-console-border">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={cn(
                "flex-1 py-2 text-center text-[10px] font-medium transition-colors border-b-2",
                i <= step
                  ? "text-console-accent border-console-accent"
                  : "text-console-dim border-transparent",
                i < step && "text-console-success border-console-success",
              )}
            >
              {s}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="px-8 py-6 min-h-[340px]">
          {currentStep === "Welcome" && <WelcomeStep />}
          {currentStep === "Projects" && (
            <ProjectsStep
              projects={projects}
              newProjectPath={newProjectPath}
              setNewProjectPath={setNewProjectPath}
              addProject={addProject}
              removeProject={removeProject}
              toggleProd={toggleProd}
            />
          )}
          {currentStep === "Agent System" && (
            <AgentSystemStep
              agentSystem={agentSystem}
              setAgentSystem={setAgentSystem}
            />
          )}
          {currentStep === "Agent Team" && (
            <AgentTeamStep
              selectedAgents={selectedAgents}
              toggleAgent={toggleAgent}
              setSelectedAgents={setSelectedAgents}
            />
          )}
          {currentStep === "Workflow" && (
            <WorkflowStep
              workflow={workflow}
              setWorkflow={setWorkflow}
            />
          )}
          {currentStep === "Automation" && (
            <AutomationStep
              telegramEnabled={telegramEnabled}
              setTelegramEnabled={setTelegramEnabled}
              schedulerEnabled={schedulerEnabled}
              setSchedulerEnabled={setSchedulerEnabled}
              schedulerInterval={schedulerInterval}
              setSchedulerInterval={setSchedulerInterval}
            />
          )}
          {currentStep === "Preferences" && (
            <PreferencesStep
              model={model}
              setModel={setModel}
              permissions={permissions}
              setPermissions={setPermissions}
              scaffoldResult={scaffoldResult}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-8 py-4 border-t border-console-border">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className={cn(
              "flex items-center gap-1 px-3 py-1.5 text-xs rounded transition-all",
              step === 0
                ? "text-console-dim cursor-not-allowed"
                : "text-console-muted hover:text-console-text",
            )}
          >
            <ChevronLeft className="w-3 h-3" />
            Back
          </button>

          <span className="text-[10px] text-console-dim">
            {step + 1} / {STEPS.length}
          </span>

          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              disabled={!canAdvance()}
              className={cn(
                "flex items-center gap-1 px-4 py-1.5 text-xs font-medium rounded transition-all",
                canAdvance()
                  ? "bg-console-accent text-black hover:bg-console-accent/90"
                  : "bg-console-faint text-console-dim cursor-not-allowed",
              )}
            >
              Next
              <ChevronRight className="w-3 h-3" />
            </button>
          ) : (
            <button
              onClick={() => void handleFinish()}
              disabled={saving || scaffolding}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded bg-console-success/80 text-black hover:bg-console-success transition-all disabled:opacity-50"
            >
              {saving || scaffolding ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Check className="w-3 h-3" />
              )}
              {scaffolding ? "Creating agents..." : saving ? "Saving..." : "Finish Setup"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Step Components ----------

function WelcomeStep() {
  return (
    <div className="flex flex-col items-center text-center pt-6 space-y-5">
      <div className="w-16 h-16 rounded-2xl bg-console-accent/10 border border-console-accent/20 flex items-center justify-center">
        <Rocket className="w-8 h-8 text-console-accent" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-console-text mb-2">
          Welcome to Agent Studio
        </h2>
        <p className="text-sm text-console-muted max-w-md">
          Your command center for AI coding agents. Manage sessions, monitor
          sprints, and track agent memory — all from one dashboard.
        </p>
      </div>
      <p className="text-xs text-console-dim">
        Let&apos;s set up your workspace in a few quick steps.
      </p>
    </div>
  );
}

function ProjectsStep({
  projects,
  newProjectPath,
  setNewProjectPath,
  addProject,
  removeProject,
  toggleProd,
}: {
  projects: ProjectEntry[];
  newProjectPath: string;
  setNewProjectPath: (v: string) => void;
  addProject: () => void;
  removeProject: (i: number) => void;
  toggleProd: (i: number) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-console-text mb-1">
          <FolderOpen className="w-4 h-4 inline mr-1.5 -mt-0.5" />
          Where are your projects?
        </h2>
        <p className="text-xs text-console-dim">
          Add the git repositories you work with. These show up in the sidebar
          for status monitoring.
        </p>
      </div>

      {/* Project list */}
      <div className="space-y-2 max-h-36 overflow-y-auto">
        {projects.map((p, i) => (
          <div
            key={`${p.path}-${i}`}
            className="flex items-center gap-2 px-3 py-2 bg-console-bg border border-console-border rounded text-xs"
          >
            <FolderOpen className="w-3.5 h-3.5 text-console-dim shrink-0" />
            <span className="flex-1 text-console-text font-mono truncate">
              {p.path}
            </span>
            <button
              onClick={() => toggleProd(i)}
              className={cn(
                "px-2 py-0.5 text-[9px] font-medium rounded border transition-colors",
                p.isProd
                  ? "bg-red-500/15 text-red-400 border-red-500/30"
                  : "bg-console-faint text-console-dim border-transparent hover:border-console-border",
              )}
            >
              {p.isProd ? "PROD" : "dev"}
            </button>
            <button
              onClick={() => removeProject(i)}
              className="p-0.5 text-console-dim hover:text-console-error transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Add project */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newProjectPath}
          onChange={(e) => setNewProjectPath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addProject();
          }}
          placeholder="/path/to/project"
          className="flex-1 px-3 py-2 text-xs font-mono bg-console-bg border border-console-border rounded text-console-text placeholder:text-console-dim focus:border-console-accent focus:outline-none"
        />
        <button
          onClick={addProject}
          disabled={!newProjectPath.trim()}
          className={cn(
            "flex items-center gap-1 px-3 py-2 text-xs font-medium rounded transition-all",
            newProjectPath.trim()
              ? "bg-console-accent/20 text-console-accent hover:bg-console-accent/30"
              : "bg-console-faint text-console-dim cursor-not-allowed",
          )}
        >
          <Plus className="w-3 h-3" />
          Add
        </button>
      </div>

      {projects.length > 0 && projects.some((p) => p.isProd) && (
        <div className="flex items-start gap-2 px-3 py-2 bg-yellow-500/5 border border-yellow-500/20 rounded text-[10px] text-yellow-400">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Production repos require confirmation for commits and pushes.
        </div>
      )}
    </div>
  );
}

function AgentSystemStep({
  agentSystem,
  setAgentSystem,
}: {
  agentSystem: AgentSystemState;
  setAgentSystem: React.Dispatch<React.SetStateAction<AgentSystemState>>;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-console-text mb-1">
          <Brain className="w-4 h-4 inline mr-1.5 -mt-0.5" />
          AI Agent System
        </h2>
        <p className="text-xs text-console-dim">
          An agent system gives your AI agents memory, sprint management, and
          structured communication.
        </p>
      </div>

      <div className="space-y-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="radio"
            checked={!agentSystem.enabled}
            onChange={() =>
              setAgentSystem((prev) => ({ ...prev, enabled: false, createNew: false }))
            }
            className="accent-console-accent"
          />
          <div>
            <span className="text-xs text-console-text">Skip for now</span>
            <span className="text-[10px] text-console-dim ml-2">
              — Teams and Memory tabs will be hidden
            </span>
          </div>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="radio"
            checked={agentSystem.enabled && !agentSystem.createNew}
            onChange={() =>
              setAgentSystem((prev) => ({ ...prev, enabled: true, createNew: false }))
            }
            className="accent-console-accent"
          />
          <span className="text-xs text-console-text">
            I have one already
          </span>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="radio"
            checked={agentSystem.enabled && agentSystem.createNew}
            onChange={() =>
              setAgentSystem((prev) => ({ ...prev, enabled: true, createNew: true }))
            }
            className="accent-console-accent"
          />
          <div>
            <span className="text-xs text-console-accent font-medium">
              Create a new one
            </span>
            <span className="text-[10px] text-console-dim ml-2">
              — we&apos;ll scaffold it in your project
            </span>
          </div>
        </label>
      </div>

      {/* Existing system path input */}
      {agentSystem.enabled && !agentSystem.createNew && (
        <div className="space-y-3 pl-6">
          <input
            type="text"
            value={agentSystem.path}
            onChange={(e) =>
              setAgentSystem((prev) => ({ ...prev, path: e.target.value }))
            }
            placeholder="/path/to/ai-agents"
            className="w-full px-3 py-2 text-xs font-mono bg-console-bg border border-console-border rounded text-console-text placeholder:text-console-dim focus:border-console-accent focus:outline-none"
          />

          {agentSystem.path && (
            <div className="space-y-1.5">
              <ValidationRow
                label="tools/memory_index.json"
                found={agentSystem.found.memoryIndex}
                detail={
                  agentSystem.found.memoryIndex
                    ? `${agentSystem.found.memoryCount} entries`
                    : undefined
                }
              />
              <ValidationRow
                label="sprints/current.md"
                found={agentSystem.found.currentSprint}
              />
              <ValidationRow
                label="sprints/scan_log.md"
                found={agentSystem.found.scanLog}
              />
            </div>
          )}
        </div>
      )}

      {/* Create new — info */}
      {agentSystem.enabled && agentSystem.createNew && (
        <div className="pl-6">
          <div className="flex items-start gap-2 px-3 py-2 bg-console-accent/5 border border-console-accent/20 rounded text-[10px] text-console-muted">
            <Brain className="w-3.5 h-3.5 shrink-0 mt-0.5 text-console-accent" />
            <span>
              We&apos;ll create <code className="text-console-accent">ai-agents/</code> and{" "}
              <code className="text-console-accent">.claude/agents/</code> in your first
              project directory. Choose your agents on the next page.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function AgentTeamStep({
  selectedAgents,
  toggleAgent,
  setSelectedAgents,
}: {
  selectedAgents: string[];
  toggleAgent: (id: string) => void;
  setSelectedAgents: (agents: string[]) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-console-text mb-1">
          <Users className="w-4 h-4 inline mr-1.5 -mt-0.5" />
          Which agents do you want in your team?
        </h2>
        <p className="text-xs text-console-dim">
          Each agent gets its own definition file with rules and capabilities.
        </p>
      </div>

      <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
        {AVAILABLE_AGENTS.map((agent) => (
          <label
            key={agent.id}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded border cursor-pointer transition-all",
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
            <span className="text-xs font-mono text-console-text w-28">
              {agent.label}
            </span>
            <span className="text-[10px] text-console-dim flex-1">
              {agent.desc}
            </span>
          </label>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setSelectedAgents(AVAILABLE_AGENTS.map((a) => a.id))}
          className="px-2.5 py-1 text-[10px] text-console-muted hover:text-console-accent border border-console-border rounded transition-colors"
        >
          Select All
        </button>
        <button
          onClick={() => setSelectedAgents([])}
          className="px-2.5 py-1 text-[10px] text-console-muted hover:text-console-accent border border-console-border rounded transition-colors"
        >
          Select None
        </button>
        <span className="text-[10px] text-console-dim ml-auto">
          {selectedAgents.length} selected
        </span>
      </div>
    </div>
  );
}

function WorkflowStep({
  workflow,
  setWorkflow,
}: {
  workflow: WorkflowType;
  setWorkflow: (w: WorkflowType) => void;
}) {
  const options: { id: WorkflowType; label: string; desc: string; detail: string }[] = [
    {
      id: "sprint",
      label: "Sprint Planning",
      desc: "PMO scans, spec, approve, build (phases + gates), test, ship",
      detail: "Best for: structured development with automated scanning",
    },
    {
      id: "simple",
      label: "Simple Pipeline",
      desc: "Plan, build, test, deploy",
      detail: "Best for: straightforward projects",
    },
    {
      id: "custom",
      label: "Custom",
      desc: "Define your own steps later in Settings",
      detail: "Best for: unique workflows that don't fit a template",
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-console-text mb-1">
          <GitBranch className="w-4 h-4 inline mr-1.5 -mt-0.5" />
          How does your team work?
        </h2>
        <p className="text-xs text-console-dim">
          Choose a workflow pattern for your agents.
        </p>
      </div>

      <div className="space-y-2">
        {options.map((opt) => (
          <label
            key={opt.id}
            className={cn(
              "flex items-start gap-3 px-3 py-3 rounded border cursor-pointer transition-all",
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
              <span className="text-xs font-medium text-console-text">
                {opt.label}
              </span>
              <p className="text-[10px] text-console-muted mt-0.5">
                {opt.desc}
              </p>
              <p className="text-[10px] text-console-dim mt-0.5 italic">
                {opt.detail}
              </p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

function AutomationStep({
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
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-console-text mb-1">
          <Bell className="w-4 h-4 inline mr-1.5 -mt-0.5" />
          Notifications & Automation
        </h2>
        <p className="text-xs text-console-dim">
          These are optional. You can enable them later in Settings.
        </p>
      </div>

      <div className="space-y-3">
        {/* Telegram */}
        <label
          className={cn(
            "flex items-start gap-3 px-3 py-3 rounded border cursor-pointer transition-all",
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
            <span className="text-xs font-medium text-console-text">
              Telegram notifications
            </span>
            <p className="text-[10px] text-console-muted mt-0.5">
              Get pinged when sprints are ready or gates pass.
              Requires a Telegram bot token (you can set this up later).
            </p>
          </div>
        </label>

        {/* Scheduler */}
        <label
          className={cn(
            "flex items-start gap-3 px-3 py-3 rounded border cursor-pointer transition-all",
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
            <span className="text-xs font-medium text-console-text">
              PMO scheduler
            </span>
            <p className="text-[10px] text-console-muted mt-0.5">
              Automatically scan for tasks on a schedule.
              Requires launchd (macOS) or cron (Linux).
            </p>
          </div>
        </label>

        {schedulerEnabled && (
          <div className="pl-9">
            <label className="text-[10px] text-console-muted block mb-1">
              Scan interval (hours)
            </label>
            <input
              type="number"
              min={1}
              max={24}
              value={schedulerInterval}
              onChange={(e) => setSchedulerInterval(parseInt(e.target.value, 10) || 2)}
              className="w-20 px-2 py-1 text-xs font-mono bg-console-bg border border-console-border rounded text-console-text focus:border-console-accent focus:outline-none"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ValidationRow({
  label,
  found,
  detail,
}: {
  label: string;
  found: boolean;
  detail?: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[10px]">
      {found ? (
        <Check className="w-3 h-3 text-console-success" />
      ) : (
        <X className="w-3 h-3 text-console-dim" />
      )}
      <span
        className={cn(
          "font-mono",
          found ? "text-console-text" : "text-console-dim",
        )}
      >
        {label}
      </span>
      {detail && (
        <span className="text-console-muted">({detail})</span>
      )}
    </div>
  );
}

function PreferencesStep({
  model,
  setModel,
  permissions,
  setPermissions,
  scaffoldResult,
}: {
  model: "opus" | "sonnet" | "haiku";
  setModel: (m: "opus" | "sonnet" | "haiku") => void;
  permissions: "bypass" | "default" | "plan";
  setPermissions: (p: "bypass" | "default" | "plan") => void;
  scaffoldResult: { created: string[] } | null;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-console-text mb-1">
          <Settings className="w-4 h-4 inline mr-1.5 -mt-0.5" />
          Quick Preferences
        </h2>
        <p className="text-xs text-console-dim">
          You can change everything in Settings later.
        </p>
      </div>

      {/* Scaffold summary */}
      {scaffoldResult && scaffoldResult.created.length > 0 && (
        <div className="flex items-start gap-2 px-3 py-2 bg-green-500/5 border border-green-500/20 rounded text-[10px] text-green-400">
          <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            Agent system created: {scaffoldResult.created.length} files generated.
          </span>
        </div>
      )}

      {/* Model */}
      <div>
        <label className="text-[10px] text-console-muted block mb-2">
          Default Model
        </label>
        <div className="flex items-center gap-2">
          {(["opus", "sonnet", "haiku"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setModel(m)}
              className={cn(
                "px-4 py-2 text-xs font-medium rounded border transition-all",
                model === m
                  ? m === "opus"
                    ? "bg-purple-500/20 text-purple-400 border-purple-500/30"
                    : m === "haiku"
                      ? "bg-teal-500/20 text-teal-400 border border-teal-500/30"
                      : "bg-console-accent/20 text-console-accent border-console-accent/30"
                  : "bg-console-faint text-console-dim hover:text-console-muted border-transparent",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Permissions */}
      <div>
        <label className="text-[10px] text-console-muted block mb-2">
          Default Permissions
        </label>
        <div className="flex items-center gap-2">
          {(["bypass", "default", "plan"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPermissions(p)}
              className={cn(
                "px-4 py-2 text-xs font-medium rounded border transition-all",
                permissions === p
                  ? "bg-console-accent/20 text-console-accent border-console-accent/30"
                  : "bg-console-faint text-console-dim hover:text-console-muted border-transparent",
              )}
            >
              {p}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-console-dim mt-1.5">
          {permissions === "bypass"
            ? "Skip all permission prompts (fastest)"
            : permissions === "plan"
              ? "Plan mode: review before executing"
              : "Standard Claude Code permissions"}
        </p>
      </div>
    </div>
  );
}

// ---------- Helpers ----------

async function getHomeDir(): Promise<string> {
  try {
    const res = await fetch("/api/config");
    if (res.ok) {
      const data = await res.json() as { homeDir: string };
      return data.homeDir;
    }
  } catch {
    // fallback
  }
  return "/Users";
}
