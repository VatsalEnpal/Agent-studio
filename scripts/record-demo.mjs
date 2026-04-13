#!/usr/bin/env node
/**
 * Demo Video Recording — Captures Agent Studio at maximum visual density.
 *
 * Approach (from video-approach.md):
 *   Shot 1 (0-4s):  Sessions — 5 terminals streaming in grid (THE HOOK)
 *   Shot 2 (4-8s):  Sprints  — Auth System Overhaul at 50%, mixed gates
 *   Shot 3 (8-12s): Rooms    — Agent conversation with @mentions
 *   Shot 4 (12-15s): Memory  — 10 entries across categories with tags
 *   End card added in post-production (ffmpeg).
 *
 * Prerequisites:
 *   1. Run seed first:  node scripts/seed-demo.mjs
 *   2. Restart server:  kill server, DEMO_MODE=true npm run dev
 *   3. Run seed again:  node scripts/seed-demo.mjs
 *   4. Then record:     node scripts/record-demo.mjs
 *
 * Or use the all-in-one:
 *   node scripts/record-demo.mjs --full
 *     (kills server, seeds, restarts, seeds again, records)
 *
 * Output:
 *   demo-videos/raw.webm              — Raw Playwright recording
 *   demo-videos/screenshots/*.png     — High-res screenshots at each shot
 */

import { chromium } from "playwright";
import { mkdirSync, existsSync } from "node:fs";
import { execSync, spawn } from "node:child_process";

const BASE = "http://localhost:8080";
const OUTPUT_DIR = "./demo-videos";
const SCREENSHOTS_DIR = "./demo-videos/screenshots";
const WIDTH = 1920;
const HEIGHT = 1080;
const FULL_MODE = process.argv.includes("--full");

mkdirSync(OUTPUT_DIR, { recursive: true });
mkdirSync(SCREENSHOTS_DIR, { recursive: true });

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/health`);
      const data = await res.json();
      if (data.status === "ok") return true;
    } catch {
      // not ready yet
    }
    await sleep(1000);
  }
  throw new Error(`Server not ready at ${url} after ${timeoutMs}ms`);
}

// ─── Full mode: seed + restart + record ─────────────────────────────────────

if (FULL_MODE) {
  console.log("\n🎬 Full recording pipeline\n");

  // Kill existing server
  console.log("  Killing existing server...");
  try {
    execSync("kill $(lsof -ti :8080) 2>/dev/null", { stdio: "ignore" });
    await sleep(2000);
  } catch {
    // no server to kill
  }

  // Run seed to create config + data on disk
  console.log("  Running seed (pass 1 — config + files)...");
  execSync("node scripts/seed-demo.mjs 2>/dev/null", { stdio: "inherit" });

  // Kill server again (seed may have communicated with it)
  try {
    execSync("kill $(lsof -ti :8080) 2>/dev/null", { stdio: "ignore" });
    await sleep(2000);
  } catch {
    // fine
  }

  // Restart server with demo config already on disk
  console.log("  Starting server with DEMO_MODE...");
  const server = spawn("npm", ["run", "dev"], {
    env: { ...process.env, DEMO_MODE: "true" },
    detached: true,
    stdio: "ignore",
  });
  server.unref();

  await waitForServer(BASE);
  console.log("  Server ready.\n");

  // Run seed again to create sessions/rooms/sprints via API
  console.log("  Running seed (pass 2 — API data)...");
  execSync("node scripts/seed-demo.mjs", { stdio: "inherit" });

  console.log("\n  Starting recording...\n");
}

// ─── Pre-flight checks ─────────────────────────────────────────────────────

try {
  await waitForServer(BASE, 5000);
} catch {
  console.error("❌ Server not running. Start with: DEMO_MODE=true npm run dev");
  console.error("   Or use --full flag: node scripts/record-demo.mjs --full");
  process.exit(1);
}

// Verify we have sessions
const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
if (health.activeSessions < 3) {
  console.error("❌ Only " + health.activeSessions + " sessions active. Run seed first:");
  console.error("   node scripts/seed-demo.mjs");
  process.exit(1);
}

console.log("🎬 Recording demo...\n");
console.log(`  Resolution: ${WIDTH}x${HEIGHT}`);
console.log(`  Sessions:   ${health.activeSessions} active`);
console.log(`  Output:     ${OUTPUT_DIR}/\n`);

// ─── Record ─────────────────────────────────────────────────────────────────

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  colorScheme: "dark",
  deviceScaleFactor: 2, // Retina for crisp screenshots
  recordVideo: { dir: OUTPUT_DIR, size: { width: WIDTH, height: HEIGHT } },
});
const page = await context.newPage();

const wait = (ms) => page.waitForTimeout(ms);

// Navigate and wait for full load
await page.goto(BASE, { waitUntil: "networkidle" });
await wait(2000); // Let terminals render their output

// ─── Shot 1: Sessions — THE HOOK (4s) ──────────────────────────────────────
console.log("  Shot 1: Sessions (5 terminals streaming)");
await page.keyboard.press("Meta+1");
await wait(500);

// Take hero screenshot
await page.screenshot({
  path: `${SCREENSHOTS_DIR}/hero-terminal-grid.png`,
  type: "png",
});
await wait(3500);

// ─── Shot 2: Sprints — Pipeline at 50% (4s) ────────────────────────────────
console.log("  Shot 2: Sprints (mixed gate states)");
await page.keyboard.press("Meta+3");
await wait(500);

// Click the active sprint if needed
const sprintItem = page.locator("text=Auth System Overhaul").first();
if (await sprintItem.isVisible({ timeout: 1000 }).catch(() => false)) {
  await sprintItem.click();
  await wait(500);
}

await page.screenshot({
  path: `${SCREENSHOTS_DIR}/hero-sprint-timeline.png`,
  type: "png",
});
await wait(3000);

// ─── Shot 3: Rooms — Agent conversation (4s) ────────────────────────────────
console.log("  Shot 3: Rooms (agent collaboration)");
await page.keyboard.press("Meta+2");
await wait(500);

// Click the room
const roomItem = page.locator("text=Sprint War Room").first();
if (await roomItem.isVisible({ timeout: 1000 }).catch(() => false)) {
  await roomItem.click();
  await wait(500);
}

// Scroll to see a good range of messages
await page.mouse.wheel(0, 200);
await wait(300);

await page.screenshot({
  path: `${SCREENSHOTS_DIR}/hero-room-chat.png`,
  type: "png",
});
await wait(3000);

// ─── Shot 4: Memory — Knowledge entries (3s) ────────────────────────────────
console.log("  Shot 4: Memory (10 entries, categories, tags)");
await page.keyboard.press("Meta+4");
await wait(500);

await page.screenshot({
  path: `${SCREENSHOTS_DIR}/hero-memory.png`,
  type: "png",
});
await wait(2500);

// ─── Final: Back to sessions for the close (1s) ────────────────────────────
console.log("  Final: Back to sessions");
await page.keyboard.press("Meta+1");
await wait(1500);

// ─── Done ───────────────────────────────────────────────────────────────────

console.log("\n  Finalizing video...");
const videoPath = await page.video()?.path();
await context.close();
await browser.close();

console.log(`\n🎬 Recording complete!\n`);
console.log(`  Raw video:    ${videoPath ?? OUTPUT_DIR + "/raw.webm"}`);
console.log(`  Screenshots:  ${SCREENSHOTS_DIR}/`);
console.log(`    - hero-terminal-grid.png`);
console.log(`    - hero-sprint-timeline.png`);
console.log(`    - hero-room-chat.png`);
console.log(`    - hero-memory.png`);
console.log(`\n  Next: run scripts/build-demo.sh to post-produce.\n`);
