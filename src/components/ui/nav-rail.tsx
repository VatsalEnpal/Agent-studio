"use client";

import { useCallback } from "react";
import {
  Terminal,
  ChatCircle,
  Play,
  Brain,
  Gear,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
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
  icon: PhosphorIcon;
  badge?: number;
}

interface NavRailProps {
  activePage: NavPage;
  onNavigate: (page: NavPage) => void;
  /** Badge counts keyed by page id */
  badges?: Partial<Record<NavPage, number>>;
}

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

const navItems: Omit<NavItem, "badge">[] = [
  { id: "sessions", label: "Sessions", icon: Terminal },
  { id: "teams", label: "Teams", icon: ChatCircle },
  { id: "sprints", label: "Sprints", icon: Play },
  { id: "knowledge", label: "Knowledge", icon: Brain },
  { id: "settings", label: "Settings", icon: Gear },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NavRail({ activePage, onNavigate, badges }: NavRailProps) {
  return (
    <nav
      className={cn(
        "flex flex-col items-center gap-2 pt-9 pb-3",
        "w-14 h-full shrink-0",
        "bg-surface border-r border-border-subtle",
        "z-sidebar",
      )}
      aria-label="Main navigation"
    >
      {navItems.map((item) => (
        <NavRailItem
          key={item.id}
          item={item}
          isActive={activePage === item.id}
          badge={badges?.[item.id]}
          onNavigate={onNavigate}
        />
      ))}
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

  const handleClick = useCallback(() => {
    onNavigate(item.id);
  }, [onNavigate, item.id]);

  return (
    <button
      onClick={handleClick}
      aria-label={item.label}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "relative flex items-center justify-center",
        "size-10 rounded-lg",
        "transition-colors duration-[var(--duration-quick)] ease-out",
        isActive
          ? "text-accent bg-accent-subtle"
          : "text-text-secondary hover:text-text-primary hover:bg-surface-hover",
      )}
    >
      {/* Active indicator — left border bar */}
      <span
        className={cn(
          "absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full",
          "transition-all duration-[var(--duration-quick)] ease-out",
          isActive
            ? "h-5 bg-accent opacity-100"
            : "h-0 bg-accent opacity-0",
        )}
      />

      <Icon size={20} weight="light" />

      {/* Notification badge dot */}
      {badge != null && badge > 0 && (
        <span
          className={cn(
            "absolute top-1 right-1",
            "size-2 rounded-full bg-error",
            "ring-2 ring-surface",
          )}
          aria-label={`${badge} notifications`}
        />
      )}
    </button>
  );
}
