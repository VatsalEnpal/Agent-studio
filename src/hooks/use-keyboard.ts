"use client";

import { useEffect } from "react";
import { useUIStore } from "@/stores/ui";
import { useSessionsStore } from "@/stores/sessions";

/**
 * Global keyboard shortcuts.
 * - Cmd/Ctrl+N: open launcher
 * - Cmd/Ctrl+K: open command palette
 * - Cmd/Ctrl+1-6: focus session by position
 * - Cmd/Ctrl+Enter: fullscreen focused pane
 * - Escape: exit fullscreen / close launcher / close command palette
 * - Cmd/Ctrl+\: toggle sidebar
 * - Tab (when not in terminal): cycle focus
 */
export function useKeyboardShortcuts() {
  const setLauncherOpen = useUIStore((s) => s.setLauncherOpen);
  const launcherOpen = useUIStore((s) => s.launcherOpen);
  const fullscreenId = useUIStore((s) => s.fullscreenId);
  const setFullscreen = useUIStore((s) => s.setFullscreen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const commandPaletteOpen = useUIStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);

  const visibleIds = useSessionsStore((s) => s.visibleIds);
  const focusedId = useSessionsStore((s) => s.focusedId);
  const setFocused = useSessionsStore((s) => s.setFocused);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;

      // Cmd+K: open command palette
      if (meta && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
        return;
      }

      // Cmd+N: open launcher
      if (meta && e.key === "n") {
        e.preventDefault();
        setLauncherOpen(true);
        return;
      }

      // Cmd+\: toggle sidebar
      if (meta && e.key === "\\") {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      // Cmd+Enter: fullscreen focused pane
      if (meta && e.key === "Enter") {
        e.preventDefault();
        if (fullscreenId) {
          setFullscreen(null);
        } else if (focusedId) {
          setFullscreen(focusedId);
        }
        return;
      }

      // Escape: exit fullscreen, close command palette, close launcher
      if (e.key === "Escape") {
        if (fullscreenId) {
          e.preventDefault();
          setFullscreen(null);
          return;
        }
        if (commandPaletteOpen) {
          e.preventDefault();
          setCommandPaletteOpen(false);
          return;
        }
        // Dialog handles its own Escape, don't interfere with launcher
        return;
      }

      // Cmd+1 through Cmd+6: focus session by position
      if (meta && e.key >= "1" && e.key <= "6") {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        if (index < visibleIds.length) {
          setFocused(visibleIds[index]);
        }
        return;
      }

      // Tab: cycle focus (only when launcher and palette are closed and not typing)
      if (
        e.key === "Tab" &&
        !launcherOpen &&
        !commandPaletteOpen &&
        !meta &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLSelectElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        if (visibleIds.length === 0) return;
        const currentIndex = focusedId
          ? visibleIds.indexOf(focusedId)
          : -1;
        const nextIndex = (currentIndex + 1) % visibleIds.length;
        setFocused(visibleIds[nextIndex]);
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    setLauncherOpen,
    launcherOpen,
    fullscreenId,
    setFullscreen,
    toggleSidebar,
    commandPaletteOpen,
    setCommandPaletteOpen,
    visibleIds,
    focusedId,
    setFocused,
  ]);
}
