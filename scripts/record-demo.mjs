/**
 * Automated product demo recording using Playwright.
 * Run: node scripts/record-demo.mjs
 * Output: ./recordings/demo.webm
 *
 * Make sure the dev server is running at localhost:8080 first.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:8080';

async function run() {
  const browser = await chromium.launch({ headless: false }); // visible browser for recording
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
    recordVideo: { dir: './recordings', size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();

  const wait = (ms) => page.waitForTimeout(ms);
  const slow = 800; // pause between actions so viewer can follow

  console.log('🎬 Recording demo...');

  // --- Open app ---
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await wait(2000);

  // --- Sessions page ---
  console.log('📍 Sessions');
  await wait(slow);

  // Open session launcher
  const newSessionBtn = page.locator('button:has-text("New Session")').first();
  if (await newSessionBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await newSessionBtn.click();
    await wait(1500);

    // Show quick start options
    await wait(slow);

    // Show model selection
    const opusBtn = page.locator('button:has-text("opus")').first();
    if (await opusBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await opusBtn.click();
      await wait(500);
    }

    // Close launcher
    await page.keyboard.press('Escape');
    await wait(slow);
  }

  // --- History tab ---
  console.log('📍 History');
  const historyTab = page.locator('button:has-text("History")').first();
  if (await historyTab.isVisible({ timeout: 500 }).catch(() => false)) {
    await historyTab.click();
    await wait(slow);
  }

  // --- Servers tab ---
  console.log('📍 Dev Servers');
  const serversTab = page.locator('button:has-text("Servers")').first();
  if (await serversTab.isVisible({ timeout: 500 }).catch(() => false)) {
    await serversTab.click();
    await wait(1200);
  }

  // Back to sessions
  const sessionsTab = page.locator('button:has-text("Sessions")').first();
  if (await sessionsTab.isVisible({ timeout: 500 }).catch(() => false)) {
    await sessionsTab.click();
    await wait(slow);
  }

  // --- Rooms ---
  console.log('📍 Rooms');
  await page.keyboard.press('Meta+2');
  await wait(1200);

  // Click a room if exists
  const roomItems = page.locator('[data-room-id]');
  if (await roomItems.count() > 0) {
    await roomItems.first().click();
    await wait(1200);
  }

  // --- Sprints ---
  console.log('📍 Sprints');
  await page.keyboard.press('Meta+3');
  await wait(1200);

  // Click a sprint if exists
  const sprintItems = page.locator('[data-sprint-id]');
  if (await sprintItems.count() > 0) {
    await sprintItems.first().click();
    await wait(1500);
  }

  // --- Memory ---
  console.log('📍 Memory');
  await page.keyboard.press('Meta+4');
  await wait(1200);

  // Click a memory entry if exists
  const memoryItems = page.locator('[data-memory-id]');
  if (await memoryItems.count() > 0) {
    await memoryItems.first().click();
    await wait(1200);
  }

  // --- Settings ---
  console.log('📍 Settings');
  const settingsNav = page.locator('[title*="Settings"]').first();
  if (await settingsNav.isVisible({ timeout: 500 }).catch(() => false)) {
    await settingsNav.click();
    await wait(slow);

    // Click through settings tabs
    for (const tab of ['Agents', 'Dev Servers', 'Shortcuts']) {
      const tabBtn = page.locator(`text="${tab}"`).first();
      if (await tabBtn.isVisible({ timeout: 300 }).catch(() => false)) {
        await tabBtn.click();
        await wait(600);
      }
    }
  }

  // --- Command Palette ---
  console.log('📍 Command Palette');
  await page.keyboard.press('Meta+k');
  await wait(800);
  await page.keyboard.type('sprint', { delay: 80 });
  await wait(800);
  await page.keyboard.press('Escape');
  await wait(500);

  // --- Back to sessions ---
  await page.keyboard.press('Meta+1');
  await wait(1000);

  // --- End ---
  console.log('🎬 Demo complete. Closing...');
  await wait(1000);
  await context.close();
  await browser.close();

  console.log('✅ Video saved to ./recordings/');
}

run().catch(e => { console.error(e); process.exit(1); });
