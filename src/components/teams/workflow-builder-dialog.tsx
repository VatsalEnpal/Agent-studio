"use client";

import { useState, useEffect, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, SpinnerGap, Plus, Trash, CaretUp, CaretDown, Rocket, Bug, Shield, Wrench, Lightning, GitBranch, Eye, FileCode } from "@phosphor-icons/react";
import { useWorkflowStore, type WorkflowDraft } from "@/stores/workflows";
import { useToastStore } from "@/stores/toast";
import { cn } from "@/lib/utils";

// Icons available for workflows
const ICON_OPTIONS = [
  { value: "Rocket", icon: Rocket, label: "Rocket" },
  { value: "Bug", icon: Bug, label: "Bug" },
  { value: "Shield", icon: Shield, label: "Shield" },
  { value: "Wrench", icon: Wrench, label: "Wrench" },
  { value: "Lightning", icon: Lightning, label: "Lightning" },
  { value: "GitBranch", icon: GitBranch, label: "Git" },
  { value: "Eye", icon: Eye, label: "Review" },
  { value: "FileCode", icon: FileCode, label: "Code" },
] as const;

// Pre-built templates
const TEMPLATES: { name: string; description: string; icon: string; steps: Array<{ name: string; description: string; agent: string }> }[] = [
  {
    name: "Code Review",
    description: "QA scans code, Security reviews, then generates report",
    icon: "Eye",
    steps: [
      { name: "QA Scan", description: "Scan code for bugs and issues", agent: "qa-tester" },
      { name: "Security Review", description: "Review for security vulnerabilities", agent: "security-reviewer" },
      { name: "Report", description: "Generate review report", agent: "orchestrator" },
    ],
  },
  {
    name: "Bug Fix",
    description: "Analyze bug, apply fixes, then verify",
    icon: "Bug",
    steps: [
      { name: "Analyze", description: "Investigate the bug and root cause", agent: "orchestrator" },
      { name: "Fix", description: "Apply the code fix", agent: "backend-worker" },
      { name: "Verify", description: "Run tests to confirm fix", agent: "qa-tester" },
    ],
  },
  {
    name: "Feature Build",
    description: "Backend builds, Frontend wires, QA tests, Security reviews",
    icon: "Rocket",
    steps: [
      { name: "Backend", description: "Build API and data layer", agent: "backend-worker" },
      { name: "Frontend", description: "Wire up the UI", agent: "frontend-worker" },
      { name: "QA", description: "Test the feature end-to-end", agent: "qa-tester" },
      { name: "Security", description: "Final security review", agent: "security-reviewer" },
    ],
  },
  {
    name: "Deploy",
    description: "Run tests, security scan, build, then deploy",
    icon: "Lightning",
    steps: [
      { name: "Run Tests", description: "Execute test suite", agent: "qa-tester" },
      { name: "Security Scan", description: "Run security checks", agent: "security-reviewer" },
      { name: "Build", description: "Build the project", agent: "orchestrator" },
      { name: "Deploy", description: "Deploy to environment", agent: "orchestrator" },
    ],
  },
];

interface AgentOption {
  id: string;
  name: string;
}

export function WorkflowBuilderDialog() {
  const open = useWorkflowStore((s) => s.builderOpen);
  const close = useWorkflowStore((s) => s.closeBuilder);
  const editingId = useWorkflowStore((s) => s.editingWorkflowId);
  const draft = useWorkflowStore((s) => s.draft);
  const saving = useWorkflowStore((s) => s.saving);
  const setSaving = useWorkflowStore((s) => s.setSaving);
  const setDraft = useWorkflowStore((s) => s.setDraft);
  const updateDraftField = useWorkflowStore((s) => s.updateDraftField);
  const addStep = useWorkflowStore((s) => s.addStep);
  const removeStep = useWorkflowStore((s) => s.removeStep);
  const updateStep = useWorkflowStore((s) => s.updateStep);
  const moveStep = useWorkflowStore((s) => s.moveStep);
  const addToast = useToastStore((s) => s.addToast);

  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [showTemplates, setShowTemplates] = useState(!editingId);

  // Fetch agents on open
  useEffect(() => {
    if (open) {
      fetch("/api/agents")
        .then((r) => r.json())
        .then((data: AgentOption[]) => {
          if (Array.isArray(data)) setAgents(data);
        })
        .catch(() => setAgents([]));
      setShowTemplates(!editingId && !draft.name);
    }
  }, [open, editingId, draft.name]);

  const applyTemplate = useCallback(
    (tpl: (typeof TEMPLATES)[number]) => {
      setDraft({
        name: tpl.name,
        description: tpl.description,
        icon: tpl.icon,
        steps: tpl.steps.map((s, i) => ({
          id: `step-tpl-${i}-${Date.now()}`,
          name: s.name,
          description: s.description,
          agent: s.agent,
        })),
      });
      setShowTemplates(false);
    },
    [setDraft],
  );

  const handleSave = useCallback(async () => {
    if (!draft.name.trim()) {
      addToast("Workflow name is required", "error");
      return;
    }
    if (draft.steps.length === 0 || draft.steps.every((s) => !s.name.trim())) {
      addToast("At least one named step is required", "error");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: draft.name,
        description: draft.description,
        icon: draft.icon,
        steps: draft.steps
          .filter((s) => s.name.trim())
          .map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            agents: s.agent ? [s.agent] : [],
          })),
      };

      const url = editingId ? `/api/workflows/${encodeURIComponent(editingId)}` : "/api/workflows";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Failed to save");

      addToast(editingId ? "Workflow updated" : "Workflow created", "success");
      close();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      addToast(`Error: ${msg}`, "error");
    } finally {
      setSaving(false);
    }
  }, [draft, editingId, addToast, close, setSaving]);

  const isEdit = !!editingId;

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[620px] max-h-[85vh] overflow-y-auto bg-console-panel border border-console-border rounded-lg shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-console-border">
            <Dialog.Title className="text-xs font-medium text-console-text">
              {isEdit ? "Edit Workflow" : "Create Workflow"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-1 text-console-dim hover:text-console-text transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </Dialog.Close>
          </div>

          {/* Templates section (only for create) */}
          {showTemplates && !isEdit && (
            <div className="px-4 py-3 border-b border-console-border">
              <p className="text-[9px] font-medium text-console-dim uppercase tracking-wider mb-2">
                Start from a template
              </p>
              <div className="grid grid-cols-2 gap-2">
                {TEMPLATES.map((tpl) => {
                  const TplIcon = ICON_OPTIONS.find((i) => i.value === tpl.icon)?.icon ?? Rocket;
                  return (
                    <button
                      key={tpl.name}
                      onClick={() => applyTemplate(tpl)}
                      className="flex items-start gap-2 p-2.5 text-left bg-console-bg border border-console-border rounded hover:border-console-accent/50 transition-colors"
                    >
                      <TplIcon className="w-3.5 h-3.5 text-console-muted shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-[10px] font-medium text-console-text">{tpl.name}</p>
                        <p className="text-[8px] text-console-dim mt-0.5 line-clamp-2">{tpl.description}</p>
                        <p className="text-[8px] text-console-dim mt-1">{tpl.steps.length} steps</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setShowTemplates(false)}
                className="mt-2 text-[9px] text-console-accent hover:underline"
              >
                Or start from scratch
              </button>
            </div>
          )}

          <div className="px-4 py-3 space-y-3">
            {/* Basic info */}
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div>
                <label className="text-[9px] font-medium text-console-dim uppercase tracking-wider">Name</label>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => updateDraftField("name", e.target.value)}
                  placeholder="e.g., Deploy Pipeline"
                  className="mt-1 w-full px-2.5 py-1.5 text-xs bg-console-bg border border-console-border rounded text-console-text placeholder:text-console-dim focus:outline-none focus:border-console-accent transition-colors"
                />
              </div>
              <div>
                <label className="text-[9px] font-medium text-console-dim uppercase tracking-wider">Icon</label>
                <div className="mt-1 flex items-center gap-1">
                  {ICON_OPTIONS.map((opt) => {
                    const IconComp = opt.icon;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => updateDraftField("icon", opt.value)}
                        className={cn(
                          "p-1.5 rounded transition-colors",
                          draft.icon === opt.value
                            ? "bg-console-accent/20 text-console-accent border border-console-accent/30"
                            : "text-console-dim hover:text-console-muted bg-console-bg border border-console-border",
                        )}
                        title={opt.label}
                      >
                        <IconComp className="w-3 h-3" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div>
              <label className="text-[9px] font-medium text-console-dim uppercase tracking-wider">Description</label>
              <input
                type="text"
                value={draft.description}
                onChange={(e) => updateDraftField("description", e.target.value)}
                placeholder="What does this workflow do?"
                className="mt-1 w-full px-2.5 py-1.5 text-xs bg-console-bg border border-console-border rounded text-console-text placeholder:text-console-dim focus:outline-none focus:border-console-accent transition-colors"
              />
            </div>

            {/* Steps */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[9px] font-medium text-console-dim uppercase tracking-wider">
                  Steps ({draft.steps.length})
                </label>
                <button
                  onClick={addStep}
                  className="flex items-center gap-1 px-2 py-0.5 text-[9px] text-console-accent hover:text-console-accent/80 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Add Step
                </button>
              </div>

              <div className="space-y-2">
                {draft.steps.map((step, idx) => (
                  <StepRow
                    key={step.id}
                    step={step}
                    index={idx}
                    total={draft.steps.length}
                    agents={agents}
                    onUpdate={(updates) => updateStep(step.id, updates)}
                    onRemove={() => removeStep(step.id)}
                    onMoveUp={() => moveStep(step.id, "up")}
                    onMoveDown={() => moveStep(step.id, "down")}
                  />
                ))}
              </div>

              {draft.steps.length === 0 && (
                <div className="text-center py-4 text-[10px] text-console-dim">
                  No steps yet. Add a step or pick a template.
                </div>
              )}
            </div>

            {/* Preview timeline */}
            {draft.steps.filter((s) => s.name.trim()).length > 0 && (
              <StepPreview steps={draft.steps.filter((s) => s.name.trim())} />
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-console-border">
            {!isEdit && showTemplates ? null : (
              <>
                <button
                  onClick={close}
                  className="px-3 py-1.5 text-[10px] text-console-muted hover:text-console-text bg-console-faint rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !draft.name.trim()}
                  className="px-3 py-1.5 text-[10px] font-medium text-console-bg bg-console-accent rounded hover:bg-console-accent/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {saving && <SpinnerGap className="w-3 h-3 animate-spin" />}
                  {isEdit ? "Save" : "Create"}
                </button>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function StepRow({
  step,
  index,
  total,
  agents,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  step: { id: string; name: string; description: string; agent: string };
  index: number;
  total: number;
  agents: AgentOption[];
  onUpdate: (updates: Partial<{ name: string; description: string; agent: string }>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className="flex items-start gap-2 p-2.5 bg-console-bg border border-console-border rounded">
      {/* Step number + reorder */}
      <div className="flex flex-col items-center gap-0.5 shrink-0 pt-1">
        <span className="text-[9px] font-mono text-console-dim w-4 text-center">{index + 1}</span>
        <button
          onClick={onMoveUp}
          disabled={index === 0}
          className="p-0.5 text-console-dim hover:text-console-muted disabled:opacity-30 transition-colors"
        >
          <CaretUp className="w-3 h-3" />
        </button>
        <button
          onClick={onMoveDown}
          disabled={index === total - 1}
          className="p-0.5 text-console-dim hover:text-console-muted disabled:opacity-30 transition-colors"
        >
          <CaretDown className="w-3 h-3" />
        </button>
      </div>

      {/* Fields */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <input
          type="text"
          value={step.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="Step name"
          className="w-full px-2 py-1 text-[10px] bg-console-panel border border-console-border rounded text-console-text placeholder:text-console-dim focus:outline-none focus:border-console-accent"
        />
        <input
          type="text"
          value={step.description}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder="Description (optional)"
          className="w-full px-2 py-1 text-[10px] bg-console-panel border border-console-border rounded text-console-text placeholder:text-console-dim focus:outline-none focus:border-console-accent"
        />
        <select
          value={step.agent}
          onChange={(e) => onUpdate({ agent: e.target.value })}
          className="w-full px-2 py-1 text-[10px] bg-console-panel border border-console-border rounded text-console-text focus:outline-none focus:border-console-accent"
        >
          <option value="">Assign agent...</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      {/* Remove */}
      <button
        onClick={onRemove}
        disabled={total <= 1}
        className="p-1 text-console-dim hover:text-console-error disabled:opacity-30 transition-colors shrink-0"
      >
        <Trash className="w-3 h-3" />
      </button>
    </div>
  );
}

function StepPreview({ steps }: { steps: Array<{ id: string; name: string; agent: string }> }) {
  return (
    <div>
      <p className="text-[9px] font-medium text-console-dim uppercase tracking-wider mb-2">Preview</p>
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {steps.map((step, idx) => (
          <div key={step.id} className="flex items-center gap-1 shrink-0">
            {idx > 0 && (
              <div className="w-4 h-px bg-console-border" />
            )}
            <div className="flex items-center gap-1.5 px-2 py-1 bg-console-bg border border-console-border rounded text-[9px]">
              <span className="w-3.5 h-3.5 flex items-center justify-center rounded-full bg-console-accent/20 text-console-accent text-[8px] font-mono shrink-0">
                {idx + 1}
              </span>
              <span className="text-console-text font-medium whitespace-nowrap">{step.name}</span>
              {step.agent && (
                <span className="text-console-dim text-[8px]">({step.agent})</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
