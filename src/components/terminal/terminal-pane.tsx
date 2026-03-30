"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { X, Maximize2, Minimize2, Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { wsClient } from "@/lib/ws-client";
import { cn, statusDotColor } from "@/lib/utils";
import { useSessionsStore } from "@/stores/sessions";
import { useSessionUsage } from "@/hooks/use-usage";
import type { WsMessage, SessionMeta } from "@/lib/types";

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
    // Small delay to let the DOM update display from hidden to block
    const timer = setTimeout(() => {
      try {
        fitAddon.fit();
        wsClient.send({
          type: "terminal-resize",
          sessionId,
          cols: term.cols,
          rows: term.rows,
        });
      } catch {
        // Ignore fit errors
      }
    }, 50);
    return () => clearTimeout(timer);
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
    } catch {
      // Ignore fit errors
    }
  }, [zoomLevel, sessionId]);

  // Real usage data from Claude session files
  const usage = useSessionUsage(sessionId);
  const effectiveModel = usage.modelShort ?? meta?.model ?? null;
  const contextPercent = usage.contextPercent ?? 0;
  const contextDisplay = usage.loading ? "..." : contextPercent > 0 ? `${contextPercent}% ctx` : null;
  const contextColor = contextPercent >= 90 ? "text-red-400 bg-red-500/15" : contextPercent >= 70 ? "text-yellow-400 bg-yellow-500/15" : "bg-console-border text-console-dim";
  const tokensDisplay = usage.tokens && usage.tokens !== "0"
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
    } catch {
      // Ignore fit errors during teardown
    }
  }, [sessionId]);

  useEffect(() => {
    const container = terminalRef.current;
    if (!container) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "Menlo, Consolas, 'Courier New', monospace",
      theme: {
        background: "#0a0a0a",
        foreground: "#cccccc",
        cursor: "#4ade80",
        selectionBackground: "#333333",
      },
      scrollback: 10000,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(container);

    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
      } catch {
        // Ignore
      }
    });

    fitAddonRef.current = fitAddon;
    termRef.current = term;

    wsClient.send({
      type: "terminal-resize",
      sessionId,
      cols: term.cols,
      rows: term.rows,
    });

    const inputDisposable = term.onData((data: string) => {
      wsClient.send({
        type: "terminal-input",
        sessionId,
        data,
      });
    });

    const unsubscribe = wsClient.on(
      "terminal-data",
      (msg: WsMessage) => {
        if (msg.sessionId === sessionId && msg.data) {
          term.write(msg.data);
        }
      },
    );

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        try {
          fitAddon.fit();
          wsClient.send({
            type: "terminal-resize",
            sessionId,
            cols: term.cols,
            rows: term.rows,
          });
        } catch {
          // Ignore
        }
      });
    });
    resizeObserver.observe(container);

    return () => {
      inputDisposable.dispose();
      unsubscribe();
      resizeObserver.disconnect();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sessionId, handleFit]);

  return (
    <div
      className={cn(
        "flex flex-col h-full rounded-lg border overflow-hidden transition-[border-color,box-shadow] duration-200",
        focused
          ? "border-console-success ring-1 ring-console-success/50"
          : "border-console-border",
      )}
      onClick={onFocus}
      onDoubleClick={(e) => {
        // Prevent double-click from triggering when clicking header buttons
        if ((e.target as HTMLElement).closest("button")) return;
        onDoubleClick?.();
      }}
    >
      {/* Header bar */}
      <div className="flex items-center gap-2 px-3 py-1 bg-console-panel border-b border-console-border shrink-0">
        <span
          className={cn(
            "w-2 h-2 rounded-full shrink-0",
            statusDotColor(status),
          )}
        />
        <span className="text-xs font-medium text-console-text truncate">
          {name}
        </span>

        {/* Badges — real data from Claude session files */}
        <div className="flex items-center gap-1 ml-auto shrink-0">
          {effectiveModel && effectiveModel !== "unknown" && (
            <span
              className={cn(
                "text-[9px] px-1.5 py-0.5 rounded font-medium",
                effectiveModel === "opus"
                  ? "bg-purple-500/20 text-purple-400"
                  : effectiveModel === "haiku"
                    ? "bg-teal-500/20 text-teal-400"
                    : "bg-console-border text-console-muted",
              )}
            >
              {effectiveModel}
            </span>
          )}
          {contextDisplay && (
            <span className={cn("text-[9px] px-1 py-0.5 rounded font-medium", contextColor)}>
              {contextDisplay}
            </span>
          )}
          <span className="text-[9px] px-1 py-0.5 rounded bg-console-border text-console-dim">
            {tokensDisplay}
          </span>

          {/* Zoom controls */}
          <span className="flex items-center border border-console-border rounded overflow-hidden">
            <button
              onClick={(e) => {
                e.stopPropagation();
                zoomOut(sessionId);
              }}
              className="p-0.5 text-console-dim hover:text-console-muted hover:bg-console-faint/50 transition-colors"
              title="Zoom out"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <span className="text-[8px] text-console-dim px-1 font-mono min-w-[20px] text-center">
              {zoomLevel}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                zoomIn(sessionId);
              }}
              className="p-0.5 text-console-dim hover:text-console-muted hover:bg-console-faint/50 transition-colors"
              title="Zoom in"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
          </span>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDoubleClick?.();
            }}
            className="p-0.5 text-console-dim hover:text-console-muted active:text-console-text transition-colors"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="w-3 h-3" />
            ) : (
              <Maximize2 className="w-3 h-3" />
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
              className="px-1.5 py-0.5 text-[9px] font-medium text-console-error bg-console-error/15 hover:bg-console-error/25 rounded transition-colors"
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
                "p-0.5 transition-colors",
                killing
                  ? "text-console-error cursor-not-allowed"
                  : "text-console-dim hover:text-console-error active:text-red-300",
              )}
              title={killing ? "Killing..." : "Kill session"}
            >
              {killing ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
            </button>
          )}
        </div>
      </div>

      {/* Terminal */}
      <div ref={terminalRef} className="flex-1 min-h-0" />
    </div>
  );
}
