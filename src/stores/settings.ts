import { create } from "zustand";

export interface SystemStats {
  cpu: { usage: number; cores: number };
  memory: { used: number; total: number; percentage: number };
  disk: { used: number; total: number; percentage: number };
  activeServers: number;
  activeSessions: number;
  uptime: number;
  wsConnections: number;
}

export interface AppSettings {
  defaultModel: "opus" | "sonnet" | "haiku";
  defaultPermissions: "bypass" | "default" | "plan";
  defaultCwd: string;
}

interface SettingsState {
  systemStats: SystemStats | null;
  settings: AppSettings;
  statsLoading: boolean;

  setSystemStats: (stats: SystemStats) => void;
  setSettings: (settings: AppSettings) => void;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  setStatsLoading: (l: boolean) => void;
}

// Sensible fallback; overridden by server config on mount
const defaultSettings: AppSettings = {
  defaultModel: "sonnet",
  defaultPermissions: "bypass",
  defaultCwd: "~",
};

export const useSettingsStore = create<SettingsState>((set) => ({
  systemStats: null,
  settings: defaultSettings,
  statsLoading: false,

  setSystemStats: (systemStats) => set({ systemStats }),
  setSettings: (settings) => set({ settings }),
  updateSetting: (key, value) =>
    set((state) => ({
      settings: { ...state.settings, [key]: value },
    })),
  setStatsLoading: (statsLoading) => set({ statsLoading }),
}));
