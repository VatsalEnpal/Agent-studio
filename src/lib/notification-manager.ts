import { wsClient } from "./ws-client";
import { useToastStore } from "@/components/ui/notification-toast";
import { useUIStore } from "@/stores/ui";
import {
  getNotificationPrefs,
  notifyMention,
  notifyContextWarning,
  notifySessionExit,
} from "./notifications";
import type { WsMessage, ActiveMode, Session } from "./types";

// ---------------------------------------------------------------------------
// Electron API type (exposed via preload)
// ---------------------------------------------------------------------------

interface ElectronAPI {
  isElectron: boolean;
  sendNotification: (
    title: string,
    body: string,
    action?: { type: string; path: string },
  ) => void;
  setBadgeCount: (count: number) => void;
  onNotificationAction: (
    callback: (action: { type: string; path: string }) => void,
  ) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

// ---------------------------------------------------------------------------
// Badge state
// ---------------------------------------------------------------------------

interface BadgeCounts {
  rooms: number;
  sprints: number;
}

let badgeCounts: BadgeCounts = { rooms: 0, sprints: 0 };
let badgeUpdateCallback: ((counts: BadgeCounts) => void) | null = null;

function updateBadges(partial: Partial<BadgeCounts>) {
  badgeCounts = { ...badgeCounts, ...partial };
  badgeUpdateCallback?.(badgeCounts);

  // Update dock badge via Electron
  const total = badgeCounts.rooms + badgeCounts.sprints;
  if (typeof window !== "undefined" && window.electronAPI) {
    window.electronAPI.setBadgeCount(total);
  }
}

/**
 * Subscribe to badge count changes. Returns unsubscribe function.
 */
export function onBadgeUpdate(
  callback: (counts: BadgeCounts) => void,
): () => void {
  badgeUpdateCallback = callback;
  // Fire immediately with current state
  callback(badgeCounts);
  return () => {
    if (badgeUpdateCallback === callback) {
      badgeUpdateCallback = null;
    }
  };
}

/**
 * Get current badge counts (snapshot).
 */
export function getBadgeCounts(): BadgeCounts {
  return { ...badgeCounts };
}

// ---------------------------------------------------------------------------
// Navigation helper
// ---------------------------------------------------------------------------

function navigateTo(targetPage: ActiveMode, _targetId?: string) {
  useUIStore.getState().setActiveMode(targetPage);
  // Target ID selection is delegated to page-specific stores
  // (e.g., sessions store selectedId, rooms store selectedRoomId)
}

// ---------------------------------------------------------------------------
// Native notification helper
// ---------------------------------------------------------------------------

function sendNativeNotification(
  title: string,
  body: string,
  targetPage?: ActiveMode,
  targetId?: string,
) {
  if (typeof window === "undefined") return;

  if (window.electronAPI) {
    const action =
      targetPage
        ? { type: "navigate", path: `/${targetPage}${targetId ? `/${targetId}` : ""}` }
        : undefined;
    window.electronAPI.sendNotification(title, body, action);
  }
}

// ---------------------------------------------------------------------------
// WS event handlers
// ---------------------------------------------------------------------------

function handleRoomAgentStatus(msg: WsMessage) {
  const payload = msg.payload as {
    roomId?: string;
    roomName?: string;
    agentName?: string;
    status?: string;
  } | undefined;

  if (!payload || payload.status !== "needs_human") return;

  const roomName = payload.roomName ?? "Unknown room";
  const agentName = payload.agentName ?? "Agent";

  // Increment badge
  updateBadges({ rooms: badgeCounts.rooms + 1 });

  // Toast
  useToastStore.getState().addToast({
    type: "action-required",
    title: `${agentName} needs your input`,
    body: `In ${roomName}`,
    actions: [
      {
        label: "Go to Room",
        onClick: () => {
          updateBadges({ rooms: Math.max(0, badgeCounts.rooms - 1) });
          navigateTo("teams", payload.roomId);
        },
      },
    ],
  });

  // Native notification (respects prefs — this is an approval-like action)
  const prefs = getNotificationPrefs();
  if (prefs.approvals) {
    sendNativeNotification(
      `${agentName} needs your input`,
      `In ${roomName}`,
      "teams",
      payload.roomId,
    );
  }
}

function handleSprintUpdate(msg: WsMessage) {
  const payload = msg.payload as {
    sprintId?: string;
    sprintName?: string;
    status?: string;
    gateReady?: boolean;
    gateName?: string;
  } | undefined;

  if (!payload) return;

  const sprintName = payload.sprintName ?? "Sprint";

  if (payload.gateReady) {
    // Gate approval needed
    updateBadges({ sprints: badgeCounts.sprints + 1 });

    const gateName = payload.gateName ?? "Gate";

    useToastStore.getState().addToast({
      type: "action-required",
      title: `${gateName} ready for approval`,
      body: sprintName,
      actions: [
        {
          label: "Approve",
          onClick: () => {
            updateBadges({ sprints: Math.max(0, badgeCounts.sprints - 1) });
            navigateTo("sessions", payload.sprintId);
          },
        },
      ],
    });

    const prefs = getNotificationPrefs();
    if (prefs.approvals) {
      sendNativeNotification(
        `${gateName} ready for approval`,
        sprintName,
        "sessions",
        payload.sprintId,
      );
    }
  } else if (payload.status === "completed") {
    // Sprint completed
    useToastStore.getState().addToast({
      type: "success",
      title: `${sprintName} completed`,
    });

    const prefs = getNotificationPrefs();
    if (prefs.completion) {
      sendNativeNotification(
        `${sprintName} completed`,
        "Sprint finished successfully",
        "sessions",
        payload.sprintId,
      );
    }
  }
}

function handleRoomMessage(msg: WsMessage) {
  const payload = msg.payload as {
    roomId?: string;
    from?: string;
    text?: string;
  } | undefined;

  if (!payload || payload.from === "user" || !payload.text) return;

  const text = payload.text.toLowerCase();
  if (text.includes("@human") || text.includes("@user") || text.includes("@vatsal")) {
    const prefs = getNotificationPrefs();
    if (prefs.approvals) {
      // Use the native notification path
      notifyMention(
        payload.from ?? "Agent",
        (payload.text ?? "").slice(0, 100),
        payload.roomId,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Session exit tracking (for native notifications)
// ---------------------------------------------------------------------------

let previousSessionStatuses = new Map<string, string>();

function handleSessionsUpdate(msg: WsMessage) {
  const sessions = msg.payload as Session[] | undefined;
  if (!Array.isArray(sessions)) return;

  const prefs = getNotificationPrefs();

  for (const session of sessions) {
    const prevStatus = previousSessionStatuses.get(session.id);

    // Session just exited
    if (prevStatus && prevStatus !== "exited" && session.status === "exited" && prefs.sessionExit) {
      notifySessionExit(
        session.name,
        session.exitCode ?? -1,
        session.id,
      );
    }
  }

  // Update tracking map
  const newMap = new Map<string, string>();
  for (const session of sessions) {
    newMap.set(session.id, session.status);
  }
  previousSessionStatuses = newMap;
}

// ---------------------------------------------------------------------------
// Context window warning
// ---------------------------------------------------------------------------

const contextWarned = new Set<string>();

function handleUsageUpdate(msg: WsMessage) {
  const payload = msg.payload as {
    all?: Array<{ sessionId: string; contextPercent: number }>;
    managed?: Record<string, { contextPercent: number }>;
  } | undefined;

  if (!payload) return;

  const prefs = getNotificationPrefs();
  if (!prefs.contextWarning) return;

  // Check managed sessions for context >= 80%
  if (payload.managed) {
    for (const [sessionId, usage] of Object.entries(payload.managed)) {
      if (usage.contextPercent >= 80 && !contextWarned.has(sessionId)) {
        contextWarned.add(sessionId);
        notifyContextWarning(
          sessionId,
          Math.round(usage.contextPercent),
          sessionId,
        );
      }
    }
  }

  // Also check all sessions
  if (payload.all) {
    for (const usage of payload.all) {
      if (usage.contextPercent >= 80 && !contextWarned.has(usage.sessionId)) {
        contextWarned.add(usage.sessionId);
        notifyContextWarning(
          usage.sessionId,
          Math.round(usage.contextPercent),
          usage.sessionId,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Connection state toast (persistent error)
// ---------------------------------------------------------------------------

let connectionErrorToastId: string | null = null;

function handleConnectionState() {
  const unsub = wsClient.onConnectionChange((state) => {
    if (state === "reconnecting" && !connectionErrorToastId) {
      connectionErrorToastId = useToastStore.getState().addToast({
        type: "error",
        title: "Connection lost",
        body: "Attempting to reconnect to server...",
      });
    } else if (state === "connected" && connectionErrorToastId) {
      useToastStore.getState().dismissToast(connectionErrorToastId);
      connectionErrorToastId = null;
    }
  });

  return unsub;
}

// ---------------------------------------------------------------------------
// Electron deep-link handler
// ---------------------------------------------------------------------------

function setupElectronDeepLink(): (() => void) | undefined {
  if (typeof window === "undefined" || !window.electronAPI) return;

  return window.electronAPI.onNotificationAction((action) => {
    if (action.type === "navigate" && action.path) {
      // Parse path like "/teams/roomId"
      const parts = action.path.split("/").filter(Boolean);
      const page = parts[0] as ActiveMode | undefined;
      const id = parts[1];
      if (page) {
        navigateTo(page, id);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Public API — init / teardown
// ---------------------------------------------------------------------------

let cleanupFns: Array<() => void> = [];

/**
 * Initialize the notification manager. Call once at app startup.
 * Returns a cleanup function to tear down all listeners.
 */
export function initNotificationManager(): () => void {
  // Avoid double-init
  if (cleanupFns.length > 0) {
    teardownNotificationManager();
  }

  // WS event listeners
  cleanupFns.push(wsClient.on("room-agent-status", handleRoomAgentStatus));
  cleanupFns.push(wsClient.on("workflow-update", handleSprintUpdate));
  cleanupFns.push(wsClient.on("room-message", handleRoomMessage));
  cleanupFns.push(wsClient.on("sessions-update", handleSessionsUpdate));
  cleanupFns.push(wsClient.on("usage-update", handleUsageUpdate));

  // Connection state
  cleanupFns.push(handleConnectionState());

  // Electron deep links
  const electronCleanup = setupElectronDeepLink();
  if (electronCleanup) {
    cleanupFns.push(electronCleanup);
  }

  return teardownNotificationManager;
}

/**
 * Tear down all notification listeners.
 */
export function teardownNotificationManager(): void {
  for (const fn of cleanupFns) {
    fn();
  }
  cleanupFns = [];
  connectionErrorToastId = null;
  previousSessionStatuses = new Map();
  contextWarned.clear();
}
