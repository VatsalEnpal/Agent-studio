/**
 * Agent Studio — Electron Main Process
 *
 * Responsibilities:
 *   1. Spawn the Express/Next.js server on a free port
 *   2. Health-check watchdog with crash recovery & exponential backoff
 *   3. Splash screen → main window lifecycle
 *   4. Tray icon with session list
 *   5. Graceful shutdown (SIGTERM → SIGKILL escalation)
 *   6. IPC handlers for notifications, badge, file dialog, platform info
 */

const {
  app,
  BrowserWindow,
  Notification,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  dialog,
} = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const net = require("net");
const fs = require("fs");
const http = require("http");
const os = require("os");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const APP_DIR = path.join(os.homedir(), ".agent-studio");
const LOG_PATH = path.join(APP_DIR, "server.log");
const WINDOW_STATE_PATH = path.join(APP_DIR, "window-state.json");

const HEALTH_POLL_INTERVAL_MS = 10_000;
const HEALTH_STARTUP_POLL_MS = 500;
const HEALTH_STARTUP_TIMEOUT_MS = 15_000;
const MAX_RESTART_ATTEMPTS = 5;
const MAX_BACKOFF_MS = 30_000;
const CONSECUTIVE_FAILURES_THRESHOLD = 3;
const SERVER_KILL_GRACE_MS = 3_000;
const DEFAULT_PORT_START = 8080;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {BrowserWindow | null} */
let splashWindow = null;
/** @type {Tray | null} */
let tray = null;
/** @type {import("child_process").ChildProcess | null} */
let serverProcess = null;
let serverPort = DEFAULT_PORT_START;

// Crash recovery
let restartAttempts = 0;
let currentBackoffMs = 1_000;
let restartTimer = null;

// Watchdog
let watchdogInterval = null;
let consecutiveHealthFailures = 0;

// macOS quit vs hide
let isQuitting = false;

// Server status pushed to renderer
let currentServerStatus = "starting"; // starting | running | reconnecting | error

// Log file stream
/** @type {fs.WriteStream | null} */
let logStream = null;

// Singleton lock
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the system `node` binary.  Inside Electron, process.execPath
 * points to the Electron binary, so we need to find the real Node.js
 * executable via PATH or well-known install locations.
 */
function resolveNodeBin() {
  const { execSync } = require("child_process");

  // 1. Check if an explicit NODE_PATH env was set (useful for packaged apps)
  if (process.env.AGENT_STUDIO_NODE_BIN && fs.existsSync(process.env.AGENT_STUDIO_NODE_BIN)) {
    return process.env.AGENT_STUDIO_NODE_BIN;
  }

  // 2. Try `which node` (works on macOS/Linux)
  try {
    const nodePath = execSync("which node", { encoding: "utf8", timeout: 3000 }).trim();
    if (nodePath && fs.existsSync(nodePath)) return nodePath;
  } catch {
    // which not available or node not in PATH
  }

  // 3. Try `where node` (Windows)
  try {
    const nodePath = execSync("where node", { encoding: "utf8", timeout: 3000 })
      .split("\n")[0]
      .trim();
    if (nodePath && fs.existsSync(nodePath)) return nodePath;
  } catch {
    // Not on Windows or node not in PATH
  }

  // 4. Well-known locations
  const candidates = [
    "/opt/homebrew/bin/node",       // macOS ARM (Homebrew)
    "/usr/local/bin/node",          // macOS Intel / Linux
    "/usr/bin/node",                // Linux system
    "C:\\Program Files\\nodejs\\node.exe",
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  // 5. Last resort: hope "node" is on the PATH at spawn time
  return "node";
}

/** Ensure ~/.agent-studio directory exists and open log stream. */
function initLogStream() {
  fs.mkdirSync(APP_DIR, { recursive: true });
  logStream = fs.createWriteStream(LOG_PATH, { flags: "a" });
  logStream.write(
    `\n--- Agent Studio starting at ${new Date().toISOString()} ---\n`,
  );
}

/** Write a line to the log file. */
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  if (logStream) logStream.write(line);
  process.stdout.write(line);
}

/**
 * Check whether a port is available by trying to bind to it.
 * Returns true if the port is free.
 */
function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.listen(port, "127.0.0.1", () => {
      srv.close(() => resolve(true));
    });
  });
}

/**
 * Find a free port starting from `start`, incrementing until one is found.
 */
async function findFreePort(start = DEFAULT_PORT_START) {
  let port = start;
  while (port < start + 100) {
    if (await isPortFree(port)) return port;
    port++;
  }
  // Fallback: let OS pick
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", (err) => reject(new Error(`Port fallback failed: ${err.message}`)));
    srv.listen(0, "127.0.0.1", () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
}

/**
 * HTTP GET helper that resolves to the parsed JSON body or rejects on
 * any error (network, non-200, timeout).
 */
function httpGetJson(urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      `http://127.0.0.1:${serverPort}${urlPath}`,
      { timeout: 3000 },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

/**
 * Check server health.  Tries /api/health first (returns session counts,
 * memory usage, etc.) and falls back to /api/config if the health route
 * is not yet registered.
 */
async function fetchHealth() {
  try {
    return await httpGetJson("/api/health");
  } catch (err) {
    // If the health endpoint returns 404, the route may not be mounted yet.
    // Fall back to /api/config which has always existed.
    if (err.message === "HTTP 404") {
      const cfg = await httpGetJson("/api/config");
      return { status: "ok", fallback: true, ...cfg };
    }
    throw err;
  }
}

/**
 * Read saved window position/size from disk.
 * Falls back to sensible defaults.
 */
function loadWindowState() {
  try {
    const raw = fs.readFileSync(WINDOW_STATE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    // Validate: must be an object with numeric width/height
    if (
      parsed == null ||
      typeof parsed !== "object" ||
      typeof parsed.width !== "number" ||
      typeof parsed.height !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Persist current window bounds. */
function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const bounds = mainWindow.getBounds();
    const isMaximized = mainWindow.isMaximized();
    fs.writeFileSync(
      WINDOW_STATE_PATH,
      JSON.stringify({ ...bounds, isMaximized }, null, 2),
    );
  } catch {
    // Non-critical
  }
}

/** Push server status to the renderer process. */
function setServerStatus(status) {
  currentServerStatus = status;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("server-status", status);
  }
}

// ---------------------------------------------------------------------------
// WebSocket Notification Listener
// ---------------------------------------------------------------------------

const WebSocket = require("ws");
let notifyWs = null;

function connectNotifyWs(port) {
  try {
    log(`[notify-ws] Connecting to ws://127.0.0.1:${port}/ws`);
    notifyWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    notifyWs.on("open", () => {
      log("[notify-ws] Connected");
    });
    notifyWs.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "room-needs-user" || msg.type === "room-agent-typing") {
          // Only notify on needs-user
          if (msg.type !== "room-needs-user") return;
          log(`[notify-ws] Agent needs user: ${JSON.stringify(msg.payload)}`);
          log(`[notify-ws] Notification.isSupported: ${Notification.isSupported()}`);
          if (Notification.isSupported()) {
            const agentId = msg.payload?.agentId ?? "An agent";
            const n = new Notification({
              title: "Agent Studio",
              body: msg.payload?.reason === "depth-limit"
                ? "Agent chain reached depth limit — your input needed"
                : `${agentId} mentioned you`,
              silent: false,
            });
            n.on("click", () => { if (mainWindow) mainWindow.focus(); });
            n.on("show", () => { log("[notify-ws] Notification shown"); });
            n.on("failed", (e) => { log(`[notify-ws] Notification failed: ${e}`); });
            n.show();
          } else {
            log("[notify-ws] Notifications not supported on this system");
          }
        }
      } catch (err) {
        log(`[notify-ws] Parse error: ${err.message}`);
      }
    });
    notifyWs.on("close", () => {
      log("[notify-ws] Disconnected, reconnecting in 5s");
      setTimeout(() => connectNotifyWs(port), 5000);
    });
    notifyWs.on("error", (err) => {
      log(`[notify-ws] Error: ${err.message}`);
    });
  } catch (err) {
    log(`[notify-ws] Failed to connect: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Server Lifecycle
// ---------------------------------------------------------------------------

async function startServer() {
  const port = await findFreePort(DEFAULT_PORT_START);
  serverPort = port;

  log(`Starting server on port ${port}`);
  setServerStatus("starting");

  // Resolve paths differently for development vs packaged app
  let serverEntry, cwd, spawnArgs;

  // Check if EXTERNAL_SERVER_PORT is set — skip spawning if so
  if (process.env.EXTERNAL_SERVER_PORT) {
    log(`Using external server on port ${process.env.EXTERNAL_SERVER_PORT}`);
    serverPort = parseInt(process.env.EXTERNAL_SERVER_PORT, 10);
    setServerStatus("running");
    return;
  }

  if (app.isPackaged) {
    // Packaged: use pre-compiled JS from dist-server/ (copied via extraResources)
    const appDir = path.join(process.resourcesPath, "app");
    const compiledEntry = path.join(appDir, "dist-server", "index.js");
    const tsEntry = path.join(appDir, "server", "index.ts");

    if (fs.existsSync(compiledEntry)) {
      // Pre-compiled server (preferred)
      serverEntry = compiledEntry;
      cwd = appDir;
      spawnArgs = [serverEntry];
      log("Using pre-compiled server: " + compiledEntry);
    } else if (fs.existsSync(tsEntry)) {
      // Fallback to tsx if compiled version missing
      serverEntry = tsEntry;
      cwd = appDir;
      spawnArgs = ["--import", "tsx", serverEntry];
      log("Using TypeScript server (tsx): " + tsEntry);
    } else {
      throw new Error(`No server found. Checked:\n  ${compiledEntry}\n  ${tsEntry}`);
    }
  } else {
    // Development: run from source via tsx
    serverEntry = path.join(__dirname, "..", "server", "index.ts");
    cwd = path.join(__dirname, "..");
    spawnArgs = ["--import", "tsx", serverEntry];
  }

  const nodeBin = resolveNodeBin();
  log(`Using node: ${nodeBin}, cwd: ${cwd}, entry: ${serverEntry}`);

  // Verify cwd exists before spawning
  if (!fs.existsSync(cwd)) {
    const err = `Server directory does not exist: ${cwd}`;
    log(err);
    throw new Error(err);
  }

  serverProcess = spawn(
    nodeBin,
    spawnArgs,
    {
      env: {
        ...process.env,
        PORT: String(port),
        NODE_ENV: app.isPackaged ? "production" : (process.env.NODE_ENV || "development"),
        // Electron GUI apps on macOS don't inherit terminal PATH.
        // Ensure common bin dirs are included so the server can find claude, git, etc.
        PATH: [
          path.join(os.homedir(), ".local", "bin"),
          path.join(os.homedir(), ".bun", "bin"),
          "/opt/homebrew/bin",
          "/opt/homebrew/sbin",
          "/usr/local/bin",
          "/usr/bin",
          "/bin",
          process.env.PATH || "",
        ].join(":"),
      },
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  // Pipe stdout/stderr to log file
  if (serverProcess.stdout) {
    serverProcess.stdout.on("data", (d) => {
      if (logStream) logStream.write(d);
    });
  }
  if (serverProcess.stderr) {
    serverProcess.stderr.on("data", (d) => {
      if (logStream) logStream.write(d);
    });
  }

  // Handle unexpected exit → crash recovery
  serverProcess.on("exit", (code, signal) => {
    log(`Server exited: code=${code} signal=${signal}`);
    serverProcess = null;

    // If we are quitting, do not restart
    if (isQuitting) return;

    setServerStatus("reconnecting");
    scheduleRestart();
  });

  // Poll /api/health until the server is ready (timeout: 15s)
  await waitForServerReady();

  // Server is up
  restartAttempts = 0;
  currentBackoffMs = 1_000;
  consecutiveHealthFailures = 0;
  setServerStatus("running");
  log(`Server is healthy on port ${port}`);

  // Connect WS to listen for agent notification events
  connectNotifyWs(port);
}

/**
 * Poll /api/health until a successful response or timeout.
 * Throws if the timeout is reached.
 */
function waitForServerReady() {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const poll = async () => {
      // If the server process died while we are waiting, bail
      if (!serverProcess) {
        return reject(new Error("Server process exited during startup"));
      }

      try {
        await fetchHealth();
        return resolve();
      } catch {
        if (Date.now() - start > HEALTH_STARTUP_TIMEOUT_MS) {
          return reject(
            new Error(
              `Server did not become healthy within ${HEALTH_STARTUP_TIMEOUT_MS / 1000}s`,
            ),
          );
        }
        setTimeout(poll, HEALTH_STARTUP_POLL_MS);
      }
    };

    poll();
  });
}

/** Schedule a server restart with exponential backoff. */
function scheduleRestart() {
  if (restartAttempts >= MAX_RESTART_ATTEMPTS) {
    log(`Max restart attempts (${MAX_RESTART_ATTEMPTS}) reached — giving up`);
    setServerStatus("error");
    dialog.showErrorBox(
      "Agent Studio — Server Failed",
      `The server has crashed ${MAX_RESTART_ATTEMPTS} times and will not be restarted.\n\n` +
        `Check the log at:\n${LOG_PATH}\n\n` +
        `Try running "npm run dev" in the project directory to diagnose.`,
    );
    return;
  }

  const delay = Math.min(currentBackoffMs, MAX_BACKOFF_MS);
  restartAttempts++;
  log(`Scheduling restart attempt ${restartAttempts}/${MAX_RESTART_ATTEMPTS} in ${delay}ms`);

  restartTimer = setTimeout(async () => {
    try {
      await startServer();
      // Reload main window to reconnect
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);
      }
    } catch (err) {
      log(`Restart attempt ${restartAttempts} failed: ${err.message}`);
      currentBackoffMs = Math.min(currentBackoffMs * 2, MAX_BACKOFF_MS);
      scheduleRestart();
    }
  }, delay);
}

// ---------------------------------------------------------------------------
// Health Check Watchdog
// ---------------------------------------------------------------------------

function startWatchdog() {
  watchdogInterval = setInterval(async () => {
    if (!serverProcess || isQuitting) return;

    try {
      const health = await fetchHealth();
      consecutiveHealthFailures = 0;

      // Reset backoff on successful health check
      restartAttempts = 0;
      currentBackoffMs = 1_000;

      if (currentServerStatus !== "running") {
        setServerStatus("running");
      }

      // Update tray tooltip and menu with session data
      if (tray) {
        const count = health.activeSessions ?? 0;
        const label =
          count === 0
            ? "Agent Studio — no active sessions"
            : `Agent Studio — ${count} active session${count > 1 ? "s" : ""}`;
        tray.setToolTip(label);

        // Rebuild tray menu with session list if the server provides it
        const sessions = Array.isArray(health.sessions) ? health.sessions : [];
        updateTrayMenu(sessions);
      }
    } catch {
      consecutiveHealthFailures++;
      log(
        `Health check failed (${consecutiveHealthFailures}/${CONSECUTIVE_FAILURES_THRESHOLD})`,
      );

      if (consecutiveHealthFailures >= CONSECUTIVE_FAILURES_THRESHOLD) {
        log("Consecutive health failures threshold reached — killing server");
        setServerStatus("reconnecting");
        forceKillServer();
        // The 'exit' handler on serverProcess will trigger scheduleRestart
      }
    }
  }, HEALTH_POLL_INTERVAL_MS);
}

function stopWatchdog() {
  if (watchdogInterval) {
    clearInterval(watchdogInterval);
    watchdogInterval = null;
  }
}

// ---------------------------------------------------------------------------
// Server Kill Helpers
// ---------------------------------------------------------------------------

function forceKillServer() {
  if (!serverProcess) return;
  try {
    serverProcess.kill("SIGKILL");
  } catch {
    // Already dead
  }
}

/**
 * Gracefully stop the server: SIGTERM, wait grace period, SIGKILL.
 * Returns a promise that resolves once the process is confirmed dead.
 */
function gracefulShutdownServer() {
  return new Promise((resolve) => {
    if (!serverProcess) return resolve();

    const proc = serverProcess;
    let resolved = false;
    let killTimer = null;
    let finalTimer = null;

    const done = () => {
      if (resolved) return;
      resolved = true;
      if (killTimer) clearTimeout(killTimer);
      if (finalTimer) clearTimeout(finalTimer);
      resolve();
    };

    // If the process exits on its own, resolve immediately
    proc.on("exit", done);

    try {
      proc.kill("SIGTERM");
    } catch {
      return done();
    }

    // Force kill after grace period
    killTimer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        // Already dead
      }
      // Give a tiny moment for the exit event to fire
      finalTimer = setTimeout(done, 200);
    }, SERVER_KILL_GRACE_MS);
  });
}

// ---------------------------------------------------------------------------
// Splash Screen
// ---------------------------------------------------------------------------

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 340,
    height: 220,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    center: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  splashWindow.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(`<!DOCTYPE html>
<html>
<body style="margin:0;display:flex;align-items:center;justify-content:center;
  height:100vh;background:#0a0b0e;color:#f59e0b;font-family:-apple-system,BlinkMacSystemFont,sans-serif;
  border-radius:12px;border:1px solid #1e2028;-webkit-app-region:drag;user-select:none;">
  <div style="text-align:center">
    <div style="font-size:28px;margin-bottom:12px">&#9889;</div>
    <div style="font-size:15px;font-weight:600;letter-spacing:0.5px">Agent Studio</div>
    <div style="font-size:11px;color:#888;margin-top:10px" id="status">Starting server...</div>
  </div>
</body>
</html>`)}`,
  );
}

// ---------------------------------------------------------------------------
// Main Window
// ---------------------------------------------------------------------------

function createWindow() {
  const saved = loadWindowState();

  const opts = {
    width: saved?.width || 1200,
    height: saved?.height || 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0a0b0e",
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  };

  // Restore position if we have it and the display still contains those coords
  if (saved?.x != null && saved?.y != null) {
    const { screen } = require("electron");
    const displays = screen.getAllDisplays();
    const visible = displays.some((d) => {
      const { x, y, width, height } = d.bounds;
      return (
        saved.x >= x &&
        saved.x < x + width &&
        saved.y >= y &&
        saved.y < y + height
      );
    });
    if (visible) {
      opts.x = saved.x;
      opts.y = saved.y;
    }
  }

  // Try to set icon (non-critical if missing)
  const iconPath = path.join(__dirname, "..", "public", "icon.png");
  if (fs.existsSync(iconPath)) {
    opts.icon = iconPath;
  }

  mainWindow = new BrowserWindow(opts);

  if (saved?.isMaximized) {
    mainWindow.maximize();
  }

  mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);

  mainWindow.once("ready-to-show", () => {
    if (mainWindow) mainWindow.show();
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
  });

  // Retry on load failure (server might still be starting after restart)
  mainWindow.webContents.on("did-fail-load", (_event, _code, _desc, url) => {
    if (url.includes("127.0.0.1") || url.includes("localhost")) {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);
        }
      }, 2000);
    }
  });

  // Notify renderer when window gains focus
  mainWindow.on("focus", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("window-focus");
    }
  });

  // Save window state on move/resize
  mainWindow.on("resize", saveWindowState);
  mainWindow.on("move", saveWindowState);

  // macOS: close window hides, Cmd+Q fully quits
  mainWindow.on("close", (e) => {
    if (process.platform === "darwin" && !isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// Tray Icon
// ---------------------------------------------------------------------------

function createTray() {
  try {
    const iconPath = path.join(__dirname, "..", "public", "icon-tray.svg");
    if (!fs.existsSync(iconPath)) {
      log("Tray icon not found, skipping tray creation");
      return;
    }

    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon.resize({ width: 16, height: 16 }));
    tray.setToolTip("Agent Studio");
    updateTrayMenu([]);
  } catch (err) {
    log(`Tray creation failed: ${err.message}`);
  }
}

/**
 * Rebuild the tray context menu.
 * @param {Array<{name: string, id: string}>} sessions - Active session list
 */
function updateTrayMenu(sessions = []) {
  if (!tray) return;

  const template = [
    {
      label: "Show Window",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      },
    },
    { type: "separator" },
  ];

  if (sessions.length > 0) {
    for (const s of sessions) {
      template.push({
        label: s.name || s.id || "Session",
        enabled: false, // informational
      });
    }
    template.push({ type: "separator" });
  } else {
    template.push({ label: "No active sessions", enabled: false });
    template.push({ type: "separator" });
  }

  template.push({
    label: "Quit",
    click: () => {
      isQuitting = true;
      app.quit();
    },
  });

  tray.setContextMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------------------
// IPC Handlers (Task 5.2 & 5.3)
// ---------------------------------------------------------------------------

// renderer→main: Show native notification
ipcMain.on("send-notification", (_event, { title, body, action }) => {
  if (!Notification.isSupported()) return;

  const notif = new Notification({ title, body });
  notif.on("click", () => {
    // Focus the main window
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
    // Send deep-link action back to renderer so it can navigate
    if (action && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("notification-action", action);
    }
  });
  notif.show();
});

// renderer→main: Set dock badge count
ipcMain.on("set-badge-count", (_event, count) => {
  if (typeof app.setBadgeCount === "function") {
    app.setBadgeCount(Number(count) || 0);
  }
});

// renderer→main→renderer: Open native file picker
ipcMain.handle("show-file-dialog", async (_event, options) => {
  const result = await dialog.showOpenDialog(mainWindow || undefined, {
    properties: ["openFile"],
    ...(options || {}),
  });
  return result.canceled ? null : result.filePaths[0] || null;
});

// renderer→main→renderer: Return process.platform
ipcMain.handle("get-platform", () => {
  return process.platform;
});

// ---------------------------------------------------------------------------
// App Lifecycle
// ---------------------------------------------------------------------------

// Enforce single instance
app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// macOS: re-show window when dock icon is clicked
app.on("activate", () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
});

// macOS: set isQuitting so the close handler allows the window to close
app.on("before-quit", () => {
  isQuitting = true;
});

// Non-macOS: quit when all windows closed
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    isQuitting = true;
    app.quit();
  }
});

// Graceful shutdown: stop watchdog, kill server
app.on("will-quit", (e) => {
  e.preventDefault();
  stopWatchdog();

  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  const cleanup = async () => {
    await gracefulShutdownServer();
    if (logStream) {
      logStream.write(
        `--- Agent Studio shutting down at ${new Date().toISOString()} ---\n`,
      );
      logStream.end();
      logStream = null;
    }
    // Now actually quit (won't re-trigger will-quit because we call exit)
    app.exit(0);
  };

  cleanup().catch(() => app.exit(1));
});

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  initLogStream();
  createSplash();

  try {
    if (process.env.EXTERNAL_SERVER_PORT) {
      // Developer mode: reuse externally started server
      serverPort = Number(process.env.EXTERNAL_SERVER_PORT);
      log(`Using external server on port ${serverPort}`);

      // Wait until the external server is reachable
      const start = Date.now();
      while (Date.now() - start < HEALTH_STARTUP_TIMEOUT_MS) {
        try {
          await fetchHealth();
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      setServerStatus("running");
    } else {
      await startServer();
    }
  } catch (err) {
    log(`Initial server start failed: ${err.message}`);
    setServerStatus("error");
    // Close splash before showing error dialog so it doesn't sit behind it
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    dialog.showErrorBox(
      "Agent Studio — Server Failed",
      `Could not start the server.\n\n${err.message}\n\nCheck ${LOG_PATH} for details.`,
    );
  }

  // Ensure splash is closed even if createWindow's ready-to-show never fires
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }

  createWindow();
  createTray();
  startWatchdog();
});
