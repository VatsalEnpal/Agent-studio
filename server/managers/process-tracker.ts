// server/managers/process-tracker.ts
import treeKill from "tree-kill";

/** Metadata for a tracked process. */
export interface TrackedProcess {
  name: string;
  pid: number;
  trackedAt: number;
}

/**
 * Tracks child processes by name and provides lifecycle operations
 * including liveness checks and coordinated shutdown with SIGTERM/SIGKILL escalation.
 */
export class ProcessTracker {
  private processes = new Map<string, TrackedProcess>();

  /**
   * Register a process for tracking.
   * @param name - Unique identifier for the process
   * @param pid - OS process ID
   */
  track(name: string, pid: number): void {
    this.processes.set(name, { name, pid, trackedAt: Date.now() });
  }

  /**
   * Remove a process from tracking without killing it.
   * @param name - Identifier of the process to untrack
   */
  untrack(name: string): void {
    this.processes.delete(name);
  }

  /**
   * Check whether a tracked process is still alive using a zero-signal kill.
   * @param name - Identifier of the process
   * @returns `true` if the process exists and is alive, `false` otherwise
   */
  isAlive(name: string): boolean {
    const entry = this.processes.get(name);
    if (!entry) return false;
    try {
      process.kill(entry.pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Kill all tracked processes using tree-kill with SIGTERM -> SIGKILL escalation.
   * Each process is given a 3-second window to terminate gracefully before SIGKILL.
   * Uses `Promise.allSettled` so one failure does not block others.
   * @returns Settled results for each kill attempt
   */
  async killAll(): Promise<PromiseSettledResult<string>[]> {
    const entries = [...this.processes.values()];
    const results = await Promise.allSettled(
      entries.map((entry) => this.killWithEscalation(entry)),
    );
    this.processes.clear();
    return results;
  }

  /**
   * Return a snapshot of all currently tracked processes.
   */
  list(): TrackedProcess[] {
    return [...this.processes.values()];
  }

  /** Number of tracked processes. */
  get size(): number {
    return this.processes.size;
  }

  /**
   * Kill a single process tree: SIGTERM first, then SIGKILL after 3 seconds.
   * Wrapped in a per-process timeout so `killAll` never hangs.
   */
  private killWithEscalation(entry: TrackedProcess): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const ESCALATION_MS = 3_000;
      let settled = false;

      const finish = (result: "terminated" | "killed" | "error", err?: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(escalationTimer);
        clearTimeout(deadlineTimer);
        if (result === "error" && err) {
          reject(err);
        } else {
          resolve(`${entry.name}:${result}`);
        }
      };

      // Step 1: SIGTERM
      treeKill(entry.pid, "SIGTERM", (termErr) => {
        if (termErr) {
          // Process may already be gone — that counts as success
          if (this.isProcessGone(entry.pid)) {
            finish("terminated");
          } else {
            finish("error", termErr);
          }
          return;
        }
        // Check quickly if it died
        if (this.isProcessGone(entry.pid)) {
          finish("terminated");
        }
        // Otherwise wait for escalation timer
      });

      // Step 2: After 3s, escalate to SIGKILL
      const escalationTimer = setTimeout(() => {
        if (settled) return;
        if (this.isProcessGone(entry.pid)) {
          finish("terminated");
          return;
        }
        treeKill(entry.pid, "SIGKILL", (killErr) => {
          if (killErr && !this.isProcessGone(entry.pid)) {
            finish("error", killErr);
          } else {
            finish("killed");
          }
        });
      }, ESCALATION_MS);

      // Hard deadline: 2x escalation time so we never hang indefinitely
      const deadlineTimer = setTimeout(() => {
        finish("killed");
      }, ESCALATION_MS * 2);
    });
  }

  /** Returns true if the pid no longer corresponds to a running process. */
  private isProcessGone(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return false;
    } catch {
      return true;
    }
  }
}
