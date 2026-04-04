"use client";

import { useEffect, useMemo, useCallback } from "react";
import { MagnifyingGlass, Calendar, Brain, Plus, PushPin, PencilSimple, Trash, Gear } from "@phosphor-icons/react";
import { useMemoryStore, type MemoryEntry, type MemoryEntryDetail } from "@/stores/memory";
import { useToastStore } from "@/stores/toast";
import { useUIStore } from "@/stores/ui";
import { cn } from "@/lib/utils";
import { MemoryDetail } from "./memory-detail";
import { MemoryFormDialog } from "./memory-form-dialog";
import { MemoryDeleteDialog } from "./memory-delete-dialog";

const CATEGORIES = [
  "All",
  "learnings",
  "corrections",
  "decisions",
  "human-inputs",
  "knowledge",
] as const;

function categoryLabel(cat: string): string {
  switch (cat) {
    case "learnings": return "Learnings";
    case "corrections": return "Corrections";
    case "decisions": return "Decisions";
    case "human-inputs": return "Human Inputs";
    case "knowledge": return "Knowledge";
    default: return cat;
  }
}

function categoryColor(cat: string): string {
  switch (cat) {
    case "learnings": return "bg-blue-500/20 text-blue-400";
    case "corrections": return "bg-red-500/20 text-red-400";
    case "decisions": return "bg-purple-500/20 text-purple-400";
    case "human-inputs": return "bg-amber-500/20 text-amber-400";
    case "knowledge": return "bg-emerald-500/20 text-emerald-400";
    default: return "bg-border text-text-tertiary";
  }
}

function extractDate(filePath: string): string {
  const match = filePath.match(/(\d{8})_(\d{6})/);
  if (!match) return "";
  const [, date] = match;
  return `${date.slice(6, 8)}.${date.slice(4, 6)}.${date.slice(0, 4)}`;
}

export function MemoryView() {
  const entries = useMemoryStore((s) => s.entries);
  const search = useMemoryStore((s) => s.search);
  const selectedCategory = useMemoryStore((s) => s.selectedCategory);
  const showPinnedOnly = useMemoryStore((s) => s.showPinnedOnly);
  const selectedEntry = useMemoryStore((s) => s.selectedEntry);
  const loading = useMemoryStore((s) => s.loading);
  const setEntries = useMemoryStore((s) => s.setEntries);
  const setSearch = useMemoryStore((s) => s.setSearch);
  const setCategory = useMemoryStore((s) => s.setCategory);
  const setShowPinnedOnly = useMemoryStore((s) => s.setShowPinnedOnly);
  const selectEntry = useMemoryStore((s) => s.selectEntry);
  const setLoading = useMemoryStore((s) => s.setLoading);
  const setSelectedDetail = useMemoryStore((s) => s.setSelectedDetail);
  const setDetailLoading = useMemoryStore((s) => s.setDetailLoading);
  const openCreateDialog = useMemoryStore((s) => s.openCreateDialog);

  // Load entries on mount
  useEffect(() => {
    setLoading(true);
    fetch("/api/memory/entries")
      .then((r) => r.json())
      .then((data: { entries: MemoryEntry[]; total: number }) => {
        setEntries(data.entries ?? []);
      })
      .catch(() => {
        setEntries([]);
      })
      .finally(() => setLoading(false));
  }, [setEntries, setLoading]);

  // Load detail when entry is selected
  const loadDetail = useCallback(
    (entry: MemoryEntry) => {
      selectEntry(entry);
      setDetailLoading(true);
      fetch(`/api/memory/entry?file=${encodeURIComponent(entry.file)}`)
        .then((r) => r.json())
        .then((data: MemoryEntryDetail) => {
          setSelectedDetail(data);
        })
        .catch(() => {
          setSelectedDetail(null);
        })
        .finally(() => setDetailLoading(false));
    },
    [selectEntry, setSelectedDetail, setDetailLoading],
  );

  // Filter entries
  const filtered = useMemo(() => {
    let result = entries.filter((e) => !e.superseded_by);

    if (showPinnedOnly) {
      result = result.filter((e) => e.pinned);
    }

    if (selectedCategory && selectedCategory !== "All") {
      result = result.filter((e) => e.category === selectedCategory);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.key_point.toLowerCase().includes(q) ||
          e.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    // Sort: pinned first, then by filename (date) newest first
    result.sort((a, b) => {
      const aPinned = a.pinned ? 1 : 0;
      const bPinned = b.pinned ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      return b.file.localeCompare(a.file);
    });

    return result;
  }, [entries, search, selectedCategory, showPinnedOnly]);

  // Category counts (excluding superseded)
  const categoryCounts = useMemo(() => {
    const active = entries.filter((e) => !e.superseded_by);
    const counts: Record<string, number> = { All: active.length };
    for (const entry of active) {
      counts[entry.category] = (counts[entry.category] ?? 0) + 1;
    }
    return counts;
  }, [entries]);

  const pinnedCount = useMemo(
    () => entries.filter((e) => !e.superseded_by && e.pinned).length,
    [entries],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Search bar + create button */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <div className="relative flex-1">
          <MagnifyingGlass size={14} weight="light" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search memories by title, content, or tags..."
            className="w-full pl-8 pr-3 py-2 text-body-sm bg-canvas border border-border rounded-md text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors"
          />
        </div>
        <button
          onClick={openCreateDialog}
          className="flex items-center gap-1 px-2.5 py-2 text-label-xs font-medium bg-accent text-canvas rounded-md hover:bg-accent/90 transition-colors shrink-0"
        >
          <Plus size={14} weight="light" />
          New
        </button>
      </div>

      {/* Category pills + Pinned filter */}
      <div className="px-4 py-2 border-b border-border flex items-center gap-1.5 overflow-x-auto">
        {CATEGORIES.map((cat) => {
          const isActive = cat === "All" ? !selectedCategory || selectedCategory === "All" : selectedCategory === cat;
          const count = categoryCounts[cat] ?? 0;
          return (
            <button
              key={cat}
              onClick={() => setCategory(cat === "All" ? null : cat)}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 text-label-xs font-medium rounded-full whitespace-nowrap transition-all",
                isActive
                  ? "bg-accent/20 text-accent border border-accent/30"
                  : "bg-elevation-2 text-text-secondary hover:text-text-primary hover:bg-elevation-2/80 border border-transparent",
              )}
            >
              {cat === "All" ? "All" : categoryLabel(cat)}
              <span className={cn("text-label-xs", isActive ? "text-accent/70" : "text-text-tertiary")}>
                {count}
              </span>
            </button>
          );
        })}
        <div className="w-px h-4 bg-border mx-1" />
        <button
          onClick={() => setShowPinnedOnly(!showPinnedOnly)}
          className={cn(
            "flex items-center gap-1 px-2.5 py-1 text-label-xs font-medium rounded-full whitespace-nowrap transition-all",
            showPinnedOnly
              ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
              : "bg-elevation-2 text-text-secondary hover:text-text-primary hover:bg-elevation-2/80 border border-transparent",
          )}
        >
          <PushPin size={12} weight="light" />
          Pinned
          <span className={cn("text-label-xs", showPinnedOnly ? "text-amber-400/70" : "text-text-tertiary")}>
            {pinnedCount}
          </span>
        </button>
      </div>

      {/* Main content: list + detail */}
      <div className="flex flex-1 min-h-0">
        {/* Entry list */}
        <div className="w-80 border-r border-border overflow-y-auto">
          {loading ? (
            <div className="px-3 py-4 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="space-y-1.5">
                  <div className="skeleton h-3 w-3/4" />
                  <div className="skeleton h-2 w-1/2" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 px-6 text-center">
              <div className="w-10 h-10 rounded-xl bg-elevation-2/50 flex items-center justify-center">
                <Brain size={20} weight="light" className="text-text-tertiary" />
              </div>
              <span className="text-text-secondary text-body-sm font-medium">
                {selectedCategory || showPinnedOnly ? "No memories match this filter" : "No memories yet"}
              </span>
              {!selectedCategory && !showPinnedOnly && (
                <>
                  <p className="text-text-tertiary text-label-xs leading-relaxed max-w-[260px]">
                    Agent memories are stored in <code className="text-text-secondary bg-elevation-2 px-1 py-0.5 rounded text-label-xs">ai-agents/memory/</code> and help your agents learn from past work.
                  </p>
                  <p className="text-text-tertiary text-label-xs leading-relaxed max-w-[260px]">
                    Memories are created automatically when agents complete tasks, or you can create them manually.
                  </p>
                  {entries.length === 0 && (
                    <button
                      onClick={() => useUIStore.getState().setActiveMode("settings")}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-label-xs font-medium text-text-secondary bg-elevation-2 hover:bg-elevation-2/80 rounded border border-border hover:border-text-secondary transition-colors mt-1"
                    >
                      <Gear size={12} weight="light" />
                      Create Agent System
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            filtered.map((entry) => (
              <MemoryListItem
                key={entry.file}
                entry={entry}
                selected={selectedEntry?.file === entry.file}
                onSelect={() => loadDetail(entry)}
              />
            ))
          )}
        </div>

        {/* Detail panel */}
        <div className="flex-1 overflow-y-auto">
          <MemoryDetail />
        </div>
      </div>

      {/* Dialogs */}
      <MemoryFormDialog mode="create" />
      <MemoryFormDialog mode="edit" />
      <MemoryDeleteDialog />
    </div>
  );
}

function MemoryListItem({
  entry,
  selected,
  onSelect,
}: {
  entry: MemoryEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  const date = extractDate(entry.file);
  const openEditDialog = useMemoryStore((s) => s.openEditDialog);
  const openDeleteDialog = useMemoryStore((s) => s.openDeleteDialog);
  const updateEntry = useMemoryStore((s) => s.updateEntry);
  const addToast = useToastStore((s) => s.addToast);

  const handlePin = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        const res = await fetch(`/api/memory/entries/${encodeURIComponent(entry.file)}/pin`, {
          method: "POST",
        });
        const data = await res.json() as { ok?: boolean; pinned?: boolean; error?: string };
        if (!data.ok) throw new Error(data.error ?? "Failed to toggle pin");
        updateEntry(entry.file, { pinned: data.pinned });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        addToast(`Pin failed: ${msg}`, "error");
      }
    },
    [entry.file, updateEntry, addToast],
  );

  const handleEdit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      openEditDialog(entry);
    },
    [entry, openEditDialog],
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      openDeleteDialog(entry);
    },
    [entry, openDeleteDialog],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(); }}
      className={cn(
        "w-full text-left px-3 py-2.5 border-b border-border/50 transition-colors group cursor-pointer",
        selected
          ? "bg-accent/10 border-l-2 border-l-accent"
          : "hover:bg-elevation-2/50 border-l-2 border-l-transparent",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {entry.pinned && <PushPin size={10} weight="fill" className="text-amber-400 shrink-0" />}
            <p className="text-body-sm text-text-primary font-medium leading-snug truncate">
              {entry.title}
            </p>
          </div>
          <p className="text-label-xs text-text-secondary mt-0.5 line-clamp-2 leading-relaxed">
            {entry.key_point}
          </p>
        </div>
        {/* Action buttons — visible on hover */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={handlePin}
            className={cn(
              "p-1 rounded transition-colors",
              entry.pinned
                ? "text-amber-400 hover:text-amber-300"
                : "text-text-tertiary hover:text-text-secondary",
            )}
            title={entry.pinned ? "Unpin" : "Pin"}
          >
            <PushPin size={12} weight="light" />
          </button>
          <button
            onClick={handleEdit}
            className="p-1 text-text-tertiary hover:text-text-secondary rounded transition-colors"
            title="Edit"
          >
            <PencilSimple size={12} weight="light" />
          </button>
          <button
            onClick={handleDelete}
            className="p-1 text-text-tertiary hover:text-error rounded transition-colors"
            title="Delete"
          >
            <Trash size={12} weight="light" />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
        <span className={cn("text-label-xs px-1.5 py-0.5 rounded-full font-medium", categoryColor(entry.category))}>
          {categoryLabel(entry.category)}
        </span>
        {date && (
          <span className="text-label-xs text-text-tertiary flex items-center gap-0.5">
            <Calendar size={12} weight="light" />
            {date}
          </span>
        )}
        {entry.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="text-label-xs text-text-tertiary bg-border px-1 py-0.5 rounded">
            {tag}
          </span>
        ))}
        {entry.tags.length > 3 && (
          <span className="text-label-xs text-text-tertiary">+{entry.tags.length - 3}</span>
        )}
      </div>
    </div>
  );
}
