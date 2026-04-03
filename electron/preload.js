/**
 * Agent Studio — Electron Preload Script
 *
 * Exposes a safe IPC bridge to the renderer via window.electronAPI.
 * Uses contextBridge to enforce context isolation.
 *
 * Available channels:
 *   send-notification    renderer→main        Show native macOS notification
 *   set-badge-count      renderer→main        Set dock badge number
 *   show-file-dialog     renderer→main→renderer  Open native file picker
 *   server-status        main→renderer        Server status updates
 *   window-focus         main→renderer        Window focus notifications
 *   notification-action  main→renderer        Deep-link from notification click
 *   get-platform         renderer→main→renderer  Return process.platform
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // ---- Renderer → Main (fire-and-forget) ----

  /**
   * Show a native OS notification.
   * @param {string} title
   * @param {string} body
   * @param {object} [action] - Optional deep-link action sent back on click
   *   e.g. { type: "navigate", path: "/rooms/abc123" }
   */
  sendNotification: (title, body, action) =>
    ipcRenderer.send("send-notification", { title, body, action }),

  /**
   * Set the dock badge count (macOS) / taskbar overlay (Windows).
   * Pass 0 to clear.
   * @param {number} count
   */
  setBadgeCount: (count) => ipcRenderer.send("set-badge-count", count),

  // ---- Renderer → Main → Renderer (invoke/handle) ----

  /**
   * Open a native file picker dialog.
   * @param {object} [options] - Electron dialog.showOpenDialog options
   * @returns {Promise<string | null>} Selected file path, or null if canceled
   */
  showFileDialog: (options) => ipcRenderer.invoke("show-file-dialog", options),

  /**
   * Get the current platform string.
   * @returns {Promise<string>} e.g. "darwin", "win32", "linux"
   */
  getPlatform: () => ipcRenderer.invoke("get-platform"),

  // ---- Main → Renderer (listeners) ----

  /**
   * Subscribe to server status changes.
   * @param {(status: "starting" | "running" | "reconnecting" | "error") => void} callback
   * @returns {() => void} Unsubscribe function
   */
  onServerStatus: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on("server-status", handler);
    return () => ipcRenderer.removeListener("server-status", handler);
  },

  /**
   * Subscribe to window focus events.
   * @param {() => void} callback
   * @returns {() => void} Unsubscribe function
   */
  onWindowFocus: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("window-focus", handler);
    return () => ipcRenderer.removeListener("window-focus", handler);
  },

  /**
   * Subscribe to notification click actions (deep-link navigation).
   * @param {(action: object) => void} callback
   * @returns {() => void} Unsubscribe function
   */
  onNotificationAction: (callback) => {
    const handler = (_event, action) => callback(action);
    ipcRenderer.on("notification-action", handler);
    return () => ipcRenderer.removeListener("notification-action", handler);
  },

  // ---- Static info ----

  /** Whether we are running inside Electron. */
  isElectron: true,

  /** The platform we detected at preload time (sync). */
  platform: process.platform,
});
