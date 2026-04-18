/**
 * Tests for the unified poller service.
 *
 * Covers: scheduling, re-registration semantics (timer reset, hitCount preserved),
 * error isolation, concurrency guard (overlapping runs skipped), getCached TTL
 * semantics, unregister / unregisterAll, and stats() shape.
 *
 * Uses vi.useFakeTimers() with `vi.advanceTimersByTimeAsync` so async fn bodies
 * resolve cleanly between ticks.
 *
 * NOTE: The current implementation of `getCached` only takes a `key`
 * parameter — the TTL is supplied at register-time via `cacheTtlMs`.
 * The tests here exercise that contract.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { register, unregister, unregisterAll, getCached, stats } from "../poller.js";

beforeEach(() => {
  unregisterAll();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  unregisterAll();
});

describe("register()", () => {
  it("schedules fn on next tick and on subsequent intervals", async () => {
    const fn = vi.fn(async () => "ok");
    register("k1", 1000, fn);

    // First run is queued via setTimeout(0) — flush it.
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);

    // Each interval tick triggers another invocation.
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("re-registering with a different intervalMs clears old timer and preserves hitCount", async () => {
    const fn1 = vi.fn(async () => "v1");
    register("k2", 1000, fn1);
    await vi.advanceTimersByTimeAsync(0); // first run
    await vi.advanceTimersByTimeAsync(1000); // second run
    expect(fn1).toHaveBeenCalledTimes(2);
    const beforeStats = stats();
    expect(beforeStats.hitCountSinceBoot.k2).toBe(2);

    // Re-register with a faster interval and a different fn.
    const fn2 = vi.fn(async () => "v2");
    register("k2", 500, fn2);

    // First run on next tick.
    await vi.advanceTimersByTimeAsync(0);
    expect(fn2).toHaveBeenCalledTimes(1);

    // The old 1000ms interval must NOT fire fn1 anymore.
    await vi.advanceTimersByTimeAsync(500); // 500ms total since re-reg → fn2 tick
    expect(fn2).toHaveBeenCalledTimes(2);
    expect(fn1).toHaveBeenCalledTimes(2); // unchanged

    // hitCount preserved across re-registration (monotonic).
    const afterStats = stats();
    expect(afterStats.hitCountSinceBoot.k2).toBeGreaterThanOrEqual(
      beforeStats.hitCountSinceBoot.k2,
    );
  });

  it("isolates errors: a throwing poller doesn't kill other registrations", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const bad = vi.fn(async () => {
      throw new Error("boom");
    });
    const good = vi.fn(async () => "still here");
    register("bad", 1000, bad);
    register("good", 1000, good);

    await vi.advanceTimersByTimeAsync(0); // first runs
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000); // second tick
    expect(bad).toHaveBeenCalledTimes(2);
    expect(good).toHaveBeenCalledTimes(2);

    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("concurrency guard: skips a tick if the previous run is still executing", async () => {
    let resolveFirst: (value: string) => void = () => {};
    const fn = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveFirst = resolve;
        }),
    );

    register("slow", 1000, fn);

    // First run starts on next tick and stays in-flight.
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);

    // Next interval fires while the first call is still pending → skipped.
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(1);

    // Now resolve the first call; subsequent ticks should run again.
    resolveFirst("done");
    // Let microtasks settle before next interval.
    await Promise.resolve();
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("getCached()", () => {
  it("returns cached value when fresh, recomputes when stale", async () => {
    let counter = 0;
    const fn = vi.fn(async () => {
      counter += 1;
      return counter;
    });
    register("cached", 60_000, fn, { cacheTtlMs: 5_000 });

    // First-tick run populates the cache.
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);

    // Within TTL → no extra fn invocation, returns cached value (1).
    const v1 = await getCached<number>("cached");
    expect(v1).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);

    // Advance past TTL → next getCached should recompute.
    await vi.advanceTimersByTimeAsync(5_001);
    // The interval timer is 60s so it didn't fire — but cache is now stale.
    const v2 = await getCached<number>("cached");
    expect(v2).toBe(2);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws when key is not registered", async () => {
    await expect(getCached("nope")).rejects.toThrow(/no registration/);
  });
});

describe("unregister() / unregisterAll()", () => {
  it("unregister() removes entry and clears the timer", async () => {
    const fn = vi.fn(async () => "x");
    register("doomed", 1000, fn);
    await vi.advanceTimersByTimeAsync(0); // first run
    expect(fn).toHaveBeenCalledTimes(1);

    unregister("doomed");

    await vi.advanceTimersByTimeAsync(5_000);
    expect(fn).toHaveBeenCalledTimes(1); // no further calls

    expect(stats().registered).not.toContain("doomed");
  });

  it("unregister() on an unknown key is a no-op", () => {
    expect(() => unregister("does-not-exist")).not.toThrow();
  });

  it("unregisterAll() clears every registration and stops all timers", async () => {
    const f1 = vi.fn(async () => 1);
    const f2 = vi.fn(async () => 2);
    register("a", 1000, f1);
    register("b", 1000, f2);
    await vi.advanceTimersByTimeAsync(0);
    expect(f1).toHaveBeenCalledTimes(1);
    expect(f2).toHaveBeenCalledTimes(1);

    unregisterAll();

    await vi.advanceTimersByTimeAsync(5_000);
    expect(f1).toHaveBeenCalledTimes(1);
    expect(f2).toHaveBeenCalledTimes(1);
    expect(stats().registered).toEqual([]);
  });
});

describe("stats()", () => {
  it("returns the documented shape with arrays/records keyed by registration name", async () => {
    const fn = vi.fn(async () => "ok");
    register("alpha", 1000, fn);
    register("beta", 1000, fn);
    await vi.advanceTimersByTimeAsync(0);

    const s = stats();
    expect(s).toMatchObject({
      registered: expect.any(Array),
      lastRunAt: expect.any(Object),
      hitCountSinceBoot: expect.any(Object),
    });
    expect(s.registered.sort()).toEqual(["alpha", "beta"]);
    expect(typeof s.hitCountSinceBoot.alpha).toBe("number");
    expect(typeof s.hitCountSinceBoot.beta).toBe("number");
    // lastRunAt is a number (ms since epoch) once the poller has run.
    expect(typeof s.lastRunAt.alpha).toBe("number");
    expect(typeof s.lastRunAt.beta).toBe("number");
  });

  it("stats() with no registrations returns empty shape", () => {
    const s = stats();
    expect(s.registered).toEqual([]);
    expect(s.lastRunAt).toEqual({});
    expect(s.hitCountSinceBoot).toEqual({});
  });
});
