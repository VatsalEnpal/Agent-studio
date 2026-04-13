/**
 * CommandRunner interface and implementations for workflow agent execution.
 *
 * - ClaudeCommandRunner: spawns real `claude -p` via child_process
 * - MockCommandRunner: returns configurable responses for testing
 */

import { spawn } from "node:child_process";

// ---------- Interface ----------

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface CommandRunnerOptions {
  cwd: string;
  timeout?: number; // milliseconds
  signal?: AbortSignal;
}

export interface CommandRunner {
  run(command: string, args: string[], options: CommandRunnerOptions): Promise<CommandResult>;
}

// ---------- Real Implementation ----------

export class ClaudeCommandRunner implements CommandRunner {
  /** Check if `claude` is available on PATH */
  static isAvailable(): boolean {
    try {
      const { execSync } = require("node:child_process");
      execSync("which claude", { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  }

  async run(
    command: string,
    args: string[],
    options: CommandRunnerOptions,
  ): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        cwd: options.cwd,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
      });

      let stdout = "";
      let stderr = "";
      let killed = false;

      proc.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      // Handle timeout
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      if (options.timeout) {
        timeoutId = setTimeout(() => {
          killed = true;
          proc.kill("SIGTERM");
          setTimeout(() => {
            if (!proc.killed) proc.kill("SIGKILL");
          }, 5000);
        }, options.timeout);
      }

      // Handle abort signal
      if (options.signal) {
        const onAbort = () => {
          killed = true;
          proc.kill("SIGTERM");
          setTimeout(() => {
            if (!proc.killed) proc.kill("SIGKILL");
          }, 5000);
        };
        options.signal.addEventListener("abort", onAbort, { once: true });
        proc.on("close", () => {
          options.signal?.removeEventListener("abort", onAbort);
        });
      }

      proc.on("close", (code) => {
        if (timeoutId) clearTimeout(timeoutId);
        if (killed && code !== 0) {
          resolve({ exitCode: code ?? 1, stdout, stderr: stderr || "Process killed" });
        } else {
          resolve({ exitCode: code ?? 0, stdout, stderr });
        }
      });

      proc.on("error", (err) => {
        if (timeoutId) clearTimeout(timeoutId);
        reject(err);
      });
    });
  }
}

// ---------- Mock Implementation ----------

export interface MockResponse {
  exitCode: number;
  stdout: string;
  stderr: string;
  /** Simulate execution delay in ms */
  delayMs?: number;
}

export class MockCommandRunner implements CommandRunner {
  private responses: MockResponse[] = [];
  private callIndex = 0;
  public calls: Array<{ command: string; args: string[]; options: CommandRunnerOptions }> = [];

  /** Set responses to return in order. Cycles back to last if exhausted. */
  setResponses(responses: MockResponse[]): void {
    this.responses = responses;
    this.callIndex = 0;
  }

  /** Convenience: set a single success response */
  setSuccess(stdout = ""): void {
    this.setResponses([{ exitCode: 0, stdout, stderr: "" }]);
  }

  /** Convenience: set a single failure response */
  setFailure(exitCode = 1, stderr = "error"): void {
    this.setResponses([{ exitCode, stdout: "", stderr }]);
  }

  /** Convenience: set a timeout simulation (long delay) */
  setTimeout(delayMs = 10000): void {
    this.setResponses([{ exitCode: 1, stdout: "", stderr: "timeout", delayMs }]);
  }

  /** Convenience: set a rate limit response */
  setRateLimit(): void {
    this.setResponses([
      {
        exitCode: 1,
        stdout: "429 Too Many Requests",
        stderr: "",
      },
    ]);
  }

  async run(
    command: string,
    args: string[],
    options: CommandRunnerOptions,
  ): Promise<CommandResult> {
    this.calls.push({ command, args, options });

    const response = this.responses[Math.min(this.callIndex, this.responses.length - 1)] ?? {
      exitCode: 0,
      stdout: "",
      stderr: "",
    };
    this.callIndex++;

    const delayMs = response.delayMs ?? 0;

    if (delayMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delayMs);

        if (options.signal) {
          const onAbort = () => {
            clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
          };
          if (options.signal.aborted) {
            clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
            return;
          }
          options.signal.addEventListener("abort", onAbort, { once: true });
        }
      });
    }

    return {
      exitCode: response.exitCode,
      stdout: response.stdout,
      stderr: response.stderr,
    };
  }

  reset(): void {
    this.responses = [];
    this.callIndex = 0;
    this.calls = [];
  }
}

// ---------- Factory ----------

export function createCommandRunner(useMock = false): CommandRunner {
  if (useMock || process.env.NODE_ENV === "test") {
    return new MockCommandRunner();
  }
  return new ClaudeCommandRunner();
}
