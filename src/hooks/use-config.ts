"use client";

import { useState, useEffect } from "react";

export interface AgentStudioClientConfig {
  homeDir: string;
  cwd: string;
  mainProjectDir: string;
  defaultCwd: string;
  config: {
    projects: Array<{
      name: string;
      path: string;
      isProd: boolean;
      branch?: string;
      trackedBranches?: string[];
    }>;
    agentSystem?: {
      path: string;
      memoryIndex: string;
      sprintDir: string;
      scanLog: string;
    };
    devServers: Array<{
      name: string;
      path: string;
      command: string;
    }>;
    defaults: {
      model: "opus" | "sonnet" | "haiku";
      permissions: "bypass" | "default" | "plan" | "auto";
      workingDirectory: string;
    };
    /** Directories scanned for agent `.md` files, with global / project scope. */
    agentSources?: Array<{
      path: string;
      scope: "global" | { project: string };
      label?: string;
    }>;
    setupComplete: boolean;
    version: string;
  };
}

// ---------------------------------------------------------------------------
// Module-level cache + pub/sub so every `useConfig()` consumer stays reactive
// when `invalidateConfigCache()` is called from anywhere in the app.
// ---------------------------------------------------------------------------

let _cachedConfig: AgentStudioClientConfig | null = null;
let _fetchPromise: Promise<AgentStudioClientConfig | null> | null = null;
const _listeners = new Set<(config: AgentStudioClientConfig | null) => void>();

function notifyListeners(): void {
  for (const listener of _listeners) {
    listener(_cachedConfig);
  }
}

async function fetchConfig(): Promise<AgentStudioClientConfig | null> {
  try {
    const res = await fetch("/api/config", { cache: "no-store" });
    if (!res.ok) {
      _fetchPromise = null;
      return null;
    }
    const data = (await res.json()) as AgentStudioClientConfig;
    _cachedConfig = data;
    _fetchPromise = null;
    notifyListeners();
    return data;
  } catch {
    _fetchPromise = null;
    return null;
  }
}

/**
 * Hook to get the Agent Studio config from the server.
 *
 * Subscribes to a module-level pub/sub: when `invalidateConfigCache()` is
 * called anywhere, every consumer re-reads `/api/config` and re-renders with
 * the fresh payload. This is what lets Settings -> Sources update in place
 * after Remove, and what lets the Browse Templates destination dropdown pick
 * up newly-added sources without a page reload.
 */
export function useConfig() {
  const [config, setConfig] = useState<AgentStudioClientConfig | null>(_cachedConfig);
  const [loading, setLoading] = useState(!_cachedConfig);

  useEffect(() => {
    let mounted = true;

    const listener = (next: AgentStudioClientConfig | null) => {
      if (!mounted) return;
      setConfig(next);
      setLoading(false);
    };
    _listeners.add(listener);

    // Initial load (or re-load if cache was just invalidated).
    if (_cachedConfig) {
      setConfig(_cachedConfig);
      setLoading(false);
    } else {
      setLoading(true);
      if (!_fetchPromise) {
        _fetchPromise = fetchConfig();
      }
      void _fetchPromise.then((result) => {
        if (!mounted) return;
        // If the fetch populated the cache, notifyListeners already fired —
        // but in case this instance raced past notifyListeners, mirror state.
        setConfig(result);
        setLoading(false);
      });
    }

    return () => {
      mounted = false;
      _listeners.delete(listener);
    };
  }, []);

  return { config, loading };
}

/**
 * Get the default working directory from config, with fallback.
 * Returns ~ path (e.g., "~/Code/my-project") for display.
 */
export function useDefaultCwd(): string {
  const { config } = useConfig();
  return config?.config.defaults.workingDirectory ?? config?.defaultCwd ?? "~";
}

/**
 * Check if an agent system is configured.
 */
export function useHasAgentSystem(): boolean {
  const { config } = useConfig();
  return !!config?.config.agentSystem;
}

/**
 * Invalidate the cache and re-fetch config. All `useConfig()` consumers will
 * receive the updated value via the pub/sub above and re-render in place.
 */
export function invalidateConfigCache(): void {
  _cachedConfig = null;
  _fetchPromise = fetchConfig();
}
