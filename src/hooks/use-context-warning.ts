"use client";

import { useEffect, useRef } from "react";
import { useUsage } from "@/hooks/use-usage";
import { useToastStore } from "@/stores/toast";

const WARNING_THRESHOLD = 80;
const CRITICAL_THRESHOLD = 95;

/**
 * Shows a toast warning when any session's context window usage crosses
 * 80% or 95%. Each session triggers at most one warning per threshold
 * per mount to avoid spamming.
 */
export function useContextWarning() {
  const { managed } = useUsage();
  const addToast = useToastStore((s) => s.addToast);
  const warnedRef = useRef<Set<string>>(new Set());
  const criticalRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const [sessionId, usage] of Object.entries(managed)) {
      const pct = usage.contextPercent;

      if (pct >= CRITICAL_THRESHOLD && !criticalRef.current.has(sessionId)) {
        criticalRef.current.add(sessionId);
        addToast(
          `Context window at ${Math.round(pct)}% — consider starting a new session`,
          "error",
        );
      } else if (pct >= WARNING_THRESHOLD && !warnedRef.current.has(sessionId)) {
        warnedRef.current.add(sessionId);
        addToast(
          `Context window at ${Math.round(pct)}% — approaching limit`,
          "warning",
        );
      }
    }
  }, [managed, addToast]);
}
