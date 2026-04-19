"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

import { wsClient } from "@/lib/ws-client";
import type { WsMessage } from "@/lib/types";
import { useToastStore } from "@/stores/toast";

const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MAX_DROP_BYTES = 10 * 1024 * 1024;

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
  topicUnsub: (() => void) | null;
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

  // Subscribe to this session's topic so the server routes terminal-data
  // frames here. Without this, only `global` frames would arrive.
  const topicUnsub = wsClient.subscribeTopic(`terminal:${sessionId}`);

  const entry: TerminalEntry = {
    term,
    fitAddon,
    wsUnsub,
    topicUnsub,
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
    .catch((e: unknown) => {
      console.error("Failed to load terminal buffer:", e);
    });
}

/** Remove a terminal from the pool and dispose all resources */
export function disposeTerminal(sessionId: string): void {
  const entry = terminalPool.get(sessionId);
  if (!entry) return;
  entry.wsUnsub?.();
  entry.topicUnsub?.();
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

export function TerminalPaneV2({ sessionId, visible = true, fontSize }: TerminalPaneV2Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const attachedRef = useRef<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragDepthRef = useRef(0);
  const addToast = useToastStore((s) => s.addToast);

  // Drag-and-drop handlers for image attachment.
  // Uses raw binary upload (Content-Type: image/<ext>, body = file bytes).
  // On success, inserts `@<absolute-path> ` into the PTY input so Claude Code
  // picks it up via the native @-path syntax.
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragDepthRef.current = 0;
      setIsDragOver(false);

      const files = e.dataTransfer?.files;
      const file = files?.[0];
      if (!file) return;

      const multiple = files && files.length > 1;

      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        addToast(
          `Unsupported file type "${file.type || "unknown"}". Drop a PNG, JPEG, GIF, or WebP.`,
          "error",
        );
        return;
      }
      if (file.size > MAX_DROP_BYTES) {
        addToast(
          `Image too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.`,
          "error",
        );
        return;
      }

      void (async () => {
        try {
          const res = await fetch("/api/terminal-images/upload", {
            method: "POST",
            headers: { "Content-Type": file.type },
            body: file,
          });
          const data = (await res.json()) as { ok?: boolean; path?: string; error?: string };
          if (!res.ok || !data.ok || !data.path) {
            throw new Error(data.error ?? `Upload failed (${res.status})`);
          }
          // Inject `@<path> ` into the PTY input. The server's WsMessage
          // "terminal-input" handler writes straight to the pty master, so
          // the text appears on the user's current input line whether they
          // are in bash or inside a claude prompt.
          wsClient.send({
            type: "terminal-input",
            sessionId,
            data: `@${data.path} `,
          });
          addToast(`Image attached: @${data.path}`, "success");
          if (multiple) {
            addToast("Only the first image was attached", "info");
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Upload failed";
          addToast(msg, "error");
        }
      })();
    },
    [sessionId, addToast],
  );

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
      } catch (e) {
        console.error("Failed to fit and resize terminal:", e);
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
      } catch (e) {
        console.error("Failed to fit terminal after font size change:", e);
      }
    });
  }, [fontSize, sessionId]);

  return (
    <div
      data-testid="terminal-drop-zone"
      className="flex-1 min-h-0 overflow-hidden relative"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div ref={containerRef} className="h-full w-full" style={{ backgroundColor: "#050505" }} />
      {isDragOver && (
        <div className="absolute inset-0 flex items-center justify-center bg-canvas/80 border-2 border-dashed border-sessions rounded-md pointer-events-none text-text-secondary text-sm font-medium z-10">
          Drop image to attach
        </div>
      )}
    </div>
  );
}
