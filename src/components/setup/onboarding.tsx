"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { BoltIcon, FolderIcon, ChevronRightIcon, SpinnerIcon, CheckIcon, PencilIcon, RefreshIcon } from "@/components/ui/icons";

// ---------- Types ----------

interface GeneratedAgent {
  id: string;
  name: string;
  description: string;
  model: "opus" | "sonnet" | "haiku";
  mdContent: string;
}

interface AutomationSuggestion {
  template: { id: string; name: string; description: string; schedule: string; model: string };
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
    opus: "bg-purple-500/15 text-purple-400",
    sonnet: "bg-blue-500/15 text-blue-400",
    haiku: "bg-emerald-500/15 text-emerald-400",
  };
  return (
    <span className={cn("px-1.5 py-0.5 rounded text-2xs font-medium", colors[model] ?? "bg-bg-elevated text-text-tertiary")}>
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

// ---------- Screen 1: The Ask ----------

interface AskScreenProps {
  onSubmit: (description: string, projectPath: string | null) => void;
  onSkip: () => void;
}

function AskScreen({ onSubmit, onSkip }: AskScreenProps) {
  const [description, setDescription] = useState("");
  const [showProject, setShowProject] = useState(false);
  const [projectPath, setProjectPath] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const placeholder = useRotatingPlaceholder();

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    if (!description.trim()) return;
    onSubmit(description.trim(), showProject && projectPath.trim() ? projectPath.trim() : null);
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
            Your AI-powered command center.<br />
            Tell me what you&apos;re working on &mdash; I&apos;ll build your perfect setup.
          </p>
        </div>

        {/* Textarea */}
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            className="w-full px-4 py-3.5 rounded-lg bg-zinc-900/80 border border-zinc-700/60 text-sm text-zinc-200 placeholder:text-transparent resize-none focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          {/* Custom animated placeholder */}
          {!description && (
            <span
              className={cn(
                "absolute top-3.5 left-4 text-sm text-zinc-600 pointer-events-none transition-opacity duration-300",
                placeholder.visible ? "opacity-100" : "opacity-0",
              )}
            >
              {placeholder.text}
            </span>
          )}
        </div>

        {/* Optional project path */}
        <div className="space-y-2">
          <button
            onClick={() => setShowProject(!showProject)}
            className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-400 transition-all"
          >
            <span className={cn(
              "w-3.5 h-3.5 rounded-full border border-zinc-600 flex items-center justify-center transition-all",
              showProject && "bg-amber-500/20 border-amber-500/50",
            )}>
              {showProject && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
            </span>
            I also have a code project
          </button>
          {showProject && (
            <div className="flex items-center gap-2 pl-5.5">
              <FolderIcon className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              <input
                type="text"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                placeholder="/path/to/project"
                className="flex-1 px-3 py-2 text-xs bg-zinc-900/80 border border-zinc-700/60 rounded-md text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 transition-all font-mono"
              />
            </div>
          )}
        </div>

        {/* CTA */}
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={handleSubmit}
            disabled={!description.trim()}
            className={cn(
              "flex items-center gap-2 px-8 py-2.5 rounded-lg text-sm font-medium transition-all",
              description.trim()
                ? "bg-amber-500 text-black hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/10 active:scale-[0.98]"
                : "bg-zinc-800 text-zinc-500 cursor-not-allowed",
            )}
          >
            Set me up
            <ChevronRightIcon className="w-4 h-4" />
          </button>
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
  onRefine: (message: string) => void;
  applying: boolean;
  refining: boolean;
}

function ResultScreen({ agents, automations, onConfirm, onRefine, applying, refining }: ResultScreenProps) {
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
        <h2 className="text-lg font-semibold text-white mb-6">Here&apos;s your setup:</h2>

        {/* Agents */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Your Agents</span>
          </div>
          <div className="space-y-1.5 rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-3">
            {agents.map((agent) => (
              <div key={agent.id} className="flex items-start gap-3 py-2 px-2 rounded-md hover:bg-zinc-800/40 transition-all">
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
              <p className="text-xs text-zinc-600 py-2 text-center">No agents generated.</p>
            )}
          </div>
        </div>

        {/* Automations */}
        {automations.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Your Automations</span>
            </div>
            <div className="space-y-1.5 rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-3">
              {automations.map((auto) => (
                <button
                  key={auto.template.id}
                  onClick={() => toggleAutomation(auto.template.id)}
                  className="flex items-center gap-3 w-full py-2 px-2 rounded-md hover:bg-zinc-800/40 transition-all text-left"
                >
                  <span className={cn(
                    "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all",
                    enabledAutomations.has(auto.template.id)
                      ? "bg-amber-500/20 border-amber-500/50"
                      : "border-zinc-600",
                  )}>
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
            disabled={applying}
            className={cn(
              "flex items-center gap-2 px-8 py-2.5 rounded-lg text-sm font-medium transition-all",
              applying
                ? "bg-zinc-700 text-zinc-400 cursor-wait"
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

          {/* Refinement input */}
          <div className="w-full max-w-md">
            <p className="text-xs text-zinc-600 text-center mb-2">Want to change something? Just tell me:</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={refinementInput}
                onChange={(e) => setRefinementInput(e.target.value)}
                placeholder="Remove the inventory one, add a social media agent..."
                className="flex-1 px-3 py-2 text-xs bg-zinc-900/80 border border-zinc-700/60 rounded-md text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 transition-all"
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
                  "px-3 py-2 rounded-md text-xs font-medium transition-all",
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

function LoadingScreen() {
  return (
    <div className="h-screen flex items-center justify-center bg-canvas">
      <div className="text-center space-y-4">
        <SpinnerIcon className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
        <div>
          <p className="text-sm text-zinc-300 font-medium">Building your setup...</p>
          <p className="text-xs text-zinc-600 mt-1">Analyzing your needs and generating agents</p>
        </div>
      </div>
    </div>
  );
}

// ---------- Main Onboarding ----------

interface OnboardingProps {
  onComplete: () => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [screen, setScreen] = useState<"ask" | "loading" | "result">("ask");
  const [agents, setAgents] = useState<GeneratedAgent[]>([]);
  const [automations, setAutomations] = useState<AutomationSuggestion[]>([]);
  const [claudeMd, setClaudeMd] = useState<string | null>(null);
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [userDescription, setUserDescription] = useState("");
  const [applying, setApplying] = useState(false);
  const [refining, setRefining] = useState(false);

  const handleSubmit = useCallback(async (description: string, path: string | null) => {
    setScreen("loading");
    setUserDescription(description);
    setProjectPath(path);

    try {
      // If a project path is given, use the preview endpoint which analyzes + generates
      if (path) {
        const res = await fetch("/api/generate-agents/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectPath: path, userDescription: description }),
        });
        if (res.ok) {
          const data = (await res.json()) as PreviewResult;
          setAgents(data.agents ?? []);
          setClaudeMd(data.claudeMd ?? null);

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
          } catch {
            // Non-critical
          }

          setScreen("result");
          return;
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
          const genData = (await genRes.json()) as { agents: GeneratedAgent[]; claudeMd?: string };
          setAgents(genData.agents ?? []);
          setClaudeMd(genData.claudeMd ?? null);
        }
      }

      setScreen("result");
    } catch {
      // If generation fails entirely, still show result (empty)
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
    } catch {
      // Best effort
    }
    onComplete();
  }, [onComplete]);

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
        const data = (await cfgRes.json()) as { config: Record<string, unknown> };
        const config = data.config;

        // Add projects and agents to config
        const updatedConfig: Record<string, unknown> = {
          ...config,
          setupComplete: true,
        };

        if (projectPath) {
          updatedConfig.projects = [
            ...((config.projects as Array<Record<string, unknown>>) ?? []),
            { name: projectPath.split("/").pop() ?? "project", path: projectPath, isProd: false },
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
    } catch {
      // Best effort
    }
    setApplying(false);
    onComplete();
  }, [agents, projectPath, claudeMd, onComplete]);

  const handleRefine = useCallback(async (message: string) => {
    setRefining(true);
    try {
      const combinedDescription = `${userDescription}\n\nUser refinement: ${message}`;

      if (projectPath) {
        const res = await fetch("/api/generate-agents/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectPath, userDescription: combinedDescription }),
        });
        if (res.ok) {
          const data = (await res.json()) as PreviewResult;
          setAgents(data.agents ?? []);
          setClaudeMd(data.claudeMd ?? null);
          setUserDescription(combinedDescription);
        }
      }
    } catch {
      // Non-critical
    }
    setRefining(false);
  }, [userDescription, projectPath]);

  if (screen === "ask") {
    return <AskScreen onSubmit={handleSubmit} onSkip={handleSkip} />;
  }

  if (screen === "loading") {
    return <LoadingScreen />;
  }

  return (
    <ResultScreen
      agents={agents}
      automations={automations}
      onConfirm={handleConfirm}
      onRefine={handleRefine}
      applying={applying}
      refining={refining}
    />
  );
}
