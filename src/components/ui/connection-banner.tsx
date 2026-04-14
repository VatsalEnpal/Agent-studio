"use client";

import { useEffect, useState, useRef } from "react";
import { wsClient, type ConnectionState } from "@/lib/ws-client";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Connection Banner — amber when reconnecting, green flash on reconnect
// ---------------------------------------------------------------------------

type BannerState = "hidden" | "reconnecting" | "reconnected";

export function ConnectionBanner() {
  const [state, setState] = useState<BannerState>("hidden");
  const prevConnectionRef = useRef<ConnectionState>(wsClient.getConnectionState());
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = wsClient.onConnectionChange((connectionState) => {
      const prev = prevConnectionRef.current;
      prevConnectionRef.current = connectionState;

      if (connectionState === "reconnecting") {
        // Clear any pending dismiss
        if (dismissTimerRef.current) {
          clearTimeout(dismissTimerRef.current);
          dismissTimerRef.current = null;
        }
        // Only show banner after 3 seconds of sustained disconnect
        if (!showDelayRef.current) {
          showDelayRef.current = setTimeout(() => {
            setState("reconnecting");
            showDelayRef.current = null;
          }, 3000);
        }
      } else if (connectionState === "connected") {
        // Cancel the show delay if we reconnected quickly
        if (showDelayRef.current) {
          clearTimeout(showDelayRef.current);
          showDelayRef.current = null;
        }
        if (prev === "reconnecting" || state === "reconnecting") {
          // Reconnected — show green flash then auto-dismiss
          setState("reconnected");
          dismissTimerRef.current = setTimeout(() => {
            setState("hidden");
            dismissTimerRef.current = null;
          }, 2000);
        }
      } else if (connectionState === "disconnected") {
        if (showDelayRef.current) {
          clearTimeout(showDelayRef.current);
          showDelayRef.current = null;
        }
        setState("hidden");
      }
    });

    return () => {
      unsub();
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      if (showDelayRef.current) clearTimeout(showDelayRef.current);
    };
  }, [state]);

  if (state === "hidden") return null;

  const isReconnecting = state === "reconnecting";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center justify-center gap-2 px-4 py-1.5",
        "text-label-xs font-medium",
        "z-topBar",
        "transition-all duration-[var(--duration-smooth)]",
        isReconnecting ? "bg-warning-subtle text-warning" : "bg-success-subtle text-success",
      )}
    >
      {/* Pulsing dot */}
      <span
        className={cn(
          "size-1.5 rounded-full",
          isReconnecting ? "bg-warning animate-pulse-dot" : "bg-success",
        )}
      />

      {isReconnecting ? "Reconnecting to server..." : "Connected"}
    </div>
  );
}
