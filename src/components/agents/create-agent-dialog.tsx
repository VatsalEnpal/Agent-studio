"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { CloseIcon, CheckIcon, UserIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { useConfig } from "@/hooks/use-config";
import { useToastStore } from "@/stores/toast";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EditingAgent {
  /** Existing agent id (filename without .md). */
  id: string;
  name: string;
  description?: string;
  model?: "opus" | "sonnet" | "haiku" | "inherit";
  permissions?: "auto" | "plan" | "default" | "bypass";
  icon?: string;
  /** Optional: markdown body to prefill. We do not fetch the file — callers
   *  can leave this blank and users can type a new body on save. */
  body?: string;
  sourcePath: string;
}

interface CreateAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional — currently unused by the create form, kept for API compat. */
  projectPath?: string;
  onCreated?: () => void;
  /**
   * When present, the dialog switches into edit mode:
   *   - prefills form fields
   *   - submits PUT /api/agents/:id instead of POST /api/agents
   */
  editingAgent?: EditingAgent;
}

type ModelChoice = "opus" | "sonnet" | "haiku" | "inherit";
type PermissionsChoice = "auto" | "plan" | "default" | "bypass";

const MODEL_OPTIONS: { value: ModelChoice; label: string }[] = [
  { value: "inherit", label: "Inherit default" },
  { value: "opus", label: "opus" },
  { value: "sonnet", label: "sonnet" },
  { value: "haiku", label: "haiku" },
];

const PERMISSIONS_OPTIONS: { value: PermissionsChoice; label: string }[] = [
  { value: "default", label: "default" },
  { value: "auto", label: "auto" },
  { value: "plan", label: "plan" },
  { value: "bypass", label: "bypass" },
];

// Must match server-side regex in POST /api/agents.
const NAME_RE = /^[a-z0-9][a-z0-9_-]*$/i;

interface AgentSourceOption {
  path: string;
  scope: "global" | { project: string };
  label?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateAgentDialog({
  open,
  onOpenChange,
  onCreated,
  editingAgent,
}: CreateAgentDialogProps) {
  const { config } = useConfig();
  const addToast = useToastStore((s) => s.addToast);
  const isEdit = !!editingAgent;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState<ModelChoice>("inherit");
  const [permissions, setPermissions] = useState<PermissionsChoice>("default");
  const [icon, setIcon] = useState("");
  const [body, setBody] = useState("");
  const [targetSourcePath, setTargetSourcePath] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const sources = useMemo<AgentSourceOption[]>(() => config?.config.agentSources ?? [], [config]);

  // When editing, prefill on open.
  useEffect(() => {
    if (!open) return;
    if (!editingAgent) return;
    setName(editingAgent.name);
    setDescription(editingAgent.description ?? "");
    setModel(editingAgent.model ?? "inherit");
    setPermissions(editingAgent.permissions ?? "default");
    setIcon(editingAgent.icon ?? "");
    setBody(editingAgent.body ?? "");
    setTargetSourcePath(editingAgent.sourcePath);
  }, [open, editingAgent]);

  // Default target: first global source, else first entry. Skip in edit mode
  // (the editing agent's sourcePath already drives selection).
  useEffect(() => {
    if (!open) return;
    if (editingAgent) return;
    if (sources.length === 0) return;
    if (targetSourcePath && sources.some((s) => s.path === targetSourcePath)) return;
    const firstGlobal = sources.find((s) => s.scope === "global");
    setTargetSourcePath((firstGlobal ?? sources[0]).path);
  }, [open, sources, targetSourcePath, editingAgent]);

  const reset = useCallback(() => {
    setName("");
    setDescription("");
    setModel("inherit");
    setPermissions("default");
    setIcon("");
    setBody("");
    setError(null);
    setSuccessBanner(null);
    setSaving(false);
  }, []);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    // Delay reset so close animation can play
    setTimeout(reset, 200);
  }, [onOpenChange, reset]);

  const nameError: string | null = useMemo(() => {
    if (!name) return null;
    if (!NAME_RE.test(name)) {
      return "Letters, digits, _ and - only; must start with letter or digit.";
    }
    return null;
  }, [name]);

  const canSubmit =
    !!name.trim() && !nameError && !!targetSourcePath && !!description.trim() && !saving;

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const method = isEdit ? "PUT" : "POST";
      const url = isEdit ? `/api/agents/${encodeURIComponent(editingAgent!.id)}` : "/api/agents";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          model,
          permissions,
          icon: icon.trim() || undefined,
          body,
          targetSourcePath,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(
          data.error || `Failed to ${isEdit ? "update" : "create"} agent (${res.status})`,
        );
      }
      const data = (await res.json()) as { path?: string };
      addToast(`Agent "${name.trim()}" ${isEdit ? "updated" : "created"}`, "success");
      setSuccessBanner(
        data.path
          ? `${isEdit ? "Updated" : "Saved to"} ${data.path}`
          : isEdit
            ? "Agent updated"
            : "Agent created",
      );
      onCreated?.();
      // Auto-dismiss + close after 1.5s
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }, [
    isEdit,
    editingAgent,
    name,
    description,
    model,
    permissions,
    icon,
    body,
    targetSourcePath,
    addToast,
    onCreated,
    handleClose,
  ]);

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
      <div className="relative w-full max-w-xl bg-bg-surface border border-border-default rounded-[4px] shadow-modal overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <div className="flex items-center gap-2">
            <UserIcon size={14} className="text-accent" />
            <h2 className="text-xs font-medium text-text-primary">
              {isEdit ? "Edit Agent" : "Create Agent"}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1 text-text-ghost hover:text-text-secondary transition-all"
          >
            <CloseIcon size={12} />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 py-4 space-y-4 max-h-[70vh] overflow-y-auto scrollbar-thin">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-label font-medium text-text-secondary uppercase tracking-wider">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-agent"
              className={cn(
                "w-full px-3 py-2 text-xs bg-bg-input border rounded-[4px] text-text-primary placeholder:text-text-ghost focus:outline-none transition-all",
                nameError
                  ? "border-error/40 focus:border-error/60"
                  : "border-border-default focus:border-[#f59e0b]/40",
              )}
              autoFocus
            />
            {nameError ? (
              <p className="text-2xs text-error">{nameError}</p>
            ) : name ? (
              <p className="text-2xs text-text-ghost">File: {name}.md</p>
            ) : (
              <p className="text-2xs text-text-ghost">
                Filename-safe: letters, digits, underscore, hyphen.
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-label font-medium text-text-secondary uppercase tracking-wider">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this agent for? (markdown allowed)"
              rows={2}
              className="w-full px-3 py-2 text-xs bg-bg-input border border-border-default rounded-[4px] text-text-primary placeholder:text-text-ghost focus:outline-none focus:border-[#f59e0b]/40 transition-all resize-none"
            />
          </div>

          {/* Model + Permissions + Icon (grid row) */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-label font-medium text-text-secondary uppercase tracking-wider">
                Model
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as ModelChoice)}
                className="w-full px-2 py-2 text-xs bg-bg-input border border-border-default rounded-[4px] text-text-primary focus:outline-none focus:border-[#f59e0b]/40 transition-all"
              >
                {MODEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-label font-medium text-text-secondary uppercase tracking-wider">
                Permissions
              </label>
              <select
                value={permissions}
                onChange={(e) => setPermissions(e.target.value as PermissionsChoice)}
                className="w-full px-2 py-2 text-xs bg-bg-input border border-border-default rounded-[4px] text-text-primary focus:outline-none focus:border-[#f59e0b]/40 transition-all"
              >
                {PERMISSIONS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-label font-medium text-text-secondary uppercase tracking-wider">
                Icon (optional)
              </label>
              <input
                type="text"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="🛠"
                maxLength={4}
                className="w-full px-2 py-2 text-xs bg-bg-input border border-border-default rounded-[4px] text-text-primary placeholder:text-text-ghost focus:outline-none focus:border-[#f59e0b]/40 transition-all"
              />
            </div>
          </div>

          {/* Save target — radio group populated from config.agentSources */}
          <div className="space-y-1.5">
            <label className="text-label font-medium text-text-secondary uppercase tracking-wider">
              Save to
            </label>
            {sources.length === 0 ? (
              <p className="text-2xs text-text-ghost">
                No agent sources configured. Add one in Settings &rarr; Projects.
              </p>
            ) : (
              <div className="space-y-1">
                {sources.map((src) => {
                  const isSelected = targetSourcePath === src.path;
                  const scopeHint =
                    src.scope === "global" ? "User agents" : (src.label ?? "Project agents");
                  return (
                    <label
                      key={src.path}
                      className={cn(
                        "flex items-start gap-2 px-2.5 py-2 rounded-[4px] cursor-pointer border transition-all",
                        isSelected
                          ? "bg-accent/10 border-accent/30"
                          : "bg-bg-input border-border-default hover:border-border-subtle",
                      )}
                    >
                      <input
                        type="radio"
                        name="agent-target-source"
                        value={src.path}
                        checked={isSelected}
                        onChange={() => setTargetSourcePath(src.path)}
                        className="mt-0.5 accent-accent"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-text-primary">{scopeHint}</span>
                          {src.scope === "global" && (
                            <span className="text-2xs px-1 py-0.5 rounded bg-bg-elevated text-text-tertiary">
                              global
                            </span>
                          )}
                        </div>
                        <p className="text-2xs text-text-ghost font-mono truncate">{src.path}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Body */}
          <div className="space-y-1.5">
            <label className="text-label font-medium text-text-secondary uppercase tracking-wider">
              Body (markdown)
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={"# My Agent\n\nYou are..."}
              rows={10}
              spellCheck={false}
              className="w-full px-3 py-2 text-xs font-mono bg-bg-input border border-border-default rounded-[4px] text-text-primary placeholder:text-text-ghost focus:outline-none focus:border-[#f59e0b]/40 transition-all resize-none leading-relaxed"
            />
          </div>

          {error && (
            <p className="text-xs text-error bg-error/10 border border-error/30 rounded-[4px] px-3 py-2">
              {error}
            </p>
          )}
          {successBanner && (
            <p className="text-xs text-accent bg-accent/10 border border-accent/30 rounded-[4px] px-3 py-2 flex items-center gap-2">
              <CheckIcon size={12} />
              {successBanner}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border-default">
          <button
            onClick={handleClose}
            className="px-3 py-1.5 text-xs font-medium rounded-[4px] text-text-secondary hover:text-text-primary transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={!canSubmit}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-[4px] transition-all",
              canSubmit
                ? "bg-accent text-bg-base hover:bg-accent/90"
                : "bg-bg-elevated text-text-ghost cursor-not-allowed",
            )}
          >
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Agent"}
          </button>
        </div>
      </div>
    </div>
  );
}
