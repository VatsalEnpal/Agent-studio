#!/usr/bin/env node
/**
 * Demo Teardown Script — Removes all fake data and restores real config.
 *
 * What it cleans:
 *   - Kills all active terminal sessions
 *   - Closes all rooms
 *   - Restores .agent-studio.json from backup
 *   - Removes /tmp/agent-studio-demo/ (fake projects, agents, memory, sprints)
 *   - Reloads server config
 *
 * Idempotent: safe to run multiple times.
 *
 * Usage:
 *   node scripts/teardown-demo.mjs
 */

import { existsSync, copyFileSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const BASE_URL = "http://localhost:8080";
const PROJECT_ROOT = process.cwd();
const DEMO_BASE = "/tmp/agent-studio-demo";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function api(method, path, body) {
  try {
    const opts = {
      method,
      headers: { "Content-Type": "application/json" },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE_URL}${path}`, opts);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch {
    return null; // Server may not be running — that's OK
  }
}

function log(emoji, msg) {
  console.log(`  ${emoji}  ${msg}`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

console.log("\n🧹 Agent Studio Demo Teardown\n");

// Step 1: Check if server is running
let serverUp = false;
try {
  const health = await api("GET", "/api/health");
  serverUp = health?.status === "ok";
} catch {
  // not running
}

if (serverUp) {
  // Step 2: Kill all sessions
  const sessions = await api("GET", "/api/sessions");
  if (Array.isArray(sessions) && sessions.length > 0) {
    for (const s of sessions) {
      await api("DELETE", `/api/sessions/${s.id}`);
    }
    log("🔪", `Killed ${sessions.length} session(s)`);
  } else {
    log("✅", "No active sessions to kill");
  }

  // Step 3: Close all rooms
  const rooms = await api("GET", "/api/rooms");
  if (Array.isArray(rooms) && rooms.length > 0) {
    for (const r of rooms) {
      await api("DELETE", `/api/rooms/${r.id}`);
    }
    log("🔪", `Closed ${rooms.length} room(s)`);
  } else {
    log("✅", "No active rooms to close");
  }
} else {
  log("⚠️", "Server not running — skipping session/room cleanup");
}

// Step 4: Restore config from backup
const configPath = join(PROJECT_ROOT, ".agent-studio.json");
const backupPath = join(PROJECT_ROOT, ".agent-studio.json.backup");

if (existsSync(backupPath)) {
  copyFileSync(backupPath, configPath);
  unlinkSync(backupPath);
  log("💾", "Restored .agent-studio.json from backup");
} else if (existsSync(configPath)) {
  log("⚠️", "No backup found — leaving current config in place");
} else {
  log("✅", "No config to restore");
}

// Step 5: Reload server config (if running)
if (serverUp) {
  await api("POST", "/api/config", null);
  log("🔄", "Triggered server config reload");
}

// Step 6: Remove fake data directory
if (existsSync(DEMO_BASE)) {
  rmSync(DEMO_BASE, { recursive: true, force: true });
  log("🗑️", `Removed ${DEMO_BASE}`);
} else {
  log("✅", "No demo data directory to remove");
}

// Step 7: Clean up room persistence files that may reference demo data
const roomsDir = join(PROJECT_ROOT, ".agent-studio-rooms");
if (existsSync(roomsDir)) {
  rmSync(roomsDir, { recursive: true, force: true });
  log("🗑️", "Removed .agent-studio-rooms persistence dir");
}

console.log("\n✨ Teardown complete. Real config restored.\n");

if (serverUp) {
  console.log("  ⚠️  Restart the server to fully reset in-memory state:");
  console.log("     Kill the server, then: npm run dev\n");
}
