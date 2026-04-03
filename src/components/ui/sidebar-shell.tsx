"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_WIDTH = 200;
const MAX_WIDTH = 400;
const DEFAULT_WIDTH = 260;
const STORAGE_KEY = "agent-studio:sidebar-width";

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
// Helpers
// ---------------------------------------------------------------------------

function readStoredWidth(): number {
  if (typeof window === "undefined") return DEFAULT_WIDTH;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = Number(stored);
      if (!Number.isNaN(parsed) && parsed >= MIN_WIDTH && parsed <= MAX_WIDTH) {
        return parsed;
      }
    }
  } catch {
    // localStorage may be unavailable
  }
  return DEFAULT_WIDTH;
}

function writeStoredWidth(width: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(width));
  } catch {
    // noop
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SidebarShell({
  collapsed = false,
  children,
  className,
}: SidebarShellProps) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const isDragging = useRef(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Hydrate width from localStorage on mount
  useEffect(() => {
    setWidth(readStoredWidth());
  }, []);

  // -------------------------------------------------------------------------
  // Drag-to-resize handler
  // -------------------------------------------------------------------------
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;

      const startX = e.clientX;
      const startWidth = width;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isDragging.current) return;
        const delta = moveEvent.clientX - startX;
        const newWidth = Math.min(
          MAX_WIDTH,
          Math.max(MIN_WIDTH, startWidth + delta),
        );
        setWidth(newWidth);
      };

      const handleMouseUp = () => {
        isDragging.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";

        // Persist final width
        if (sidebarRef.current) {
          const finalWidth = sidebarRef.current.getBoundingClientRect().width;
          writeStoredWidth(Math.round(finalWidth));
        }
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [width],
  );

  return (
    <aside
      ref={sidebarRef}
      className={cn(
        "relative flex flex-col shrink-0 overflow-hidden",
        "bg-surface border-r border-border",
        "transition-[width] duration-[var(--duration-smooth)] ease-[var(--ease-smooth)]",
        className,
      )}
      style={{ width: collapsed ? 0 : width }}
      aria-label="Sidebar"
      aria-hidden={collapsed}
    >
      {/* Content — hidden when collapsed to prevent tab focus */}
      {!collapsed && (
        <div className="flex flex-col flex-1 overflow-y-auto scrollbar-thin">
          {children}
        </div>
      )}

      {/* Resize handle — right edge */}
      {!collapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          onMouseDown={handleMouseDown}
          className={cn(
            "absolute top-0 right-0 w-1 h-full",
            "cursor-col-resize",
            "hover:bg-accent/20",
            "transition-colors duration-[var(--duration-instant)] ease-out",
          )}
        />
      )}
    </aside>
  );
}
