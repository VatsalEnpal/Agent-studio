"use client";

import { useState, useCallback, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  CloseIcon,
  PlusIcon,
  TrashIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  SpinnerIcon,
} from "@/components/ui/icons";
import {
  useWorkflowV2Store,
  type WorkflowPipelineClient,
  type PipelineStepClient,
} from "@/stores/workflows-v2";
import { useToastStore } from "@/stores/toast";
import { cn } from "@/lib/utils";

// ---------- Types ----------

interface StepDraft {
  id: string;
  type: "agent" | "gate" | "loop";
  name: string;
  agent: string;
  goal: string;
  output: string;
  reviewArtifact: string;
  allowFeedback: boolean;
  notify: string[];
  loopSteps: string[];
  maxIterations: number;
  onExhausted: string;
}

function emptyAgentStep(): StepDraft {
  return {
    id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: "agent",
    name: "",
    agent: "",
    goal: "",
    output: "",
    reviewArtifact: "",
    allowFeedback: false,
    notify: [],
    loopSteps: [],
    maxIterations: 3,
    onExhausted: "pause",
  };
}

function emptyGateStep(): StepDraft {
  return {
    ...emptyAgentStep(),
    type: "gate",
    name: "Approval Gate",
  };
}

// ---------- Component ----------

interface CreateWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateWorkflowDialog({ open, onOpenChange }: CreateWorkflowDialogProps) {
  const createWorkflow = useWorkflowV2Store((s) => s.createWorkflow);
  const addToast = useToastStore((s) => s.addToast);

  const [currentStep, setCurrentStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1: Basic info
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [workingDirectory, setWorkingDirectory] = useState("");

  // Step 2: Pipeline
  const [steps, setSteps] = useState<StepDraft[]>([emptyAgentStep()]);

  // Step 3: Trigger
  const [triggerType, setTriggerType] = useState<"manual" | "scheduled" | "event">("manual");
  const [interval, setInterval] = useState("every 2h");
  const [stateFilePath, setStateFilePath] = useState("");

  // Available agents
  const [agents, setAgents] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      fetch("/api/agents")
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setAgents(data.map((a: { id?: string; name?: string }) => a.id || a.name || ""));
          }
        })
        .catch(() => {});
    }
  }, [open]);

  const reset = useCallback(() => {
    setCurrentStep(1);
    setName("");
    setDescription("");
    setWorkingDirectory("");
    setSteps([emptyAgentStep()]);
    setTriggerType("manual");
    setInterval("every 2h");
    setStateFilePath("");
    setSaving(false);
  }, []);

  const addAgentStep = () => setSteps((s) => [...s, emptyAgentStep()]);
  const addGateStep = () => setSteps((s) => [...s, emptyGateStep()]);

  const removeStep = (id: string) => setSteps((s) => s.filter((step) => step.id !== id));

  const updateStep = (id: string, updates: Partial<StepDraft>) =>
    setSteps((s) => s.map((step) => (step.id === id ? { ...step, ...updates } : step)));

  const moveStep = (id: string, direction: "up" | "down") => {
    setSteps((prev) => {
      const arr = [...prev];
      const idx = arr.findIndex((s) => s.id === id);
      if (idx < 0) return prev;
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= arr.length) return prev;
      [arr[idx], arr[newIdx]] = [arr[newIdx]!, arr[idx]!];
      return arr;
    });
  };

  const handleSave = async () => {
    if (!name.trim()) {
      addToast("Workflow needs a name", "error");
      return;
    }
    if (steps.length === 0) {
      addToast("Add at least one step", "error");
      return;
    }

    setSaving(true);

    const pipelineSteps: PipelineStepClient[] = steps.map((s) => {
      if (s.type === "gate") {
        return {
          id: s.id,
          name: s.name || "Approval Gate",
          type: "gate" as const,
          reviewArtifact: s.reviewArtifact || undefined,
          allowFeedback: s.allowFeedback,
          notify: s.notify.length > 0 ? s.notify : undefined,
        };
      }
      return {
        id: s.id,
        name: s.name || s.agent,
        type: "agent" as const,
        agent: s.agent,
        goal: s.goal,
        output: s.output || undefined,
      };
    });

    const trigger: WorkflowPipelineClient["trigger"] =
      triggerType === "scheduled"
        ? { type: "scheduled", interval }
        : triggerType === "event"
          ? { type: "event", stateFile: stateFilePath }
          : { type: "manual" };

    const def: WorkflowPipelineClient = {
      id: name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, ""),
      name,
      description,
      mode: triggerType === "event" ? "watch" : "execute",
      trigger,
      workingDirectory: workingDirectory || "/tmp",
      steps: pipelineSteps,
    };

    const result = await createWorkflow(def);
    setSaving(false);

    if (result.error) {
      addToast(result.error, "error");
    } else {
      addToast(`Workflow "${name}" created`, "success");
      reset();
      onOpenChange(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
            <Dialog.Title className="text-lg font-semibold text-zinc-100">
              Create Workflow
              <span className="ml-2 text-sm font-normal text-zinc-500">
                Step {currentStep} of 4
              </span>
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300">
                <CloseIcon className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
            {currentStep === 1 && (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-400">Name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Weekly Research Report"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-400">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What does this workflow do?"
                    rows={2}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none resize-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-400">
                    Working Directory
                  </label>
                  <input
                    value={workingDirectory}
                    onChange={(e) => setWorkingDirectory(e.target.value)}
                    placeholder="/Users/you/Code/your-project"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-3">
                <p className="text-xs text-zinc-500">
                  Build your pipeline: add agent steps and approval gates.
                </p>

                {steps.map((step, idx) => (
                  <div
                    key={step.id}
                    className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                            step.type === "agent"
                              ? "bg-blue-500/15 text-blue-400"
                              : "bg-amber-500/15 text-amber-400",
                          )}
                        >
                          {step.type}
                        </span>
                        <span className="text-xs text-zinc-500">#{idx + 1}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => moveStep(step.id, "up")}
                          disabled={idx === 0}
                          className="rounded p-1 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300 disabled:opacity-30"
                        >
                          <ChevronUpIcon className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => moveStep(step.id, "down")}
                          disabled={idx === steps.length - 1}
                          className="rounded p-1 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300 disabled:opacity-30"
                        >
                          <ChevronDownIcon className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => removeStep(step.id)}
                          disabled={steps.length <= 1}
                          className="rounded p-1 text-zinc-500 hover:bg-zinc-700 hover:text-red-400 disabled:opacity-30"
                        >
                          <TrashIcon className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    {step.type === "agent" && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="mb-0.5 block text-[10px] text-zinc-500">Agent</label>
                            <select
                              value={step.agent}
                              onChange={(e) => updateStep(step.id, { agent: e.target.value })}
                              className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 focus:border-zinc-500 focus:outline-none"
                            >
                              <option value="">Select agent...</option>
                              {agents.map((a) => (
                                <option key={a} value={a}>
                                  {a}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="mb-0.5 block text-[10px] text-zinc-500">
                              Name (optional)
                            </label>
                            <input
                              value={step.name}
                              onChange={(e) => updateStep(step.id, { name: e.target.value })}
                              placeholder={step.agent || "Step name"}
                              className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="mb-0.5 block text-[10px] text-zinc-500">Goal</label>
                          <textarea
                            value={step.goal}
                            onChange={(e) => updateStep(step.id, { goal: e.target.value })}
                            placeholder="What should the agent do?"
                            rows={2}
                            className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none resize-none"
                          />
                        </div>
                        <div>
                          <label className="mb-0.5 block text-[10px] text-zinc-500">
                            Output file (optional)
                          </label>
                          <input
                            value={step.output}
                            onChange={(e) => updateStep(step.id, { output: e.target.value })}
                            placeholder="output.md"
                            className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    )}

                    {step.type === "gate" && (
                      <div className="space-y-2">
                        <div>
                          <label className="mb-0.5 block text-[10px] text-zinc-500">
                            Review Artifact (optional)
                          </label>
                          <input
                            value={step.reviewArtifact}
                            onChange={(e) =>
                              updateStep(step.id, { reviewArtifact: e.target.value })
                            }
                            placeholder="path/to/artifact.md"
                            className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
                          />
                        </div>
                        <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={step.allowFeedback}
                            onChange={(e) =>
                              updateStep(step.id, { allowFeedback: e.target.checked })
                            }
                            className="rounded border-zinc-600"
                          />
                          Allow feedback (rejection sends notes back to previous agent)
                        </label>
                      </div>
                    )}
                  </div>
                ))}

                <div className="flex gap-2">
                  <button
                    onClick={addAgentStep}
                    className="flex items-center gap-1.5 rounded-lg border border-dashed border-zinc-700 px-3 py-1.5 text-xs text-zinc-500 hover:border-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    <PlusIcon className="h-3 w-3" />
                    Agent Step
                  </button>
                  <button
                    onClick={addGateStep}
                    className="flex items-center gap-1.5 rounded-lg border border-dashed border-amber-700/50 px-3 py-1.5 text-xs text-amber-600 hover:border-amber-500 hover:text-amber-400 transition-colors"
                  >
                    <PlusIcon className="h-3 w-3" />
                    Approval Gate
                  </button>
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-4">
                <p className="text-xs text-zinc-500">How should this workflow be triggered?</p>

                <div className="space-y-2">
                  {(["manual", "scheduled", "event"] as const).map((type) => (
                    <label
                      key={type}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors",
                        triggerType === type
                          ? "border-blue-500/50 bg-blue-500/5"
                          : "border-zinc-700 hover:border-zinc-600",
                      )}
                    >
                      <input
                        type="radio"
                        name="trigger"
                        value={type}
                        checked={triggerType === type}
                        onChange={() => setTriggerType(type)}
                        className="accent-blue-500"
                      />
                      <div>
                        <div className="text-sm font-medium text-zinc-200 capitalize">{type}</div>
                        <div className="text-[10px] text-zinc-500">
                          {type === "manual" && "Run manually when you click 'Run'"}
                          {type === "scheduled" && "Run automatically on a schedule"}
                          {type === "event" && "Watch a state file for changes"}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>

                {triggerType === "scheduled" && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-400">Interval</label>
                    <select
                      value={interval}
                      onChange={(e) => setInterval(e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:border-zinc-500 focus:outline-none"
                    >
                      <option value="every 30m">Every 30 minutes</option>
                      <option value="every 1h">Every hour</option>
                      <option value="every 2h">Every 2 hours</option>
                      <option value="every 4h">Every 4 hours</option>
                      <option value="every 8h">Every 8 hours</option>
                      <option value="every 12h">Every 12 hours</option>
                      <option value="every 1d">Every day</option>
                    </select>
                  </div>
                )}

                {triggerType === "event" && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-400">
                      State File Path
                    </label>
                    <input
                      value={stateFilePath}
                      onChange={(e) => setStateFilePath(e.target.value)}
                      placeholder="sprints/state.json"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            )}

            {currentStep === 4 && (
              <div className="space-y-4">
                <p className="text-xs text-zinc-500">Review your workflow before creating it.</p>

                <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4 space-y-3">
                  <div>
                    <div className="text-xs text-zinc-500">Name</div>
                    <div className="text-sm font-medium text-zinc-200">{name}</div>
                  </div>
                  {description && (
                    <div>
                      <div className="text-xs text-zinc-500">Description</div>
                      <div className="text-sm text-zinc-300">{description}</div>
                    </div>
                  )}
                  <div>
                    <div className="text-xs text-zinc-500">Trigger</div>
                    <div className="text-sm text-zinc-300">
                      {triggerType === "manual" && "Runs manually"}
                      {triggerType === "scheduled" && `${interval.replace("every ", "Every ")}`}
                      {triggerType === "event" && `Watches: ${stateFilePath || "(no path)"}`}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 mb-1">
                      Pipeline ({steps.length} steps)
                    </div>
                    <div className="space-y-1">
                      {steps.map((s, i) => (
                        <div key={s.id} className="flex items-center gap-2 text-xs">
                          <span className="text-zinc-600">{i + 1}.</span>
                          <span
                            className={cn(
                              "rounded px-1 py-0.5 text-[9px] font-semibold uppercase",
                              s.type === "agent"
                                ? "bg-blue-500/15 text-blue-400"
                                : "bg-amber-500/15 text-amber-400",
                            )}
                          >
                            {s.type}
                          </span>
                          <span className="text-zinc-300">{s.name || s.agent || "Unnamed"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-zinc-800 px-6 py-3">
            <div>
              {currentStep > 1 && (
                <button
                  onClick={() => setCurrentStep((s) => s - 1)}
                  className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                >
                  Back
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <Dialog.Close asChild>
                <button className="rounded-lg px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300">
                  Cancel
                </button>
              </Dialog.Close>
              {currentStep < 4 ? (
                <button
                  onClick={() => setCurrentStep((s) => s + 1)}
                  disabled={currentStep === 1 && !name.trim()}
                  className="rounded-lg bg-zinc-700 px-4 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-600 disabled:opacity-50"
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={handleSave}
                  disabled={saving || steps.length === 0}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {saving && <SpinnerIcon className="h-3 w-3 animate-spin" />}
                  Create Workflow
                </button>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
