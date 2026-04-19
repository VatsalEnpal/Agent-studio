/**
 * Unified poller service.
 *
 * Provides a single place to register recurring background polls. Each
 * registration gets a deduped timer (re-registering the same key cancels the
 * previous timer), optional result caching with TTL, error isolation (a bad
 * poll doesn't crash the process), and concurrency protection (the same key
 * cannot run twice in parallel).
 *
 * Observable via `stats()` and the `/api/debug/poller-stats` route.
 *
 * ShipLoop plan task 3a.
 *
 * @module server/services/poller
 */

export type PollerFn = () => Promise<unknown> | unknown;

export interface RegisterOptions {
  /** Optional TTL for `getCached()` — if set, results returned by fn are
   *  reused when fresher than this many ms. 0 / undefined = no cache. */
  cacheTtlMs?: number;
}

interface Registration {
  key: string;
  intervalMs: number;
  fn: PollerFn;
  cacheTtlMs: number;
  lastRunAt: number | null;
  lastResult: unknown;
  lastResultAt: number | null;
  hitCount: number;
  timer: ReturnType<typeof setInterval> | null;
  running: boolean;
}

const REGS = new Map<string, Registration>();

async function runOnce(reg: Registration): Promise<void> {
  if (reg.running) return; // concurrency guard: skip overlapping runs
  reg.running = true;
  try {
    const result = await reg.fn();
    reg.lastResult = result;
    reg.lastResultAt = Date.now();
  } catch (err) {
    // Error isolation — a misbehaving poller must not kill the process.
    // eslint-disable-next-line no-console
    console.error(`[poller] "${reg.key}" threw:`, err);
  } finally {
    reg.lastRunAt = Date.now();
    reg.hitCount += 1;
    reg.running = false;
  }
}

/**
 * Register a recurring poll. If the key already exists, its previous timer is
 * cancelled and replaced; `hitCount` is preserved so stats remain monotonic.
 */
export function register(
  key: string,
  intervalMs: number,
  fn: PollerFn,
  opts?: RegisterOptions,
): void {
  const existing = REGS.get(key);
  if (existing?.timer) {
    clearInterval(existing.timer);
    existing.timer = null;
  }

  const reg: Registration = existing ?? {
    key,
    intervalMs,
    fn,
    cacheTtlMs: opts?.cacheTtlMs ?? 0,
    lastRunAt: null,
    lastResult: undefined,
    lastResultAt: null,
    hitCount: 0,
    timer: null,
    running: false,
  };

  // Update in case of re-registration with new params
  reg.intervalMs = intervalMs;
  reg.fn = fn;
  reg.cacheTtlMs = opts?.cacheTtlMs ?? reg.cacheTtlMs ?? 0;

  REGS.set(key, reg);

  // First run on next tick — avoids boot-ordering issues if register() is
  // called from module top-level before deps are wired.
  setTimeout(() => {
    void runOnce(reg);
  }, 0);

  reg.timer = setInterval(() => {
    void runOnce(reg);
  }, intervalMs);
}

/** Cancel and remove a registration. */
export function unregister(key: string): void {
  const reg = REGS.get(key);
  if (!reg) return;
  if (reg.timer) {
    clearInterval(reg.timer);
    reg.timer = null;
  }
  REGS.delete(key);
}

/** Cancel all registrations (useful on shutdown). */
export function unregisterAll(): void {
  for (const reg of REGS.values()) {
    if (reg.timer) {
      clearInterval(reg.timer);
      reg.timer = null;
    }
  }
  REGS.clear();
}

/**
 * Return the last cached result if fresh per `cacheTtlMs`; otherwise run the
 * registered fn now, cache, and return its value.
 *
 * Throws if `key` is not registered.
 */
export async function getCached<T = unknown>(key: string): Promise<T> {
  const reg = REGS.get(key);
  if (!reg) throw new Error(`[poller] no registration for key "${key}"`);
  const now = Date.now();
  const fresh =
    reg.cacheTtlMs > 0 && reg.lastResultAt !== null && now - reg.lastResultAt < reg.cacheTtlMs;
  if (fresh) return reg.lastResult as T;
  await runOnce(reg);
  return reg.lastResult as T;
}

export interface PollerStats {
  registered: string[];
  lastRunAt: Record<string, number | null>;
  hitCountSinceBoot: Record<string, number>;
}

/** Snapshot stats for the /api/debug/poller-stats endpoint. */
export function stats(): PollerStats {
  const registered: string[] = [];
  const lastRunAt: Record<string, number | null> = {};
  const hitCountSinceBoot: Record<string, number> = {};
  for (const [key, reg] of REGS.entries()) {
    registered.push(key);
    lastRunAt[key] = reg.lastRunAt;
    hitCountSinceBoot[key] = reg.hitCount;
  }
  return { registered, lastRunAt, hitCountSinceBoot };
}
