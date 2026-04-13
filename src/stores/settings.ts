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

      // Also fetch the authoritative config to get the canonical working directory.
      // The /api/settings endpoint may return a stale defaultCwd from .settings.json,
      // while /api/config returns the resolved value from .agent-studio.json.
      let configCwd: string | null = null;
      try {
        const cfgRes = await fetch("/api/config");
        if (cfgRes.ok) {
          const cfgData = (await cfgRes.json()) as {
            defaultCwd: string;
            config: { defaults: { workingDirectory: string } };
          };
          configCwd = cfgData.config?.defaults?.workingDirectory ?? cfgData.defaultCwd ?? null;
        }
      } catch {
        // Ignore — fall back to whatever /api/settings returned
      }

      if (data && data.defaultModel) {
        // Use the config's working directory as the canonical source
        if (configCwd) {
          data.defaultCwd = configCwd;
        }
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
