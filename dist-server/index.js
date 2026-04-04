"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server/index.ts
var import_express2 = __toESM(require("express"));
var import_node_http = require("node:http");
var import_next = __toESM(require("next"));
var import_ws = require("ws");

// server/terminal-manager.ts
var pty = __toESM(require("node-pty"));
var import_tree_kill = __toESM(require("tree-kill"));
var import_node_crypto = require("node:crypto");
var import_node_fs = require("node:fs");

// server/platform.ts
var import_node_os = __toESM(require("node:os"));
var import_node_child_process = require("node:child_process");
var import_node_path = __toESM(require("node:path"));
var IS_WINDOWS = import_node_os.default.platform() === "win32";
var IS_MAC = import_node_os.default.platform() === "darwin";
var IS_LINUX = import_node_os.default.platform() === "linux";
function whichCommand(cmd) {
  if (!/^[a-zA-Z0-9._-]+$/.test(cmd)) return null;
  try {
    const whichCmd = IS_WINDOWS ? "where" : "which";
    return (0, import_node_child_process.execSync)(`${whichCmd} ${cmd}`, { encoding: "utf-8", timeout: 3e3 }).trim().split("\n")[0];
  } catch {
    return null;
  }
}
function findNodeListeningPorts() {
  try {
    if (IS_WINDOWS) {
      const netstatRaw = (0, import_node_child_process.execSync)("netstat -ano | findstr LISTENING", {
        encoding: "utf-8",
        timeout: 5e3
      });
      const tasklistRaw = (0, import_node_child_process.execSync)('tasklist /fi "imagename eq node.exe" /fo csv /nh', {
        encoding: "utf-8",
        timeout: 5e3
      });
      const nodePids = /* @__PURE__ */ new Set();
      for (const line of tasklistRaw.split("\n")) {
        const parts = line.split('","');
        if (parts.length >= 2) {
          const pid = parseInt(parts[1]?.replace(/"/g, "") ?? "0", 10);
          if (pid > 0) nodePids.add(pid);
        }
      }
      const results = [];
      for (const line of netstatRaw.split("\n")) {
        const match = line.match(/:(\d+)\s+\S+\s+LISTENING\s+(\d+)/);
        if (match) {
          const pid = parseInt(match[2], 10);
          if (nodePids.has(pid)) {
            results.push({ pid, port: parseInt(match[1], 10), command: "node" });
          }
        }
      }
      return results;
    } else {
      const raw = (0, import_node_child_process.execSync)(
        "lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null | grep -i node || true",
        { encoding: "utf-8", timeout: 5e3 }
      ).trim();
      if (!raw) return [];
      const results = [];
      const seen = /* @__PURE__ */ new Set();
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        const parts = line.split(/\s+/);
        const pid = parseInt(parts[1], 10);
        if (isNaN(pid) || seen.has(pid)) continue;
        const portMatch = line.match(/:(\d+)\s+\(LISTEN\)/) ?? line.match(/:(\d+)$/);
        if (!portMatch) continue;
        const port2 = parseInt(portMatch[1], 10);
        if (isNaN(port2)) continue;
        seen.add(pid);
        results.push({ pid, port: port2, command: parts[0] ?? "node" });
      }
      return results;
    }
  } catch {
    return [];
  }
}
function findPortsForPid(pid) {
  try {
    if (IS_WINDOWS) {
      const raw = (0, import_node_child_process.execSync)(`netstat -ano | findstr LISTENING | findstr ${pid}`, {
        encoding: "utf-8",
        timeout: 5e3
      });
      const ports = [];
      for (const line of raw.split("\n")) {
        const match = line.match(/:(\d+)\s+\S+\s+LISTENING\s+(\d+)/);
        if (match && parseInt(match[2], 10) === pid) {
          ports.push(parseInt(match[1], 10));
        }
      }
      return ports;
    } else {
      const raw = (0, import_node_child_process.execSync)(
        `lsof -p ${pid} -iTCP -sTCP:LISTEN -P -n 2>/dev/null || true`,
        { encoding: "utf-8", timeout: 5e3 }
      ).trim();
      const ports = [];
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        const portMatch = line.match(/:(\d+)\s+\(LISTEN\)/) ?? line.match(/:(\d+)\s*$/);
        if (portMatch) {
          ports.push(parseInt(portMatch[1], 10));
        }
      }
      return ports;
    }
  } catch {
    return [];
  }
}
function getProcessCwd(pid) {
  try {
    if (IS_WINDOWS) {
      const raw = (0, import_node_child_process.execSync)(
        `wmic process where ProcessId=${pid} get ExecutablePath /format:list 2>nul || echo ""`,
        { encoding: "utf-8", timeout: 3e3 }
      );
      const match = raw.match(/ExecutablePath=(.+)/);
      return match ? import_node_path.default.dirname(match[1].trim()) : null;
    } else {
      const raw = (0, import_node_child_process.execSync)(
        `lsof -p ${pid} -Fn 2>/dev/null | grep "^ncwd" || lsof -p ${pid} -d cwd -Fn 2>/dev/null | tail -1 | sed 's/^n//'`,
        { encoding: "utf-8", timeout: 3e3 }
      );
      const cwd = raw.trim().replace(/^ncwd/, "").replace(/^n/, "");
      return cwd || null;
    }
  } catch {
    return null;
  }
}
function findChildPids(parentPid) {
  try {
    if (IS_WINDOWS) {
      const raw = (0, import_node_child_process.execSync)(
        `wmic process where (ParentProcessId=${parentPid}) get ProcessId /format:list 2>nul || echo ""`,
        { encoding: "utf-8", timeout: 3e3 }
      );
      const pids = [];
      for (const line of raw.split("\n")) {
        const match = line.match(/ProcessId=(\d+)/);
        if (match) {
          pids.push(parseInt(match[1], 10));
        }
      }
      return pids;
    } else {
      const raw = (0, import_node_child_process.execSync)(
        `pgrep -P ${parentPid} 2>/dev/null || true`,
        { encoding: "utf-8", timeout: 2e3 }
      );
      return raw.trim().split("\n").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n) && n > 0);
    }
  } catch {
    return [];
  }
}
function openInOS(target, app, callback) {
  const { execFile: ef } = require("node:child_process");
  const cb = callback ?? (() => {
  });
  if (IS_WINDOWS) {
    ef("cmd", ["/c", "start", "", target], cb);
  } else if (IS_MAC) {
    if (app) {
      ef("open", ["-a", app, target], cb);
    } else {
      ef("open", [target], cb);
    }
  } else {
    ef("xdg-open", [target], cb);
  }
}
function openTerminal(dir, callback) {
  const { execFile: ef } = require("node:child_process");
  const cb = callback ?? (() => {
  });
  if (IS_WINDOWS) {
    ef("cmd", ["/c", "start", "cmd", "/K", `cd /d "${dir}"`], cb);
  } else if (IS_MAC) {
    ef("open", ["-a", "Terminal", dir], cb);
  } else {
    ef("xdg-open", [dir], cb);
  }
}
function openVSCode(dir, callback) {
  const { execFile: ef } = require("node:child_process");
  const cb = callback ?? (() => {
  });
  ef("code", [dir], cb);
}
function killProcess(pid) {
  try {
    if (IS_WINDOWS) {
      (0, import_node_child_process.execSync)(`taskkill /F /PID ${pid} 2>nul`, { timeout: 3e3 });
    } else {
      process.kill(pid, "SIGTERM");
    }
    return true;
  } catch {
    return false;
  }
}
function killProcessGroup(pid) {
  try {
    if (IS_WINDOWS) {
      (0, import_node_child_process.execSync)(`taskkill /F /T /PID ${pid} 2>nul`, { timeout: 3e3 });
      return true;
    } else {
      try {
        process.kill(-pid, "SIGTERM");
        return true;
      } catch {
        try {
          process.kill(pid, "SIGTERM");
          return true;
        } catch {
          return false;
        }
      }
    }
  } catch {
    return false;
  }
}
function isAllowedPath(resolved) {
  const home = import_node_os.default.homedir();
  const tmp = import_node_os.default.tmpdir();
  if (IS_WINDOWS) {
    const normalizedResolved = resolved.toLowerCase();
    const normalizedHome = home.toLowerCase();
    const normalizedTmp = tmp.toLowerCase();
    return normalizedResolved.startsWith(normalizedHome) || normalizedResolved.startsWith(normalizedTmp);
  }
  return resolved.startsWith(home) || resolved.startsWith(tmp) || resolved.startsWith("/tmp");
}
function getDiskUsage() {
  try {
    if (IS_WINDOWS) {
      const raw = (0, import_node_child_process.execSync)("wmic logicaldisk where DeviceID='C:' get FreeSpace,Size /format:list 2>nul", {
        encoding: "utf-8",
        timeout: 3e3
      });
      const freeMatch = raw.match(/FreeSpace=(\d+)/);
      const sizeMatch = raw.match(/Size=(\d+)/);
      if (freeMatch && sizeMatch) {
        const free = parseInt(freeMatch[1], 10);
        const total = parseInt(sizeMatch[1], 10);
        const used = total - free;
        const totalGB = total / (1024 * 1024 * 1024);
        const usedGB = used / (1024 * 1024 * 1024);
        return {
          used: Math.round(usedGB * 100) / 100,
          total: Math.round(totalGB * 100) / 100,
          percentage: totalGB > 0 ? Math.round(usedGB / totalGB * 1e3) / 10 : 0
        };
      }
      return null;
    } else {
      const dfOutput = (0, import_node_child_process.execSync)("df -k /", { encoding: "utf-8", timeout: 3e3 });
      const lines = dfOutput.trim().split("\n");
      if (lines.length >= 2) {
        const parts = lines[1].split(/\s+/);
        const totalBlocks = parseInt(parts[1], 10) || 0;
        const usedBlocks = parseInt(parts[2], 10) || 0;
        const totalGB = totalBlocks / (1024 * 1024);
        const usedGB = usedBlocks / (1024 * 1024);
        return {
          used: Math.round(usedGB * 100) / 100,
          total: Math.round(totalGB * 100) / 100,
          percentage: totalGB > 0 ? Math.round(usedGB / totalGB * 1e3) / 10 : 0
        };
      }
      return null;
    }
  } catch {
    return null;
  }
}
function isSchedulerLoaded(serviceLabel) {
  if (!IS_MAC) return false;
  try {
    const result = (0, import_node_child_process.execSync)("launchctl list 2>/dev/null", {
      encoding: "utf-8",
      timeout: 5e3
    }).toString();
    return result.includes(serviceLabel);
  } catch {
    return false;
  }
}
function loadScheduler(plistPath) {
  if (!IS_MAC) return false;
  try {
    (0, import_node_child_process.execSync)(`launchctl load "${plistPath}" 2>/dev/null || true`, { timeout: 5e3 });
    return true;
  } catch {
    return false;
  }
}
function unloadScheduler(plistPath) {
  if (!IS_MAC) return false;
  try {
    (0, import_node_child_process.execSync)(`launchctl unload "${plistPath}" 2>/dev/null || true`, { timeout: 5e3 });
    return true;
  } catch {
    return false;
  }
}

// server/terminal-manager.ts
var ALLOWED_COMMANDS = /* @__PURE__ */ new Set([
  "claude",
  "bash",
  "sh",
  "zsh",
  "node",
  "python",
  "python3",
  ...IS_WINDOWS ? ["powershell.exe", "cmd.exe", "pwsh.exe"] : []
]);
function resolveCommand(cmd) {
  if (cmd.startsWith("/") || IS_WINDOWS && /^[a-zA-Z]:\\/.test(cmd)) return cmd;
  return whichCommand(cmd) ?? cmd;
}
var MAX_BUFFER_SIZE = 100 * 1024;
var TerminalManager = class {
  sessions = /* @__PURE__ */ new Map();
  listeners = /* @__PURE__ */ new Set();
  spawnCount = 0;
  maxConcurrentSpawns = 4;
  createSession(opts) {
    if (this.spawnCount >= this.maxConcurrentSpawns) {
      console.warn(`[terminal-manager] Spawn limit reached (${this.spawnCount}/${this.maxConcurrentSpawns}). Spawning anyway.`);
    }
    this.spawnCount++;
    try {
      const session = this._doCreateSession(opts);
      return session;
    } catch (err) {
      this.spawnCount--;
      throw err;
    }
  }
  _doCreateSession(opts) {
    const id = (0, import_node_crypto.randomUUID)();
    const command = opts.command ?? "claude";
    const baseCommand = command.split("/").pop() ?? command;
    if (!ALLOWED_COMMANDS.has(baseCommand)) {
      throw new Error(
        `Command "${baseCommand}" is not allowed. Allowed: ${[...ALLOWED_COMMANDS].join(", ")}`
      );
    }
    const args = opts.args ?? ["--dangerously-skip-permissions"];
    const cwd = opts.cwd ?? process.cwd();
    if (!(0, import_node_fs.existsSync)(cwd)) {
      throw new Error(`Working directory does not exist: ${cwd}`);
    }
    const cols = opts.cols ?? 120;
    const rows = opts.rows ?? 30;
    const env = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== void 0) {
        env[key] = value;
      }
    }
    env["TERM"] = "xterm-256color";
    const resolvedCommand = resolveCommand(command);
    const ptyProcess = pty.spawn(resolvedCommand, args, {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env
    });
    const session = {
      id,
      name: opts.name,
      pid: ptyProcess.pid,
      command,
      args,
      cwd,
      status: "active",
      createdAt: Date.now(),
      meta: opts.meta
    };
    const entry = { session, pty: ptyProcess, outputBuffer: "", ready: false, pendingWrites: [] };
    this.sessions.set(id, entry);
    let pending = "";
    let flushTimer = null;
    ptyProcess.onData((data) => {
      try {
        entry.outputBuffer += data;
        if (entry.outputBuffer.length > MAX_BUFFER_SIZE) {
          entry.outputBuffer = entry.outputBuffer.slice(-MAX_BUFFER_SIZE);
        }
        if (!entry.ready) {
          const bufferTail = entry.outputBuffer.slice(-500);
          if (/[>$❯%]\s*$/.test(bufferTail) || bufferTail.includes("Claude Code")) {
            entry.ready = true;
            for (const pendingWrite of entry.pendingWrites) {
              ptyProcess.write(pendingWrite);
            }
            entry.pendingWrites = [];
          }
        }
        pending += data;
        if (!flushTimer) {
          flushTimer = setTimeout(() => {
            if (pending) {
              this.emit({
                type: "terminal-data",
                sessionId: id,
                data: pending
              });
              pending = "";
            }
            flushTimer = null;
          }, 50);
        }
      } catch {
      }
    });
    ptyProcess.onExit(({ exitCode }) => {
      try {
        if (pending) {
          this.emit({
            type: "terminal-data",
            sessionId: id,
            data: pending
          });
          pending = "";
        }
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        const entry2 = this.sessions.get(id);
        if (entry2) {
          entry2.session.status = "exited";
          entry2.session.exitCode = exitCode;
        }
        this.spawnCount--;
        this.emit({
          type: "sessions-update",
          payload: this.listSessions()
        });
      } catch {
      }
    });
    this.emit({
      type: "sessions-update",
      payload: this.listSessions()
    });
    setTimeout(() => {
      if (!entry.ready) {
        entry.ready = true;
        for (const pendingWrite of entry.pendingWrites) {
          ptyProcess.write(pendingWrite);
        }
        entry.pendingWrites = [];
      }
    }, 15e3);
    return session;
  }
  writeToSession(id, data) {
    const entry = this.sessions.get(id);
    if (!entry) {
      throw new Error(`Session ${id} not found`);
    }
    if (!entry.ready) {
      entry.pendingWrites.push(data);
      return;
    }
    entry.pty.write(data);
  }
  resizeSession(id, cols, rows) {
    const entry = this.sessions.get(id);
    if (!entry) {
      throw new Error(`Session ${id} not found`);
    }
    entry.pty.resize(cols, rows);
  }
  killSession(id) {
    const entry = this.sessions.get(id);
    if (!entry) {
      throw new Error(`Session ${id} not found`);
    }
    const pid = entry.session.pid;
    try {
      entry.pty.kill("SIGTERM");
    } catch {
    }
    setTimeout(() => {
      if (entry.session.status !== "exited" && pid) {
        (0, import_tree_kill.default)(pid, "SIGKILL", (err) => {
          if (err) {
          }
        });
      }
    }, 2e3);
    setTimeout(() => {
      if (this.sessions.has(id)) {
        entry.session.status = "exited";
        this.sessions.delete(id);
        this.emit({
          type: "sessions-update",
          payload: this.listSessions()
        });
      }
    }, 3500);
  }
  listSessions() {
    return Array.from(this.sessions.values()).map((entry) => entry.session);
  }
  onEvent(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  getSessionBuffer(id) {
    const entry = this.sessions.get(id);
    return entry?.outputBuffer ?? null;
  }
  emit(message) {
    for (const listener of this.listeners) {
      listener(message);
    }
  }
};

// server/process-discovery.ts
var import_node_child_process2 = require("node:child_process");

// server/session-usage.ts
var import_node_fs2 = require("node:fs");
var import_node_path2 = require("node:path");
var import_node_os2 = require("node:os");
var PRICING = {
  opus: { input: 15, output: 75, cacheRead: 1.5 },
  sonnet: { input: 3, output: 15, cacheRead: 0.3 },
  haiku: { input: 0.25, output: 1.25, cacheRead: 0.025 }
};
var CONTEXT_WINDOW = {
  opus: 1e6,
  sonnet: 1e6,
  haiku: 2e5,
  unknown: 2e5
};
function detectModelShort(model) {
  const lower = model.toLowerCase();
  if (lower.includes("opus")) return "opus";
  if (lower.includes("sonnet")) return "sonnet";
  if (lower.includes("haiku")) return "haiku";
  return "unknown";
}
function calculateCost(modelShort, inputTokens, outputTokens, cacheCreation, cacheRead) {
  const tier = PRICING[modelShort] ?? PRICING["sonnet"];
  const inputCost = (inputTokens + cacheCreation) / 1e6 * tier.input;
  const outputCost = outputTokens / 1e6 * tier.output;
  const cacheReadCost = cacheRead / 1e6 * tier.cacheRead;
  return inputCost + outputCost + cacheReadCost;
}
function readSessionFiles() {
  const sessionsDir = (0, import_node_path2.join)((0, import_node_os2.homedir)(), ".claude", "sessions");
  const map = /* @__PURE__ */ new Map();
  if (!(0, import_node_fs2.existsSync)(sessionsDir)) return map;
  try {
    const files = (0, import_node_fs2.readdirSync)(sessionsDir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const raw = (0, import_node_fs2.readFileSync)((0, import_node_path2.join)(sessionsDir, file), "utf-8");
        const data = JSON.parse(raw);
        if (data.pid && data.sessionId) {
          map.set(data.pid, data);
        }
      } catch {
      }
    }
  } catch {
  }
  return map;
}
function findJsonlFile(sessionId) {
  const projectsDir = (0, import_node_path2.join)((0, import_node_os2.homedir)(), ".claude", "projects");
  if (!(0, import_node_fs2.existsSync)(projectsDir)) return null;
  try {
    const projectDirs = (0, import_node_fs2.readdirSync)(projectsDir);
    for (const dir of projectDirs) {
      const jsonlPath = (0, import_node_path2.join)(projectsDir, dir, `${sessionId}.jsonl`);
      if ((0, import_node_fs2.existsSync)(jsonlPath)) {
        return jsonlPath;
      }
    }
  } catch {
  }
  return null;
}
var usageCache = /* @__PURE__ */ new Map();
function parseJsonlUsage(jsonlPath, pid, sessionId, cwd, startedAt) {
  try {
    const raw = (0, import_node_fs2.readFileSync)(jsonlPath, "utf-8");
    const cached = usageCache.get(sessionId);
    if (cached && cached.byteOffset === raw.length) {
      return cached.usage;
    }
    const startOffset = cached?.byteOffset ?? 0;
    const newContent = startOffset > 0 ? raw.slice(startOffset) : raw;
    let totalInput = cached?.usage.totalInputTokens ?? 0;
    let totalOutput = cached?.usage.totalOutputTokens ?? 0;
    let cacheCreation = cached?.usage.cacheCreationTokens ?? 0;
    let cacheRead = cached?.usage.cacheReadTokens ?? 0;
    let messageCount = cached?.usage.messageCount ?? 0;
    let model = cached?.usage.model ?? "";
    let lastInputTokens = cached?.usage.contextUsed ?? 0;
    let lastCacheReadTokens = 0;
    const lines = newContent.split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.type === "assistant" && entry.message?.usage) {
          const u = entry.message.usage;
          totalInput += u.input_tokens ?? 0;
          totalOutput += u.output_tokens ?? 0;
          cacheCreation += u.cache_creation_input_tokens ?? 0;
          cacheRead += u.cache_read_input_tokens ?? 0;
          messageCount++;
          lastInputTokens = u.input_tokens ?? 0;
          lastCacheReadTokens = u.cache_read_input_tokens ?? 0;
          if (entry.message.model) {
            model = entry.message.model;
          }
        }
      } catch {
      }
    }
    const modelShort = detectModelShort(model);
    const totalCost = calculateCost(
      modelShort,
      totalInput,
      totalOutput,
      cacheCreation,
      cacheRead
    );
    const contextUsed = lastCacheReadTokens + lastInputTokens;
    const contextTotal = CONTEXT_WINDOW[modelShort] ?? CONTEXT_WINDOW["unknown"];
    const contextPercent = contextTotal > 0 ? Math.min(100, Math.round(contextUsed / contextTotal * 100)) : 0;
    const usage = {
      pid,
      sessionId,
      cwd,
      model,
      modelShort,
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      cacheCreationTokens: cacheCreation,
      cacheReadTokens: cacheRead,
      totalCost,
      totalTokens: totalInput + totalOutput + cacheCreation + cacheRead,
      startedAt,
      messageCount,
      contextUsed,
      contextTotal,
      contextPercent
    };
    usageCache.set(sessionId, { byteOffset: raw.length, usage });
    return usage;
  } catch {
    return null;
  }
}
function getSessionUsage(pid) {
  const sessionFiles = readSessionFiles();
  const sessionFile = sessionFiles.get(pid);
  if (!sessionFile) return null;
  const jsonlPath = findJsonlFile(sessionFile.sessionId);
  if (!jsonlPath) return null;
  return parseJsonlUsage(
    jsonlPath,
    pid,
    sessionFile.sessionId,
    sessionFile.cwd,
    sessionFile.startedAt
  );
}
function getAllSessionUsage() {
  const sessionFiles = readSessionFiles();
  const results = [];
  for (const [pid, sessionFile] of sessionFiles) {
    const jsonlPath = findJsonlFile(sessionFile.sessionId);
    if (!jsonlPath) continue;
    const usage = parseJsonlUsage(
      jsonlPath,
      pid,
      sessionFile.sessionId,
      sessionFile.cwd,
      sessionFile.startedAt
    );
    if (usage) {
      results.push(usage);
    }
  }
  return results;
}
function getUsageBySessionId(sessionId) {
  const jsonlPath = findJsonlFile(sessionId);
  if (!jsonlPath) return null;
  const sessionFiles = readSessionFiles();
  for (const [pid, sf] of sessionFiles) {
    if (sf.sessionId === sessionId) {
      return parseJsonlUsage(jsonlPath, pid, sessionId, sf.cwd, sf.startedAt);
    }
  }
  return parseJsonlUsage(jsonlPath, 0, sessionId, "", Date.now());
}
function findSessionIdForPtyPid(ptyPid) {
  const sessionFiles = readSessionFiles();
  if (sessionFiles.has(ptyPid)) {
    return sessionFiles.get(ptyPid).sessionId;
  }
  const childPids = findChildPids(ptyPid);
  for (const childPid of childPids) {
    if (sessionFiles.has(childPid)) {
      return sessionFiles.get(childPid).sessionId;
    }
    const grandPids = findChildPids(childPid);
    for (const gp of grandPids) {
      if (sessionFiles.has(gp)) {
        return sessionFiles.get(gp).sessionId;
      }
    }
  }
  return null;
}
function formatCost(cost) {
  if (cost < 0.01) return "$0.00";
  if (cost < 1) return `$${cost.toFixed(2)}`;
  if (cost < 10) return `$${cost.toFixed(2)}`;
  return `$${cost.toFixed(1)}`;
}
function formatTokens(tokens) {
  if (tokens < 1e3) return `${tokens}`;
  if (tokens < 1e6) return `${(tokens / 1e3).toFixed(1)}K`;
  return `${(tokens / 1e6).toFixed(2)}M`;
}

// server/process-discovery.ts
function discoverClaudeProcesses() {
  try {
    const processes = [];
    const myPid = process.pid;
    const parentPid = process.ppid;
    if (IS_WINDOWS) {
      let raw;
      try {
        raw = (0, import_node_child_process2.execSync)(
          'tasklist /v /fo csv | findstr /i "claude"',
          { encoding: "utf-8", timeout: 5e3 }
        );
      } catch {
        return [];
      }
      for (const line of raw.trim().split("\n")) {
        if (!line.trim()) continue;
        const parts = line.split('","');
        if (parts.length < 2) continue;
        const name = parts[0]?.replace(/^"/, "") ?? "";
        const pid = parseInt(parts[1] ?? "0", 10);
        if (pid <= 0 || pid === myPid || pid === parentPid) continue;
        if (!name.toLowerCase().includes("claude")) continue;
        const cwd = getProcessCwd(pid) ?? "unknown";
        const proc = {
          pid,
          command: name,
          args: "",
          cwd,
          startTime: "",
          user: ""
        };
        const usage = getSessionUsage(pid);
        if (usage) {
          proc.model = usage.model;
          proc.modelShort = usage.modelShort;
          proc.cost = formatCost(usage.totalCost);
          proc.tokens = formatTokens(usage.totalTokens);
          proc.totalCost = usage.totalCost;
          proc.totalTokens = usage.totalTokens;
          proc.sessionId = usage.sessionId;
        }
        processes.push(proc);
      }
    } else {
      const raw = (0, import_node_child_process2.execSync)(
        'ps -eo pid,user,lstart,command | grep -i "[c]laude"',
        { encoding: "utf-8", timeout: 5e3 }
      );
      for (const line of raw.trim().split("\n")) {
        if (!line.trim()) continue;
        const match = line.trim().match(
          /^\s*(\d+)\s+(\S+)\s+(\w+\s+\w+\s+\d+\s+[\d:]+\s+\d+)\s+(.+)$/
        );
        if (!match) continue;
        const pid = parseInt(match[1], 10);
        const user = match[2];
        const startTime = match[3];
        const fullCommand = match[4];
        if (pid === myPid || pid === parentPid) continue;
        if (fullCommand.includes("chrome-native-host") || fullCommand.includes("bun run") || fullCommand.includes("grep") || fullCommand.includes("Claude.app/Contents") || fullCommand.includes(".claude/shell-snapshots") || fullCommand.includes(".claude/plugins")) {
          continue;
        }
        const cmdBase = fullCommand.split(/\s+/)[0];
        if (!cmdBase?.endsWith("claude") && !cmdBase?.endsWith("claude-code")) {
          continue;
        }
        const cwd = getProcessCwd(pid) ?? "unknown";
        const parts = fullCommand.split(/\s+/);
        const command = parts[0];
        const args = parts.slice(1).join(" ");
        const proc = {
          pid,
          command,
          args,
          cwd,
          startTime,
          user
        };
        const usage = getSessionUsage(pid);
        if (usage) {
          proc.model = usage.model;
          proc.modelShort = usage.modelShort;
          proc.cost = formatCost(usage.totalCost);
          proc.tokens = formatTokens(usage.totalTokens);
          proc.totalCost = usage.totalCost;
          proc.totalTokens = usage.totalTokens;
          proc.sessionId = usage.sessionId;
        }
        processes.push(proc);
      }
    }
    return processes;
  } catch {
    return [];
  }
}

// server/file-watcher.ts
var import_chokidar = require("chokidar");
var import_promises = require("node:fs/promises");
var import_node_path4 = require("node:path");

// server/config.ts
var import_node_fs3 = require("node:fs");
var import_node_path3 = require("node:path");
var import_node_os3 = __toESM(require("node:os"));
var CONFIG_FILENAME = ".agent-studio.json";
var CONFIG_VERSION = "1.0.0";
function getConfigPath() {
  return (0, import_node_path3.join)(process.cwd(), CONFIG_FILENAME);
}
function loadConfig() {
  const configPath = getConfigPath();
  if (!(0, import_node_fs3.existsSync)(configPath)) return null;
  try {
    const raw = (0, import_node_fs3.readFileSync)(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.projects)) parsed.projects = [];
    if (!parsed.version) parsed.version = CONFIG_VERSION;
    if (!parsed.defaults) {
      parsed.defaults = { model: "sonnet", permissions: "bypass", workingDirectory: "~" };
    }
    if (!Array.isArray(parsed.devServers)) parsed.devServers = [];
    return parsed;
  } catch {
    return null;
  }
}
function saveConfig(config) {
  const configPath = getConfigPath();
  (0, import_node_fs3.writeFileSync)(configPath, JSON.stringify(config, null, 2), "utf-8");
}
function generateDefaultConfig() {
  const cwd = process.cwd();
  const parentDir = (0, import_node_path3.join)(cwd, "..");
  const projects = [];
  if ((0, import_node_fs3.existsSync)((0, import_node_path3.join)(parentDir, ".git"))) {
    const parentName = parentDir.split(import_node_path3.sep).pop() ?? "main-project";
    projects.push({
      name: parentName,
      path: parentDir,
      isProd: false,
      trackedBranches: detectTrackedBranches(parentDir)
    });
  }
  if ((0, import_node_fs3.existsSync)((0, import_node_path3.join)(cwd, ".git")) && cwd !== parentDir) {
    const cwdName = cwd.split(import_node_path3.sep).pop() ?? "project";
    if (!projects.some((p) => p.path === cwd)) {
      projects.push({
        name: cwdName,
        path: cwd,
        isProd: false,
        trackedBranches: detectTrackedBranches(cwd)
      });
    }
  }
  let agentSystem;
  const agentSystemPath = (0, import_node_path3.join)(parentDir, "ai-agents");
  if ((0, import_node_fs3.existsSync)(agentSystemPath)) {
    agentSystem = {
      path: agentSystemPath,
      memoryIndex: "tools/memory_index.json",
      sprintDir: "sprints/",
      scanLog: "sprints/scan_log.md"
    };
  }
  const devServers = [];
  for (const proj of projects) {
    if (!proj.isProd && (0, import_node_fs3.existsSync)((0, import_node_path3.join)(proj.path, "package.json"))) {
      devServers.push({
        name: proj.name,
        path: proj.path,
        command: "npm run dev"
      });
    }
  }
  const home = import_node_os3.default.homedir();
  const workingDirectory = (projects[0]?.path ?? parentDir).replace(home, "~");
  const hasProjects = projects.length > 0;
  const hasAgentSystem = !!agentSystem;
  const setupComplete = hasProjects || hasAgentSystem;
  return {
    projects,
    agentSystem,
    devServers,
    defaults: {
      model: "sonnet",
      permissions: "bypass",
      workingDirectory
    },
    setupComplete,
    version: CONFIG_VERSION
  };
}
function detectTrackedBranches(repoPath) {
  const branches = ["main"];
  try {
    const { execSync: execSync7 } = require("node:child_process");
    const raw = execSync7("git branch --list --format='%(refname:short)'", {
      cwd: repoPath,
      encoding: "utf-8",
      timeout: 3e3
    }).trim();
    const all = raw.split("\n").map((b) => b.trim().replace(/^'|'$/g, "")).filter(Boolean);
    for (const name of all) {
      if (!branches.includes(name)) branches.push(name);
    }
  } catch {
  }
  return branches;
}
var _cachedConfig = null;
function getConfig() {
  if (_cachedConfig) return _cachedConfig;
  let config = loadConfig();
  if (!config) {
    config = generateDefaultConfig();
    saveConfig(config);
  }
  _cachedConfig = config;
  return config;
}
function reloadConfig() {
  _cachedConfig = null;
  return getConfig();
}
function resolvePath(p) {
  if (!p) return "";
  if (p.startsWith("~")) {
    return p.replace("~", import_node_os3.default.homedir());
  }
  return p;
}
function getAgentSystemBase() {
  const config = getConfig();
  return config.agentSystem?.path ?? null;
}
function getAgentSystemPath(relativePath) {
  const base = getAgentSystemBase();
  if (!base) return null;
  return (0, import_node_path3.join)(base, relativePath);
}
function getMainProjectDir() {
  const config = getConfig();
  const projects = config.projects ?? [];
  const main2 = projects.find((p) => !p.isProd);
  if (main2?.path) return main2.path;
  return (0, import_node_path3.join)(process.cwd(), "..");
}

// server/file-watcher.ts
function getBase() {
  return getAgentSystemBase() ?? "";
}
function getWatchPaths() {
  const base = getBase();
  if (!base) return [];
  return [
    (0, import_node_path4.join)(base, "sprints/current.md"),
    (0, import_node_path4.join)(base, "sprints/ready.md"),
    (0, import_node_path4.join)(base, "sprints/scan_log.md"),
    (0, import_node_path4.join)(base, "sprints/archive"),
    (0, import_node_path4.join)(base, "sprints/handoffs"),
    (0, import_node_path4.join)(base, "tools/memory_index.json")
  ];
}
var FileWatcher = class {
  watcher = null;
  callbacks = /* @__PURE__ */ new Set();
  start() {
    const paths = getWatchPaths();
    if (paths.length === 0) return;
    this.watcher = (0, import_chokidar.watch)(paths, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 }
    });
    this.watcher.on("change", (filePath) => {
      void this.handleChange(filePath);
    });
    this.watcher.on("add", (filePath) => {
      void this.handleChange(filePath);
    });
  }
  async handleChange(filePath) {
    try {
      const content = await (0, import_promises.readFile)(filePath, "utf-8");
      const label = this.labelFor(filePath);
      const update = { file: label, content };
      for (const cb of this.callbacks) {
        cb(update);
      }
    } catch {
    }
  }
  labelFor(filePath) {
    if (filePath.includes("handoffs/")) {
      return `handoffs/${(0, import_node_path4.basename)(filePath)}`;
    }
    if (filePath.includes("archive/")) {
      return `archive/${(0, import_node_path4.basename)(filePath)}`;
    }
    return (0, import_node_path4.basename)(filePath);
  }
  onUpdate(callback) {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }
  async stop() {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    this.callbacks.clear();
  }
};
async function safeRead(path4) {
  try {
    return await (0, import_promises.readFile)(path4, "utf-8");
  } catch {
    return null;
  }
}
async function readCurrentSprint() {
  return safeRead((0, import_node_path4.join)(getBase(), "sprints/current.md"));
}
async function readReadyQueue() {
  return safeRead((0, import_node_path4.join)(getBase(), "sprints/ready.md"));
}
async function readScanLog() {
  const raw = await safeRead((0, import_node_path4.join)(getBase(), "sprints/scan_log.md"));
  if (!raw) return [];
  return parseScanLog(raw);
}
function parseScanLog(raw) {
  const entries = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const bracketMatch = trimmed.match(
      /^\[(\d{4}-\d{2}-\d{2}T[\d:]+Z)\]\s+(.+)$/
    );
    if (bracketMatch) {
      const ts = bracketMatch[1];
      const rest = bracketMatch[2];
      const dashIdx = rest.indexOf(" \u2014 ");
      if (dashIdx >= 0) {
        entries.push({
          timestamp: ts,
          status: rest.slice(0, dashIdx).trim(),
          detail: rest.slice(dashIdx + 3).trim()
        });
      } else {
        entries.push({ timestamp: ts, status: "INFO", detail: rest });
      }
      continue;
    }
    const pipeMatch = trimmed.match(
      /^(\d{4}-\d{2}-\d{2}T[\d:]+Z)\s*\|\s*(.+?)\s*\|\s*(.+)$/
    );
    if (pipeMatch) {
      entries.push({
        timestamp: pipeMatch[1],
        status: pipeMatch[2].trim(),
        detail: pipeMatch[3].trim()
      });
    }
  }
  return entries;
}
async function readSprintHistory() {
  const archiveDir = (0, import_node_path4.join)(getBase(), "sprints/archive");
  try {
    const files = await (0, import_promises.readdir)(archiveDir);
    return files.filter((f) => f.endsWith(".md")).map((f) => {
      const dateMatch = f.match(/^(\d{4}-\d{2}-\d{2})/);
      return {
        name: f.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}_/, ""),
        date: dateMatch ? dateMatch[1] : "unknown"
      };
    }).sort((a, b) => b.date.localeCompare(a.date));
  } catch {
    return [];
  }
}
async function readHandoffs() {
  const handoffsDir = (0, import_node_path4.join)(getBase(), "sprints/handoffs");
  try {
    const files = await (0, import_promises.readdir)(handoffsDir);
    const results = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const raw = await safeRead((0, import_node_path4.join)(handoffsDir, f));
      if (!raw) continue;
      try {
        const data = JSON.parse(raw);
        const agent = data["agent"] ?? "unknown";
        const toMatch = f.match(/_to_(\w+)\.json$/);
        const to = toMatch ? toMatch[1] : "orchestrator";
        const detail = data["test_scope"] ?? data["notes"] ?? (Array.isArray(data["deliverables"]) ? data["deliverables"].join(", ") : f);
        results.push({ from: agent, to, file: f, detail });
      } catch {
      }
    }
    return results;
  } catch {
    return [];
  }
}
async function readMemoryStats() {
  const raw = await safeRead((0, import_node_path4.join)(getBase(), "tools/memory_index.json"));
  if (!raw) return { total: 0, categories: {} };
  try {
    const data = JSON.parse(raw);
    const entries = data.entries ?? [];
    const categories = {};
    for (const entry of entries) {
      const cat = entry.category ?? "uncategorized";
      categories[cat] = (categories[cat] ?? 0) + 1;
    }
    return { total: entries.length, categories };
  } catch {
    return { total: 0, categories: {} };
  }
}

// server/git-status.ts
var import_node_child_process3 = require("node:child_process");
var import_node_fs4 = require("node:fs");
function getDefaultRepos() {
  const config = getConfig();
  return config.projects.map((p) => ({
    name: p.name,
    path: p.path,
    isProd: p.isProd,
    trackedBranches: p.trackedBranches
  }));
}
function execGit(cmd, cwd) {
  try {
    return (0, import_node_child_process3.execSync)(cmd, {
      cwd,
      encoding: "utf-8",
      timeout: 5e3,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
  } catch {
    return "";
  }
}
function getBranchInfo(repoPath, branchName, currentBranch) {
  const exists = execGit(`git rev-parse --verify ${branchName}`, repoPath);
  if (!exists) return null;
  const lastCommit = execGit(`git log --oneline -1 ${branchName}`, repoPath) || "no commits";
  return {
    name: branchName,
    lastCommit,
    isCurrent: branchName === currentBranch
  };
}
function getRepoStatus(repo) {
  if (!(0, import_node_fs4.existsSync)(repo.path)) {
    return null;
  }
  const branch = execGit("git branch --show-current", repo.path) || "detached";
  const porcelain = execGit("git status --porcelain", repo.path);
  const changedFiles = porcelain ? porcelain.split("\n").filter((line) => line.trim().length > 0).length : 0;
  const dirty = changedFiles > 0;
  const lastCommit = execGit("git log --oneline -1", repo.path) || "no commits";
  const branches = [];
  const trackedNames = new Set(repo.trackedBranches ?? []);
  trackedNames.add(branch);
  for (const name of trackedNames) {
    const info = getBranchInfo(repo.path, name, branch);
    if (info) {
      branches.push(info);
    }
  }
  branches.sort((a, b) => {
    if (a.isCurrent && !b.isCurrent) return -1;
    if (!a.isCurrent && b.isCurrent) return 1;
    return a.name.localeCompare(b.name);
  });
  return {
    path: repo.path,
    name: repo.name,
    branch,
    dirty,
    lastCommit,
    changedFiles,
    isProd: repo.isProd,
    branches
  };
}
var GitWatcher = class {
  repos;
  interval = null;
  callbacks = /* @__PURE__ */ new Set();
  lastSnapshot = "";
  constructor(repos) {
    this.repos = repos ?? getDefaultRepos();
  }
  getStatus() {
    const results = [];
    for (const repo of this.repos) {
      const status = getRepoStatus(repo);
      if (status) {
        results.push(status);
      }
    }
    return results;
  }
  onUpdate(callback) {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }
  start(intervalMs = 1e4) {
    this.poll();
    this.interval = setInterval(() => {
      this.poll();
    }, intervalMs);
  }
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.callbacks.clear();
  }
  poll() {
    const statuses = this.getStatus();
    const snapshot = JSON.stringify(statuses);
    if (snapshot !== this.lastSnapshot) {
      this.lastSnapshot = snapshot;
      for (const cb of this.callbacks) {
        cb(statuses);
      }
    }
  }
};

// server/pr-creator.ts
var import_node_child_process4 = require("node:child_process");
function parseRemoteUrl(repoPath) {
  try {
    const remoteUrl = (0, import_node_child_process4.execSync)("git remote get-url origin", {
      cwd: repoPath,
      encoding: "utf-8",
      timeout: 5e3
    }).trim();
    const sshMatch = remoteUrl.match(
      /git@ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/(.+)/
    );
    if (sshMatch) {
      return {
        org: sshMatch[1],
        project: sshMatch[2],
        repoName: sshMatch[3]
      };
    }
    const httpsMatch = remoteUrl.match(
      /dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/(.+)/
    );
    if (httpsMatch) {
      return {
        org: httpsMatch[1],
        project: httpsMatch[2],
        repoName: httpsMatch[3]
      };
    }
    return null;
  } catch {
    return null;
  }
}
function getAzureToken() {
  const envToken = process.env["AZURE_DEVOPS_PAT"];
  if (envToken) return envToken;
  try {
    const credentialInput = IS_WINDOWS ? "echo protocol=https& echo host=dev.azure.com& echo." : 'printf "protocol=https\\nhost=dev.azure.com\\n\\n"';
    const result = (0, import_node_child_process4.execSync)(
      `${credentialInput} | git credential fill`,
      {
        encoding: "utf-8",
        timeout: 5e3,
        shell: IS_WINDOWS ? "cmd.exe" : "/bin/bash"
      }
    ).trim();
    const passwordLine = result.split("\n").find((line) => line.startsWith("password="));
    if (passwordLine) {
      return passwordLine.replace("password=", "");
    }
  } catch {
  }
  return null;
}
async function createPR(opts) {
  const remote = parseRemoteUrl(opts.repo);
  if (!remote) {
    throw new Error(
      `Could not parse Azure DevOps remote URL from repo at ${opts.repo}`
    );
  }
  const token = getAzureToken();
  if (!token) {
    throw new Error(
      "No Azure DevOps PAT found. Set AZURE_DEVOPS_PAT env var or configure git credential helper."
    );
  }
  const apiUrl = `https://dev.azure.com/${remote.org}/${remote.project}/_apis/git/repositories/${remote.repoName}/pullrequests?api-version=7.1`;
  const sourceRef = opts.sourceBranch.startsWith("refs/") ? opts.sourceBranch : `refs/heads/${opts.sourceBranch}`;
  const targetRef = opts.targetBranch.startsWith("refs/") ? opts.targetBranch : `refs/heads/${opts.targetBranch}`;
  const body = {
    sourceRefName: sourceRef,
    targetRefName: targetRef,
    title: opts.title,
    description: opts.description
  };
  const authHeader = `Basic ${Buffer.from(`:${token}`).toString("base64")}`;
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Azure DevOps API error (${response.status}): ${errorText}`
    );
  }
  const data = await response.json();
  const webUrl = data.repository?.webUrl ?? `https://dev.azure.com/${remote.org}/${remote.project}/_git/${remote.repoName}`;
  const prWebUrl = `${webUrl}/pullrequest/${data.pullRequestId}`;
  return {
    url: prWebUrl,
    id: data.pullRequestId,
    status: data.status
  };
}
function getRepoBranches(repoPath) {
  try {
    const output = (0, import_node_child_process4.execSync)("git branch -a --format='%(refname:short)'", {
      cwd: repoPath,
      encoding: "utf-8",
      timeout: 5e3
    }).trim();
    if (!output) return [];
    const branches = output.split("\n").map((b) => b.trim().replace(/^'|'$/g, "")).filter((b) => b.length > 0).map((b) => b.replace(/^origin\//, "")).filter((b, i, arr) => arr.indexOf(b) === i).sort((a, b) => {
      if (a === "main" || a === "master") return -1;
      if (b === "main" || b === "master") return 1;
      return a.localeCompare(b);
    });
    return branches;
  } catch {
    return [];
  }
}

// server/dev-servers.ts
var import_node_child_process5 = require("node:child_process");
var import_node_fs5 = require("node:fs");
var import_node_path5 = __toESM(require("node:path"));
function getBuiltInProjects() {
  const config = getConfig();
  return config.devServers.map((s) => ({
    name: s.name,
    cwd: s.path,
    command: s.command
  }));
}
var SETTINGS_PATH = import_node_path5.default.join(process.cwd(), ".settings.json");
function readSettings() {
  try {
    const raw = (0, import_node_fs5.readFileSync)(SETTINGS_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
function writeSettings(settings) {
  (0, import_node_fs5.writeFileSync)(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
}
function getCustomServers() {
  const settings = readSettings();
  const custom = settings["customServers"];
  return (custom ?? []).map((s) => ({ ...s, isCustom: true }));
}
function addCustomServer(server) {
  const settings = readSettings();
  const custom = settings["customServers"] ?? [];
  custom.push({ name: server.name, cwd: server.cwd, command: server.command });
  settings["customServers"] = custom;
  writeSettings(settings);
}
function removeCustomServer(name) {
  const settings = readSettings();
  const custom = settings["customServers"] ?? [];
  const filtered = custom.filter((s) => s.name !== name);
  if (filtered.length === custom.length) return false;
  settings["customServers"] = filtered;
  writeSettings(settings);
  return true;
}
function getAllKnownProjects() {
  return [...getBuiltInProjects(), ...getCustomServers()];
}
var managedProcesses = /* @__PURE__ */ new Map();
function detectRunningServers() {
  const servers = [];
  const selfPid = process.pid;
  const selfPort = parseInt(process.env["PORT"] ?? "8080", 10);
  try {
    const listening = findNodeListeningPorts();
    if (listening.length === 0) return servers;
    const seen = /* @__PURE__ */ new Set();
    for (const entry of listening) {
      if (seen.has(entry.pid)) continue;
      seen.add(entry.pid);
      const cwd = getProcessCwd(entry.pid) ?? "unknown";
      const sep2 = import_node_path5.default.sep;
      const dirName = cwd !== "unknown" ? cwd.split(sep2).pop() ?? "dev-server" : "dev-server";
      const isSelf = entry.pid === selfPid || entry.port === selfPort;
      servers.push({
        pid: entry.pid,
        port: entry.port,
        command: entry.command ?? "node",
        cwd,
        name: `${dirName}:${entry.port}`,
        running: true,
        isSelf
      });
    }
  } catch {
  }
  return servers;
}
function getDevServers() {
  const running = detectRunningServers();
  const result = [...running];
  const selfPort = parseInt(process.env["PORT"] ?? "8080", 10);
  const knownProjects = getAllKnownProjects();
  for (const project of knownProjects) {
    if (!(0, import_node_fs5.existsSync)(project.cwd)) continue;
    const match = running.find(
      (s) => s.cwd === project.cwd || s.name.startsWith(project.name)
    );
    if (match) {
      match.name = project.name;
      match.isCustom = project.isCustom;
      if (project.name === "agent-studio") {
        match.isSelf = true;
      }
    } else {
      result.push({
        pid: 0,
        port: 0,
        command: project.command,
        cwd: project.cwd,
        name: project.name,
        running: false,
        isSelf: false,
        isCustom: project.isCustom
      });
    }
  }
  const agentStudio = result.find(
    (s) => s.name === "agent-studio" || s.port === selfPort
  );
  if (agentStudio) {
    agentStudio.isSelf = true;
    agentStudio.name = "agent-studio";
  }
  return result;
}
function detectPortForPid(pid) {
  const ports = findPortsForPid(pid);
  if (ports.length > 0) return ports[0];
  const allListeners = findNodeListeningPorts();
  const match = allListeners.find((l) => l.pid === pid);
  return match?.port ?? 0;
}
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
async function startDevServer(cwd, command) {
  const parts = command.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);
  const child = (0, import_node_child_process5.spawn)(cmd, args, {
    cwd,
    stdio: "ignore",
    detached: true,
    env: { ...process.env, FORCE_COLOR: "1" },
    shell: true
  });
  child.unref();
  const pid = child.pid ?? 0;
  const projectName = cwd.split(import_node_path5.default.sep).pop() ?? "unknown";
  if (pid) {
    managedProcesses.set(projectName, child);
  }
  if (!pid) {
    return { pid: 0, port: 0, status: "failed" };
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    if (!isProcessAlive(pid)) {
      return { pid, port: 0, status: "crashed" };
    }
    const port2 = detectPortForPid(pid);
    if (port2 > 0) {
      return { pid, port: port2, status: "running" };
    }
  }
  if (isProcessAlive(pid)) {
    return { pid, port: 0, status: "starting" };
  }
  return { pid, port: 0, status: "failed" };
}
function stopDevServer(pid) {
  return killProcessGroup(pid);
}

// server/index.ts
var import_node_child_process9 = require("node:child_process");
var import_node_fs13 = __toESM(require("node:fs"));
var import_node_path14 = __toESM(require("node:path"));
var import_node_os4 = __toESM(require("node:os"));

// server/workflows/workflow-registry.ts
var import_node_fs6 = require("node:fs");
var import_node_path7 = require("node:path");

// server/workflows/sprint-planning.ts
var import_promises2 = require("node:fs/promises");
var import_node_path6 = require("node:path");
function getSprintsDir() {
  return getAgentSystemPath("sprints") ?? "";
}
function getHandoffsDir() {
  return getAgentSystemPath("sprints/handoffs") ?? "";
}
async function safeRead2(path4) {
  try {
    return await (0, import_promises2.readFile)(path4, "utf-8");
  } catch {
    return null;
  }
}
async function fileExists(path4) {
  try {
    await (0, import_promises2.stat)(path4);
    return true;
  } catch {
    return false;
  }
}
async function loadHandoffs() {
  try {
    const files = await (0, import_promises2.readdir)(getHandoffsDir());
    const results = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const raw = await safeRead2((0, import_node_path6.join)(getHandoffsDir(), f));
      if (!raw) continue;
      try {
        const data = JSON.parse(raw);
        const agent = data["agent"] ?? "unknown";
        const toMatch = f.match(/_to_(\w+)\.json$/);
        const to = toMatch ? toMatch[1] : "orchestrator";
        const detail = data["test_scope"] ?? data["notes"] ?? (Array.isArray(data["deliverables"]) ? data["deliverables"].join(", ") : f);
        results.push({ from: agent, to, file: f, detail, content: data });
      } catch {
      }
    }
    return results;
  } catch {
    return [];
  }
}
function parseTaskCounts(content) {
  let safe = 0;
  let medium = 0;
  let high = 0;
  const safeMatches = content.match(/### Task S\d+/g);
  const mediumMatches = content.match(/### Task M\d+/g);
  const highMatches = content.match(/### Task H\d+/g);
  if (safeMatches) safe = safeMatches.length;
  if (mediumMatches) medium = mediumMatches.length;
  if (highMatches) high = highMatches.length;
  return { total: safe + medium + high, safe, medium, high };
}
function extractBuildSummary(content) {
  const headings = [];
  for (const line of content.split("\n")) {
    const match = line.match(/^##\s+(.+)$/);
    if (match && !match[1].startsWith("Status") && !match[1].startsWith("Data Contract") && !match[1].startsWith("Rollback")) {
      headings.push(match[1].trim());
    }
  }
  return headings;
}
async function buildPmoScanRichContent() {
  const scanLogRaw = await safeRead2((0, import_node_path6.join)(getSprintsDir(), "scan_log.md"));
  const entries = scanLogRaw ? parseScanLog(scanLogRaw) : [];
  const meaningfulEntries = entries.filter((e) => {
    const lower = e.detail.toLowerCase();
    if (lower.includes("scan starting") || lower.includes("scan complete")) return false;
    if (e.status === "INFO" && lower.length < 30) return false;
    return true;
  });
  const last10 = meaningfulEntries.slice(-10);
  const latestEntry = meaningfulEntries[meaningfulEntries.length - 1];
  let ticketsFound = 0;
  const domains = [];
  if (latestEntry) {
    const ticketMatch = latestEntry.detail.match(/(\d+)\s+(?:To Do\s+)?(?:tickets?|To Do)/i);
    if (ticketMatch) ticketsFound = parseInt(ticketMatch[1], 10);
    for (const domain of ["frontend", "backend", "infrastructure", "security", "data", "devops"]) {
      if (latestEntry.detail.toLowerCase().includes(domain)) {
        domains.push(domain);
      }
    }
  }
  let readinessStatus = "UNKNOWN";
  if (latestEntry) {
    if (latestEntry.status.includes("READY") && !latestEntry.status.includes("NOT")) {
      readinessStatus = "READY";
    } else if (latestEntry.status.includes("NOT READY")) {
      readinessStatus = "NOT READY";
    } else if (latestEntry.status.includes("INCOMPLETE")) {
      readinessStatus = "INCOMPLETE";
    } else {
      readinessStatus = latestEntry.status;
    }
  }
  return {
    type: "pmo-scan",
    scanEntries: last10,
    ticketsFound,
    domains,
    readinessStatus,
    fullScanLog: scanLogRaw ?? void 0
  };
}
async function buildReadinessRichContent() {
  const readyContent = await safeRead2((0, import_node_path6.join)(getSprintsDir(), "ready.md"));
  if (!readyContent) {
    return { type: "readiness-report" };
  }
  let readinessStatus = "UNKNOWN";
  const scanResult = readyContent.match(/Scan result:\s*\*\*(.+?)\*\*/);
  if (scanResult) {
    readinessStatus = scanResult[1].includes("READY") && !scanResult[1].includes("NOT") ? "READY" : "NOT READY";
  }
  let ticketsFound = 0;
  const ticketMatch = readyContent.match(/(\d+)\s+To Do tickets?/i);
  if (ticketMatch) ticketsFound = parseInt(ticketMatch[1], 10);
  const domains = [];
  const sectionHeaders = readyContent.match(/### (.+?) \(/g);
  if (sectionHeaders) {
    for (const header of sectionHeaders) {
      const name = header.replace(/### /, "").replace(/ \($/, "").trim();
      domains.push(name);
    }
  }
  const buildSummary = [];
  const sprintMatches = readyContent.match(/### Sprint [A-Z]: .+/g);
  if (sprintMatches) {
    for (const s of sprintMatches) {
      buildSummary.push(s.replace(/### /, ""));
    }
  }
  return {
    type: "readiness-report",
    readinessStatus,
    ticketsFound,
    domains,
    buildSummary,
    specPreview: readyContent.slice(0, 600),
    fullSpec: readyContent
  };
}
async function buildSprintSpecRichContent() {
  const content = await safeRead2((0, import_node_path6.join)(getSprintsDir(), "current.md"));
  if (!content) {
    return { type: "sprint-spec" };
  }
  const titleMatch = content.match(/^#\s+(?:Sprint:\s*)?(.+)$/m);
  const statusMatch = content.match(/^Status:\s*(.+)$/m);
  const createdMatch = content.match(/^Created:\s*(.+)$/m);
  const taskCounts = parseTaskCounts(content);
  const agents = [];
  if (/frontend/i.test(content)) agents.push("frontend-worker");
  if (/backend/i.test(content)) agents.push("backend-worker");
  if (/qa|test/i.test(content)) agents.push("qa-tester");
  if (/security/i.test(content)) agents.push("security-reviewer");
  if (/orchestrator/i.test(content)) agents.push("orchestrator");
  if (/pmo/i.test(content)) agents.push("pmo");
  const lines = content.split("\n");
  const previewLines = lines.slice(0, 40);
  const specPreview = previewLines.join("\n");
  return {
    type: "sprint-spec",
    sprintTitle: titleMatch ? titleMatch[1].trim() : "Unknown Sprint",
    sprintStatus: statusMatch ? statusMatch[1].trim() : void 0,
    sprintCreated: createdMatch ? createdMatch[1].trim() : void 0,
    taskCount: taskCounts,
    assignedAgents: agents,
    specPreview,
    fullSpec: content
  };
}
async function buildApprovalRichContent() {
  const content = await safeRead2((0, import_node_path6.join)(getSprintsDir(), "current.md"));
  if (!content) {
    return { type: "approval" };
  }
  const buildSummary = extractBuildSummary(content);
  const taskCounts = parseTaskCounts(content);
  let estimatedScope = "Unknown";
  if (taskCounts.total > 0) {
    const hours = taskCounts.safe * 0.5 + taskCounts.medium * 1.5 + taskCounts.high * 3;
    estimatedScope = `${taskCounts.total} tasks (~${Math.round(hours)}h agent time)`;
  }
  return {
    type: "approval",
    buildSummary,
    estimatedScope,
    taskCount: taskCounts
  };
}
async function buildGateRichContent(gateId, stepStatus) {
  const handoffs = await loadHandoffs();
  const gateChecks = [];
  const gateResults = [];
  let agentNotes = "";
  let filesChanged;
  let qaHealth;
  switch (gateId) {
    case "backend-build":
      gateChecks.push(
        "Views created and queryable",
        "Edge functions deployed",
        "RLS policies applied",
        "Migrations run successfully"
      );
      for (const h of handoffs) {
        if (h.from === "backend-worker" || h.file.includes("backend")) {
          agentNotes = h.detail;
          if (h.content?.["files_changed"]) {
            const fc = h.content["files_changed"];
            filesChanged = Array.isArray(fc) ? fc.length : void 0;
          }
        }
      }
      if (stepStatus === "completed") {
        gateResults.push("All checks passed");
      }
      break;
    case "frontend-build":
      gateChecks.push(
        "TypeScript compiles (npx tsc --noEmit)",
        "npm run build passes",
        "German labels correct",
        "Components under 150 lines",
        "Server vs Client components correct"
      );
      for (const h of handoffs) {
        if (h.from === "frontend-worker" || h.file.includes("frontend")) {
          agentNotes = h.detail;
          if (h.content?.["files_changed"]) {
            const fc = h.content["files_changed"];
            filesChanged = Array.isArray(fc) ? fc.length : void 0;
          }
        }
      }
      if (stepStatus === "completed") {
        gateResults.push("Build passed", "TypeScript clean");
      }
      break;
    case "qa-test":
      gateChecks.push(
        "Smoke tests pass",
        "E2E tests pass",
        "Health score >= 95",
        "No P0/P1 bugs",
        "Regression check"
      );
      for (const h of handoffs) {
        if (h.file === "qa_report.json" && h.content) {
          qaHealth = h.content["health_score"];
          agentNotes = h.detail;
          const bugs = h.content["bugs"];
          if (bugs) {
            gateResults.push(`${bugs.length} bug(s) found`);
            for (const bug of bugs) {
              gateResults.push(`  ${bug.severity}: ${bug["title"] ?? "unknown"}`);
            }
          }
          if (qaHealth) {
            gateResults.push(`Health score: ${qaHealth}%`);
          }
        }
      }
      if (stepStatus === "completed" && gateResults.length === 0) {
        gateResults.push("All tests passed");
      }
      break;
  }
  return {
    type: "gate",
    gateChecks,
    gateResults: gateResults.length > 0 ? gateResults : void 0,
    filesChanged,
    handoffs: handoffs.filter(
      (h) => h.from.includes(gateId.replace("-build", "").replace("-test", "")) || h.to.includes(gateId.replace("-build", "").replace("-test", ""))
    ),
    agentNotes: agentNotes || void 0,
    qaHealth
  };
}
async function buildDeployRichContent() {
  const handoffs = await loadHandoffs();
  const qaHandoff = handoffs.find((h) => h.file === "qa_report.json");
  return {
    type: "deploy",
    qaHealth: qaHandoff?.content?.["health_score"],
    handoffs,
    deploySummary: qaHandoff ? `QA health: ${qaHandoff.content?.["health_score"] ?? "N/A"}% | Tests: ${qaHandoff.content?.["summary"]?.["total_tests"] ?? "?"}` : void 0
  };
}
function makeSteps(overrides) {
  const defaults = [
    {
      id: "pmo-scan",
      name: "PMO Scan",
      status: "pending",
      agents: ["pmo"],
      details: "Scan Notion Tasks DB for ready tickets."
    },
    {
      id: "readiness-report",
      name: "Readiness Report",
      status: "pending",
      agents: ["pmo"],
      details: "Generate ready.md with ticket grouping and sprint recommendations."
    },
    {
      id: "user-approval",
      name: "Sprint Approval",
      status: "pending",
      agents: [],
      action: { label: "Approve", type: "approve" },
      details: "Review sprint plan and approve or request changes."
    },
    {
      id: "spec-generation",
      name: "Phase 0: Design & Spec",
      status: "pending",
      agents: ["orchestrator", "backend-worker", "frontend-worker", "qa-tester", "security-reviewer"],
      details: "Full team discussion. Orchestrator spawns agent team, generates current.md with tasks, acceptance criteria, and data contracts."
    },
    {
      id: "backend-build",
      name: "Gate 1: Backend Build",
      status: "pending",
      agents: ["backend-worker", "security-reviewer"],
      details: "Backend builds views, edge functions, RLS policies, migrations. Security reviews."
    },
    {
      id: "frontend-build",
      name: "Gate 2: Frontend Build",
      status: "pending",
      agents: ["frontend-worker", "security-reviewer"],
      details: "Frontend builds pages, components, hooks, types. TypeScript must compile. Security reviews."
    },
    {
      id: "qa-test",
      name: "Gate 3: QA Testing",
      status: "pending",
      agents: ["qa-tester"],
      details: "QA tests on localhost. Health score must be >= 90. Loop: QA finds bugs -> frontend/backend fix -> QA retests -> repeat until passing."
    },
    {
      id: "deploy",
      name: "Ship: Deploy & Archive",
      status: "pending",
      agents: ["orchestrator"],
      details: "Orchestrator pushes PR, archives sprint, updates memory."
    }
  ];
  if (overrides) {
    for (const step of defaults) {
      const patch = overrides[step.id];
      if (patch) {
        Object.assign(step, patch);
      }
    }
  }
  return defaults;
}
function extractDateFromFilename(filename) {
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "unknown";
}
function extractNameFromFilename(filename) {
  return filename.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}_/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
async function parseArchiveRuns() {
  const archiveDir = (0, import_node_path6.join)(getSprintsDir(), "archive");
  try {
    const files = await (0, import_promises2.readdir)(archiveDir);
    const mdFiles = files.filter((f) => f.endsWith(".md")).sort((a, b) => b.localeCompare(a));
    const runs = [];
    for (const file of mdFiles) {
      const date = extractDateFromFilename(file);
      const name = extractNameFromFilename(file);
      const content = await safeRead2((0, import_node_path6.join)(archiveDir, file));
      const completedStep = {
        status: "completed",
        completedAt: `${date}T23:59:00Z`
      };
      const allCompleted = {};
      const archiveRichContent = {
        type: "sprint-spec",
        sprintTitle: name,
        sprintStatus: "COMPLETED",
        sprintCreated: date,
        fullSpec: content ?? void 0,
        specPreview: content ? content.slice(0, 600) : void 0
      };
      if (content) {
        const taskCounts = parseTaskCounts(content);
        archiveRichContent.taskCount = taskCounts;
        const buildSummary = extractBuildSummary(content);
        archiveRichContent.buildSummary = buildSummary;
        const assignedAgents = [];
        if (/frontend/i.test(content)) assignedAgents.push("frontend-worker");
        if (/backend/i.test(content)) assignedAgents.push("backend-worker");
        if (/qa|test/i.test(content)) assignedAgents.push("qa-tester");
        if (/security/i.test(content)) assignedAgents.push("security-reviewer");
        assignedAgents.push("orchestrator");
        archiveRichContent.assignedAgents = assignedAgents;
      }
      for (const id of [
        "pmo-scan",
        "readiness-report",
        "user-approval",
        "spec-generation",
        "backend-build",
        "frontend-build",
        "qa-test",
        "deploy"
      ]) {
        allCompleted[id] = { ...completedStep };
        if (id === "spec-generation") {
          allCompleted[id].richContent = archiveRichContent;
          allCompleted[id].details = `Archived sprint: ${name}`;
        }
      }
      const agents = /* @__PURE__ */ new Set();
      if (content) {
        if (/backend/i.test(content)) agents.add("backend-worker");
        if (/frontend/i.test(content)) agents.add("frontend-worker");
        if (/qa|test/i.test(content)) agents.add("qa-tester");
        if (/security/i.test(content)) agents.add("security-reviewer");
        agents.add("orchestrator");
        agents.add("pmo");
      }
      runs.push({
        id: `archive-${file.replace(/\.md$/, "")}`,
        flowId: "sprint-planning",
        name,
        status: "completed",
        startedAt: `${date}T09:00:00Z`,
        completedAt: `${date}T23:59:00Z`,
        steps: makeSteps(allCompleted),
        stats: {
          agentsUsed: Array.from(agents)
        }
      });
    }
    return runs;
  } catch {
    return [];
  }
}
async function parseCurrentRun() {
  const hasReady = await fileExists((0, import_node_path6.join)(getSprintsDir(), "ready.md"));
  const hasCurrent = await fileExists((0, import_node_path6.join)(getSprintsDir(), "current.md"));
  if (!hasReady && !hasCurrent) return null;
  const scanLog = await safeRead2((0, import_node_path6.join)(getSprintsDir(), "scan_log.md"));
  const currentContent = await safeRead2((0, import_node_path6.join)(getSprintsDir(), "current.md"));
  let sprintName = "Current Sprint";
  if (currentContent) {
    const titleMatch = currentContent.match(/^#\s+(?:Sprint:\s*)?(.+)$/m);
    if (titleMatch) sprintName = titleMatch[1].trim();
  } else if (hasReady) {
    sprintName = "Sprint Readiness";
  }
  let currentStatus = null;
  if (currentContent) {
    const statusMatch = currentContent.match(/^Status:\s*(.+)$/m);
    if (statusMatch) currentStatus = statusMatch[1].trim().toUpperCase();
  }
  const stepOverrides = {};
  const pmoRich = await buildPmoScanRichContent();
  const readinessRich = await buildReadinessRichContent();
  const specRich = await buildSprintSpecRichContent();
  const approvalRich = await buildApprovalRichContent();
  const backendGateRich = await buildGateRichContent("backend-build", "pending");
  const frontendGateRich = await buildGateRichContent("frontend-build", "pending");
  const qaGateRich = await buildGateRichContent("qa-test", "pending");
  const deployRich = await buildDeployRichContent();
  if (scanLog && scanLog.trim().length > 0) {
    const lastLine = scanLog.trim().split("\n").pop() ?? "";
    stepOverrides["pmo-scan"] = {
      status: "completed",
      details: lastLine,
      richContent: pmoRich
    };
  }
  if (hasReady) {
    const readyContent = await safeRead2((0, import_node_path6.join)(getSprintsDir(), "ready.md"));
    let summary = "Ready report generated.";
    if (readyContent) {
      const scanResult = readyContent.match(/Scan result:\s*\*\*(.+?)\*\*/);
      if (scanResult) summary = scanResult[1];
    }
    stepOverrides["readiness-report"] = {
      status: "completed",
      details: summary,
      richContent: readinessRich
    };
  }
  if (hasCurrent && currentContent) {
    if (currentStatus?.includes("PLANNING") || currentStatus?.includes("AWAITING")) {
      stepOverrides["user-approval"] = {
        status: "waiting",
        action: { label: "Approve Sprint", type: "approve" },
        details: "Review the sprint spec in current.md and approve to start execution.",
        richContent: approvalRich
      };
      stepOverrides["spec-generation"] = {
        status: "completed",
        details: `Spec generated: ${sprintName}`,
        richContent: specRich
      };
    } else if (currentStatus?.includes("RUNNING") || currentStatus?.includes("IN PROGRESS")) {
      stepOverrides["user-approval"] = { status: "completed", richContent: approvalRich };
      stepOverrides["spec-generation"] = { status: "completed", richContent: specRich };
      stepOverrides["backend-build"] = { status: "active", richContent: backendGateRich };
      stepOverrides["frontend-build"] = { status: "pending", richContent: frontendGateRich };
    } else if (currentStatus?.includes("COMPLETE") || currentStatus?.includes("DONE")) {
      for (const id of ["user-approval", "spec-generation"]) {
        stepOverrides[id] = { status: "completed" };
      }
      stepOverrides["backend-build"] = { status: "completed", richContent: await buildGateRichContent("backend-build", "completed") };
      stepOverrides["frontend-build"] = { status: "completed", richContent: await buildGateRichContent("frontend-build", "completed") };
      stepOverrides["qa-test"] = { status: "completed", richContent: await buildGateRichContent("qa-test", "completed") };
      stepOverrides["deploy"] = {
        status: "waiting",
        action: { label: "Deploy & Archive", type: "go" },
        richContent: deployRich
      };
    }
  } else if (hasReady && !hasCurrent) {
    stepOverrides["user-approval"] = {
      status: "waiting",
      action: { label: "Start Sprint Planning", type: "go" },
      details: "Tickets are ready. Approve to generate sprint spec.",
      richContent: approvalRich
    };
  }
  if (!stepOverrides["pmo-scan"]?.richContent) {
    stepOverrides["pmo-scan"] = { ...stepOverrides["pmo-scan"] ?? {}, richContent: pmoRich };
  }
  if (!stepOverrides["readiness-report"]?.richContent) {
    stepOverrides["readiness-report"] = { ...stepOverrides["readiness-report"] ?? {}, richContent: readinessRich };
  }
  if (!stepOverrides["spec-generation"]?.richContent) {
    stepOverrides["spec-generation"] = { ...stepOverrides["spec-generation"] ?? {}, richContent: specRich };
  }
  if (!stepOverrides["backend-build"]?.richContent) {
    stepOverrides["backend-build"] = { ...stepOverrides["backend-build"] ?? {}, richContent: backendGateRich };
  }
  if (!stepOverrides["frontend-build"]?.richContent) {
    stepOverrides["frontend-build"] = { ...stepOverrides["frontend-build"] ?? {}, richContent: frontendGateRich };
  }
  if (!stepOverrides["qa-test"]?.richContent) {
    stepOverrides["qa-test"] = { ...stepOverrides["qa-test"] ?? {}, richContent: qaGateRich };
  }
  if (!stepOverrides["deploy"]?.richContent) {
    stepOverrides["deploy"] = { ...stepOverrides["deploy"] ?? {}, richContent: deployRich };
  }
  const runStatus = Object.values(stepOverrides).some(
    (s) => s?.status === "waiting"
  ) ? "waiting" : Object.values(stepOverrides).some((s) => s?.status === "active") ? "running" : "completed";
  const agents = /* @__PURE__ */ new Set(["pmo", "orchestrator"]);
  if (currentContent) {
    if (/backend/i.test(currentContent)) agents.add("backend-worker");
    if (/frontend/i.test(currentContent)) agents.add("frontend-worker");
    if (/qa|test/i.test(currentContent)) agents.add("qa-tester");
    if (/security/i.test(currentContent)) agents.add("security-reviewer");
  }
  return {
    id: "current",
    flowId: "sprint-planning",
    name: sprintName,
    status: runStatus,
    startedAt: (/* @__PURE__ */ new Date()).toISOString(),
    steps: makeSteps(stepOverrides),
    stats: {
      agentsUsed: Array.from(agents)
    }
  };
}
async function getSprintPlanningFlow() {
  const archiveRuns = await parseArchiveRuns();
  const currentRun = await parseCurrentRun();
  const runs = [];
  if (currentRun) runs.push(currentRun);
  runs.push(...archiveRuns);
  return {
    id: "sprint-planning",
    name: "Sprint Planning",
    description: "PMO scan, readiness report, approval, spec, build, test, deploy",
    icon: "Rocket",
    runs
  };
}

// server/workflows/workflow-registry.ts
var WorkflowRegistry = class {
  providers = /* @__PURE__ */ new Map();
  /** Register a provider by workflow id. Later registrations overwrite. */
  register(id, provider) {
    this.providers.set(id, provider);
  }
  /** Remove a provider. */
  unregister(id) {
    this.providers.delete(id);
  }
  /** Get all registered flow ids. */
  ids() {
    return Array.from(this.providers.keys());
  }
  /** Resolve all providers into WorkflowFlow objects. */
  async getAll() {
    const flows = [];
    for (const provider of this.providers.values()) {
      try {
        flows.push(await provider());
      } catch {
      }
    }
    return flows;
  }
  /** Resolve a single flow by id. */
  async get(id) {
    const provider = this.providers.get(id);
    if (!provider) return null;
    try {
      return await provider();
    } catch {
      return null;
    }
  }
};
function customWorkflowProvider(def) {
  return async () => ({
    id: def.id,
    name: def.name,
    description: def.description,
    icon: def.icon || "Workflow",
    runs: [
      {
        id: `${def.id}-default`,
        flowId: def.id,
        name: def.name,
        status: "waiting",
        startedAt: (/* @__PURE__ */ new Date()).toISOString(),
        steps: def.steps.map((s) => ({
          id: s.id,
          name: s.name,
          status: "pending",
          agents: s.agents,
          details: s.description
        })),
        stats: {
          agentsUsed: Array.from(
            new Set(def.steps.flatMap((s) => s.agents))
          )
        }
      }
    ]
  });
}
function buildRegistry() {
  const registry = new WorkflowRegistry();
  const agentBase = getAgentSystemBase();
  if (agentBase) {
    const config2 = getConfig();
    const sprintDir = config2.agentSystem?.sprintDir ?? "sprints/";
    const sprintsPath = (0, import_node_path7.join)(agentBase, sprintDir);
    if ((0, import_node_fs6.existsSync)(sprintsPath)) {
      registry.register("sprint-planning", getSprintPlanningFlow);
    }
  }
  const config = getConfig();
  const customWorkflows = config.workflows;
  if (Array.isArray(customWorkflows)) {
    for (const def of customWorkflows) {
      if (def.id && def.name && Array.isArray(def.steps)) {
        registry.register(def.id, customWorkflowProvider(def));
      }
    }
  }
  return registry;
}

// server/workflows/index.ts
var WorkflowManager = class {
  registry;
  constructor() {
    this.registry = buildRegistry();
  }
  /** Re-initialize the registry (e.g. after config change). */
  reload() {
    this.registry = buildRegistry();
  }
  async getFlows() {
    return this.registry.getAll();
  }
  async getFlow(flowId) {
    return this.registry.get(flowId);
  }
  async getRun(flowId, runId) {
    const flow = await this.getFlow(flowId);
    if (!flow) return null;
    return flow.runs.find((r) => r.id === runId) ?? null;
  }
};

// server/rooms.ts
var import_events = require("events");
var import_node_fs7 = require("node:fs");
var import_node_path8 = require("node:path");
var import_node_crypto2 = require("node:crypto");
var DANGEROUS_PATTERNS = [
  /\bgit\s+push\b.*--force/i,
  /\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i,
  /\bDELETE\s+FROM\b(?!.*WHERE)/i,
  /\bTRUNCATE\b/i,
  /\brm\s+-rf?\s+\//,
  /\bgit\s+reset\s+--hard/i
];
var RoomManager = class extends import_events.EventEmitter {
  rooms = /* @__PURE__ */ new Map();
  roomsDir;
  constructor() {
    super();
    const base = getAgentSystemBase() ?? process.cwd();
    this.roomsDir = (0, import_node_path8.join)(base, "..", ".agent-studio", "rooms");
    if (!(0, import_node_fs7.existsSync)(this.roomsDir)) {
      (0, import_node_fs7.mkdirSync)(this.roomsDir, { recursive: true });
    }
    this.loadRooms();
  }
  createRoom(name, topic, agentConfigs) {
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (this.rooms.has(id)) {
      throw new Error(`Room "${name}" already exists`);
    }
    const roomDir = (0, import_node_path8.join)(this.roomsDir, id);
    if (!(0, import_node_fs7.existsSync)(roomDir)) (0, import_node_fs7.mkdirSync)(roomDir, { recursive: true });
    const agents = [];
    const hasOrchestrator = agentConfigs.some((a) => a.id === "orchestrator");
    if (!hasOrchestrator) {
      agents.push({ id: "orchestrator", name: "Orchestrator", model: "opus", status: "offline" });
    }
    for (const cfg of agentConfigs) {
      agents.push({ id: cfg.id, name: cfg.name, model: cfg.model, status: "offline" });
    }
    const contextFile = (0, import_node_path8.join)(roomDir, "context.md");
    (0, import_node_fs7.writeFileSync)(contextFile, [
      `# Room: ${name}`,
      `## Topic: ${topic}`,
      `## Status: Starting`,
      "",
      "### Completed",
      "(nothing yet)",
      "",
      "### In Progress",
      "(nothing yet)",
      "",
      "### Pending",
      "(nothing yet)",
      ""
    ].join("\n"));
    const room = {
      id,
      name,
      topic,
      agents,
      messages: [],
      contextFile,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      active: true
    };
    this.rooms.set(id, room);
    this.saveRoom(room);
    this.addMessage(id, {
      from: "system",
      text: `Room "${name}" created. Topic: ${topic}. Agents: ${agents.map((a) => a.name).join(", ")}`,
      type: "system"
    });
    return room;
  }
  addMessage(roomId, msg, clientId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const message = {
      ...msg,
      id: clientId ?? (0, import_node_crypto2.randomUUID)(),
      roomId,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    room.messages.push(message);
    if (room.messages.length > 200) {
      room.messages = room.messages.slice(-200);
    }
    this.saveRoom(room);
    this.emit("message", message);
    return message;
  }
  checkDangerous(text) {
    for (const pattern of DANGEROUS_PATTERNS) {
      const match = text.match(pattern);
      if (match) return match[0];
    }
    return null;
  }
  updateContextFile(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const completed = [];
    const inProgress = [];
    for (const msg of room.messages.slice(-50)) {
      if (msg.type === "message" && msg.from !== "user" && msg.from !== "system") {
        const lower = (msg.text ?? "").toLowerCase();
        if (lower.includes("done") || lower.includes("completed") || lower.includes("finished")) {
          completed.push(`- ${msg.from}: ${(msg.text ?? "").slice(0, 100)}`);
        } else if (lower.includes("working on") || lower.includes("starting")) {
          inProgress.push(`- ${msg.from}: ${(msg.text ?? "").slice(0, 100)}`);
        }
      }
    }
    const content = [
      `# Room: ${room.name}`,
      `## Topic: ${room.topic}`,
      `## Status: Active`,
      `## Agents: ${room.agents.map((a) => `${a.name} (${a.status})`).join(", ")}`,
      "",
      "### Completed",
      completed.length > 0 ? completed.join("\n") : "(nothing yet)",
      "",
      "### In Progress",
      inProgress.length > 0 ? inProgress.join("\n") : "(nothing yet)",
      "",
      "### Recent Messages (last 10)",
      ...room.messages.slice(-10).map((m) => `- **${m.from}**: ${(m.text ?? "").slice(0, 150)}`),
      ""
    ].join("\n");
    (0, import_node_fs7.writeFileSync)(room.contextFile, content);
  }
  getRoom(id) {
    return this.rooms.get(id) ?? null;
  }
  getRooms() {
    return Array.from(this.rooms.values());
  }
  linkSession(roomId, agentId, sessionId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const agent = room.agents.find((a) => a.id === agentId);
    if (agent) {
      agent.sessionId = sessionId;
      agent.status = "idle";
      this.saveRoom(room);
      this.emit("agent-status", { roomId, agentId, status: "idle" });
    }
  }
  setAgentStatus(roomId, agentId, status) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const agent = room.agents.find((a) => a.id === agentId);
    if (agent) {
      agent.status = status;
      this.saveRoom(room);
      this.emit("agent-status", { roomId, agentId, status });
    }
  }
  approveAction(roomId, messageId) {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    const msg = room.messages.find((m) => m.id === messageId);
    if (msg && msg.type === "approval-request" && msg.approvalStatus === "pending") {
      msg.approvalStatus = "approved";
      this.saveRoom(room);
      this.emit("approval", { roomId, messageId, approved: true });
      return true;
    }
    return false;
  }
  rejectAction(roomId, messageId) {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    const msg = room.messages.find((m) => m.id === messageId);
    if (msg && msg.type === "approval-request" && msg.approvalStatus === "pending") {
      msg.approvalStatus = "rejected";
      this.saveRoom(room);
      this.emit("approval", { roomId, messageId, approved: false });
      return true;
    }
    return false;
  }
  closeRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    room.active = false;
    const sessionIds = room.agents.filter((a) => a.sessionId).map((a) => a.sessionId);
    room.agents.forEach((a) => {
      a.status = "offline";
      a.sessionId = void 0;
    });
    this.saveRoom(room);
    this.addMessage(roomId, { from: "system", text: "Room closed.", type: "system" });
    return sessionIds;
  }
  saveRoom(room) {
    const roomDir = (0, import_node_path8.join)(this.roomsDir, room.id);
    if (!(0, import_node_fs7.existsSync)(roomDir)) (0, import_node_fs7.mkdirSync)(roomDir, { recursive: true });
    const file = (0, import_node_path8.join)(roomDir, "room.json");
    (0, import_node_fs7.writeFileSync)(file, JSON.stringify(room, null, 2));
  }
  loadRooms() {
    try {
      const dirs = (0, import_node_fs7.readdirSync)(this.roomsDir);
      for (const dir of dirs) {
        const file = (0, import_node_path8.join)(this.roomsDir, dir, "room.json");
        if ((0, import_node_fs7.existsSync)(file)) {
          try {
            const room = JSON.parse((0, import_node_fs7.readFileSync)(file, "utf-8"));
            room.agents = (room.agents ?? []).filter((a) => a && a.id && a.name);
            room.agents.forEach((a) => {
              a.status = "offline";
              a.sessionId = void 0;
            });
            this.rooms.set(room.id, room);
          } catch {
          }
        }
      }
    } catch {
    }
  }
};

// server/routes/rooms.ts
var import_express = require("express");
function roomsRoutes(roomManager, sdkManager, wss) {
  const router = (0, import_express.Router)();
  function broadcast(type, payload) {
    const msg = JSON.stringify({ type, payload });
    for (const client of wss.clients) {
      if (client.readyState === 1) {
        client.send(msg);
      }
    }
  }
  function makeSdkCallbacks(roomId) {
    return {
      onTypingStart(agentId) {
        roomManager.setAgentStatus(roomId, agentId, "working");
        broadcast("room-agent-typing", { roomId, agentId });
      },
      onTextDelta(agentId, delta) {
        broadcast("room-agent-streaming", { roomId, agentId, delta });
      },
      onResult(agentId, text, usage) {
        const truncated = text.length > 5e3 ? text.slice(0, 5e3) + "\n...(truncated)" : text;
        roomManager.addMessage(roomId, {
          from: agentId,
          text: truncated,
          type: "message"
        });
        roomManager.updateContextFile(roomId);
        if (usage) {
          broadcast("room-agent-usage", { roomId, agentId, ...usage });
        }
      },
      onError(agentId, err) {
        roomManager.addMessage(roomId, {
          from: "system",
          text: `Agent ${agentId} error: ${err.message}`,
          type: "system"
        });
        roomManager.setAgentStatus(roomId, agentId, "idle");
      },
      onIdle(agentId) {
        roomManager.setAgentStatus(roomId, agentId, "idle");
      }
    };
  }
  router.get("/", (_req, res) => {
    res.json(roomManager.getRooms());
  });
  router.post("/", (req, res) => {
    try {
      const { name, topic, agents } = req.body;
      if (!name || !topic) {
        res.status(400).json({ error: "Missing 'name' or 'topic'" });
        return;
      }
      if (agents !== void 0 && !Array.isArray(agents)) {
        res.status(400).json({ error: "agents must be an array" });
        return;
      }
      if (agents) {
        for (const a of agents) {
          if (!a || typeof a.id !== "string" || typeof a.name !== "string") {
            res.status(400).json({ error: "Each agent must have string 'id' and 'name' fields" });
            return;
          }
        }
      }
      const room = roomManager.createRoom(name, topic, agents ?? []);
      res.status(201).json(room);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      if (message.includes("already exists")) {
        res.status(409).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });
  router.get("/:id", (req, res) => {
    const room = roomManager.getRoom(req.params["id"]);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    res.json(room);
  });
  router.post("/:id/messages", (req, res) => {
    try {
      const roomId = req.params["id"];
      const { from, text, to, id: clientId } = req.body;
      if (!text) {
        res.status(400).json({ error: "Missing 'text'" });
        return;
      }
      const msg = roomManager.addMessage(roomId, {
        from: from ?? "user",
        text,
        to,
        type: "message"
      }, clientId);
      if (!msg) {
        res.status(404).json({ error: "Room not found" });
        return;
      }
      const room = roomManager.getRoom(roomId);
      if (room && (from === "user" || from === void 0)) {
        const mentionMatch = text.match(/@(\w+)/);
        let targetAgentId = "orchestrator";
        let messageText = text;
        if (mentionMatch) {
          const mentioned = mentionMatch[1];
          if (mentioned === "all") {
            const cleanText = text.replace(/@all\s*/g, "").trim();
            const callbacks = makeSdkCallbacks(roomId);
            for (const agent of room.agents) {
              const session2 = sdkManager.getSession(agent.id);
              if (session2) {
                sdkManager.sendMessage(agent.id, cleanText, callbacks).catch(() => {
                });
              }
            }
            roomManager.updateContextFile(roomId);
            res.status(201).json(msg);
            return;
          }
          const mentionedAgent = room.agents.find((a) => a.id === mentioned);
          if (mentionedAgent && sdkManager.getSession(mentioned)) {
            targetAgentId = mentioned;
          }
          messageText = text.replace(/@\w+\s*/, "").trim();
        }
        const session = sdkManager.getSession(targetAgentId);
        if (session) {
          const callbacks = makeSdkCallbacks(roomId);
          sdkManager.sendMessage(targetAgentId, messageText, callbacks).catch(() => {
          });
          roomManager.updateContextFile(roomId);
        } else {
          roomManager.addMessage(roomId, {
            from: "system",
            text: `Cannot deliver to ${targetAgentId} \u2014 agent is offline. Start the room first.`,
            type: "system"
          });
        }
      }
      res.status(201).json(msg);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  router.post("/:id/spawn", async (req, res) => {
    try {
      const roomId = req.params["id"];
      const room = roomManager.getRoom(roomId);
      if (!room) {
        res.status(404).json({ error: "Room not found" });
        return;
      }
      const mainDir = getMainProjectDir();
      const spawned = [];
      for (const agent of room.agents) {
        if (sdkManager.getSession(agent.id)) continue;
        sdkManager.createSession({
          agentId: agent.id,
          roomId,
          cwd: mainDir,
          model: agent.model,
          agentProfile: agent.id !== "none" ? agent.id : void 0
        });
        roomManager.setAgentStatus(roomId, agent.id, "idle");
        spawned.push({ agentId: agent.id });
      }
      const orchestratorSession = sdkManager.getSession("orchestrator");
      if (orchestratorSession && spawned.length > 0) {
        const otherAgents = room.agents.filter((a) => a.id !== "orchestrator").map((a) => a.name).join(", ");
        const initMessage = [
          `You are the orchestrator in team room "#${room.name}".`,
          `Topic: ${room.topic}.`,
          `Team: ${otherAgents}.`,
          `Read ${room.contextFile} for team status.`,
          `Acknowledge briefly that you're ready.`
        ].join(" ");
        const callbacks = makeSdkCallbacks(roomId);
        sdkManager.sendMessage("orchestrator", initMessage, callbacks).catch(() => {
        });
      }
      roomManager.addMessage(roomId, {
        from: "system",
        text: `Agents started: ${spawned.map((s) => s.agentId).join(", ")}`,
        type: "system"
      });
      res.json({ spawned });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  router.post("/:id/approve/:msgId", (req, res) => {
    const ok = roomManager.approveAction(req.params["id"], req.params["msgId"]);
    if (!ok) {
      res.status(404).json({ error: "Message not found or not pending" });
      return;
    }
    res.json({ ok: true });
  });
  router.post("/:id/reject/:msgId", (req, res) => {
    const ok = roomManager.rejectAction(req.params["id"], req.params["msgId"]);
    if (!ok) {
      res.status(404).json({ error: "Message not found or not pending" });
      return;
    }
    res.json({ ok: true });
  });
  router.delete("/:id", (req, res) => {
    try {
      const roomId = req.params["id"];
      const room = roomManager.getRoom(roomId);
      if (room) {
        for (const agent of room.agents) {
          sdkManager.destroySession(agent.id);
        }
      }
      roomManager.closeRoom(roomId);
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  return router;
}

// server/sdk-session.ts
var import_claude_agent_sdk = require("@anthropic-ai/claude-agent-sdk");
var import_events2 = require("events");
var SdkSessionManager = class extends import_events2.EventEmitter {
  sessions = /* @__PURE__ */ new Map();
  messageQueues = /* @__PURE__ */ new Map();
  // agentId -> queued prompts
  createSession(opts) {
    const session = {
      agentId: opts.agentId,
      roomId: opts.roomId,
      sessionId: "",
      // Set after first query returns a session_id
      cwd: opts.cwd,
      model: opts.model,
      agentProfile: opts.agentProfile,
      busy: false,
      activeQuery: null
    };
    this.sessions.set(opts.agentId, session);
    this.messageQueues.set(opts.agentId, []);
    return session;
  }
  getSession(agentId) {
    return this.sessions.get(agentId);
  }
  async sendMessage(agentId, prompt, callbacks) {
    const session = this.sessions.get(agentId);
    if (!session) {
      callbacks.onError(agentId, new Error(`No SDK session for agent ${agentId}`));
      return;
    }
    if (session.busy) {
      const queue = this.messageQueues.get(agentId) ?? [];
      queue.push(prompt);
      this.messageQueues.set(agentId, queue);
      return;
    }
    await this.executeQuery(session, prompt, callbacks);
  }
  async executeQuery(session, prompt, callbacks) {
    session.busy = true;
    callbacks.onTypingStart(session.agentId);
    try {
      const options = {
        model: this.resolveModel(session.model),
        cwd: session.cwd,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        includePartialMessages: true
      };
      if (session.sessionId) {
        options.resume = session.sessionId;
      }
      if (session.agentProfile && session.agentProfile !== "none") {
        options.agent = session.agentProfile;
      }
      const conversation = (0, import_claude_agent_sdk.query)({ prompt, options });
      session.activeQuery = conversation;
      let accumulatedText = "";
      for await (const message of conversation) {
        if (!session.sessionId && message.session_id) {
          session.sessionId = message.session_id;
        }
        if (message.type === "stream_event") {
          const event = message.event;
          if (event?.type === "content_block_delta" && event?.delta?.type === "text_delta") {
            const delta = event.delta.text ?? "";
            accumulatedText += delta;
            callbacks.onTextDelta(session.agentId, delta);
          }
        }
        if (message.type === "result") {
          if (message.subtype === "success") {
            const resultMsg = message;
            const finalText = resultMsg.result ?? accumulatedText;
            callbacks.onResult(session.agentId, finalText, {
              totalCostUsd: resultMsg.total_cost_usd ?? 0,
              inputTokens: resultMsg.usage?.input_tokens ?? 0,
              outputTokens: resultMsg.usage?.output_tokens ?? 0
            });
          } else {
            callbacks.onError(session.agentId, new Error(`Agent query failed: ${message.subtype}`));
          }
        }
      }
    } catch (err) {
      callbacks.onError(session.agentId, err instanceof Error ? err : new Error(String(err)));
    } finally {
      session.busy = false;
      session.activeQuery = null;
      callbacks.onIdle(session.agentId);
      const queue = this.messageQueues.get(session.agentId) ?? [];
      if (queue.length > 0) {
        const nextPrompt = queue.shift();
        this.messageQueues.set(session.agentId, queue);
        this.executeQuery(session, nextPrompt, callbacks).catch(() => {
        });
      }
    }
  }
  interruptAgent(agentId) {
    const session = this.sessions.get(agentId);
    if (session?.activeQuery) {
      session.activeQuery.close();
      session.activeQuery = null;
      session.busy = false;
    }
  }
  destroySession(agentId) {
    this.interruptAgent(agentId);
    this.sessions.delete(agentId);
    this.messageQueues.delete(agentId);
  }
  destroyAll() {
    const agentIds = [...this.sessions.keys()];
    for (const id of agentIds) {
      this.destroySession(id);
    }
    return agentIds;
  }
  resolveModel(model) {
    switch (model) {
      case "opus":
        return "claude-opus-4-6";
      case "sonnet":
        return "claude-sonnet-4-6";
      case "haiku":
        return "claude-haiku-4-5-20251001";
      default:
        return model;
    }
  }
};

// server/scaffold.ts
var import_node_fs8 = require("node:fs");
var import_node_path9 = require("node:path");
var AGENT_TEMPLATES = {
  orchestrator: {
    description: "Coordinates agent teams. Delegates work, manages dependencies, reviews before pushing.",
    tools: ["Bash", "Read", "Glob", "Grep"],
    rules: [
      "Classify tasks: QUICK (do it) / STANDARD (plan + delegate) / ARCHITECTURE (design first)",
      "NEVER write code yourself \u2014 delegate to specialized agents",
      "Always review diffs before pushing",
      "Ask for human approval before deploying to production",
      "Load memory index before every task"
    ]
  },
  frontend: {
    description: "Builds and maintains the frontend. Follows project patterns and conventions.",
    tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep"],
    rules: [
      "Never push directly \u2014 commit locally, report to orchestrator",
      "Run type-check after every change",
      "Follow the project's coding style and component patterns",
      "Server components fetch data, client components render interactivity",
      "Self-verify: TypeScript compiles, labels correct, component under 150 lines"
    ]
  },
  backend: {
    description: "Builds APIs, database schemas, server logic, and data layer.",
    tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep"],
    rules: [
      "Never modify production directly \u2014 use migrations",
      "Always use parameterized queries, never string interpolation",
      "Write RLS policies for every new table",
      "Test locally before reporting done",
      "Document breaking changes in handoff files"
    ]
  },
  qa: {
    description: "Tests the application. Runs smoke tests, E2E tests, and regression checks.",
    tools: ["Bash", "Read", "Glob", "Grep"],
    rules: [
      "Read the frontend handoff file before testing",
      "Report bugs with severity (P0-P3), steps to reproduce, expected vs actual",
      "Calculate health score: 100 - (P0*25) - (P1*15) - (P2*5) - (P3*1)",
      "Never mark a bug as fixed without retesting",
      "Write QA report after every test run"
    ]
  },
  security: {
    description: "Reviews code for vulnerabilities. Has VETO power on deployments.",
    tools: ["Bash", "Read", "Glob", "Grep"],
    rules: [
      "Check for exposed secrets, hardcoded credentials, and env var leaks",
      "Verify RLS policies on every data-access path",
      "VETO any change that exposes production data to unauthorized users",
      "Review auth flows for session fixation, CSRF, and token leakage",
      "Never approve a PR without reading the full diff"
    ]
  },
  pmo: {
    description: "Scans for tasks, manages sprints, tracks scope and timelines.",
    tools: ["Bash", "Read", "Write", "Glob", "Grep"],
    rules: [
      "Scan task boards for items ready to be worked on",
      "Write sprint specs with acceptance criteria before building starts",
      "Track scope boundaries \u2014 flag scope creep early",
      "Maintain the scan log with timestamps and outcomes",
      "Never start a sprint without orchestrator approval"
    ]
  },
  documentation: {
    description: "Maintains documentation, knowledge base, and READMEs.",
    tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep"],
    rules: [
      "Keep docs accurate and up to date with the codebase",
      "Use clear, concise language \u2014 no jargon without explanation",
      "Document decisions in memory files, not just in code comments",
      "Update README files when features change",
      "Cross-reference related docs with links"
    ]
  },
  domain: {
    description: "Domain-specific agent for your core business logic.",
    tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep"],
    rules: [
      "Follow the config-driven pattern: new process = new config row, zero code changes",
      "Validate against the ground truth source (spec docs) before implementing",
      "Include all documented options \u2014 missing options cause silent failures",
      "Always include else clauses for unmatched conditions",
      "Document domain-specific decisions in memory files"
    ]
  }
};
function generateAgentMd(name) {
  const template = AGENT_TEMPLATES[name];
  if (!template) {
    return `# ${name} Agent

Custom agent \u2014 define your rules here.
`;
  }
  const toolsYaml = template.tools.map((t) => `  - ${t}`).join("\n");
  const rulesBlock = template.rules.map((r, i) => `${i + 1}. ${r}`).join("\n");
  return `---
name: ${name}
description: ${template.description}
tools:
${toolsYaml}
---

# ${capitalize(name)} Agent

${template.description}

## Rules
${rulesBlock}

## Memory Protocol
- Before starting: read \`ai-agents/tools/memory_index.json\`
- After significant work: write a memory file to \`ai-agents/memory/\`
- Update the index after writing

## Communication
- Report completion to orchestrator with list of changed files
- Message teammates directly for questions in your domain
- Escalate to orchestrator if blocked after 3 attempts
`;
}
function generateClaudeAgentMd(name) {
  const template = AGENT_TEMPLATES[name];
  if (!template) {
    return `# ${capitalize(name)} Agent

Load your full context from \`ai-agents/agents/${name}/agent.md\`.
`;
  }
  const toolsList = template.tools.map((t) => `  - ${t}`).join("\n");
  return `---
name: ${name}
description: ${template.description}
tools:
${toolsList}
---

# ${capitalize(name)} Agent

You are the ${name} agent. Load your full context from \`ai-agents/agents/${name}/agent.md\` at the start of every conversation.

## Quick Reference
${template.rules.slice(0, 3).map((r, i) => `${i + 1}. ${r}`).join("\n")}

## Memory
Read \`ai-agents/tools/memory_index.json\` before any task.
`;
}
function generateReadme(agents, workflow) {
  return `# Agent System

This directory contains your AI agent system \u2014 agent definitions, shared memory, sprint management, and tools.

## Structure

\`\`\`
ai-agents/
\u251C\u2500\u2500 agents/          # Agent definitions (one folder per agent)
\u251C\u2500\u2500 memory/          # Shared memory (learnings, corrections, decisions)
\u251C\u2500\u2500 sprints/         # Sprint specs, handoffs, scan logs
\u251C\u2500\u2500 tools/           # Shared tools (memory index, scripts)
\u2514\u2500\u2500 context/         # Shared context files (schemas, specs)
\`\`\`

## Agents

${agents.map((a) => `- **${a}**: ${AGENT_TEMPLATES[a]?.description ?? "Custom agent"}`).join("\n")}

## Workflow

**${workflow}** workflow is configured.

${workflow === "sprint" ? "PMO scans for tasks, writes specs, orchestrator approves, agents build in phases with gates, QA tests, then ship." : workflow === "simple" ? "Plan, build, test, deploy \u2014 straightforward pipeline." : "Custom workflow \u2014 define your steps in the config."}

## Memory Protocol

1. Before any task: read \`tools/memory_index.json\`
2. After significant work: write to \`memory/\` and update the index
3. Memories are JSON files with tags for searchability

## Getting Started

1. Start a Claude Code session
2. Use \`--agent orchestrator\` to coordinate work
3. The orchestrator will delegate to specialized agents
`;
}
function generateNotifyScript() {
  return `#!/bin/bash
# Telegram notification script
# Usage: ./notify.sh "Your message here"

TELEGRAM_BOT_TOKEN="your-token-here"
TELEGRAM_CHAT_ID="your-chat-id-here"

MESSAGE="$1"

if [ -z "$MESSAGE" ]; then
  echo "Usage: ./notify.sh \\"message\\""
  exit 1
fi

if [ "$TELEGRAM_BOT_TOKEN" = "your-token-here" ]; then
  echo "Warning: Set TELEGRAM_BOT_TOKEN in this script first"
  exit 1
fi

curl -s -X POST "https://api.telegram.org/bot\${TELEGRAM_BOT_TOKEN}/sendMessage" \\
  -d chat_id="\${TELEGRAM_CHAT_ID}" \\
  -d text="\${MESSAGE}" \\
  -d parse_mode="Markdown" > /dev/null

echo "Notification sent."
`;
}
function generatePmoScanScript(projectPath) {
  return `#!/bin/bash
# PMO Scan Script \u2014 runs periodically to check for new tasks
# Called by launchd/cron scheduler

SCAN_LOG="${projectPath}/ai-agents/sprints/scan_log.md"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "" >> "$SCAN_LOG"
echo "## Scan: $TIMESTAMP" >> "$SCAN_LOG"
echo "" >> "$SCAN_LOG"

# Run the PMO agent in headless mode
claude --agent pmo -p "Check if there are any tasks ready for a sprint. Update scan_log.md with findings." --cwd "${projectPath}" 2>&1 | tail -5 >> "$SCAN_LOG"

echo "Status: completed" >> "$SCAN_LOG"
echo "---" >> "$SCAN_LOG"
`;
}
function scaffoldAgentSystem(options) {
  const { projectPath, agents, workflow, notifications, scheduler } = options;
  const aiAgentsPath = (0, import_node_path9.join)(projectPath, "ai-agents");
  const claudeAgentsPath = (0, import_node_path9.join)(projectPath, ".claude", "agents");
  const created = [];
  const skipped = [];
  const alreadyExists = (0, import_node_fs8.existsSync)(aiAgentsPath);
  if (alreadyExists) {
    return { created: [], skipped: ["ai-agents/ already exists"], alreadyExists: true };
  }
  const dirs = [
    aiAgentsPath,
    (0, import_node_path9.join)(aiAgentsPath, "tools"),
    (0, import_node_path9.join)(aiAgentsPath, "memory"),
    (0, import_node_path9.join)(aiAgentsPath, "memory", "learnings"),
    (0, import_node_path9.join)(aiAgentsPath, "memory", "corrections"),
    (0, import_node_path9.join)(aiAgentsPath, "memory", "decisions"),
    (0, import_node_path9.join)(aiAgentsPath, "memory", "human-inputs"),
    (0, import_node_path9.join)(aiAgentsPath, "sprints"),
    (0, import_node_path9.join)(aiAgentsPath, "sprints", "handoffs"),
    (0, import_node_path9.join)(aiAgentsPath, "sprints", "archive"),
    (0, import_node_path9.join)(aiAgentsPath, "agents"),
    (0, import_node_path9.join)(aiAgentsPath, "context"),
    claudeAgentsPath
  ];
  for (const dir of dirs) {
    if (!(0, import_node_fs8.existsSync)(dir)) {
      (0, import_node_fs8.mkdirSync)(dir, { recursive: true });
      created.push(relative(projectPath, dir) + "/");
    }
  }
  for (const agent of agents) {
    const agentDir = (0, import_node_path9.join)(aiAgentsPath, "agents", agent);
    if (!(0, import_node_fs8.existsSync)(agentDir)) {
      (0, import_node_fs8.mkdirSync)(agentDir, { recursive: true });
    }
    const agentMdPath = (0, import_node_path9.join)(agentDir, "agent.md");
    (0, import_node_fs8.writeFileSync)(agentMdPath, generateAgentMd(agent), "utf-8");
    created.push(relative(projectPath, agentMdPath));
    const claudeMdPath = (0, import_node_path9.join)(claudeAgentsPath, `${agent}.md`);
    (0, import_node_fs8.writeFileSync)(claudeMdPath, generateClaudeAgentMd(agent), "utf-8");
    created.push(relative(projectPath, claudeMdPath));
  }
  const readmePath = (0, import_node_path9.join)(aiAgentsPath, "README.md");
  (0, import_node_fs8.writeFileSync)(readmePath, generateReadme(agents, workflow), "utf-8");
  created.push("ai-agents/README.md");
  const memoryIndexPath = (0, import_node_path9.join)(aiAgentsPath, "tools", "memory_index.json");
  (0, import_node_fs8.writeFileSync)(memoryIndexPath, JSON.stringify({
    rebuilt_at: (/* @__PURE__ */ new Date()).toISOString(),
    total_entries: 0,
    total_files: 0,
    entries: []
  }, null, 2), "utf-8");
  created.push("ai-agents/tools/memory_index.json");
  const currentSprintPath = (0, import_node_path9.join)(aiAgentsPath, "sprints", "current.md");
  (0, import_node_fs8.writeFileSync)(currentSprintPath, "# Current Sprint\n\nNo active sprint.\n", "utf-8");
  created.push("ai-agents/sprints/current.md");
  const scanLogPath = (0, import_node_path9.join)(aiAgentsPath, "sprints", "scan_log.md");
  (0, import_node_fs8.writeFileSync)(scanLogPath, "# Scan Log\n\nNo scans yet.\n", "utf-8");
  created.push("ai-agents/sprints/scan_log.md");
  const gitkeeps = [
    (0, import_node_path9.join)(aiAgentsPath, "sprints", "handoffs", ".gitkeep"),
    (0, import_node_path9.join)(aiAgentsPath, "sprints", "archive", ".gitkeep"),
    (0, import_node_path9.join)(aiAgentsPath, "context", ".gitkeep")
  ];
  for (const gk of gitkeeps) {
    (0, import_node_fs8.writeFileSync)(gk, "", "utf-8");
    created.push(relative(projectPath, gk));
  }
  if (notifications.telegram) {
    const notifyPath = (0, import_node_path9.join)(aiAgentsPath, "tools", "notify.sh");
    (0, import_node_fs8.writeFileSync)(notifyPath, generateNotifyScript(), { mode: 493 });
    created.push("ai-agents/tools/notify.sh");
  }
  if (scheduler.enabled) {
    const scanScriptPath = (0, import_node_path9.join)(aiAgentsPath, "tools", "pmo-scan.sh");
    (0, import_node_fs8.writeFileSync)(scanScriptPath, generatePmoScanScript(projectPath), { mode: 493 });
    created.push("ai-agents/tools/pmo-scan.sh");
  }
  return { created, skipped, alreadyExists: false };
}
function previewScaffold(options) {
  const { projectPath, agents, notifications, scheduler } = options;
  const files = [];
  files.push("ai-agents/");
  files.push("ai-agents/tools/");
  files.push("ai-agents/memory/");
  files.push("ai-agents/memory/learnings/");
  files.push("ai-agents/memory/corrections/");
  files.push("ai-agents/memory/decisions/");
  files.push("ai-agents/memory/human-inputs/");
  files.push("ai-agents/sprints/");
  files.push("ai-agents/sprints/handoffs/");
  files.push("ai-agents/sprints/archive/");
  files.push("ai-agents/agents/");
  files.push("ai-agents/context/");
  files.push(".claude/agents/");
  for (const agent of agents) {
    files.push(`ai-agents/agents/${agent}/agent.md`);
    files.push(`.claude/agents/${agent}.md`);
  }
  files.push("ai-agents/README.md");
  files.push("ai-agents/tools/memory_index.json");
  files.push("ai-agents/sprints/current.md");
  files.push("ai-agents/sprints/scan_log.md");
  files.push("ai-agents/sprints/handoffs/.gitkeep");
  files.push("ai-agents/sprints/archive/.gitkeep");
  files.push("ai-agents/context/.gitkeep");
  if (notifications.telegram) {
    files.push("ai-agents/tools/notify.sh");
  }
  if (scheduler.enabled) {
    files.push("ai-agents/tools/pmo-scan.sh");
  }
  return files;
}
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function relative(base, target) {
  if (target.startsWith(base)) {
    const rel = target.slice(base.length);
    return rel.startsWith("/") ? rel.slice(1) : rel;
  }
  return target;
}

// server/automations.ts
var import_node_crypto3 = require("node:crypto");
var import_node_child_process6 = require("node:child_process");
var import_node_fs9 = require("node:fs");
var import_node_path10 = require("node:path");
var REPORTS_DIR = (0, import_node_path10.join)(process.cwd(), ".agent-studio", "reports");
var AUTOMATION_TEMPLATES = [
  {
    id: "code-health",
    name: "Code Health",
    description: "Runs type-check, tests, and audit \u2014 reports failures",
    icon: "HeartPulse",
    defaultSchedule: "every 6h",
    defaultModel: "sonnet",
    defaultPrompt: "Run the following checks and produce a markdown report:\n1. `npx tsc --noEmit` \u2014 report any type errors\n2. `npm test` \u2014 report test failures\n3. `npm audit` \u2014 report vulnerabilities\n\nFormat the report with sections for each check. List specific issues found. End with a summary and suggested actions."
  },
  {
    id: "pr-reviewer",
    name: "PR Reviewer",
    description: "Reviews open PRs and adds review comments",
    icon: "GitPullRequest",
    defaultSchedule: "every 2h",
    defaultModel: "opus",
    defaultPrompt: "Check for open pull requests using `gh pr list`. For each open PR:\n1. Read the diff with `gh pr diff <number>`\n2. Check for common issues: missing tests, security concerns, style violations\n3. Produce a markdown report with findings per PR\n\nSuggest specific actions for each PR that needs attention."
  },
  {
    id: "security-scanner",
    name: "Security Scanner",
    description: "Audits dependencies and checks for secrets in code",
    icon: "Shield",
    defaultSchedule: "daily",
    defaultModel: "sonnet",
    defaultPrompt: "Run a security scan:\n1. `npm audit` \u2014 list vulnerabilities by severity\n2. Search for potential secrets: API keys, tokens, passwords in source files (skip node_modules)\n3. Check for .env files that might be committed\n\nProduce a markdown report with severity levels. Suggest specific fixes for each finding."
  },
  {
    id: "dependency-updater",
    name: "Dependency Updater",
    description: "Checks for outdated packages and suggests updates",
    icon: "PackageCheck",
    defaultSchedule: "weekly",
    defaultModel: "sonnet",
    defaultPrompt: "Check for outdated dependencies:\n1. Run `npm outdated` and list all outdated packages\n2. For each major version bump, check the changelog for breaking changes\n3. Categorize updates as: safe (patch), review (minor), breaking (major)\n\nProduce a markdown report. Suggest which packages to update and in what order."
  },
  {
    id: "custom",
    name: "Custom",
    description: "Write your own automation prompt",
    icon: "Wand2",
    defaultSchedule: "daily",
    defaultModel: "sonnet",
    defaultPrompt: ""
  }
];
function parseScheduleMs(schedule) {
  const lower = schedule.toLowerCase().trim();
  if (lower === "daily") return 864e5;
  if (lower === "weekly") return 6048e5;
  if (lower === "on-push") return null;
  const match = lower.match(/^every\s+(\d+)\s*h$/);
  if (match) {
    const hours = parseInt(match[1], 10);
    return hours * 36e5;
  }
  const numMatch = lower.match(/^(\d+)\s*h$/);
  if (numMatch) {
    return parseInt(numMatch[1], 10) * 36e5;
  }
  return null;
}
function ensureReportsDir() {
  if (!(0, import_node_fs9.existsSync)(REPORTS_DIR)) {
    (0, import_node_fs9.mkdirSync)(REPORTS_DIR, { recursive: true });
  }
}
function loadReportsFromDisk() {
  ensureReportsDir();
  const files = (0, import_node_fs9.readdirSync)(REPORTS_DIR).filter((f) => f.endsWith(".json"));
  const reports = [];
  for (const file of files) {
    try {
      const raw = (0, import_node_fs9.readFileSync)((0, import_node_path10.join)(REPORTS_DIR, file), "utf-8");
      reports.push(JSON.parse(raw));
    } catch {
    }
  }
  reports.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return reports;
}
function saveReportToDisk(report) {
  ensureReportsDir();
  const filename = `${report.id}.json`;
  (0, import_node_fs9.writeFileSync)((0, import_node_path10.join)(REPORTS_DIR, filename), JSON.stringify(report, null, 2), "utf-8");
}
var AutomationEngine = class {
  automations = [];
  reports = [];
  timers = /* @__PURE__ */ new Map();
  listeners = /* @__PURE__ */ new Set();
  cwd;
  constructor(cwd) {
    this.cwd = cwd ?? process.cwd();
    this.reports = loadReportsFromDisk();
  }
  /** Load automations from config array */
  loadAutomations(automations) {
    this.stopAll();
    this.automations = automations;
    for (const auto of this.automations) {
      if (auto.enabled) {
        this.scheduleAutomation(auto);
      }
    }
  }
  /** Get all automations */
  getAutomations() {
    return this.automations;
  }
  /** Get a single automation */
  getAutomation(id) {
    return this.automations.find((a) => a.id === id);
  }
  /** Add a new automation */
  addAutomation(auto) {
    const newAuto = { ...auto, id: (0, import_node_crypto3.randomUUID)() };
    this.automations.push(newAuto);
    if (newAuto.enabled) {
      this.scheduleAutomation(newAuto);
    }
    return newAuto;
  }
  /** Update an existing automation */
  updateAutomation(id, updates) {
    const idx = this.automations.findIndex((a) => a.id === id);
    if (idx === -1) return null;
    const wasEnabled = this.automations[idx].enabled;
    this.automations[idx] = { ...this.automations[idx], ...updates };
    const auto = this.automations[idx];
    if (wasEnabled && !auto.enabled) {
      this.clearTimer(id);
    } else if (!wasEnabled && auto.enabled) {
      this.scheduleAutomation(auto);
    } else if (auto.enabled && updates.schedule) {
      this.clearTimer(id);
      this.scheduleAutomation(auto);
    }
    return auto;
  }
  /** Remove an automation */
  removeAutomation(id) {
    const idx = this.automations.findIndex((a) => a.id === id);
    if (idx === -1) return false;
    this.clearTimer(id);
    this.automations.splice(idx, 1);
    return true;
  }
  /** Trigger a manual run */
  async runAutomation(id) {
    const auto = this.automations.find((a) => a.id === id);
    if (!auto) return null;
    return this.executeAutomation(auto);
  }
  /** Get all reports */
  getReports() {
    return this.reports;
  }
  /** Get a single report */
  getReport(id) {
    return this.reports.find((r) => r.id === id);
  }
  /** Approve a report (mark all actions as approved) */
  approveReport(id) {
    const report = this.reports.find((r) => r.id === id);
    if (!report) return null;
    report.status = "approved";
    for (const action of report.suggestedActions) {
      action.approved = true;
    }
    saveReportToDisk(report);
    return report;
  }
  /** Dismiss a report */
  dismissReport(id) {
    const report = this.reports.find((r) => r.id === id);
    if (!report) return null;
    report.status = "dismissed";
    saveReportToDisk(report);
    return report;
  }
  /** Approve a single action within a report */
  approveAction(reportId, actionId) {
    const report = this.reports.find((r) => r.id === reportId);
    if (!report) return null;
    const action = report.suggestedActions.find((a) => a.id === actionId);
    if (!action) return null;
    action.approved = true;
    saveReportToDisk(report);
    return report;
  }
  /** Subscribe to events */
  onEvent(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  /** Stop all timers */
  stopAll() {
    for (const [id] of this.timers) {
      this.clearTimer(id);
    }
  }
  /** Get config-serializable automations */
  toConfig() {
    return this.automations.map((a) => ({ ...a }));
  }
  // ---------- Private ----------
  scheduleAutomation(auto) {
    const intervalMs = parseScheduleMs(auto.schedule);
    if (!intervalMs) return;
    auto.nextRun = new Date(Date.now() + intervalMs).toISOString();
    const timer = setInterval(() => {
      void this.executeAutomation(auto);
    }, intervalMs);
    this.timers.set(auto.id, timer);
  }
  clearTimer(id) {
    const timer = this.timers.get(id);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(id);
    }
  }
  async executeAutomation(auto) {
    auto.lastRun = (/* @__PURE__ */ new Date()).toISOString();
    const intervalMs = parseScheduleMs(auto.schedule);
    if (intervalMs) {
      auto.nextRun = new Date(Date.now() + intervalMs).toISOString();
    }
    const output = await this.runHeadless(auto);
    const report = this.parseReport(auto, output);
    this.reports.unshift(report);
    saveReportToDisk(report);
    this.emit({ type: "automation-report", payload: report });
    return report;
  }
  runHeadless(auto) {
    return new Promise((resolve) => {
      const args = ["--print", "--model", auto.model];
      if (auto.agent && auto.agent !== "none") {
        args.push("--agent", auto.agent);
      }
      args.push(auto.prompt);
      try {
        const proc = (0, import_node_child_process6.spawn)("claude", args, {
          cwd: this.cwd,
          env: { ...process.env },
          timeout: 3e5
          // 5 min max
        });
        let stdout = "";
        let stderr = "";
        proc.stdout.on("data", (data) => {
          stdout += data.toString("utf-8");
        });
        proc.stderr.on("data", (data) => {
          stderr += data.toString("utf-8");
        });
        proc.on("close", () => {
          resolve(stdout || stderr || "(no output)");
        });
        proc.on("error", () => {
          resolve("(automation failed to start \u2014 is `claude` CLI installed?)");
        });
      } catch {
        resolve("(automation failed to spawn)");
      }
    });
  }
  parseReport(auto, output) {
    const actions = [];
    const actionPattern = /(?:suggested action|recommendation|fix|todo)[\s:]*(.+)/gi;
    let match;
    while ((match = actionPattern.exec(output)) !== null) {
      actions.push({
        id: (0, import_node_crypto3.randomUUID)(),
        title: match[1].trim().slice(0, 100),
        description: match[1].trim(),
        agent: auto.agent || "none",
        prompt: `Fix: ${match[1].trim()}`,
        approved: false
      });
    }
    return {
      id: (0, import_node_crypto3.randomUUID)(),
      automationId: auto.id,
      automationName: auto.name,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      status: "pending",
      summary: output,
      suggestedActions: actions
    };
  }
  emit(event) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
};

// server/agent-generator.ts
var import_node_child_process7 = require("node:child_process");
var import_node_fs10 = require("node:fs");
var import_node_path11 = require("node:path");
var generationState = { status: "idle" };
function getGenerationStatus() {
  return { ...generationState };
}
function setStatus(status, extra) {
  generationState.status = status;
  if (extra) Object.assign(generationState, extra);
}
function isClaudeCliAvailable() {
  return whichCommand("claude") !== null;
}
function buildAgentGenerationPrompt(request) {
  const { projectProfile, userDescription, teamSize } = request;
  const profileSummary = [
    `Project: ${projectProfile.name}`,
    `Languages: ${projectProfile.languages.join(", ") || "unknown"}`,
    `Frameworks: ${projectProfile.frameworks.join(", ") || "none detected"}`,
    `Package Manager: ${projectProfile.packageManager}`,
    projectProfile.database ? `Database: ${projectProfile.database}` : null,
    projectProfile.stateManagement ? `State Management: ${projectProfile.stateManagement}` : null,
    projectProfile.styling ? `Styling: ${projectProfile.styling}` : null,
    projectProfile.apiPattern ? `API Pattern: ${projectProfile.apiPattern}` : null,
    projectProfile.testFramework ? `Testing: ${projectProfile.testFramework}` : null,
    projectProfile.ciPlatform ? `CI/CD: ${projectProfile.ciPlatform}` : null,
    projectProfile.hasDocker ? "Has Docker: yes" : null,
    projectProfile.repoInfo?.platform ? `Hosting: ${projectProfile.repoInfo.platform}` : null,
    `Top-level dirs: ${projectProfile.projectStructure.join(", ") || "flat"}`,
    `Key config files: ${projectProfile.keyFiles.join(", ") || "none"}`,
    projectProfile.existingAgents.length > 0 ? `Existing agents: ${projectProfile.existingAgents.join(", ")}` : null
  ].filter(Boolean).join("\n");
  const readmeSection = projectProfile.readme ? `
README (first 2000 chars):
${projectProfile.readme}` : "";
  return `You are generating a custom AI agent system for a real software project. Each agent is a .md file that tells Claude Code how to behave as a specialist.

CRITICAL: Generate agents that are SPECIFIC to THIS project. Do NOT use generic names like "frontend" or "backend" unless the project actually has those domains. The agent names, responsibilities, and domain knowledge must reflect what this project actually needs.

Examples of project-specific agents:
- Data engineering team: orchestrator, pipeline-builder, dbt-modeler, data-quality-checker
- Mobile app: orchestrator, ios-dev, android-dev, api-builder, app-tester
- Go microservices: orchestrator, service-builder, grpc-designer, k8s-deployer, load-tester
- Solo dev: assistant, reviewer
- ML project: orchestrator, model-trainer, data-engineer, evaluation-runner, api-deployer
- Game dev: orchestrator, game-logic, rendering-engineer, level-designer, playtester

## Project Profile
${profileSummary}
${readmeSection}

## User's Description
${userDescription || "(no description provided)"}

## Team Size
${teamSize ? `${teamSize} developer(s)` : "unknown"}

## Agent .md File Format (MANDATORY)

Every agent MUST have this structure:

\`\`\`markdown
---
name: agent-id
description: One paragraph describing when to use this agent and what it does
tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - SendMessage
---

# Agent Name -- Domain Description

You are the [role] for [project name]. You [core responsibility].

## ABSOLUTE RULES
1. NEVER run git push -- commit locally, the orchestrator handles pushing
2. [Safety boundary specific to this agent's domain]
3. [What to do when uncertain -- ask or stop]

## ENVIRONMENT
- Project path and relevant directories
- Tools and services this agent can access
- What it CANNOT access (explicit boundaries)

## HOW YOU THINK -- Reasoning Protocol
When you receive a task:
1. Scope check -- is this my responsibility?
2. Existing code check -- read before modifying
3. Spec/pattern check -- follow established conventions
4. Implement -- use the project's actual patterns
5. Self-verify -- does it compile? does it match conventions?

### Confidence Signals
- "I am certain" = verified in codebase
- "I believe" = reasonable but should verify
- "I need to check" = will read files first

## DOMAIN KNOWLEDGE
[Specific knowledge about the tech stack, libraries, conventions for THIS project]
[Reference the actual frameworks, versions, and patterns detected]

## PATTERNS TO FOLLOW
[Code style, file naming, architecture patterns from THIS project]

## MEMORY PROTOCOL
Read \`ai-agents/tools/memory_index.json\` before any task.
After significant work, write a memory file to \`ai-agents/memory/\`.

## HANDOFF PROTOCOL
Write structured handoff files to \`ai-agents/sprints/handoffs/\` when your work is done and another agent needs the output.

## WHAT TO DO WHEN STUCK
1. Check memory index for similar past issues
2. Message a teammate via SendMessage
3. If blocked after 2 attempts, message the orchestrator
\`\`\`

## Generation Rules

1. Generate ONLY agents that make sense for THIS specific project
2. Every agent's mdContent MUST reference the actual tech stack (${projectProfile.frameworks.join(", ") || "the detected stack"})
3. The orchestrator (or coordinator) agent MUST list the other agents it coordinates
4. ${teamSize && teamSize <= 2 ? "For small teams, generate fewer agents (2-4 total). A solo dev might just need 'assistant' + 'reviewer'" : "Generate enough agents to cover the project's domains (typically 3-6)"}
5. Keep each agent's mdContent between 80-150 lines
6. Agent ids must be lowercase with hyphens (e.g., "api-builder", "data-modeler")
7. Include domain-specific knowledge: if the project uses Next.js, the relevant agent should know App Router patterns. If it uses FastAPI, the agent should know Pydantic models.
8. Each agent should have at least one rulesFile with deep domain knowledge

## Output Format

Return ONLY a valid JSON object (no markdown fences, no explanation before or after).

{
  "agents": [
    {
      "id": "agent-id",
      "name": "Human Readable Name",
      "description": "One line -- when to use this agent",
      "model": "sonnet",
      "mdContent": "the full .md file content including YAML frontmatter",
      "rulesFiles": [
        {
          "filename": "tech_stack.md",
          "content": "# Tech Stack\\n\\nDetailed knowledge about..."
        }
      ]
    }
  ],
  "claudeMd": "# Project Name -- Claude Code Instructions\\n\\n## Project Overview\\n...\\n## Code Style\\n...\\n## Agent System\\n..."
}

The claudeMd should be a CLAUDE.md file for the project root containing:
- Project overview (from the analysis + user description)
- Core architecture rules (inferred from the stack)
- Code style conventions (language-appropriate)
- Key directories
- Agent system description (listing the generated agents)
- Memory protocol (read/write to ai-agents/memory/)
- Git commit format convention`;
}
async function generateAgentsWithClaudeMd(analysis, _projectPath, userDescription, teamSize) {
  if (!isClaudeCliAvailable()) {
    throw new Error("Claude CLI not found. Install Claude Code to use AI agent generation.");
  }
  setStatus("generating", { startedAt: Date.now(), progress: "Building prompt..." });
  const prompt = buildAgentGenerationPrompt({
    projectProfile: analysis,
    userDescription: userDescription ?? "",
    teamSize
  });
  setStatus("generating", { progress: "Calling Claude..." });
  const output = await runClaudeHeadless(prompt);
  const result = parseGenerationOutput(output);
  setStatus("done", { result });
  return result;
}
async function previewAgents(analysis, userDescription, teamSize) {
  return generateAgentsWithClaudeMd(analysis, "", userDescription, teamSize);
}
function runClaudeHeadless(prompt, model = "sonnet", timeoutMs = 12e4) {
  return new Promise((resolve, reject) => {
    const args = ["--model", model, "--print", prompt];
    const proc = (0, import_node_child_process7.spawn)("claude", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env }
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf-8");
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf-8");
    });
    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      setStatus("error", { error: "Claude CLI timed out" });
      reject(new Error(`Claude CLI timed out after ${timeoutMs / 1e3} seconds`));
    }, timeoutMs);
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout.trim()) {
        setStatus("error", { error: `Claude exited with code ${code}` });
        reject(new Error(`Claude CLI exited with code ${code}: ${stderr.slice(0, 500)}`));
        return;
      }
      resolve(stdout);
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      setStatus("error", { error: err.message });
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
    });
  });
}
function parseGenerationOutput(raw) {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();
  const objStart = cleaned.indexOf("{");
  const objEnd = cleaned.lastIndexOf("}");
  const arrStart = cleaned.indexOf("[");
  if (objStart !== -1 && objEnd > objStart && (arrStart === -1 || objStart < arrStart)) {
    try {
      const parsed2 = JSON.parse(cleaned.slice(objStart, objEnd + 1));
      if (parsed2.agents && Array.isArray(parsed2.agents)) {
        return {
          agents: parseAgentArray(parsed2.agents),
          claudeMd: typeof parsed2.claudeMd === "string" ? parsed2.claudeMd : void 0
        };
      }
    } catch {
    }
  }
  const arrayEnd = cleaned.lastIndexOf("]");
  if (arrStart !== -1 && arrayEnd > arrStart) {
    cleaned = cleaned.slice(arrStart, arrayEnd + 1);
  }
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) {
    throw new Error("Expected JSON array or object with agents array");
  }
  return { agents: parseAgentArray(parsed) };
}
function parseAgentArray(arr) {
  return arr.map((item) => {
    const obj = item;
    if (!obj.id || !obj.mdContent) {
      throw new Error("Agent missing required fields: id, mdContent");
    }
    const model = obj.model;
    const rulesFiles = Array.isArray(obj.rulesFiles) ? obj.rulesFiles.map((rf) => ({
      filename: String(rf.filename ?? "rules.md"),
      content: String(rf.content ?? "")
    })) : void 0;
    return {
      id: String(obj.id),
      name: String(obj.name ?? obj.id),
      description: String(obj.description ?? ""),
      model: model === "opus" || model === "sonnet" || model === "haiku" ? model : "sonnet",
      mdContent: String(obj.mdContent),
      rulesFiles
    };
  });
}
function writeAgentFiles(agents, projectPath, claudeMd) {
  const aiAgentsPath = (0, import_node_path11.join)(projectPath, "ai-agents", "agents");
  const claudeAgentsPath = (0, import_node_path11.join)(projectPath, ".claude", "agents");
  const created = [];
  if (!(0, import_node_fs10.existsSync)(aiAgentsPath)) {
    (0, import_node_fs10.mkdirSync)(aiAgentsPath, { recursive: true });
  }
  if (!(0, import_node_fs10.existsSync)(claudeAgentsPath)) {
    (0, import_node_fs10.mkdirSync)(claudeAgentsPath, { recursive: true });
  }
  for (const agent of agents) {
    const agentDir = (0, import_node_path11.join)(aiAgentsPath, agent.id);
    if (!(0, import_node_fs10.existsSync)(agentDir)) {
      (0, import_node_fs10.mkdirSync)(agentDir, { recursive: true });
    }
    const agentMdPath = (0, import_node_path11.join)(agentDir, "agent.md");
    (0, import_node_fs10.writeFileSync)(agentMdPath, agent.mdContent, "utf-8");
    created.push(`ai-agents/agents/${agent.id}/agent.md`);
    if (agent.rulesFiles && agent.rulesFiles.length > 0) {
      const rulesDir = (0, import_node_path11.join)(agentDir, "rules");
      if (!(0, import_node_fs10.existsSync)(rulesDir)) {
        (0, import_node_fs10.mkdirSync)(rulesDir, { recursive: true });
      }
      for (const rf of agent.rulesFiles) {
        const rfPath = (0, import_node_path11.join)(rulesDir, rf.filename);
        (0, import_node_fs10.writeFileSync)(rfPath, rf.content, "utf-8");
        created.push(`ai-agents/agents/${agent.id}/rules/${rf.filename}`);
      }
    }
    const claudeMdContent = generateClaudeAgentStub(agent);
    const claudeMdFilePath = (0, import_node_path11.join)(claudeAgentsPath, `${agent.id}.md`);
    (0, import_node_fs10.writeFileSync)(claudeMdFilePath, claudeMdContent, "utf-8");
    created.push(`.claude/agents/${agent.id}.md`);
  }
  if (claudeMd) {
    const claudeMdPath = (0, import_node_path11.join)(projectPath, "CLAUDE.md");
    (0, import_node_fs10.writeFileSync)(claudeMdPath, claudeMd, "utf-8");
    created.push("CLAUDE.md");
  }
  const memoryIndexPath = (0, import_node_path11.join)(projectPath, "ai-agents", "tools", "memory_index.json");
  if (!(0, import_node_fs10.existsSync)(memoryIndexPath)) {
    const toolsDir = (0, import_node_path11.join)(projectPath, "ai-agents", "tools");
    if (!(0, import_node_fs10.existsSync)(toolsDir)) {
      (0, import_node_fs10.mkdirSync)(toolsDir, { recursive: true });
    }
    (0, import_node_fs10.writeFileSync)(memoryIndexPath, JSON.stringify({
      rebuilt_at: (/* @__PURE__ */ new Date()).toISOString(),
      entries: []
    }, null, 2), "utf-8");
    created.push("ai-agents/tools/memory_index.json");
  }
  const memoryDirs = ["learnings", "corrections", "decisions", "human-inputs", "knowledge"];
  for (const dir of memoryDirs) {
    const dirPath = (0, import_node_path11.join)(projectPath, "ai-agents", "memory", dir);
    if (!(0, import_node_fs10.existsSync)(dirPath)) {
      (0, import_node_fs10.mkdirSync)(dirPath, { recursive: true });
      (0, import_node_fs10.writeFileSync)((0, import_node_path11.join)(dirPath, ".gitkeep"), "", "utf-8");
    }
  }
  const handoffsDir = (0, import_node_path11.join)(projectPath, "ai-agents", "sprints", "handoffs");
  if (!(0, import_node_fs10.existsSync)(handoffsDir)) {
    (0, import_node_fs10.mkdirSync)(handoffsDir, { recursive: true });
    (0, import_node_fs10.writeFileSync)((0, import_node_path11.join)(handoffsDir, ".gitkeep"), "", "utf-8");
  }
  return { created };
}
function generateClaudeAgentStub(agent) {
  let tools = "  - Bash\n  - Read\n  - Write\n  - Edit\n  - Glob\n  - Grep\n  - SendMessage";
  const fmMatch = agent.mdContent.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const toolsMatch = fmMatch[1].match(/tools:\n((?:\s+-\s+.+\n?)+)/);
    if (toolsMatch) {
      tools = toolsMatch[1].trimEnd();
    }
  }
  return `---
name: ${agent.id}
description: ${agent.description}
tools:
${tools}
---

# ${agent.name}

You are the ${agent.id} agent. Load your full context from \`ai-agents/agents/${agent.id}/agent.md\` at the start of every conversation.

## Memory
Read \`ai-agents/tools/memory_index.json\` before any task.
After significant work, write a memory file to \`ai-agents/memory/\`.

## Communication
Use SendMessage to communicate with teammates. Check \`ai-agents/sprints/handoffs/\` for context from other agents.
`;
}

// server/project-analyzer.ts
var import_node_child_process8 = require("node:child_process");
var import_node_fs11 = require("node:fs");
var import_node_path12 = require("node:path");
var EXT_LANG_MAP = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".py": "Python",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".kt": "Kotlin",
  ".swift": "Swift",
  ".rb": "Ruby",
  ".php": "PHP",
  ".cs": "C#",
  ".cpp": "C++",
  ".c": "C",
  ".dart": "Dart",
  ".ex": "Elixir",
  ".exs": "Elixir",
  ".scala": "Scala",
  ".sql": "SQL",
  ".sh": "Shell",
  ".lua": "Lua",
  ".r": "R",
  ".R": "R",
  ".zig": "Zig",
  ".nim": "Nim",
  ".ml": "OCaml",
  ".hs": "Haskell",
  ".clj": "Clojure",
  ".erl": "Erlang"
};
var SKIP_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  ".next",
  "__pycache__",
  ".venv",
  "venv",
  "env",
  "dist",
  "build",
  "target",
  ".turbo",
  ".cache",
  "coverage",
  ".idea",
  ".vscode",
  ".svelte-kit",
  ".nuxt",
  ".output",
  ".vercel",
  ".netlify"
]);
var KEY_CONFIG_FILES = [
  "package.json",
  "tsconfig.json",
  "pyproject.toml",
  "requirements.txt",
  "go.mod",
  "Cargo.toml",
  "Gemfile",
  "composer.json",
  "build.gradle",
  "pom.xml",
  "Makefile",
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  ".env.example",
  ".env.local",
  "tailwind.config.ts",
  "tailwind.config.js",
  "next.config.ts",
  "next.config.js",
  "next.config.mjs",
  "vite.config.ts",
  "vite.config.js",
  "webpack.config.js",
  "rollup.config.js",
  "esbuild.config.js",
  "prisma/schema.prisma",
  "drizzle.config.ts",
  ".eslintrc.js",
  ".eslintrc.json",
  "eslint.config.js",
  "eslint.config.mjs",
  ".prettierrc",
  "jest.config.ts",
  "jest.config.js",
  "vitest.config.ts",
  "playwright.config.ts",
  "cypress.config.ts",
  "CLAUDE.md",
  ".claude/agents",
  "supabase/config.toml",
  "firebase.json",
  "serverless.yml",
  "terraform/main.tf",
  "pulumi/Pulumi.yaml",
  "k8s/",
  "helm/"
];
function analyzeProject(projectPath) {
  const name = (0, import_node_path12.basename)(projectPath);
  const languages = /* @__PURE__ */ new Set();
  const frameworks = [];
  const keyFiles = [];
  let hasTests = false;
  let testFramework;
  let hasCI = false;
  let ciPlatform;
  let hasDocker = false;
  let packageManager = "unknown";
  let database;
  let stateManagement;
  let styling;
  let apiPattern;
  let readme = "";
  let description = "";
  for (const kf of KEY_CONFIG_FILES) {
    const fullPath = (0, import_node_path12.join)(projectPath, kf);
    if ((0, import_node_fs11.existsSync)(fullPath)) {
      keyFiles.push(kf);
    }
  }
  if ((0, import_node_fs11.existsSync)((0, import_node_path12.join)(projectPath, "package.json"))) {
    packageManager = (0, import_node_fs11.existsSync)((0, import_node_path12.join)(projectPath, "yarn.lock")) ? "yarn" : (0, import_node_fs11.existsSync)((0, import_node_path12.join)(projectPath, "pnpm-lock.yaml")) ? "pnpm" : (0, import_node_fs11.existsSync)((0, import_node_path12.join)(projectPath, "bun.lockb")) ? "bun" : "npm";
    try {
      const pkg = JSON.parse(
        (0, import_node_fs11.readFileSync)((0, import_node_path12.join)(projectPath, "package.json"), "utf-8")
      );
      const allDeps = {
        ...pkg.dependencies ?? {},
        ...pkg.devDependencies ?? {}
      };
      if (allDeps["next"]) frameworks.push("Next.js");
      if (allDeps["react"]) frameworks.push("React");
      if (allDeps["react-native"]) frameworks.push("React Native");
      if (allDeps["expo"]) frameworks.push("Expo");
      if (allDeps["vue"]) frameworks.push("Vue");
      if (allDeps["nuxt"]) frameworks.push("Nuxt");
      if (allDeps["svelte"] || allDeps["@sveltejs/kit"]) frameworks.push("SvelteKit");
      if (allDeps["angular"] || allDeps["@angular/core"]) frameworks.push("Angular");
      if (allDeps["express"]) frameworks.push("Express");
      if (allDeps["fastify"]) frameworks.push("Fastify");
      if (allDeps["hono"]) frameworks.push("Hono");
      if (allDeps["nest"] || allDeps["@nestjs/core"]) frameworks.push("NestJS");
      if (allDeps["electron"]) frameworks.push("Electron");
      if (allDeps["tauri"] || allDeps["@tauri-apps/api"]) frameworks.push("Tauri");
      if (allDeps["astro"]) frameworks.push("Astro");
      if (allDeps["remix"] || allDeps["@remix-run/react"]) frameworks.push("Remix");
      if (allDeps["gatsby"]) frameworks.push("Gatsby");
      if (allDeps["solid-js"]) frameworks.push("SolidJS");
      if (allDeps["qwik"] || allDeps["@builder.io/qwik"]) frameworks.push("Qwik");
      if (allDeps["prisma"] || allDeps["@prisma/client"]) {
        frameworks.push("Prisma");
        database = database ?? "PostgreSQL (Prisma)";
      }
      if (allDeps["drizzle-orm"]) {
        frameworks.push("Drizzle");
        database = database ?? "PostgreSQL (Drizzle)";
      }
      if (allDeps["typeorm"]) {
        frameworks.push("TypeORM");
        database = database ?? "SQL (TypeORM)";
      }
      if (allDeps["mongoose"]) {
        database = database ?? "MongoDB";
      }
      if (allDeps["@supabase/supabase-js"]) {
        frameworks.push("Supabase");
        database = database ?? "Supabase (PostgreSQL)";
      }
      if (allDeps["firebase"] || allDeps["firebase-admin"]) {
        frameworks.push("Firebase");
        database = database ?? "Firebase";
      }
      if (allDeps["@planetscale/database"]) {
        database = database ?? "PlanetScale (MySQL)";
      }
      if (allDeps["redis"] || allDeps["ioredis"]) {
        database = database ? database + " + Redis" : "Redis";
      }
      if (allDeps["pg"] || allDeps["postgres"]) {
        database = database ?? "PostgreSQL";
      }
      if (allDeps["mysql2"]) {
        database = database ?? "MySQL";
      }
      if (allDeps["better-sqlite3"]) {
        database = database ?? "SQLite";
      }
      if (allDeps["zustand"]) stateManagement = "Zustand";
      if (allDeps["redux"] || allDeps["@reduxjs/toolkit"]) stateManagement = "Redux";
      if (allDeps["mobx"]) stateManagement = "MobX";
      if (allDeps["jotai"]) stateManagement = "Jotai";
      if (allDeps["recoil"]) stateManagement = "Recoil";
      if (allDeps["valtio"]) stateManagement = "Valtio";
      if (allDeps["pinia"]) stateManagement = "Pinia";
      if (allDeps["@tanstack/react-query"]) stateManagement = stateManagement ? stateManagement + " + TanStack Query" : "TanStack Query";
      if (allDeps["tailwindcss"]) {
        frameworks.push("Tailwind CSS");
        styling = "Tailwind CSS";
      }
      if (allDeps["styled-components"]) styling = styling ?? "styled-components";
      if (allDeps["@emotion/react"]) styling = styling ?? "Emotion";
      if (allDeps["sass"]) styling = styling ?? "Sass";
      if (allDeps["@mui/material"]) {
        frameworks.push("Material UI");
        styling = styling ?? "Material UI";
      }
      if (allDeps["@chakra-ui/react"]) {
        frameworks.push("Chakra UI");
        styling = styling ?? "Chakra UI";
      }
      if (allDeps["@mantine/core"]) {
        frameworks.push("Mantine");
        styling = styling ?? "Mantine";
      }
      if (allDeps["shadcn-ui"] || allDeps["@radix-ui/react-dialog"]) styling = styling ?? "shadcn/ui";
      if (allDeps["@trpc/server"] || allDeps["@trpc/client"]) apiPattern = "tRPC";
      if (allDeps["graphql"] || allDeps["@apollo/client"] || allDeps["urql"]) apiPattern = apiPattern ?? "GraphQL";
      if (allDeps["@tanstack/react-query"] && !apiPattern) apiPattern = "REST (TanStack Query)";
      if (allDeps["axios"] || allDeps["ky"] || allDeps["got"]) apiPattern = apiPattern ?? "REST";
      if (allDeps["socket.io"] || allDeps["ws"]) apiPattern = apiPattern ? apiPattern + " + WebSocket" : "WebSocket";
      if (allDeps["vitest"]) {
        hasTests = true;
        testFramework = "Vitest";
      }
      if (allDeps["jest"]) {
        hasTests = true;
        testFramework = testFramework ?? "Jest";
      }
      if (allDeps["@playwright/test"]) {
        hasTests = true;
        testFramework = testFramework ? testFramework + " + Playwright" : "Playwright";
      }
      if (allDeps["cypress"]) {
        hasTests = true;
        testFramework = testFramework ? testFramework + " + Cypress" : "Cypress";
      }
      if (allDeps["mocha"]) {
        hasTests = true;
        testFramework = testFramework ?? "Mocha";
      }
      if (allDeps["@testing-library/react"]) {
        hasTests = true;
        testFramework = testFramework ? testFramework + " + Testing Library" : "Testing Library";
      }
      if (pkg.description) description = String(pkg.description);
    } catch {
    }
  }
  if ((0, import_node_fs11.existsSync)((0, import_node_path12.join)(projectPath, "requirements.txt")) || (0, import_node_fs11.existsSync)((0, import_node_path12.join)(projectPath, "pyproject.toml"))) {
    if (packageManager === "unknown") packageManager = "pip";
    try {
      const pyContent = (0, import_node_fs11.existsSync)((0, import_node_path12.join)(projectPath, "pyproject.toml")) ? (0, import_node_fs11.readFileSync)((0, import_node_path12.join)(projectPath, "pyproject.toml"), "utf-8") : (0, import_node_fs11.existsSync)((0, import_node_path12.join)(projectPath, "requirements.txt")) ? (0, import_node_fs11.readFileSync)((0, import_node_path12.join)(projectPath, "requirements.txt"), "utf-8") : "";
      if (pyContent.includes("django")) frameworks.push("Django");
      if (pyContent.includes("fastapi")) frameworks.push("FastAPI");
      if (pyContent.includes("flask")) frameworks.push("Flask");
      if (pyContent.includes("starlette")) frameworks.push("Starlette");
      if (pyContent.includes("celery")) frameworks.push("Celery");
      if (pyContent.includes("airflow")) frameworks.push("Airflow");
      if (pyContent.includes("dbt")) frameworks.push("dbt");
      if (pyContent.includes("pandas") || pyContent.includes("numpy")) frameworks.push("Data Science (pandas/numpy)");
      if (pyContent.includes("pytorch") || pyContent.includes("torch")) frameworks.push("PyTorch");
      if (pyContent.includes("tensorflow")) frameworks.push("TensorFlow");
      if (pyContent.includes("langchain")) frameworks.push("LangChain");
      if (pyContent.includes("sqlalchemy")) {
        database = database ?? "SQL (SQLAlchemy)";
      }
      if (pyContent.includes("psycopg")) {
        database = database ?? "PostgreSQL";
      }
      if (pyContent.includes("pymongo")) {
        database = database ?? "MongoDB";
      }
      if (pyContent.includes("pytest")) {
        hasTests = true;
        testFramework = testFramework ?? "pytest";
      }
      if (pyContent.includes("unittest")) {
        hasTests = true;
        testFramework = testFramework ?? "unittest";
      }
      if ((0, import_node_fs11.existsSync)((0, import_node_path12.join)(projectPath, "poetry.lock"))) packageManager = "poetry";
      if ((0, import_node_fs11.existsSync)((0, import_node_path12.join)(projectPath, "pdm.lock"))) packageManager = "pdm";
      if ((0, import_node_fs11.existsSync)((0, import_node_path12.join)(projectPath, "uv.lock"))) packageManager = "uv";
    } catch {
    }
  }
  if ((0, import_node_fs11.existsSync)((0, import_node_path12.join)(projectPath, "go.mod"))) {
    if (packageManager === "unknown") packageManager = "go modules";
    try {
      const gomod = (0, import_node_fs11.readFileSync)((0, import_node_path12.join)(projectPath, "go.mod"), "utf-8");
      if (gomod.includes("gin-gonic")) frameworks.push("Gin");
      if (gomod.includes("fiber")) frameworks.push("Fiber");
      if (gomod.includes("echo")) frameworks.push("Echo");
      if (gomod.includes("chi")) frameworks.push("Chi");
      if (gomod.includes("grpc")) {
        frameworks.push("gRPC");
        apiPattern = apiPattern ?? "gRPC";
      }
      if (gomod.includes("ent")) frameworks.push("Ent ORM");
      if (gomod.includes("sqlx") || gomod.includes("pgx")) database = database ?? "PostgreSQL";
      if (gomod.includes("mongo-driver")) database = database ?? "MongoDB";
    } catch {
    }
  }
  if ((0, import_node_fs11.existsSync)((0, import_node_path12.join)(projectPath, "Cargo.toml"))) {
    if (packageManager === "unknown") packageManager = "cargo";
    try {
      const cargo = (0, import_node_fs11.readFileSync)((0, import_node_path12.join)(projectPath, "Cargo.toml"), "utf-8");
      if (cargo.includes("actix")) frameworks.push("Actix");
      if (cargo.includes("axum")) frameworks.push("Axum");
      if (cargo.includes("rocket")) frameworks.push("Rocket");
      if (cargo.includes("tokio")) frameworks.push("Tokio");
      if (cargo.includes("diesel")) {
        frameworks.push("Diesel ORM");
        database = database ?? "PostgreSQL";
      }
      if (cargo.includes("sqlx")) database = database ?? "PostgreSQL";
      if (cargo.includes("tonic")) {
        frameworks.push("Tonic (gRPC)");
        apiPattern = apiPattern ?? "gRPC";
      }
    } catch {
    }
  }
  if ((0, import_node_fs11.existsSync)((0, import_node_path12.join)(projectPath, "Gemfile"))) {
    if (packageManager === "unknown") packageManager = "bundler";
    try {
      const gemfile = (0, import_node_fs11.readFileSync)((0, import_node_path12.join)(projectPath, "Gemfile"), "utf-8");
      if (gemfile.includes("rails")) frameworks.push("Ruby on Rails");
      if (gemfile.includes("sinatra")) frameworks.push("Sinatra");
      if (gemfile.includes("rspec")) {
        hasTests = true;
        testFramework = testFramework ?? "RSpec";
      }
    } catch {
    }
  }
  if ((0, import_node_fs11.existsSync)((0, import_node_path12.join)(projectPath, "build.gradle")) || (0, import_node_fs11.existsSync)((0, import_node_path12.join)(projectPath, "build.gradle.kts")) || (0, import_node_fs11.existsSync)((0, import_node_path12.join)(projectPath, "pom.xml"))) {
    if (packageManager === "unknown") {
      packageManager = (0, import_node_fs11.existsSync)((0, import_node_path12.join)(projectPath, "pom.xml")) ? "maven" : "gradle";
    }
    try {
      const buildFile = (0, import_node_fs11.existsSync)((0, import_node_path12.join)(projectPath, "build.gradle")) ? (0, import_node_fs11.readFileSync)((0, import_node_path12.join)(projectPath, "build.gradle"), "utf-8") : (0, import_node_fs11.existsSync)((0, import_node_path12.join)(projectPath, "build.gradle.kts")) ? (0, import_node_fs11.readFileSync)((0, import_node_path12.join)(projectPath, "build.gradle.kts"), "utf-8") : (0, import_node_fs11.existsSync)((0, import_node_path12.join)(projectPath, "pom.xml")) ? (0, import_node_fs11.readFileSync)((0, import_node_path12.join)(projectPath, "pom.xml"), "utf-8") : "";
      if (buildFile.includes("spring")) frameworks.push("Spring Boot");
      if (buildFile.includes("android")) frameworks.push("Android");
      if (buildFile.includes("ktor")) frameworks.push("Ktor");
    } catch {
    }
  }
  if ((0, import_node_fs11.existsSync)((0, import_node_path12.join)(projectPath, ".github", "workflows"))) {
    hasCI = true;
    ciPlatform = "GitHub Actions";
  } else if ((0, import_node_fs11.existsSync)((0, import_node_path12.join)(projectPath, ".gitlab-ci.yml"))) {
    hasCI = true;
    ciPlatform = "GitLab CI";
  } else if ((0, import_node_fs11.existsSync)((0, import_node_path12.join)(projectPath, "azure-pipelines.yml"))) {
    hasCI = true;
    ciPlatform = "Azure Pipelines";
  } else if ((0, import_node_fs11.existsSync)((0, import_node_path12.join)(projectPath, ".circleci"))) {
    hasCI = true;
    ciPlatform = "CircleCI";
  } else if ((0, import_node_fs11.existsSync)((0, import_node_path12.join)(projectPath, "Jenkinsfile"))) {
    hasCI = true;
    ciPlatform = "Jenkins";
  } else if ((0, import_node_fs11.existsSync)((0, import_node_path12.join)(projectPath, "bitbucket-pipelines.yml"))) {
    hasCI = true;
    ciPlatform = "Bitbucket Pipelines";
  }
  hasDocker = (0, import_node_fs11.existsSync)((0, import_node_path12.join)(projectPath, "Dockerfile")) || (0, import_node_fs11.existsSync)((0, import_node_path12.join)(projectPath, "docker-compose.yml")) || (0, import_node_fs11.existsSync)((0, import_node_path12.join)(projectPath, "docker-compose.yaml"));
  if (!hasTests) {
    hasTests = (0, import_node_fs11.existsSync)((0, import_node_path12.join)(projectPath, "tests")) || (0, import_node_fs11.existsSync)((0, import_node_path12.join)(projectPath, "test")) || (0, import_node_fs11.existsSync)((0, import_node_path12.join)(projectPath, "__tests__")) || (0, import_node_fs11.existsSync)((0, import_node_path12.join)(projectPath, "spec")) || (0, import_node_fs11.existsSync)((0, import_node_path12.join)(projectPath, "e2e"));
  }
  const existingAgents = [];
  const claudeAgentsDir = (0, import_node_path12.join)(projectPath, ".claude", "agents");
  if ((0, import_node_fs11.existsSync)(claudeAgentsDir)) {
    try {
      const agentFiles = (0, import_node_fs11.readdirSync)(claudeAgentsDir).filter((f) => f.endsWith(".md"));
      for (const f of agentFiles) {
        existingAgents.push((0, import_node_path12.basename)(f, ".md"));
      }
    } catch {
    }
  }
  let repoInfo;
  try {
    const remote = (0, import_node_child_process8.execSync)("git remote get-url origin", {
      cwd: projectPath,
      encoding: "utf-8",
      timeout: 5e3
    }).trim();
    const branch = (0, import_node_child_process8.execSync)("git branch --show-current", {
      cwd: projectPath,
      encoding: "utf-8",
      timeout: 5e3
    }).trim();
    let platform;
    if (remote.includes("github.com")) platform = "GitHub";
    else if (remote.includes("gitlab.com") || remote.includes("gitlab")) platform = "GitLab";
    else if (remote.includes("dev.azure.com") || remote.includes("visualstudio.com")) platform = "Azure DevOps";
    else if (remote.includes("bitbucket.org")) platform = "Bitbucket";
    repoInfo = { remote, branch, platform };
  } catch {
  }
  scanLanguages(projectPath, languages, 4);
  const projectStructure = [];
  try {
    const entries = (0, import_node_fs11.readdirSync)(projectPath);
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry) || entry.startsWith(".")) continue;
      const fullPath = (0, import_node_path12.join)(projectPath, entry);
      try {
        if ((0, import_node_fs11.statSync)(fullPath).isDirectory()) {
          projectStructure.push(entry + "/");
        }
      } catch {
      }
    }
  } catch {
  }
  const readmeFiles = ["README.md", "readme.md", "README.rst", "README.txt", "README"];
  for (const rf of readmeFiles) {
    const rp = (0, import_node_path12.join)(projectPath, rf);
    if ((0, import_node_fs11.existsSync)(rp)) {
      try {
        readme = (0, import_node_fs11.readFileSync)(rp, "utf-8").slice(0, 2e3);
      } catch {
      }
      break;
    }
  }
  return {
    name,
    path: projectPath,
    languages: [...languages],
    frameworks: [...new Set(frameworks)],
    packageManager,
    hasTests,
    testFramework,
    hasCI,
    ciPlatform,
    hasDocker,
    database,
    stateManagement,
    styling,
    apiPattern,
    projectStructure,
    keyFiles,
    existingAgents,
    repoInfo,
    readme,
    description
  };
}
function scanLanguages(dir, languages, maxDepth, depth = 0) {
  if (depth >= maxDepth) return;
  try {
    const entries = (0, import_node_fs11.readdirSync)(dir);
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry) || entry.startsWith(".")) continue;
      const fullPath = (0, import_node_path12.join)(dir, entry);
      try {
        const stat2 = (0, import_node_fs11.statSync)(fullPath);
        if (stat2.isDirectory()) {
          scanLanguages(fullPath, languages, maxDepth, depth + 1);
        } else {
          const ext = (0, import_node_path12.extname)(entry).toLowerCase();
          const lang = EXT_LANG_MAP[ext];
          if (lang) languages.add(lang);
        }
      } catch {
      }
    }
  } catch {
  }
}

// server/automation-templates.ts
var AUTOMATION_TEMPLATES2 = [
  {
    id: "code-health",
    name: "Code Health Scan",
    description: "Runs type checking, tests, and security audit. Reports failures with fix suggestions.",
    icon: "HeartPulse",
    applicableTo: ["any"],
    defaultSchedule: "every 2h",
    defaultModel: "haiku",
    outputParser: "json",
    promptTemplate: `Analyze the project at {{projectPath}} for code health.

Run each check and report results. If a check is not applicable (e.g., no test runner configured), note it as "skipped".

1. **Type checker**
   - TypeScript: \`npx tsc --noEmit\`
   - Python: \`mypy . --ignore-missing-imports\` or \`pyright .\`
   - Go: \`go vet ./...\`
   - If no type system: skip

2. **Tests**
   - Detect the test runner from package.json scripts, setup.cfg, pyproject.toml, or Cargo.toml
   - Run it with a timeout of 60 seconds
   - If no test runner found: skip

3. **Security audit**
   - Node: \`npm audit --json\`
   - Python: \`pip-audit\` or \`safety check\`
   - Rust: \`cargo audit\`
   - If no package manager: skip

4. **Code quality**
   - Check for TODO/FIXME/HACK comments in source files (skip node_modules, .git, dist, build)
   - Count them and list the top 10

Output a JSON object (no markdown fences around it):
{
  "typeCheck": {"pass": true, "errors": 0, "details": "..."},
  "tests": {"pass": true, "total": 0, "failed": 0, "skipped": false, "details": "..."},
  "security": {"vulnerabilities": 0, "critical": 0, "details": "..."},
  "todos": [{"file": "...", "line": 1, "text": "..."}],
  "summary": "One paragraph overall health assessment",
  "score": 85
}

Score guide: 100 = all checks pass, no todos. Subtract 5 per type error, 10 per test failure, 15 per critical vulnerability, 1 per todo.`,
    suggestedActions: [
      {
        condition: "type.*error|typeCheck.*false",
        title: "Fix type errors",
        agent: "backend",
        promptTemplate: "Fix all TypeScript/type errors in {{projectPath}}. Run `npx tsc --noEmit` and fix each error."
      },
      {
        condition: "test.*fail|tests.*false",
        title: "Fix failing tests",
        agent: "qa",
        promptTemplate: "Fix failing tests in {{projectPath}}. Run the test suite, identify failures, and fix them."
      },
      {
        condition: "critical.*[1-9]|vulnerabilit.*[1-9]",
        title: "Fix security vulnerabilities",
        agent: "security",
        promptTemplate: "Fix critical security vulnerabilities in {{projectPath}}. Run `npm audit fix` or equivalent, then manually fix remaining issues."
      }
    ]
  },
  {
    id: "pr-reviewer",
    name: "PR Reviewer",
    description: "Reviews open pull requests for bugs, style issues, and missing tests.",
    icon: "GitPullRequest",
    applicableTo: ["any"],
    defaultSchedule: "every 6h",
    defaultModel: "sonnet",
    outputParser: "json",
    promptTemplate: `Review open pull requests in the repo at {{projectPath}}.

Use \`gh pr list --json number,title,author,url,additions,deletions,files --limit 10\` to find open PRs.

For each open PR:
1. Read the diff: \`gh pr diff <number>\`
2. Check for:
   - Bugs: null pointer risks, off-by-one errors, race conditions, unhandled errors
   - Security: SQL injection, XSS, hardcoded secrets, insecure dependencies
   - Style: inconsistent naming, dead code, overly complex functions (>50 lines)
   - Missing tests: new code paths without corresponding test coverage
   - API contract: breaking changes to public interfaces
3. Be constructive \u2014 suggest specific improvements, not vague complaints

Output JSON (no markdown fences):
{
  "prs": [
    {
      "number": 123,
      "title": "...",
      "author": "...",
      "url": "...",
      "issues": [
        {"severity": "high", "category": "bug|security|style|tests", "description": "...", "file": "...", "line": 0, "suggestion": "..."}
      ],
      "verdict": "approve|request-changes|comment",
      "summary": "One sentence summary of the PR quality"
    }
  ],
  "summary": "Overall summary across all PRs"
}

If \`gh\` is not installed or no PRs are open, say so in the summary and return an empty prs array.`,
    suggestedActions: [
      {
        condition: "request-changes",
        title: "Address PR review comments",
        agent: "backend",
        promptTemplate: "Address the review comments on PR #{{prNumber}} in {{projectPath}}."
      }
    ]
  },
  {
    id: "security-scan",
    name: "Security Scanner",
    description: "Checks dependencies for vulnerabilities and scans code for hardcoded secrets.",
    icon: "Shield",
    applicableTo: ["any"],
    defaultSchedule: "daily",
    defaultModel: "sonnet",
    outputParser: "json",
    promptTemplate: `Perform a thorough security scan on {{projectPath}}.

1. **Dependency vulnerabilities**
   - Node: \`npm audit --json\` \u2014 parse the JSON output for severity counts
   - Python: \`pip-audit\` or \`safety check --json\`
   - If no package manager detected: skip

2. **Hardcoded secrets scan**
   - Search source files (not node_modules, .git, dist, build, coverage) for patterns:
     - API keys: strings matching /[A-Za-z0-9_-]{20,}/ near keywords like "api_key", "apikey", "secret", "token"
     - AWS keys: /AKIA[0-9A-Z]{16}/
     - Private keys: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/
     - Connection strings: /mongodb+srv://|postgres://|mysql:/// with credentials
   - Show file, line number, and a redacted preview (first 8 chars + "...")

3. **Security anti-patterns**
   - eval() usage with dynamic input
   - SQL string concatenation (instead of parameterized queries)
   - innerHTML assignment with user input
   - Disabled CSRF protection
   - HTTP instead of HTTPS in API URLs

4. **Gitignore review**
   - Check if .env, .env.local, .env.production, credentials.json, *.pem are in .gitignore
   - Check if they exist in the repo (accidental commits)

Output JSON (no markdown fences):
{
  "dependencies": {"vulnerabilities": 0, "critical": [], "high": [], "moderate": []},
  "secrets": [{"file": "...", "line": 0, "type": "api_key|password|token|aws_key|private_key", "preview": "AKIA1234..."}],
  "antiPatterns": [{"file": "...", "line": 0, "pattern": "eval|sql-concat|innerHTML", "severity": "high|medium|low", "fix": "..."}],
  "gitignore": {"missing": [], "committed": []},
  "score": 90,
  "summary": "Overall security posture assessment"
}`,
    suggestedActions: [
      {
        condition: "secret|AKIA|private.key|password",
        title: "Remove hardcoded secrets",
        agent: "security",
        promptTemplate: "Remove hardcoded secrets from {{projectPath}}. Move them to environment variables and update .gitignore."
      },
      {
        condition: "critical.*[1-9]",
        title: "Fix critical vulnerabilities",
        agent: "security",
        promptTemplate: "Fix critical dependency vulnerabilities in {{projectPath}}. Run the package manager's audit fix command."
      }
    ]
  },
  {
    id: "dependency-update",
    name: "Dependency Updater",
    description: "Checks for outdated packages and suggests safe update paths.",
    icon: "Package",
    applicableTo: ["node", "python", "rust"],
    defaultSchedule: "weekly",
    defaultModel: "haiku",
    outputParser: "json",
    promptTemplate: `Check {{projectPath}} for outdated dependencies.

1. **List outdated packages**
   - Node: \`npm outdated --json\`
   - Python: \`pip list --outdated --format=json\`
   - Rust: \`cargo outdated --format json\` (if installed)

2. **Classify each update**
   - Patch (x.y.Z): safe to auto-update
   - Minor (x.Y.0): usually safe, check changelog
   - Major (X.0.0): likely breaking changes \u2014 flag prominently

3. **Check for security relevance**
   - Cross-reference with known vulnerability databases
   - Mark packages that have security advisories

4. **Suggest update order**
   - Start with security-relevant patches
   - Then safe patches
   - Then minor updates
   - Major updates last (one at a time, with testing)

Output JSON (no markdown fences):
{
  "outdated": [
    {"name": "...", "current": "1.0.0", "latest": "2.0.0", "type": "major|minor|patch", "breaking": false, "securityRelevant": false}
  ],
  "suggestedOrder": ["pkg-security-fix", "pkg-patch", "pkg-minor"],
  "stats": {"total": 0, "major": 0, "minor": 0, "patch": 0, "securityRelevant": 0},
  "summary": "One paragraph dependency health assessment"
}`,
    suggestedActions: [
      {
        condition: "securityRelevant.*true",
        title: "Apply security updates",
        agent: "backend",
        promptTemplate: "Update security-relevant packages in {{projectPath}}: {{packages}}. Run tests after each update."
      }
    ]
  },
  {
    id: "test-coverage",
    name: "Test Coverage Analyzer",
    description: "Identifies untested code paths and suggests specific test cases.",
    icon: "TestTube",
    applicableTo: ["node", "python"],
    defaultSchedule: "daily",
    defaultModel: "sonnet",
    outputParser: "json",
    promptTemplate: `Analyze test coverage for {{projectPath}}.

1. **Run coverage report** (if possible)
   - Node/Jest: \`npx jest --coverage --json 2>/dev/null\` or check for existing coverage/ directory
   - Node/Vitest: \`npx vitest run --coverage --reporter=json 2>/dev/null\`
   - Python: \`python -m pytest --cov --cov-report=json 2>/dev/null\`
   - If coverage tools aren't configured, analyze file-by-file

2. **Identify files with no tests**
   - Find source files that have no corresponding test file
   - Convention: src/foo.ts -> tests/foo.test.ts, src/foo.py -> tests/test_foo.py

3. **Identify critical untested paths**
   - Authentication/authorization code
   - Payment/billing logic
   - Data mutation endpoints (POST/PUT/DELETE handlers)
   - Error handling paths
   - Input validation

4. **Suggest specific test cases**
   - For each critical gap, write 2-3 concrete test case descriptions
   - Include edge cases: empty input, null values, unauthorized access, concurrent requests

Output JSON (no markdown fences):
{
  "coverage": {"percentage": 0, "files": {"tested": 0, "untested": 0, "total": 0}},
  "untestedFiles": [{"file": "...", "reason": "No corresponding test file", "priority": "high|medium|low"}],
  "criticalGaps": [
    {"file": "...", "function": "...", "reason": "Auth logic without tests", "suggestedTests": ["Test login with valid credentials", "Test login with expired token"]}
  ],
  "summary": "Overall test coverage assessment with actionable recommendations"
}`,
    suggestedActions: [
      {
        condition: "criticalGaps.*auth|criticalGaps.*payment",
        title: "Write critical path tests",
        agent: "qa",
        promptTemplate: "Write tests for critical untested code paths in {{projectPath}}: {{gaps}}."
      }
    ]
  },
  {
    id: "documentation",
    name: "Documentation Checker",
    description: "Reviews README, API docs, and inline comments for completeness.",
    icon: "BookOpen",
    applicableTo: ["any"],
    defaultSchedule: "weekly",
    defaultModel: "haiku",
    outputParser: "json",
    promptTemplate: `Review documentation quality for {{projectPath}}.

1. **README analysis**
   - Check for: project description, installation steps, usage examples, API reference, contributing guide, license
   - Rate completeness as a percentage

2. **Inline documentation**
   - Sample 20 source files (prioritize main entry points, API handlers, utility functions)
   - Check for: JSDoc/docstrings on exported functions, comments on complex logic, type annotations
   - Rate as good (>70% documented), fair (40-70%), or poor (<40%)

3. **API documentation** (if applicable)
   - Check for OpenAPI/Swagger specs
   - Check if API routes have request/response documentation
   - List undocumented endpoints

4. **Outdated references**
   - Check README for references to files or functions that no longer exist
   - Check for broken relative links
   - Check for version numbers that don't match package.json

Output JSON (no markdown fences):
{
  "readme": {"exists": true, "completeness": 60, "sections": ["description", "install"], "missing": ["api", "contributing"]},
  "inlineDocs": {"coverage": "fair", "sampledFiles": 20, "documented": 12, "gaps": [{"file": "...", "function": "...", "type": "missing-jsdoc|missing-comment"}]},
  "apiDocs": {"hasSpec": false, "documented": 0, "undocumented": 0, "endpoints": []},
  "outdated": [{"file": "...", "issue": "References removed function foo()"}],
  "summary": "Overall documentation quality assessment"
}`
  }
];
function getTemplate(id) {
  return AUTOMATION_TEMPLATES2.find((t) => t.id === id);
}
function fillPromptTemplate(template, values) {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}

// server/automation-suggestions.ts
function normalizeStack(profile) {
  const tags = /* @__PURE__ */ new Set();
  for (const lang of profile.languages) {
    const lower = lang.toLowerCase();
    if (lower.includes("typescript") || lower.includes("javascript")) {
      tags.add("node");
    }
    if (lower.includes("python")) tags.add("python");
    if (lower.includes("rust")) tags.add("rust");
    if (lower.includes("go")) tags.add("go");
    if (lower.includes("java") && !lower.includes("javascript")) tags.add("java");
    if (lower.includes("ruby")) tags.add("ruby");
  }
  for (const fw of profile.frameworks) {
    const lower = fw.toLowerCase();
    if (lower.includes("next") || lower.includes("react") || lower.includes("express") || lower.includes("node")) {
      tags.add("node");
    }
    if (lower.includes("django") || lower.includes("flask") || lower.includes("fastapi")) {
      tags.add("python");
    }
  }
  return Array.from(tags);
}
function getReasonForProject(template, profile, stackTags) {
  switch (template.id) {
    case "code-health": {
      const checks = [];
      if (stackTags.includes("node")) checks.push("TypeScript type checking");
      if (profile.hasTests) checks.push("test runner detected");
      if (stackTags.includes("node")) checks.push("npm audit");
      if (stackTags.includes("python")) checks.push("pip-audit");
      return checks.length > 0 ? `Your project supports: ${checks.join(", ")}` : "Recommended for all projects \u2014 catches common issues early";
    }
    case "pr-reviewer":
      return "Automated PR reviews catch bugs before they reach main";
    case "security-scan":
      return "Recommended for all projects \u2014 finds vulnerabilities and leaked secrets";
    case "dependency-update": {
      const mgr = profile.packageManager || "detected package manager";
      return `Uses ${mgr} \u2014 outdated dependencies are a common security risk`;
    }
    case "test-coverage":
      return profile.hasTests ? "Tests detected \u2014 coverage analysis will find untested critical paths" : "No tests detected yet \u2014 coverage analyzer will identify where to start";
    case "documentation":
      return "Keeps README and docs in sync with code changes";
    default:
      return "Suggested based on your project structure";
  }
}
function getFrameworkAdditions(templateId, profile) {
  const additions = [];
  const frameworks = profile.frameworks.map((f) => f.toLowerCase());
  if (templateId === "code-health") {
    if (frameworks.some((f) => f.includes("next"))) {
      additions.push("Note: This is a Next.js project. Also check for: unused pages, broken API routes, middleware issues.");
    }
    if (frameworks.some((f) => f.includes("express"))) {
      additions.push("Note: This is an Express project. Check for: unhandled async errors, missing error middleware.");
    }
    if (frameworks.some((f) => f.includes("django"))) {
      additions.push("Note: This is a Django project. Also run: `python manage.py check --deploy` for deployment readiness.");
    }
  }
  if (templateId === "security-scan") {
    if (frameworks.some((f) => f.includes("next") || f.includes("react"))) {
      additions.push("Note: React/Next.js project. Pay special attention to dangerouslySetInnerHTML usage and CSRF protection.");
    }
    if (frameworks.some((f) => f.includes("express"))) {
      additions.push("Note: Express project. Check for: helmet middleware, CORS configuration, rate limiting.");
    }
  }
  if (templateId === "test-coverage") {
    if (frameworks.some((f) => f.includes("next"))) {
      additions.push("Note: Next.js project. Check coverage of: API routes (app/api/), middleware, server components.");
    }
  }
  return additions.length > 0 ? "\n\n" + additions.join("\n") : "";
}
function suggestAutomations(profile, projectPath) {
  const stackTags = normalizeStack(profile);
  const suggestions = [];
  for (const template of AUTOMATION_TEMPLATES2) {
    const applies = template.applicableTo.includes("any") || template.applicableTo.some((t) => stackTags.includes(t));
    if (!applies) continue;
    let prompt = fillPromptTemplate(template.promptTemplate, {
      projectPath
    });
    prompt += getFrameworkAdditions(template.id, profile);
    const isRecommended = template.id === "code-health" || template.id === "security-scan" || template.id === "test-coverage" && profile.hasTests;
    suggestions.push({
      template,
      reason: getReasonForProject(template, profile, stackTags),
      customizedPrompt: prompt,
      priority: isRecommended ? "recommended" : "optional"
    });
  }
  suggestions.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority === "recommended" ? -1 : 1;
    }
    return a.template.name.localeCompare(b.template.name);
  });
  return suggestions;
}

// server/claudemd-generator.ts
var import_node_fs12 = require("node:fs");
var import_node_path13 = require("node:path");
function generateClaudeMd(options) {
  const { analysis, agents, projectPath } = options;
  const agentTable = agents.length > 0 ? agents.map((a) => `| **${a.id}** | ${a.description} | ${a.model} |`).join("\n") : "| (none configured) | Run setup wizard to generate agents | - |";
  const languageList = analysis.languages.length > 0 ? analysis.languages.join(", ") : "Not detected";
  const frameworkList = analysis.frameworks.length > 0 ? analysis.frameworks.join(", ") : "Not detected";
  const codeStyleSection = detectCodeStyle(projectPath);
  return `# ${analysis.name} \u2014 Claude Code Instructions

## Project Overview

${analysis.description || `A ${frameworkList} project.`}

- **Languages**: ${languageList}
- **Frameworks**: ${frameworkList}
- **Package Manager**: ${analysis.packageManager || "Not detected"}
- **Tests**: ${analysis.hasTests ? "Configured" : "Not configured"}
- **CI/CD**: ${analysis.hasCI ? "Configured" : "Not configured"}
- **Docker**: ${analysis.hasDocker ? "Yes" : "No"}

## Agent System

This project uses a multi-agent architecture managed by Agent Studio.
Agents are defined in \`.claude/agents/\`.

### Available Agents

| Agent | Description | Model |
|-------|-------------|-------|
${agentTable}

## Core Rules

- Follow the reasoning protocol in each agent's .md file
- Never commit secrets, API keys, or credentials
- Run the type checker before committing (\`npx tsc --noEmit\` or equivalent)
- All agents report completion to the orchestrator
- Test changes before marking tasks complete

## Memory Protocol

After completing any significant task, write a memory file:

| What happened | Folder |
|---------------|--------|
| Discovered a pattern | \`ai-agents/memory/learnings/\` |
| Fixed a bug | \`ai-agents/memory/corrections/\` |
| Made a decision | \`ai-agents/memory/decisions/\` |

File format: \`YYYYMMDD_HHMMSS_{agent}_{type}.json\`

${codeStyleSection}
## Project Structure

\`\`\`
${analysis.projectStructure?.join("\n") || "Run project analysis to detect structure"}
\`\`\`
`;
}
function writeClaudeMd(options) {
  const filePath = (0, import_node_path13.join)(options.projectPath, "CLAUDE.md");
  const exists = (0, import_node_fs12.existsSync)(filePath);
  if (exists && options.preserveExisting) {
    return { path: filePath, created: false, skipped: true };
  }
  const content = generateClaudeMd(options);
  (0, import_node_fs12.writeFileSync)(filePath, content, "utf-8");
  return { path: filePath, created: !exists, skipped: false };
}
function detectCodeStyle(projectPath) {
  const sections = ["## Code Style\n"];
  let hasAnyConfig = false;
  const eslintFiles = [
    ".eslintrc.js",
    ".eslintrc.cjs",
    ".eslintrc.json",
    ".eslintrc.yml",
    "eslint.config.js",
    "eslint.config.mjs",
    "eslint.config.ts"
  ];
  for (const f of eslintFiles) {
    if ((0, import_node_fs12.existsSync)((0, import_node_path13.join)(projectPath, f))) {
      sections.push(`- **ESLint**: Configured (\`${f}\`) \u2014 run \`npx eslint .\` to check`);
      hasAnyConfig = true;
      break;
    }
  }
  const prettierFiles = [
    ".prettierrc",
    ".prettierrc.js",
    ".prettierrc.json",
    ".prettierrc.yml",
    "prettier.config.js",
    "prettier.config.mjs"
  ];
  for (const f of prettierFiles) {
    if ((0, import_node_fs12.existsSync)((0, import_node_path13.join)(projectPath, f))) {
      sections.push(`- **Prettier**: Configured (\`${f}\`) \u2014 run \`npx prettier --check .\` to verify`);
      hasAnyConfig = true;
      break;
    }
  }
  if ((0, import_node_fs12.existsSync)((0, import_node_path13.join)(projectPath, ".editorconfig"))) {
    sections.push("- **EditorConfig**: Present \u2014 IDE should respect indentation and line endings");
    hasAnyConfig = true;
  }
  if ((0, import_node_fs12.existsSync)((0, import_node_path13.join)(projectPath, "tsconfig.json"))) {
    try {
      const raw = (0, import_node_fs12.readFileSync)((0, import_node_path13.join)(projectPath, "tsconfig.json"), "utf-8");
      const tsconfig = JSON.parse(raw);
      const strict = tsconfig.compilerOptions?.strict ? "strict mode enabled" : "strict mode not enabled";
      sections.push(`- **TypeScript**: Configured (\`tsconfig.json\`, ${strict})`);
      hasAnyConfig = true;
    } catch {
      sections.push("- **TypeScript**: Configured (`tsconfig.json`)");
      hasAnyConfig = true;
    }
  }
  if (!hasAnyConfig) {
    sections.push("No linter or formatter configuration detected. Consider adding ESLint and Prettier.");
  }
  return sections.join("\n") + "\n";
}

// server/index.ts
var port = parseInt(process.env["PORT"] ?? "8080", 10);
var dev = process.env["NODE_ENV"] !== "production";
function validateProjectPath(inputPath) {
  const resolved = import_node_path14.default.resolve(inputPath);
  if (isAllowedPath(resolved)) {
    if (import_node_fs13.default.existsSync(resolved)) {
      return resolved;
    }
  }
  return null;
}
async function main() {
  const existingConfig = loadConfig();
  if (!existingConfig) {
    const defaultConfig = generateDefaultConfig();
    saveConfig(defaultConfig);
    console.log("Generated default config at .agent-studio.json");
  }
  const app = (0, import_express2.default)();
  app.use(import_express2.default.json());
  const server = (0, import_node_http.createServer)(app);
  const wss = new import_ws.WebSocketServer({ noServer: true });
  const terminalManager = new TerminalManager();
  const serverStartTime = Date.now();
  app.get("/api/health", (_req, res) => {
    const sessions = terminalManager.listSessions();
    res.json({
      status: "ok",
      uptime: Math.floor((Date.now() - serverStartTime) / 1e3),
      activeSessions: sessions.filter((s) => s.status === "active").length,
      totalSessions: sessions.length,
      wsClients: wss.clients.size,
      memoryUsage: process.memoryUsage().heapUsed,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  const gitWatcher = new GitWatcher();
  const roomManager = new RoomManager();
  const sdkManager = new SdkSessionManager();
  roomManager.on("message", (msg) => {
    const wsMsg = { type: "room-message", payload: msg };
    for (const client of wss.clients) {
      if (client.readyState === import_ws.WebSocket.OPEN) {
        client.send(JSON.stringify(wsMsg));
      }
    }
  });
  roomManager.on("agent-status", (payload) => {
    const wsMsg = { type: "room-agent-status", payload };
    for (const client of wss.clients) {
      if (client.readyState === import_ws.WebSocket.OPEN) {
        client.send(JSON.stringify(wsMsg));
      }
    }
  });
  roomManager.on("approval", (payload) => {
    const wsMsg = { type: "room-approval", payload };
    for (const client of wss.clients) {
      if (client.readyState === import_ws.WebSocket.OPEN) {
        client.send(JSON.stringify(wsMsg));
      }
    }
  });
  let nextUpgradeHandler = null;
  server.on("upgrade", (request, socket, head) => {
    const { pathname } = new URL(
      request.url,
      `http://${request.headers.host}`
    );
    if (pathname === "/ws") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else if (nextUpgradeHandler) {
      nextUpgradeHandler(request, socket, head);
    }
  });
  wss.on("connection", (ws) => {
    const sessionsMsg = {
      type: "sessions-update",
      payload: terminalManager.listSessions()
    };
    ws.send(JSON.stringify(sessionsMsg));
    const gitMsg = {
      type: "git-update",
      payload: gitWatcher.getStatus()
    };
    ws.send(JSON.stringify(gitMsg));
    const unsubscribe = terminalManager.onEvent((message) => {
      if (ws.readyState === import_ws.WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    });
    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(
          typeof raw === "string" ? raw : raw.toString("utf-8")
        );
        if (msg.type === "terminal-input" && msg.sessionId && msg.data) {
          terminalManager.writeToSession(msg.sessionId, msg.data);
        } else if (msg.type === "terminal-resize" && msg.sessionId && msg.cols && msg.rows) {
          terminalManager.resizeSession(msg.sessionId, msg.cols, msg.rows);
        }
      } catch {
      }
    });
    ws.on("close", () => {
      unsubscribe();
    });
    ws.on("error", () => {
      unsubscribe();
    });
  });
  app.get("/api/config", (_req, res) => {
    const config = getConfig();
    res.json({
      homeDir: import_node_os4.default.homedir(),
      cwd: process.cwd(),
      mainProjectDir: getMainProjectDir(),
      defaultCwd: resolvePath(config.defaults?.workingDirectory),
      config
    });
  });
  app.post("/api/config", async (req, res) => {
    try {
      const newConfig = req.body;
      if (!newConfig || !newConfig.version) {
        res.status(400).json({ error: "Invalid config" });
        return;
      }
      saveConfig(newConfig);
      reloadConfig();
      workflowManager.reload();
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.get("/api/agents", async (_req, res) => {
    try {
      const config = getConfig();
      const agents = [];
      const seenIds = /* @__PURE__ */ new Set();
      agents.push({ id: "none", name: "No Agent", description: "Plain Claude session" });
      seenIds.add("none");
      if (config.agents && Array.isArray(config.agents)) {
        for (const a of config.agents) {
          if (!seenIds.has(a.id)) {
            agents.push(a);
            seenIds.add(a.id);
          }
        }
      }
      const { existsSync: existsSync13, readdirSync: readdirSync6 } = await import("node:fs");
      const { readFile: readFile3 } = await import("node:fs/promises");
      const { join: join12, basename: basename5 } = await import("node:path");
      for (const project of config.projects) {
        const agentsDir = join12(project.path, ".claude", "agents");
        if (!existsSync13(agentsDir)) continue;
        try {
          const files = readdirSync6(agentsDir).filter((f) => f.endsWith(".md"));
          for (const file of files) {
            const id = basename5(file, ".md");
            if (seenIds.has(id)) continue;
            let description = `Agent from ${project.name}`;
            let model;
            try {
              const content = await readFile3(join12(agentsDir, file), "utf-8");
              const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
              if (fmMatch) {
                const descMatch = fmMatch[1].match(/description:\s*(.+)/);
                if (descMatch) description = descMatch[1].trim();
              }
            } catch {
            }
            agents.push({ id, name: id, description, model });
            seenIds.add(id);
          }
        } catch {
        }
      }
      if (agents.length <= 1) {
        const defaults = [
          { id: "orchestrator", name: "orchestrator", description: "Coordinates agent teams and delegates work" },
          { id: "frontend", name: "frontend", description: "Builds UI and frontend code" },
          { id: "backend", name: "backend", description: "Builds APIs, database, server logic" },
          { id: "qa", name: "qa", description: "Tests the application" },
          { id: "security", name: "security", description: "Reviews code for vulnerabilities" },
          { id: "pmo", name: "pmo", description: "Scans for tasks, manages sprints" },
          { id: "documentation", name: "documentation", description: "Maintains docs and READMEs" }
        ];
        for (const d of defaults) {
          if (!seenIds.has(d.id)) {
            agents.push(d);
            seenIds.add(d.id);
          }
        }
      }
      res.json(agents);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  const automationEngine = new AutomationEngine(getMainProjectDir());
  const initialConfig = getConfig();
  if (initialConfig.automations && Array.isArray(initialConfig.automations)) {
    automationEngine.loadAutomations(initialConfig.automations);
  }
  automationEngine.onEvent((event) => {
    const msg = {
      type: event.type,
      payload: event.payload
    };
    for (const client of wss.clients) {
      if (client.readyState === import_ws.WebSocket.OPEN) {
        client.send(JSON.stringify(msg));
      }
    }
  });
  app.get("/api/automations", (_req, res) => {
    try {
      const automations = automationEngine.getAutomations();
      res.json(automations);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.post("/api/automations", (req, res) => {
    try {
      const body = req.body;
      if (!body.name || !body.prompt) {
        res.status(400).json({ error: "Missing required fields: name, prompt" });
        return;
      }
      const auto = automationEngine.addAutomation(body);
      const cfg = getConfig();
      cfg.automations = automationEngine.toConfig();
      saveConfig(cfg);
      reloadConfig();
      res.status(201).json(auto);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.put("/api/automations/:id", (req, res) => {
    try {
      const updated = automationEngine.updateAutomation(req.params["id"], req.body);
      if (!updated) {
        res.status(404).json({ error: "Automation not found" });
        return;
      }
      const cfg = getConfig();
      cfg.automations = automationEngine.toConfig();
      saveConfig(cfg);
      reloadConfig();
      res.json(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.delete("/api/automations/:id", (req, res) => {
    try {
      const removed = automationEngine.removeAutomation(req.params["id"]);
      if (!removed) {
        res.status(404).json({ error: "Automation not found" });
        return;
      }
      const cfg = getConfig();
      cfg.automations = automationEngine.toConfig();
      saveConfig(cfg);
      reloadConfig();
      res.status(204).end();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.post("/api/automations/:id/run", async (req, res) => {
    try {
      const report = await automationEngine.runAutomation(req.params["id"]);
      if (!report) {
        res.status(404).json({ error: "Automation not found" });
        return;
      }
      res.json(report);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.get("/api/automation-templates", (_req, res) => {
    res.json(AUTOMATION_TEMPLATES);
  });
  app.get("/api/automation-templates/rich", (_req, res) => {
    res.json(AUTOMATION_TEMPLATES2);
  });
  app.get("/api/automation-suggestions", (req, res) => {
    try {
      const projectPath = req.query["project"];
      if (!projectPath) {
        res.status(400).json({ error: "Missing 'project' query parameter" });
        return;
      }
      const validPath = validateProjectPath(projectPath);
      if (!validPath) {
        res.status(400).json({ error: "Invalid project path" });
        return;
      }
      const profile = analyzeProject(validPath);
      const suggestions = suggestAutomations(profile, validPath);
      res.json({ profile: { name: profile.name, languages: profile.languages, frameworks: profile.frameworks }, suggestions });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.post("/api/automations/from-template", (req, res) => {
    try {
      const { templateId, projectPath, schedule, model } = req.body;
      if (!templateId || !projectPath) {
        res.status(400).json({ error: "Missing templateId or projectPath" });
        return;
      }
      const validPath = validateProjectPath(projectPath);
      if (!validPath) {
        res.status(400).json({ error: "Invalid project path" });
        return;
      }
      const template = getTemplate(templateId);
      if (!template) {
        res.status(404).json({ error: `Template '${templateId}' not found` });
        return;
      }
      const prompt = fillPromptTemplate(template.promptTemplate, { projectPath: validPath });
      const auto = automationEngine.addAutomation({
        name: template.name,
        description: template.description,
        schedule: schedule ?? template.defaultSchedule,
        agent: "none",
        model: model ?? template.defaultModel,
        prompt,
        enabled: true
      });
      const cfg = getConfig();
      cfg.automations = automationEngine.toConfig();
      saveConfig(cfg);
      reloadConfig();
      res.status(201).json(auto);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.post("/api/automations/from-description", async (req, res) => {
    try {
      const { description, projectPath } = req.body;
      if (!description || !projectPath) {
        res.status(400).json({ error: "Missing description or projectPath" });
        return;
      }
      const generationPrompt = `You are an automation configuration generator for a developer tool called Agent Studio.

The user wants to create an automation for their project at: ${projectPath}
Their description: "${description}"

Generate a JSON automation configuration. The automation will run Claude headlessly with the prompt you write.

Output ONLY valid JSON (no markdown fences, no explanation):
{
  "name": "Short name for this automation (2-4 words)",
  "description": "One sentence description",
  "schedule": "every 2h|every 6h|daily|weekly",
  "model": "haiku|sonnet|opus",
  "prompt": "The detailed prompt that Claude will execute. Include specific commands to run, what to check, and the expected output format. Reference the project path: ${projectPath}"
}

Choose the schedule and model based on the task:
- Lightweight checks (lint, type check): haiku, every 2h
- Code review, security: sonnet, every 6h or daily
- Complex analysis, refactoring suggestions: opus, daily or weekly`;
      const { spawn: spawnProc } = await import("node:child_process");
      const output = await new Promise((resolve) => {
        try {
          const proc = spawnProc("claude", ["--print", "--model", "haiku", generationPrompt], {
            cwd: projectPath,
            env: { ...process.env },
            timeout: 6e4
          });
          let stdout = "";
          proc.stdout.on("data", (data) => {
            stdout += data.toString("utf-8");
          });
          proc.on("close", () => resolve(stdout));
          proc.on("error", () => resolve(""));
        } catch {
          resolve("");
        }
      });
      if (!output.trim()) {
        res.status(500).json({ error: "Failed to generate automation \u2014 Claude CLI may not be available" });
        return;
      }
      let config;
      try {
        const cleaned = output.replace(/```json?\n?/g, "").replace(/```\n?/g, "").trim();
        config = JSON.parse(cleaned);
      } catch {
        res.status(500).json({ error: "Failed to parse generated automation config", raw: output });
        return;
      }
      res.json({
        generated: true,
        automation: {
          name: config.name || "Custom Automation",
          description: config.description || description,
          schedule: config.schedule || "daily",
          agent: "none",
          model: config.model === "opus" || config.model === "sonnet" || config.model === "haiku" ? config.model : "sonnet",
          prompt: config.prompt || description,
          enabled: true
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.post("/api/generate-claudemd", (req, res) => {
    try {
      const { projectPath, preserveExisting } = req.body;
      if (!projectPath) {
        res.status(400).json({ error: "Missing projectPath" });
        return;
      }
      const validPath = validateProjectPath(projectPath);
      if (!validPath) {
        res.status(400).json({ error: "Invalid project path" });
        return;
      }
      const profile = analyzeProject(validPath);
      const agentsDir = import_node_path14.default.join(validPath, ".claude", "agents");
      const agents = [];
      if (import_node_fs13.default.existsSync(agentsDir)) {
        try {
          const files = import_node_fs13.default.readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
          for (const file of files) {
            agents.push({
              id: import_node_path14.default.basename(file, ".md"),
              name: import_node_path14.default.basename(file, ".md"),
              description: `Agent from ${profile.name}`,
              model: "sonnet",
              mdContent: ""
            });
          }
        } catch {
        }
      }
      const result = writeClaudeMd({
        analysis: profile,
        agents,
        projectPath: validPath,
        preserveExisting
      });
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.get("/api/reports", (_req, res) => {
    try {
      const reports = automationEngine.getReports();
      res.json(reports);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.get("/api/reports/:id", (req, res) => {
    try {
      const report = automationEngine.getReport(req.params["id"]);
      if (!report) {
        res.status(404).json({ error: "Report not found" });
        return;
      }
      res.json(report);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.post("/api/reports/:id/approve", (req, res) => {
    try {
      const report = automationEngine.approveReport(req.params["id"]);
      if (!report) {
        res.status(404).json({ error: "Report not found" });
        return;
      }
      res.json(report);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.post("/api/reports/:id/dismiss", (req, res) => {
    try {
      const report = automationEngine.dismissReport(req.params["id"]);
      if (!report) {
        res.status(404).json({ error: "Report not found" });
        return;
      }
      res.json(report);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.post("/api/reports/:id/actions/:actionId/approve", (req, res) => {
    try {
      const report = automationEngine.approveAction(req.params["id"], req.params["actionId"]);
      if (!report) {
        res.status(404).json({ error: "Report or action not found" });
        return;
      }
      res.json(report);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.get("/api/setup/validate-agent-system", async (req, res) => {
    try {
      const agentPath = req.query["path"];
      if (!agentPath) {
        res.status(400).json({ error: "Missing 'path' query parameter" });
        return;
      }
      const { existsSync: existsSync13 } = await import("node:fs");
      const { readFile: readFile3 } = await import("node:fs/promises");
      const { join: join12 } = await import("node:path");
      const memoryIndexPath = join12(agentPath, "tools/memory_index.json");
      const currentSprintPath = join12(agentPath, "sprints/current.md");
      const scanLogPath = join12(agentPath, "sprints/scan_log.md");
      const memoryIndexExists = existsSync13(memoryIndexPath);
      let memoryCount = 0;
      if (memoryIndexExists) {
        try {
          const raw = await readFile3(memoryIndexPath, "utf-8");
          const data = JSON.parse(raw);
          memoryCount = data.total_entries ?? 0;
        } catch {
        }
      }
      res.json({
        memoryIndex: memoryIndexExists,
        currentSprint: existsSync13(currentSprintPath),
        scanLog: existsSync13(scanLogPath),
        memoryCount
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.post("/api/scaffold/preview", (req, res) => {
    try {
      const options = req.body;
      if (!options?.projectPath || !Array.isArray(options.agents)) {
        res.status(400).json({ error: "Missing projectPath or agents array" });
        return;
      }
      const tree = previewScaffold(options);
      res.json({ tree });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.post("/api/scaffold", (req, res) => {
    try {
      const options = req.body;
      if (!options?.projectPath || !Array.isArray(options.agents)) {
        res.status(400).json({ error: "Missing projectPath or agents array" });
        return;
      }
      const result = scaffoldAgentSystem(options);
      if (result.alreadyExists) {
        res.status(409).json({ error: "Agent system already exists at this path", result });
        return;
      }
      res.status(201).json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.get("/api/agents/cli-status", (_req, res) => {
    try {
      res.json({ available: isClaudeCliAvailable() });
    } catch {
      res.json({ available: false });
    }
  });
  const handleAnalyze = (req, res) => {
    try {
      const { projectPath } = req.body;
      if (!projectPath) {
        res.status(400).json({ error: "Missing projectPath" });
        return;
      }
      const validPath = validateProjectPath(projectPath);
      if (!validPath) {
        res.status(400).json({ error: "Invalid project path" });
        return;
      }
      const profile = analyzeProject(validPath);
      res.json(profile);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  };
  app.post("/api/agents/analyze", handleAnalyze);
  app.post("/api/analyze-project", handleAnalyze);
  app.post("/api/agents/generate", async (req, res) => {
    try {
      const { analysis, projectPath, userDescription, teamSize } = req.body;
      if (!analysis || !projectPath) {
        res.status(400).json({ error: "Missing analysis or projectPath" });
        return;
      }
      const result = await generateAgentsWithClaudeMd(
        analysis,
        projectPath,
        userDescription,
        teamSize
      );
      res.json({ agents: result.agents, claudeMd: result.claudeMd });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  const handlePreview = async (req, res) => {
    try {
      const { projectPath, userDescription, teamSize } = req.body;
      if (!projectPath) {
        res.status(400).json({ error: "Missing projectPath" });
        return;
      }
      const validPath = validateProjectPath(projectPath);
      if (!validPath) {
        res.status(400).json({ error: "Invalid project path" });
        return;
      }
      const profile = analyzeProject(validPath);
      const result = await previewAgents(profile, userDescription, teamSize);
      res.json({ agents: result.agents, claudeMd: result.claudeMd, profile });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  };
  app.post("/api/agents/preview", handlePreview);
  app.post("/api/generate-agents/preview", handlePreview);
  app.get("/api/agents/generate/status", (_req, res) => {
    res.json(getGenerationStatus());
  });
  app.post("/api/agents/apply", (req, res) => {
    try {
      const { agents, projectPath, claudeMd } = req.body;
      if (!agents || !projectPath || !Array.isArray(agents)) {
        res.status(400).json({ error: "Missing agents array or projectPath" });
        return;
      }
      const result = writeAgentFiles(
        agents.map((a) => ({
          ...a,
          model: a.model === "opus" || a.model === "sonnet" || a.model === "haiku" ? a.model : "sonnet"
        })),
        projectPath,
        claudeMd
      );
      res.status(201).json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.post("/api/sessions", (req, res) => {
    try {
      const {
        name,
        command,
        args,
        cwd,
        cols,
        rows,
        meta
      } = req.body;
      if (!name || typeof name !== "string") {
        res.status(400).json({ error: "Missing required field: name" });
        return;
      }
      const session = terminalManager.createSession({
        name,
        command: command ?? "claude",
        args: args ?? ["--dangerously-skip-permissions"],
        cwd,
        cols,
        rows,
        meta
      });
      res.status(201).json(session);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.delete("/api/sessions/:id", (req, res) => {
    try {
      terminalManager.killSession(req.params["id"]);
      res.status(204).end();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(404).json({ error: message });
    }
  });
  app.get("/api/sessions", (_req, res) => {
    res.json(terminalManager.listSessions());
  });
  app.get("/api/sessions/:id/buffer", (req, res) => {
    const buffer = terminalManager.getSessionBuffer(req.params["id"]);
    if (buffer === null) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json({ buffer });
  });
  app.get("/api/processes", (_req, res) => {
    try {
      const processes = discoverClaudeProcesses();
      res.json(processes);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.get("/api/usage", (_req, res) => {
    try {
      const usage = getAllSessionUsage();
      res.json(usage);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.get("/api/usage/:pid", (req, res) => {
    try {
      const pid = parseInt(req.params["pid"], 10);
      if (isNaN(pid)) {
        res.status(400).json({ error: "Invalid PID" });
        return;
      }
      const usage = getSessionUsage(pid);
      if (!usage) {
        res.status(404).json({ error: "No usage data for PID" });
        return;
      }
      res.json(usage);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.get("/api/sessions/:id/usage", (req, res) => {
    try {
      const sessionId = req.params["id"];
      const sessions = terminalManager.listSessions();
      const session = sessions.find((s) => s.id === sessionId);
      if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
      }
      let usage = getSessionUsage(session.pid);
      if (!usage) {
        const claudeSessionId = findSessionIdForPtyPid(session.pid);
        if (claudeSessionId) {
          usage = getUsageBySessionId(claudeSessionId);
        }
      }
      if (!usage) {
        res.json({
          cost: null,
          tokens: null,
          model: null,
          modelShort: null
        });
        return;
      }
      res.json({
        cost: formatCost(usage.totalCost),
        tokens: formatTokens(usage.totalTokens),
        model: usage.model,
        modelShort: usage.modelShort,
        totalCost: usage.totalCost,
        totalTokens: usage.totalTokens,
        totalInputTokens: usage.totalInputTokens,
        totalOutputTokens: usage.totalOutputTokens,
        cacheCreationTokens: usage.cacheCreationTokens,
        cacheReadTokens: usage.cacheReadTokens,
        messageCount: usage.messageCount,
        contextUsed: usage.contextUsed,
        contextTotal: usage.contextTotal,
        contextPercent: usage.contextPercent
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  setInterval(() => {
    try {
      const usage = getAllSessionUsage();
      const sessions = terminalManager.listSessions();
      const managedUsage = {};
      for (const session of sessions) {
        let su = getSessionUsage(session.pid);
        if (!su) {
          const claudeSessionId = findSessionIdForPtyPid(session.pid);
          if (claudeSessionId) {
            su = getUsageBySessionId(claudeSessionId);
          }
        }
        if (su) {
          managedUsage[session.id] = {
            cost: formatCost(su.totalCost),
            tokens: formatTokens(su.totalTokens),
            modelShort: su.modelShort,
            totalCost: su.totalCost,
            totalTokens: su.totalTokens,
            contextUsed: su.contextUsed,
            contextTotal: su.contextTotal,
            contextPercent: su.contextPercent
          };
        }
      }
      const msg = {
        type: "usage-update",
        payload: { all: usage, managed: managedUsage }
      };
      for (const client of wss.clients) {
        if (client.readyState === import_ws.WebSocket.OPEN) {
          client.send(JSON.stringify(msg));
        }
      }
    } catch {
    }
  }, 3e4);
  const fileWatcher = new FileWatcher();
  fileWatcher.onUpdate((update) => {
    const msg = {
      type: "file-update",
      data: JSON.stringify({ file: update.file, content: update.content })
    };
    for (const client of wss.clients) {
      if (client.readyState === import_ws.WebSocket.OPEN) {
        client.send(JSON.stringify(msg));
      }
    }
  });
  fileWatcher.start();
  app.get("/api/sprint/current", async (_req, res) => {
    try {
      const content = await readCurrentSprint();
      res.json({ content });
    } catch {
      res.json({ content: null });
    }
  });
  app.get("/api/sprint/queue", async (_req, res) => {
    try {
      const content = await readReadyQueue();
      res.json({ content });
    } catch {
      res.json({ content: null });
    }
  });
  app.get("/api/sprint/scans", async (_req, res) => {
    try {
      const entries = await readScanLog();
      res.json(entries);
    } catch {
      res.json([]);
    }
  });
  app.get("/api/sprint/history", async (_req, res) => {
    try {
      const history = await readSprintHistory();
      res.json(history);
    } catch {
      res.json([]);
    }
  });
  app.get("/api/sprint/handoffs", async (_req, res) => {
    try {
      const handoffs = await readHandoffs();
      res.json(handoffs);
    } catch {
      res.json([]);
    }
  });
  app.get("/api/memory/stats", async (_req, res) => {
    try {
      const stats = await readMemoryStats();
      res.json(stats);
    } catch {
      res.json({ total: 0, categories: {} });
    }
  });
  gitWatcher.onUpdate((repos) => {
    const msg = {
      type: "git-update",
      payload: repos
    };
    for (const client of wss.clients) {
      if (client.readyState === import_ws.WebSocket.OPEN) {
        client.send(JSON.stringify(msg));
      }
    }
  });
  gitWatcher.start(1e4);
  app.get("/api/git/status", (_req, res) => {
    try {
      const statuses = gitWatcher.getStatus();
      res.json(statuses);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.get("/api/git/branches", (req, res) => {
    try {
      const repoPath = req.query["repo"];
      if (!repoPath) {
        res.status(400).json({ error: "Missing 'repo' query parameter" });
        return;
      }
      const branches = getRepoBranches(repoPath);
      res.json(branches);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.post("/api/git/pr", async (req, res) => {
    try {
      const { repo, sourceBranch, targetBranch, title, description } = req.body;
      if (!repo || !sourceBranch || !targetBranch || !title) {
        res.status(400).json({
          error: "Missing required fields: repo, sourceBranch, targetBranch, title"
        });
        return;
      }
      const result = await createPR({
        repo,
        sourceBranch,
        targetBranch,
        title,
        description: description ?? ""
      });
      res.status(201).json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.get("/api/git/changes", (req, res) => {
    try {
      const repoPath = req.query["repo"];
      if (!repoPath) {
        res.status(400).json({ error: "Missing 'repo' query parameter" });
        return;
      }
      const output = (0, import_node_child_process9.execSync)("git status --porcelain", {
        cwd: repoPath,
        encoding: "utf-8",
        timeout: 5e3
      }).trim();
      res.json({ changes: output || "(no changes)" });
    } catch {
      res.json({ changes: "(unavailable)" });
    }
  });
  app.get("/api/git/diff", (req, res) => {
    try {
      const repoPath = req.query["repo"];
      if (!repoPath) {
        res.status(400).json({ error: "Missing 'repo' query parameter" });
        return;
      }
      const staged = (0, import_node_child_process9.execSync)("git diff --cached --stat", {
        cwd: repoPath,
        encoding: "utf-8",
        timeout: 5e3
      }).trim();
      const unstaged = (0, import_node_child_process9.execSync)("git diff --stat", {
        cwd: repoPath,
        encoding: "utf-8",
        timeout: 5e3
      }).trim();
      res.json({ staged: staged || "(none)", unstaged: unstaged || "(none)" });
    } catch {
      res.json({ staged: "(unavailable)", unstaged: "(unavailable)" });
    }
  });
  app.post("/api/git/commit", (req, res) => {
    try {
      const { repo, message: commitMsg } = req.body;
      if (!repo || !commitMsg) {
        res.status(400).json({ error: "Missing 'repo' or 'message'" });
        return;
      }
      const statuses = gitWatcher.getStatus();
      const repoInfo = statuses.find((r) => r.path === repo);
      if (repoInfo?.isProd) {
        res.status(403).json({
          error: "BLOCKED: Cannot commit directly to production repo. Changes require explicit confirmation."
        });
        return;
      }
      (0, import_node_child_process9.execSync)("git add -u", {
        cwd: repo,
        encoding: "utf-8",
        timeout: 1e4
      });
      const output = (0, import_node_child_process9.execSync)(
        `git commit -m ${JSON.stringify(commitMsg)}`,
        {
          cwd: repo,
          encoding: "utf-8",
          timeout: 1e4
        }
      ).trim();
      res.json({ ok: true, output });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.post("/api/git/push", (req, res) => {
    try {
      const { repo, confirmed } = req.body;
      if (!repo) {
        res.status(400).json({ error: "Missing 'repo'" });
        return;
      }
      const statuses = gitWatcher.getStatus();
      const repoInfo = statuses.find((r) => r.path === repo);
      if (repoInfo?.isProd && !confirmed) {
        res.status(403).json({
          error: "BLOCKED: Pushing to production repo requires explicit confirmation. Set confirmed=true after typing CONFIRM.",
          requiresConfirmation: true
        });
        return;
      }
      const output = (0, import_node_child_process9.execSync)("git push", {
        cwd: repo,
        encoding: "utf-8",
        timeout: 3e4
      }).trim();
      res.json({ ok: true, output });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.post("/api/git/open", (req, res) => {
    try {
      const { repo, app: appChoice } = req.body;
      if (!repo || typeof repo !== "string") {
        res.status(400).json({ error: "Missing repo path" });
        return;
      }
      if (!import_node_fs13.default.existsSync(repo) || !import_node_fs13.default.statSync(repo).isDirectory()) {
        res.status(400).json({ error: "Invalid directory path" });
        return;
      }
      if (appChoice === "terminal") {
        openTerminal(repo, (err) => {
          if (err) res.status(500).json({ error: "Failed to open terminal" });
          else res.json({ ok: true });
        });
      } else if (appChoice === "finder") {
        openInOS(repo, void 0, (err) => {
          if (err) res.status(500).json({ error: "Failed to open file manager" });
          else res.json({ ok: true });
        });
      } else if (appChoice === "code") {
        openVSCode(repo, (err) => {
          if (err) res.status(500).json({ error: "Failed to open VS Code" });
          else res.json({ ok: true });
        });
      } else {
        openInOS(repo, void 0, (err) => {
          if (err) res.status(500).json({ error: "Failed to open" });
          else res.json({ ok: true });
        });
      }
    } catch {
      res.status(500).json({ error: "Failed to open" });
    }
  });
  const workflowManager = new WorkflowManager();
  app.get("/api/workflows", async (_req, res) => {
    try {
      const flows = await workflowManager.getFlows();
      res.json(flows);
    } catch {
      res.json([]);
    }
  });
  app.get("/api/workflows/:flowId/runs/:runId", async (req, res) => {
    try {
      const run = await workflowManager.getRun(
        req.params["flowId"],
        req.params["runId"]
      );
      if (!run) {
        res.status(404).json({ error: "Run not found" });
        return;
      }
      res.json(run);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.post("/api/workflows", async (req, res) => {
    try {
      const body = req.body;
      if (!body.name || !Array.isArray(body.steps) || body.steps.length === 0) {
        res.status(400).json({ error: "Missing name or steps" });
        return;
      }
      const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const newWorkflow = {
        id,
        name: body.name,
        description: body.description,
        icon: body.icon ?? "Workflow",
        steps: body.steps.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          agents: s.agents ?? []
        }))
      };
      const cfg = getConfig();
      const workflows = cfg.workflows ?? [];
      workflows.push(newWorkflow);
      cfg.workflows = workflows;
      saveConfig(cfg);
      reloadConfig();
      workflowManager.reload();
      const flows = await workflowManager.getFlows();
      const msg = { type: "workflow-update", payload: flows };
      for (const client of wss.clients) {
        if (client.readyState === import_ws.WebSocket.OPEN) {
          client.send(JSON.stringify(msg));
        }
      }
      res.json({ ok: true, id, workflow: newWorkflow });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.put("/api/workflows/:id", async (req, res) => {
    try {
      const workflowId = req.params["id"];
      const body = req.body;
      const cfg = getConfig();
      const workflows = cfg.workflows ?? [];
      const idx = workflows.findIndex((w) => w.id === workflowId);
      if (idx < 0) {
        res.status(404).json({ error: "Workflow not found" });
        return;
      }
      if (body.name !== void 0) workflows[idx].name = body.name;
      if (body.description !== void 0) workflows[idx].description = body.description;
      if (body.icon !== void 0) workflows[idx].icon = body.icon;
      if (body.steps !== void 0) {
        workflows[idx].steps = body.steps.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          agents: s.agents ?? []
        }));
      }
      cfg.workflows = workflows;
      saveConfig(cfg);
      reloadConfig();
      workflowManager.reload();
      const flows = await workflowManager.getFlows();
      const msg = { type: "workflow-update", payload: flows };
      for (const client of wss.clients) {
        if (client.readyState === import_ws.WebSocket.OPEN) {
          client.send(JSON.stringify(msg));
        }
      }
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.delete("/api/workflows/:id", async (req, res) => {
    try {
      const workflowId = req.params["id"];
      const cfg = getConfig();
      const workflows = cfg.workflows ?? [];
      const idx = workflows.findIndex((w) => w.id === workflowId);
      if (idx < 0) {
        res.status(404).json({ error: "Workflow not found" });
        return;
      }
      workflows.splice(idx, 1);
      cfg.workflows = workflows;
      saveConfig(cfg);
      reloadConfig();
      workflowManager.reload();
      const flows = await workflowManager.getFlows();
      const msg = { type: "workflow-update", payload: flows };
      for (const client of wss.clients) {
        if (client.readyState === import_ws.WebSocket.OPEN) {
          client.send(JSON.stringify(msg));
        }
      }
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.post("/api/workflows/:id/run", async (req, res) => {
    try {
      const workflowId = req.params["id"];
      const flow = await workflowManager.getFlow(workflowId);
      if (!flow) {
        res.status(404).json({ error: "Workflow not found" });
        return;
      }
      const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const run = {
        id: runId,
        flowId: workflowId,
        name: `${flow.name} Run`,
        status: "waiting",
        startedAt: (/* @__PURE__ */ new Date()).toISOString(),
        steps: flow.runs[0]?.steps.map((s) => ({
          ...s,
          status: "pending",
          startedAt: void 0,
          completedAt: void 0
        })) ?? [],
        stats: {
          agentsUsed: flow.runs[0]?.stats.agentsUsed ?? []
        }
      };
      flow.runs.unshift(run);
      const flows = await workflowManager.getFlows();
      const targetFlow = flows.find((f) => f.id === workflowId);
      if (targetFlow && !targetFlow.runs.find((r) => r.id === runId)) {
        targetFlow.runs.unshift(run);
      }
      const msg = { type: "workflow-update", payload: flows };
      for (const client of wss.clients) {
        if (client.readyState === import_ws.WebSocket.OPEN) {
          client.send(JSON.stringify(msg));
        }
      }
      res.json({ ok: true, runId, run });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  fileWatcher.onUpdate(() => {
    void workflowManager.getFlows().then((flows) => {
      const msg = {
        type: "workflow-update",
        payload: flows
      };
      for (const client of wss.clients) {
        if (client.readyState === import_ws.WebSocket.OPEN) {
          client.send(JSON.stringify(msg));
        }
      }
    });
  });
  const PMO_PLIST = `${import_node_os4.default.homedir()}/Library/LaunchAgents/com.agent-studio.pmo-scan.plist`;
  const PMO_SCAN_SCRIPT = getAgentSystemPath("tools/pmo-scan.sh") ?? "";
  app.get("/api/pmo/status", (_req, res) => {
    try {
      const isLoaded = isSchedulerLoaded("agent-studio");
      let lastScan = null;
      let lastStatus = null;
      try {
        const scanEntries = readScanLog();
        res.json({ loaded: isLoaded, lastScan: null, lastStatus: null, checking: true });
        return;
      } catch {
      }
      res.json({ loaded: isLoaded, lastScan, lastStatus });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.get("/api/pmo/status-full", async (_req, res) => {
    try {
      const isLoaded = isSchedulerLoaded("agent-studio");
      const scanEntries = await readScanLog();
      const lastEntry = scanEntries.length > 0 ? scanEntries[scanEntries.length - 1] : null;
      let nextScanIn = null;
      if (isLoaded && lastEntry) {
        const lastTime = new Date(lastEntry.timestamp).getTime();
        const nextTime = lastTime + 2 * 60 * 60 * 1e3;
        const remainMs = nextTime - Date.now();
        if (remainMs > 0) {
          const mins = Math.floor(remainMs / 6e4);
          const hrs = Math.floor(mins / 60);
          nextScanIn = hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`;
        } else {
          nextScanIn = "overdue";
        }
      }
      res.json({
        loaded: isLoaded,
        lastScan: lastEntry?.timestamp ?? null,
        lastStatus: lastEntry?.status ?? null,
        lastDetail: lastEntry?.detail ?? null,
        nextScanIn
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.post("/api/pmo/start", (_req, res) => {
    try {
      if (!IS_MAC) {
        res.status(501).json({ error: "PMO scheduler is only supported on macOS (launchd)" });
        return;
      }
      loadScheduler(PMO_PLIST);
      res.json({ ok: true, status: "started" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.post("/api/pmo/stop", (_req, res) => {
    try {
      if (!IS_MAC) {
        res.status(501).json({ error: "PMO scheduler is only supported on macOS (launchd)" });
        return;
      }
      unloadScheduler(PMO_PLIST);
      res.json({ ok: true, status: "stopped" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.post("/api/pmo/scan", (_req, res) => {
    try {
      (0, import_node_child_process9.exec)(`bash "${PMO_SCAN_SCRIPT}"`, { timeout: 12e4 }, () => {
      });
      res.json({ ok: true, status: "scan-started" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.post("/api/processes/:pid/kill", (req, res) => {
    try {
      const pid = parseInt(req.params["pid"], 10);
      if (isNaN(pid) || pid <= 0) {
        res.status(400).json({ error: "Invalid PID" });
        return;
      }
      if (pid === 1 || pid === process.pid) {
        res.status(403).json({ error: "Cannot kill this process" });
        return;
      }
      const killed = killProcess(pid);
      if (!killed) {
        res.status(500).json({ error: "Failed to kill process" });
        return;
      }
      res.json({ ok: true, pid });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.get("/api/servers", (_req, res) => {
    try {
      const servers = getDevServers();
      res.json(servers);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.post("/api/servers/start", async (req, res) => {
    try {
      const { cwd, command } = req.body;
      if (!cwd) {
        res.status(400).json({ error: "Missing 'cwd'" });
        return;
      }
      const result = await startDevServer(cwd, command ?? "npm run dev");
      res.status(201).json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.post("/api/servers/:pid/stop", (req, res) => {
    try {
      const pid = parseInt(req.params["pid"], 10);
      if (isNaN(pid) || pid <= 0) {
        res.status(400).json({ error: "Invalid PID" });
        return;
      }
      if (pid === process.pid) {
        res.status(403).json({ error: "Cannot stop the agent-studio server" });
        return;
      }
      const ok = stopDevServer(pid);
      res.json({ ok, pid });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.post("/api/servers/custom", (req, res) => {
    try {
      const { name, cwd, command } = req.body;
      if (!name || !cwd) {
        res.status(400).json({ error: "Missing 'name' or 'cwd'" });
        return;
      }
      addCustomServer({ name, cwd, command: command ?? "npm run dev" });
      res.status(201).json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.delete("/api/servers/custom/:name", (req, res) => {
    try {
      const name = req.params["name"];
      if (!name) {
        res.status(400).json({ error: "Missing server name" });
        return;
      }
      const removed = removeCustomServer(name);
      res.json({ ok: removed });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.get("/api/sessions/history", async (_req, res) => {
    try {
      const { readdirSync: readdirSync6, statSync: statSync2, readFileSync: readFileSync9 } = await import("node:fs");
      const { join: join12 } = await import("node:path");
      const home = import_node_os4.default.homedir();
      const projectsDir = join12(home, ".claude", "projects");
      const sessions = [];
      try {
        const projectDirs = readdirSync6(projectsDir);
        for (const projDir of projectDirs) {
          const projPath = join12(projectsDir, projDir);
          try {
            const stat2 = statSync2(projPath);
            if (!stat2.isDirectory()) continue;
          } catch {
            continue;
          }
          try {
            const files = readdirSync6(projPath);
            for (const file of files) {
              if (!file.endsWith(".jsonl")) continue;
              const filePath = join12(projPath, file);
              try {
                const fileStat = statSync2(filePath);
                const projectName = projDir.replace(/-/g, "/").replace(/^\/+/, "");
                sessions.push({
                  id: file.replace(".jsonl", ""),
                  project: projectName,
                  projectPath: projPath,
                  modified: fileStat.mtimeMs,
                  file: filePath
                });
              } catch {
                continue;
              }
            }
          } catch {
            continue;
          }
        }
      } catch {
      }
      sessions.sort((a, b) => b.modified - a.modified);
      const result = sessions.slice(0, 20).map((s) => {
        let preview = "";
        let agent = "";
        try {
          const fd = require("node:fs").openSync(s.file, "r");
          const buf = Buffer.alloc(32768);
          const bytesRead = require("node:fs").readSync(fd, buf, 0, 32768, 0);
          require("node:fs").closeSync(fd);
          const chunk = buf.toString("utf8", 0, bytesRead);
          const lines = chunk.split("\n").filter(Boolean);
          for (const line of lines.slice(0, 30)) {
            try {
              const entry = JSON.parse(line);
              if (entry.type === "agent-setting" && entry.agentSetting && !agent) {
                agent = entry.agentSetting;
              }
              if (entry.type === "user" && !preview) {
                const msg = entry.message;
                let text = "";
                if (typeof msg === "string") {
                  text = msg;
                } else if (msg && typeof msg.content === "string") {
                  text = msg.content;
                } else if (msg && Array.isArray(msg.content)) {
                  text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join(" ");
                }
                if (text && !text.startsWith("<") && text.length > 5) {
                  preview = text.slice(0, 80).replace(/\n/g, " ").trim();
                }
              }
              if (entry.type === "last-prompt" && !preview && entry.lastPrompt) {
                const lp = entry.lastPrompt;
                if (!lp.startsWith("<") && lp.length > 5) {
                  preview = lp.slice(0, 80).replace(/\n/g, " ").trim();
                }
              }
            } catch {
            }
          }
        } catch {
        }
        const projectShort = s.project.split("/").pop() ?? s.project;
        return {
          id: s.id,
          project: s.project,
          projectShort,
          modified: s.modified,
          date: new Date(s.modified).toISOString(),
          agent,
          preview
        };
      });
      res.json(result);
    } catch {
      res.json([]);
    }
  });
  const MEMORY_INDEX_PATH = getAgentSystemPath("tools/memory_index.json") ?? "";
  const MEMORY_BASE_PATH = getMainProjectDir();
  app.get("/api/memory/entries", async (_req, res) => {
    try {
      if (!MEMORY_INDEX_PATH) {
        res.json({ entries: [], total: 0 });
        return;
      }
      const { readFile: readFile3 } = await import("node:fs/promises");
      const raw = await readFile3(MEMORY_INDEX_PATH, "utf-8");
      const index = JSON.parse(raw);
      res.json({ entries: index.entries ?? [], total: index.total_entries ?? 0 });
    } catch {
      res.json({ entries: [], total: 0 });
    }
  });
  app.get("/api/memory/entry", async (req, res) => {
    try {
      const filePath = req.query["file"];
      if (!filePath) {
        res.status(400).json({ error: "Missing 'file' query parameter" });
        return;
      }
      if (!MEMORY_BASE_PATH) {
        res.status(404).json({ error: "No agent system configured" });
        return;
      }
      const { readFile: readFile3 } = await import("node:fs/promises");
      const fullPath = `${MEMORY_BASE_PATH}/${filePath}`;
      const raw = await readFile3(fullPath, "utf-8");
      const data = JSON.parse(raw);
      res.json(data);
    } catch {
      res.status(404).json({ error: "Memory entry not found" });
    }
  });
  app.post("/api/memory/entries", async (req, res) => {
    try {
      if (!MEMORY_INDEX_PATH || !MEMORY_BASE_PATH) {
        res.status(400).json({ error: "No agent system configured" });
        return;
      }
      const { readFile: readFile3, writeFile, mkdir } = await import("node:fs/promises");
      const { join: join12 } = await import("node:path");
      const body = req.body;
      if (!body.title || !body.category) {
        res.status(400).json({ error: "Missing title or category" });
        return;
      }
      const now = /* @__PURE__ */ new Date();
      const pad = (n, len = 2) => String(n).padStart(len, "0");
      const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const categoryMap = {
        learning: "learnings",
        learnings: "learnings",
        correction: "corrections",
        corrections: "corrections",
        decision: "decisions",
        decisions: "decisions",
        knowledge: "knowledge",
        "human-input": "human-inputs",
        "human-inputs": "human-inputs"
      };
      const folder = categoryMap[body.category] ?? "learnings";
      const memoryDir = join12(MEMORY_BASE_PATH, "ai-agents", "memory", folder);
      await mkdir(memoryDir, { recursive: true });
      const filename = `${dateStr}_dashboard_${body.category.replace(/-/g, "_")}.json`;
      const filePath = join12(memoryDir, filename);
      const relPath = `ai-agents/memory/${folder}/${filename}`;
      const entry = {
        agent_type: "dashboard",
        memory_type: body.category,
        title: body.title,
        content: body.content ?? {},
        tags: body.tags ?? [],
        created_by: "dashboard",
        created_at: now.toISOString(),
        pinned: body.pinned ?? false
      };
      await writeFile(filePath, JSON.stringify(entry, null, 2), "utf-8");
      try {
        const rawIndex = await readFile3(MEMORY_INDEX_PATH, "utf-8");
        const index = JSON.parse(rawIndex);
        const newIndexEntry = {
          file: relPath,
          title: body.title,
          key_point: body.content?.lesson ?? body.content?.observation ?? body.title,
          tags: body.tags ?? [],
          category: folder,
          agent_type: "dashboard",
          pinned: body.pinned ?? false
        };
        index.entries.push(newIndexEntry);
        index.total_entries = index.entries.length;
        await writeFile(MEMORY_INDEX_PATH, JSON.stringify(index, null, 2), "utf-8");
      } catch {
      }
      res.json({ ok: true, file: relPath });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.put("/api/memory/entries/:id", async (req, res) => {
    try {
      if (!MEMORY_INDEX_PATH || !MEMORY_BASE_PATH) {
        res.status(400).json({ error: "No agent system configured" });
        return;
      }
      const { readFile: readFile3, writeFile } = await import("node:fs/promises");
      const filePath = decodeURIComponent(req.params["id"] ?? "");
      if (!filePath) {
        res.status(400).json({ error: "Missing entry id (file path)" });
        return;
      }
      const fullPath = `${MEMORY_BASE_PATH}/${filePath}`;
      const raw = await readFile3(fullPath, "utf-8");
      const existing = JSON.parse(raw);
      const body = req.body;
      if (body.title !== void 0) existing["title"] = body.title;
      if (body.content !== void 0) existing["content"] = body.content;
      if (body.tags !== void 0) existing["tags"] = body.tags;
      if (body.pinned !== void 0) existing["pinned"] = body.pinned;
      await writeFile(fullPath, JSON.stringify(existing, null, 2), "utf-8");
      try {
        const rawIndex = await readFile3(MEMORY_INDEX_PATH, "utf-8");
        const index = JSON.parse(rawIndex);
        const idx = index.entries.findIndex((e) => e["file"] === filePath);
        if (idx >= 0) {
          if (body.title !== void 0) index.entries[idx]["title"] = body.title;
          if (body.tags !== void 0) index.entries[idx]["tags"] = body.tags;
          if (body.pinned !== void 0) index.entries[idx]["pinned"] = body.pinned;
          if (body.content?.lesson) index.entries[idx]["key_point"] = body.content.lesson;
          else if (body.content?.observation) index.entries[idx]["key_point"] = body.content.observation;
          await writeFile(MEMORY_INDEX_PATH, JSON.stringify(index, null, 2), "utf-8");
        }
      } catch {
      }
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.delete("/api/memory/entries/:id", async (req, res) => {
    try {
      if (!MEMORY_INDEX_PATH || !MEMORY_BASE_PATH) {
        res.status(400).json({ error: "No agent system configured" });
        return;
      }
      const { readFile: readFile3, writeFile, unlink } = await import("node:fs/promises");
      const filePath = decodeURIComponent(req.params["id"] ?? "");
      if (!filePath) {
        res.status(400).json({ error: "Missing entry id (file path)" });
        return;
      }
      const fullPath = `${MEMORY_BASE_PATH}/${filePath}`;
      try {
        await unlink(fullPath);
      } catch {
      }
      try {
        const rawIndex = await readFile3(MEMORY_INDEX_PATH, "utf-8");
        const index = JSON.parse(rawIndex);
        index.entries = index.entries.filter((e) => e["file"] !== filePath);
        index.total_entries = index.entries.length;
        await writeFile(MEMORY_INDEX_PATH, JSON.stringify(index, null, 2), "utf-8");
      } catch {
      }
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.post("/api/memory/entries/:id/pin", async (req, res) => {
    try {
      if (!MEMORY_INDEX_PATH || !MEMORY_BASE_PATH) {
        res.status(400).json({ error: "No agent system configured" });
        return;
      }
      const { readFile: readFile3, writeFile } = await import("node:fs/promises");
      const filePath = decodeURIComponent(req.params["id"] ?? "");
      if (!filePath) {
        res.status(400).json({ error: "Missing entry id (file path)" });
        return;
      }
      const fullPath = `${MEMORY_BASE_PATH}/${filePath}`;
      const raw = await readFile3(fullPath, "utf-8");
      const existing = JSON.parse(raw);
      const wasPinned = existing["pinned"] === true;
      existing["pinned"] = !wasPinned;
      await writeFile(fullPath, JSON.stringify(existing, null, 2), "utf-8");
      try {
        const rawIndex = await readFile3(MEMORY_INDEX_PATH, "utf-8");
        const index = JSON.parse(rawIndex);
        const idx = index.entries.findIndex((e) => e["file"] === filePath);
        if (idx >= 0) {
          index.entries[idx]["pinned"] = !wasPinned;
          await writeFile(MEMORY_INDEX_PATH, JSON.stringify(index, null, 2), "utf-8");
        }
      } catch {
      }
      res.json({ ok: true, pinned: !wasPinned });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.get("/api/system/stats", (_req, res) => {
    try {
      const cpus = import_node_os4.default.cpus();
      let totalIdle = 0;
      let totalTick = 0;
      for (const cpu of cpus) {
        totalIdle += cpu.times.idle;
        totalTick += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
      }
      const cpuUsage = totalTick > 0 ? (1 - totalIdle / totalTick) * 100 : 0;
      const totalMem = import_node_os4.default.totalmem();
      const freeMem = import_node_os4.default.freemem();
      const usedMem = totalMem - freeMem;
      let diskUsed = 0;
      let diskTotal = 0;
      let diskPercentage = 0;
      const diskInfo = getDiskUsage();
      if (diskInfo) {
        diskUsed = diskInfo.used;
        diskTotal = diskInfo.total;
        diskPercentage = diskInfo.percentage;
      }
      let activeServers = 0;
      try {
        const servers = getDevServers();
        activeServers = servers.filter((s) => s.running).length;
      } catch {
      }
      const activeSessions = terminalManager.listSessions().length;
      res.json({
        cpu: { usage: Math.round(cpuUsage * 10) / 10, cores: cpus.length },
        memory: {
          used: Math.round(usedMem / (1024 * 1024 * 1024) * 100) / 100,
          total: Math.round(totalMem / (1024 * 1024 * 1024) * 100) / 100,
          percentage: Math.round(usedMem / totalMem * 1e3) / 10
        },
        disk: {
          used: Math.round(diskUsed * 100) / 100,
          total: Math.round(diskTotal * 100) / 100,
          percentage: Math.round(diskPercentage * 10) / 10
        },
        activeServers,
        activeSessions,
        uptime: Math.round(process.uptime()),
        wsConnections: wss.clients.size
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  const SETTINGS_PATH2 = `${process.cwd()}/.settings.json`;
  app.get("/api/settings", async (_req, res) => {
    try {
      const { readFile: readFile3 } = await import("node:fs/promises");
      const raw = await readFile3(SETTINGS_PATH2, "utf-8");
      res.json(JSON.parse(raw));
    } catch {
      const cfg = getConfig();
      res.json({
        defaultModel: cfg.defaults.model,
        defaultPermissions: cfg.defaults.permissions,
        defaultCwd: cfg.defaults.workingDirectory
      });
    }
  });
  app.post("/api/settings", async (req, res) => {
    try {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(SETTINGS_PATH2, JSON.stringify(req.body, null, 2), "utf-8");
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.get("/api/system/preflight", (_req, res) => {
    try {
      const checks = {
        claudeCode: { installed: false },
        node: { installed: true, version: process.version },
        git: { installed: false }
      };
      const blockers = [];
      try {
        const claudePath = whichCommand("claude");
        if (!claudePath) throw new Error("not found");
        checks.claudeCode.installed = true;
        checks.claudeCode.path = claudePath;
        try {
          const versionOutput = (0, import_node_child_process9.execSync)("claude --version", { encoding: "utf-8", timeout: 5e3 }).trim();
          checks.claudeCode.version = versionOutput;
        } catch {
        }
        const { join: joinPre } = require("node:path");
        const claudeDir = joinPre(import_node_os4.default.homedir(), ".claude");
        const { existsSync: fsExistsPre } = require("node:fs");
        checks.claudeCode.authenticated = fsExistsPre(claudeDir);
        if (!checks.claudeCode.authenticated) {
          blockers.push("Claude Code is not authenticated. Run `claude` in your terminal and complete setup first.");
        }
      } catch {
        checks.claudeCode.installed = false;
        blockers.push("Claude Code CLI is not installed.");
      }
      try {
        const gitVersion = (0, import_node_child_process9.execSync)("git --version", { encoding: "utf-8", timeout: 5e3 }).trim();
        checks.git.installed = true;
        checks.git.version = gitVersion.replace("git version ", "");
      } catch {
        checks.git.installed = false;
        blockers.push("Git is not installed.");
      }
      res.json({ ready: blockers.length === 0, checks, blockers });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.post("/api/system/install-claude", async (_req, res) => {
    try {
      const npmPath = whichCommand("npm");
      if (!npmPath) {
        res.status(400).json({ error: "npm is not installed. Install Node.js first." });
        return;
      }
      const result = (0, import_node_child_process9.execSync)("npm install -g @anthropic-ai/claude-code 2>&1", {
        encoding: "utf-8",
        timeout: 12e4
      });
      try {
        const version = (0, import_node_child_process9.execSync)("claude --version 2>&1", { encoding: "utf-8", timeout: 5e3 }).trim();
        res.json({ success: true, version, output: result });
      } catch {
        res.json({
          success: false,
          error: "Installed but claude command not found. You may need to restart your terminal.",
          output: result
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Installation failed";
      if (message.includes("EACCES") || message.includes("permission")) {
        res.status(403).json({
          error: "Permission denied. Try running Agent Studio with sudo, or install Claude Code manually:\n\nsudo npm install -g @anthropic-ai/claude-code",
          output: message
        });
      } else {
        res.status(500).json({ error: message, output: message });
      }
    }
  });
  app.post("/api/system/detect", (_req, res) => {
    try {
      const { existsSync: fse, readdirSync: fsr, statSync: fss, readFileSync: fsrf, realpathSync: fsrp } = require("node:fs");
      const { join: pj } = require("node:path");
      const home = import_node_os4.default.homedir();
      const searchDirs = [
        pj(home, "Code"),
        pj(home, "code"),
        pj(home, "Projects"),
        pj(home, "Documents"),
        pj(home, "Desktop"),
        pj(home, "repos"),
        pj(home, "dev"),
        pj(home, "workspace"),
        pj(home, "src"),
        pj(home, "work")
      ];
      const projects = [];
      const seenPaths = /* @__PURE__ */ new Set();
      for (const dir of searchDirs) {
        if (!fse(dir)) continue;
        try {
          const entries = fsr(dir);
          for (const entry of entries) {
            if (entry.startsWith(".")) continue;
            const fullPath = pj(dir, entry);
            try {
              const stat2 = fss(fullPath);
              if (!stat2.isDirectory()) continue;
              const resolved = fsrp(fullPath);
              if (seenPaths.has(resolved)) continue;
              if (!fse(pj(fullPath, ".git"))) continue;
              seenPaths.add(resolved);
              const techStack = [];
              const languages = [];
              let packageManager = "unknown";
              let devCommand;
              if (fse(pj(fullPath, "package.json"))) {
                try {
                  const pkg = JSON.parse(fsrf(pj(fullPath, "package.json"), "utf-8"));
                  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
                  if (allDeps["next"]) techStack.push("Next.js");
                  else if (allDeps["react"]) techStack.push("React");
                  if (allDeps["vue"]) techStack.push("Vue");
                  if (allDeps["svelte"] || allDeps["@sveltejs/kit"]) techStack.push("Svelte");
                  if (allDeps["@angular/core"]) techStack.push("Angular");
                  if (allDeps["express"]) techStack.push("Express");
                  if (allDeps["fastify"]) techStack.push("Fastify");
                  if (allDeps["tailwindcss"]) techStack.push("Tailwind");
                  if (allDeps["electron"]) techStack.push("Electron");
                  if (allDeps["react-native"]) techStack.push("React Native");
                  if (allDeps["typescript"]) languages.push("TypeScript");
                  else languages.push("JavaScript");
                  if (fse(pj(fullPath, "pnpm-lock.yaml"))) packageManager = "pnpm";
                  else if (fse(pj(fullPath, "yarn.lock"))) packageManager = "yarn";
                  else if (fse(pj(fullPath, "bun.lockb"))) packageManager = "bun";
                  else packageManager = "npm";
                  if (pkg.scripts?.["dev"]) devCommand = `${packageManager} run dev`;
                  else if (pkg.scripts?.["start"]) devCommand = `${packageManager} run start`;
                } catch {
                }
              }
              if (fse(pj(fullPath, "requirements.txt")) || fse(pj(fullPath, "pyproject.toml"))) {
                languages.push("Python");
                if (packageManager === "unknown") packageManager = fse(pj(fullPath, "pyproject.toml")) ? "poetry" : "pip";
                if (fse(pj(fullPath, "manage.py"))) {
                  techStack.push("Django");
                  devCommand = devCommand ?? "python manage.py runserver";
                }
              }
              if (fse(pj(fullPath, "go.mod"))) {
                languages.push("Go");
                if (packageManager === "unknown") packageManager = "go";
                devCommand = devCommand ?? "go run .";
              }
              if (fse(pj(fullPath, "Cargo.toml"))) {
                languages.push("Rust");
                if (packageManager === "unknown") packageManager = "cargo";
                devCommand = devCommand ?? "cargo run";
              }
              if (fse(pj(fullPath, "pom.xml")) || fse(pj(fullPath, "build.gradle"))) {
                languages.push("Java");
                if (packageManager === "unknown") packageManager = fse(pj(fullPath, "build.gradle")) ? "gradle" : "maven";
              }
              const hasAgentSystem = fse(pj(fullPath, "ai-agents")) || fse(pj(fullPath, ".claude", "agents"));
              let gitBranch = "main";
              try {
                gitBranch = (0, import_node_child_process9.execSync)("git rev-parse --abbrev-ref HEAD", { cwd: fullPath, encoding: "utf-8", timeout: 3e3 }).trim();
              } catch {
              }
              let lastCommit = "";
              let lastModified = 0;
              try {
                const ct = (0, import_node_child_process9.execSync)("git log -1 --format=%ci", { cwd: fullPath, encoding: "utf-8", timeout: 3e3 }).trim();
                lastModified = new Date(ct).getTime();
                const dm = Math.floor((Date.now() - lastModified) / 6e4);
                if (dm < 60) lastCommit = `${dm}m ago`;
                else if (dm < 1440) lastCommit = `${Math.floor(dm / 60)}h ago`;
                else lastCommit = `${Math.floor(dm / 1440)}d ago`;
              } catch {
                lastCommit = "unknown";
              }
              projects.push({ name: entry, path: fullPath, techStack, languages: languages.length > 0 ? languages : ["Unknown"], packageManager, devCommand, hasAgentSystem, gitBranch, lastCommit, lastModified });
            } catch {
            }
          }
        } catch {
        }
      }
      projects.sort((a, b) => b.lastModified - a.lastModified);
      res.json({ projects });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
  app.use(
    (err, _req, res, _next) => {
      console.error("Server error:", err.message);
      res.status(500).json({ error: "Internal server error" });
    }
  );
  app.use("/api/rooms", roomsRoutes(roomManager, sdkManager, wss));
  let nextReady = false;
  let handle;
  app.all("/{*path}", (req, res) => {
    if (nextReady) {
      return handle(req, res);
    }
    if (req.headers.accept?.includes("text/html")) {
      res.send(`<!DOCTYPE html>
<html>
<head><title>Agent Studio</title><meta http-equiv="refresh" content="3"></head>
<body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#0a0b0e;color:#f59e0b;font-family:'Geist Mono',monospace">
  <div style="text-align:center">
    <div style="font-size:32px;margin-bottom:16px">\u26A1</div>
    <div style="font-size:16px;font-weight:600">Agent Studio</div>
    <div style="font-size:12px;color:#888;margin-top:12px">Compiling UI... this only takes long the first time.</div>
    <div style="font-size:11px;color:#555;margin-top:8px">API is already running. The page will refresh automatically.</div>
  </div>
</body>
</html>`);
    } else {
      res.status(503).json({ error: "UI is still compiling" });
    }
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`Agent Studio running on http://localhost:${port}`);
  });
  const nextApp = (0, import_next.default)({ dev, hostname: "127.0.0.1", port });
  nextApp.prepare().then(() => {
    handle = nextApp.getRequestHandler();
    nextUpgradeHandler = nextApp.getUpgradeHandler();
    nextReady = true;
    console.log("Next.js ready \u2014 UI is now serving");
  }).catch((err) => {
    console.error("Next.js failed to compile:", err);
    nextReady = true;
  });
}
main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
//# sourceMappingURL=index.js.map
