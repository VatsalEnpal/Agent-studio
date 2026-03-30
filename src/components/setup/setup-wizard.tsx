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
  Sparkles,
  Pencil,
  RotateCcw,
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
  projectDescription?: string;
  found: {
    memoryIndex: boolean;
    currentSprint: boolean;
    scanLog: boolean;
    memoryCount: number;
  };
}

interface GeneratedAgentDef {
  id: string;
  name: string;
  description: string;
  model: "opus" | "sonnet" | "haiku";
  mdContent: string;
}

interface AiGenState {
  status: "idle" | "analyzing" | "generating" | "done" | "error";
  cliAvailable: boolean | null;
  analysis: Record<string, unknown> | null;
  agents: GeneratedAgentDef[];
  claudeMd: string | null;
  error: string | null;
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
    return [...base.slice(0, 3), "Describe Project", "Agent Team", "Workflow", "Automation", ...base.slice(3)] as const;
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

  // Step 4b (conditional): Describe Project
  const [projectDescription, setProjectDescription] = useState("");
  const [teamSize, setTeamSize] = useState<number | undefined>(undefined);
  const [scanResult, setScanResult] = useState<Record<string, unknown> | null>(null);
  const [scanning, setScanning] = useState(false);

  // Step 5 (conditional): Workflow
  const [workflow, setWorkflow] = useState<WorkflowType>("sprint");

  // Step 6 (conditional): Automation
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [schedulerEnabled, setSchedulerEnabled] = useState(false);
  const [schedulerInterval, setSchedulerInterval] = useState(2);

  // Automation suggestions state
  interface AutomationSuggestionUI {
    templateId: string;
    name: string;
    description: string;
    icon: string;
    schedule: string;
    model: "opus" | "sonnet" | "haiku";
    reason: string;
    priority: "recommended" | "optional";
    enabled: boolean;
  }
  const [autoSuggestions, setAutoSuggestions] = useState<AutomationSuggestionUI[]>([]);
  const [autoSuggestionsLoading, setAutoSuggestionsLoading] = useState(false);

  // Final: Preferences
  const [model, setModel] = useState<"opus" | "sonnet" | "haiku">("sonnet");
  const [permissions, setPermissions] = useState<"bypass" | "default" | "plan">("bypass");

  // Scaffolding state
  const [scaffolding, setScaffolding] = useState(false);
  const [scaffoldResult, setScaffoldResult] = useState<{ created: string[] } | null>(null);

  // AI agent generation state
  const [aiGen, setAiGen] = useState<AiGenState>({
    status: "idle",
    cliAvailable: null,
    analysis: null,
    agents: [],
    claudeMd: null,
    error: null,
  });
  const [useAiAgents, setUseAiAgents] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);

  // Smart detection state (Feature 2)
  interface DetectedProject {
    name: string;
    path: string;
    techStack: string[];
    languages: string[];
    packageManager: string;
    devCommand?: string;
    hasAgentSystem: boolean;
    gitBranch: string;
    lastCommit: string;
    lastModified: number;
  }
  const [detectedProjects, setDetectedProjects] = useState<DetectedProject[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [detectionDone, setDetectionDone] = useState(false);

  // Preflight info for welcome step
  const [claudeVersion, setClaudeVersion] = useState<string>("");

  const STEPS = getAllSteps(agentSystem);

  // Auto-detect on mount: fetch config + run detection + preflight info
  useEffect(() => {
    void (async () => {
      // Fetch existing config
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

      // Run project detection
      setDetecting(true);
      try {
        const detectRes = await fetch("/api/system/detect", { method: "POST" });
        if (detectRes.ok) {
          const data = await detectRes.json() as { projects: DetectedProject[] };
          setDetectedProjects(data.projects ?? []);
        }
      } catch { /* detection failed */ }
      setDetecting(false);
      setDetectionDone(true);

      // Get Claude Code version for welcome step
      try {
        const preRes = await fetch("/api/system/preflight");
        if (preRes.ok) {
          const preData = await preRes.json() as { checks: { claudeCode: { version?: string } } };
          setClaudeVersion(preData.checks?.claudeCode?.version ?? "");
        }
      } catch { /* ignore */ }
    })();
  }, []);

  // Check Claude CLI availability on mount
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/agents/cli-status");
        if (res.ok) {
          const data = await res.json() as { available: boolean };
          setAiGen((prev) => ({ ...prev, cliAvailable: data.available }));
        }
      } catch {
        setAiGen((prev) => ({ ...prev, cliAvailable: false }));
      }
    })();
  }, []);

  // Scan project for tech stack detection
  const scanProject = useCallback(async () => {
    if (!projects.length) return;
    setScanning(true);
    try {
      const res = await fetch("/api/agents/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectPath: projects[0].path }),
      });
      if (res.ok) {
        const data = await res.json() as Record<string, unknown>;
        setScanResult(data);
      }
    } catch {
      // Scan failed silently
    }
    setScanning(false);
  }, [projects]);

  // Trigger AI generation when entering Agent Team step with "create new" and CLI available
  const triggerAiGeneration = useCallback(async () => {
    if (!projects.length) return;
    const projectPath = projects[0].path;

    setAiGen((prev) => ({ ...prev, status: "analyzing", error: null }));
    try {
      // Step 1: Analyze project (use cached scan result if available)
      let analysis: Record<string, unknown>;
      if (scanResult) {
        analysis = scanResult;
      } else {
        const analyzeRes = await fetch("/api/agents/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectPath }),
        });
        if (!analyzeRes.ok) throw new Error("Failed to analyze project");
        analysis = await analyzeRes.json() as Record<string, unknown>;
      }

      setAiGen((prev) => ({ ...prev, status: "generating", analysis }));

      // Step 2: Generate agents (with user description and team size)
      const genRes = await fetch("/api/agents/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysis,
          projectPath,
          userDescription: projectDescription,
          teamSize,
        }),
      });
      if (!genRes.ok) {
        const errData = await genRes.json() as { error?: string };
        throw new Error(errData.error ?? "Generation failed");
      }
      const genData = await genRes.json() as { agents: GeneratedAgentDef[]; claudeMd?: string };
      const agents = genData.agents ?? [];

      setAiGen((prev) => ({ ...prev, status: "done", agents, claudeMd: genData.claudeMd ?? null }));
      setUseAiAgents(true);
      // Also update selectedAgents to match generated agents
      setSelectedAgents(agents.map((a) => a.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed";
      setAiGen((prev) => ({ ...prev, status: "error", error: message }));
      // Fall back to manual selection
      setUseAiAgents(false);
    }
  }, [projects, scanResult, projectDescription, teamSize]);

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
            agents: useAiAgents ? aiGen.agents.map((a) => a.id) : selectedAgents,
            workflow,
            notifications: { telegram: telegramEnabled },
            scheduler: { enabled: schedulerEnabled, intervalHours: schedulerInterval },
            projectDescription: agentSystem.projectDescription ?? "",
          }),
        });

        if (scaffoldRes.ok) {
          const result = await scaffoldRes.json() as { created: string[] };
          setScaffoldResult(result);
          agentSystem.path = `${projectPath}/ai-agents`;
        }

        // If AI-generated agents, overwrite the generic templates with AI-generated .md files
        if (useAiAgents && aiGen.agents.length > 0) {
          await fetch("/api/agents/apply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agents: aiGen.agents.filter((a) => selectedAgents.includes(a.id)),
              projectPath,
              claudeMd: aiGen.claudeMd,
            }),
          });
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
  }, [projects, agentSystem, model, permissions, selectedAgents, workflow, telegramEnabled, schedulerEnabled, schedulerInterval, onComplete, useAiAgents, aiGen.agents]);

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
          {currentStep === "Welcome" && (
            <WelcomeStep
              claudeVersion={claudeVersion}
              detectedCount={detectedProjects.length}
              detecting={detecting}
            />
          )}
          {currentStep === "Projects" && (
            <ProjectsStep
              projects={projects}
              setProjects={setProjects}
              newProjectPath={newProjectPath}
              setNewProjectPath={setNewProjectPath}
              addProject={addProject}
              removeProject={removeProject}
              toggleProd={toggleProd}
              detectedProjects={detectedProjects}
              detecting={detecting}
              detectionDone={detectionDone}
            />
          )}
          {currentStep === "Agent System" && (
            <AgentSystemStep
              agentSystem={agentSystem}
              setAgentSystem={setAgentSystem}
            />
          )}
          {currentStep === "Describe Project" && (
            <DescribeProjectStep
              projectDescription={projectDescription}
              setProjectDescription={setProjectDescription}
              teamSize={teamSize}
              setTeamSize={setTeamSize}
              scanResult={scanResult}
              scanning={scanning}
              onScan={scanProject}
            />
          )}
          {currentStep === "Agent Team" && (
            <AgentTeamStep
              selectedAgents={selectedAgents}
              toggleAgent={toggleAgent}
              setSelectedAgents={setSelectedAgents}
              aiGen={aiGen}
              useAiAgents={useAiAgents}
              setUseAiAgents={setUseAiAgents}
              triggerAiGeneration={triggerAiGeneration}
              editingAgentId={editingAgentId}
              setEditingAgentId={setEditingAgentId}
              setAiGen={setAiGen}
              projectTechStack={detectedProjects.find((d) => projects.some((p) => p.path === d.path))?.techStack ?? []}
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
              suggestions={autoSuggestions}
              suggestionsLoading={autoSuggestionsLoading}
              onToggleSuggestion={(templateId) => {
                setAutoSuggestions((prev) =>
                  prev.map((s) =>
                    s.templateId === templateId ? { ...s, enabled: !s.enabled } : s,
                  ),
                );
              }}
              projectPath={projects[0]?.path}
              onLoadSuggestions={async () => {
                if (!projects[0]?.path || autoSuggestions.length > 0) return;
                setAutoSuggestionsLoading(true);
                try {
                  const res = await fetch(
                    `/api/automation-suggestions?project=${encodeURIComponent(projects[0].path)}`,
                  );
                  if (res.ok) {
                    const data = await res.json() as {
                      suggestions: Array<{
                        template: { id: string; name: string; description: string; icon: string; defaultSchedule: string; defaultModel: "opus" | "sonnet" | "haiku" };
                        reason: string;
                        priority: "recommended" | "optional";
                      }>;
                    };
                    setAutoSuggestions(
                      data.suggestions.map((s) => ({
                        templateId: s.template.id,
                        name: s.template.name,
                        description: s.template.description,
                        icon: s.template.icon,
                        schedule: s.template.defaultSchedule,
                        model: s.template.defaultModel,
                        reason: s.reason,
                        priority: s.priority,
                        enabled: s.priority === "recommended",
                      })),
                    );
                  }
                } catch {
                  // Best effort
                } finally {
                  setAutoSuggestionsLoading(false);
                }
              }}
            />
          )}
          {currentStep === "Preferences" && (
            <PreferencesStep
              model={model}
              setModel={setModel}
              permissions={permissions}
              setPermissions={setPermissions}
              scaffoldResult={scaffoldResult}
              showCostGuide
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

function WelcomeStep({
  claudeVersion,
  detectedCount,
  detecting,
}: {
  claudeVersion: string;
  detectedCount: number;
  detecting: boolean;
}) {
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

      {/* System status badges */}
      <div className="flex flex-wrap justify-center gap-2">
        {claudeVersion && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-500/10 border border-green-500/20 rounded-full text-[10px] text-green-400">
            <Check className="w-3 h-3" />
            Claude Code {claudeVersion}
          </span>
        )}
        {detecting ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-console-accent/10 border border-console-accent/20 rounded-full text-[10px] text-console-accent">
            <Loader2 className="w-3 h-3 animate-spin" />
            Scanning for projects...
          </span>
        ) : detectedCount > 0 ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-console-accent/10 border border-console-accent/20 rounded-full text-[10px] text-console-accent">
            <FolderOpen className="w-3 h-3" />
            Found {detectedCount} project{detectedCount !== 1 ? "s" : ""} on your machine
          </span>
        ) : null}
      </div>

      <p className="text-xs text-console-dim">
        Let&apos;s set up your workspace in a few quick steps.
      </p>
    </div>
  );
}

interface DetectedProjectDisplay {
  name: string;
  path: string;
  techStack: string[];
  languages: string[];
  packageManager: string;
  devCommand?: string;
  hasAgentSystem: boolean;
  gitBranch: string;
  lastCommit: string;
  lastModified: number;
}

function ProjectsStep({
  projects,
  setProjects,
  newProjectPath,
  setNewProjectPath,
  addProject,
  removeProject,
  toggleProd,
  detectedProjects,
  detecting,
  detectionDone,
}: {
  projects: ProjectEntry[];
  setProjects: React.Dispatch<React.SetStateAction<ProjectEntry[]>>;
  newProjectPath: string;
  setNewProjectPath: (v: string) => void;
  addProject: () => void;
  removeProject: (i: number) => void;
  toggleProd: (i: number) => void;
  detectedProjects: DetectedProjectDisplay[];
  detecting: boolean;
  detectionDone: boolean;
}) {
  const [showManualInput, setShowManualInput] = useState(false);

  const isSelected = (path: string) => projects.some((p) => p.path === path);

  const toggleDetected = (dp: DetectedProjectDisplay) => {
    if (isSelected(dp.path)) {
      setProjects((prev) => prev.filter((p) => p.path !== dp.path));
    } else {
      setProjects((prev) => [
        ...prev,
        { name: dp.name, path: dp.path, isProd: false },
      ]);
    }
  };

  // Auto-select recently modified projects (last 7 days) on first load
  const [autoSelected, setAutoSelected] = useState(false);
  useEffect(() => {
    if (autoSelected || !detectionDone || detectedProjects.length === 0) return;
    if (projects.length > 0) { setAutoSelected(true); return; }
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = detectedProjects.filter((d) => d.lastModified > sevenDaysAgo);
    if (recent.length > 0) {
      setProjects(recent.map((d) => ({ name: d.name, path: d.path, isProd: false })));
    }
    setAutoSelected(true);
  }, [detectionDone, detectedProjects, projects.length, autoSelected, setProjects]);

  // Badge colors for tech stack
  const stackColor = (tech: string) => {
    if (tech.includes("React") || tech.includes("Next")) return "bg-blue-500/15 text-blue-400 border-blue-500/25";
    if (tech.includes("Vue")) return "bg-green-500/15 text-green-400 border-green-500/25";
    if (tech.includes("Python") || tech.includes("Django")) return "bg-yellow-500/15 text-yellow-400 border-yellow-500/25";
    if (tech.includes("Go")) return "bg-cyan-500/15 text-cyan-400 border-cyan-500/25";
    if (tech.includes("Rust")) return "bg-orange-500/15 text-orange-400 border-orange-500/25";
    if (tech.includes("Tailwind")) return "bg-teal-500/15 text-teal-400 border-teal-500/25";
    if (tech.includes("TypeScript")) return "bg-blue-400/15 text-blue-300 border-blue-400/25";
    return "bg-console-faint text-console-muted border-console-border";
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-console-text mb-1">
          <FolderOpen className="w-4 h-4 inline mr-1.5 -mt-0.5" />
          {detectedProjects.length > 0
            ? "We found these projects. Select the ones you want to manage:"
            : "Where are your projects?"}
        </h2>
        <p className="text-xs text-console-dim">
          {detectedProjects.length > 0
            ? "Click to select or deselect. Recently active projects are pre-selected."
            : "Add the git repositories you work with."}
        </p>
      </div>

      {/* Scanning indicator */}
      {detecting && (
        <div className="flex items-center gap-2 px-3 py-3 bg-console-accent/5 border border-console-accent/20 rounded text-xs text-console-accent">
          <Loader2 className="w-4 h-4 animate-spin" />
          Scanning your machine for projects...
        </div>
      )}

      {/* Detected projects as selectable cards */}
      {!detecting && detectedProjects.length > 0 && (
        <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
          {detectedProjects.map((dp) => (
            <button
              key={dp.path}
              onClick={() => toggleDetected(dp)}
              className={cn(
                "flex items-start gap-3 w-full px-3 py-2.5 rounded border text-left transition-all",
                isSelected(dp.path)
                  ? "bg-console-accent/10 border-console-accent/30"
                  : "bg-console-bg border-console-border hover:border-console-muted",
              )}
            >
              <div className="mt-0.5">
                {isSelected(dp.path) ? (
                  <Check className="w-4 h-4 text-console-accent" />
                ) : (
                  <FolderOpen className="w-4 h-4 text-console-dim" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-console-text">{dp.name}</span>
                  <span className="text-[9px] text-console-dim">{dp.lastCommit}</span>
                  {dp.hasAgentSystem && (
                    <span className="text-[9px] px-1.5 py-0.5 bg-purple-500/15 text-purple-400 border border-purple-500/25 rounded">
                      agents
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {[...dp.techStack, ...dp.languages].slice(0, 5).map((t) => (
                    <span key={t} className={cn("text-[9px] px-1.5 py-0.5 rounded border", stackColor(t))}>
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Selected projects (from manual add) that aren't in detected list */}
      {projects.filter((p) => !detectedProjects.some((d) => d.path === p.path)).map((p, i) => (
        <div
          key={`manual-${p.path}-${i}`}
          className="flex items-center gap-2 px-3 py-2 bg-console-accent/10 border border-console-accent/30 rounded text-xs"
        >
          <Check className="w-3.5 h-3.5 text-console-accent shrink-0" />
          <span className="flex-1 text-console-text font-mono truncate text-[10px]">{p.path}</span>
          <button
            onClick={() => toggleProd(projects.indexOf(p))}
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
            onClick={() => removeProject(projects.indexOf(p))}
            className="p-0.5 text-console-dim hover:text-console-error transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}

      {/* Manual add */}
      {(showManualInput || detectedProjects.length === 0) ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={newProjectPath}
            onChange={(e) => setNewProjectPath(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addProject(); }}
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
      ) : (
        <button
          onClick={() => setShowManualInput(true)}
          className="text-[10px] text-console-dim hover:text-console-muted transition-colors"
        >
          + Add a project not listed here
        </button>
      )}

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

      {/* Create new — info + project description */}
      {agentSystem.enabled && agentSystem.createNew && (
        <div className="pl-6 space-y-3">
          <div className="flex items-start gap-2 px-3 py-2 bg-console-accent/5 border border-console-accent/20 rounded text-[10px] text-console-muted">
            <Brain className="w-3.5 h-3.5 shrink-0 mt-0.5 text-console-accent" />
            <span>
              We&apos;ll create <code className="text-console-accent">ai-agents/</code> and{" "}
              <code className="text-console-accent">.claude/agents/</code> in your first
              project directory. Choose your agents on the next page.
            </span>
          </div>
          <div>
            <label className="block text-[10px] text-console-muted mb-1">
              What kind of project are you building? <span className="text-console-dim">(optional)</span>
            </label>
            <input
              type="text"
              value={agentSystem.projectDescription ?? ""}
              onChange={(e) =>
                setAgentSystem((prev) => ({ ...prev, projectDescription: e.target.value }))
              }
              placeholder="e.g., React app with Python backend, Go microservices, mobile app..."
              className="w-full px-3 py-2 text-xs bg-console-bg border border-console-border rounded text-console-text placeholder:text-console-dim focus:border-console-accent focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function DescribeProjectStep({
  projectDescription,
  setProjectDescription,
  teamSize,
  setTeamSize,
  scanResult,
  scanning,
  onScan,
}: {
  projectDescription: string;
  setProjectDescription: (v: string) => void;
  teamSize: number | undefined;
  setTeamSize: (v: number | undefined) => void;
  scanResult: Record<string, unknown> | null;
  scanning: boolean;
  onScan: () => Promise<void>;
}) {
  const teamSizeOptions = [
    { value: 1, label: "Solo" },
    { value: 2, label: "2-3" },
    { value: 4, label: "4-6" },
    { value: 7, label: "7+" },
  ];

  const scanData = scanResult as {
    frameworks?: string[];
    languages?: string[];
    database?: string;
    testFramework?: string;
    ciPlatform?: string;
  } | null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-console-text mb-1">
          <Sparkles className="w-4 h-4 inline mr-1.5 -mt-0.5 text-console-accent" />
          Tell us about your project
        </h2>
        <p className="text-xs text-console-dim">
          This helps us generate agents tailored to YOUR project, not generic templates.
        </p>
      </div>

      <textarea
        value={projectDescription}
        onChange={(e) => setProjectDescription(e.target.value)}
        placeholder={"Describe your project in a few sentences. For example:\n\"React Native fitness app with FastAPI backend on AWS...\"\n\nThe more detail, the better the agents."}
        rows={4}
        className="w-full px-3 py-2 text-xs bg-console-bg border border-console-border rounded text-console-text placeholder:text-console-dim focus:border-console-accent focus:outline-none resize-y"
      />

      <button
        onClick={() => void onScan()}
        disabled={scanning}
        className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-console-accent bg-console-accent/5 hover:bg-console-accent/10 border border-console-accent/20 hover:border-console-accent/40 rounded transition-all disabled:opacity-50"
      >
        {scanning ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Settings className="w-3.5 h-3.5" />
        )}
        {scanning ? "Scanning..." : "Scan project for tech stack"}
      </button>

      {scanData && (
        <div className="px-3 py-2.5 bg-console-bg border border-console-border rounded space-y-2">
          <span className="text-[10px] text-console-muted font-medium">Detected:</span>
          <div className="flex flex-wrap gap-1.5">
            {scanData.frameworks?.map((fw) => (
              <span key={fw} className="px-2 py-0.5 text-[10px] font-medium bg-console-accent/10 text-console-accent border border-console-accent/20 rounded-full">
                {fw}
              </span>
            ))}
            {scanData.languages?.map((lang) => (
              <span key={lang} className="px-2 py-0.5 text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full">
                {lang}
              </span>
            ))}
            {scanData.database && (
              <span className="px-2 py-0.5 text-[10px] font-medium bg-green-500/10 text-green-400 border border-green-500/20 rounded-full">
                {scanData.database}
              </span>
            )}
            {scanData.testFramework && (
              <span className="px-2 py-0.5 text-[10px] font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded-full">
                {scanData.testFramework}
              </span>
            )}
            {scanData.ciPlatform && (
              <span className="px-2 py-0.5 text-[10px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-full">
                {scanData.ciPlatform}
              </span>
            )}
          </div>
        </div>
      )}

      <div>
        <label className="text-[10px] text-console-muted block mb-1.5">
          <Users className="w-3 h-3 inline mr-1 -mt-0.5" />
          Team size
        </label>
        <div className="flex gap-2">
          {teamSizeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTeamSize(teamSize === opt.value ? undefined : opt.value)}
              className={cn(
                "px-3 py-1.5 text-xs rounded border transition-all",
                teamSize === opt.value
                  ? "bg-console-accent/15 text-console-accent border-console-accent/30 font-medium"
                  : "bg-console-bg text-console-muted border-console-border hover:border-console-muted",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-[9px] text-console-dim mt-1">
          {teamSize === 1
            ? "Solo dev: fewer, broader agents"
            : teamSize && teamSize >= 7
              ? "Large team: specialized agents for each domain"
              : "Affects agent count and specialization"}
        </p>
      </div>
    </div>
  );
}

function AgentTeamStep({
  selectedAgents,
  toggleAgent,
  setSelectedAgents,
  aiGen,
  useAiAgents,
  setUseAiAgents,
  triggerAiGeneration,
  editingAgentId,
  setEditingAgentId,
  setAiGen,
  projectTechStack,
}: {
  selectedAgents: string[];
  toggleAgent: (id: string) => void;
  setSelectedAgents: (agents: string[]) => void;
  aiGen: AiGenState;
  useAiAgents: boolean;
  setUseAiAgents: (v: boolean) => void;
  projectTechStack?: string[];
  triggerAiGeneration: () => Promise<void>;
  editingAgentId: string | null;
  setEditingAgentId: (id: string | null) => void;
  setAiGen: React.Dispatch<React.SetStateAction<AiGenState>>;
}) {
  // AI generation in progress
  if (aiGen.status === "analyzing" || aiGen.status === "generating") {
    return (
      <div className="flex flex-col items-center text-center pt-10 space-y-4">
        <div className="w-12 h-12 rounded-xl bg-console-accent/10 border border-console-accent/20 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-console-accent animate-spin" />
        </div>
        <div>
          <p className="text-sm font-medium text-console-text">
            {aiGen.status === "analyzing" ? "Analyzing your project..." : "Generating tailored agents..."}
          </p>
          <p className="text-[10px] text-console-dim mt-1">
            {aiGen.status === "analyzing"
              ? "Reading package.json, file structure, README..."
              : "Claude is creating agent definitions for your tech stack"}
          </p>
        </div>
      </div>
    );
  }

  // AI generation done — show generated agents
  if (useAiAgents && aiGen.status === "done" && aiGen.agents.length > 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-console-text mb-0.5">
              <Sparkles className="w-4 h-4 inline mr-1.5 -mt-0.5 text-console-accent" />
              AI-Generated Agents
            </h2>
            <p className="text-[10px] text-console-dim">
              Tailored to your project. Deselect, edit, or switch to templates.
            </p>
          </div>
          <button
            onClick={() => { setUseAiAgents(false); setEditingAgentId(null); }}
            className="px-2 py-1 text-[10px] text-console-dim hover:text-console-muted border border-console-border rounded transition-colors"
          >
            Use templates
          </button>
        </div>

        <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
          {aiGen.agents.map((agent) => (
            <div key={agent.id}>
              <label
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded border cursor-pointer transition-all",
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
                <span className="text-xs font-mono text-console-accent w-24 truncate">
                  {agent.id}
                </span>
                <span className="text-[10px] text-console-muted flex-1 truncate">
                  {agent.description}
                </span>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setEditingAgentId(editingAgentId === agent.id ? null : agent.id);
                  }}
                  className="p-1 text-console-dim hover:text-console-accent transition-colors"
                  title="Edit agent definition"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </label>
              {editingAgentId === agent.id && (
                <div className="mt-1 ml-6">
                  <textarea
                    value={agent.mdContent}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAiGen((prev) => ({
                        ...prev,
                        agents: prev.agents.map((a) =>
                          a.id === agent.id ? { ...a, mdContent: val } : a,
                        ),
                      }));
                    }}
                    rows={8}
                    className="w-full px-2 py-1.5 text-[10px] font-mono bg-console-bg border border-console-border rounded text-console-text focus:border-console-accent focus:outline-none resize-y"
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedAgents(aiGen.agents.map((a) => a.id))}
            className="px-2.5 py-1 text-[10px] text-console-muted hover:text-console-accent border border-console-border rounded transition-colors"
          >
            Select All
          </button>
          <button
            onClick={() => void triggerAiGeneration()}
            className="flex items-center gap-1 px-2.5 py-1 text-[10px] text-console-muted hover:text-console-accent border border-console-border rounded transition-colors"
          >
            <RotateCcw className="w-2.5 h-2.5" />
            Regenerate
          </button>
          <span className="text-[10px] text-console-dim ml-auto">
            {selectedAgents.length} selected
          </span>
        </div>
      </div>
    );
  }

  // Default: manual template selection (also shown on AI error/fallback)
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-console-text mb-1">
            <Users className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            Which agents do you want in your team?
          </h2>
          <p className="text-xs text-console-dim">
            Each agent gets its own definition file with rules and capabilities.
          </p>
        </div>
      </div>

      {/* AI generation prompt — show if CLI available and not yet tried */}
      {aiGen.cliAvailable && aiGen.status !== "error" && (
        <button
          onClick={() => void triggerAiGeneration()}
          className="flex items-center gap-2 w-full px-3 py-2.5 text-xs font-medium text-console-accent bg-console-accent/5 hover:bg-console-accent/10 border border-console-accent/20 hover:border-console-accent/40 rounded transition-all"
        >
          <Sparkles className="w-4 h-4" />
          <span>Generate agents tailored to your project with AI</span>
          <ChevronRight className="w-3 h-3 ml-auto" />
        </button>
      )}

      {/* AI error message */}
      {aiGen.status === "error" && (
        <div className="flex items-start gap-2 px-3 py-2 bg-yellow-500/5 border border-yellow-500/20 rounded text-[10px] text-yellow-400">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            AI generation failed: {aiGen.error}. Using generic templates instead.
          </span>
        </div>
      )}

      <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
        {AVAILABLE_AGENTS.map((agent) => {
          // Smart reason based on project tech stack
          const stack = projectTechStack ?? [];
          const hasReact = stack.some((t) => t.includes("React") || t.includes("Next") || t.includes("Vue") || t.includes("Svelte") || t.includes("Angular"));
          const hasPython = stack.some((t) => t.includes("Python") || t.includes("Django") || t.includes("Go") || t.includes("Rust") || t.includes("Java"));
          let reason = "";
          if (agent.id === "frontend" && hasReact) reason = "Your project uses " + (stack.find((t) => t.includes("React") || t.includes("Next") || t.includes("Vue")) ?? "a frontend framework");
          else if (agent.id === "backend" && hasPython) reason = "Your project has backend code";
          else if (agent.id === "orchestrator") reason = "Coordinates the whole team";
          else if (agent.id === "qa") reason = "Every project needs testing";
          else if (agent.id === "security" && stack.length > 0) reason = "Reviews code for vulnerabilities";

          return (
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
              <div className="flex-1 min-w-0">
                <span className="text-[10px] text-console-dim">{agent.desc}</span>
                {reason && (
                  <span className="text-[9px] text-console-accent ml-1.5">
                    — {reason}
                  </span>
                )}
              </div>
            </label>
          );
        })}
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

interface AutomationSuggestionItem {
  templateId: string;
  name: string;
  description: string;
  icon: string;
  schedule: string;
  model: "opus" | "sonnet" | "haiku";
  reason: string;
  priority: "recommended" | "optional";
  enabled: boolean;
}

function AutomationStep({
  telegramEnabled,
  setTelegramEnabled,
  schedulerEnabled,
  setSchedulerEnabled,
  schedulerInterval,
  setSchedulerInterval,
  suggestions,
  suggestionsLoading,
  onToggleSuggestion,
  projectPath,
  onLoadSuggestions,
}: {
  telegramEnabled: boolean;
  setTelegramEnabled: (v: boolean) => void;
  schedulerEnabled: boolean;
  setSchedulerEnabled: (v: boolean) => void;
  schedulerInterval: number;
  setSchedulerInterval: (v: number) => void;
  suggestions: AutomationSuggestionItem[];
  suggestionsLoading: boolean;
  onToggleSuggestion: (templateId: string) => void;
  projectPath?: string;
  onLoadSuggestions: () => void;
}) {
  useEffect(() => {
    if (projectPath) {
      onLoadSuggestions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath]);

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

      {/* Suggested Automations */}
      {(suggestions.length > 0 || suggestionsLoading) && (
        <div className="space-y-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-console-accent">
            Recommended automations for your project
          </h3>
          {suggestionsLoading ? (
            <div className="flex items-center gap-2 px-3 py-4 text-xs text-console-dim">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Analyzing project...
            </div>
          ) : (
            <div className="space-y-1.5">
              {suggestions.map((s) => (
                <label
                  key={s.templateId}
                  className={cn(
                    "flex items-start gap-3 px-3 py-2.5 rounded border cursor-pointer transition-all",
                    s.enabled
                      ? "bg-console-accent/10 border-console-accent/30"
                      : "bg-console-bg border-console-border hover:border-console-muted",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    onChange={() => onToggleSuggestion(s.templateId)}
                    className="accent-console-accent mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-console-text">
                        {s.name}
                      </span>
                      <span className="text-[9px] text-console-dim">{s.schedule}</span>
                      <span className="text-[9px] text-console-dim">{s.model}</span>
                    </div>
                    <p className="text-[10px] text-console-muted mt-0.5">{s.description}</p>
                    <p className="text-[10px] text-console-dim mt-0.5 italic">{s.reason}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

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
  showCostGuide,
}: {
  model: "opus" | "sonnet" | "haiku";
  setModel: (m: "opus" | "sonnet" | "haiku") => void;
  permissions: "bypass" | "default" | "plan";
  setPermissions: (p: "bypass" | "default" | "plan") => void;
  scaffoldResult: { created: string[] } | null;
  showCostGuide?: boolean;
}) {
  const modelInfo: Record<string, { cost: string; best: string }> = {
    opus: { cost: "~$15/hr active use", best: "Complex tasks, architecture" },
    sonnet: { cost: "~$3/hr active use", best: "Good balance of speed and quality" },
    haiku: { cost: "~$0.25/hr active use", best: "Simple tasks, fast iteration" },
  };

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
        {showCostGuide && (
          <div className="mt-2 px-3 py-2 bg-console-bg border border-console-border rounded">
            <p className="text-[10px] text-console-muted">
              {modelInfo[model]?.cost} &mdash; {modelInfo[model]?.best}
            </p>
          </div>
        )}
      </div>

      {/* Permissions */}
      <div>
        <label className="text-[10px] text-console-muted block mb-2">
          Default Permissions
        </label>
        <div className="flex items-center gap-2">
          {(["default", "bypass", "plan"] as const).map((p) => (
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
            ? "Skip all permission prompts (fastest, for experienced users)"
            : permissions === "plan"
              ? "Plan mode: Claude shows its plan before executing"
              : "Recommended: Claude asks before running commands"}
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
