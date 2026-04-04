import { EventEmitter } from "events";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getAgentSystemBase } from "./config.js";

export interface RoomAgent {
  id: string;
  name: string;
  model: "opus" | "sonnet" | "haiku";
  sessionId?: string;
  status: "offline" | "idle" | "working" | "waiting";
}

export interface RoomMessage {
  id: string;
  roomId: string;
  from: string;
  to?: string;
  text: string;
  timestamp: string;
  type: "message" | "action" | "approval-request" | "system";
  approvalStatus?: "pending" | "approved" | "rejected";
  actionCommand?: string;
}

export interface Room {
  id: string;
  name: string;
  topic: string;
  agents: RoomAgent[];
  messages: RoomMessage[];
  contextFile: string;
  createdAt: string;
  active: boolean;
}

// ---------------------------------------------------------------------------
// PTY artifact detection and cleanup
// Old rooms captured raw terminal output — ANSI codes, spinners, Claude Code
// UI chrome.  Strip it on load so the chat UI shows clean text.
// ---------------------------------------------------------------------------

const PTY_ARTIFACT_RE = [
  /\x1B\[[0-9;]*[a-zA-Z]/g,                     // standard ANSI escape
  /\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g,         // OSC sequences
  /\x1B\[[\?]?[0-9;]*[a-zA-Z]/g,                // private mode
  /\[>[0-9]+[a-z]/g,                              // DEC sequences
  /\x1B/g,                                        // leftover ESC
  /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,          // control chars
  /[✢✶✻✽✳⏺❯·⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏●⎿▗▖▘▝▀▄█▌▐░▒▓]/g,     // spinner / UI / block glyphs
  /[─━│┃┌┐└┘├┤┬┴┼╋╌╍╎╏═║╒╓╔╕╖╗╘╙╚╛╜╝╞╟╠╡╢╣╤╥╦╧╨╩╪╫╬──]+/g, // box-drawing characters
  /https?:\/\/claude\.ai\/code\/session_[a-zA-Z0-9]+/g,          // Claude Code session URLs
];

/** Lines that are pure Claude Code UI chrome — remove entirely */
const UI_CHROME_RE = [
  /ctrl\+o\s+to\s+expand/i,
  /\/remote-control\s+is\s+active/i,
  /Please\s+upgrade\s+to\s+the\s+latest\s+version\s+of\s+the\s+Claude/i,
  /Reading\s+\d+\s+files?/i,
  /Read\s+\d+\s+files?/i,
  /Searching\s+for\s+\d+\s+pattern/i,
  /Listing\s+\d+\s+director/i,
  /^Code\s+in\s+CLI\s+or\s+at$/i,
  /^ClaudeCode\s*v[\d.]+/i,
  /^Opus\s*[\d.]+\s*(with|medium|high)/i,
  /^@\w+~\/Code\//i,
  /^Searched\s+for\s+\d+\s+pattern/i,
];

/** Claude Code "verbing" spinners — e.g. "Misting…", "Dilly-dallying…", "Skedaddling…", "Caramelizing…" */
const SPINNER_VERB_RE = /^[A-Z][a-z]+(?:-[a-z]+)*ing[…\.]{0,3}\s*$/;

function sanitizePtyMessage(text: string): string {
  let cleaned = text;

  // Strip ANSI and control sequences
  for (const re of PTY_ARTIFACT_RE) {
    cleaned = cleaned.replace(re, "");
  }

  // Remove lines that are pure UI chrome or spinner verbs
  const lines = cleaned.split("\n").filter(line => {
    const trimmed = line.trim();
    if (!trimmed) return false; // blank
    if (SPINNER_VERB_RE.test(trimmed)) return false;
    if (UI_CHROME_RE.some(re => re.test(trimmed))) return false;
    // Single-character junk lines (leftover from character-at-a-time PTY capture)
    if (trimmed.length <= 2 && !/[a-zA-Z0-9]/.test(trimmed)) return false;
    // Lines that are mostly non-alpha (symbols, dots, dashes)
    const alpha = (trimmed.match(/[a-zA-Z]/g) || []).length;
    if (trimmed.length > 5 && alpha / trimmed.length < 0.3) return false;
    // Repeated "verbing" words on same line (e.g., "Dilly-dallying.. Dilly-dallying..")
    if (/([A-Z][a-z]+-?[a-z]*ing).*\1/i.test(trimmed)) return false;
    return true;
  });

  cleaned = lines.join("\n")
    .replace(/ {3,}/g, "  ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // If after cleanup the message is very short or mostly non-alpha, it's garbage
  if (!cleaned) return "[Terminal output — legacy session]";
  const alphaCount = (cleaned.match(/[a-zA-Z]/g) || []).length;
  if (alphaCount / Math.max(cleaned.length, 1) < 0.2) {
    return "[Terminal output — legacy session]";
  }

  return cleaned;
}

/** Returns true if the raw message looks like it came from a PTY session */
function hasPtyArtifacts(text: string): boolean {
  if (!text) return false;
  // Check for ANSI escapes
  if (/\x1B/.test(text)) return true;
  // Check for Claude Code spinner glyphs
  if (/[✢✶✻✽✳⏺❯·⎿]/.test(text)) return true;
  // Check for Claude Code UI phrases
  if (/ctrl\+o\s+to\s+expand/i.test(text)) return true;
  if (/\/remote-control\s+is\s+active/i.test(text)) return true;
  // Check for the "Verbing…" spinner pattern appearing multiple times
  if ((text.match(/[A-Z][a-z]+ing…/g) || []).length >= 2) return true;
  return false;
}

const DANGEROUS_PATTERNS = [
  /\bgit\s+push\b.*--force/i,
  /\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i,
  /\bDELETE\s+FROM\b(?!.*WHERE)/i,
  /\bTRUNCATE\b/i,
  /\brm\s+-rf?\s+\//,
  /\bgit\s+reset\s+--hard/i,
];

export class RoomManager extends EventEmitter {
  private rooms: Map<string, Room> = new Map();
  private roomsDir: string;

  constructor() {
    super();
    const base = getAgentSystemBase() ?? process.cwd();
    this.roomsDir = join(base, "..", ".agent-studio", "rooms");
    if (!existsSync(this.roomsDir)) {
      mkdirSync(this.roomsDir, { recursive: true });
    }
    this.loadRooms();
  }

  createRoom(name: string, topic: string, agentConfigs: Array<{ id: string; name: string; model: "opus" | "sonnet" | "haiku" }>): Room {
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    if (this.rooms.has(id)) {
      throw new Error(`Room "${name}" already exists`);
    }

    const roomDir = join(this.roomsDir, id);
    if (!existsSync(roomDir)) mkdirSync(roomDir, { recursive: true });

    // Always include orchestrator
    const agents: RoomAgent[] = [];
    const hasOrchestrator = agentConfigs.some(a => a.id === "orchestrator");
    if (!hasOrchestrator) {
      agents.push({ id: "orchestrator", name: "Orchestrator", model: "opus", status: "offline" });
    }
    for (const cfg of agentConfigs) {
      agents.push({ id: cfg.id, name: cfg.name, model: cfg.model, status: "offline" });
    }

    const contextFile = join(roomDir, "context.md");
    writeFileSync(contextFile, [
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
      "",
    ].join("\n"));

    const room: Room = {
      id,
      name,
      topic,
      agents,
      messages: [],
      contextFile,
      createdAt: new Date().toISOString(),
      active: true,
    };

    this.rooms.set(id, room);
    this.saveRoom(room);

    this.addMessage(id, {
      from: "system",
      text: `Room "${name}" created. Topic: ${topic}. Agents: ${agents.map(a => a.name).join(", ")}`,
      type: "system",
    });

    return room;
  }

  addMessage(roomId: string, msg: Omit<RoomMessage, "id" | "roomId" | "timestamp">, clientId?: string): RoomMessage | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const message: RoomMessage = {
      ...msg,
      id: clientId ?? randomUUID(),
      roomId,
      timestamp: new Date().toISOString(),
    };

    room.messages.push(message);
    if (room.messages.length > 200) {
      room.messages = room.messages.slice(-200);
    }

    this.saveRoom(room);
    this.emit("message", message);
    return message;
  }

  checkDangerous(text: string): string | null {
    for (const pattern of DANGEROUS_PATTERNS) {
      const match = text.match(pattern);
      if (match) return match[0];
    }
    return null;
  }

  updateContextFile(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const completed: string[] = [];
    const inProgress: string[] = [];

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
      `## Agents: ${room.agents.map(a => `${a.name} (${a.status})`).join(", ")}`,
      "",
      "### Completed",
      completed.length > 0 ? completed.join("\n") : "(nothing yet)",
      "",
      "### In Progress",
      inProgress.length > 0 ? inProgress.join("\n") : "(nothing yet)",
      "",
      "### Recent Messages (last 10)",
      ...room.messages.slice(-10).map(m => `- **${m.from}**: ${(m.text ?? "").slice(0, 150)}`),
      "",
    ].join("\n");
    writeFileSync(room.contextFile, content);
  }

  getRoom(id: string): Room | null {
    return this.rooms.get(id) ?? null;
  }

  getRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  linkSession(roomId: string, agentId: string, sessionId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const agent = room.agents.find(a => a.id === agentId);
    if (agent) {
      agent.sessionId = sessionId;
      agent.status = "idle";
      this.saveRoom(room);
      this.emit("agent-status", { roomId, agentId, status: "idle" });
    }
  }

  setAgentStatus(roomId: string, agentId: string, status: RoomAgent["status"]): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const agent = room.agents.find(a => a.id === agentId);
    if (agent) {
      agent.status = status;
      this.saveRoom(room);
      this.emit("agent-status", { roomId, agentId, status });
    }
  }

  approveAction(roomId: string, messageId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    const msg = room.messages.find(m => m.id === messageId);
    if (msg && msg.type === "approval-request" && msg.approvalStatus === "pending") {
      msg.approvalStatus = "approved";
      this.saveRoom(room);
      this.emit("approval", { roomId, messageId, approved: true });
      return true;
    }
    return false;
  }

  rejectAction(roomId: string, messageId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    const msg = room.messages.find(m => m.id === messageId);
    if (msg && msg.type === "approval-request" && msg.approvalStatus === "pending") {
      msg.approvalStatus = "rejected";
      this.saveRoom(room);
      this.emit("approval", { roomId, messageId, approved: false });
      return true;
    }
    return false;
  }

  closeRoom(roomId: string): string[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    room.active = false;
    const sessionIds = room.agents
      .filter(a => a.sessionId)
      .map(a => a.sessionId!);
    room.agents.forEach(a => { a.status = "offline"; a.sessionId = undefined; });
    this.saveRoom(room);
    this.addMessage(roomId, { from: "system", text: "Room closed.", type: "system" });
    return sessionIds;
  }

  private saveRoom(room: Room): void {
    const roomDir = join(this.roomsDir, room.id);
    if (!existsSync(roomDir)) mkdirSync(roomDir, { recursive: true });
    const file = join(roomDir, "room.json");
    const tmpFile = file + ".tmp";
    writeFileSync(tmpFile, JSON.stringify(room, null, 2));
    renameSync(tmpFile, file);
  }

  private loadRooms(): void {
    try {
      const dirs = readdirSync(this.roomsDir);
      for (const dir of dirs) {
        const file = join(this.roomsDir, dir, "room.json");
        if (existsSync(file)) {
          try {
            const room = JSON.parse(readFileSync(file, "utf-8")) as Room;
            // Filter out broken agents (missing id or name) and reset status
            room.agents = (room.agents ?? []).filter(a => a && a.id && a.name);
            room.agents.forEach(a => { a.status = "offline"; a.sessionId = undefined; });

            // Sanitize legacy PTY messages
            for (const msg of room.messages) {
              if (msg.type !== "system" && msg.text && hasPtyArtifacts(msg.text)) {
                msg.text = sanitizePtyMessage(msg.text);
              }
            }

            this.rooms.set(room.id, room);
          } catch {
            // skip corrupt files
          }
        }
      }
    } catch {
      // roomsDir doesn't exist yet
    }
  }
}
