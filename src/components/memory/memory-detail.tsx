"use client";

import { useCallback } from "react";
import { MemoryIcon, EditIcon, TrashIcon, ChevronRightIcon, UserIcon, ArrowLeftIcon, CopyIcon } from "@/components/ui/icons";
import { useMemoryStore } from "@/stores/memory";
import { useToastStore } from "@/stores/toast";
import { cn } from "@/lib/utils";

function categoryColor(cat: string): string {
  switch (cat) {
    case "learnings": return "bg-rooms/20 text-rooms";
    case "corrections": return "bg-error/20 text-error";
    case "decisions": return "bg-memory/20 text-memory";
    case "human-inputs": return "bg-sprints/20 text-sprints";
    case "knowledge": return "bg-sessions/20 text-sessions";
    default: return "bg-border-default text-text-ghost";
  }
}

export function MemoryDetail() {
  const selectedEntry = useMemoryStore((s) => s.selectedEntry);
  const selectedDetail = useMemoryStore((s) => s.selectedDetail);
  const detailLoading = useMemoryStore((s) => s.detailLoading);
  const openEditDialog = useMemoryStore((s) => s.openEditDialog);
  const openDeleteDialog = useMemoryStore((s) => s.openDeleteDialog);
  const selectEntry = useMemoryStore((s) => s.selectEntry);
  const updateEntry = useMemoryStore((s) => s.updateEntry);
  const addToast = useToastStore((s) => s.addToast);

  const handleExport = useCallback(() => {
    if (!selectedEntry || !selectedDetail) return;
    const lines: string[] = [
      `# ${selectedEntry.title}`,
      "",
      `> ${selectedEntry.key_point}`,
      "",
      `**Category:** ${selectedEntry.category}`,
      `**Agent:** ${selectedEntry.agent_type}`,
      selectedDetail.created_at ? `**Created:** ${new Date(selectedDetail.created_at).toLocaleString()}` : "",
      selectedDetail.created_by ? `**By:** ${selectedDetail.created_by}` : "",
      "",
      `**Tags:** ${selectedEntry.tags.join(", ")}`,
      "",
    ].filter(Boolean);

    if (selectedDetail.content) {
      for (const [key, value] of Object.entries(selectedDetail.content)) {
        const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ");
        lines.push(`## ${label}`, "", String(value), "");
      }
    }

    const markdown = lines.join("\n");
    void navigator.clipboard.writeText(markdown).then(() => {
      addToast("Copied as Markdown", "success");
    });
  }, [selectedEntry, selectedDetail, addToast]);

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
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
        <div className="w-12 h-12 rounded bg-bg-elevated flex items-center justify-center">
          <MemoryIcon size={20} className="text-text-ghost" />
        </div>
        <p className="text-xs text-text-secondary font-medium">No memory selected</p>
        <p className="text-xs text-text-tertiary max-w-[200px]">
          Select a memory from the list to view its full details
        </p>
      </div>
    );
  }

  if (detailLoading) {
    return (
      <div className="p-3 space-y-3 animate-pulse">
        <div className="flex items-start gap-3">
          <div className="skeleton h-5 w-5 rounded shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-4 w-3/4" />
            <div className="skeleton h-3 w-1/2" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="skeleton h-5 w-16 rounded-full" />
          <div className="skeleton h-3 w-20" />
        </div>
        <div className="flex items-center gap-1.5">
          <div className="skeleton h-5 w-12 rounded" />
          <div className="skeleton h-5 w-14 rounded" />
          <div className="skeleton h-5 w-10 rounded" />
        </div>
        <div className="space-y-2 pt-1">
          <div className="skeleton h-20 w-full rounded" />
          <div className="skeleton h-16 w-full rounded" />
        </div>
      </div>
    );
  }

  const detail = selectedDetail;

  return (
    <div className="p-3 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        {/* UX #10: Back navigation */}
        <button
          onClick={() => selectEntry(null)}
          className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-elevated transition-all shrink-0 mt-0.5"
          title="Back to list"
        >
          <ArrowLeftIcon size={14} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-title-md font-semibold text-text-primary tracking-[-0.3px] leading-snug">
            {selectedEntry.title}
          </h2>
          <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">
            {selectedEntry.key_point}
          </p>
        </div>
        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleExport}
            className="flex items-center gap-1 px-2 py-1 text-label font-medium text-text-secondary bg-bg-elevated hover:bg-bg-elevated/80 rounded active:scale-[0.98] transition-all"
            title="Copy as Markdown"
          >
            <CopyIcon size={12} />
            Export
          </button>
          <button
            onClick={() => openEditDialog(selectedEntry)}
            className="flex items-center gap-1 px-2 py-1 text-label font-medium text-text-secondary bg-bg-elevated hover:bg-bg-elevated/80 rounded active:scale-[0.98] transition-all"
          >
            <EditIcon size={12} />
            Edit
          </button>
          <button
            onClick={() => void handlePin()}
            className={cn(
              "flex items-center gap-1 px-2 py-1 text-label font-medium rounded active:scale-[0.98] transition-all",
              selectedEntry.pinned
                ? "text-sprints bg-sprints/10 hover:bg-sprints/20"
                : "text-text-secondary bg-bg-elevated hover:bg-bg-elevated/80",
            )}
          >
            {selectedEntry.pinned ? "Unpin" : "Pin"}
          </button>
          <button
            onClick={() => openDeleteDialog(selectedEntry)}
            className="flex items-center gap-1 px-2 py-1 text-label font-medium text-error bg-error/10 hover:bg-error/20 rounded active:scale-[0.98] transition-all"
          >
            <TrashIcon size={12} />
            Delete
          </button>
        </div>
      </div>

      {/* Meta info */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className={cn("text-label px-2 py-0.5 rounded-full font-medium", categoryColor(selectedEntry.category))}>
          {selectedEntry.category}
        </span>
        <span className="text-label text-text-ghost flex items-center gap-1">
          <UserIcon size={12} />
          {selectedEntry.agent_type}
        </span>
        {detail?.created_at && (
          <span className="text-label text-text-ghost">
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
          <span className="text-label text-text-ghost">
            by {detail.created_by}
          </span>
        )}
      </div>

      {/* Tags */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {selectedEntry.tags.map((tag) => (
          <span key={tag} className="text-label px-1.5 py-0.5 bg-bg-elevated text-text-secondary rounded">
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
        <div className="flex items-center gap-2 text-label text-memory bg-memory/5 border border-memory/20 px-3 py-2 rounded">
          <ChevronRightIcon size={12} />
          <span>Superseded by: <span className="font-mono">{detail.superseded_by}</span></span>
        </div>
      )}

      {/* Supersedes info */}
      {detail?.supersedes && (
        <div className="flex items-center gap-2 text-label text-text-ghost bg-bg-elevated px-3 py-2 rounded">
          <ChevronRightIcon size={12} />
          <span>Supersedes: <span className="font-mono">{detail.supersedes}</span></span>
        </div>
      )}

      {/* File path */}
      <div className="flex items-center gap-2 text-label text-text-ghost pt-2 border-t border-border-default">
        <MemoryIcon size={12} />
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
        "rounded border px-3 py-2.5",
        accent
          ? "border-memory/30 bg-memory/5"
          : "border-border-default bg-bg-base",
      )}
    >
      <p className={cn("text-label font-medium mb-1", accent ? "text-memory" : "text-text-ghost")}>
        {title}
      </p>
      <p className="text-xs text-text-primary leading-relaxed whitespace-pre-wrap">
        {value}
      </p>
    </div>
  );
}
