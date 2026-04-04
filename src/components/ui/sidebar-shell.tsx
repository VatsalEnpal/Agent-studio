"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useUIStore } from "@/stores/ui";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIDEBAR_WIDTH = 200;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SidebarShellProps {
  /** When true, the sidebar collapses to 0px width */
  collapsed?: boolean;
  /** Sidebar content */
  children?: ReactNode;
  /** Additional className for the outer wrapper */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SidebarShell({
  collapsed = false,
  children,
  className,
}: SidebarShellProps) {
  // ⌘B keyboard shortcut to toggle sidebar
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        // Don't capture if user is typing in an input
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        ) {
          return;
        }
        e.preventDefault();
        toggleSidebar();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  return (
    <aside
      className={cn(
        "relative flex flex-col shrink-0 overflow-hidden",
        "bg-bg-surface border-r border-border-default",
        "transition-[width] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
        className,
      )}
      style={{ width: collapsed ? 0 : SIDEBAR_WIDTH }}
      aria-label="Sidebar"
      aria-hidden={collapsed}
    >
      {/* Content — hidden when collapsed to prevent tab focus */}
      {!collapsed && (
        <div className="flex flex-col flex-1 min-h-0 overflow-y-auto scrollbar-thin">
          {children}
        </div>
      )}
    </aside>
  );
}
