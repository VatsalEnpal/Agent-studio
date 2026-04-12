"use client";

import { useEffect, useMemo, useCallback } from "react";
import { SearchIcon, MemoryIcon, PlusIcon, EditIcon, TrashIcon, SettingsIcon } from "@/components/ui/icons";
import { useMemoryStore, type MemoryEntry, type MemoryEntryDetail } from "@/stores/memory";
import { useToastStore } from "@/stores/toast";
import { useUIStore } from "@/stores/ui";
import { cn } from "@/lib/utils";

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
    default: return "bg-border-default text-text-ghost";
  }
}

function extractDate(filePath: string): string {
  const match = filePath.match(/(\d{8})_(\d{6})/);
  if (!match) return "";
  const [, date] = match;
  return `${date.slice(6, 8)}.${date.slice(4, 6)}.${date.slice(0, 4)}`;
}

interface MemoryListProps {
  onSelectEntry: (entry: MemoryEntry) => void;
}

export function MemoryList({ onSelectEntry }: MemoryListProps) {
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
  const setLoading = useMemoryStore((s) => s.setLoading);
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

  // Filter entries — include superseded separately
  const { filtered, superseded } = useMemo(() => {
    const active = entries.filter((e) => !e.superseded_by);
    const sup = entries.filter((e) => !!e.superseded_by);

    let result = active;

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

    return { filtered: result, superseded: sup };
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
    <div className="flex flex-col h-full overflow-hidden">
      {/* Search bar + create button */}
      <div className="px-3 py-2.5 border-b border-border-default flex items-center gap-2 shrink-0">
        <div className="relative flex-1">
          <SearchIcon size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-ghost" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search memories..."
            className="w-full pl-7 pr-2 py-1.5 text-label bg-bg-input border border-border-default rounded text-text-primary placeholder:text-text-ghost focus:outline-none focus:border-memory transition-all"
          />
        </div>
        <button
          onClick={openCreateDialog}
          className="p-1.5 text-text-ghost hover:text-memory hover:bg-bg-elevated rounded transition-all"
          title="New memory"
        >
          <PlusIcon size={14} />
        </button>
      </div>

      {/* Category pills + Pinned filter */}
      <div className="px-3 py-2 border-b border-border-default flex items-center gap-1 overflow-x-auto shrink-0">
        {CATEGORIES.map((cat) => {
          const isActive = cat === "All" ? !selectedCategory || selectedCategory === "All" : selectedCategory === cat;
          const count = categoryCounts[cat] ?? 0;
          return (
            <button
              key={cat}
              onClick={() => setCategory(cat === "All" ? null : cat)}
              className={cn(
                "flex items-center gap-0.5 px-2 py-0.5 text-label font-medium rounded-full whitespace-nowrap transition-all",
                isActive
                  ? "bg-memory/20 text-memory border border-memory/30"
                  : "bg-bg-elevated text-text-secondary hover:text-text-primary border border-transparent",
              )}
            >
              {cat === "All" ? "All" : categoryLabel(cat)}
              <span className={cn("text-label", isActive ? "text-memory/70" : "text-text-ghost")}>
                {count}
              </span>
            </button>
          );
        })}
        <div className="w-px h-3 bg-border-default mx-0.5" />
        <button
          onClick={() => setShowPinnedOnly(!showPinnedOnly)}
          className={cn(
            "flex items-center gap-0.5 px-2 py-0.5 text-label font-medium rounded-full whitespace-nowrap transition-all",
            showPinnedOnly
              ? "bg-sprints/20 text-sprints border border-sprints/30"
              : "bg-bg-elevated text-text-secondary hover:text-text-primary border border-transparent",
          )}
        >
          {pinnedCount}
        </button>
      </div>

      {/* Entry list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="px-3 py-4 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-1.5">
                <div className="skeleton h-3 w-3/4" />
                <div className="skeleton h-2 w-1/2" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 && superseded.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 px-6 text-center">
            <div className="w-10 h-10 rounded bg-bg-elevated/50 flex items-center justify-center">
              <MemoryIcon size={20} className="text-text-ghost" />
            </div>
            <span className="text-text-secondary text-xs font-medium">
              {selectedCategory || showPinnedOnly
                ? "No memories match this filter"
                : "No memories stored"}
            </span>
            {!selectedCategory && !showPinnedOnly && entries.length === 0 && (
              <button
                onClick={() => useUIStore.getState().setActiveMode("settings")}
                className="flex items-center gap-1.5 px-3 py-1.5 text-label font-medium text-text-secondary bg-bg-elevated hover:bg-bg-elevated/80 rounded border border-border-default hover:border-text-secondary transition-all active:scale-[0.98] mt-1"
              >
                <SettingsIcon size={12} />
                Create Agent System
              </button>
            )}
          </div>
        ) : (
          <>
            {filtered.map((entry) => (
              <MemoryListItem
                key={entry.file}
                entry={entry}
                selected={selectedEntry?.file === entry.file}
                onSelect={() => onSelectEntry(entry)}
              />
            ))}

            {/* Superseded entries */}
            {superseded.length > 0 && !showPinnedOnly && (
              <>
                <div className="px-3 pt-3 pb-1">
                  <span className="text-label text-text-ghost uppercase tracking-[0.06em]">
                    Superseded
                  </span>
                </div>
                {superseded.map((entry) => (
                  <MemoryListItem
                    key={entry.file}
                    entry={entry}
                    selected={selectedEntry?.file === entry.file}
                    onSelect={() => onSelectEntry(entry)}
                    superseded
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MemoryListItem({
  entry,
  selected,
  onSelect,
  superseded,
}: {
  entry: MemoryEntry;
  selected: boolean;
  onSelect: () => void;
  superseded?: boolean;
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
        const res = await fetch(
          `/api/memory/entries/${encodeURIComponent(entry.file)}/pin`,
          { method: "POST" },
        );
        const data = (await res.json()) as { ok?: boolean; pinned?: boolean; error?: string };
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
          : "hover:bg-bg-elevated/50 border-l-2 border-l-transparent",
        superseded && "opacity-50",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {entry.pinned && <span className="text-sprints shrink-0 text-xs font-bold">*</span>}
            <p
              className={cn(
                "text-xs font-medium leading-snug truncate",
                superseded
                  ? "text-text-ghost line-through"
                  : "text-text-primary",
              )}
            >
              {entry.title}
            </p>
          </div>
          <p className="text-label text-text-secondary mt-0.5 line-clamp-2 leading-relaxed">
            {entry.key_point}
          </p>
        </div>
        {/* Action buttons */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={handlePin}
            className={cn(
              "p-1 rounded transition-all",
              entry.pinned
                ? "text-sprints hover:text-sprints/80"
                : "text-text-ghost hover:text-text-secondary",
            )}
            title={entry.pinned ? "Unpin" : "Pin"}
          >
            <span className="text-xs font-bold">*</span>
          </button>
          <button
            onClick={handleEdit}
            className="p-1 text-text-ghost hover:text-text-secondary rounded transition-all"
            title="Edit"
          >
            <EditIcon size={12} />
          </button>
          <button
            onClick={handleDelete}
            className="p-1 text-text-ghost hover:text-error rounded transition-all"
            title="Delete"
          >
            <TrashIcon size={12} />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
        <span className={cn("text-label px-1.5 py-0.5 rounded-full font-medium", categoryColor(entry.category))}>
          {categoryLabel(entry.category)}
        </span>
        {superseded && (
          <span className="text-label px-1.5 py-0.5 rounded-full font-medium bg-border-default text-text-ghost">
            Superseded
          </span>
        )}
        {entry.agent_type && (
          <span className="text-label text-text-ghost bg-border-default px-1 py-0.5 rounded">
            {entry.agent_type}
          </span>
        )}
        {date && (
          <span className="text-label text-text-ghost">
            {date}
          </span>
        )}
      </div>
    </div>
  );
}
