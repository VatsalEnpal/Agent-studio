/**
 * Event-driven fs.watch invalidation for the `.agent-studio.json` config file.
 *
 * On change → `reloadConfig()`.
 *
 * Events are debounced 300ms to coalesce rapid bursts (editor save =
 * add+unlink+add).
 *
 * We previously also watched every `config.agentSources[].path` directory, but
 * that handler was a no-op: `GET /api/agents` re-reads each source directory
 * from disk on every request (with `?refresh=1` also calling `reloadConfig()`),
 * so there is no in-memory agent cache to invalidate. The watcher was removed
 * (M1) to cut chokidar's descriptor/polling cost and drop ~60 LOC of dead code.
 *
 * ShipLoop plan task 3c.
 *
 * @module server/services/fs-watchers
 */

import { watch, type FSWatcher } from "chokidar";
import { getConfigPath, reloadConfig } from "../config.js";

const DEBOUNCE_MS = 300;

let configWatcher: FSWatcher | null = null;
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Debounce a callback keyed by `key` — later calls within 300ms supersede earlier ones. */
function debounce(key: string, fn: () => void): void {
  const existing = pendingTimers.get(key);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    pendingTimers.delete(key);
    try {
      fn();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[fs-watchers] debounced callback for "${key}" threw:`, err);
    }
  }, DEBOUNCE_MS);
  // Don't keep the event loop alive just for a pending debounce.
  if (typeof t.unref === "function") t.unref();
  pendingTimers.set(key, t);
}

/** Watch the `.agent-studio.json` config file. Changes trigger a
 *  reloadConfig() so subsequent requests see updated agentSources etc. */
function watchConfigFile(): void {
  const configPath = getConfigPath();
  // chokidar requires the parent path or the file to be reachable; if the
  // config doesn't exist yet, watching the dir is fine — chokidar will pick
  // up the create.
  configWatcher = watch(configPath, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
  });

  const onConfigChange = (): void => {
    debounce("config", () => {
      reloadConfig();
    });
  };

  configWatcher.on("add", onConfigChange);
  configWatcher.on("change", onConfigChange);
}

/**
 * Start all fs watchers. Idempotent — if called twice, previous watchers are
 * closed first.
 */
export function startFsWatchers(): void {
  stopFsWatchers();
  watchConfigFile();
}

/** Close all watchers and cancel pending debounce timers. */
export function stopFsWatchers(): void {
  for (const t of pendingTimers.values()) clearTimeout(t);
  pendingTimers.clear();

  const toClose: FSWatcher[] = [];
  if (configWatcher) toClose.push(configWatcher);
  configWatcher = null;
  for (const w of toClose) {
    void w.close();
  }
}
