// Cross-platform notification helper
// Works in Electron (native macOS notifications) and browser (Web Notifications API)

import type { ActiveMode } from "./types";

interface NotifyOptions {
  title: string;
  body: string;
  /** Optional deep-link: which page to navigate to when the notification is clicked */
  targetPage?: ActiveMode;
  targetId?: string;
}

export function notify({
  title,
  body,
  targetPage,
  targetId,
}: NotifyOptions): void {
  if (typeof window === "undefined") return;

  // Electron path — uses the preload bridge at window.electronAPI
  if (window.electronAPI) {
    const action = targetPage
      ? {
          type: "navigate",
          path: `/${targetPage}${targetId ? `/${targetId}` : ""}`,
        }
      : undefined;
    window.electronAPI.sendNotification(title, body, action);
    return;
  }

  // Browser fallback — Web Notifications API
  if ("Notification" in window) {
    if (Notification.permission === "granted") {
      new window.Notification(title, { body });
    } else if (Notification.permission !== "denied") {
      void Notification.requestPermission().then((perm) => {
        if (perm === "granted") new window.Notification(title, { body });
      });
    }
  }
}

// --- Convenience functions ---

export function notifyMention(
  agent: string,
  snippet: string,
  roomId?: string,
): void {
  notify({
    title: `${agent} mentioned you`,
    body: snippet,
    targetPage: "teams",
    targetId: roomId,
  });
}

export function notifyApproval(
  agent: string,
  action: string,
  sprintId?: string,
): void {
  notify({
    title: "Approval needed",
    body: `${agent} wants to: ${action}`,
    targetPage: "sessions",
    targetId: sprintId,
  });
}

export function notifyCompletion(agent: string, summary: string): void {
  notify({
    title: `${agent} finished`,
    body: summary,
    targetPage: "sessions",
  });
}

export function notifySessionExit(
  name: string,
  code: number,
  sessionId?: string,
): void {
  notify({
    title: code === 0 ? "Session done" : "Session exited",
    body: `${name} (exit ${code})`,
    targetPage: "sessions",
    targetId: sessionId,
  });
}

export function notifyGate(
  gate: string,
  passed: boolean,
  sprintId?: string,
): void {
  notify({
    title: passed ? `${gate} passed` : `${gate} failed`,
    body: passed ? "Proceeding to next phase" : "Check the dashboard",
    targetPage: "sessions",
    targetId: sprintId,
  });
}

export function notifyContextWarning(
  sessionName: string,
  percent: number,
  sessionId?: string,
): void {
  notify({
    title: "Context window warning",
    body: `${sessionName} is at ${percent}% context`,
    targetPage: "sessions",
    targetId: sessionId,
  });
}

// --- Preference-aware helpers ---

export interface NotificationPrefs {
  approvals: boolean;
  dangerous: boolean;
  completion: boolean;
  sessionExit: boolean;
  contextWarning: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  approvals: true,
  dangerous: true,
  completion: true,
  sessionExit: true,
  contextWarning: true,
};

export function getNotificationPrefs(): NotificationPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const saved = localStorage.getItem("agent-studio-notification-prefs");
    if (saved) return JSON.parse(saved) as NotificationPrefs;
  } catch (e) {
    console.error(
      "Failed to parse notification preferences from localStorage:",
      e,
    );
  }
  return DEFAULT_PREFS;
}

export function saveNotificationPrefs(prefs: NotificationPrefs): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    "agent-studio-notification-prefs",
    JSON.stringify(prefs),
  );
}
