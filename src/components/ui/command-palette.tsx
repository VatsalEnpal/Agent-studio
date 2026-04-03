"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Search,
  Terminal,
  MessageCircle,
  Play,
  Brain,
  Plus,
  ArrowRight,
  CheckCircle,
  type LucideIcon,
} from "lucide-react";
import { useUIStore } from "@/stores/ui";
import { cn } from "@/lib/utils";

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
  icon: LucideIcon;
  keywords?: string[];
  onSelect: () => void;
  /** Recently used timestamp — higher = more recent */
  recentTs?: number;
}

interface CommandGroup {
  category: CommandCategory;
  label: string;
  icon: LucideIcon;
  items: CommandItem[];
}

// ---------------------------------------------------------------------------
// Category metadata
// ---------------------------------------------------------------------------

const categoryMeta: Record<
  CommandCategory,
  { label: string; icon: LucideIcon }
> = {
  sessions: { label: "Sessions", icon: Terminal },
  rooms: { label: "Rooms", icon: MessageCircle },
  sprints: { label: "Sprints", icon: Play },
  memory: { label: "Memory", icon: Brain },
  actions: { label: "Actions", icon: ArrowRight },
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
        icon: Plus,
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
        icon: Plus,
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
        icon: Terminal,
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
        icon: MessageCircle,
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
        icon: Brain,
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
          "w-[600px] max-w-[calc(100vw-32px)]",
          "max-h-[400px] flex flex-col",
          "rounded-xl border border-border",
          "glass shadow-modal",
          "animate-cmd-palette-in",
        )}
        onClick={handleContentClick}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded="true"
        aria-haspopup="listbox"
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle">
          <Search
            className="size-5 text-text-tertiary shrink-0"
            strokeWidth={1.75}
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
              "text-[16px] text-text-emphasis placeholder:text-text-tertiary",
            )}
            aria-label="Command palette search"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd
            className={cn(
              "hidden sm:inline-flex items-center",
              "px-1.5 py-0.5 rounded",
              "text-label-xs text-text-tertiary",
              "bg-surface-hover border border-border-subtle",
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
            <div className="px-4 py-8 text-center text-body-sm text-text-tertiary">
              No results found
            </div>
          ) : (
            groups.map((group) => {
              const GroupIcon = group.icon;
              return (
                <div key={group.category}>
                  {/* Category header */}
                  <div className="flex items-center gap-2 px-4 py-1.5">
                    <GroupIcon
                      className="size-3 text-text-tertiary"
                      strokeWidth={2}
                    />
                    <span className="text-label-xs text-text-tertiary uppercase tracking-wider">
                      {group.label}
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
                          "flex items-center gap-3 w-full px-4 py-2",
                          "text-left text-body-sm",
                          "transition-colors duration-[var(--duration-instant)]",
                          isSelected
                            ? "bg-accent-subtle text-text-emphasis"
                            : "text-text-primary hover:bg-surface-hover",
                        )}
                      >
                        <ItemIcon
                          className={cn(
                            "size-4 shrink-0",
                            isSelected
                              ? "text-accent"
                              : "text-text-secondary",
                          )}
                          strokeWidth={1.75}
                        />
                        <span className="flex-1 truncate">{item.label}</span>
                        {isSelected && (
                          <span className="text-label-xs text-text-tertiary">
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
