"use client";

import { useCallback } from "react";
import { Tag, Calendar, User, FileText, ArrowRight, Brain, PushPin, PencilSimple, Trash } from "@phosphor-icons/react";
import { useMemoryStore } from "@/stores/memory";
import { useToastStore } from "@/stores/toast";
import { cn } from "@/lib/utils";

function categoryColor(cat: string): string {
  switch (cat) {
    case "learnings": return "bg-blue-500/20 text-blue-400";
    case "corrections": return "bg-red-500/20 text-red-400";
    case "decisions": return "bg-purple-500/20 text-purple-400";
    case "human-inputs": return "bg-amber-500/20 text-amber-400";
    case "knowledge": return "bg-emerald-500/20 text-emerald-400";
    default: return "bg-console-border text-console-dim";
  }
}

export function MemoryDetail() {
  const selectedEntry = useMemoryStore((s) => s.selectedEntry);
  const selectedDetail = useMemoryStore((s) => s.selectedDetail);
  const detailLoading = useMemoryStore((s) => s.detailLoading);
  const openEditDialog = useMemoryStore((s) => s.openEditDialog);
  const openDeleteDialog = useMemoryStore((s) => s.openDeleteDialog);
  const updateEntry = useMemoryStore((s) => s.updateEntry);
  const addToast = useToastStore((s) => s.addToast);

  const handlePin = useCallback(async () => {
    if (!selectedEntry) return;
    try {
      const res = await fetch(
        `/api/memory/entries/${encodeURIComponent(selectedEntry.file)}/pin`,
        { method: "POST" },
      );
      const data = (await res.json()) as { ok?: boolean; pinned?: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Failed to toggle pin");
      updateEntry(selectedEntry.file, { pinned: data.pinned });
      addToast(data.pinned ? "Memory pinned" : "Memory unpinned", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      addToast(`Pin failed: ${msg}`, "error");
    }
  }, [selectedEntry, updateEntry, addToast]);

  if (!selectedEntry) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-console-dim">
        <Brain className="w-8 h-8" />
        <p className="text-body-sm">Select a memory to view details</p>
      </div>
    );
  }

  if (detailLoading) {
    return (
      <div className="flex items-center justify-center h-full text-console-dim text-xs animate-pulse">
        Loading detail...
      </div>
    );
  }

  const detail = selectedDetail;

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-title-sm text-console-text leading-snug">
            {selectedEntry.title}
          </h2>
          <p className="text-body-sm text-console-muted mt-1 leading-relaxed">
            {selectedEntry.key_point}
          </p>
        </div>
        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => openEditDialog(selectedEntry)}
            className="flex items-center gap-1 px-2 py-1 text-label-xs font-medium text-console-muted bg-console-faint hover:bg-console-faint/80 rounded transition-colors"
          >
            <PencilSimple className="w-3 h-3" />
            Edit
          </button>
          <button
            onClick={() => void handlePin()}
            className={cn(
              "flex items-center gap-1 px-2 py-1 text-label-xs font-medium rounded transition-colors",
              selectedEntry.pinned
                ? "text-amber-400 bg-amber-500/10 hover:bg-amber-500/20"
                : "text-console-muted bg-console-faint hover:bg-console-faint/80",
            )}
          >
            <PushPin className="w-3 h-3" />
            {selectedEntry.pinned ? "Unpin" : "Pin"}
          </button>
          <button
            onClick={() => openDeleteDialog(selectedEntry)}
            className="flex items-center gap-1 px-2 py-1 text-label-xs font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded transition-colors"
          >
            <Trash className="w-3 h-3" />
            Delete
          </button>
        </div>
      </div>

      {/* Meta info */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className={cn("text-label-xs px-2 py-0.5 rounded-full font-medium", categoryColor(selectedEntry.category))}>
          {selectedEntry.category}
        </span>
        <span className="text-label-xs text-console-dim flex items-center gap-1">
          <User className="w-3 h-3" />
          {selectedEntry.agent_type}
        </span>
        {detail?.created_at && (
          <span className="text-label-xs text-console-dim flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {new Date(detail.created_at).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
        {detail?.created_by && (
          <span className="text-label-xs text-console-dim">
            by {detail.created_by}
          </span>
        )}
      </div>

      {/* Tags */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Tag className="w-3 h-3 text-console-dim shrink-0" />
        {selectedEntry.tags.map((tag) => (
          <span key={tag} className="text-label-xs px-1.5 py-0.5 bg-console-faint text-console-muted rounded">
            {tag}
          </span>
        ))}
      </div>

      {/* Content sections */}
      {detail?.content && (
        <div className="space-y-3">
          {detail.content.observation && (
            <ContentSection title="Observation" value={detail.content.observation as string} />
          )}
          {detail.content.action && (
            <ContentSection title="Action" value={detail.content.action as string} />
          )}
          {detail.content.outcome && (
            <ContentSection title="Outcome" value={detail.content.outcome as string} />
          )}
          {detail.content.lesson && (
            <ContentSection title="Lesson" value={detail.content.lesson as string} accent />
          )}
          {/* Render any extra fields */}
          {Object.entries(detail.content)
            .filter(([k]) => !["observation", "action", "outcome", "lesson"].includes(k))
            .map(([key, value]) => (
              <ContentSection
                key={key}
                title={key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ")}
                value={typeof value === "string" ? value : JSON.stringify(value, null, 2)}
              />
            ))}
        </div>
      )}

      {/* Superseded by info */}
      {detail?.superseded_by && (
        <div className="flex items-center gap-2 text-label-xs text-console-accent bg-console-accent/5 border border-console-accent/20 px-3 py-2 rounded">
          <ArrowRight className="w-3 h-3" />
          <span>Superseded by: <span className="font-mono">{detail.superseded_by}</span></span>
        </div>
      )}

      {/* Supersedes info */}
      {detail?.supersedes && (
        <div className="flex items-center gap-2 text-label-xs text-console-dim bg-console-faint px-3 py-2 rounded">
          <ArrowRight className="w-3 h-3" />
          <span>Supersedes: <span className="font-mono">{detail.supersedes}</span></span>
        </div>
      )}

      {/* File path */}
      <div className="flex items-center gap-2 text-label-xs text-console-dim pt-2 border-t border-console-border">
        <FileText className="w-3 h-3" />
        <span className="font-mono truncate">{selectedEntry.file}</span>
      </div>
    </div>
  );
}

function ContentSection({
  title,
  value,
  accent,
}: {
  title: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2.5",
        accent
          ? "border-console-accent/30 bg-console-accent/5"
          : "border-console-border bg-console-bg",
      )}
    >
      <p className={cn("text-label-xs font-medium mb-1", accent ? "text-console-accent" : "text-console-dim")}>
        {title}
      </p>
      <p className="text-body-sm text-console-text leading-relaxed whitespace-pre-wrap">
        {value}
      </p>
    </div>
  );
}
