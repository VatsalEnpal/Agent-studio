"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Zap,
  Plus,
  Trash2,
  Play,
  Loader2,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
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
          <Zap className="w-3.5 h-3.5 text-console-accent" />
          <h3 className="text-xs font-medium text-console-text">Automations</h3>
          <span className="text-[9px] text-console-dim">
            ({automations.length})
          </span>
        </div>
        <button
          onClick={() => setShowCreator(true)}
          className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-console-accent bg-console-accent/10 hover:bg-console-accent/20 rounded transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add
        </button>
      </div>

      <div className="px-4 py-3 space-y-2">
        {automations.length === 0 && !showCreator && (
          <p className="text-[10px] text-console-dim text-center py-4">
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
                <span className="text-[9px] text-console-dim shrink-0">
                  {auto.schedule}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[9px] text-console-dim">
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
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Play className="w-3 h-3" />
                )}
              </button>
              <button
                onClick={() => void handleDelete(auto.id)}
                className="p-1 text-console-dim hover:text-console-error transition-colors"
                title="Delete"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}

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
        <span className="text-[10px] font-semibold uppercase tracking-wider text-console-accent">
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
            <label className="block text-[10px] text-console-muted mb-1.5">
              Choose a template
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {templates.map((tmpl) => (
                <button
                  key={tmpl.id}
                  onClick={() => applyTemplate(tmpl.id)}
                  className="flex flex-col items-center gap-1 p-2.5 rounded border border-console-border hover:border-console-accent/50 hover:bg-console-faint/50 transition-colors"
                >
                  <span className="text-[10px] font-medium text-console-text">
                    {tmpl.name}
                  </span>
                  <span className="text-[9px] text-console-dim text-center leading-tight">
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
                <label className="block text-[10px] text-console-muted mb-1">
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
                <label className="block text-[10px] text-console-muted mb-1">
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
              <label className="block text-[10px] text-console-muted mb-1">
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
                className="flex items-center gap-1 text-[10px] text-console-muted mb-1 hover:text-console-text transition-colors"
              >
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
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
                className="px-2 py-1 text-[10px] text-console-dim hover:text-console-muted transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={!name.trim() || !prompt.trim()}
                className="px-3 py-1 text-[10px] font-medium text-black bg-console-accent hover:bg-console-accent/90 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
