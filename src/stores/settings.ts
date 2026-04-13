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
  settingsLoaded: boolean;
  statsLoading: boolean;

  setSystemStats: (stats: SystemStats) => void;
  setSettings: (settings: AppSettings) => void;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  setStatsLoading: (l: boolean) => void;
  /** Fetch settings from the server and update the store. */
  fetchSettings: () => Promise<void>;
}

// Sensible fallback; overridden by server config via fetchSettings
const defaultSettings: AppSettings = {
  defaultModel: "sonnet",
  defaultPermissions: "bypass",
  defaultCwd: "~",
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  systemStats: null,
  settings: defaultSettings,
  settingsLoaded: false,
  statsLoading: false,

  setSystemStats: (systemStats) => set({ systemStats }),
  setSettings: (settings) => set({ settings }),
  updateSetting: (key, value) =>
    set((state) => ({
      settings: { ...state.settings, [key]: value },
    })),
  setStatsLoading: (statsLoading) => set({ statsLoading }),

  fetchSettings: async () => {
    // Skip if already loaded (avoids redundant fetches)
    if (get().settingsLoaded) return;
    try {
      const res = await fetch("/api/settings");
      const data: AppSettings = await res.json();

      // Also fetch the authoritative config — .agent-studio.json is the canonical
      // source for defaults.  The /api/settings endpoint reads from .settings.json
      // which can be stale (e.g. model changed in config but .settings.json still
      // has the old value).  Override model, permissions, and cwd from /api/config.
      try {
        const cfgRes = await fetch("/api/config");
        if (cfgRes.ok) {
          const cfgData = (await cfgRes.json()) as {
            defaultCwd: string;
            config?: {
              defaults?: {
                model?: "opus" | "sonnet" | "haiku";
                permissions?: "bypass" | "default" | "plan";
                workingDirectory?: string;
              };
            };
          };
          const cfgDefaults = cfgData.config?.defaults;
          if (cfgDefaults?.model) {
            data.defaultModel = cfgDefaults.model;
          }
          if (cfgDefaults?.permissions) {
            data.defaultPermissions = cfgDefaults.permissions;
          }
          const configCwd = cfgDefaults?.workingDirectory ?? cfgData.defaultCwd ?? null;
          if (configCwd) {
            data.defaultCwd = configCwd;
          }
        }
      } catch {
        // Ignore — fall back to whatever /api/settings returned
      }

      if (data && data.defaultModel) {
        set({ settings: data, settingsLoaded: true });
      } else {
        set({ settingsLoaded: true });
      }
    } catch {
      // On error, keep hardcoded defaults but mark as loaded
      set({ settingsLoaded: true });
    }
  },
}));
