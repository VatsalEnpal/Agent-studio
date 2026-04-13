"use client";

import { useEffect, useRef } from "react";
import { useSessionsStore } from "@/stores/sessions";
import { useToastStore } from "@/stores/toast";
import { notifySessionExit, getNotificationPrefs } from "@/lib/notifications";

type FaviconColor = "green" | "yellow" | "red";

function setFavicon(color: FaviconColor): void {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/svg+xml";
    document.head.appendChild(link);
  }
  link.href = `/favicon-${color}.svg`;
}

function updateTabTitle(attentionCount: number): void {
  if (attentionCount > 0) {
    document.title = `(${attentionCount}) Agent Studio`;
  } else {
    document.title = "Agent Studio";
  }
}

/**
 * Watches session state to:
 * - Update favicon color (green/yellow/red)
 * - Update tab title with attention count
 * - Fire toast notifications when sessions exit
 *
 * Badge logic: only exited sessions with a non-zero exit code that
 * have not yet been acknowledged count toward the tab badge.
 * A session is acknowledged once the exit toast has been shown.
 */
export function useNotifications() {
  const sessions = useSessionsStore((s) => s.sessions);
  const addToast = useToastStore((s) => s.addToast);
  const prevSessionsRef = useRef<Map<string, string>>(new Map());
  /** IDs of exited sessions whose toast has already fired. */
  const acknowledgedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const exitedSessions = sessions.filter((s) => s.status === "exited");
    const buildingSessions = sessions.filter(
      (s) => s.status === "building" || s.status === "starting",
    );

    // Detect newly exited sessions, fire toasts, and mark as acknowledged
    const prevMap = prevSessionsRef.current;
    for (const session of sessions) {
      const prevStatus = prevMap.get(session.id);
      if (prevStatus && prevStatus !== "exited" && session.status === "exited") {
        const code = session.exitCode != null ? session.exitCode : "unknown";
        addToast(
          `Session "${session.name}" ended (code ${code})`,
          session.exitCode === 0 ? "success" : "error",
        );
        // Fire native OS notification if enabled in prefs
        const prefs = getNotificationPrefs();
        if (prefs.sessionExit) {
          notifySessionExit(session.name, typeof code === "number" ? code : -1, session.id);
        }
        // Mark this session as acknowledged so it no longer counts toward the badge
        acknowledgedRef.current.add(session.id);
      }
    }

    // Clean up acknowledged set: remove IDs no longer present in the store
    const currentIds = new Set(sessions.map((s) => s.id));
    for (const id of acknowledgedRef.current) {
      if (!currentIds.has(id)) {
        acknowledgedRef.current.delete(id);
      }
    }

    // Only count exited sessions with errors that have NOT been acknowledged
    const unacknowledgedErrorSessions = exitedSessions.filter(
      (s) => s.exitCode !== 0 && !acknowledgedRef.current.has(s.id),
    );
    const attentionCount = unacknowledgedErrorSessions.length;

    // Determine favicon color
    let faviconColor: FaviconColor = "green";
    if (unacknowledgedErrorSessions.length > 0) {
      faviconColor = "red";
    } else if (buildingSessions.length > 0) {
      faviconColor = "yellow";
    }

    setFavicon(faviconColor);
    updateTabTitle(attentionCount);

    // Update the previous sessions map
    const newMap = new Map<string, string>();
    for (const session of sessions) {
      newMap.set(session.id, session.status);
    }
    prevSessionsRef.current = newMap;
  }, [sessions, addToast]);
}
