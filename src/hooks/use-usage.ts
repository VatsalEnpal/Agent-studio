"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { wsClient } from "@/lib/ws-client";
import type { WsMessage, SessionUsageData } from "@/lib/types";

interface ManagedSessionUsage {
  cost: string;
  tokens: string;
  modelShort: "opus" | "sonnet" | "haiku" | "unknown";
  totalCost: number;
  totalTokens: number;
  contextUsed: number;
  contextTotal: number;
  contextPercent: number;
}

interface UsageState {
  all: SessionUsageData[];
  managed: Record<string, ManagedSessionUsage>;
}

/**
 * Hook that provides real-time usage data for all sessions.
 * Polls on mount, then listens for WebSocket usage-update events.
 */
export function useUsage(): UsageState {
  const [state, setState] = useState<UsageState>({ all: [], managed: {} });
  const mountedRef = useRef(true);

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/usage");
      if (res.ok) {
        const all = (await res.json()) as SessionUsageData[];
        if (mountedRef.current) {
          setState((prev) => ({ ...prev, all }));
        }
      }
    } catch (e) {
      console.error("Failed to fetch usage data:", e);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void fetchUsage();

    // Listen for WebSocket updates
    const unsub = wsClient.on("usage-update", (msg: WsMessage) => {
      const payload = msg.payload as {
        all: SessionUsageData[];
        managed: Record<string, ManagedSessionUsage>;
      } | null;
      if (payload && mountedRef.current) {
        setState({ all: payload.all, managed: payload.managed });
      }
    });

    // Also poll every 30 seconds for freshness
    const interval = setInterval(() => void fetchUsage(), 30_000);

    return () => {
      mountedRef.current = false;
      unsub();
      clearInterval(interval);
    };
  }, [fetchUsage]);

  return state;
}

/**
 * Hook that provides usage for a specific managed session.
 * Polls the session-specific endpoint.
 */
export function useSessionUsage(sessionId: string | null): {
  cost: string | null;
  tokens: string | null;
  modelShort: "opus" | "sonnet" | "haiku" | "unknown" | null;
  totalCost: number;
  totalTokens: number;
  contextUsed: number;
  contextTotal: number;
  contextPercent: number;
  displayName: string | null;
  loading: boolean;
} {
  const [data, setData] = useState<{
    cost: string | null;
    tokens: string | null;
    modelShort: "opus" | "sonnet" | "haiku" | "unknown" | null;
    totalCost: number;
    totalTokens: number;
    contextUsed: number;
    contextTotal: number;
    contextPercent: number;
    displayName: string | null;
    loading: boolean;
  }>({
    cost: null,
    tokens: null,
    modelShort: null,
    totalCost: 0,
    totalTokens: 0,
    contextUsed: 0,
    contextTotal: 0,
    contextPercent: 0,
    displayName: null,
    loading: true,
  });

  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;

    const fetchData = async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/usage`);
        if (res.ok && !cancelled) {
          const json = (await res.json()) as {
            cost: string | null;
            tokens: string | null;
            model: string | null;
            modelShort: "opus" | "sonnet" | "haiku" | "unknown" | null;
            totalCost?: number;
            totalTokens?: number;
            contextUsed?: number;
            contextTotal?: number;
            contextPercent?: number;
            displayName?: string;
          };
          setData({
            cost: json.cost,
            tokens: json.tokens,
            modelShort: json.modelShort,
            totalCost: json.totalCost ?? 0,
            totalTokens: json.totalTokens ?? 0,
            contextUsed: json.contextUsed ?? 0,
            contextTotal: json.contextTotal ?? 0,
            contextPercent: json.contextPercent ?? 0,
            displayName: json.displayName ?? null,
            loading: false,
          });
        }
      } catch (e) {
        console.error("Failed to fetch session usage data:", e);
        if (!cancelled) {
          setData((prev) => ({ ...prev, loading: false }));
        }
      }
    };

    void fetchData();
    const interval = setInterval(() => void fetchData(), 30_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId]);

  return data;
}

/**
 * Format a cost number to a display string.
 */
export function formatCostDisplay(cost: number | null | undefined): string {
  if (cost == null || cost === 0) return "$0.00";
  if (cost < 0.01) return "$0.00";
  if (cost < 10) return `$${cost.toFixed(2)}`;
  return `$${cost.toFixed(1)}`;
}

/**
 * Format token count for display.
 */
export function formatTokensDisplay(tokens: number | null | undefined): string {
  if (tokens == null || tokens === 0) return "0";
  if (tokens < 1000) return `${tokens}`;
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}K`;
  return `${(tokens / 1_000_000).toFixed(2)}M`;
}
