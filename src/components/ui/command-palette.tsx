"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  SearchIcon,
  SessionsIcon,
  RoomsIcon,
  SprintsIcon,
  MemoryIcon,
  PlusIcon,
  ChevronRightIcon,
} from "@/components/ui/icons";
import { useUIStore } from "@/stores/ui";
import { cn } from "@/lib/utils";

/** Icon component type matching our custom icon API */
type IconComponent = React.ComponentType<{ className?: string; size?: number }>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CommandCategory =
  | "sessions"
  | "rooms"
  | "sprints"
  | "memory"
  | "actions";

export interface CommandItem {
  id: string;
  label: string;
  category: CommandCategory;
  icon: IconComponent;
  keywords?: string[];
  onSelect: () => void;
  /** Recently used timestamp — higher = more recent */
  recentTs?: number;
  /** Keyboard shortcut hint displayed on the right */
  shortcut?: string;
}

interface CommandGroup {
  category: CommandCategory;
  label: string;
  icon: IconComponent;
  colorClass: string;
  items: CommandItem[];
}

// ---------------------------------------------------------------------------
// Category metadata
// ---------------------------------------------------------------------------

const categoryMeta: Record<
  CommandCategory,
  { label: string; icon: IconComponent; colorClass: string }
> = {
  sessions: { label: "Sessions", icon: SessionsIcon, colorClass: "text-sessions" },
  rooms: { label: "Rooms", icon: RoomsIcon, colorClass: "text-rooms" },
  sprints: { label: "Sprints", icon: SprintsIcon, colorClass: "text-sprints" },
  memory: { label: "Memory", icon: MemoryIcon, colorClass: "text-memory" },
  actions: { label: "Actions", icon: ChevronRightIcon, colorClass: "text-text-tertiary" },
};

// ---------------------------------------------------------------------------
// Fuzzy match — simple substring match on label + keywords
// ---------------------------------------------------------------------------

function fuzzyMatch(query: string, item: CommandItem): boolean {
  const q = query.toLowerCase();
  if (item.label.toLowerCase().includes(q)) return true;
  if (item.keywords?.some((kw) => kw.toLowerCase().includes(q))) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Hooks: items provider
// ---------------------------------------------------------------------------

interface CommandPaletteProps {
  /** All searchable items — fed from parent */
  items: CommandItem[];
}

// ---------------------------------------------------------------------------
// Command Palette Component
// ---------------------------------------------------------------------------

export function CommandPalette({ items }: CommandPaletteProps) {
  const open = useUIStore((s) => s.commandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const setActiveMode = useUIStore((s) => s.setActiveMode);

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // -----------------------------------------------------------------------
  // Cmd+K global shortcut
  // -----------------------------------------------------------------------
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, setOpen]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      // Small delay to let animation start
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open]);

  // -----------------------------------------------------------------------
  // Default actions (always available)
  // -----------------------------------------------------------------------
  const defaultActions: CommandItem[] = useMemo(
    () => [
      {
        id: "action-new-session",
        label: "New Session",
        category: "actions" as CommandCategory,
        icon: PlusIcon,
        keywords: ["create", "launch", "start", "terminal"],
        onSelect: () => {
          setOpen(false);
          setActiveMode("sessions");
        },
      },
      {
        id: "action-new-room",
        label: "New Room",
        category: "actions" as CommandCategory,
        icon: PlusIcon,
        keywords: ["create", "team", "chat"],
        onSelect: () => {
          setOpen(false);
          setActiveMode("teams");
        },
      },
      {
        id: "action-go-sessions",
        label: "Go to Sessions",
        category: "actions" as CommandCategory,
        icon: SessionsIcon,
        keywords: ["switch", "navigate", "page"],
        onSelect: () => {
          setOpen(false);
          setActiveMode("sessions");
        },
      },
      {
        id: "action-go-teams",
        label: "Go to Teams",
        category: "actions" as CommandCategory,
        icon: RoomsIcon,
        keywords: ["switch", "navigate", "rooms", "page"],
        onSelect: () => {
          setOpen(false);
          setActiveMode("teams");
        },
      },
      {
        id: "action-go-memory",
        label: "Go to Memory",
        category: "actions" as CommandCategory,
        icon: MemoryIcon,
        keywords: ["switch", "navigate", "knowledge", "page"],
        onSelect: () => {
          setOpen(false);
          setActiveMode("memory");
        },
      },
    ],
    [setOpen, setActiveMode],
  );

  // -----------------------------------------------------------------------
  // All items = external items + default actions
  // -----------------------------------------------------------------------
  const allItems = useMemo(
    () => [...items, ...defaultActions],
    [items, defaultActions],
  );

  // -----------------------------------------------------------------------
  // Filtered + grouped
  // -----------------------------------------------------------------------
  const { groups, flatItems } = useMemo(() => {
    let filtered: CommandItem[];

    if (query.trim() === "") {
      // Show recently used first, then all
      filtered = [...allItems].sort(
        (a, b) => (b.recentTs ?? 0) - (a.recentTs ?? 0),
      );
    } else {
      filtered = allItems.filter((item) => fuzzyMatch(query, item));
    }

    // Group by category
    const groupMap = new Map<CommandCategory, CommandItem[]>();
    for (const item of filtered) {
      const existing = groupMap.get(item.category) ?? [];
      existing.push(item);
      groupMap.set(item.category, existing);
    }

    const categoryOrder: CommandCategory[] = [
      "sessions",
      "rooms",
      "sprints",
      "memory",
      "actions",
    ];

    const groups: CommandGroup[] = [];
    const flatItems: CommandItem[] = [];

    for (const cat of categoryOrder) {
      const catItems = groupMap.get(cat);
      if (catItems && catItems.length > 0) {
        const meta = categoryMeta[cat];
        groups.push({
          category: cat,
          label: meta.label,
          icon: meta.icon,
          colorClass: meta.colorClass,
          items: catItems,
        });
        flatItems.push(...catItems);
      }
    }

    return { groups, flatItems };
  }, [allItems, query]);

  // Clamp selected index when results change
  useEffect(() => {
    setSelectedIndex((prev) =>
      flatItems.length === 0 ? 0 : Math.min(prev, flatItems.length - 1),
    );
  }, [flatItems.length]);

  // -----------------------------------------------------------------------
  // Keyboard navigation
  // -----------------------------------------------------------------------
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < flatItems.length - 1 ? prev + 1 : 0,
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : flatItems.length - 1,
          );
          break;
        case "Enter":
          e.preventDefault();
          if (flatItems[selectedIndex]) {
            flatItems[selectedIndex].onSelect();
          }
          break;
        case "Escape":
          e.preventDefault();
          setOpen(false);
          break;
      }
    },
    [flatItems, selectedIndex, setOpen],
  );

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(
      `[data-cmd-index="${selectedIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // -----------------------------------------------------------------------
  // Close handlers
  // -----------------------------------------------------------------------
  const handleOverlayClick = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  const handleContentClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
    },
    [],
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  if (!open) return null;

  let flatIndex = 0;

  return (
    <div
      className={cn(
        "fixed inset-0 z-commandPalette",
        "flex items-start justify-center pt-[15vh]",
        "bg-black/50 backdrop-blur-sm",
        "animate-fade-in",
      )}
      onClick={handleOverlayClick}
    >
      <div
        className={cn(
          "w-[480px] max-w-[calc(100vw-32px)]",
          "max-h-[360px] flex flex-col",
          "rounded-xl border border-border-subtle",
          "bg-bg-elevated shadow-modal backdrop-blur-xl",
          "animate-cmd-palette-in",
        )}
        onClick={handleContentClick}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded="true"
        aria-haspopup="listbox"
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border-subtle">
          <SearchIcon
            size={14}
            className="text-text-tertiary shrink-0"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a command or search..."
            className={cn(
              "flex-1 bg-transparent border-none outline-none",
              "text-[10px] text-text-primary placeholder:text-text-tertiary",
            )}
            aria-label="Command palette search"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd
            className={cn(
              "hidden sm:inline-flex items-center",
              "px-1.5 py-0.5 rounded",
              "text-label text-text-tertiary",
              "bg-bg-elevated border border-border-subtle",
            )}
          >
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto scrollbar-thin py-2"
          role="listbox"
        >
          {flatItems.length === 0 ? (
            <div className="px-3 py-6 text-center text-[10px] text-text-tertiary">
              No matching commands
            </div>
          ) : (
            groups.map((group) => {
              const GroupIcon = group.icon;
              return (
                <div key={group.category} className="pt-1">
                  {/* Category header */}
                  <div className="flex items-center gap-2 px-4 py-1.5">
                    <GroupIcon
                      size={12}
                      className={group.colorClass}
                    />
                    <span className={cn("text-label uppercase tracking-wider", group.colorClass)}>
                      {group.label}
                    </span>
                    <span className="text-[9px] text-text-ghost ml-auto">
                      {group.items.length}
                    </span>
                  </div>

                  {/* Items */}
                  {group.items.map((item) => {
                    const idx = flatIndex++;
                    const isSelected = idx === selectedIndex;
                    const ItemIcon = item.icon;

                    return (
                      <button
                        key={item.id}
                        data-cmd-index={idx}
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => item.onSelect()}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={cn(
                          "flex items-center gap-2.5 w-full px-3 py-1.5",
                          "text-left text-[10px]",
                          "transition-all duration-[var(--duration-instant)] active:scale-[0.99]",
                          isSelected
                            ? "bg-bg-elevated text-text-primary"
                            : "text-text-secondary hover:bg-bg-elevated/50",
                        )}
                      >
                        <ItemIcon
                          size={14}
                          className={cn(
                            "shrink-0",
                            isSelected
                              ? "text-text-primary"
                              : "text-text-tertiary",
                          )}
                        />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.shortcut && (
                          <kbd className="text-[9px] font-mono text-text-ghost bg-bg-base px-1 py-0.5 rounded border border-border-default shrink-0">
                            {item.shortcut}
                          </kbd>
                        )}
                        {isSelected && !item.shortcut && (
                          <span className="text-label text-text-ghost">
                            Enter
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
