"use client";

import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

import { wsClient } from "@/lib/ws-client";
import type { WsMessage } from "@/lib/types";

// ---------------------------------------------------------------------------
// Global terminal pool — one Terminal instance per session
// Survives component remounts; only disposed on explicit cleanup.
// Uses the default DOM renderer (not WebGL) to avoid context limit issues
// when running many sessions simultaneously.
// ---------------------------------------------------------------------------

interface TerminalEntry {
  term: Terminal;
  fitAddon: FitAddon;
  wsUnsub: (() => void) | null;
  inputDisposable: { dispose: () => void } | null;
  bufferLoaded: boolean;
}

const terminalPool = new Map<string, TerminalEntry>();

function getOrCreateTerminal(sessionId: string): TerminalEntry {
  const existing = terminalPool.get(sessionId);
  if (existing) return existing;

  const term = new Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily: "'Geist Mono', 'SF Mono', SFMono-Regular, ui-monospace, Menlo, monospace",
    theme: {
      background: "#050505",
      foreground: "#d4d4d4",
      cursor: "#4F8FF7",
      selectionBackground: "rgba(79, 143, 247, 0.25)",
      black: "#0a0a0a",
      brightBlack: "#525252",
      white: "#d4d4d4",
      brightWhite: "#f5f5f5",
    },
    scrollback: 50000,
    convertEol: true,
    smoothScrollDuration: 0,
    allowProposedApi: true,
  });

  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);

  // Wire terminal input -> WebSocket
  const inputDisposable = term.onData((data: string) => {
    wsClient.send({
      type: "terminal-input",
      sessionId,
      data,
    });
  });

  // Wire WebSocket output -> terminal
  const wsUnsub = wsClient.on("terminal-data", (msg: WsMessage) => {
    if (msg.sessionId === sessionId && msg.data) {
      term.write(msg.data);
    }
  });

  const entry: TerminalEntry = {
    term,
    fitAddon,
    wsUnsub,
    inputDisposable,
    bufferLoaded: false,
  };

  terminalPool.set(sessionId, entry);
  return entry;
}

/** Load the server-side buffer once per terminal lifetime */
function loadBufferOnce(sessionId: string, entry: TerminalEntry): void {
  if (entry.bufferLoaded) return;
  entry.bufferLoaded = true;

  fetch(`/api/sessions/${sessionId}/buffer`)
    .then((r) => (r.ok ? r.json() : null))
    .then((data: { buffer: string } | null) => {
      if (data?.buffer) {
        entry.term.write(data.buffer);
      }
    })
    .catch(() => {
      // Best effort
    });
}

/** Remove a terminal from the pool and dispose all resources */
export function disposeTerminal(sessionId: string): void {
  const entry = terminalPool.get(sessionId);
  if (!entry) return;
  entry.wsUnsub?.();
  entry.inputDisposable?.dispose();
  entry.fitAddon.dispose();
  entry.term.dispose();
  terminalPool.delete(sessionId);
}

// ---------------------------------------------------------------------------
// Component — attaches/detaches the pooled Terminal to the DOM
// ---------------------------------------------------------------------------

interface TerminalPaneV2Props {
  sessionId: string;
  visible?: boolean;
  fontSize?: number;
}

export function TerminalPaneV2({
  sessionId,
  visible = true,
  fontSize,
}: TerminalPaneV2Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const attachedRef = useRef<string | null>(null);

  const fitAndResize = useCallback(
    (entry: TerminalEntry) => {
      try {
        entry.fitAddon.fit();
        wsClient.send({
          type: "terminal-resize",
          sessionId,
          cols: entry.term.cols,
          rows: entry.term.rows,
        });
      } catch {
        // Ignore fit errors
      }
    },
    [sessionId],
  );

  // Attach terminal when sessionId changes (stays attached across visibility toggles)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const entry = getOrCreateTerminal(sessionId);

    // If a different terminal is currently attached, detach it
    if (attachedRef.current && attachedRef.current !== sessionId) {
      container.innerHTML = "";
    }

    // Open or re-parent the terminal into the container.
    // xterm.js v5 only allows open() once — for subsequent attaches, move
    // the existing DOM element instead of calling open() again.
    const openOrReparent = (el: HTMLDivElement, e: TerminalEntry) => {
      const termEl = e.term.element;
      if (termEl) {
        // Terminal was previously opened — just move its DOM into the container
        el.innerHTML = "";
        el.appendChild(termEl);
      } else {
        // First time — use open() to create DOM elements
        el.innerHTML = "";
        e.term.open(el);
      }
    };

    // Wait for container to have real dimensions before attaching terminal.
    // When there's only one session the layout may not have settled yet,
    // resulting in a 0×0 container and a blank black screen.
    const attachTerminal = () => {
      if (attachedRef.current === sessionId) return;
      const { offsetWidth, offsetHeight } = container;
      if (offsetWidth > 0 && offsetHeight > 0) {
        openOrReparent(container, entry);
        attachedRef.current = sessionId;
        loadBufferOnce(sessionId, entry);
        fitAndResize(entry);
      }
    };

    // Attach this terminal to the DOM
    let cleanupTimers: (() => void) | undefined;
    if (attachedRef.current !== sessionId) {
      // Try immediately, then retry with increasing delays until container is sized
      attachTerminal();
      const t0 = requestAnimationFrame(() => attachTerminal());
      const t1 = setTimeout(() => attachTerminal(), 50);
      const t2 = setTimeout(() => attachTerminal(), 150);
      const t3 = setTimeout(() => attachTerminal(), 400);
      // Final fallback — force attach even if container still reports 0 dims
      const fallbackTimer = setTimeout(() => {
        if (attachedRef.current !== sessionId) {
          openOrReparent(container, entry);
          attachedRef.current = sessionId;
          loadBufferOnce(sessionId, entry);
        }
        fitAndResize(entry);
      }, 800);

      cleanupTimers = () => {
        cancelAnimationFrame(t0);
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        clearTimeout(fallbackTimer);
      };
    }

    // Debounced resize observer — also handles the case where container
    // transitions from 0×0 to real dimensions
    let fitTimeout: ReturnType<typeof setTimeout> | null = null;
    const resizeObserver = new ResizeObserver(() => {
      // If terminal hasn't been attached yet and container now has dimensions, attach
      if (attachedRef.current !== sessionId) {
        attachTerminal();
      }
      if (fitTimeout) clearTimeout(fitTimeout);
      fitTimeout = setTimeout(() => fitAndResize(entry), 80);
    });
    resizeObserver.observe(container);

    // Listen for grid-wide refit events
    const refitHandler = () => fitAndResize(entry);
    window.addEventListener("terminal-refit", refitHandler);

    return () => {
      cleanupTimers?.();
      if (fitTimeout) clearTimeout(fitTimeout);
      resizeObserver.disconnect();
      window.removeEventListener("terminal-refit", refitHandler);
    };
  }, [sessionId, fitAndResize]);

  // Re-fit when becoming visible again (e.g. switching back to Sessions tab)
  useEffect(() => {
    if (!visible) return;
    const entry = terminalPool.get(sessionId);
    if (!entry) return;
    // Use rAF + fallback to ensure layout has settled after visibility change
    const raf = requestAnimationFrame(() => fitAndResize(entry));
    const fallback = setTimeout(() => fitAndResize(entry), 150);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fallback);
    };
  }, [visible, sessionId, fitAndResize]);

  // Apply font size changes
  useEffect(() => {
    if (!fontSize) return;
    const entry = terminalPool.get(sessionId);
    if (!entry) return;
    entry.term.options.fontSize = fontSize;
    requestAnimationFrame(() => {
      try {
        entry.fitAddon.fit();
        wsClient.send({
          type: "terminal-resize",
          sessionId,
          cols: entry.term.cols,
          rows: entry.term.rows,
        });
      } catch {
        // Ignore
      }
    });
  }, [fontSize, sessionId]);

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 overflow-hidden"
      style={{ backgroundColor: "#050505" }}
    />
  );
}
