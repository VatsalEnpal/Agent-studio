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
 */
export function useNotifications() {
  const sessions = useSessionsStore((s) => s.sessions);
  const addToast = useToastStore((s) => s.addToast);
  const prevSessionsRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const exitedSessions = sessions.filter((s) => s.status === "exited");
    const buildingSessions = sessions.filter((s) => s.status === "building" || s.status === "starting");
    const attentionCount = exitedSessions.length;

    // Determine favicon color
    let faviconColor: FaviconColor = "green";
    if (exitedSessions.length > 0) {
      faviconColor = "red";
    } else if (buildingSessions.length > 0) {
      faviconColor = "yellow";
    }

    setFavicon(faviconColor);
    updateTabTitle(attentionCount);

    // Detect newly exited sessions and fire toasts
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
          notifySessionExit(session.name, typeof code === "number" ? code : -1);
        }
      }
    }

    // Update the previous sessions map
    const newMap = new Map<string, string>();
    for (const session of sessions) {
      newMap.set(session.id, session.status);
    }
    prevSessionsRef.current = newMap;
  }, [sessions, addToast]);
}
