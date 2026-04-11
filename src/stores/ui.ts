import { create } from "zustand";
import type { ActiveMode } from "@/lib/types";

type Theme = "dark" | "light";

interface UIState {
  activeMode: ActiveMode;
  sidebarOpen: boolean;
  fullscreenId: string | null;
  launcherOpen: boolean;
  commandPaletteOpen: boolean;
  theme: Theme;

  setActiveMode: (mode: ActiveMode) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setFullscreen: (id: string | null) => void;
  setLauncherOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem("agent-studio-theme");
  if (stored === "light" || stored === "dark") return stored;
  return "dark";
}

export const useUIStore = create<UIState>((set) => ({
  activeMode: "sessions",
  sidebarOpen: true,
  fullscreenId: null,
  launcherOpen: false,
  commandPaletteOpen: false,
  theme: getInitialTheme(),

  setActiveMode: (mode) => set({ activeMode: mode }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setFullscreen: (id) => set({ fullscreenId: id }),
  setLauncherOpen: (open) => set({ launcherOpen: open }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setTheme: (theme) => {
    localStorage.setItem("agent-studio-theme", theme);
    set({ theme });
  },
  toggleTheme: () =>
    set((s) => {
      const next = s.theme === "dark" ? "light" : "dark";
      localStorage.setItem("agent-studio-theme", next);
      return { theme: next };
    }),
}));
