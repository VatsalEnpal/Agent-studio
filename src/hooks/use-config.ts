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
    setupComplete: boolean;
    version: string;
  };
}

let _cachedConfig: AgentStudioClientConfig | null = null;
let _fetchPromise: Promise<AgentStudioClientConfig | null> | null = null;

async function fetchConfig(): Promise<AgentStudioClientConfig | null> {
  try {
    const res = await fetch("/api/config");
    if (!res.ok) return null;
    const data = (await res.json()) as AgentStudioClientConfig;
    _cachedConfig = data;
    return data;
  } catch {
    return null;
  }
}

/**
 * Hook to get the Agent Studio config from the server.
 * Caches the result so only one fetch per session.
 */
export function useConfig() {
  const [config, setConfig] = useState<AgentStudioClientConfig | null>(_cachedConfig);
  const [loading, setLoading] = useState(!_cachedConfig);

  useEffect(() => {
    if (_cachedConfig) {
      setConfig(_cachedConfig);
      setLoading(false);
      return;
    }

    if (!_fetchPromise) {
      _fetchPromise = fetchConfig();
    }

    void _fetchPromise.then((result) => {
      setConfig(result);
      setLoading(false);
    });
  }, []);

  return { config, loading };
}

/**
 * Get the default working directory from config, with fallback.
 * Returns ~ path (e.g., "~/Code/InPipeline") for display.
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

/** Invalidate the cache so next useConfig() re-fetches. */
export function invalidateConfigCache(): void {
  _cachedConfig = null;
  _fetchPromise = null;
}
