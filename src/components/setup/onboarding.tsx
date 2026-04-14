"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  BoltIcon,
  FolderIcon,
  ChevronRightIcon,
  SpinnerIcon,
  CheckIcon,
  PencilIcon,
  RefreshIcon,
} from "@/components/ui/icons";

// ---------- Types ----------

interface GeneratedAgent {
  id: string;
  name: string;
  description: string;
  model: "opus" | "sonnet" | "haiku";
  mdContent: string;
}

interface AutomationSuggestion {
  template: {
    id: string;
    name: string;
    description: string;
    schedule: string;
    model: string;
  };
  reason: string;
  customizedPrompt: string;
  priority: "recommended" | "optional";
}

interface PreviewResult {
  agents: GeneratedAgent[];
  claudeMd?: string;
  profile?: Record<string, unknown>;
}

// ---------- Rotating placeholder ----------

const PLACEHOLDERS = [
  "I'm building a React app with a Python backend...",
  "I manage a team of 5 and need help with project tracking...",
  "I'm a data analyst working with SQL and Python scripts...",
  "I'm building an e-commerce store with Next.js and Stripe...",
];

function useRotatingPlaceholder(interval = 4000) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % PLACEHOLDERS.length);
        setVisible(true);
      }, 300);
    }, interval);
    return () => clearInterval(timer);
  }, [interval]);

  return { text: PLACEHOLDERS[index], visible };
}

// ---------- Model badge ----------

function ModelBadge({ model }: { model: string }) {
  const colors: Record<string, string> = {
    opus: "bg-[#f59e0b]/10 text-[#f59e0b]",
    sonnet: "bg-[#f59e0b]/10 text-[#f59e0b]",
    haiku: "bg-[#f59e0b]/10 text-[#f59e0b]",
  };
  return (
    <span
      className={cn(
        "px-1.5 py-0.5 rounded text-2xs font-medium",
        colors[model] ?? "bg-bg-elevated text-text-tertiary",
      )}
    >
      {model}
    </span>
  );
}

// ---------- Agent icon ----------

function agentIcon(name: string): string {
  const map: Record<string, string> = {
    orchestrator: "\u{1F3AF}",
    frontend: "\u{1F5A5}\uFE0F",
    backend: "\u{1F5C4}\uFE0F",
    qa: "\u{1F50D}",
    security: "\u{1F6E1}\uFE0F",
    pmo: "\u{1F4CB}",
    documentation: "\u{1F4DD}",
    copywriter: "\u270D\uFE0F",
    "customer-support": "\u{1F4AC}",
    "inventory-tracker": "\u{1F4CA}",
    analyst: "\u{1F4CA}",
    designer: "\u{1F3A8}",
    devops: "\u{1F680}",
  };
  return map[name.toLowerCase()] ?? "\u{1F916}";
}

// ---------- Detected project for Quick Import ----------

interface DetectedProject {
  name: string;
  path: string;
  techStack: string[];
  languages: string[];
  packageManager: string;
  hasAgentSystem: boolean;
}

// ---------- Screen 1: The Ask (Quick Import first) ----------

interface AskScreenProps {
  onSubmit: (description: string, projectPath: string | null) => void;
  onSkip: () => void;
  initialDescription?: string;
}

function AskScreen({ onSubmit, onSkip, initialDescription = "" }: AskScreenProps) {
  const [description, setDescription] = useState(initialDescription);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [projectPath, setProjectPath] = useState("");
  const [projects, setProjects] = useState<DetectedProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [importingPath, setImportingPath] = useState<string | null>(null);
  const [importedPath, setImportedPath] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const placeholder = useRotatingPlaceholder();

  // Detect projects on mount
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/system/detect", { method: "POST" });
        if (res.ok) {
          const data = (await res.json()) as { projects: DetectedProject[] };
          const unimported = (data.projects ?? []).filter((p) => !p.hasAgentSystem);
          // Deduplicate by name
          const seen = new Set<string>();
          const deduped = unimported.filter((p) => {
            const key = p.name.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          setProjects(deduped.slice(0, 6));
        }
      } catch {
        // Detection unavailable — show manual path
      } finally {
        setLoadingProjects(false);
      }
    })();
  }, []);

  const handleQuickImport = async (project: DetectedProject) => {
    if (importingPath) return;
    setImportingPath(project.path);
    try {
      const res = await fetch("/api/quick-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectPath: project.path }),
      });
      if (res.ok) {
        setImportedPath(project.path);
        // Mark setup complete and finish
        try {
          const cfgRes = await fetch("/api/config");
          if (cfgRes.ok) {
            const data = (await cfgRes.json()) as { config: Record<string, unknown> };
            await fetch("/api/config", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...data.config,
                setupComplete: true,
                defaults: {
                  ...((data.config.defaults as Record<string, unknown>) ?? {}),
                  workingDirectory: project.path,
                },
              }),
            });
          }
        } catch {
          // Config save failed — still finish
        }
        // Brief delay to show success, then complete
        setTimeout(() => onSkip(), 1200);
      }
    } catch {
      // Import failed
    } finally {
      setImportingPath(null);
    }
  };

  const handleSubmit = () => {
    if (!description.trim()) return;
    onSubmit(description.trim(), projectPath.trim() || null);
  };

  return (
    <div className="h-screen flex items-center justify-center bg-canvas">
      <div className="w-full max-w-xl px-6 space-y-8">
        {/* Brand */}
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2">
            <BoltIcon className="w-6 h-6 text-amber-400" />
            <h1 className="text-2xl font-semibold text-white tracking-tight">Agent Studio</h1>
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed max-w-md mx-auto">
            Your AI-powered command center.
            <br />
            Import a project to get started in seconds.
          </p>
        </div>

        {/* Quick Import — detected projects */}
        {!loadingProjects && projects.length > 0 && (
          <div className="space-y-2">
            <span className="block text-xs font-medium text-zinc-500 uppercase tracking-wider">
              Detected Projects
            </span>
            <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
              {projects.map((project) => {
                const isImporting = importingPath === project.path;
                const isImported = importedPath === project.path;
                return (
                  <button
                    key={project.path}
                    onClick={() => void handleQuickImport(project)}
                    disabled={!!importingPath || isImported}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded border text-left transition-all",
                      isImported
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : "border-zinc-700/60 bg-zinc-900/50 hover:border-amber-500/40 hover:bg-zinc-900/80",
                      importingPath && !isImporting && "opacity-50",
                    )}
                  >
                    <FolderIcon className="w-4 h-4 text-zinc-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-zinc-200 block truncate">
                        {project.name}
                      </span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {project.techStack.slice(0, 3).map((tech) => (
                          <span
                            key={tech}
                            className="text-2xs px-1 py-0.5 rounded bg-zinc-800 text-zinc-500 border border-zinc-700/50"
                          >
                            {tech}
                          </span>
                        ))}
                        {project.languages.slice(0, 1).map((lang) => (
                          <span key={lang} className="text-2xs text-zinc-600">
                            {lang}
                          </span>
                        ))}
                      </div>
                    </div>
                    {isImported ? (
                      <CheckIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : isImporting ? (
                      <SpinnerIcon className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
                    ) : (
                      <ChevronRightIcon className="w-4 h-4 text-zinc-600 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Manual path input when no projects detected */}
        {!loadingProjects && projects.length === 0 && (
          <div className="space-y-2">
            <span className="block text-xs font-medium text-zinc-500">
              No projects detected. Enter a project folder:
            </span>
            <div className="flex items-center gap-2">
              <FolderIcon className="w-4 h-4 text-zinc-500 shrink-0" />
              <input
                type="text"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                placeholder="/path/to/your/project"
                className="flex-1 px-3 py-2.5 text-sm bg-zinc-900/80 border border-zinc-700/60 rounded text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 transition-all font-mono"
              />
            </div>
            {projectPath.trim() && (
              <button
                onClick={() => onSubmit("Import project", projectPath.trim())}
                className="flex items-center gap-2 px-6 py-2 rounded text-sm font-medium bg-amber-500 text-black hover:bg-amber-400 transition-all active:scale-[0.98]"
              >
                Import Project
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Loading state */}
        {loadingProjects && (
          <div className="flex items-center justify-center gap-2 py-8">
            <SpinnerIcon className="w-4 h-4 text-amber-400 animate-spin" />
            <span className="text-sm text-zinc-500">Scanning for projects...</span>
          </div>
        )}

        {/* Advanced Setup (secondary) */}
        <div className="flex flex-col items-center gap-3 pt-2">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-zinc-600 hover:text-zinc-400 transition-all"
          >
            {showAdvanced ? "Hide advanced setup" : "Advanced Setup \u2014 describe your workflow"}
          </button>

          {showAdvanced && (
            <div className="w-full space-y-3">
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-3 rounded bg-zinc-900/80 border border-zinc-700/60 text-sm text-zinc-200 placeholder:text-transparent resize-none focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                />
                {!description && (
                  <span
                    className={cn(
                      "absolute top-3 left-4 text-sm text-zinc-600 pointer-events-none transition-opacity duration-300",
                      placeholder.visible ? "opacity-100" : "opacity-0",
                    )}
                  >
                    {placeholder.text}
                  </span>
                )}
              </div>
              <button
                onClick={handleSubmit}
                disabled={!description.trim()}
                className={cn(
                  "flex items-center gap-2 px-6 py-2 rounded text-sm font-medium transition-all",
                  description.trim()
                    ? "bg-amber-500 text-black hover:bg-amber-400 active:scale-[0.98]"
                    : "bg-zinc-800 text-zinc-500 cursor-not-allowed",
                )}
              >
                Set me up
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
          )}

          <button
            onClick={onSkip}
            className="text-xs text-zinc-600 hover:text-zinc-400 transition-all"
          >
            Skip setup &mdash; just give me a terminal
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Screen 2: The Result ----------

interface ResultScreenProps {
  agents: GeneratedAgent[];
  automations: AutomationSuggestion[];
  onConfirm: () => void;
  onSkip: () => void;
  onBack: () => void;
  onRefine: (message: string) => void;
  applying: boolean;
  refining: boolean;
  errorMessage?: string | null;
}

function ResultScreen({
  agents,
  automations,
  onConfirm,
  onSkip,
  onBack,
  onRefine,
  applying,
  refining,
  errorMessage,
}: ResultScreenProps) {
  const [enabledAutomations, setEnabledAutomations] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    automations.forEach((a) => {
      if (a.priority === "recommended") initial.add(a.template.id);
    });
    return initial;
  });
  const [refinementInput, setRefinementInput] = useState("");

  const toggleAutomation = (id: string) => {
    setEnabledAutomations((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRefine = () => {
    if (!refinementInput.trim() || refining) return;
    onRefine(refinementInput.trim());
    setRefinementInput("");
  };

  return (
    <div className="h-screen flex items-center justify-center bg-canvas">
      <div className="w-full max-w-2xl px-6 py-8 max-h-screen overflow-y-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={onBack}
            className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-all"
            title="Back to description"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M10 3L5 8l5 5" />
            </svg>
          </button>
          <h2 className="text-lg font-semibold text-white">Here&apos;s your setup:</h2>
        </div>

        {/* Agents */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Your Agents
            </span>
          </div>
          <div className="space-y-1.5 rounded border border-zinc-800/80 bg-zinc-900/40 p-3">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="flex items-start gap-3 py-2 px-2 rounded hover:bg-zinc-800/40 transition-all"
              >
                <span className="text-base mt-0.5">{agentIcon(agent.name)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-200">{agent.name}</span>
                    <ModelBadge model={agent.model} />
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">{agent.description}</p>
                </div>
              </div>
            ))}
            {agents.length === 0 && (
              <div className="py-3 text-center space-y-2">
                <p className="text-xs text-zinc-500">
                  {errorMessage ?? "Could not analyze project."}
                </p>
                <p className="text-xs text-zinc-600">
                  You can create agents manually from Settings &gt; Agents.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Automations */}
        {automations.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                Your Automations
              </span>
            </div>
            <div className="space-y-1.5 rounded border border-zinc-800/80 bg-zinc-900/40 p-3">
              {automations.map((auto) => (
                <button
                  key={auto.template.id}
                  onClick={() => toggleAutomation(auto.template.id)}
                  className="flex items-center gap-3 w-full py-2 px-2 rounded hover:bg-zinc-800/40 transition-all text-left"
                >
                  <span
                    className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all",
                      enabledAutomations.has(auto.template.id)
                        ? "bg-amber-500/20 border-amber-500/50"
                        : "border-zinc-600",
                    )}
                  >
                    {enabledAutomations.has(auto.template.id) && (
                      <CheckIcon className="w-2.5 h-2.5 text-amber-400" />
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-zinc-300">{auto.template.name}</span>
                  </div>
                  <span className="text-xs text-zinc-600 shrink-0">{auto.template.schedule}</span>
                  <ModelBadge model={auto.template.model} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Confirm */}
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={onConfirm}
            disabled={applying || agents.length === 0}
            className={cn(
              "flex items-center gap-2 px-8 py-2.5 rounded text-sm font-medium transition-all",
              applying
                ? "bg-zinc-700 text-zinc-400 cursor-wait"
                : agents.length === 0
                  ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                  : "bg-amber-500 text-black hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/10 active:scale-[0.98]",
            )}
          >
            {applying ? (
              <>
                <SpinnerIcon className="w-4 h-4 animate-spin" />
                Applying...
              </>
            ) : (
              <>
                Looks good &mdash; let&apos;s go
                <ChevronRightIcon className="w-4 h-4" />
              </>
            )}
          </button>

          {agents.length === 0 && (
            <button
              onClick={onSkip}
              className="text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-2 transition-all"
            >
              Skip &mdash; I&apos;ll create agents myself
            </button>
          )}

          {/* Refinement input */}
          <div className="w-full max-w-md">
            <p className="text-xs text-zinc-600 text-center mb-2">
              Want to change something? Just tell me:
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={refinementInput}
                onChange={(e) => setRefinementInput(e.target.value)}
                placeholder="Remove the inventory one, add a social media agent..."
                className="flex-1 px-3 py-2 text-xs bg-zinc-900/80 border border-zinc-700/60 rounded text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 transition-all"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleRefine();
                  }
                }}
              />
              <button
                onClick={handleRefine}
                disabled={!refinementInput.trim() || refining}
                className={cn(
                  "px-3 py-2 rounded text-xs font-medium transition-all",
                  refinementInput.trim() && !refining
                    ? "bg-zinc-700 text-zinc-200 hover:bg-zinc-600"
                    : "bg-zinc-800 text-zinc-600 cursor-not-allowed",
                )}
              >
                {refining ? <SpinnerIcon className="w-3 h-3 animate-spin" /> : "Update"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Loading screen ----------

function LoadingScreen({ onSkip, step }: { onSkip?: () => void; step?: number }) {
  const steps = [
    { label: "Analyzing project structure...", done: (step ?? 0) > 1 },
    { label: "Generating agents...", done: (step ?? 0) > 2 },
    { label: "Creating configuration...", done: (step ?? 0) > 3 },
  ];
  const currentStep = Math.min(step ?? 1, 3);

  return (
    <div className="h-screen flex items-center justify-center bg-canvas">
      <div className="text-center space-y-4">
        <SpinnerIcon className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
        <div>
          <p className="text-sm text-zinc-300 font-medium">Building your setup...</p>
          <p className="text-xs text-zinc-500 mt-1">Step {currentStep}/3</p>
        </div>
        <div className="text-left inline-block space-y-1.5">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              {s.done ? (
                <span className="text-green-400">✓</span>
              ) : i + 1 === currentStep ? (
                <SpinnerIcon className="w-3 h-3 text-amber-400 animate-spin" />
              ) : (
                <span className="text-zinc-700">○</span>
              )}
              <span
                className={
                  s.done
                    ? "text-zinc-500"
                    : i + 1 === currentStep
                      ? "text-zinc-300"
                      : "text-zinc-700"
                }
              >
                {s.label}
              </span>
            </div>
          ))}
        </div>
        {onSkip && (
          <button
            onClick={onSkip}
            className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-700 hover:border-zinc-500 rounded transition-all"
          >
            Skip — I'll create agents myself
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- Main Onboarding ----------

interface OnboardingProps {
  onComplete: () => void;
  onDismiss?: () => void;
}

export function Onboarding({ onComplete, onDismiss }: OnboardingProps) {
  const [screen, setScreen] = useState<"ask" | "loading" | "result">("ask");
  const [loadingStep, setLoadingStep] = useState(1);
  const [agents, setAgents] = useState<GeneratedAgent[]>([]);
  const [automations, setAutomations] = useState<AutomationSuggestion[]>([]);
  const [claudeMd, setClaudeMd] = useState<string | null>(null);
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [userDescription, setUserDescription] = useState("");
  const [applying, setApplying] = useState(false);
  const [refining, setRefining] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = useCallback(async (description: string, path: string | null) => {
    setScreen("loading");
    setLoadingStep(1);
    setUserDescription(description);
    setProjectPath(path);
    setErrorMessage(null);

    try {
      // Check if Claude CLI is available before trying to generate
      const cliRes = await fetch("/api/agents/cli-status");
      const cliAvailable = cliRes.ok && ((await cliRes.json()) as { available: boolean }).available;

      if (!cliAvailable) {
        setErrorMessage(
          "Claude Code CLI not found. Install Claude Code first (https://claude.ai/code) or create agents manually from Settings > Agents.",
        );
        setScreen("result");
        return;
      }

      // If a project path is given, use the preview endpoint which analyzes + generates
      setLoadingStep(2);
      if (path) {
        const res = await fetch("/api/generate-agents/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectPath: path,
            userDescription: description,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as PreviewResult;
          setAgents(data.agents ?? []);
          setClaudeMd(data.claudeMd ?? null);

          setLoadingStep(3);
          // Also fetch automation suggestions
          try {
            const autoRes = await fetch("/api/automations/suggest", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ projectPath: path }),
            });
            if (autoRes.ok) {
              const autoData = (await autoRes.json()) as AutomationSuggestion[];
              setAutomations(autoData);
            }
          } catch (e) {
            console.error("Failed to fetch automation suggestions:", e);
          }

          setScreen("result");
          return;
        }

        // Preview failed — extract error message
        try {
          const errData = (await res.json()) as { error?: string };
          if (errData.error) {
            setErrorMessage(errData.error);
          }
        } catch {
          // Ignore parse errors
        }
      }

      // No project path or preview failed — use generate with a generic analysis
      const analyzeRes = await fetch("/api/analyze-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: path ?? "." }),
      });
      let profile = null;
      if (analyzeRes.ok) {
        profile = await analyzeRes.json();
      }

      setLoadingStep(2);
      if (profile) {
        const genRes = await fetch("/api/agents/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            analysis: profile,
            projectPath: path ?? ".",
            userDescription: description,
          }),
        });
        if (genRes.ok) {
          const genData = (await genRes.json()) as {
            agents: GeneratedAgent[];
            claudeMd?: string;
          };
          setAgents(genData.agents ?? []);
          setClaudeMd(genData.claudeMd ?? null);
        } else {
          try {
            const errData = (await genRes.json()) as { error?: string };
            if (errData.error) {
              setErrorMessage(errData.error);
            }
          } catch {
            // Ignore parse errors
          }
        }
      }

      setScreen("result");
    } catch (e) {
      console.error("Failed to generate agent setup:", e);
      setErrorMessage("Failed to generate agent setup. Check that the server is running.");
      setScreen("result");
    }
  }, []);

  const handleSkip = useCallback(async () => {
    try {
      const res = await fetch("/api/config");
      if (res.ok) {
        const data = (await res.json()) as { config: Record<string, unknown> };
        const config = data.config;
        await fetch("/api/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...config, setupComplete: true }),
        });
      }
    } catch (e) {
      console.error("Failed to mark setup as complete on skip:", e);
    }
    onComplete();
  }, [onComplete]);

  // Escape key dismisses the wizard at any point
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        void handleSkip();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSkip]);

  const handleConfirm = useCallback(async () => {
    setApplying(true);
    try {
      // Apply agents if we have a project path and agents
      if (agents.length > 0 && projectPath) {
        await fetch("/api/agents/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agents,
            projectPath,
            claudeMd,
          }),
        });
      }

      // Mark setup as complete
      const cfgRes = await fetch("/api/config");
      if (cfgRes.ok) {
        const data = (await cfgRes.json()) as {
          config: Record<string, unknown>;
        };
        const config = data.config;

        // Add projects and agents to config
        const updatedConfig: Record<string, unknown> = {
          ...config,
          setupComplete: true,
        };

        if (projectPath) {
          updatedConfig.projects = [
            ...((config.projects as Array<Record<string, unknown>>) ?? []),
            {
              name: projectPath.split("/").pop() ?? "project",
              path: projectPath,
              isProd: false,
            },
          ];
          updatedConfig.defaults = {
            ...((config.defaults as Record<string, unknown>) ?? {}),
            workingDirectory: projectPath,
          };
        }

        if (agents.length > 0) {
          updatedConfig.agents = agents.map((a) => ({
            id: a.id,
            name: a.name,
            description: a.description,
            model: a.model,
          }));
        }

        await fetch("/api/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatedConfig),
        });
      }
    } catch (e) {
      console.error("Failed to apply onboarding configuration:", e);
    }
    setApplying(false);
    onComplete();
  }, [agents, projectPath, claudeMd, onComplete]);

  const handleRefine = useCallback(
    async (message: string) => {
      setRefining(true);
      try {
        const combinedDescription = `${userDescription}\n\nUser refinement: ${message}`;

        if (projectPath) {
          const res = await fetch("/api/generate-agents/preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectPath,
              userDescription: combinedDescription,
            }),
          });
          if (res.ok) {
            const data = (await res.json()) as PreviewResult;
            setAgents(data.agents ?? []);
            setClaudeMd(data.claudeMd ?? null);
            setUserDescription(combinedDescription);
          }
        }
      } catch (e) {
        console.error("Failed to refine agent setup:", e);
      }
      setRefining(false);
    },
    [userDescription, projectPath],
  );

  const dismissButton = (
    <button
      onClick={() => void handleSkip()}
      className="fixed top-4 right-4 z-50 w-8 h-8 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-all"
      title="Close setup (Esc)"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        <path d="M4 4l8 8M12 4l-8 8" />
      </svg>
    </button>
  );

  if (screen === "ask") {
    return (
      <>
        {dismissButton}
        <AskScreen
          onSubmit={handleSubmit}
          onSkip={handleSkip}
          initialDescription={userDescription}
        />
      </>
    );
  }

  if (screen === "loading") {
    return (
      <>
        {dismissButton}
        <LoadingScreen onSkip={() => setScreen("result")} step={loadingStep} />
      </>
    );
  }

  return (
    <>
      {dismissButton}
      <ResultScreen
        agents={agents}
        automations={automations}
        onConfirm={handleConfirm}
        onSkip={handleSkip}
        onBack={() => setScreen("ask")}
        onRefine={handleRefine}
        applying={applying}
        refining={refining}
        errorMessage={errorMessage}
      />
    </>
  );
}
