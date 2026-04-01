const { app, BrowserWindow, Notification, Tray, Menu, nativeImage, ipcMain } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const net = require("net");

let mainWindow = null;
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

async function startServer() {
  const port = await findFreePort();
  serverPort = port;

  serverProcess = spawn("npx", ["tsx", path.join(__dirname, "..", "server", "index.ts")], {
    env: { ...process.env, PORT: String(port) },
    cwd: path.join(__dirname, ".."),
    stdio: "pipe",
  });

  serverProcess.stderr.on("data", (d) => process.stderr.write(d));

  // Wait for server ready
  return new Promise((resolve) => {
    const check = setInterval(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/config`);
        if (res.ok) {
          clearInterval(check);
          resolve(port);
        }
      } catch {
        // Server not ready yet
      }
    }, 500);
    setTimeout(() => {
      clearInterval(check);
      resolve(port);
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
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, "..", "public", "favicon-green.svg");
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
  await startServer();
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
