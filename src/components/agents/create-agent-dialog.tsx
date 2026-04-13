"use client";

import { useState, useCallback, useEffect } from "react";
import { CloseIcon, CheckIcon, UserIcon, EditIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectPath?: string;
  onCreated?: () => void;
}

type Step = "describe" | "configure" | "preview" | "done";

const COMMON_TOOLS = [
  { id: "Bash", label: "Bash", desc: "Run shell commands" },
  { id: "Read", label: "Read", desc: "Read files" },
  { id: "Write", label: "Write", desc: "Create files" },
  { id: "Edit", label: "Edit", desc: "Edit files" },
  { id: "Glob", label: "Glob", desc: "Find files by pattern" },
  { id: "Grep", label: "Grep", desc: "Search file contents" },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function generateAgentMd(opts: {
  name: string;
  slug: string;
  description: string;
  tools: string[];
  rules: string[];
  body: string;
}): string {
  const toolsYaml = opts.tools.map((t) => `  - ${t}`).join("\n");
  const rulesSection =
    opts.rules.length > 0
      ? opts.rules.map((r, i) => `${i + 1}. ${r}`).join("\n")
      : "1. Follow project conventions\n2. Write clean, tested code\n3. Report completion to the orchestrator";

  return `---
name: ${opts.slug}
description: ${opts.description}
tools:
${toolsYaml}
---

# ${opts.name}

${opts.body || `You are the ${opts.slug} agent. Your role: ${opts.description}`}

## Quick Reference
${rulesSection}

## Memory
Read \`ai-agents/tools/memory_index.json\` before any task.
`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateAgentDialog({
  open,
  onOpenChange,
  projectPath,
  onCreated,
}: CreateAgentDialogProps) {
  const [step, setStep] = useState<Step>("describe");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Describe
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // Step 2: Configure
  const [selectedTools, setSelectedTools] = useState<Set<string>>(
    new Set(["Bash", "Read", "Write", "Edit", "Glob", "Grep"]),
  );
  const [rules, setRules] = useState<string[]>([""]);

  // Step 3: Preview
  const [markdown, setMarkdown] = useState("");

  // AI generation
  const [generating, setGenerating] = useState(false);
  const [cliAvailable, setCliAvailable] = useState<boolean | null>(null);

  // Result
  const [createdFiles, setCreatedFiles] = useState<string[]>([]);

  const slug = slugify(name);

  const reset = useCallback(() => {
    setStep("describe");
    setName("");
    setDescription("");
    setSelectedTools(new Set(["Bash", "Read", "Write", "Edit", "Glob", "Grep"]));
    setRules([""]);
    setMarkdown("");
    setError(null);
    setSaving(false);
    setGenerating(false);
    setCreatedFiles([]);
  }, []);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const res = await fetch("/api/agents/cli-status");
        if (res.ok) {
          const data = (await res.json()) as { available: boolean };
          setCliAvailable(data.available);
        }
      } catch {
        setCliAvailable(false);
      }
    })();
  }, [open]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    // Delay reset so close animation can play
    setTimeout(reset, 200);
  }, [onOpenChange, reset]);

  const handleToggleTool = useCallback((toolId: string) => {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) next.delete(toolId);
      else next.add(toolId);
      return next;
    });
  }, []);

  const handleAddRule = useCallback(() => {
    setRules((prev) => [...prev, ""]);
  }, []);

  const handleRuleChange = useCallback((index: number, value: string) => {
    setRules((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const handleRemoveRule = useCallback((index: number) => {
    setRules((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const goToPreview = useCallback(async () => {
    // Try smart generation if CLI is available
    if (cliAvailable) {
      setGenerating(true);
      setStep("preview");
      try {
        const res = await fetch("/api/agents/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectPath: projectPath || ".",
            userDescription: `Create a single agent named "${name}" (id: ${slug}). Role: ${description}. Tools: ${Array.from(selectedTools).join(", ")}. Rules: ${rules.filter((r) => r.trim()).join("; ")}. Generate ONLY this one agent, not a full team.`,
            teamSize: 1,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as { agents: Array<{ mdContent: string; id: string }> };
          // Find the agent matching our slug, or use the first one
          const match = data.agents?.find((a) => a.id === slug) ?? data.agents?.[0];
          if (match?.mdContent) {
            setMarkdown(match.mdContent);
            setGenerating(false);
            return;
          }
        }
      } catch {
        // Fall through to dumb template
      }
      setGenerating(false);
    }

    // Fallback: dumb template
    const md = generateAgentMd({
      name,
      slug,
      description,
      tools: Array.from(selectedTools),
      rules: rules.filter((r) => r.trim()),
      body: "",
    });
    setMarkdown(md);
    if (step !== "preview") setStep("preview");
  }, [name, slug, description, selectedTools, rules, cliAvailable, projectPath, step]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/agents/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: slug,
          name,
          description,
          mdContent: markdown,
          projectPath: projectPath || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || `Failed to create agent (${res.status})`);
      }
      const data = (await res.json()) as { created: string[] };
      setCreatedFiles(data.created ?? []);
      setStep("done");
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }, [slug, name, description, markdown, projectPath, onCreated]);

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
            <UserIcon size={14} className="text-accent" />
            <h2 className="text-xs font-medium text-text-primary">Create Agent</h2>
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
          {step === "describe" && (
            <StepDescribe
              name={name}
              description={description}
              onNameChange={setName}
              onDescriptionChange={setDescription}
              slug={slug}
            />
          )}

          {step === "configure" && (
            <StepConfigure
              selectedTools={selectedTools}
              onToggleTool={handleToggleTool}
              rules={rules}
              onRuleChange={handleRuleChange}
              onAddRule={handleAddRule}
              onRemoveRule={handleRemoveRule}
            />
          )}

          {step === "preview" && (
            <StepPreview
              markdown={markdown}
              onMarkdownChange={setMarkdown}
              error={error}
              generating={generating}
            />
          )}

          {step === "done" && <StepDone name={name} createdFiles={createdFiles} />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border-default">
          <div>
            {step !== "describe" && step !== "done" && (
              <button
                onClick={() => setStep(step === "preview" ? "configure" : "describe")}
                className="text-xs text-text-secondary hover:text-text-primary transition-all"
              >
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step === "describe" && (
              <button
                onClick={() => setStep("configure")}
                disabled={!name.trim() || !description.trim()}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-[4px] transition-all",
                  name.trim() && description.trim()
                    ? "bg-text-primary text-bg-base hover:bg-text-secondary"
                    : "bg-bg-elevated text-text-ghost cursor-not-allowed",
                )}
              >
                Next
              </button>
            )}
            {step === "configure" && (
              <div className="flex items-center gap-2">
                {cliAvailable && <span className="text-2xs text-accent">✦ AI-enhanced</span>}
                {cliAvailable === false && (
                  <span className="text-2xs text-text-ghost">Basic template</span>
                )}
                <button
                  onClick={() => void goToPreview()}
                  className="px-3 py-1.5 text-xs font-medium rounded-[4px] bg-text-primary text-bg-base hover:bg-text-secondary transition-all"
                >
                  {cliAvailable ? "Generate with AI" : "Preview"}
                </button>
              </div>
            )}
            {step === "preview" && (
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-[4px] transition-all",
                  saving
                    ? "bg-bg-elevated text-text-ghost cursor-not-allowed"
                    : "bg-accent text-bg-base hover:bg-accent/90",
                )}
              >
                {saving ? "Saving..." : "Create Agent"}
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
    { id: "describe", label: "Describe" },
    { id: "configure", label: "Configure" },
    { id: "preview", label: "Preview" },
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
                ? "text-accent"
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
// Step 1: Describe
// ---------------------------------------------------------------------------

function StepDescribe({
  name,
  description,
  onNameChange,
  onDescriptionChange,
  slug,
}: {
  name: string;
  description: string;
  onNameChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  slug: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-text-secondary leading-relaxed">
          Define a new agent for your project. Agents are markdown files in{" "}
          <code className="text-text-primary bg-bg-elevated px-1 py-0.5 rounded text-label">
            .claude/agents/
          </code>{" "}
          that give Claude a specific role, tools, and rules.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-label font-medium text-text-secondary uppercase tracking-wider">
          Agent Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. Database Migration Agent"
          className="w-full px-3 py-2 text-xs bg-bg-input border border-border-default rounded-[4px] text-text-primary placeholder:text-text-ghost focus:outline-none focus:border-accent transition-all"
          autoFocus
        />
        {slug && <p className="text-2xs text-text-ghost">File: .claude/agents/{slug}.md</p>}
      </div>

      <div className="space-y-1.5">
        <label className="text-label font-medium text-text-secondary uppercase tracking-wider">
          What should this agent do?
        </label>
        <textarea
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Describe the agent's role and responsibilities. Be specific about what it should focus on, what it should never do, and how it relates to other agents."
          rows={4}
          className="w-full px-3 py-2 text-xs bg-bg-input border border-border-default rounded-[4px] text-text-primary placeholder:text-text-ghost focus:outline-none focus:border-accent transition-all resize-none"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Configure
// ---------------------------------------------------------------------------

function StepConfigure({
  selectedTools,
  onToggleTool,
  rules,
  onRuleChange,
  onAddRule,
  onRemoveRule,
}: {
  selectedTools: Set<string>;
  onToggleTool: (id: string) => void;
  rules: string[];
  onRuleChange: (i: number, v: string) => void;
  onAddRule: () => void;
  onRemoveRule: (i: number) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Tools */}
      <div className="space-y-2">
        <label className="text-label font-medium text-text-secondary uppercase tracking-wider">
          Tools
        </label>
        <p className="text-2xs text-text-tertiary">Which tools should this agent have access to?</p>
        <div className="grid grid-cols-3 gap-1.5">
          {COMMON_TOOLS.map((tool) => (
            <button
              key={tool.id}
              onClick={() => onToggleTool(tool.id)}
              className={cn(
                "flex flex-col items-start px-2.5 py-2 rounded-[4px] text-left transition-all border",
                selectedTools.has(tool.id)
                  ? "bg-accent/10 border-accent/30 text-text-primary"
                  : "bg-bg-input border-border-default text-text-tertiary hover:border-border-subtle",
              )}
            >
              <span className="text-xs font-medium font-mono">{tool.label}</span>
              <span className="text-2xs text-text-ghost mt-0.5">{tool.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Rules */}
      <div className="space-y-2">
        <label className="text-label font-medium text-text-secondary uppercase tracking-wider">
          Rules
        </label>
        <p className="text-2xs text-text-tertiary">
          Key constraints and guidelines for this agent.
        </p>
        <div className="space-y-1.5">
          {rules.map((rule, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="text-2xs text-text-ghost w-4 text-right shrink-0">{i + 1}.</span>
              <input
                type="text"
                value={rule}
                onChange={(e) => onRuleChange(i, e.target.value)}
                placeholder="e.g. Never modify production directly"
                className="flex-1 px-2 py-1.5 text-xs bg-bg-input border border-border-default rounded-[4px] text-text-primary placeholder:text-text-ghost focus:outline-none focus:border-accent transition-all"
              />
              {rules.length > 1 && (
                <button
                  onClick={() => onRemoveRule(i)}
                  className="p-1 text-text-ghost hover:text-error transition-all"
                >
                  <CloseIcon size={10} />
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={onAddRule}
          className="text-2xs text-accent hover:text-accent/80 transition-all"
        >
          + Add rule
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Preview
// ---------------------------------------------------------------------------

function StepPreview({
  markdown,
  onMarkdownChange,
  error,
  generating,
}: {
  markdown: string;
  onMarkdownChange: (v: string) => void;
  error: string | null;
  generating?: boolean;
}) {
  if (generating) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        <p className="text-xs text-text-secondary">Generating agent with Claude Code...</p>
        <p className="text-2xs text-text-ghost">This may take up to 30 seconds</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-label font-medium text-text-secondary uppercase tracking-wider">
          Agent Definition
        </label>
        <div className="flex items-center gap-1 text-2xs text-text-ghost">
          <EditIcon size={10} />
          Editable
        </div>
      </div>
      <textarea
        value={markdown}
        onChange={(e) => onMarkdownChange(e.target.value)}
        rows={16}
        className="w-full px-3 py-2 text-xs font-mono bg-bg-input border border-border-default rounded-[4px] text-text-primary focus:outline-none focus:border-accent transition-all resize-none leading-relaxed"
        spellCheck={false}
      />
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4: Done
// ---------------------------------------------------------------------------

function StepDone({ name, createdFiles }: { name: string; createdFiles: string[] }) {
  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
        <CheckIcon size={16} className="text-accent" />
      </div>
      <p className="text-xs font-medium text-text-primary">{name} agent created</p>
      <p className="text-xs text-text-tertiary text-center max-w-[280px]">
        The agent is now available in the session launcher and room agent picker.
      </p>
      {createdFiles.length > 0 && (
        <div className="w-full bg-bg-base rounded-[4px] border border-border-default px-3 py-2 space-y-1">
          <p className="text-2xs text-text-ghost uppercase tracking-wider">Created files</p>
          {createdFiles.map((f) => (
            <p key={f} className="text-xs text-text-secondary font-mono">
              {f}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
