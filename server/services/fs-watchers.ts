/**
 * Event-driven fs.watch invalidations for config + agent directories.
 *
 * Replaces polling-based checks with chokidar watchers on:
 *   - `~/.claude/agents/` (user-level agents, scope=global)
 *   - Every project-scoped `.claude/agents/` directory from config.agentSources
 *   - `.agent-studio.json` (the config file itself)
 *
 * On change:
 *   - Config file change → `reloadConfig()` + re-init watchers (agentSources may
 *     have changed).
 *   - Agent dir change → no cache to invalidate (the `GET /api/agents` handler
 *     re-reads from disk on every request), so the watch is just a placeholder
 *     hook where an invalidation could be added later.
 *
 * Events are debounced 300ms to coalesce rapid bursts (editor save =
 * add+unlink+add).
 *
 * ShipLoop plan task 3c.
 *
 * @module server/services/fs-watchers
 */

import { watch, type FSWatcher } from "chokidar";
import { existsSync } from "node:fs";
import { getAgentSources, getConfigPath, reloadConfig } from "../config.js";

const DEBOUNCE_MS = 300;

let configWatcher: FSWatcher | null = null;
let agentDirWatcher: FSWatcher | null = null;
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

/** Close any existing agent-dir watcher and spin up a new one covering the
 *  current config.agentSources. Called on startup and whenever the config
 *  file changes (agentSources may have been edited). */
function rewatchAgentDirs(): void {
  const paths: string[] = [];
  for (const source of getAgentSources()) {
    // chokidar accepts non-existent paths but we filter to existing ones to
    // keep the watcher lean; if a dir appears later, a config reload
    // (via .agent-studio.json change) will add it.
    if (existsSync(source.path)) paths.push(source.path);
  }

  // Close the previous watcher before opening a new one.
  const previous = agentDirWatcher;
  agentDirWatcher = null;
  if (previous) {
    // Fire-and-forget; closing is idempotent and we don't need to block.
    void previous.close();
  }

  if (paths.length === 0) return;

  agentDirWatcher = watch(paths, {
    persistent: true,
    ignoreInitial: true,
    depth: 0, // only direct children (.md files), not nested dirs
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
  });

  // The `GET /api/agents` handler re-reads the directory every request, so
  // there's no in-memory agent cache to invalidate here. The watcher exists
  // so any future caller can add invalidation cheaply, and so that the test
  // harness in plan task 3c verify ("touch a file → /api/agents reflects
  // change") is event-driven rather than relying on a poll interval.
  const handler = (filePath: string): void => {
    debounce(`agents:${filePath}`, () => {
      // No-op today — intentional. See module doc.
    });
  };

  agentDirWatcher.on("add", handler);
  agentDirWatcher.on("change", handler);
  agentDirWatcher.on("unlink", handler);
}

/** Watch the `.agent-studio.json` config file. Changes trigger a
 *  reloadConfig() and re-watch of agent dirs (agentSources may have changed). */
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
      rewatchAgentDirs();
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
  rewatchAgentDirs();
}

/** Close all watchers and cancel pending debounce timers. */
export function stopFsWatchers(): void {
  for (const t of pendingTimers.values()) clearTimeout(t);
  pendingTimers.clear();

  const toClose: FSWatcher[] = [];
  if (configWatcher) toClose.push(configWatcher);
  if (agentDirWatcher) toClose.push(agentDirWatcher);
  configWatcher = null;
  agentDirWatcher = null;
  for (const w of toClose) {
    void w.close();
  }
}
