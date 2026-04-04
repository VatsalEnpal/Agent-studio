"use client";

import { useState, useEffect, useCallback } from "react";
import { Lightning, Plus, Trash, Play, SpinnerGap, CaretDown, CaretUp, X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useToastStore } from "@/stores/toast";

interface Automation {
  id: string;
  name: string;
  description: string;
  schedule: string;
  agent: string;
  model: "opus" | "sonnet" | "haiku";
  prompt: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
}

interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  defaultSchedule: string;
  defaultModel: "opus" | "sonnet" | "haiku";
  defaultPrompt: string;
}

const SCHEDULE_OPTIONS = [
  { label: "Every 2 hours", value: "every 2h" },
  { label: "Every 6 hours", value: "every 6h" },
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
];

function formatRelativeTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    return `${diffDays}d ago`;
  } catch {
    return iso;
  }
}

export function SettingsAutomations() {
  const addToast = useToastStore((s) => s.addToast);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [templates, setTemplates] = useState<AutomationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreator, setShowCreator] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{
    templateId: string;
    name: string;
    description: string;
    schedule: string;
    model: "opus" | "sonnet" | "haiku";
    reason: string;
    priority: "recommended" | "optional";
  }>>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [descriptionInput, setDescriptionInput] = useState("");
  const [generatingFromDesc, setGeneratingFromDesc] = useState(false);

  // Fetch automations and templates
  useEffect(() => {
    void (async () => {
      try {
        const [autoRes, templateRes] = await Promise.all([
          fetch("/api/automations"),
          fetch("/api/automation-templates"),
        ]);
        if (autoRes.ok) {
          setAutomations((await autoRes.json()) as Automation[]);
        }
        if (templateRes.ok) {
          setTemplates((await templateRes.json()) as AutomationTemplate[]);
        }
      } catch {
        // Best effort
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggleEnabled = useCallback(
    async (id: string, enabled: boolean) => {
      try {
        const res = await fetch(`/api/automations/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled }),
        });
        if (res.ok) {
          const updated = (await res.json()) as Automation;
          setAutomations((prev) =>
            prev.map((a) => (a.id === id ? updated : a)),
          );
          addToast(enabled ? "Automation enabled" : "Automation paused", "success");
        }
      } catch {
        addToast("Failed to update automation", "error");
      }
    },
    [addToast],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/automations/${id}`, { method: "DELETE" });
        if (res.ok) {
          setAutomations((prev) => prev.filter((a) => a.id !== id));
          addToast("Automation deleted", "success");
        }
      } catch {
        addToast("Failed to delete automation", "error");
      }
    },
    [addToast],
  );

  const handleRunNow = useCallback(
    async (id: string) => {
      setRunningId(id);
      try {
        const res = await fetch(`/api/automations/${id}/run`, { method: "POST" });
        if (res.ok) {
          addToast("Automation triggered — check Reports tab for results", "success");
          // Refresh to get updated lastRun
          const autoRes = await fetch("/api/automations");
          if (autoRes.ok) {
            setAutomations((await autoRes.json()) as Automation[]);
          }
        } else {
          addToast("Failed to trigger automation", "error");
        }
      } catch {
        addToast("Failed to trigger automation", "error");
      } finally {
        setRunningId(null);
      }
    },
    [addToast],
  );

  const handleCreate = useCallback(
    async (auto: Omit<Automation, "id">) => {
      try {
        const res = await fetch("/api/automations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(auto),
        });
        if (res.ok) {
          const created = (await res.json()) as Automation;
          setAutomations((prev) => [...prev, created]);
          setShowCreator(false);
          addToast("Automation created", "success");
        } else {
          addToast("Failed to create automation", "error");
        }
      } catch {
        addToast("Failed to create automation", "error");
      }
    },
    [addToast],
  );

  const loadSuggestions = useCallback(async () => {
    setSuggestionsLoading(true);
    setShowSuggestions(true);
    try {
      // Get the first project path from config
      const cfgRes = await fetch("/api/config");
      if (!cfgRes.ok) return;
      const cfgData = await cfgRes.json() as { config: { projects?: Array<{ path: string }> } };
      const projectPath = cfgData.config?.projects?.[0]?.path;
      if (!projectPath) {
        addToast("No project configured — add one in Settings first", "error");
        return;
      }
      const res = await fetch(`/api/automation-suggestions?project=${encodeURIComponent(projectPath)}`);
      if (res.ok) {
        const data = await res.json() as {
          suggestions: Array<{
            template: { id: string; name: string; description: string; defaultSchedule: string; defaultModel: "opus" | "sonnet" | "haiku" };
            reason: string;
            priority: "recommended" | "optional";
          }>;
        };
        setSuggestions(
          data.suggestions.map((s) => ({
            templateId: s.template.id,
            name: s.template.name,
            description: s.template.description,
            schedule: s.template.defaultSchedule,
            model: s.template.defaultModel,
            reason: s.reason,
            priority: s.priority,
          })),
        );
      }
    } catch {
      addToast("Failed to load suggestions", "error");
    } finally {
      setSuggestionsLoading(false);
    }
  }, [addToast]);

  const addFromSuggestion = useCallback(
    async (templateId: string) => {
      try {
        const cfgRes = await fetch("/api/config");
        if (!cfgRes.ok) return;
        const cfgData = await cfgRes.json() as { config: { projects?: Array<{ path: string }> } };
        const projectPath = cfgData.config?.projects?.[0]?.path;
        if (!projectPath) return;

        const res = await fetch("/api/automations/from-template", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templateId, projectPath }),
        });
        if (res.ok) {
          const created = (await res.json()) as Automation;
          setAutomations((prev) => [...prev, created]);
          setSuggestions((prev) => prev.filter((s) => s.templateId !== templateId));
          addToast(`Added "${created.name}" automation`, "success");
        }
      } catch {
        addToast("Failed to add automation", "error");
      }
    },
    [addToast],
  );

  const generateFromDescription = useCallback(async () => {
    if (!descriptionInput.trim()) return;
    setGeneratingFromDesc(true);
    try {
      const cfgRes = await fetch("/api/config");
      if (!cfgRes.ok) return;
      const cfgData = await cfgRes.json() as { config: { projects?: Array<{ path: string }> } };
      const projectPath = cfgData.config?.projects?.[0]?.path;
      if (!projectPath) {
        addToast("No project configured", "error");
        return;
      }

      const res = await fetch("/api/automations/from-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: descriptionInput.trim(), projectPath }),
      });
      if (res.ok) {
        const data = await res.json() as { generated: boolean; automation: Omit<Automation, "id"> };
        if (data.generated) {
          await handleCreate(data.automation);
          setDescriptionInput("");
        }
      } else {
        addToast("Failed to generate automation from description", "error");
      }
    } catch {
      addToast("Failed to generate automation", "error");
    } finally {
      setGeneratingFromDesc(false);
    }
  }, [descriptionInput, addToast, handleCreate]);

  if (loading) {
    return (
      <section className="border border-console-border rounded-lg bg-console-panel">
        <div className="px-4 py-3 border-b border-console-border">
          <h3 className="text-xs font-medium text-console-text">Automations</h3>
        </div>
        <div className="px-4 py-6 text-center text-xs text-console-dim animate-pulse">
          Loading automations...
        </div>
      </section>
    );
  }

  return (
    <section className="border border-console-border rounded-lg bg-console-panel">
      <div className="px-4 py-3 border-b border-console-border flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Lightning className="w-3.5 h-3.5 text-console-accent" />
          <h3 className="text-xs font-medium text-console-text">Automations</h3>
          <span className="text-label-xs text-console-dim">
            ({automations.length})
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => void loadSuggestions()}
            disabled={suggestionsLoading}
            className="flex items-center gap-1 px-2 py-1 text-label-xs font-medium text-console-dim hover:text-console-text bg-console-faint/50 hover:bg-console-faint rounded transition-colors disabled:opacity-50"
          >
            {suggestionsLoading ? (
              <SpinnerGap className="w-3 h-3 animate-spin" />
            ) : (
              <Lightning className="w-3 h-3" />
            )}
            Suggestions
          </button>
          <button
            onClick={() => setShowCreator(true)}
            className="flex items-center gap-1 px-2 py-1 text-label-xs font-medium text-console-accent bg-console-accent/10 hover:bg-console-accent/20 rounded transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add
          </button>
        </div>
      </div>

      <div className="px-4 py-3 space-y-2">
        {automations.length === 0 && !showCreator && (
          <p className="text-label-xs text-console-dim text-center py-4">
            No automations configured. Click &quot;Add&quot; to create one.
          </p>
        )}

        {automations.map((auto) => (
          <div
            key={auto.id}
            className="flex items-center gap-3 px-3 py-2.5 bg-console-bg border border-console-border rounded"
          >
            {/* Toggle */}
            <button
              onClick={() => void toggleEnabled(auto.id, !auto.enabled)}
              className={cn(
                "w-8 h-4 rounded-full relative transition-colors shrink-0",
                auto.enabled ? "bg-console-accent" : "bg-console-faint",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform",
                  auto.enabled ? "left-4.5 translate-x-0" : "left-0.5",
                )}
                style={{ left: auto.enabled ? "18px" : "2px" }}
              />
            </button>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-console-text truncate">
                  {auto.name}
                </span>
                <span className="text-label-xs text-console-dim shrink-0">
                  {auto.schedule}
                </span>
              </div>
              <div className="flex items-center gap-2 text-label-xs text-console-dim">
                <span>{auto.model}</span>
                {auto.lastRun && (
                  <span>Last run: {formatRelativeTime(auto.lastRun)}</span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => void handleRunNow(auto.id)}
                disabled={runningId === auto.id}
                className="p-1 text-console-dim hover:text-console-accent transition-colors disabled:opacity-50"
                title="Run now"
              >
                {runningId === auto.id ? (
                  <SpinnerGap className="w-3 h-3 animate-spin" />
                ) : (
                  <Play className="w-3 h-3" />
                )}
              </button>
              <button
                onClick={() => void handleDelete(auto.id)}
                className="p-1 text-console-dim hover:text-console-error transition-colors"
                title="Delete"
              >
                <Trash className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}

        {/* Suggestions */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="border border-console-accent/20 rounded-lg bg-console-accent/5 overflow-hidden">
            <div className="px-3 py-2 border-b border-console-accent/20 flex items-center justify-between">
              <span className="text-label-xs font-semibold uppercase tracking-wider text-console-accent">
                Suggested for your project
              </span>
              <button
                onClick={() => setShowSuggestions(false)}
                className="p-0.5 text-console-dim hover:text-console-muted"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="px-3 py-2 space-y-1.5">
              {suggestions.map((s) => (
                <div
                  key={s.templateId}
                  className="flex items-center gap-3 px-2 py-2 bg-console-bg border border-console-border rounded"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-console-text">{s.name}</span>
                      <span className="text-label-xs text-console-dim">{s.schedule}</span>
                      <span className="text-label-xs text-console-dim">{s.model}</span>
                      {s.priority === "recommended" && (
                        <span className="text-label-xs px-1.5 py-0.5 bg-console-accent/20 text-console-accent rounded-full">
                          recommended
                        </span>
                      )}
                    </div>
                    <p className="text-label-xs text-console-dim mt-0.5 italic">{s.reason}</p>
                  </div>
                  <button
                    onClick={() => void addFromSuggestion(s.templateId)}
                    className="px-2 py-1 text-label-xs font-medium text-console-accent bg-console-accent/10 hover:bg-console-accent/20 rounded transition-colors shrink-0"
                  >
                    <Plus className="w-3 h-3 inline -mt-0.5 mr-0.5" />
                    Add
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Create from description */}
        <div className="flex items-center gap-2 pt-1">
          <input
            type="text"
            value={descriptionInput}
            onChange={(e) => setDescriptionInput(e.target.value)}
            placeholder="Describe an automation... (e.g., 'Review code for security issues daily')"
            onKeyDown={(e) => {
              if (e.key === "Enter" && descriptionInput.trim()) {
                void generateFromDescription();
              }
            }}
            className="flex-1 px-2 py-1.5 text-xs bg-console-bg border border-console-border rounded text-console-text placeholder:text-console-dim/50 focus:border-console-accent focus:outline-none"
          />
          <button
            onClick={() => void generateFromDescription()}
            disabled={!descriptionInput.trim() || generatingFromDesc}
            className="px-2 py-1.5 text-label-xs font-medium text-console-accent bg-console-accent/10 hover:bg-console-accent/20 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {generatingFromDesc ? (
              <SpinnerGap className="w-3 h-3 animate-spin" />
            ) : (
              "Generate"
            )}
          </button>
        </div>

        {/* Creator */}
        {showCreator && (
          <AutomationCreator
            templates={templates}
            onCancel={() => setShowCreator(false)}
            onCreate={handleCreate}
          />
        )}
      </div>
    </section>
  );
}

// ---------- Creator Sub-component ----------

function AutomationCreator({
  templates,
  onCancel,
  onCreate,
}: {
  templates: AutomationTemplate[];
  onCancel: () => void;
  onCreate: (auto: Omit<Automation, "id">) => void;
}) {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [schedule, setSchedule] = useState("daily");
  const [model, setModel] = useState<"opus" | "sonnet" | "haiku">("sonnet");
  const [prompt, setPrompt] = useState("");
  const [expanded, setExpanded] = useState(false);

  const applyTemplate = useCallback(
    (templateId: string) => {
      const tmpl = templates.find((t) => t.id === templateId);
      if (!tmpl) return;
      setSelectedTemplate(templateId);
      setName(tmpl.name);
      setDescription(tmpl.description);
      setSchedule(tmpl.defaultSchedule);
      setModel(tmpl.defaultModel);
      setPrompt(tmpl.defaultPrompt);
      if (templateId === "custom") {
        setExpanded(true);
      }
    },
    [templates],
  );

  const handleSubmit = useCallback(() => {
    if (!name.trim() || !prompt.trim()) return;
    onCreate({
      name: name.trim(),
      description: description.trim(),
      schedule,
      agent: "none",
      model,
      prompt: prompt.trim(),
      enabled: true,
    });
  }, [name, description, schedule, model, prompt, onCreate]);

  return (
    <div className="border border-console-accent/30 rounded-lg bg-console-accent/5 overflow-hidden">
      <div className="px-3 py-2 border-b border-console-accent/20 flex items-center justify-between">
        <span className="text-label-xs font-semibold uppercase tracking-wider text-console-accent">
          New Automation
        </span>
        <button onClick={onCancel} className="p-0.5 text-console-dim hover:text-console-muted">
          <X className="w-3 h-3" />
        </button>
      </div>

      <div className="px-3 py-3 space-y-3">
        {/* Template picker */}
        {!selectedTemplate && (
          <div>
            <label className="block text-label-xs text-console-muted mb-1.5">
              Choose a template
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {templates.map((tmpl) => (
                <button
                  key={tmpl.id}
                  onClick={() => applyTemplate(tmpl.id)}
                  className="flex flex-col items-center gap-1 p-2.5 rounded border border-console-border hover:border-console-accent/50 hover:bg-console-faint/50 transition-colors"
                >
                  <span className="text-label-xs font-medium text-console-text">
                    {tmpl.name}
                  </span>
                  <span className="text-label-xs text-console-dim text-center leading-tight">
                    {tmpl.description.slice(0, 50)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Form (shown after template selection) */}
        {selectedTemplate && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-label-xs text-console-muted mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs bg-console-bg border border-console-border rounded text-console-text focus:border-console-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-label-xs text-console-muted mb-1">
                  Schedule
                </label>
                <select
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs bg-console-bg border border-console-border rounded text-console-text focus:border-console-accent focus:outline-none"
                >
                  {SCHEDULE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-label-xs text-console-muted mb-1">
                Model
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as "opus" | "sonnet" | "haiku")}
                className="w-full px-2 py-1.5 text-xs bg-console-bg border border-console-border rounded text-console-text focus:border-console-accent focus:outline-none"
              >
                <option value="opus">Opus</option>
                <option value="sonnet">Sonnet</option>
                <option value="haiku">Haiku</option>
              </select>
            </div>

            {/* Prompt — collapsible for non-custom templates */}
            <div>
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-label-xs text-console-muted mb-1 hover:text-console-text transition-colors"
              >
                {expanded ? <CaretUp className="w-3 h-3" /> : <CaretDown className="w-3 h-3" />}
                Prompt
              </button>
              {expanded && (
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={5}
                  className="w-full px-2 py-1.5 text-xs bg-console-bg border border-console-border rounded text-console-text font-mono focus:border-console-accent focus:outline-none resize-none"
                />
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => {
                  setSelectedTemplate(null);
                  setName("");
                  setPrompt("");
                }}
                className="px-2 py-1 text-label-xs text-console-dim hover:text-console-muted transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={!name.trim() || !prompt.trim()}
                className="px-3 py-1 text-label-xs font-medium text-black bg-console-accent hover:bg-console-accent/90 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
