// Cross-platform notification helper
// Works in Electron (native macOS notifications) and browser (Web Notifications API)

interface NotifyOptions {
  title: string;
  body: string;
}

interface AgentStudioBridge {
  sendNotification: (title: string, body: string) => void;
  platform: string;
  isElectron: boolean;
}

declare global {
  interface Window {
    agentStudio?: AgentStudioBridge;
  }
}

const isElectron =
  typeof window !== "undefined" && window.agentStudio?.isElectron === true;

export function notify({ title, body }: NotifyOptions): void {
  if (isElectron) {
    window.agentStudio!.sendNotification(title, body);
  } else if (typeof window !== "undefined" && "Notification" in window) {
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

export function notifyApproval(agent: string, action: string): void {
  notify({
    title: "Approval needed",
    body: `${agent} wants to: ${action}`,
  });
}

export function notifyCompletion(agent: string, summary: string): void {
  notify({
    title: `${agent} finished`,
    body: summary,
  });
}

export function notifySessionExit(name: string, code: number): void {
  notify({
    title: code === 0 ? "Session done" : "Session exited",
    body: `${name} (exit ${code})`,
  });
}

export function notifyGate(gate: string, passed: boolean): void {
  notify({
    title: passed ? `${gate} passed` : `${gate} failed`,
    body: passed ? "Proceeding to next phase" : "Check the dashboard",
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
  sessionExit: false,
  contextWarning: false,
};

export function getNotificationPrefs(): NotificationPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const saved = localStorage.getItem("agent-studio-notification-prefs");
    if (saved) return JSON.parse(saved) as NotificationPrefs;
  } catch {
    // Corrupted — use defaults
  }
  return DEFAULT_PREFS;
}

export function saveNotificationPrefs(prefs: NotificationPrefs): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("agent-studio-notification-prefs", JSON.stringify(prefs));
}
