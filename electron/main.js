const { app, BrowserWindow, Notification, Tray, Menu, nativeImage, ipcMain, dialog } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const net = require("net");

let mainWindow = null;
let splashWindow = null;
let tray = null;
let serverProcess = null;
let serverPort = 8080;

function findFreePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 300,
    height: 200,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    center: true,
    resizable: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  splashWindow.loadURL(`data:text/html;charset=utf-8,
    <html>
    <body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#0a0b0e;color:#f59e0b;font-family:monospace;border-radius:12px;border:1px solid #1e2028;">
      <div style="text-align:center">
        <div style="font-size:24px;margin-bottom:12px">⚡</div>
        <div style="font-size:14px;font-weight:600">Agent Studio</div>
        <div style="font-size:11px;color:#888;margin-top:8px">Starting server...</div>
      </div>
    </body>
    </html>
  `);
}

async function startServer() {
  const port = await findFreePort();
  serverPort = port;

  serverProcess = spawn("npx", ["tsx", path.join(__dirname, "..", "server", "index.ts")], {
    env: { ...process.env, PORT: String(port) },
    cwd: path.join(__dirname, ".."),
    stdio: "pipe",
  });

  serverProcess.stderr.on("data", (d) => process.stderr.write(d));

  return new Promise((resolve, reject) => {
    let resolved = false;

    // Listen for the "running on" message from stdout
    serverProcess.stdout.on("data", (data) => {
      const text = data.toString();
      process.stdout.write(text); // pass through for debugging

      if (!resolved && text.includes("Agent Studio running on")) {
        resolved = true;
        resolve(port);
      }
    });

    // Also poll as fallback (in case the message format changes)
    const check = setInterval(async () => {
      if (resolved) { clearInterval(check); return; }
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/config`);
        if (res.ok && !resolved) {
          resolved = true;
          clearInterval(check);
          resolve(port);
        }
      } catch {
        // Server not ready yet
      }
    }, 2000);

    // Handle server crash
    serverProcess.on("exit", (code) => {
      if (!resolved) {
        clearInterval(check);
        resolved = true;
        dialog.showErrorBox(
          "Agent Studio — Server Failed",
          `The server exited with code ${code}.\n\nTry running 'npm run dev' in the agent-studio directory to diagnose.`,
        );
        reject(new Error(`Server exited with code ${code}`));
      }
    });

    // Server boots in <2s now (API-first, Next.js compiles in background)
    setTimeout(() => {
      if (!resolved) {
        clearInterval(check);
        resolved = true;
        // Don't show error — just try to load anyway, server might be partially ready
        resolve(port);
      }
    }, 30000);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0a0b0e",
    icon: path.join(__dirname, "..", "public", "icon.png"),
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);

  // Show window once content is ready — avoids blank flash
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  // If page fails to load (server still booting), retry after 2s
  mainWindow.webContents.on("did-fail-load", (_event, _code, _desc, url) => {
    if (url.includes("127.0.0.1")) {
      setTimeout(() => {
        mainWindow?.loadURL(`http://127.0.0.1:${serverPort}`);
      }, 2000);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, "..", "public", "icon-tray.svg");
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon.resize({ width: 16, height: 16 }));
    tray.setToolTip("Agent Studio");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: "Open Agent Studio",
          click: () => {
            mainWindow?.show();
            mainWindow?.focus();
          },
        },
        { type: "separator" },
        { label: "Quit", click: () => app.quit() },
      ]),
    );
  } catch {
    // Tray icon failed — not critical
  }
}

// Notification IPC
ipcMain.on("send-notification", (_event, { title, body }) => {
  if (Notification.isSupported()) {
    const notif = new Notification({ title, body });
    notif.on("click", () => {
      mainWindow?.show();
      mainWindow?.focus();
    });
    notif.show();
  }
});

app.whenReady().then(async () => {
  createSplash();
  await startServer();
  if (splashWindow) { splashWindow.close(); splashWindow = null; }
  createWindow();
  createTray();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
