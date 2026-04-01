const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("agentStudio", {
  sendNotification: (title, body) => ipcRenderer.send("send-notification", { title, body }),
  platform: process.platform,
  isElectron: true,
});
