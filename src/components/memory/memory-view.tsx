"use client";

import { useEffect, useMemo, useCallback, useState } from "react";
import { SearchIcon, MemoryIcon, PlusIcon, EditIcon, TrashIcon, SettingsIcon } from "@/components/ui/icons";
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
    case "learnings": return "bg-rooms/20 text-rooms";
    case "corrections": return "bg-error/20 text-error";
    case "decisions": return "bg-memory/20 text-memory";
    case "human-inputs": return "bg-sprints/20 text-sprints";
    case "knowledge": return "bg-sessions/20 text-sessions";
    default: return "bg-border-default text-text-tertiary";
  }
}

function extractDate(filePath: string): string {
  const match = filePath.match(/(\d{8})_(\d{6})/);
  if (!match) return "";
  const [, date] = match;
  return `${date.slice(6, 8)}.${date.slice(4, 6)}.${date.slice(0, 4)}`;
}

export function MemoryView() {
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
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

    // Tag filter (OR: entry must have at least one active tag)
    if (activeTags.size > 0) {
      result = result.filter((e) =>
        e.tags.some((t) => activeTags.has(t)),
      );
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
  }, [entries, search, selectedCategory, showPinnedOnly, activeTags]);

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

  // Top tags with counts
  const tagCounts = useMemo(() => {
    const active = entries.filter((e) => !e.superseded_by);
    const counts: Record<string, number> = {};
    for (const entry of active) {
      for (const tag of entry.tags) {
        counts[tag] = (counts[tag] ?? 0) + 1;
      }
    }
    // Sort by count descending, take top 10
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [entries]);

  const toggleTag = useCallback((tag: string) => {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Search bar + create button */}
      <div className="px-3 py-2 border-b border-border-default flex items-center gap-2">
        <div className="relative flex-1">
          <SearchIcon size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-ghost" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search memories..."
            className="w-full pl-7 pr-2 py-1 text-xs bg-bg-input border border-border-default rounded text-text-primary placeholder:text-text-ghost focus:outline-none focus:border-border-subtle transition-all"
          />
        </div>
        <button
          onClick={openCreateDialog}
          className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-memory text-bg-base rounded hover:bg-memory/90 transition-all shrink-0"
        >
          <PlusIcon size={10} />
          New
        </button>
      </div>

      {/* Category pills + Pinned filter */}
      <div className="px-3 py-1.5 border-b border-border-default flex items-center gap-1 overflow-x-auto">
        {CATEGORIES.map((cat) => {
          const isActive = cat === "All" ? !selectedCategory || selectedCategory === "All" : selectedCategory === cat;
          const count = categoryCounts[cat] ?? 0;
          return (
            <button
              key={cat}
              onClick={() => setCategory(cat === "All" ? null : cat)}
              className={cn(
                "flex items-center gap-0.5 px-2 py-0.5 text-xs font-medium rounded whitespace-nowrap transition-all",
                isActive
                  ? "bg-memory/20 text-memory border border-memory/30"
                  : "bg-bg-elevated text-text-secondary hover:text-text-primary hover:bg-bg-elevated/80 border border-transparent",
              )}
            >
              {cat === "All" ? "All" : categoryLabel(cat)}
              <span className={cn("text-label", isActive ? "text-memory/70" : "text-text-tertiary")}>
                {count}
              </span>
            </button>
          );
        })}
        <div className="w-px h-4 bg-border-default mx-1" />
        <button
          onClick={() => setShowPinnedOnly(!showPinnedOnly)}
          className={cn(
            "flex items-center gap-0.5 px-2 py-0.5 text-xs font-medium rounded whitespace-nowrap transition-all",
            showPinnedOnly
              ? "bg-sprints/20 text-sprints border border-sprints/30"
              : "bg-bg-elevated text-text-secondary hover:text-text-primary hover:bg-bg-elevated/80 border border-transparent",
          )}
        >
          Pinned
          <span className={cn("text-label", showPinnedOnly ? "text-sprints/70" : "text-text-tertiary")}>
            {pinnedCount}
          </span>
        </button>
      </div>

      {/* Tag filter chips */}
      {tagCounts.length > 0 && (
        <div className="px-3 py-1 border-b border-border-default flex items-center gap-1 overflow-x-auto scrollbar-thin">
          <span className="text-2xs text-text-ghost uppercase tracking-wider shrink-0 mr-1">Tags</span>
          {tagCounts.map(([tag, count]) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={cn(
                "flex items-center gap-0.5 px-1.5 py-0.5 text-2xs rounded whitespace-nowrap transition-all",
                activeTags.has(tag)
                  ? "bg-memory/15 text-memory border border-memory/30 font-medium"
                  : "bg-bg-input text-text-ghost hover:text-text-tertiary border border-transparent",
              )}
            >
              {tag}
              <span className={cn("text-[8px]", activeTags.has(tag) ? "text-memory/60" : "text-text-ghost/60")}>
                {count}
              </span>
            </button>
          ))}
          {activeTags.size > 0 && (
            <button
              onClick={() => setActiveTags(new Set())}
              className="text-2xs text-text-ghost hover:text-text-secondary ml-1 shrink-0"
            >
              clear
            </button>
          )}
        </div>
      )}

      {/* Main content: list + detail */}
      <div className="flex flex-1 min-h-0">
        {/* Entry list */}
        <div className="w-80 border-r border-border-default overflow-y-auto scrollbar-thin">
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
              <div className="w-10 h-10 rounded bg-bg-elevated/50 flex items-center justify-center">
                <MemoryIcon size={20} className="text-text-ghost" />
              </div>
              <span className="text-text-secondary text-xs font-medium">
                {selectedCategory || showPinnedOnly ? "No memories match this filter" : "No memories stored"}
              </span>
              {!selectedCategory && !showPinnedOnly && (
                <>
                  <p className="text-text-tertiary text-label leading-relaxed max-w-[260px]">
                    Agent memories are stored in <code className="text-text-secondary bg-bg-elevated px-1 py-0.5 rounded text-label">ai-agents/memory/</code> and help your agents learn from past work.
                  </p>
                  <p className="text-text-tertiary text-label leading-relaxed max-w-[260px]">
                    Memories are created automatically when agents complete tasks, or you can create them manually.
                  </p>
                  {entries.length === 0 && (
                    <button
                      onClick={() => useUIStore.getState().setActiveMode("settings")}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-label font-medium text-text-secondary bg-bg-elevated hover:bg-bg-elevated/80 rounded border border-border-default hover:border-text-secondary transition-all mt-1"
                    >
                      <SettingsIcon size={12} />
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
        <div className="flex-1 overflow-y-auto scrollbar-thin">
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
        "w-full text-left px-3 py-2.5 border-b border-border-subtle/50 transition-all group cursor-pointer",
        selected
          ? "bg-memory/10 border-l-2 border-l-memory"
          : "hover:bg-bg-elevated/50 hover:shadow-[0_0_12px_rgba(167,139,250,0.06)] border-l-2 border-l-transparent",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {entry.pinned && <span className="text-sprints shrink-0 text-xs">*</span>}
            <p className="text-xs text-text-primary font-medium leading-snug truncate">
              {entry.title}
            </p>
          </div>
          <p className="text-label text-text-secondary mt-0.5 line-clamp-2 leading-relaxed">
            {entry.key_point}
          </p>
        </div>
        {/* Action buttons — visible on hover */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={handlePin}
            className={cn(
              "p-1 rounded transition-all",
              entry.pinned
                ? "text-sprints hover:text-sprints/80"
                : "text-text-tertiary hover:text-text-secondary",
            )}
            title={entry.pinned ? "Unpin" : "Pin"}
          >
            <span className="text-xs font-bold">*</span>
          </button>
          <button
            onClick={handleEdit}
            className="p-1 text-text-tertiary hover:text-text-secondary rounded transition-all"
            title="Edit"
          >
            <EditIcon size={12} />
          </button>
          <button
            onClick={handleDelete}
            className="p-1 text-text-tertiary hover:text-error rounded transition-all"
            title="Delete"
          >
            <TrashIcon size={12} />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
        <span className={cn("text-label px-1.5 py-0.5 rounded font-medium", categoryColor(entry.category))}>
          {categoryLabel(entry.category)}
        </span>
        {date && (
          <span className="text-label text-text-tertiary">
            {date}
          </span>
        )}
        {entry.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="text-label text-text-tertiary bg-border-default px-1 py-0.5 rounded">
            {tag}
          </span>
        ))}
        {entry.tags.length > 3 && (
          <span className="text-label text-text-tertiary">+{entry.tags.length - 3}</span>
        )}
      </div>
    </div>
  );
}
