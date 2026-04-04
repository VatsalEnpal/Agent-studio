"use client";

import { useEffect } from "react";
import { useUIStore } from "@/stores/ui";
import { useSessionsStore } from "@/stores/sessions";
import type { ActiveMode } from "@/lib/types";

// ---------------------------------------------------------------------------
// Section order for ⌘1-4 shortcuts
// ---------------------------------------------------------------------------

const sectionByIndex: ActiveMode[] = [
  "sessions",
  "teams",
  "sprints",
  "memory",
];

/**
 * Global keyboard shortcuts.
 *
 * Section navigation:
 * - ⌘1-4: switch between Sessions / Teams / Sprints / Memory
 * - ⌘[: previous sidebar item, ⌘]: next sidebar item
 *
 * Session management (Cmd+Shift to avoid browser/OS conflicts):
 * - Cmd+Shift+N: open launcher
 * - Cmd+Shift+K: open command palette
 * - Cmd+Shift+1-6: focus session by position
 * - Cmd+Shift+F: toggle fullscreen
 * - Cmd+Shift+\: toggle sidebar (legacy, ⌘B also works via sidebar-shell)
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
  const setActiveMode = useUIStore((s) => s.setActiveMode);
  const commandPaletteOpen = useUIStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);

  const visibleIds = useSessionsStore((s) => s.visibleIds);
  const focusedId = useSessionsStore((s) => s.focusedId);
  const setFocused = useSessionsStore((s) => s.setFocused);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      const shift = e.shiftKey;

      // Don't capture shortcuts when typing in inputs
      const isTyping =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement;

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

      // Cmd+Shift+\: toggle sidebar (legacy shortcut)
      if (mod && shift && e.key === "\\") {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      // ⌘,: open settings (standard macOS pattern)
      if (mod && !shift && e.key === ",") {
        e.preventDefault();
        setActiveMode("settings");
        return;
      }

      // ⌘N: open launcher (when not typing in input)
      if (mod && !shift && !isTyping && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setLauncherOpen(true);
        return;
      }

      // ⌘1-4: switch sections (without shift — only when not typing)
      if (mod && !shift && !isTyping && e.key >= "1" && e.key <= "4") {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        setActiveMode(sectionByIndex[index]);
        return;
      }

      // ⌘[ / ⌘]: cycle sidebar items (previous / next)
      if (mod && !shift && !isTyping && (e.key === "[" || e.key === "]")) {
        e.preventDefault();
        const direction = e.key === "]" ? 1 : -1;
        // For sessions mode, cycle through visible session tabs
        const mode = useUIStore.getState().activeMode;
        if (mode === "sessions" && visibleIds.length > 0) {
          const currentIndex = focusedId
            ? visibleIds.indexOf(focusedId)
            : -1;
          const nextIndex =
            (currentIndex + direction + visibleIds.length) %
            visibleIds.length;
          setFocused(visibleIds[nextIndex]);
        }
        // Other modes: sections agent can hook into this via a store event
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
        !isTyping
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
    setActiveMode,
    commandPaletteOpen,
    setCommandPaletteOpen,
    visibleIds,
    focusedId,
    setFocused,
  ]);
}
