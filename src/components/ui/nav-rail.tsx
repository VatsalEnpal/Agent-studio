"use client";

import { useCallback } from "react";
import {
  SessionsIcon,
  RoomsIcon,
  SprintsIcon,
  MemoryIcon,
  SettingsIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NavPage =
  | "sessions"
  | "teams"
  | "sprints"
  | "knowledge"
  | "settings";

interface NavItem {
  id: NavPage;
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  accent?: string; // pillar accent class
}

interface NavRailProps {
  activePage: NavPage;
  onNavigate: (page: NavPage) => void;
  /** Badge counts keyed by page id */
  badges?: Partial<Record<NavPage, number>>;
}

// ---------------------------------------------------------------------------
// Pillar accent color map
// ---------------------------------------------------------------------------

const pillarAccent: Record<string, string> = {
  sessions: "text-sessions",
  teams: "text-rooms",
  sprints: "text-sprints",
  knowledge: "text-memory",
};

/** Accent-colored dot backgrounds for unread indicators */
const accentDot: Record<string, string> = {
  sessions: "bg-sessions",
  teams: "bg-rooms",
  sprints: "bg-sprints",
  knowledge: "bg-memory",
};

// ---------------------------------------------------------------------------
// Static data — section icons (settings is separate, pinned to bottom)
// ---------------------------------------------------------------------------

const sectionItems: Omit<NavItem, "badge">[] = [
  { id: "sessions", label: "Sessions", icon: SessionsIcon, accent: "sessions" },
  { id: "teams", label: "Teams", icon: RoomsIcon, accent: "teams" },
  { id: "sprints", label: "Sprints", icon: SprintsIcon, accent: "sprints" },
  { id: "knowledge", label: "Knowledge", icon: MemoryIcon, accent: "knowledge" },
];

/** Keyboard shortcut hints for nav tooltips */
const navShortcuts: Record<NavPage, string> = {
  sessions: "\u2318 1",
  teams: "\u2318 2",
  sprints: "\u2318 3",
  knowledge: "\u2318 4",
  settings: "\u2318 ,",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NavRail({ activePage, onNavigate, badges }: NavRailProps) {
  return (
    <nav
      className={cn(
        "flex flex-col items-center py-3 shrink-0",
        "w-[46px] h-full",
        "bg-bg-base border-r border-border-default",
        "z-sidebar",
      )}
      aria-label="Main navigation"
    >
      {/* Logo mark */}
      <div
        className={cn(
          "flex items-center justify-center",
          "w-8 h-8 rounded-[7px]",
          "bg-bg-elevated",
          "text-text-primary font-bold text-xs",
          "mb-3.5 select-none",
        )}
        style={{
          backgroundImage:
            "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, transparent 100%)",
        }}
      >
        A
      </div>

      {/* Section icons */}
      <div className="flex flex-col items-center gap-1">
        {sectionItems.map((item) => (
          <NavRailItem
            key={item.id}
            item={item}
            isActive={activePage === item.id}
            badge={badges?.[item.id]}
            onNavigate={onNavigate}
          />
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Settings — pinned to bottom */}
      <NavRailItem
        item={{ id: "settings", label: "Settings", icon: SettingsIcon }}
        isActive={activePage === "settings"}
        badge={badges?.settings}
        onNavigate={onNavigate}
      />
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Individual item
// ---------------------------------------------------------------------------

function NavRailItem({
  item,
  isActive,
  badge,
  onNavigate,
}: {
  item: Omit<NavItem, "badge">;
  isActive: boolean;
  badge?: number;
  onNavigate: (page: NavPage) => void;
}) {
  const Icon = item.icon;
  const accentClass = item.accent ? pillarAccent[item.accent] : undefined;

  const handleClick = useCallback(() => {
    onNavigate(item.id);
  }, [onNavigate, item.id]);

  return (
    <button
      onClick={handleClick}
      aria-label={item.label}
      aria-current={isActive ? "page" : undefined}
      title={`${item.label} ${navShortcuts[item.id] ? `(${navShortcuts[item.id]})` : ""}`.trim()}
      className={cn(
        "relative flex items-center justify-center",
        "w-8 h-8 rounded-[6px]",
        "transition-colors duration-150 ease-out",
        isActive
          ? cn("bg-bg-elevated", accentClass ?? "text-text-primary")
          : "text-text-ghost hover:text-text-secondary hover:bg-bg-elevated/50",
      )}
    >
      {/* Active indicator — 2px accent bar on left edge */}
      {isActive && (
        <span
          className={cn(
            "absolute left-[-7px] top-1/2 -translate-y-1/2",
            "w-[2px] h-4 rounded-r-full",
            "bg-text-primary transition-all duration-[var(--duration-smooth)]",
          )}
        />
      )}

      <Icon size={16} />

      {/* Unread / notification dot — 5px, accent-colored, top-right */}
      {badge != null && badge > 0 && (
        <span
          data-unread
          className={cn(
            "absolute top-0 right-0",
            "w-[5px] h-[5px] rounded-full",
            accentClass ? accentDot[item.accent ?? ""] ?? "bg-error" : "bg-error",
            "ring-[1.5px] ring-bg-base",
          )}
          aria-label={`${badge} unread`}
        />
      )}
    </button>
  );
}
