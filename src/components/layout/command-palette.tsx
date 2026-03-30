"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Plus,
  XCircle,
  Users,
  Monitor,
  Brain,
  Search as SearchIcon,
  Zap,
  Terminal,
  Command,
} from "lucide-react";
import { useUIStore } from "@/stores/ui";
import { useSessionsStore } from "@/stores/sessions";
import { cn } from "@/lib/utils";

interface PaletteAction {
  id: string;
  label: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords: string[];
  onSelect: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNewSession: () => void;
  onKillSession: (id: string) => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  onNewSession,
  onKillSession,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const setActiveMode = useUIStore((s) => s.setActiveMode);
  const sessions = useSessionsStore((s) => s.sessions);
  const focusedId = useSessionsStore((s) => s.focusedId);
  const swapIn = useSessionsStore((s) => s.swapIn);
  const [memoryTotal, setMemoryTotal] = useState(0);

  useEffect(() => {
    if (open) {
      void fetch("/api/memory/stats")
        .then((r) => r.json())
        .then((d: { total?: number }) => setMemoryTotal(d.total ?? 0))
        .catch(() => {});
    }
  }, [open]);

  const close = useCallback(() => {
    onOpenChange(false);
    setQuery("");
    setSelectedIndex(0);
  }, [onOpenChange]);

  // Build actions list
  const actions: PaletteAction[] = useMemo(() => {
    const list: PaletteAction[] = [
      {
        id: "new-session",
        label: "New Session",
        description: "Launch a new Claude Code session",
        icon: Plus,
        keywords: ["new", "create", "launch", "start", "session"],
        onSelect: () => {
          close();
          onNewSession();
        },
      },
      {
        id: "kill-focused",
        label: "Kill Focused Session",
        description: focusedId
          ? `Kill ${sessions.find((s) => s.id === focusedId)?.name ?? "session"}`
          : "No session focused",
        icon: XCircle,
        keywords: ["kill", "stop", "end", "terminate", "close"],
        onSelect: () => {
          if (focusedId) {
            close();
            onKillSession(focusedId);
          }
        },
      },
      {
        id: "view-sessions",
        label: "Sessions View",
        description: "Switch to terminal grid",
        icon: Monitor,
        keywords: ["sessions", "terminals", "grid", "view"],
        onSelect: () => {
          close();
          setActiveMode("sessions");
        },
      },
      {
        id: "view-teams",
        label: "Teams / Sprint View",
        description: "Switch to sprint dashboard",
        icon: Users,
        keywords: ["teams", "sprint", "dashboard", "agents"],
        onSelect: () => {
          close();
          setActiveMode("teams");
        },
      },
      {
        id: "view-memory",
        label: "Memory Stats",
        description: `${memoryTotal} entries in memory index`,
        icon: Brain,
        keywords: ["memory", "stats", "knowledge", "learnings"],
        onSelect: () => {
          close();
          setActiveMode("memory");
        },
      },
      {
        id: "pmo-scan",
        label: "Trigger PMO Scan",
        description: "Start a PMO scan to check for ready tickets",
        icon: Zap,
        keywords: ["scan", "pmo", "tickets", "notion", "ready"],
        onSelect: () => {
          close();
          void fetch("/api/pmo/scan", { method: "POST" });
        },
      },
    ];

    // Add session-switching actions
    for (const session of sessions) {
      list.push({
        id: `focus-${session.id}`,
        label: session.name,
        description: `Focus ${session.name} (${session.status})`,
        icon: Terminal,
        keywords: [
          session.name.toLowerCase(),
          session.status,
          session.meta?.agent ?? "",
          session.meta?.model ?? "",
        ],
        onSelect: () => {
          close();
          swapIn(session.id);
          setActiveMode("sessions");
        },
      });
    }

    return list;
  }, [
    close,
    focusedId,
    sessions,
    memoryTotal,
    onNewSession,
    onKillSession,
    setActiveMode,
    swapIn,
  ]);

  // Filter actions by query
  const filtered = useMemo(() => {
    if (!query.trim()) return actions;
    const q = query.toLowerCase();
    return actions.filter(
      (action) =>
        action.label.toLowerCase().includes(q) ||
        action.keywords.some((kw) => kw.includes(q)),
    );
  }, [actions, query]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll("[data-palette-item]");
    const selected = items[selectedIndex];
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      // Small delay to let Dialog animate in
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].onSelect();
      }
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-[60]" />
        <Dialog.Content
          className="fixed top-[20%] left-1/2 -translate-x-1/2 z-[60] w-[480px] max-h-[60vh] bg-console-panel border border-console-border rounded-lg shadow-2xl overflow-hidden"
          onKeyDown={handleKeyDown}
        >
          <Dialog.Title className="sr-only">Command Palette</Dialog.Title>
          <Dialog.Description className="sr-only">
            Search for actions, sessions, and commands
          </Dialog.Description>

          {/* Search input */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-console-border">
            <Command className="w-4 h-4 text-console-dim shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a command..."
              className="flex-1 bg-transparent text-sm text-console-text placeholder:text-console-dim focus:outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="text-console-dim hover:text-console-muted transition-colors"
              >
                <XCircle className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Results */}
          <div ref={listRef} className="overflow-y-auto max-h-[calc(60vh-52px)] py-1">
            {filtered.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-console-dim text-xs">
                <SearchIcon className="w-4 h-4 mr-2" />
                No matching commands
              </div>
            ) : (
              filtered.map((action, index) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    data-palette-item
                    onClick={action.onSelect}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={cn(
                      "flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors",
                      index === selectedIndex
                        ? "bg-console-faint/80 text-console-text"
                        : "text-console-muted hover:bg-console-faint/40",
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0 text-console-dim" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium block truncate">
                        {action.label}
                      </span>
                      {action.description && (
                        <span className="text-[10px] text-console-dim block truncate">
                          {action.description}
                        </span>
                      )}
                    </div>
                    {index === selectedIndex && (
                      <kbd className="text-[9px] px-1 py-0.5 rounded bg-console-border text-console-dim font-mono shrink-0">
                        Enter
                      </kbd>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer hint */}
          <div className="flex items-center gap-4 px-4 py-2 border-t border-console-border text-[9px] text-console-dim">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0 rounded bg-console-border font-mono">
                Up/Down
              </kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0 rounded bg-console-border font-mono">
                Enter
              </kbd>
              select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0 rounded bg-console-border font-mono">
                Esc
              </kbd>
              close
            </span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
