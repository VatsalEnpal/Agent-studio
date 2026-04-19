"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CloseIcon, CheckIcon, UserIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { useConfig } from "@/hooks/use-config";
import { useToastStore } from "@/stores/toast";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BrowseTemplatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful import (0 imported still counts as success). */
  onImported?: () => void;
}

interface Template {
  filename: string;
  name: string;
  description: string;
  model?: string;
}

interface AgentSourceOption {
  path: string;
  scope: "global" | { project: string };
  label?: string;
}

interface ImportResponse {
  ok: boolean;
  imported: string[];
  skipped: string[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BrowseTemplatesDialog({
  open,
  onOpenChange,
  onImported,
}: BrowseTemplatesDialogProps) {
  const { config } = useConfig();
  const addToast = useToastStore((s) => s.addToast);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetSourcePath, setTargetSourcePath] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const sources = useMemo<AgentSourceOption[]>(() => config?.config.agentSources ?? [], [config]);

  // Default target: first global source, else first entry.
  useEffect(() => {
    if (!open) return;
    if (sources.length === 0) return;
    if (targetSourcePath && sources.some((s) => s.path === targetSourcePath)) return;
    const firstGlobal = sources.find((s) => s.scope === "global");
    setTargetSourcePath((firstGlobal ?? sources[0]).path);
  }, [open, sources, targetSourcePath]);

  // Fetch templates on open
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetch("/api/agents/templates", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load templates (${res.status})`);
        return (await res.json()) as Template[];
      })
      .then((data) => {
        if (cancelled) return;
        setTemplates(Array.isArray(data) ? data : []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Unknown error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const reset = useCallback(() => {
    setSelected(new Set());
    setImportError(null);
    setSuccessBanner(null);
    setImporting(false);
  }, []);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    // Delay reset so close animation can play
    setTimeout(reset, 200);
  }, [onOpenChange, reset]);

  const toggleSelected = useCallback((filename: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  }, []);

  const selectedCount = selected.size;
  const canImport = selectedCount > 0 && !!targetSourcePath && !importing;

  const handleImport = useCallback(async () => {
    setImporting(true);
    setImportError(null);
    try {
      const res = await fetch("/api/agents/templates/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filenames: Array.from(selected),
          targetSourcePath,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Import failed (${res.status})`);
      }
      const data = (await res.json()) as ImportResponse;
      const importedCount = data.imported?.length ?? 0;
      const skippedCount = data.skipped?.length ?? 0;
      addToast(`Imported ${importedCount} template${importedCount === 1 ? "" : "s"}`, "success");
      setSuccessBanner(
        skippedCount > 0
          ? `Imported ${importedCount}, skipped ${skippedCount} (already exist).`
          : `Imported ${importedCount}.`,
      );
      onImported?.();
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setImporting(false);
    }
  }, [selected, targetSourcePath, addToast, onImported, handleClose]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
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
      <div className="relative w-full max-w-2xl bg-bg-surface border border-border-default rounded-[4px] shadow-modal overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <div className="flex items-center gap-2">
            <UserIcon size={14} className="text-accent" />
            <h2 className="text-xs font-medium text-text-primary">Browse Templates</h2>
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
          <p className="text-2xs text-text-tertiary">
            Pick templates to copy into one of your configured agent sources. Nothing is copied
            until you click <span className="text-text-secondary font-medium">Import</span>.
            Existing files with the same name are never overwritten.
          </p>

          {/* Template list */}
          <div className="space-y-1.5">
            <label className="text-label font-medium text-text-secondary uppercase tracking-wider">
              Templates
            </label>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 py-1">
                    <div className="skeleton h-3 w-3" />
                    <div className="skeleton h-3 w-24" />
                    <div className="skeleton h-3 w-40" />
                  </div>
                ))}
              </div>
            ) : loadError ? (
              <p className="text-xs text-error bg-error/10 border border-error/30 rounded-[4px] px-3 py-2">
                {loadError}
              </p>
            ) : templates.length === 0 ? (
              <p className="text-xs text-text-tertiary py-4 text-center">No templates found.</p>
            ) : (
              <div className="border border-border-default rounded-[4px] divide-y divide-border-default max-h-[320px] overflow-y-auto scrollbar-thin">
                {templates.map((t) => {
                  const isChecked = selected.has(t.filename);
                  return (
                    <label
                      key={t.filename}
                      className={cn(
                        "flex items-start gap-2.5 px-3 py-2 cursor-pointer transition-all",
                        isChecked ? "bg-accent/10" : "hover:bg-bg-elevated/60",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelected(t.filename)}
                        className="mt-0.5 accent-accent"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-text-primary">{t.name}</span>
                          {t.model && (
                            <span className="text-2xs px-1 py-0.5 rounded bg-bg-elevated text-text-tertiary font-mono">
                              {t.model}
                            </span>
                          )}
                          <span className="text-2xs text-text-ghost font-mono truncate">
                            {t.filename}
                          </span>
                        </div>
                        {t.description && (
                          <p className="text-2xs text-text-secondary mt-0.5 line-clamp-2">
                            {t.description}
                          </p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Destination */}
          <div className="space-y-1.5">
            <label className="text-label font-medium text-text-secondary uppercase tracking-wider">
              Destination
            </label>
            {sources.length === 0 ? (
              <p className="text-2xs text-text-ghost">
                No agent sources configured. Add one in Settings &rarr; Projects.
              </p>
            ) : (
              <select
                value={targetSourcePath}
                onChange={(e) => setTargetSourcePath(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-bg-input border border-border-default rounded-[4px] text-text-primary focus:outline-none focus:border-[#f59e0b]/40 transition-all"
              >
                {sources.map((src) => {
                  const scopeHint = src.scope === "global" ? "Global" : (src.label ?? "Project");
                  return (
                    <option key={src.path} value={src.path}>
                      {scopeHint} — {src.path}
                    </option>
                  );
                })}
              </select>
            )}
          </div>

          {importError && (
            <p className="text-xs text-error bg-error/10 border border-error/30 rounded-[4px] px-3 py-2">
              {importError}
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
            onClick={() => void handleImport()}
            disabled={!canImport}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-[4px] transition-all",
              canImport
                ? "bg-accent text-bg-base hover:bg-accent/90"
                : "bg-bg-elevated text-text-ghost cursor-not-allowed",
            )}
          >
            {importing
              ? "Importing..."
              : selectedCount > 0
                ? `Import selected (${selectedCount})`
                : "Import selected"}
          </button>
        </div>
      </div>
    </div>
  );
}
