#!/usr/bin/env node
/**
 * Demo Video Recording — Captures Agent Studio with real Claude Code sessions.
 *
 * Shot list (~14s of content, end card added in post-production):
 *   Shot 1 (3s):  Backend session  — Claude reading code + generating auth (HERO)
 *   Shot 2 (2s):  Frontend session — Claude building dashboard component
 *   Shot 3 (2s):  Sprint timeline  — Auth System Overhaul, mixed gate states
 *   Shot 4 (2s):  Room chat        — Agent conversation with @mentions
 *   Shot 5 (2s):  QA session       — Claude writing tests
 *   Shot 6 (2s):  Memory tab       — 10 knowledge entries across categories
 *
 * The sidebar shows all 4 sessions running with live cost tracking.
 * Quick cuts between sessions create energy while keeping text readable.
 *
 * Usage:
 *   node scripts/record-demo.mjs --full   # Full pipeline: kill, start, seed, record
 *   node scripts/record-demo.mjs          # Record only (seed already done)
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
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

async function waitForServer(url, timeoutMs = 30000) {
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

// ─── Full mode: kill → start server → seed → wait → record ─────────────────

if (FULL_MODE) {
  console.log("\n🎬 Full recording pipeline\n");

  // Kill existing server
  console.log("  1. Killing existing server...");
  try {
    execSync("kill $(lsof -ti :8080) 2>/dev/null", { stdio: "ignore" });
    await sleep(2000);
  } catch {
    // no server to kill
  }

  // Start fresh server with DEMO_MODE for path sanitization
  console.log("  2. Starting server with DEMO_MODE...");
  const server = spawn("npm", ["run", "dev"], {
    env: { ...process.env, DEMO_MODE: "true" },
    detached: true,
    stdio: "ignore",
  });
  server.unref();

  await waitForServer(BASE);
  console.log("     Server ready.");

  // Run seed — creates projects, config, sessions (real Claude Code), sprint, room
  console.log("  3. Running seed...");
  execSync("node scripts/seed-demo.mjs", { stdio: "inherit" });

  // Wait for Claude sessions to be actively streaming.
  // Trust dialog auto-approved (~5s) → Claude initializes (~10s) → starts processing (~15s)
  // We want sessions mid-processing: thinking indicators, tool calls visible.
  console.log("  4. Waiting 35s for Claude sessions to be mid-processing...");
  await sleep(35000);

  console.log("  5. Starting recording...\n");
}

// ─── Pre-flight checks ─────────────────────────────────────────────────────

try {
  await waitForServer(BASE, 5000);
} catch {
  console.error("❌ Server not running. Use --full flag or start manually:");
  console.error("   DEMO_MODE=true npm run dev && node scripts/seed-demo.mjs");
  process.exit(1);
}

const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
if (health.activeSessions < 3) {
  console.error(`❌ Only ${health.activeSessions} sessions active. Run seed first.`);
  process.exit(1);
}

console.log("🎬 Recording demo...\n");
console.log(`  Resolution: ${WIDTH}x${HEIGHT}`);
console.log(`  Sessions:   ${health.activeSessions} active`);
console.log(`  Output:     ${OUTPUT_DIR}/\n`);

// Get session list so we can switch between them by clicking in the sidebar
const sessions = await fetch(`${BASE}/api/sessions`).then((r) => r.json());
const sessionNames = sessions.map((s) => s.name);
console.log(`  Session names: ${sessionNames.join(", ")}\n`);

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

// Navigate and wait for full load + terminal rendering
await page.goto(BASE, { waitUntil: "networkidle" });
await wait(2000);

// Ensure we're on sessions tab
await page.keyboard.press("Meta+1");
await wait(2000); // Wait for xterm.js to render

// ─── Shot 1: Backend Session — THE HERO SHOT (3s) ──────────────────────────
// Shows Claude reading Go files and generating JWT auth code.
// Sidebar shows all 4 sessions with live costs.
console.log("  Shot 1: Backend session (auth code generation — HERO)");

// Click on the backend session to focus it
const backendSession = page.locator("text=backend").first();
if (await backendSession.isVisible({ timeout: 1000 }).catch(() => false)) {
  await backendSession.click();
  await wait(500);
}

await page.screenshot({
  path: `${SCREENSHOTS_DIR}/hero-terminal-grid.png`,
  type: "png",
});
await wait(3000);

// ─── Shot 2: Frontend Session — Quick cut (2s) ─────────────────────────────
console.log("  Shot 2: Frontend session (dashboard component)");

const frontendSession = page.locator("text=frontend").first();
if (await frontendSession.isVisible({ timeout: 1000 }).catch(() => false)) {
  await frontendSession.click();
  await wait(500);
}

await page.screenshot({
  path: `${SCREENSHOTS_DIR}/hero-frontend-session.png`,
  type: "png",
});
await wait(1500);

// ─── Shot 3: Sprint Timeline — Mixed states (2s) ───────────────────────────
console.log("  Shot 3: Sprint timeline (Auth System Overhaul)");
await page.keyboard.press("Meta+3");
await wait(500);

const sprintItem = page.locator("text=Auth System Overhaul").first();
if (await sprintItem.isVisible({ timeout: 1000 }).catch(() => false)) {
  await sprintItem.click();
  await wait(500);
}

await page.screenshot({
  path: `${SCREENSHOTS_DIR}/hero-sprint-timeline.png`,
  type: "png",
});
await wait(1500);

// ─── Shot 4: Room Chat — Agent conversation (2s) ───────────────────────────
console.log("  Shot 4: Room chat (Sprint War Room)");
await page.keyboard.press("Meta+2");
await wait(500);

const roomItem = page.locator("text=Sprint War Room").first();
if (await roomItem.isVisible({ timeout: 1000 }).catch(() => false)) {
  await roomItem.click();
  await wait(500);
}

// Scroll to the status update message
await page.mouse.wheel(0, 400);
await wait(200);

await page.screenshot({
  path: `${SCREENSHOTS_DIR}/hero-room-chat.png`,
  type: "png",
});
await wait(1500);

// ─── Shot 5: QA Session — Writing tests (2s) ───────────────────────────────
console.log("  Shot 5: QA session (writing tests)");
await page.keyboard.press("Meta+1");
await wait(300);

const qaSession = page.locator("text=qa").first();
if (await qaSession.isVisible({ timeout: 1000 }).catch(() => false)) {
  await qaSession.click();
  await wait(500);
}

await page.screenshot({
  path: `${SCREENSHOTS_DIR}/hero-qa-session.png`,
  type: "png",
});
await wait(1500);

// ─── Shot 6: Memory — Knowledge entries (2s) ────────────────────────────────
console.log("  Shot 6: Memory (10 entries, categories)");
await page.keyboard.press("Meta+4");
await wait(500);

await page.screenshot({
  path: `${SCREENSHOTS_DIR}/hero-memory.png`,
  type: "png",
});
await wait(1500);

// ─── Final: Brief return to sessions ────────────────────────────────────────
console.log("  Final: Back to sessions");
await page.keyboard.press("Meta+1");
await wait(1000);

// ─── Done ───────────────────────────────────────────────────────────────────

console.log("\n  Finalizing video...");
const videoPath = await page.video()?.path();
await context.close();
await browser.close();

console.log(`\n🎬 Recording complete!\n`);
console.log(`  Raw video:    ${videoPath ?? OUTPUT_DIR + "/raw.webm"}`);
console.log(`  Screenshots:  ${SCREENSHOTS_DIR}/`);
console.log(`    - hero-terminal-grid.png     (backend session — hero)`);
console.log(`    - hero-frontend-session.png  (frontend session)`);
console.log(`    - hero-sprint-timeline.png   (sprint timeline)`);
console.log(`    - hero-room-chat.png         (room chat)`);
console.log(`    - hero-qa-session.png        (QA session)`);
console.log(`    - hero-memory.png            (memory entries)`);
console.log(`\n  Next: run scripts/build-demo.sh to post-produce.\n`);
