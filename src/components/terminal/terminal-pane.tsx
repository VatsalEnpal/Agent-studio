"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

import "@xterm/xterm/css/xterm.css";
import {
  CloseIcon,
  ExpandIcon,
  CollapseIcon,
  SpinnerIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "@/components/ui/icons";
import { wsClient } from "@/lib/ws-client";
import { cn, statusDotColor } from "@/lib/utils";
import { useSessionsStore } from "@/stores/sessions";
import { useSessionUsage } from "@/hooks/use-usage";
import type { WsMessage, SessionMeta } from "@/lib/types";

/** Read custom session names from localStorage */
function getCustomName(sessionId: string): string | null {
  try {
    const raw = localStorage.getItem("agent-studio-session-names");
    if (raw) {
      const names = JSON.parse(raw) as Record<string, string>;
      return names[sessionId] ?? null;
    }
  } catch (e) {
    console.error("Failed to read custom session name from localStorage:", e);
  }
  return null;
}

interface TerminalPaneProps {
  sessionId: string;
  name: string;
  status: "starting" | "active" | "idle" | "building" | "exited";
  meta?: SessionMeta;
  focused?: boolean;
  isFullscreen?: boolean;
  visible?: boolean;
  onFocus?: () => void;
  onKill?: () => void;
  onDoubleClick?: () => void;
}

export function TerminalPane({
  sessionId,
  name,
  status,
  meta,
  focused,
  isFullscreen,
  visible = true,
  onFocus,
  onKill,
  onDoubleClick,
}: TerminalPaneProps) {
  const [killing, setKilling] = useState(false);
  const [confirmKill, setConfirmKill] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const zoomLevel = useSessionsStore((s) => s.zoomLevels[sessionId] ?? 13);
  const zoomIn = useSessionsStore((s) => s.zoomIn);
  const zoomOut = useSessionsStore((s) => s.zoomOut);

  // Refit terminal when tab becomes visible (prevents black screen after tab switch)
  useEffect(() => {
    if (!visible) return;
    const term = termRef.current;
    const fitAddon = fitAddonRef.current;
    if (!term || !fitAddon) return;
    // Use rAF to wait for CSS layout to complete after display changes from hidden to block
    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
        wsClient.send({
          type: "terminal-resize",
          sessionId,
          cols: term.cols,
          rows: term.rows,
        });
      } catch (e) {
        console.error("Failed to fit terminal on visibility change:", e);
      }
    });
  }, [visible, sessionId]);

  // Apply zoom changes to running terminal
  useEffect(() => {
    const term = termRef.current;
    const fitAddon = fitAddonRef.current;
    if (!term || !fitAddon) return;
    term.options.fontSize = zoomLevel;
    try {
      fitAddon.fit();
      wsClient.send({
        type: "terminal-resize",
        sessionId,
        cols: term.cols,
        rows: term.rows,
      });
    } catch (e) {
      console.error("Failed to fit terminal after zoom change:", e);
    }
  }, [zoomLevel, sessionId]);

  // Real usage data from Claude session files
  const usage = useSessionUsage(sessionId);
  const effectiveModel = usage.modelShort ?? meta?.model ?? null;
  const customName = getCustomName(sessionId);
  const displayName = customName || usage.displayName || name;
  const contextPercent = usage.contextPercent ?? 0;
  const contextDisplay = usage.loading
    ? "..."
    : contextPercent > 0
      ? `${contextPercent}% ctx`
      : null;
  const contextColor =
    contextPercent >= 90
      ? "text-red-400 bg-red-500/15"
      : contextPercent >= 70
        ? "text-yellow-400 bg-yellow-500/15"
        : "bg-border-default text-text-tertiary";
  const tokensDisplay =
    usage.tokens && usage.tokens !== "0"
      ? `${usage.tokens} tokens`
      : usage.loading
        ? "..."
        : "\u2014";

  const handleFit = useCallback(() => {
    const fitAddon = fitAddonRef.current;
    const term = termRef.current;
    if (!fitAddon || !term) return;

    try {
      fitAddon.fit();
      wsClient.send({
        type: "terminal-resize",
        sessionId,
        cols: term.cols,
        rows: term.rows,
      });
    } catch (e) {
      console.error("Failed to fit terminal during resize:", e);
    }
  }, [sessionId]);

  useEffect(() => {
    const container = terminalRef.current;
    if (!container) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'Geist Mono', Menlo, Consolas, 'Courier New', monospace",
      theme: {
        background: "#0a0a0a",
        foreground: "#cccccc",
        cursor: "#4ade80",
        selectionBackground: "#333333",
      },
      scrollback: 10000,
      convertEol: true,
      smoothScrollDuration: 0,
      rescaleOverlappingGlyphs: false,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(container);

    fitAddonRef.current = fitAddon;
    termRef.current = term;

    // Fit after a short delay to ensure the container has non-zero dimensions.
    // New sessions or tab switches can cause the container to be laid out with
    // zero height initially; rAF alone isn't enough because CSS may still be
    // transitioning from hidden to visible.
    const fitAndResize = () => {
      try {
        fitAddon.fit();
        wsClient.send({
          type: "terminal-resize",
          sessionId,
          cols: term.cols,
          rows: term.rows,
        });
      } catch (e) {
        console.error("Failed to fit terminal during initial layout:", e);
      }
    };

    // First attempt: immediate rAF
    requestAnimationFrame(fitAndResize);
    // Second attempt: after layout settles (handles CSS transitions / display:none->block)
    const fallbackTimer = setTimeout(fitAndResize, 100);

    // Replay buffer from server (restores previous output on tab switch / reconnect)
    fetch(`/api/sessions/${sessionId}/buffer`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { buffer: string } | null) => {
        if (data?.buffer) {
          term.write(data.buffer);
        }
      })
      .catch((e: unknown) => {
        console.error("Failed to fetch terminal buffer:", e);
      });

    const inputDisposable = term.onData((data: string) => {
      wsClient.send({
        type: "terminal-input",
        sessionId,
        data,
      });
    });

    const unsubscribe = wsClient.on("terminal-data", (msg: WsMessage) => {
      if (msg.sessionId === sessionId && msg.data) {
        term.write(msg.data);
      }
    });

    // Subscribe to this session's topic so the server routes terminal-data here.
    const topicUnsub = wsClient.subscribeTopic(`terminal:${sessionId}`);

    // Debounced resize observer — prevents rapid-fire fits that cause overlapping lines
    let fitTimeout: ReturnType<typeof setTimeout> | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (fitTimeout) clearTimeout(fitTimeout);
      fitTimeout = setTimeout(() => {
        try {
          fitAddon.fit();
          wsClient.send({
            type: "terminal-resize",
            sessionId,
            cols: term.cols,
            rows: term.rows,
          });
        } catch (e) {
          console.error("Failed to fit terminal during layout transition:", e);
        }
      }, 100);
    });
    resizeObserver.observe(container);

    // Listen for grid-wide refit events (triggered when session count changes)
    const refitHandler = () => {
      try {
        fitAddon.fit();
        wsClient.send({
          type: "terminal-resize",
          sessionId,
          cols: term.cols,
          rows: term.rows,
        });
      } catch (e) {
        console.error("Failed to fit terminal on refit event:", e);
      }
    };
    window.addEventListener("terminal-refit", refitHandler);

    return () => {
      clearTimeout(fallbackTimer);
      if (fitTimeout) clearTimeout(fitTimeout);
      inputDisposable.dispose();
      unsubscribe();
      topicUnsub();
      resizeObserver.disconnect();
      window.removeEventListener("terminal-refit", refitHandler);
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sessionId, handleFit]);

  return (
    <div
      className={cn(
        "terminal-pane-border flex flex-col h-full rounded border overflow-hidden",
        focused
          ? "border-sessions/60 shadow-[0_0_12px_rgba(74,222,128,0.06)]"
          : "border-border-default",
      )}
      onClick={onFocus}
      onDoubleClick={(e) => {
        // Prevent double-click from triggering when clicking header buttons
        if ((e.target as HTMLElement).closest("button")) return;
        onDoubleClick?.();
      }}
    >
      {/* Header bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-surface border-b border-border-default shrink-0 font-mono">
        <span className={cn("w-2 h-2 rounded-full shrink-0", statusDotColor(status))} />
        <span className="text-xs font-medium text-text-primary truncate">{displayName}</span>

        {/* Badges — real data from Claude session files */}
        <div className="flex items-center gap-1 ml-auto shrink-0">
          {effectiveModel && effectiveModel !== "unknown" && (
            <span
              className={cn(
                "text-2xs px-1.5 py-0.5 rounded-full font-medium",
                "bg-[#f59e0b]/10 text-[#f59e0b]",
              )}
            >
              {effectiveModel}
            </span>
          )}
          {contextDisplay && (
            <span className={cn("text-2xs px-1 py-0.5 rounded-full font-medium", contextColor)}>
              {contextDisplay}
            </span>
          )}
          <span className="text-2xs text-text-tertiary">{tokensDisplay}</span>

          {/* Zoom controls */}
          <span className="flex items-center gap-0 rounded border border-border-default overflow-hidden">
            <button
              onClick={(e) => {
                e.stopPropagation();
                zoomOut(sessionId);
              }}
              className="p-0.5 text-text-tertiary hover:text-text-secondary hover:bg-bg-elevated/50 transition-all"
              title="Zoom out"
            >
              <ZoomOutIcon className="w-2.5 h-2.5" />
            </button>
            <span className="text-[7px] text-text-tertiary px-0.5 font-mono min-w-[16px] text-center">
              {zoomLevel}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                zoomIn(sessionId);
              }}
              className="p-0.5 text-text-tertiary hover:text-text-secondary hover:bg-bg-elevated/50 transition-all"
              title="Zoom in"
            >
              <ZoomInIcon className="w-2.5 h-2.5" />
            </button>
          </span>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDoubleClick?.();
            }}
            className="p-0.5 text-text-tertiary hover:text-text-secondary active:text-text-primary transition-all"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? (
              <CollapseIcon className="w-3 h-3" />
            ) : (
              <ExpandIcon className="w-3 h-3" />
            )}
          </button>
          {confirmKill ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (killing) return;
                setKilling(true);
                setConfirmKill(false);
                if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
                onKill?.();
                setTimeout(() => setKilling(false), 3000);
              }}
              className="px-1.5 py-0.5 text-2xs font-medium text-error bg-error/15 hover:bg-error/25 rounded transition-all"
            >
              Kill?
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (killing) return;
                setConfirmKill(true);
                confirmTimerRef.current = setTimeout(() => setConfirmKill(false), 2000);
              }}
              disabled={killing}
              className={cn(
                "p-0.5 transition-all",
                killing
                  ? "text-error cursor-not-allowed"
                  : "text-text-tertiary hover:text-error active:text-red-300",
              )}
              title={killing ? "Killing..." : "Kill session"}
            >
              {killing ? (
                <SpinnerIcon className="w-3 h-3 animate-spin" />
              ) : (
                <CloseIcon className="w-3 h-3" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Terminal */}
      <div ref={terminalRef} className="flex-1 min-h-0 overflow-hidden" />
    </div>
  );
}
