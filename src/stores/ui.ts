import { create } from "zustand";
import type { ActiveMode } from "@/lib/types";

interface UIState {
  activeMode: ActiveMode;
  sidebarOpen: boolean;
  fullscreenId: string | null;
  launcherOpen: boolean;
  commandPaletteOpen: boolean;

  setActiveMode: (mode: ActiveMode) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setFullscreen: (id: string | null) => void;
  setLauncherOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeMode: "sessions",
  sidebarOpen: true,
  fullscreenId: null,
  launcherOpen: false,
  commandPaletteOpen: false,

  setActiveMode: (mode) => set({ activeMode: mode }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setFullscreen: (id) => set({ fullscreenId: id }),
  setLauncherOpen: (open) => set({ launcherOpen: open }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
}));
