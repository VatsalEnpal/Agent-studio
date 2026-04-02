import * as pty from "node-pty";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { whichCommand, IS_WINDOWS } from "./platform.js";

const ALLOWED_COMMANDS = new Set([
  "claude",
  "bash",
  "sh",
  "zsh",
  "node",
  "python",
  "python3",
  ...(IS_WINDOWS ? ["powershell.exe", "cmd.exe", "pwsh.exe"] : []),
]);

function resolveCommand(cmd: string): string {
  if (cmd.startsWith("/") || (IS_WINDOWS && /^[a-zA-Z]:\\/.test(cmd))) return cmd;
  return whichCommand(cmd) ?? cmd;
}
import type { Session, SessionMeta, WsMessage } from "./types.js";

interface CreateSessionOptions {
  name: string;
  command?: string;
  args?: string[];
  cwd?: string;
  cols?: number;
  rows?: number;
  meta?: SessionMeta;
}

type EventListener = (message: WsMessage) => void;

const MAX_BUFFER_SIZE = 100 * 1024; // 100KB per session

export class TerminalManager {
  private sessions = new Map<
    string,
    { session: Session; pty: pty.IPty; outputBuffer: string }
  >();
  private listeners = new Set<EventListener>();

  createSession(opts: CreateSessionOptions): Session {
    const id = randomUUID();
    const command = opts.command ?? "claude";

    // Security: only allow known commands
    const baseCommand = command.split("/").pop() ?? command;
    if (!ALLOWED_COMMANDS.has(baseCommand)) {
      throw new Error(
        `Command "${baseCommand}" is not allowed. Allowed: ${[...ALLOWED_COMMANDS].join(", ")}`,
      );
    }

    const args = opts.args ?? ["--dangerously-skip-permissions"];
    const cwd = opts.cwd ?? process.cwd();

    // Validate CWD exists before spawning — prevents silent crashes
    if (!existsSync(cwd)) {
      throw new Error(`Working directory does not exist: ${cwd}`);
    }
    const cols = opts.cols ?? 120;
    const rows = opts.rows ?? 30;

    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
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
      env,
    });

    const session: Session = {
      id,
      name: opts.name,
      pid: ptyProcess.pid,
      command,
      args,
      cwd,
      status: "active",
      createdAt: Date.now(),
      meta: opts.meta,
    };

    const entry = { session, pty: ptyProcess, outputBuffer: "" };
    this.sessions.set(id, entry);

    // Batch PTY output: collect data and flush every 50ms instead of
    // emitting on every byte. This reduces WebSocket message volume by ~20x
    // during heavy output (e.g. Claude streaming a response).
    let pending = "";
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    ptyProcess.onData((data: string) => {
      try {
        // Append to circular buffer for replay on reconnect
        entry.outputBuffer += data;
        if (entry.outputBuffer.length > MAX_BUFFER_SIZE) {
          entry.outputBuffer = entry.outputBuffer.slice(-MAX_BUFFER_SIZE);
        }

        pending += data;

        if (!flushTimer) {
          flushTimer = setTimeout(() => {
            if (pending) {
              this.emit({
                type: "terminal-data",
                sessionId: id,
                data: pending,
              });
              pending = "";
            }
            flushTimer = null;
          }, 50);
        }
      } catch {
        // Don't let a single data event crash the server
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      try {
        // Flush any remaining buffered output before marking as exited
        if (pending) {
          this.emit({
            type: "terminal-data",
            sessionId: id,
            data: pending,
          });
          pending = "";
        }
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }

        const entry = this.sessions.get(id);
        if (entry) {
          entry.session.status = "exited";
          entry.session.exitCode = exitCode;
        }
        this.emit({
          type: "sessions-update",
          payload: this.listSessions(),
        });
      } catch {
        // Don't let exit handling crash the server
      }
    });

    this.emit({
      type: "sessions-update",
      payload: this.listSessions(),
    });

    return session;
  }

  writeToSession(id: string, data: string): void {
    const entry = this.sessions.get(id);
    if (!entry) {
      throw new Error(`Session ${id} not found`);
    }
    entry.pty.write(data);
  }

  resizeSession(id: string, cols: number, rows: number): void {
    const entry = this.sessions.get(id);
    if (!entry) {
      throw new Error(`Session ${id} not found`);
    }
    entry.pty.resize(cols, rows);
  }

  killSession(id: string): void {
    const entry = this.sessions.get(id);
    if (!entry) {
      throw new Error(`Session ${id} not found`);
    }
    entry.pty.kill();
    // Don't delete immediately — let onExit set status to 'exited' first
    // so the frontend can show a toast notification.
    setTimeout(() => {
      if (this.sessions.has(id)) {
        this.sessions.delete(id);
        this.emit({
          type: "sessions-update",
          payload: this.listSessions(),
        });
      }
    }, 3000);
  }

  listSessions(): Session[] {
    return Array.from(this.sessions.values()).map((entry) => entry.session);
  }

  onEvent(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSessionBuffer(id: string): string | null {
    const entry = this.sessions.get(id);
    return entry?.outputBuffer ?? null;
  }

  private emit(message: WsMessage): void {
    for (const listener of this.listeners) {
      listener(message);
    }
  }
}
