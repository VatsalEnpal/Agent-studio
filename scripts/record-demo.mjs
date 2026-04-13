/**
 * Automated product demo recording using Playwright.
 *
 * Run:
 *   DEMO_MODE=true npm run dev &
 *   node scripts/record-demo.mjs
 *
 * Output: demo-videos/raw.webm
 *
 * Prerequisites:
 *   - Dev server running at localhost:8080 (ideally with DEMO_MODE=true)
 *   - Playwright installed: npx playwright install chromium
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:8080";
const OUTPUT_DIR = "./demo-videos";
const WIDTH = 1280;
const HEIGHT = 720;

mkdirSync(OUTPUT_DIR, { recursive: true });

async function run() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    colorScheme: "dark",
    recordVideo: { dir: OUTPUT_DIR, size: { width: WIDTH, height: HEIGHT } },
  });
  const page = await context.newPage();

  const wait = (ms) => page.waitForTimeout(ms);

  console.log("Recording demo...");

  // --------------------------------------------------
  // Shot 1: App opens — dark cockpit, empty state (3s)
  // --------------------------------------------------
  console.log("Shot 1: Empty state");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await wait(3000);

  // --------------------------------------------------
  // Shot 2: Start a session — terminal streams (3s)
  // --------------------------------------------------
  console.log("Shot 2: Start session");
  // Try clicking "Start a Quick Chat" or the new session button
  const quickChat = page.locator('button:has-text("Quick Chat")').first();
  const newSession = page.locator('button:has-text("New Session")').first();
  if (await quickChat.isVisible({ timeout: 1000 }).catch(() => false)) {
    await quickChat.click();
  } else if (await newSession.isVisible({ timeout: 1000 }).catch(() => false)) {
    await newSession.click();
    await wait(500);
    // Launch from dialog
    const launchBtn = page.locator('button:has-text("Launch")').first();
    if (await launchBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await launchBtn.click();
    }
  }
  await wait(3000);

  // --------------------------------------------------
  // Shot 3: Teams tab — sprint workflow steps (4s)
  // --------------------------------------------------
  console.log("Shot 3: Teams tab");
  // Navigate to Teams/Sprints via keyboard shortcut
  await page.keyboard.press("Meta+3");
  await wait(1000);
  // Click a sprint if one exists
  const sprintItem = page.locator("[data-sprint-id]").first();
  if (await sprintItem.isVisible({ timeout: 500 }).catch(() => false)) {
    await sprintItem.click();
    await wait(1000);
  }
  await wait(2000);

  // --------------------------------------------------
  // Shot 4: Room — agents chatting (3s)
  // --------------------------------------------------
  console.log("Shot 4: Rooms");
  await page.keyboard.press("Meta+2");
  await wait(1000);
  const roomItem = page.locator("[data-room-id]").first();
  if (await roomItem.isVisible({ timeout: 500 }).catch(() => false)) {
    await roomItem.click();
    await wait(1000);
  }
  await wait(1000);

  // --------------------------------------------------
  // Shot 5: Memory tab — knowledge entries (2s)
  // --------------------------------------------------
  console.log("Shot 5: Memory");
  await page.keyboard.press("Meta+4");
  await wait(2000);

  // --------------------------------------------------
  // Shot 6: Terminal grid — multiple sessions (3s)
  // --------------------------------------------------
  console.log("Shot 6: Terminal grid");
  await page.keyboard.press("Meta+1");
  await wait(3000);

  // --------------------------------------------------
  // Done — close and save
  // --------------------------------------------------
  console.log("Recording complete. Saving...");
  await wait(500);

  // Close context to finalize the video file
  const videoPath = await page.video()?.path();
  await context.close();
  await browser.close();

  console.log(`Video saved to: ${videoPath ?? OUTPUT_DIR}`);
  console.log("Run scripts/build-demo.sh to post-produce the final video.");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
