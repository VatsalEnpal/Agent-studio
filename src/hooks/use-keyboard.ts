"use client";

import { useEffect } from "react";
import { useUIStore } from "@/stores/ui";
import { useSessionsStore } from "@/stores/sessions";

/**
 * Global keyboard shortcuts.
 * Uses Cmd+Shift (Mac) / Ctrl+Shift (Windows) to avoid Chrome conflicts.
 *
 * - Cmd+Shift+N: open launcher
 * - Cmd+Shift+K: open command palette
 * - Cmd+Shift+1-6: focus session by position
 * - Cmd+Shift+F: toggle fullscreen
 * - Cmd+Shift+\: toggle sidebar
 * - Cmd+Enter: fullscreen focused pane
 * - Escape: exit fullscreen / close launcher / close command palette
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
      const mod = e.metaKey || e.ctrlKey;
      const shift = e.shiftKey;

      // Cmd+Shift+K: open command palette
      if (mod && shift && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
        return;
      }

      // Cmd+Shift+N: open launcher
      if (mod && shift && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setLauncherOpen(true);
        return;
      }

      // Cmd+Shift+\: toggle sidebar
      if (mod && shift && e.key === "\\") {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      // Cmd+Shift+F: toggle browser fullscreen
      if (mod && shift && e.key.toLowerCase() === "f") {
        e.preventDefault();
        if (document.fullscreenElement) {
          void document.exitFullscreen();
        } else {
          void document.documentElement.requestFullscreen();
        }
        return;
      }

      // Cmd+Enter: fullscreen focused pane
      if (mod && e.key === "Enter") {
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

      // Cmd+Shift+1 through Cmd+Shift+6: focus session by position
      if (mod && shift && e.key >= "1" && e.key <= "6") {
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
        !mod &&
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
