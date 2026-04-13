import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const SCREENSHOTS_DIR = '/Users/vatsalbhatt230813/Code/InPipeline/test-screenshots/phase4';
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function screenshot(page, name) {
  return page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${name}.png`), fullPage: false });
}

async function test() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto('http://localhost:8080', { waitUntil: 'networkidle', timeout: 15000 });
  await sleep(3000);

  // === Empty state ===
  console.log('=== Empty state (no sessions) ===');
  const emptyState = await page.evaluate(() => {
    return {
      hasEmptyMsg: document.body.innerText.includes('No sessions running'),
      hasCmdNHint: document.body.innerText.includes('Cmd+N'),
      hasCmdKHint: document.body.innerText.includes('Cmd+K'),
      hasStartButton: document.body.innerText.includes('Start your first session'),
    };
  });
  console.log(`  Empty state: ${JSON.stringify(emptyState)}`);
  await screenshot(page, 'final-empty-state');

  // === 1920px viewport ===
  console.log('\n=== 1920px viewport ===');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await sleep(500);
  await screenshot(page, 'final-1920px');
  const layout1920 = await page.evaluate(() => {
    const footer = document.querySelector('footer');
    const header = document.querySelector('header');
    return {
      footerWidth: footer?.offsetWidth,
      headerWidth: header?.offsetWidth,
      bodyWidth: document.body.offsetWidth,
    };
  });
  console.log(`  Layout at 1920: ${JSON.stringify(layout1920)}`);

  // === 1280px viewport ===
  await page.setViewportSize({ width: 1280, height: 800 });
  await sleep(500);
  await screenshot(page, 'final-1280px');

  // === Disabled tabs (Memory, Settings) ===
  console.log('\n=== Disabled tabs test ===');
  const memoryTab = await page.$('button:has-text("Memory"):not(:has-text("Memory browser"))');
  if (memoryTab) {
    const isDisabled = await memoryTab.isDisabled();
    console.log(`  Memory tab disabled attribute: ${isDisabled}`);

    const memoryClasses = await memoryTab.getAttribute('class');
    const hasDisabledStyle = memoryClasses && (memoryClasses.includes('cursor-not-allowed') || memoryClasses.includes('opacity-50'));
    console.log(`  Memory tab has disabled style: ${hasDisabledStyle}`);
  }

  const settingsTab = await page.$('button:has-text("Settings")');
  if (settingsTab) {
    const isDisabled = await settingsTab.isDisabled();
    console.log(`  Settings tab disabled attribute: ${isDisabled}`);
  }

  // === Toast bug verification: create and immediately kill ===
  console.log('\n=== Toast bug investigation ===');

  // Create session
  const startBtn = await page.$('button:has-text("Start your first session")');
  if (startBtn) {
    await startBtn.click();
    await sleep(500);
    const launchBtn = await page.$('button:has-text("Launch")');
    if (launchBtn) await launchBtn.click();
    await sleep(3000);
  }

  // Watch what happens when we kill - monitor the WebSocket state
  const preKillState = await page.evaluate(() => {
    // Get current sessions from DOM
    const panes = document.querySelectorAll('.xterm');
    return { paneCount: panes.length };
  });
  console.log(`  Pre-kill state: ${JSON.stringify(preKillState)}`);

  // Kill via API directly and watch toast
  const killResult = await page.evaluate(async () => {
    // Find session items in sidebar
    const killBtns = document.querySelectorAll('button[title="Kill session"]');
    if (killBtns.length === 0) return { error: 'no kill buttons' };

    killBtns[0].click();

    // Watch for toast for 5 seconds
    for (let i = 0; i < 50; i++) {
      await new Promise(r => setTimeout(r, 100));
      const container = document.querySelector('.fixed.top-3.right-3');
      if (container && container.children.length > 0) {
        return { found: true, text: container.innerText, at: i * 100 };
      }
    }
    return { found: false, note: 'No toast appeared in 5 seconds' };
  });
  console.log(`  Toast result: ${JSON.stringify(killResult)}`);
  await screenshot(page, 'final-toast-investigation');

  // Check post-kill state
  await sleep(1000);
  const postKillState = await page.evaluate(() => {
    const panes = document.querySelectorAll('.xterm');
    const footer = document.querySelector('footer');
    return {
      paneCount: panes.length,
      footerText: footer?.innerText?.substring(0, 100),
    };
  });
  console.log(`  Post-kill state: ${JSON.stringify(postKillState)}`);

  // === Verify: Session launcher Enter key ===
  console.log('\n=== Launcher Enter key ===');
  await page.keyboard.press('Meta+n');
  await sleep(500);
  const launcherOpen = await page.$('[role="dialog"]') !== null;
  if (launcherOpen) {
    // Press Enter to launch (should trigger the Launch button)
    // Actually, the Launch button says "Enter" but let's verify the keyboard shortcut
    await page.keyboard.press('Enter');
    await sleep(2000);
    const launcherStillOpen = await page.$('[role="dialog"]') !== null;
    console.log(`  Launcher after Enter: still open = ${launcherStillOpen}`);
    // Close if still open
    if (launcherStillOpen) {
      await page.keyboard.press('Escape');
    }
  }

  // === Bottom bar: comprehensive check ===
  console.log('\n=== Bottom bar comprehensive ===');
  await sleep(1000);
  const bottomBarDetail = await page.evaluate(() => {
    const footer = document.querySelector('footer');
    if (!footer) return null;

    // Get all kbd elements (shortcut keys)
    const kbds = Array.from(footer.querySelectorAll('kbd')).map(k => k.textContent);

    // Get status dots
    const dots = Array.from(footer.querySelectorAll('.rounded-full'));

    return {
      kbdKeys: kbds,
      dotCount: dots.length,
      fullText: footer.innerText,
      height: footer.offsetHeight,
    };
  });
  console.log(`  Bottom bar: ${JSON.stringify(bottomBarDetail)}`);

  await browser.close();
  console.log('\nDone.');
}

test().catch(e => {
  console.error('Test runner crashed:', e);
  process.exit(1);
});
